// Guarded macOS handoffs. This helper never records keys or captures the screen.
import AppKit
import ApplicationServices

struct ControlError: Error { let code: String }
func reject(_ code: String) throws -> Never { throw ControlError(code: code) }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func string(_ element: AXUIElement, _ name: String) -> String {
    return attribute(element, name) as? String ?? ""
}
func element(_ parent: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(parent, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

let ownEventTag: Int64 = 0x5441475445414D
let inputTypes: [CGEventType] = [.keyDown, .keyUp, .flagsChanged, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel]
func foreignInput(_ type: CGEventType, _ tag: Int64) -> Bool {
    return inputTypes.contains(type) && tag != ownEventTag
}
func sameTarget(_ expected: [String: Any], _ observed: [String: Any]) -> Bool {
    return ["pid", "bundle", "title", "window_id", "mode"].allSatisfy { key in
        guard let value = expected[key], let actual = observed[key] else { return false }
        return String(describing: value) == String(describing: actual)
    }
}
func composerLabel(_ label: String, _ mode: String) -> Bool {
    let labels = mode == "chat" ? ["message chatgpt", "message", "work with chatgpt"] : mode == "codex" ? ["work with codex"] : []
    return labels.contains(label.lowercased())
}
struct PlaceholderNode {
    let role: String
    let classes: [String]
    let value: String
    let count: Int?
    let children: [PlaceholderNode]
}
func suggestionOnly(_ raw: String, classes: [String], children: [PlaceholderNode]) -> Bool {
    guard classes.contains("ProseMirror"), children.count == 1 else { return false }
    let outer = children[0]
    guard outer.role == "AXGroup", outer.classes == ["placeholder"], outer.value.isEmpty,
          outer.count == 0, outer.children.count == 1 else { return false }
    let inner = outer.children[0]
    guard inner.role == "AXGroup", inner.classes.isEmpty, inner.value.isEmpty,
          inner.count == 0, inner.children.count == 1 else { return false }
    let text = inner.children[0]
    guard text.role == "AXStaticText", text.classes.isEmpty, !text.value.isEmpty,
          text.count == 0, text.children.isEmpty else { return false }
    return draftMatches(raw, text.value)
}
func emptyComposer(_ raw: String, placeholder: String?, count: Int?) -> Bool {
    if draftMatches(raw, nil) { return true }
    guard count == 0, let placeholder = placeholder, !placeholder.isEmpty else { return false }
    return draftMatches(raw, placeholder)
}
func draftMatches(_ raw: String, _ expected: String?) -> Bool {
    let content = raw.replacingOccurrences(of: "\r\n", with: "\n")
    guard let expected = expected else { return content.isEmpty || content == "\n" }
    let payload = expected.replacingOccurrences(of: "\r\n", with: "\n")
    return content == payload || content == payload + "\n"
}
struct SetupSelector: Decodable {
    let role: String
    let label: String
    let selected: Bool?
    let enabled: Bool?
    let focused: Bool?
    var valid: Bool { role.hasPrefix("AX") && !label.isEmpty && label.count <= 256 }
}
struct SetupStep: Decodable {
    let control: SetupSelector
    let after: SetupSelector
    let window_title_after: String?
    var valid: Bool {
        return control.valid && after.valid && setupAllowed(control.role, control.label) &&
            (window_title_after == nil || !window_title_after!.isEmpty && window_title_after!.count <= 256)
    }
}
func setupAllowed(_ role: String, _ label: String) -> Bool {
    let allowed: [String: [String]] = [
        "AXButton": ["New chat", "Don't work in a project", "Show sidebar", "Hide sidebar"],
        "AXCheckBox": ["Chat"],
        "AXPopUpButton": ["Switch mode, current mode: ChatGPT", "Switch mode, current mode: Codex", "Choose project", "Work in", "Choose where to run this chat"],
        "AXMenuItem": ["ChatGPT Create, learn, and explore", "Codex Build, debug, and ship"],
        "AXTextArea": ["Message ChatGPT", "Message", "Work with ChatGPT", "Work with Codex", "Do anything"]
    ]
    return allowed[role]?.contains(label) == true
}
func guardedSetupAction<T>(check: () throws -> Void, perform: () throws -> Void, confirm: () throws -> T) rethrows -> T {
    try check()
    try perform()
    try check()
    return try confirm()
}
func setupFrame(_ node: AXUIElement) -> CGRect? {
    guard let position = attribute(node, kAXPositionAttribute), CFGetTypeID(position) == AXValueGetTypeID(),
          let dimensions = attribute(node, kAXSizeAttribute), CFGetTypeID(dimensions) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
          AXValueGetValue(dimensions as! AXValue, .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}
func setupVisible(_ frame: CGRect, _ window: CGRect) -> Bool {
    return frame.width >= 2 && frame.height >= 2 && window.contains(CGPoint(x: frame.midX, y: frame.midY))
}

final class Handoff {
    var interrupted: String?
    var tap: CFMachPort?
    var panel: NSPanel?
    var label: NSTextField?
    var observers: [NSObjectProtocol] = []
    var pasteSent = false
    var enterSent = false
    var clickAttempted = false
    var clickPerformed = false
    var interruptionSource: String?
    var applicationChangeObserved = false
    var draftEvidence: [String: Any] = [:]
    var watchedPID: pid_t?
    let request: [String: Any]
    init(_ request: [String: Any]) { self.request = request }
    func observeInput(_ type: CGEventType, _ tag: Int64) {
        if interrupted != nil { return }
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            interrupted = "MONITOR_UNAVAILABLE"
        } else if foreignInput(type, tag) {
            interrupted = "USER_INTERRUPTED"
            interruptionSource = [.leftMouseDown, .rightMouseDown, .otherMouseDown].contains(type) ? "mouse_click" : "keyboard_or_scroll"
        }
    }
    func observeActivation(_ pid: pid_t) {
        if let expected = watchedPID, pid != expected { applicationChangeObserved = true }
        if let expected = watchedPID, pid != expected, interrupted == nil {
            interrupted = "USER_INTERRUPTED"
            interruptionSource = "application_change"
        }
    }

    func pump(_ seconds: Double) {
        let until = Date().addingTimeInterval(seconds)
        while Date() < until {
            RunLoop.current.run(until: min(until, Date().addingTimeInterval(0.01)))
            if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier { observeActivation(pid) }
            if interrupted != nil { break }
        }
    }
    func check() throws {
        pump(0.01)
        if let file = request["pause_file"] as? String, FileManager.default.fileExists(atPath: file) { try reject("MANUAL_PAUSE") }
        if let reason = interrupted { try reject(reason) }
        if let tap = tap, !CGEvent.tapIsEnabled(tap: tap) { try reject("MONITOR_UNAVAILABLE") }
        for key in 0..<128 where CGEventSource.keyState(.hidSystemState, key: CGKeyCode(key)) { try reject("USER_INPUT_HELD") }
        for button in [CGMouseButton.left, .right, .center] where CGEventSource.buttonState(.hidSystemState, button: button) { try reject("USER_INPUT_HELD") }
    }
    func banner(_ text: String, paused: Bool = false) {
        if panel == nil {
            let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
            let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 800)
            let window = NSPanel(contentRect: NSRect(x: frame.midX - 280, y: frame.maxY - 95, width: 560, height: 80),
                                 styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            window.level = .statusBar
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.hidesOnDeactivate = false
            window.ignoresMouseEvents = true
            let field = NSTextField(wrappingLabelWithString: text)
            field.frame = NSRect(x: 18, y: 12, width: 524, height: 56)
            field.font = NSFont.boldSystemFont(ofSize: 15)
            field.textColor = .white
            window.contentView?.addSubview(field)
            panel = window
            label = field
        }
        panel?.backgroundColor = paused ? .systemRed : .systemBlue
        label?.stringValue = text
        panel?.orderFrontRegardless()
        panel?.displayIfNeeded()
    }
    func monitor() throws {
        let mask = inputTypes.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
        let callback: CGEventTapCallBack = { _, type, event, pointer in
            let owner = Unmanaged<Handoff>.fromOpaque(pointer!).takeUnretainedValue()
            owner.observeInput(type, event.getIntegerValueField(.eventSourceUserData))
            return Unmanaged.passUnretained(event)
        }
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                               eventsOfInterest: mask, callback: callback,
                               userInfo: Unmanaged.passUnretained(self).toOpaque())
        guard let eventTap = tap else { try reject("MONITOR_UNAVAILABLE") }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: eventTap, enable: true)
        let center = NSWorkspace.shared.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let self = self,
                  let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
            self.observeActivation(app.processIdentifier)
        })
        for name in [NSWorkspace.activeSpaceDidChangeNotification, NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.interrupted = "USER_INTERRUPTED"
            })
        }
    }
    func snapshot(_ expected: [String: Any]? = nil) throws -> ([String: Any], AXUIElement, AXUIElement) {
        guard AXIsProcessTrusted() else { try reject("ACCESSIBILITY_REQUIRED") }
        let apps = NSWorkspace.shared.runningApplications.filter { $0.localizedName == "ChatGPT" }
        guard apps.count == 1, let app = apps.first, let bundle = app.bundleIdentifier,
              ["com.openai.chat", "com.openai.codex"].contains(bundle) else { try reject("TARGET_AMBIGUOUS") }
        let process = AXUIElementCreateApplication(app.processIdentifier)
        let windows = attribute(process, kAXWindowsAttribute) as? [AXUIElement] ?? []
        let selected = expected == nil ? element(process, kAXFocusedWindowAttribute) :
            windows.first(where: { string($0, kAXTitleAttribute) == expected?["title"] as? String })
        guard let window = selected else { try reject("TARGET_UNVERIFIED") }
        let title = string(window, kAXTitleAttribute)
        let setup = ["setup-bind", "setup-resume", "setup"].contains(request["action"] as? String ?? "")
        guard !title.isEmpty, setup || !["ChatGPT", "Chat", "Codex", "New chat", "New tab"].contains(title) else { try reject("CONVERSATION_UNNAMED") }
        guard windows.filter({ string($0, kAXTitleAttribute) == title }).count == 1 else { try reject("TARGET_AMBIGUOUS") }
        let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let matches = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(app.processIdentifier) &&
                                    ($0[kCGWindowName as String] as? String) == title &&
                                    ($0[kCGWindowLayer as String] as? Int) == 0 }
        guard matches.count == 1, let windowID = matches.first?[kCGWindowNumber as String] as? Int else { try reject("WINDOW_ID_UNVERIFIED") }
        guard matches.first?[kCGWindowIsOnscreen as String] as? Bool == true else { try reject("WINDOW_UNVERIFIED") }
        let target: [String: Any] = ["pid": Int(app.processIdentifier), "bundle": bundle, "title": title,
                                     "window_id": windowID, "mode": request["mode"] as? String ?? ""]
        if let expected = expected {
            guard sameTarget(expected, target) else { try reject("TARGET_CHANGED") }
        }
        return (target, process, window)
    }
    func composer(_ window: AXUIElement) throws -> AXUIElement {
        var queue: [AXUIElement] = [window]
        var fields: [AXUIElement] = []
        var modeSeen = false
        var count = 0
        while !queue.isEmpty && count < 6000 {
            let item = queue.removeLast()
            count += 1
            let role = string(item, kAXRoleAttribute)
            let description = string(item, kAXDescriptionAttribute)
            let title = string(item, kAXTitleAttribute)
            for name in [description.lowercased(), title.lowercased()] where name.contains("current mode:") {
                let value = name.components(separatedBy: "current mode:").last?.trimmingCharacters(in: .whitespaces) ?? ""
                let wanted = request["mode"] as? String ?? ""
                if (wanted == "chat" && ["chatgpt", "chat"].contains(value)) || (wanted == "codex" && value == "codex") { modeSeen = true }
            }
            if role == kAXTextAreaRole && [description, title].contains(where: {
                composerLabel($0, request["mode"] as? String ?? "")
            }) {
                fields.append(item)
            }
            queue.append(contentsOf: attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? [])
        }
        guard queue.isEmpty, modeSeen else { try reject("MODE_UNVERIFIED") }
        guard fields.count == 1 else { try reject("COMPOSER_UNVERIFIED") }
        return fields[0]
    }
    func placeholderNode(_ node: AXUIElement, depth: Int = 0) -> PlaceholderNode? {
        guard depth <= 3,
              let classes = attribute(node, "AXDOMClassList") as? [String],
              let value = attribute(node, kAXValueAttribute) as? String,
              let count = attribute(node, kAXNumberOfCharactersAttribute) as? NSNumber,
              let children = attribute(node, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
        let nested = children.compactMap { placeholderNode($0, depth: depth + 1) }
        guard nested.count == children.count else { return nil }
        return PlaceholderNode(role: string(node, kAXRoleAttribute), classes: classes,
                               value: value, count: count.intValue, children: nested)
    }
    func emptyField(_ field: AXUIElement, _ content: String) -> Bool {
        let placeholder = attribute(field, kAXPlaceholderValueAttribute) as? String
        let count = (attribute(field, kAXNumberOfCharactersAttribute) as? NSNumber)?.intValue
        draftEvidence = ["length": content.utf8.count,
                         "character_count": count ?? -1,
                         "placeholder_available": placeholder != nil,
                         "equals_placeholder": placeholder.map { draftMatches(content, $0) } ?? false]
        if emptyComposer(content, placeholder: placeholder, count: count) { return true }
        guard let classes = attribute(field, "AXDOMClassList") as? [String],
              let children = attribute(field, kAXChildrenAttribute) as? [AXUIElement] else { return false }
        let nodes = children.compactMap { placeholderNode($0) }
        guard nodes.count == children.count else { return false }
        let suggestion = suggestionOnly(content, classes: classes, children: nodes)
        draftEvidence["suggestion_only"] = suggestion
        return suggestion
    }
    func verify(_ target: [String: Any], _ payload: String? = nil, requireFocus: Bool = true) throws -> AXUIElement {
        try check()
        let (_, process, window) = try snapshot(target)
        guard Int(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1) == target["pid"] as? Int else { try reject("USER_INTERRUPTED") }
        guard let focusedWindow = element(process, kAXFocusedWindowAttribute), CFEqual(focusedWindow, window) else { try reject("TARGET_CHANGED") }
        let field = try composer(window)
        guard (attribute(field, kAXEnabledAttribute) as? Bool) == true else { try reject("COMPOSER_UNVERIFIED") }
        if requireFocus {
            guard let focused = element(process, kAXFocusedUIElementAttribute), CFEqual(focused, field) else { try reject("COMPOSER_UNVERIFIED") }
        }
        let content = string(field, kAXValueAttribute).replacingOccurrences(of: "\r\n", with: "\n")
        guard payload == nil ? emptyField(field, content) : draftMatches(content, payload) else {
            try reject(payload == nil ? "COMPOSER_NOT_EMPTY" : "DRAFT_CHANGED")
        }
        try check()
        return field
    }
    func chord(_ key: CGKeyCode, _ flags: CGEventFlags = []) throws {
        try check()
        guard let source = CGEventSource(stateID: .privateState),
              let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false) else { try reject("INPUT_UNAVAILABLE") }
        for event in [down, up] {
            event.flags = flags
            event.setIntegerValueField(.eventSourceUserData, value: ownEventTag)
            event.post(tap: .cgSessionEventTap)
        }
    }
    func setupNodes(_ window: AXUIElement) throws -> [AXUIElement] {
        var queue = [window]
        var nodes: [AXUIElement] = []
        while let item = queue.popLast() {
            guard nodes.count < 6000, !string(item, kAXRoleAttribute).isEmpty else { try reject("SETUP_UNVERIFIED") }
            nodes.append(item)
            var children: CFTypeRef?
            let status = AXUIElementCopyAttributeValue(item, kAXChildrenAttribute as CFString, &children)
            guard [.success, .attributeUnsupported, .noValue].contains(status) else { try reject("SETUP_UNVERIFIED") }
            queue.append(contentsOf: children as? [AXUIElement] ?? [])
        }
        return nodes
    }
    func setupMatches(_ node: AXUIElement, _ selector: SetupSelector, _ window: AXUIElement) -> Bool {
        guard string(node, kAXRoleAttribute) == selector.role,
              [string(node, kAXTitleAttribute), string(node, kAXDescriptionAttribute)].contains(selector.label),
              let frame = setupFrame(node), let bounds = setupFrame(window), setupVisible(frame, bounds) else { return false }
        if let selected = selector.selected {
            guard let value = attribute(node, kAXValueAttribute) as? NSNumber,
                  [0, 1].contains(value.intValue), (value.intValue == 1) == selected else { return false }
        }
        if let enabled = selector.enabled, (attribute(node, kAXEnabledAttribute) as? Bool) != enabled { return false }
        if let focused = selector.focused, (attribute(node, kAXFocusedAttribute) as? Bool) != focused { return false }
        return true
    }
    func preserveSetupDrafts(_ nodes: [AXUIElement]) throws {
        for node in nodes where string(node, kAXRoleAttribute) == kAXTextAreaRole {
            let labels = [string(node, kAXTitleAttribute), string(node, kAXDescriptionAttribute)]
            guard labels.contains(where: { setupAllowed("AXTextArea", $0) }),
                  let content = attribute(node, kAXValueAttribute) as? String else { try reject("SETUP_DRAFT_UNVERIFIED") }
            guard emptyField(node, content) else { try reject("COMPOSER_NOT_EMPTY") }
        }
    }
    func setupScreen(_ expected: [String: Any]? = nil) throws -> ([String: Any], AXUIElement, [AXUIElement]) {
        try check()
        let (target, process, window) = try snapshot(expected)
        guard Int(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1) == target["pid"] as? Int,
              let focused = element(process, kAXFocusedWindowAttribute), CFEqual(focused, window),
              (attribute(window, kAXMinimizedAttribute) as? Bool) == false else { try reject("TARGET_CHANGED") }
        let nodes = try setupNodes(window)
        try preserveSetupDrafts(nodes)
        try check()
        return (target, window, nodes)
    }
    func setupRun(_ action: String) throws -> [String: Any] {
        let expected = request["target"] as? [String: Any]
        if action != "setup-bind" && expected == nil { try reject("TARGET_UNVERIFIED") }
        let (target, window, nodes) = try setupScreen(action == "setup-bind" ? nil : expected)
        if action != "setup" { return ["ok": true, "verified": true, "target": target] }
        guard let input = request["setup"],
              let step = try? JSONDecoder().decode(SetupStep.self, from: JSONSerialization.data(withJSONObject: input)),
              step.valid else { try reject("SETUP_INVALID") }
        let finalTitle = step.window_title_after ?? target["title"] as! String
        guard finalTitle != target["title"] as? String || !nodes.contains(where: { setupMatches($0, step.after, window) }) else { try reject("SETUP_NO_CHANGE_REQUIRED") }
        guard nodes.filter({ setupMatches($0, step.control, window) }).count == 1 else { try reject("SETUP_AMBIGUOUS") }
        watchedPID = pid_t(target["pid"] as! Int)
        try monitor()
        banner("TagTeamGPT SETUP CONTROL: \(target["title"]!).\nOne setup action in 15 seconds. Click, type, or switch apps to pause.")
        pump(15)
        let (_, freshWindow, fresh) = try setupScreen(target)
        let controls = fresh.filter { setupMatches($0, step.control, freshWindow) }
        guard controls.count == 1, let control = controls.first,
              (attribute(control, kAXEnabledAttribute) as? Bool) == true else { try reject("SETUP_AMBIGUOUS") }
        return try guardedSetupAction(check: { try self.check() }, perform: {
            clickAttempted = true
            let status = step.control.role == "AXTextArea"
                ? AXUIElementSetAttributeValue(control, kAXFocusedAttribute as CFString, kCFBooleanTrue)
                : AXUIElementPerformAction(control, kAXPressAction as CFString)
            guard status == .success else { try reject("SETUP_ACTION_FAILED") }
            clickPerformed = true
        }, confirm: {
            let deadline = Date().addingTimeInterval(1)
            repeat {
                pump(0.05)
                let (observed, afterWindow, after) = try setupScreen()
                guard ["pid", "bundle", "window_id", "mode"].allSatisfy({ String(describing: observed[$0]!) == String(describing: target[$0]!) }),
                      [target["title"] as! String, finalTitle].contains(observed["title"] as! String) else { try reject("TARGET_CHANGED") }
                let matches = after.filter { setupMatches($0, step.after, afterWindow) }
                guard matches.count <= 1 else { try reject("SETUP_AMBIGUOUS") }
                if observed["title"] as? String == finalTitle && matches.count == 1 {
                    try check()
                    return ["ok": true, "verified": true, "target": observed, "click_performed": true,
                            "click_attempted": true, "postcondition_verified": true, "keys_fired": false,
                            "paste_sent": false, "enter_sent": false]
                }
            } while Date() < deadline
            try reject("SETUP_POSTCONDITION_FAILED")
        })
    }
    func run() throws -> [String: Any] {
        let action = request["action"] as? String ?? ""
        if ["setup-bind", "setup-resume", "setup"].contains(action) { return try setupRun(action) }
        if action == "test" {
            watchedPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
            try monitor()
            banner("TagTeamGPT INTERRUPTION TEST. No keys will be sent.\nClick anywhere or switch apps within 12 seconds to pause.")
            pump(12)
            try check()
            try reject("TEST_NO_INTERRUPTION")
        }
        let expected = request["target"] as? [String: Any]
        let (target, process, window) = try snapshot(action == "bind" ? nil : expected)
        if action == "bind" || action == "resume" {
            _ = try verify(target)
            return ["ok": true, "verified": true, "target": target]
        }
        guard action == "send", let payload = request["text"] as? String else { try reject("INVALID_ACTION") }
        watchedPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
        try monitor()
        banner("TagTeamGPT will control \(target["title"]!) in 2 seconds.\nClick, type, scroll, or switch apps to pause.")
        pump(2)
        try check()
        let app = NSRunningApplication(processIdentifier: pid_t(target["pid"] as! Int))
        watchedPID = app?.processIdentifier
        guard app?.activate(options: []) == true else { try reject("FOCUS_UNVERIFIED") }
        guard AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success else { try reject("WINDOW_UNVERIFIED") }
        pump(0.25)
        let field = try verify(target, requireFocus: false)
        guard AXUIElementSetAttributeValue(process, kAXFocusedWindowAttribute as CFString, window) == .success,
              AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, kCFBooleanTrue) == .success else { try reject("COMPOSER_UNVERIFIED") }
        let clipboard = NSPasteboard.general
        let previous = clipboard.pasteboardItems?.map { item -> [NSPasteboard.PasteboardType: Data] in
            var contents: [NSPasteboard.PasteboardType: Data] = [:]
            for type in item.types { contents[type] = item.data(forType: type) }
            return contents
        } ?? []
        clipboard.clearContents()
        guard clipboard.setString(payload, forType: .string) else { try reject("CLIPBOARD_UNVERIFIED") }
        let revision = clipboard.changeCount
        defer {
            if clipboard.changeCount == revision {
                clipboard.clearContents()
                let items = previous.map { contents -> NSPasteboardItem in
                    let item = NSPasteboardItem()
                    for (type, data) in contents { item.setData(data, forType: type) }
                    return item
                }
                clipboard.writeObjects(items)
            }
        }
        banner("TagTeamGPT controls \(target["title"]!).\nClick, type, scroll, or switch apps to pause.")
        _ = try verify(target)
        guard clipboard.string(forType: .string) == payload else { try reject("CLIPBOARD_UNVERIFIED") }
        try chord(9, .maskCommand)
        pasteSent = true
        pump(0.3)
        let pastedField = try verify(target, payload)
        guard let focused = element(process, kAXFocusedUIElementAttribute), CFEqual(focused, pastedField) else { try reject("COMPOSER_UNVERIFIED") }
        try chord(36)
        enterSent = true
        pump(0.1)
        try check()
        return ["ok": true, "verified": true, "keys_fired": true, "paste_sent": true, "enter_sent": true, "target": target]
    }
    func cleanup() {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
        panel?.orderOut(nil)
    }
}

if CommandLine.arguments.contains("--self-test") {
    precondition(foreignInput(.leftMouseDown, 0))
    precondition(foreignInput(.keyDown, 0))
    precondition(foreignInput(.flagsChanged, 0))
    precondition(!foreignInput(.keyDown, ownEventTag))
    precondition(!foreignInput(.mouseMoved, 0))
    let target: [String: Any] = ["pid": 1, "bundle": "test", "title": "PLANNER", "window_id": 2, "mode": "chat"]
    precondition(sameTarget(target, target))
    for key in ["pid", "bundle", "title", "window_id", "mode"] {
        var changed = target
        changed[key] = "different"
        precondition(!sameTarget(target, changed))
        changed.removeValue(forKey: key)
        precondition(!sameTarget(target, changed))
    }
    precondition(composerLabel("Message ChatGPT", "chat"))
    precondition(composerLabel("Work with ChatGPT", "chat"))
    precondition(!composerLabel("Work with ChatGPT", "codex"))
    precondition(!composerLabel("Work with Codex", "chat"))
    precondition(composerLabel("Work with Codex", "codex"))
    precondition(!composerLabel("Do anything", "chat"))
    precondition(!composerLabel("Message ChatGPT", "work"))
    let hintText = PlaceholderNode(role: "AXStaticText", classes: [], value: "Work with Codex", count: 0, children: [])
    let hintGroup = PlaceholderNode(role: "AXGroup", classes: [], value: "", count: 0, children: [hintText])
    let hint = PlaceholderNode(role: "AXGroup", classes: ["placeholder"], value: "", count: 0, children: [hintGroup])
    precondition(suggestionOnly("Work with Codex\n", classes: ["ProseMirror"], children: [hint]))
    precondition(!suggestionOnly("typed draft\n", classes: ["ProseMirror"], children: [hint]))
    precondition(!suggestionOnly("Work with Codex\n", classes: ["ProseMirror"], children: [hint, hintText]))
    precondition(!suggestionOnly("Work with Codex\n", classes: [], children: [hint]))
    let typed = PlaceholderNode(role: "AXGroup", classes: [], value: "", count: 0, children: [hintGroup])
    precondition(!suggestionOnly("Work with Codex\n", classes: ["ProseMirror"], children: [typed]))
    let unknown = PlaceholderNode(role: "AXGroup", classes: ["placeholder"], value: "", count: nil, children: [hintGroup])
    precondition(!suggestionOnly("Work with Codex\n", classes: ["ProseMirror"], children: [unknown]))
    precondition(emptyComposer("Work with ChatGPT\n", placeholder: "Work with ChatGPT", count: 0))
    precondition(!emptyComposer("Work with ChatGPT\n", placeholder: "Work with ChatGPT", count: 18))
    precondition(!emptyComposer("Work with ChatGPT\n", placeholder: nil, count: 18))
    precondition(!emptyComposer("Work with ChatGPT\n", placeholder: "Work with ChatGPT", count: nil))
    precondition(!emptyComposer("Work with ChatGPT\n", placeholder: "Work with ChatGPT", count: -1))
    precondition(!emptyComposer("real draft", placeholder: "Work with ChatGPT", count: 0))
    precondition(!emptyComposer("Work with ChatGPT", placeholder: nil, count: 0))
    precondition(draftMatches("", nil))
    precondition(draftMatches("\n", nil))
    precondition(!draftMatches(" ", nil))
    precondition(!draftMatches("\n\n", nil))
    precondition(!draftMatches("existing draft", nil))
    precondition(draftMatches("[C2C]\nmarker\n", "[C2C]\nmarker"))
    precondition(!draftMatches("extra [C2C]\nmarker", "[C2C]\nmarker"))
    let decoded = try! JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: target)) as! [String: Any]
    precondition(sameTarget(target, decoded))
    for type in inputTypes {
        let handoff = Handoff([:])
        handoff.observeInput(type, ownEventTag)
        precondition(handoff.interrupted == nil)
        handoff.observeInput(type, 0)
        precondition(handoff.interrupted == "USER_INTERRUPTED")
        handoff.observeInput(.keyDown, ownEventTag)
        precondition(handoff.interrupted == "USER_INTERRUPTED")
        precondition(!handoff.enterSent)
    }
    let switched = Handoff([:])
    switched.watchedPID = 1
    switched.observeActivation(1)
    precondition(switched.interrupted == nil)
    switched.observeActivation(2)
    precondition(switched.interrupted == "USER_INTERRUPTED")
    let unavailable = Handoff([:])
    unavailable.observeInput(.tapDisabledByTimeout, ownEventTag)
    precondition(unavailable.interrupted == "MONITOR_UNAVAILABLE")
    precondition(setupAllowed("AXCheckBox", "Chat"))
    precondition(setupAllowed("AXButton", "Don't work in a project"))
    precondition(!setupAllowed("AXButton", "Send"))
    precondition(!setupAllowed("AXButton", "Delete app"))
    precondition(!setupAllowed("AXCheckBox", "Work"))
    let bounds = CGRect(x: 0, y: 0, width: 800, height: 600)
    precondition(setupVisible(CGRect(x: 20, y: 20, width: 100, height: 40), bounds))
    precondition(!setupVisible(CGRect(x: 20, y: 20, width: 100, height: 1), bounds))
    precondition(!setupVisible(CGRect(x: 900, y: 20, width: 100, height: 40), bounds))
    var order: [String] = []
    let result = guardedSetupAction(check: { order.append("check") }, perform: { order.append("click") }, confirm: { order.append("confirm"); return true })
    precondition(result && order == ["check", "click", "check", "confirm"])
    for before in [true, false] {
        var paused = before
        var clicks = 0
        var confirmed = false
        do {
            _ = try guardedSetupAction(check: { if paused { try reject("USER_INTERRUPTED") } }, perform: {
                clicks += 1
                paused = true
            }, confirm: { confirmed = true })
            preconditionFailure("An interrupted setup action must stop.")
        } catch { precondition((error as? ControlError)?.code == "USER_INTERRUPTED") }
        precondition(clicks == (before ? 0 : 1) && !confirmed)
        do {
            _ = try guardedSetupAction(check: { if paused { try reject("USER_INTERRUPTED") } }, perform: { clicks += 1 }, confirm: {})
            preconditionFailure("A paused setup must not click again.")
        } catch { precondition(clicks == (before ? 0 : 1)) }
    }
    print("ok: native input classification, conversation identity, and composer identity")
} else {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    do {
        let request = try JSONSerialization.jsonObject(with: input) as! [String: Any]
        let _ = NSApplication.shared
        NSApp.setActivationPolicy(.accessory)
        let handoff = Handoff(request)
        let result: [String: Any]
        do { result = try handoff.run() }
        catch {
            let code = (error as? ControlError)?.code ?? "CONTROL_FAILED"
            if handoff.panel != nil {
                handoff.banner("TagTeamGPT PAUSED: \(code)\nNo automatic retry. Inspect the conversation and draft before resume.", paused: true)
                let until = Date().addingTimeInterval(2)
                while Date() < until {
                    RunLoop.current.run(until: min(until, Date().addingTimeInterval(0.01)))
                    if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier { handoff.observeActivation(pid) }
                }
            }
            result = ["ok": false, "code": code, "verified": false, "keys_fired": handoff.pasteSent || handoff.enterSent,
                      "paste_sent": handoff.pasteSent, "enter_sent": handoff.enterSent,
                      "click_attempted": handoff.clickAttempted, "click_performed": handoff.clickPerformed,
                      "interruption_source": handoff.interruptionSource ?? "none",
                      "application_change_observed": handoff.applicationChangeObserved,
                      "draft_evidence": handoff.draftEvidence]
        }
        handoff.cleanup()
        let output = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        FileHandle.standardOutput.write(output)
    } catch {
        print("{\"ok\":false,\"code\":\"INVALID_REQUEST\"}")
    }
}

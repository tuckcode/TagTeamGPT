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
func draftMatches(_ raw: String, _ expected: String?) -> Bool {
    let content = raw.replacingOccurrences(of: "\r\n", with: "\n")
    guard let expected = expected else { return content.isEmpty || content == "\n" }
    let payload = expected.replacingOccurrences(of: "\r\n", with: "\n")
    return content == payload || content == payload + "\n"
}

final class Handoff {
    var interrupted: String?
    var tap: CFMachPort?
    var panel: NSPanel?
    var label: NSTextField?
    var observers: [NSObjectProtocol] = []
    var pasteSent = false
    var enterSent = false
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
        guard !title.isEmpty, !["ChatGPT", "Chat", "Codex", "New chat", "New tab"].contains(title) else { try reject("CONVERSATION_UNNAMED") }
        guard windows.filter({ string($0, kAXTitleAttribute) == title }).count == 1 else { try reject("TARGET_AMBIGUOUS") }
        let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let matches = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(app.processIdentifier) &&
                                    ($0[kCGWindowName as String] as? String) == title &&
                                    ($0[kCGWindowLayer as String] as? Int) == 0 }
        guard matches.count == 1, let windowID = matches.first?[kCGWindowNumber as String] as? Int else { try reject("WINDOW_ID_UNVERIFIED") }
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
        draftEvidence = ["length": content.utf8.count,
                         "empty_line_sentinel": content == "\n",
                         "only_whitespace": content.unicodeScalars.allSatisfy { CharacterSet.whitespacesAndNewlines.contains($0) },
                         "equals_description": content == string(field, kAXDescriptionAttribute),
                         "equals_placeholder": content == string(field, kAXPlaceholderValueAttribute)]
        guard draftMatches(content, payload) else {
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
    func run() throws -> [String: Any] {
        let action = request["action"] as? String ?? ""
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

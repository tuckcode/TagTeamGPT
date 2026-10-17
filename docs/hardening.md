# Desktop input hardening

## Current guarded driver

Read [guarded desktop control](desktop-control.md) before any live handoff.
The public driver now requires conversation binding and native interruption monitoring.
It refuses blind mode changes, standalone Enter, and unverified sends.
The loop no longer retries Enter after a missing reply.
Windows automated sends remain disabled until equivalent guards are available.

The material below records the older injector design and supporting research.
Its unguarded command descriptions are historical.

## Historical injector research

How TagTeamGPT gets keys into **ChatGPT desktop** (Chat / Codex tabs), and
what still flakes. The loop lives in that app. Cursor is only where this
driver is built.

The mode keys themselves (macOS `⌃1/3`, Windows `Alt+1/3`) are fast. The
weak points are: **did ChatGPT actually get focus**, **did the composer
see a real key chord**, and **did Codex then run in `--path`**.

`ok: true` still means **keys left the driver**, not accepted. Accepted is
`.tagteam/last-reply.json` (Chat `submit_c2c`) or `.tagteam/executed.json` under the
goal repo.

## Rules we keep

- Same stupid-simple macro: focus → tab shortcut → clipboard paste → Enter → restore.
- No nested `chatgpt.com`, no mouse hunt, no CUA/OCR/vision on the happy path.
- If ChatGPT is missing or never focused, **abort**. Do not paste into whatever
  was front (browser, editor, password field, this Cursor window during
  build-chat).
- Retry **focus**, never the whole message. A second Enter duplicates the prompt.
- Do not assume background `PostMessage` / `CGEventPostToPid` into Electron.
  Chromium usually wants the window focused and keys on the **system input
  queue**.

## Already in the driver

Windows (`tools/tagteam-driver.mjs`): find ChatGPT HWND by process + top-level
window, `GetForegroundWindow` verify, `FOCUS_LOST` abort, restore previous
HWND after Enter. Keys are an atomic `SendInput` array (Alt+1/3 with
key-up, Ctrl+V, Enter) from STA PowerShell (`-STA`). `--debug` /
`TAGTEAM_DEBUG=1`. Focus retries: `TAGTEAM_FOCUS_RETRIES` / `TAGTEAM_FOCUS_RETRY_MS`.
`SendKeys` is gone — it leaves Alt stuck.

Mac: JXA System Events, `AXRaise` the named ChatGPT window, poll
`frontmost` (abort `FOCUS_LOST`) before Control+1/3, ⌘V, or Enter.
Clipboard is set **before** the focus steal so the locked burst is only
keys. Accessibility required or osascript errors.

## Windows (what the auto-type people actually do)

Password managers, AutoHotkey, dictation paste — not AI agents.

**Focus is a permission.** [Raymond Chen](https://devblogs.microsoft.com/oldnewthing/20090220-00/?p=19083):
you cannot steal foreground; Windows has to *give* it. `SetForegroundWindow`
works if you just got input, you are already front, you were started by the
front app, or you are handling `WM_HOTKEY`. A Node-spawned `powershell.exe`
while the user is in another window usually has **none** of that.
`AllowSetForegroundWindow` from that script is Chen’s “who the hell are you?”

[Registered hotkeys get foreground rights](https://devblogs.microsoft.com/oldnewthing/20090226-00/?p=19013).
That is why a **resident helper** (user-launched, `RegisterHotKey`) beats a
fresh PowerShell every hop. AutoHotkey’s `WinActivate` is the same fight with
extra hacks; they still say the OS has the last word.

Unofficial tricks that show up everywhere:

- `AttachThreadInput` to the current foreground thread, then
  `BringWindowToTop` / `SetForegroundWindow`. Works more often under a
  debugger than as a background exe.
- Synthetic **Alt down/up via `SendInput`**, then `SetForegroundWindow`
  ([gist](https://gist.github.com/Aetopia/1581b40f00cc0cadc93a0e8ccb65dc8c),
  password-manager hosts). Windows unlocks foreground when Alt is pressed.
  **Danger for us:** ChatGPT’s mode keys *are* Alt+1/3. A stuck Alt opens a
  menu instead of pasting. If used: complete down/up **before** the mode
  chord, then verify.

**Injector.** Chromium/Electron ignore `ControlSend`,
`PostMessage(WM_KEYDOWN)`, and UIA on the renderer
([AHK](https://www.autohotkey.com/boards/viewtopic.php?t=84903),
[Electron #8299](https://github.com/electron/electron/issues/8299),
[CUA #1616](https://github.com/trycua/cua/issues/1616)). They consume the
system queue: window focused, then `SendInput`. Dictation tools all do
**clipboard + Ctrl+V via `SendInput`**, not `SendKeys`. `SendKeys` leaves
Alt stuck
([SO](https://stackoverflow.com/questions/74255618/powershell-system-windows-forms-sendkey-alt-dont-work-properly)).
MSDN: `SendInput` does **not** clear keys the user is holding — check
`GetAsyncKeyState` or the chord mixes with whatever they were typing.

**Next on Windows (in order)**

1. ~~Replace `SendKeys` with an atomic `SendInput` array: Alt+1/3 (with
   key-up), Ctrl+V, Enter. STA PowerShell. Same macro.~~ **Done.** Safety
   abort (`FOCUS_LOST`) is clearly good. Unattended Windows is still
   **unproven** until a real `send --mode chat "ping" --debug` with another
   window focused — Node-spawned PowerShell often has no foreground
   permission (Chen).
2. If focus still fails from Node, a tiny always-running helper that owns a
   `RegisterHotKey`.
3. Refuse `EXECUTED` unless `.tagteam/executed.json` is in `--path` (cwd trap is
   not a hotkey bug).

## macOS (same three holes)

**Activation is a request.** Apple deprecated
`activateIgnoringOtherApps` in macOS 14 and moved to
[cooperative activation](https://developer.apple.com/documentation/appkit/passing-control-from-one-app-to-another-with-cooperative-activation):
the front app is supposed to *yield*. Our `p.frontmost = true` is the old
force. It often still works; a timer / network / agent-spawned `osascript`
is the case people say **fails**.

Classic race: `activate` returns before the app is front; the **first
keystroke hits the previous app**
([SO](https://stackoverflow.com/questions/28798555/virtual-keypress-goes-to-wrong-application)).
Our `delay(0.200)` hopes. Auto-type code polls `isActive` / frontmost, then
sends. Raise the **specific window** (`AXRaise`), not just the process.

**System Events is Mac `SendKeys`.** Fine for a lot of Cocoa. Chrome/Electron
often ignore System Events *clicks* into the webview. Hammerspoon: `keyStrokes`
fails in Chrome; **clipboard + ⌘V** works. That is already our paste path.

Silent Electron landmine: Chromium tracks modifiers from the **Cmd-down
event’s flags**. Cmd-down with flags `0`, then V with the Command bit →
Electron **drops ⌘V with no error**; AppKit still pastes
([voicebox / CGEvent chords](https://github.com/jamiepine/voicebox/blob/51f49dea/tauri/src-tauri/src/synthetic_keys.rs)).
If we leave `System Events.keystroke` for `CGEvent`, the chord must be: Cmd
down *with* Command flag, V down/up with Command, Cmd up. Control+1/3 can
fail the same way if Control-down is posted naked.

`CGEvent.post` at `kCGHIDEventTap` is what Mac auto-type uses. Without
Accessibility it **fails silently**. `CGEventPostToPid` is the “don’t steal
focus” experiment; keyboard sometimes reaches Electron, mouse usually does
not. Do not bet the happy path on it.

**Next on Mac (in order)**

1. ~~Poll frontmost (abort `FOCUS_LOST`) before Control+1/3 or ⌘V. AXRaise the
   named ChatGPT window.~~ **Done.** Same abort as Windows: if ChatGPT is
   not actually front, do not send the chord.
2. Keep clipboard + ⌘V. Do not type the `[C2C]` body. (Already true.)
3. If paste still flakes, HID `CGEvent` with correct modifier flags.

Do not pile more AX walking onto Electron. The tree is a black box unless
you force `AXManualAccessibility`; VoiceOver is a different stack than “set
the text field.”

## What “executed what we wanted” means

| Check | Meaning |
| --- | --- |
| Driver `ok: true` | Keys fired at the OS |
| Chat `.tagteam/last-reply.json` | Chat accepted PLAN/DONE/BLOCKED |
| Codex `.tagteam/executed.json` **in `--path`** | Codex finished in the goal repo, not a `Documents/Codex/…` snapshot |

Alt+3 / ⌃3 only flips the tab. Mode ≠ project.

## Sources (non-AI, Windows + Mac)

- [Foreground permission is like love (Chen)](https://devblogs.microsoft.com/oldnewthing/20090220-00/?p=19083)
- [WM_HOTKEY gives foreground love (Chen)](https://devblogs.microsoft.com/oldnewthing/20090226-00/?p=19013)
- [SetForegroundWindow remarks (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
- [Keyboard input / SendInput (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/inputdev/about-keyboard-input)
- [Cooperative activation (Apple)](https://developer.apple.com/documentation/appkit/passing-control-from-one-app-to-another-with-cooperative-activation)
- AutoHotkey WinActivate / Electron ControlSend threads; Hammerspoon clipboard+⌘V; KeePass-style auto-type blogs.

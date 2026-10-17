# Guarded desktop control

TagTeamGPT verifies a named conversation before each automated send.
The Mac helper shows a blue banner for two seconds before keyboard input.
The banner names the conversation that will receive the message.
It remains visible during the send.

Clicks, typing, scrolling, application changes, Space changes, and session locking interrupt the handoff.
The helper ignores only its own marked keyboard events.
It observes input without blocking the user's input or saving key contents.
An interruption shows a red pause banner for two seconds.
The paused state remains in `.tagteam/ui-control.json` after the banner closes.

## Guard setup clicks

Setup uses the same banner, input monitor, pause request, and process lock as message sending.
Setup displays its warning for 15 seconds before acting.
Use the guarded setup commands for mode selection, project removal, sidebar controls, and message-box focus.
Each command permits one supported setup action.
It does not paste text, press Enter, or execute arbitrary clicks.
Unsupported controls require a manual action while automation is stopped.

1. Warn the user before any setup action.
2. Inspect the current window through read-only tools.
3. After the user authorizes control, run `node tools/tagteam-driver.mjs control setup-bind`.
4. Submit one exact control and its expected result through `control setup -`.
5. Require `postcondition_verified: true` before preparing another step.

Setup binding reads the focused ChatGPT window and checks for existing drafts.
It does not activate the application or click anything.
It uses a separate binding from Chat and Codex message handoffs.
Unnamed windows are permitted for setup only. They remain forbidden for message sends.

For example, a Work screen with an unchecked Chat control can use this guarded step:

```sh
node tools/tagteam-driver.mjs control setup - <<'JSON'
{
  "control": { "role": "AXCheckBox", "label": "Chat", "selected": false },
  "after": { "role": "AXCheckBox", "label": "Chat", "selected": true }
}
JSON
```

Read the current controls before choosing a step. Labels can differ between app versions.
The selector uses an exact role and label. Optional `selected`, `enabled`, and `focused` values are boolean checks.
An expected `window_title_after` permits a deliberate title change while preserving the process and window identity.
Coordinate clicks, element indices from an old snapshot, message submission, and deletion controls are not supported.

The helper resolves the control again after the 15-second setup warning.
It checks the foreground application, exact window identity, draft contents, unique control, enabled state, and visible bounds before acting.
After acting, it checks the declared result for up to one second without repeating the action.
An interrupted, ambiguous, or unexpected result pauses control and cancels further setup commands.
`click_attempted` and `click_performed` record whether an action might need manual inspection.

After an interruption, inspect the screen before running `control setup-resume`.
Resume verifies the existing setup binding. It does not click or replay a step.
If the window changed, inspect it and explicitly bind it again.
Binding and resume are explicit authorization steps that clear a manual pause request.

During automated setup, use read-only CUA snapshots for discovery.
Use the guarded driver for each UI change.
Do not bypass a refusal with raw CUA clicks, mode shortcuts, direct UI navigation APIs, or another input tool.
An external approval rejection still applies. A guarded wrapper does not authorize a previously rejected action.

## Prepare the conversations

Use separate named Chat and Codex windows for automated handoffs.
The current guard does not navigate between conversations within one window.
It refuses unnamed conversations and ambiguous window titles.

1. Open the intended Chat conversation and focus its empty message box.
2. Run `node tools/tagteam-driver.mjs control bind --mode chat` from the TagTeamGPT clone.
3. Open the intended Codex conversation and focus its empty message box.
4. Run `node tools/tagteam-driver.mjs control bind --mode codex`.
5. Start the loop only after both binding commands report `verified: true`.

Binding reads the current conversation. It does not send a message or change application focus.
A nonempty accessible value counts as a placeholder when `AXPlaceholderValue` identifies the exact text and `AXNumberOfCharacters` reports zero.
The app can also expose a suggestion through a separate `placeholder` child inside its `ProseMirror` editor.
The guard accepts only the observed complete structure: one placeholder group, one inner group, and one text element.
Each child must report zero characters. The text must match the entire box value, with at most one rendering newline.
Additional children, typed content, missing attributes, or a different structure block control.
The guard never removes a suggestion or draft to inspect the box.
Matching the message-box label alone never proves that the box is empty.
Missing or conflicting evidence blocks control and preserves the text.
The failure result records character counts and placeholder availability without recording draft text.
Binding and resume require the empty message box to have focus.
After binding, the guarded sender focuses the verified message box before pasting.
The binding saves the process ID, application identifier, window ID, exact title, and expected mode.
Renaming a conversation, restarting ChatGPT, or replacing its window requires a new binding.
Binding a replacement is an explicit action. Inspect its conversation and draft first.

## Send and interrupt

Use `chat-send`, `codex-send`, or `send --mode chat|codex` with a `[C2C]` message.
All three commands use the guarded helper.
The helper verifies the bound window before taking control.
It checks the visible mode, the focused window, and a uniquely identified message box.
It checks that the message box is empty before pasting.
This app version exposes an empty message box as one newline.
The guard accepts that exact empty value. It continues to reject spaces, multiple blank lines, and existing draft text.
Before Enter, it verifies that the same box contains exactly the handoff message and still has focus.
The app can append one newline to the accessible message value. The guard permits that single rendering newline.

The helper stops if the input monitor fails or any required evidence is unavailable.
It does not use a screenshot or a guessed mode as permission to send.
It does not use a mode shortcut to search for the intended conversation.
Standalone `to` and `enter` commands are disabled.
The force flags do not bypass the guard.

For a manual pause from another terminal, run:

```sh
node tools/tagteam-driver.mjs control pause
```

This creates a pause request that the active helper checks before further input.
To inspect the durable control state, run:

```sh
node tools/tagteam-driver.mjs control status
```

## Resume after an interruption

1. Inspect the named conversation and its last message.
2. If a draft remains, preserve or remove it manually after checking whether the message was already submitted.
3. Focus the intended conversation's empty message box.
4. Run `node tools/tagteam-driver.mjs control resume --mode chat` or use `--mode codex` for Codex.
5. Continue the handoff only after resume reports `verified: true`.

Resume checks the existing binding. It does not paste, press Enter, or replay a message.
The loop stops when a send fails. Restarting the loop starts a new run.
It does not automatically continue an interrupted turn.
Inspect saved plans, execution receipts, and review baselines before restarting.
The loop no longer presses Enter when a reply is late.
If the loop expects a task ID, Chat's reply must contain that exact ID before the loop continues.

If a helper process crashes, a process lock can remain at `.tagteam/ui-control.lock`.
Inspect the recorded process and any surviving helper before removing that lock.
Never remove a lock while its controller or native helper still runs.
After lock recovery, explicitly resume or bind the intended conversation again.

## Requirements and limits

The guarded helper currently supports macOS.
It uses the installed Swift compiler and caches its executable under `.tagteam/bin/`.
macOS must permit Accessibility and input observation for the helper.
Window metadata must expose a unique window ID and title.
The app must expose its current mode and message box through Accessibility.
If any requirement is missing, use a manual handoff.
Windows automated sends refuse to run until equivalent interruption monitoring is implemented.

Desktop checks and keyboard delivery are separate operating-system operations.
A final timing race remains possible between a successful check and an input event.
The guard reduces this interval and stops subsequent input after an interruption.
It cannot retract a message that Enter already submitted.
The result records `paste_sent` and `enter_sent` so recovery does not assume that submission failed.
`accepted: false` remains the result until the loop receives the expected Chat or Codex receipt.

## Validation

The setup tests simulate interruption before and immediately after a click.
They also test changed windows, ambiguous controls, missing result evidence, unsupported actions, and blocked subsequent clicks.
The native self-test exercises the same check, action, and confirmation sequence without desktop input.
The placeholder policy requires explicit placeholder attributes or the complete suggestion-only child structure.
Tests reject real drafts, missing evidence, and conflicting character counts.
On October 17, the live retry reported 18 characters and no placeholder attribute.
The guard preserved that text and refused setup binding before any input.
On October 17, the suggestion-only check accepted the explicit placeholder child structure in the current window.
A guarded `Show sidebar` action completed once and verified the expected `Hide sidebar` control.
That attempt sent no keys and detected no interruption before the action completed.
The controller was manually paused afterward.
A subsequent live setup test used the 15-second warning.
A mouse click interrupted the guard before its sidebar action.
The result reported `USER_INTERRUPTED`, `click_attempted: false`, and `click_performed: false`.
It sent no keys, pasted no text, and pressed no Enter.
Control remained paused after the interruption.
A live Command-Tab interruption during setup still needs separate validation.

For a live input-monitor test, run `node tools/tagteam-driver.mjs control test` after warning the user.
The test displays a banner and observes input for up to 12 seconds.
It never activates another app, pastes text, or sends keys.
Click or use Command-Tab while the blue banner is visible.
A successful interruption reports `test_passed: true` and leaves control paused.
The first observed input determines `interruption_source`.
Command-Tab can pause on keyboard input before macOS completes the app change.
`application_change_observed: false` only means that the helper did not observe a changed app before its result.
It does not prove that the user remained in the original app.

Run `node --test tools/tagteam-control.test.mjs` for control-state and interruption simulations.
Compile `tools/native/tagteam-control.swift` with `swiftc` and run its executable with `--self-test` for native policy checks.
The self-test does not inspect or control desktop windows.
On October 17, 2026, the live test detected a click and keyboard input from a user-confirmed Command-Tab attempt.
Each test sent no keys and left control paused.
A subsequent send attempt returned `CONTROL_PAUSED` without running the native sender.
The setup-guard update also rejected a paused setup command before native execution and preserved the existing pause state.
On the same date, a complete guarded send reached **TagTeamGPT Guarded Send Test**.
The recipient returned `GUARDED_SEND_RECEIVED_c2c_guarded_send_live_20261017` in its recorded conversation.
The sender verified the exact window title, process, window ID, visible interface mode, and focused message box.
This test used a dedicated Codex-backed conversation whose interface labels were **ChatGPT** and **Work with ChatGPT**.
Those interface labels do not independently identify the backend conversation type.
The test proves one guarded message delivery. It does not prove a complete Chat planner and Codex executor cycle.
Independent app-change detection and the complete planning cycle still need live validation before claiming unattended operation.

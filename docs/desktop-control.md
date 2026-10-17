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
On the same date, a complete guarded send reached **TagTeamGPT Guarded Send Test**.
The recipient returned `GUARDED_SEND_RECEIVED_c2c_guarded_send_live_20261017` in its recorded conversation.
The sender verified the exact window title, process, window ID, visible interface mode, and focused message box.
This test used a dedicated Codex-backed conversation whose interface labels were **ChatGPT** and **Work with ChatGPT**.
Those interface labels do not independently identify the backend conversation type.
The test proves one guarded message delivery. It does not prove a complete Chat planner and Codex executor cycle.
Independent app-change detection and the complete planning cycle still need live validation before claiming unattended operation.

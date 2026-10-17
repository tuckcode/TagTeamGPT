# Guarded keyboard workflow

Read `docs/desktop-control.md` in the TagTeamGPT clone before any live desktop handoff.
Use its binding, interruption, and resume procedure.
If the skill is installed globally, locate the TagTeamGPT clone first.

Keep Chat responsible for planning and review.
Keep Codex responsible for execution in the intended project.
Use separate named Chat and Codex windows for guarded automated sends.
The current guard does not navigate between conversations within one window.

Bind each conversation while its empty message box has focus.
Require `verified: true` from each binding before starting the loop.
Use `chat-send`, `codex-send`, or `send --mode chat|codex` with a `[C2C]` message.
The driver shows a banner before control and pauses on user input or application changes.
If verification fails, use a manual handoff.

After an interruption, inspect the conversation and draft before explicit resume.
Resume does not replay a message.
Standalone mode changes and Enter retries are disabled.
Use `control setup-bind`, `control setup -`, and `control setup-resume` for setup UI changes.
Read the current screen before preparing each exact control and expected result.
Require a verified result after each action. An interruption cancels further steps.
Keep setup bindings separate from message handoff bindings.
Use read-only snapshots for discovery.
Use the guarded driver for all setup and handoff input.
Do not bypass it with raw CUA clicks, keystrokes, or direct UI navigation APIs.

The manual mode shortcuts remain macOS Control+1/2/3 and Windows Alt+1/2/3.
They select Chat, Work, and Codex in app versions that support those shortcuts.
A mode shortcut does not select the correct conversation or project.

A successful send proves keyboard delivery only.
Require the next matching Chat state or Codex execution receipt before reporting acceptance.

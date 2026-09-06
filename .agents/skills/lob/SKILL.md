---
name: lob
description: >
  Run the Lob desktop workflow: Chat lobs (plans/reviews), Codex dunks (executes).
  Use when the user says Lob, $lob, C2C, desktop Chat/Codex split,
  or asks to plan in Chat and implement in Codex with paste-back [C2C] messages.
  Do not use for ordinary coding that stays only in Codex with no Chat planner.
  Do not automate chatgpt.com in a nested browser. Do not use Work as the planner.
---

# Lob

Chat lobs. Codex dunks. One ChatGPT desktop app.

You (Codex) own execution: editing, shell, git, tests, recovery.
Chat owns planning and review.

Invoke in ChatGPT desktop **Codex** with **`$lob`** — not Cursor’s `/` picker.

CLI: `docs/usage.md`. Stuck path (`--verify`, OCR, CUA): `docs/troubleshooting.md`.
Keybinds: `references/keyboard.md`. Templates: `references/protocol.md`.

## Golden rules

1. Prefer the keystroke driver when available (macOS + Windows): hotkeys +
   clipboard + Enter, no screenshots. macOS uses Control+1/2/3; Windows uses
   Alt+1/2/3. Fall back to paste-back if the driver fails or OS blocks keystrokes.
2. **Never** open nested `chatgpt.com`, hunt connector settings, or mouse-hunt
   the web ChatGPT UI. That is upstream C2C’s path, not this skill.
3. **Connector is optional.** Default is paste-back `[C2C]` only. Do not require
   tunnels/OAuth. Read-only workspace MCP (`mcp/`) is for when Chat should pull
   diffs/files itself. Rhizome mailbox is separate from the Chat MCP.
4. **Never** use **Work** as the planning brain. Chat only.
5. Keep every Codex→Chat control message under ~1 KB. No full diffs or file dumps.
6. Prefer the keyboard workflow in `references/keyboard.md` (⌃1 / ⌃3 + clipboard).
   Do not require CUA/screenshots for the happy path.
7. Read `references/protocol.md` for boot prompt and message templates.
8. **Local folder projects do not support Chat.** Keep Chat as a plain cloud
   thread (no local folder). Mount the **goal repo** only in **Codex** for
   execution. Banner: “Local projects don't support Chat.”
9. **Codex mode ≠ Codex project.** `Control+3` / `Alt+3` only flips the tab.
   The user gives the repo **path** with the goal (`--path` / `$lob` path).
   The loop binds that path and Codex must `pwd` there. Do not click the
   sidebar on every hop. The folder must already exist as a Codex project
   (install once). Public users run Lob *inside their own repo*.
10. **Codex cwd trap:** sidebar project name ≠ guarantee of writable git root.
    If Codex `pwd` is under `~/Documents/Codex/…`, it is a conversation snapshot
    — green tests there do not update the real checkout. Preflight `pwd`.

## Workflow

### 0. Start

When invoked (“Use Lob to …”, `$lob`, etc.):

1. Confirm: desktop **Chat** + **Codex** tabs; user will paste between them.
2. Remind the Chat / Codex keybinds for their OS.
3. Generate `TASK_ID`: `c2c_` + 4 random hex characters (e.g. `c2c_a1f3`).
4. Track `ITERATION` starting at `0`. Cap at **12**; then ask whether to continue.

### 1. Boot Chat (once per pinned thread)

If this is a new ChatGPT Chat thread for the task:

1. Output the **boot prompt** from `references/protocol.md` in a fenced code block.
2. Tell the user: pin that Chat thread; paste the boot prompt once; send; then
   come back here.

Skip if the user says the Chat thread is already booted for Lob.

### 2. Send INIT

1. Build an `INIT` message from `references/protocol.md` using the user’s goal
   and the new `TASK_ID`.
2. Show it in a fenced code block.
3. Say exactly: copy this → switch to **Chat** (`⌃1` / `Alt+1`) → paste → send →
   paste Chat’s reply back into this Codex chat (or “continue” with the reply).
4. Stop and wait. Do not pretend Chat replied.

### 3. Handle Chat’s reply

Parse the pasted text for `STATE:`:

- **`PLAN`:** Extract `ACTIONS`, `FILES_LIKELY_INVOLVED`, `TESTS`,
  `SUCCESS_CRITERIA`, and `RATIONALE`. If the reply is a bare one-liner with no
  actionable steps, ask once for a proper C2C PLAN. Otherwise go to Execute.
- **`DONE`:** Summarize the outcome for the user in plain language. End the loop.
- **`BLOCKED`:** Surface Chat’s `REASON` and the single `NEEDS` decision. Stop
  until the user decides.
- **Missing / not C2C:** Ask once for a proper `[C2C]` message with a `STATE` header.

### 4. Execute

1. Set mental state `EXECUTING`. Increment `ITERATION` when starting a PLAN.
2. Implement the plan yourself with your Codex harness (your tools, your judgment).
   Chat does not micro-manage tool calls.
3. Prefer the plan’s file list and success criteria. Avoid unnecessary rewrites.
4. Run tests if the plan or repo makes that reasonable; otherwise note `not run`.

### 5. Send EXECUTED

1. Build an `EXECUTED` stub: `TASK_ID`, `ITERATION`, short `RESULT`,
   `CHANGED_FILES` count, `TESTS` one-line summary. No diffs.
2. Show it in a fenced code block.
3. Cue the user: copy → Chat → paste → send → paste the next reply here.
4. Wait.

### 6. Loop

On the next pasted reply: `PLAN` (another iteration), `DONE`, or `BLOCKED` as above.
At iteration 12 without `DONE`, ask: “12 iterations done — continue?”

## Forbidden

- Nested in-app browser to `chatgpt.com` / mouse Computer Use on the web UI
- Treating tunnels/connectors as required for every Lob run
- Calling or installing upstream `c2c` / MCP bridge as if it were this skill
- Treating Work mode as the planner
- Vision / OCR / screenshot loops on the happy path (hotkeys first)

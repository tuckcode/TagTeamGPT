---
name: codexgpt
description: >
  Run the CodexGPT desktop workflow: Chat plans and reviews, Codex executes.
  Use when the user says CodexGPT, Chat plans, C2C, desktop Chat/Codex split,
  or asks to plan in Chat and implement in Codex with paste-back [C2C] messages.
  Do not use for ordinary coding that stays only in Codex with no Chat planner.
  Do not automate chatgpt.com in a nested browser. Do not use Work as the planner.
---

# CodexGPT (v0 — semi-auto)

Chat plans. Codex ships. One ChatGPT desktop app.

You (Codex) own execution: editing, shell, git, tests, recovery.
Chat owns planning and review. The human moves messages between tabs.

## Golden rules

1. **v0 is paste-back.** You draft `[C2C]` stubs. The user copies them into the
   **Chat** tab, then pastes Chat’s reply back here (or says “continue” and
   includes the reply). You do **not** drive mode keybinds with Computer Use.
2. **Never** open nested `chatgpt.com`, hunt connector settings, or automate
   the web ChatGPT UI. That is upstream C2C’s path, not this skill.
3. **Never** invent `c2c setup`, tunnels, OAuth, or MCP wiring in v0. Optional
   MCP is later — out of scope here.
4. **Never** use **Work** as the planning brain. Chat only.
5. Keep every Codex→Chat control message under ~1 KB. No full diffs or file dumps.
6. Read `references/protocol.md` for boot prompt and message templates.

## Mode keybinds (remind the user — they press them)

| Platform | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `⌃1` | `⌃2` | `⌃3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Remappable in Settings → Keyboard Shortcuts. If flaky, tell the user to remap.

## Workflow

### 0. Start

When invoked (“Use CodexGPT to …”, `$codexgpt`, etc.):

1. Confirm: desktop **Chat** + **Codex** tabs; user will paste between them.
2. Remind the Chat / Codex keybinds for their OS.
3. Generate `TASK_ID`: `c2c_` + 4 random hex characters (e.g. `c2c_a1f3`).
4. Track `ITERATION` starting at `0`. Cap at **12**; then ask whether to continue.

### 1. Boot Chat (once per pinned thread)

If this is a new ChatGPT Chat thread for the task:

1. Output the **boot prompt** from `references/protocol.md` in a fenced code block.
2. Tell the user: pin that Chat thread; paste the boot prompt once; send; then
   come back here.

Skip if the user says the Chat thread is already booted for CodexGPT.

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

## Forbidden in v0

- Computer Use / accessibility automation to press mode keybinds or type into Chat
- Nested in-app browser to `chatgpt.com`
- Creating ChatGPT connectors, pairing codes, or Cloudflare tunnels
- Calling or installing upstream `c2c` / MCP bridge
- Treating Work mode as the planner

## After v0 (do not implement here)

- v1: thin Computer Use for keybind + paste only
- Later: optional upstream read-only MCP so Chat can `git_diff` itself

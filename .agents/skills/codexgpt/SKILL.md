---
name: codexgpt
description: >
  Run the Lob desktop workflow: Chat lobs (plans/reviews), Codex dunks (executes).
  Use when the user says Lob, CodexGPT, C2C, desktop Chat/Codex split,
  or asks to plan in Chat and implement in Codex with paste-back [C2C] messages.
  Do not use for ordinary coding that stays only in Codex with no Chat planner.
  Do not automate chatgpt.com in a nested browser. Do not use Work as the planner.
---

# Lob (v0 paste-back · v1 keystroke driver)

Chat lobs. Codex dunks. One ChatGPT desktop app.
The skill id is still `$codexgpt`.

You (Codex) own execution: editing, shell, git, tests, recovery.
Chat owns planning and review.

Invoke in ChatGPT desktop **Codex** with **`$codexgpt`** — not Cursor’s `/` picker.

## Golden rules

1. Prefer the **v1 driver** when available (macOS + Windows): hotkeys + clipboard
   + Enter, no screenshots. macOS uses Control+1/2/3; Windows uses Alt+1/2/3.
   Fall back to v0 paste-back if the driver fails or OS blocks keystrokes.
2. **Never** open nested `chatgpt.com`, hunt connector settings, or mouse-hunt
   the web ChatGPT UI. That is upstream C2C’s path, not this skill.
3. **Connector is optional.** Default is paste-back `[C2C]` only. Do not require
   tunnels/OAuth for v0/v1. Read-only workspace MCP (`mcp/`, v3) is for when
   Chat should pull diffs/files itself. Rhizome mailbox is v2.
4. **Never** use **Work** as the planning brain. Chat only.
5. Keep every Codex→Chat control message under ~1 KB. No full diffs or file dumps.
6. Prefer the keyboard workflow in `references/keyboard.md` (⌃1 / ⌃3 + clipboard).
   Do not require CUA/screenshots for the happy path.
7. Read `references/protocol.md` for boot prompt and message templates.
8. **Local folder projects do not support Chat.** Keep Chat as a plain cloud
   thread (no local folder). Mount the **goal repo** only in **Codex** for
   execution. Banner: “Local projects don't support Chat.”
9. **Codex mode ≠ Codex project.** `Control+3` / `Alt+3` only flips the tab.
   The sidebar keeps the **last** project (often some other folder). Before any
   `codex-send`, click the **mounted project for this goal** — whatever that
   folder is named. Do not hardcode `codexgpt`; that name is only this
   development checkout. Public users run Lob *inside their own repo*.
10. **Codex cwd trap:** sidebar project name ≠ guarantee of writable git root.
   If Codex `pwd` is under `~/Documents/Codex/…`, it is a conversation snapshot
   — green tests there do not update the real checkout. Preflight `pwd`.

## When to use the connector (v3)

Same desktop app + keybinds either way. Decide at start (or when review gets thin):

**Use connector** when Chat must independently check real code after `EXECUTED`
(multi-file edits, risky logic, SUCCESS_CRITERIA that need `git_diff` /
`read_file`). Then: ensure MCP + HTTPS tunnel are up, connector attached in
Chat Developer Mode, and tell Chat to prefer those tools over asking for pastes.

**Skip connector** when short `RESULT` / `CHANGED_FILES` / `TESTS` stubs are
enough, or the user does not want background MCP/tunnel processes.

Never dump whole files into Chat “just in case.” If the connector is off and
Chat needs evidence, paste one short targeted snippet only.

## Mode keybinds

| Platform | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `⌃1` | `⌃2` | `⌃3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Remappable in Settings → Keyboard Shortcuts. If flaky, tell the user to remap.

## v1 driver (macOS + Windows)

From the repo root (ChatGPT desktop running). macOS needs Accessibility for the
shell; Windows focuses the ChatGPT window via PowerShell SendKeys.

```bash
node tools/codexgpt-driver.mjs to chat
node tools/codexgpt-driver.mjs chat-send "$(cat <<'EOF'
[C2C]
STATE: INIT
...
EOF
)"
node tools/codexgpt-driver.mjs enter   # Enter only, composer focused
node tools/codexgpt-driver.mjs to codex
```

Other commands: `mode`, `to work`, `send "…"`, `codex-send "…"`. `chat-send` /
`codex-send` require `[C2C]`; clipboard is set then read back before paste.
`ok: true` = keys fired, not accepted — confirm next `[C2C]` STATE or
`.codexgpt/executed.json`. Do not re-press ⌃1 / Alt+1 when already in Chat.
After send, previous front app is restored (especially macOS).

Timing defaults: `CODEXGPT_FOCUS_MS=200`, `CODEXGPT_MODE_SETTLE_MS=350`,
`CODEXGPT_PASTE_MS=120`, `CODEXGPT_ENTER_MS=250` (or `.codexgpt/config.json`).

Add `--verify` only for optional mode read-back (Electron often opaque; Windows
UIA best-effort). OCR/vision off by default — `CODEXGPT_OCR=1` or
`--verify-vision` only when `--verify` fails twice / mode unknown; abort if OCR
says Work. No nested `chatgpt.com` / CUA on the happy path.

## Auto-loop (macOS + Windows)

```bash
# Full workflow by default: Chat + Codex handoff (+ mailbox/memory when configured)
node tools/codexgpt-loop.mjs --goal "…"
```

Overrides: `--no-codex` `--no-mailbox` `--no-memory` `--boot`. Config:
`codexgpt.config.json` or `.codexgpt/config.json`.

Polls Chat for PLAN / DONE / BLOCKED. On PLAN writes `.codexgpt/last-plan.md`
and (by default) pastes into **Codex**. Waits for `.codexgpt/executed.json`,
then EXECUTED back to the **same** Chat. DONE/BLOCKED → vault mailbox + memory.

MCP tunnel helper: `node tools/codexgpt-mcp-up.mjs start|stop|status`
(idle auto-stop after `mcp_idle_minutes`, default 60). Mailbox skim nudge after
DONE when 10 new notes **or** 14 days: `node tools/codexgpt-mailbox-nudge.mjs`
(`--ack` after you skim).

Do **not** open New chat between turns — one thread per goal.

On Chat wait miss the loop tries one extra Enter, then `NO_REPLY`. Windows:
if scrape is empty, copy reply → `Get-Clipboard -Raw | node tools/codexgpt-write-reply.mjs --from-clipboard`.

If the loop cannot see Chat text, dump replies yourself:

```bash
# copy Chat’s [C2C] reply, then:
# macOS:
pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard
# Windows (PowerShell):
Get-Clipboard -Raw | node tools/codexgpt-write-reply.mjs --from-clipboard
```

Or write `.codexgpt/last-reply.json` with `{ "ok": true, "state": "PLAN", "task_id": "…", "snippet": "…" }`.

## Workflow

### 0. Start

When invoked (“Use Lob to …”, `$codexgpt`, etc.):

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
- Calling or installing upstream `c2c` / MCP bridge as if it were v0/v1
- Treating Work mode as the planner
- Vision / OCR / screenshot loops on the happy path (hotkeys first; OCR only when stuck)

## After v1

- **v2:** Rhizome **mailbox** (`[C2C]` inbox/outbox) + optional **memory** notes — not written by the Chat MCP
- **v3:** optional `mcp/` read-only Streamable HTTP — tunnel + Chat connector for selective `git_diff` / `read_file` (see above); no vault writes through that connector

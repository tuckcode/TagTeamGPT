# Using TagTeamGPT

ChatGPT **Chat** plans and reviews. **Codex** edits, runs shells, and tests. You (or the keystroke driver) move short `[C2C]` messages between them.

![TagTeamGPT loop](lob-loop-diagram.png)

*Placeholder diagram.*

`[C2C]` is the Chat-to-Codex handshake tag from upstream, not “clipboard-to-clipboard.”

## The idea in one loop

```text
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

Give a **goal** and a **repo path**. The driver hops those states: Chat plans, Codex edits, Chat reviews.

```bash
node tools/lob-loop.mjs --goal "…" --path /path/to/repo --boot
```

Keep control messages under ~1 KB. Do not dump full diffs into Chat unless Chat asks for one short snippet (or the optional MCP connector can `git_diff` / `read_file`).

## Manual paste-back (fallback)

Use this when the driver cannot run — no Accessibility, no tunnels.

1. In **Codex**, run `$tagteam` and give the repo path plus the goal.
2. First time: paste the **boot prompt** from [protocol.md](../.agents/skills/tagteam/references/protocol.md) into your pinned Chat thread.
3. Copy each `INIT` / `EXECUTED` stub → `Control+1` / `Alt+1` → paste → send.
4. Copy Chat’s `PLAN` / `DONE` / `BLOCKED` → `Control+3` / `Alt+3` into the Codex thread for that path → paste → send.
5. Repeat until Chat says **DONE**.

### What a good PLAN looks like

Chat should return reasoning first, checklist second:

- `GOAL`
- `RATIONALE` (why this approach — not a restatement of the checklist)
- `ACTIONS` (finite steps)
- `FILES_LIKELY_INVOLVED`
- `TESTS`
- `SUCCESS_CRITERIA`

Thin ACTIONS-only lists are weak plans — ask Chat to revise before Codex runs.

## Keystroke driver (macOS + Windows)

From the repo root:

```bash
# Flip modes — macOS Control+1/2/3 · Windows Alt+1/2/3
node tools/lob-driver.mjs to chat
node tools/lob-driver.mjs to codex

# Paste + Enter in the current mode (no mode switch)
node tools/lob-driver.mjs send "hello"

# Enter only (composer already focused)
node tools/lob-driver.mjs enter

# Switch to Chat, paste a stub, send
node tools/lob-driver.mjs chat-send "$(cat <<'EOF'
[C2C]
STATE: INIT
TASK_ID: c2c_demo
ITERATION: 0

GOAL:
…
EOF
)"
```

On Windows PowerShell you can also: `Get-Content stub.txt -Raw | node tools/lob-driver.mjs chat-send -`

`chat-send` / `codex-send` require a payload starting with `[C2C]`. The driver sets the clipboard and reads it back before paste. `codex-send` and `send --mode codex` fire Control+3 / Alt+3 and paste in one step — do not `to codex` then `send` later.

`ok: true` means **keys fired**, not “Chat accepted the message.” Confirmation is the next `[C2C]` **STATE** or `.lob/executed.json` (or another expected file side-effect). After send, the driver restores the previous front app (especially on macOS).

Prefer `chat-send` / `codex-send` / `send --mode chat|codex`. **Do not re-press `Control+1` / `Alt+1` when already in Chat** — it can open New chat and abandon your pinned planner thread. Use `--force-mode` only when you mean to fire the Chat hotkey anyway.

Optional `--verify` tries a mode read-back. Electron often hides the mode chip from accessibility; Windows UIA is best-effort. Skip verify on the happy path and confirm the thread by eye.

**Timing** (slow machine? raise these): `LOB_FOCUS_MS=200`, `LOB_MODE_SETTLE_MS=350`, `LOB_PASTE_MS=120`, `LOB_ENTER_MS=250`. Same keys may live in `lob.config.json` or `.lob/config.json`.

**Vision / OCR is off by default.** Use `LOB_OCR=1` or `--verify-vision` only when `--verify` fails twice or mode is unknown — one crop of the mode chip. If OCR says Work, abort. No nested `chatgpt.com` / CUA on the happy path.

## Auto-loop (macOS + Windows)

```bash
node tools/lob-loop.mjs --goal "…" --path /path/to/repo --boot
```

Give the goal and the folder path once. ChatGPT is brought forward briefly to paste, then given back. On Windows the driver aborts with `FOCUS_LOST` instead of pasting if ChatGPT never actually receives focus. Chat and Codex keep writing while you click around. Codex done is a file (`<repo>/.lob/executed.json`) — no focus. Chat’s reply is `.lob/last-reply.json` after Chat calls MCP `submit_c2c` — the loop does not Select-All or scrape the Chat thread.

Defaults (see `lob.config.json`): Chat + Codex handoff on; optional mailbox/memory notes.

If Chat’s `[C2C]` still is not seen, copy it and run:

```bash
# macOS
pbpaste | node tools/lob-write-reply.mjs --from-clipboard
# Windows PowerShell
Get-Clipboard -Raw | node tools/lob-write-reply.mjs --from-clipboard
```

See also: [Loop details](loop.md).

## Optional MCP review

When Chat must independently check code after `EXECUTED`:

1. `node tools/lob-mcp-up.mjs start`
2. Attach it in ChatGPT Developer Mode as connector **`tagteam-workspace`** (rename or replace `codexgpt-workspace`). Enable it on the Chat thread via `+`.
3. Tell Chat to prefer `git_diff` / `read_file` over asking for pastes.

A new tunnel URL pasted into a `[C2C]` message does **not** rebind the connector — edit connector settings when the URL changes.

Details: [mcp/README.md](../mcp/README.md).

## Explainer site (optional)

This repo also ships a Next.js write-up:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Protocol reference

Full templates: [`.agents/skills/tagteam/references/protocol.md`](../.agents/skills/tagteam/references/protocol.md)  
Keyboard notes: [`.agents/skills/tagteam/references/keyboard.md`](../.agents/skills/tagteam/references/keyboard.md)

Stuck? See [Troubleshooting](troubleshooting.md).

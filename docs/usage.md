# Using TagTeamGPT

ChatGPT **Chat** plans and reviews. **Codex** edits, runs shells, and tests. You (or the keystroke driver) move short `[C2C]` messages between them.

*Placeholder diagram.*

`[C2C]` is the Chat-to-Codex handshake tag from upstream, not “clipboard-to-clipboard.”

## The idea in one loop

```text
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

Give a **goal** and a **repo path**. The driver hops those states: Chat plans, Codex edits, Chat reviews.

```bash
node tools/tagteam-loop.mjs --goal "…" --path /path/to/repo --boot
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

## Guarded desktop driver

Read [desktop control](desktop-control.md) before running the driver.
Bind separate named Chat and Codex windows first.
The Mac helper shows a control banner and pauses when the user interacts.
Every send verifies the conversation and message box.
Windows currently requires manual handoffs.

```sh
node tools/tagteam-driver.mjs control bind --mode chat
node tools/tagteam-driver.mjs control bind --mode codex
node tools/tagteam-driver.mjs control status
```

Run each binding command while its intended conversation has focus and an empty message box.
Use `chat-send`, `codex-send`, or `send --mode chat|codex` for a guarded `[C2C]` message.
The driver disables standalone `to` and `enter` commands.
A paused handoff requires inspection and an explicit `control resume --mode chat|codex` command.
Resume never replays a message.

## Auto-loop

```bash
node tools/tagteam-loop.mjs --goal "…" --path /path/to/repo --boot
```

Give the goal and folder path after binding the two conversations.
The guarded helper shows a banner before each handoff.
It stops the loop if the user interrupts or the target cannot be verified.
The loop does not press Enter again when a reply is late.
Codex completion requires `<repo>/.tagteam/executed.json`.
Chat completion requires `.tagteam/last-reply.json` after Chat calls `submit_c2c`.

Defaults (see `tagteam.config.json`): Chat + Codex handoff on; optional mailbox/memory notes.

If Chat’s `[C2C]` still is not seen, copy it and run:

```bash
# macOS
pbpaste | node tools/tagteam-write-reply.mjs --from-clipboard
# Windows PowerShell
Get-Clipboard -Raw | node tools/tagteam-write-reply.mjs --from-clipboard
```

See also: [Loop details](loop.md).

## Optional MCP review

The loop records each execution separately. See [turn reviews](turn-reviews.md) for saved change lists and patches.

When Chat must independently check code after `EXECUTED`:

1. Start the local server and private tunnel with the [saved setup instructions](private-connector.md).
2. Select **TagTeamGPT Private** with `@` in the Chat thread.
3. Tell Chat to prefer `git_diff` / `read_file` over asking for pastes.

Call `workspace_info` to confirm the folder before review.
The private tunnel uses its saved tunnel ID across restarts.
The `tagteam-mcp-up.mjs` helper starts a separate public Cloudflare tunnel.
It does not manage the private connection.

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

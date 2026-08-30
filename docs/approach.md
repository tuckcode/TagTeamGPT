# CodexGPT — desktop-app approach

Personal take on the “ChatGPT thinks, Codex works” split, adapted for the
unified ChatGPT desktop app (Chat · Work · Codex in one window).

Upstream inspiration:
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt).

## Status

**v0 Skill shipped** at [`.agents/skills/codexgpt/`](../.agents/skills/codexgpt/).

Semi-auto paste-back loop: Codex drafts `[C2C]` messages; the human switches
tabs with mode keybinds and pastes Chat’s replies back. No Computer Use
automation. No MCP bridge.

## What we keep from C2C

- **Division of labor.** Chat owns plan + independent review. Codex owns
  edit / shell / git / tests.
- **Tiny control messages.** `[C2C]` state headers under ~1 KB. No dumping
  the whole diff into the composer when you can avoid it.
- **Optional read-only MCP (later).** If Chat can attach a custom connector,
  the original bridge can still work as the data plane. Not wired in v0.

## What we change

| Original C2C | CodexGPT (desktop take) |
| --- | --- |
| Codex drives nested `chatgpt.com` via in-app browser | Codex and Chat are modes in the same desktop app |
| Mouse / DOM automation for connectors and chat | Mode keybinds + clipboard paste (human in v0) |
| Skill hides tunnels/ports from the user | Skill focuses on draft → paste cue → execute pasted PLAN |
| One long-lived web ChatGPT thread | One pinned **cloud** Chat thread (no local folder — local projects don't support Chat) + one Codex project with the repo mounted |

## Control plane (v0)

Documented desktop shortcuts (Settings → Keyboard Shortcuts; remappable):

- macOS: `⌃1` Chat · `⌃2` Work · `⌃3` Codex  
- Windows / Linux: `Alt+1` · `Alt+2` · `Alt+3`

Loop:

1. Codex (via `$codexgpt`) writes INIT / EXECUTED to a fenced block.
2. You switch to Chat and paste.
3. Chat replies with PLAN / DONE / BLOCKED.
4. You paste that reply into Codex.
5. Codex executes; repeat.

Protocol templates: [`.agents/skills/codexgpt/references/protocol.md`](../.agents/skills/codexgpt/references/protocol.md).

## Data plane

1. **v0 (now):** Chat never sees the repo unless you paste a short brief. No tunnel.
2. **Later:** optional upstream `c2c` MCP if Chat can attach a custom connector.

Do not use **Work** as the planner if the goal is ChatGPT conversation quota.

## Protocol (same states)

```
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

## Install / invoke

- Open this repo as a Codex project → skill auto-loads from `.agents/skills`.
- Or copy to `~/.agents/skills/codexgpt` for all projects.
- Invoke: `$codexgpt` or “Use CodexGPT to …”.

## Roadmap

1. **Done (v0):** Skill + protocol + paste-back playbook.
2. **Done (v1):** keystroke driver — mode hotkeys + clipboard + Enter, light AX read-back, no vision in the happy path.
3. **v2 (started):** Full loop defaults — Chat + Codex handoff + Rhizome **mailbox**
   + **memory** (`codexgpt.config.json`). Helpers: `codexgpt-mailbox.mjs`,
   `codexgpt-memory.mjs`. Vault path: `projects/codexgpt/{mailbox,memory}/`.
4. **v3 (in progress):** optional read-only workspace MCP at [`mcp/`](../mcp/).
   Helper: `node tools/codexgpt-mcp-up.mjs start|stop|status`. Do not give this MCP
   vault write access.

## Credit

Upstream project: MIT, unofficial, not affiliated with OpenAI. Same applies
here.

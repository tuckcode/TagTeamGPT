# Lob — desktop-app approach

Personal take on the “ChatGPT thinks, Codex works” split, adapted for the
unified ChatGPT desktop app (Chat · Work · Codex in one window).

**Chat lobs. Codex dunks.**

The product is **Lob**. Invoke with `$lob`. GitHub: `tuckcode/lob`.

Upstream inspiration:
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt).

## Status

| Layer | State |
| --- | --- |
| v0 Skill + paste-back | Shipped (`.agents/skills/lob/`) |
| v1 Keystroke driver | Shipped (`tools/lob-driver.mjs`, macOS Control+ / Windows Alt+) |
| v2 Mailbox / memory | Started (`lob.config.json`, vault helpers) |
| v3 Read-only workspace MCP | Optional (`mcp/`, tunnel helper) |

## What we keep from C2C

- **Division of labor.** Chat owns plan + independent review. Codex owns
  edit / shell / git / tests.
- **Tiny control messages.** `[C2C]` state headers under ~1 KB. No dumping
  the whole diff into the composer when you can avoid it.
- **Optional read-only MCP.** Chat can attach a custom connector to pull
  selective diffs/files. Not required for the happy path.

## What we change

| Original C2C | Lob (desktop take) |
| --- | --- |
| Codex drives nested `chatgpt.com` via in-app browser | Codex and Chat are modes in the same desktop app |
| Mouse / DOM automation for connectors and chat | Mode keybinds + clipboard paste (human or driver) |
| Skill hides tunnels/ports from the user | Skill focuses on draft → paste → execute PLAN |
| One long-lived web ChatGPT thread | One pinned **cloud** Chat thread (no local folder) + one Codex project with the repo mounted |

## Control plane

Documented desktop shortcuts (Settings → Keyboard Shortcuts; remappable):

- macOS: `⌃1` Chat · `⌃2` Work · `⌃3` Codex
- Windows / Linux: `Alt+1` · `Alt+2` · `Alt+3`

Mode keys only flip the tab. Bind the repo with `--path` on the loop (or `$lob` path + goal). Do not click the sidebar every hop.

Loop:

1. You give `--goal` and `--path` once (`--boot` on a new Chat thread).
2. The driver pastes INIT into Chat (~1s focus burst).
3. Chat replies PLAN; the loop pastes that into Codex.
4. Codex writes `<repo>/.lob/executed.json`; the loop pastes EXECUTED back to Chat.
5. Chat replies DONE, another PLAN, or BLOCKED.

Protocol templates: [`.agents/skills/lob/references/protocol.md`](../.agents/skills/lob/references/protocol.md).

## Data plane

1. **Default:** Chat never sees the repo unless you paste a short brief.
2. **Optional:** workspace MCP over HTTPS so Chat can `git_diff` / `read_file`.
3. **Mailbox / memory:** durable notes outside the Chat connector (repo MCP stays read-only).

Do not use **Work** as the planner if the goal is Chat conversation quota.

## Protocol (same states)

```
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

## Install / invoke

See [install.md](install.md) and [usage.md](usage.md).

- Open this repo as a Codex project → skill auto-loads from `.agents/skills`.
- Or copy to `~/.agents/skills/lob` for all projects.
- Invoke: `$lob` or “Use Lob to …”.

## Credit

Upstream project: MIT, unofficial, not affiliated with OpenAI. Same applies
here.

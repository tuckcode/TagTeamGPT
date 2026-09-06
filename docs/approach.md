# Lob — desktop-app approach

Personal take on the “ChatGPT thinks, Codex works” split, adapted for the
unified ChatGPT desktop app (Chat · Work · Codex in one window).

**Chat lobs. Codex dunks.** Product: **Lob**. Invoke with `$lob`.
See [PRODUCT.md](../PRODUCT.md), [install.md](install.md), [usage.md](usage.md).

Upstream inspiration:
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt).

| Original C2C | Lob (desktop take) |
| --- | --- |
| Codex drives nested `chatgpt.com` via in-app browser | Codex and Chat are modes in the same desktop app |
| Mouse / DOM automation for connectors and chat | Mode keybinds + clipboard paste (human or driver) |
| Skill hides tunnels/ports from the user | Skill focuses on draft → paste → execute PLAN |
| One long-lived web ChatGPT thread | One pinned **cloud** Chat thread (no local folder) + one Codex project with the repo mounted |

Protocol templates: [`.agents/skills/lob/references/protocol.md`](../.agents/skills/lob/references/protocol.md).

Upstream: MIT, unofficial, not affiliated with OpenAI. Same applies here.

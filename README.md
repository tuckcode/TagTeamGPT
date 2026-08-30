# CodexGPT

Chat plans. Codex ships. One desktop app.

This is my take on the split-brain idea from
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt):
use **Chat** in the ChatGPT desktop app as the planning and review brain, and
**Codex** in the same app as the hands — without nesting `chatgpt.com` inside
a browser and hunting UI with the mouse.

## The idea

Original C2C moves planning onto ChatGPT web quota while Codex keeps
execution. The hard part on desktop is the glue: their Skill automates the
web ChatGPT UI through an in-app browser.

On the unified ChatGPT desktop app (Chat · Work · Codex), we already have
both surfaces in one window. Official mode shortcuts:

| Platform | Chat / Work / Codex |
| --- | --- |
| macOS | `Control+1` · `Control+2` · `Control+3` |
| Windows / Linux | `Alt+1` · `Alt+2` · `Alt+3` |

**Control plane:** clipboard + those keybinds (paste a tiny `[C2C]` message
into Chat, switch back to Codex). Prefer keyboard over mouse Computer Use.

**Data plane (optional):** keep the original read-only MCP bridge so Chat can
pull files/diffs itself — or start semi-manual and paste only what Chat needs.

Stay on **Chat**, not Work. Work follows Codex-style usage; the quota win only
holds if the planner is Chat.

## Run this site

Interactive write-up of the approach:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Repo layout

```
src/                 Next.js explainer UI
docs/approach.md     Design notes for the desktop-app take
README.md            This file
```

## Credit

Inspired by [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt)
(MIT). This repo is not a fork of that bridge; it documents an alternate
control plane aimed at the ChatGPT desktop app. Not affiliated with OpenAI.

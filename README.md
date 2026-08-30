# CodexGPT

Chat plans. Codex ships. One desktop app.

This is my take on the split-brain idea from
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt):
use **Chat** in the ChatGPT desktop app as the planning and review brain, and
**Codex** in the same app as the hands — without nesting `chatgpt.com` inside
a browser and hunting UI with the mouse.

## Status: v0 Skill shipped (semi-auto)

A Codex Skill lives at [`.agents/skills/codexgpt/`](.agents/skills/codexgpt/).
Codex drafts `[C2C]` stubs; **you** switch to Chat, paste, and paste the reply
back. No Computer Use keybind automation yet. No MCP / `c2c` bridge yet.

## Install

**In this repo (recommended):** open CodexGPT as a Codex project in the
ChatGPT desktop app. Codex loads skills from `.agents/skills` automatically.

**All projects:** copy the skill folder into your user skills dir:

```bash
mkdir -p ~/.agents/skills
cp -R .agents/skills/codexgpt ~/.agents/skills/codexgpt
```

Restart Codex if the skill does not appear. Invoke with `$codexgpt` or say
“Use CodexGPT to …”.

## Usage (v0 paste-back loop)

1. In **Codex**, run `$codexgpt` (or “Use CodexGPT to implement X”).
2. Copy the boot prompt (first time) into a pinned **Chat** thread.
3. Copy each `INIT` / `EXECUTED` stub → switch to Chat (`⌃1` / `Alt+1`) →
   paste → send.
4. Paste Chat’s `PLAN` / `DONE` / `BLOCKED` reply back into Codex.
5. Codex executes the plan with its own harness and emits the next stub.

| Platform | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `Control+1` | `Control+2` | `Control+3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Stay on **Chat**, not Work. Work follows Codex-style usage; the quota win only
holds if the planner is Chat.

## What’s deferred

- **v1:** Computer Use for mode keybind + paste only (still no nested web UI)
- **Later:** optional upstream `c2c` read-only MCP so Chat can pull diffs itself

## Explainer site

Interactive write-up of the approach:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Repo layout

```
.agents/skills/codexgpt/   v0 Codex Skill (SKILL.md + protocol)
docs/approach.md           Design notes
src/                       Next.js explainer UI
README.md                  This file
```

## Credit

Inspired by [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt)
(MIT). This repo is not a fork of that bridge; it ships an alternate control
plane for the ChatGPT desktop app. Not affiliated with OpenAI.

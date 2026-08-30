# CodexGPT

Chat plans. Codex ships. One desktop app.

The v0 desktop paste-back skill was smoke-tested on 2026-08-30.
The v1 keystroke driver was smoke-tested on 2026-08-30.

This is my take on the split-brain idea from
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt):
use **Chat** in the ChatGPT desktop app as the planning and review brain, and
**Codex** in the same app as the hands — without nesting `chatgpt.com` inside
a browser and hunting UI with the mouse.

## Status: v1 keystroke driver (macOS)

A Codex Skill lives at [`.agents/skills/codexgpt/`](.agents/skills/codexgpt/).
The macOS driver at [`tools/codexgpt-driver.mjs`](tools/codexgpt-driver.mjs)
flips Chat/Codex with hotkeys and pastes `[C2C]` stubs — no vision, no nested
`chatgpt.com`. Fall back to manual paste-back if Accessibility is denied.

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

## Usage (v1 driver)

```bash
# Switch modes (macOS Control+1/2/3)
node tools/codexgpt-driver.mjs to chat
node tools/codexgpt-driver.mjs to codex

# Paste + Enter into the current mode
node tools/codexgpt-driver.mjs send "hello"

# Switch to Chat, paste a stub, send
node tools/codexgpt-driver.mjs chat-send "$(cat <<'EOF'
[C2C]
STATE: INIT
TASK_ID: c2c_demo
ITERATION: 0

GOAL:
…
EOF
)"
```

Needs the ChatGPT desktop app running. Grant Accessibility to your terminal /
Cursor if macOS blocks keystrokes.

## Usage (v0 paste-back fallback)

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

## Roadmap

- **v0:** paste-back skill (done)
- **v1:** keystroke driver (done) — hotkeys + clipboard, no vision
- **v2:** Rhizome mailbox for token-efficient `[C2C]` notes
- **v3:** read-only workspace MCP ([`mcp/`](mcp/)) so Chat pulls diffs over a HTTPS connector

## MCP connector (v3, optional)

Default loop is paste-back only. Turn the connector on when Chat should pull
selective diffs/files itself (see skill “When to use the connector”).

```bash
cd mcp && npm install
export CODEXGPT_ROOT="$(cd .. && pwd)"
export CODEXGPT_MCP_TOKEN="$(openssl rand -hex 24)"
npm start
# tunnel http://127.0.0.1:8743 → HTTPS, connector URL …/mcp, Bearer token
```

See [`mcp/README.md`](mcp/README.md).

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

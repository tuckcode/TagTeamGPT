# TagTeamGPT

![TagTeamGPT — Plan in Chat. Build in Codex.](docs/tagteamgpt-banner.png)

<div align="center">

### Plan in Chat. Build in Codex.

**A desktop-native Chat ↔ Codex relay for one goal, one repo, and far less tab wrangling.**

[Get started](#quick-start) · [See the workflow](#how-it-works) · [Read the docs](#documentation)

</div>

---

TagTeamGPT pairs the two sides of the ChatGPT desktop app around a clean division of labor:

- **Chat** plans, reasons, and reviews.
- **Codex** edits files, runs commands, and tests the result.
- **TagTeamGPT** carries the goal between them with small `[C2C]` handoff messages.

No nested `chatgpt.com` session. No full-diff clipboard dumps. No hunting through tabs on every turn.

> [!NOTE]
> TagTeamGPT is an independent open-source project inspired by [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt). It is not affiliated with OpenAI.

## Why TagTeamGPT?

| Without the relay | With TagTeamGPT |
| --- | --- |
| Planning and implementation compete for the same context | Chat owns the plan; Codex owns execution |
| Large diffs are pasted back and forth | Compact state messages keep the loop moving |
| Every handoff means finding the right window and project | Desktop mode shortcuts handle the switch |
| The planner is blind to the repo unless you paste everything | An optional read-only MCP lets Chat inspect selected files and diffs |

## How it works

```text
You → Chat plans → Codex executes → Chat reviews
         ↑                            │
         └──── revise or finish ──────┘
```

Under the hood, the loop uses a small state protocol:

```text
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

The default transport is deliberately simple: ChatGPT desktop mode keybinds plus clipboard handoffs. The optional driver automates those brief switches, and `.lob/executed.json` provides a durable signal that Codex finished its turn.

## Quick start

### 1. Install the skill

```bash
git clone https://github.com/tuckcode/TagTeamGPT.git
cd TagTeamGPT
mkdir -p ~/.agents/skills
cp -R .agents/skills/tagteam ~/.agents/skills/tagteam
```

Then invoke it from a **Codex** composer:

```text
$tagteam
```

You can also say `Use TagTeamGPT to …` and provide the goal plus the path to your repo.

### 2. Set up the desktop modes

| Mode | Role | Setup |
| --- | --- | --- |
| **Chat** | Planner and reviewer | Use a plain cloud thread with no local folder |
| **Codex** | Executor | Mount the repo you want to change |
| **Work** | Not part of the loop | Keep planning in Chat |

> [!IMPORTANT]
> Local folder projects do not support Chat. Keep the planner in a cloud Chat thread and mount the target folder in Codex.

### 3. Run the loop

```bash
node tools/lob-loop.mjs \
  --goal "Describe the outcome you want" \
  --path /path/to/your/repo \
  --boot
```

The loop hands the goal to Chat, sends the resulting plan to Codex, and returns execution results for review until Chat responds with `DONE` or `BLOCKED`.

## Desktop shortcuts

| Platform | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `Control+1` | `Control+2` | `Control+3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Mode shortcuts switch the active surface; they do not select a Codex project. Always pass `--path` and confirm that Codex is operating in the intended git root.

## What ships today

| Layer | Status | Purpose |
| --- | --- | --- |
| `$tagteam` skill + protocol | **Shipped** | Manual, reliable Chat ↔ Codex handoffs |
| Keystroke driver + auto-loop | **Shipped** | Automated desktop switching on macOS and Windows |
| Mailbox and memory helpers | **In progress** | Durable receipts and goal notes |
| Read-only workspace MCP | **Optional** | Selective repo visibility for Chat |

The manual copy-and-paste workflow remains available even when the driver or MCP is not configured.

## Optional tooling

```bash
# Switch to Chat with the desktop driver
node tools/lob-driver.mjs to chat

# Start the automated relay
node tools/lob-loop.mjs --goal "…" --path /path/to/your/repo --boot

# Start the optional read-only workspace connector
node tools/lob-mcp-up.mjs start
```

## Documentation

| Guide | What it covers |
| --- | --- |
| [Install](docs/install.md) | Skill installation and desktop setup |
| [Usage](docs/usage.md) | Manual handoffs, driver, auto-loop, and MCP |
| [Loop](docs/loop.md) | The complete state loop |
| [Troubleshooting](docs/troubleshooting.md) | Folder banner, Work mode, and working-directory traps |
| [Approach](docs/approach.md) | Design decisions and architecture |
| [MCP](mcp/README.md) | Optional read-only workspace connector |

## Explainer site

This repository also includes a Next.js explainer site:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Project principles

1. Chat owns planning and independent review; Codex owns implementation and verification.
2. Handoffs stay compact—send state and intent, not an entire diff.
3. The core loop works without MCP or browser automation.
4. Human attention is required whenever the loop reaches `BLOCKED`.
5. The workspace connector stays read-only.

## Credit

Inspired by the MIT-licensed [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt). TagTeamGPT is a separate desktop-keybind and clipboard implementation.

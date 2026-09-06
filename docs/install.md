# Install CodexGPT

Goal: get the skill into **ChatGPT desktop Codex**, then set up Chat and Codex the right way.

## What you need

- ChatGPT desktop app (Chat · Work · Codex in one window)
- A coding project folder you can mount in Codex
- Optional: Node.js 20+ if you want the keystroke driver (macOS + Windows), auto-loop, or MCP helper

## 1. Get the code

```bash
git clone https://github.com/tuckcode/CodexGPT.git
cd CodexGPT
```

If the repo lives in a nested folder on your machine, `cd` into the package that contains `.agents/skills/codexgpt`.

## 2. Install the skill

Pick one:

### A. Use this repo as a Codex project (simplest)

1. Open ChatGPT desktop → **Codex**.
2. Add / open this repo as a **project** (folder mounted).
3. Codex loads skills from `.agents/skills/` automatically.

### B. Install for all Codex projects

```bash
mkdir -p ~/.agents/skills
cp -R .agents/skills/codexgpt ~/.agents/skills/codexgpt
```

Restart Codex or reopen the project if `$codexgpt` does not appear.

### Invoke

In a **Codex** composer, type:

```text
$codexgpt
```

or say: `Use CodexGPT to …`

> Note: `$` is ChatGPT **Codex** skill syntax. Cursor’s `/` picker is a different system.

## 3. Wire Chat and Codex (critical)

ChatGPT **local folder projects do not support Chat**. You will see a banner like:

> Local projects don't support Chat.

Do this instead:

| Mode | Setup |
| --- | --- |
| **Chat** | Plain **cloud** thread — **no** local folder attached |
| **Codex** | Your real project folder **mounted** |
| **Work** | Do **not** use as planner or executor |

Pin **one Chat thread** per goal. Name it something obvious (e.g. `PLANNER`) so you do not paste into the wrong place.

### Mode shortcuts

| OS | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `Control+1` | `Control+2` | `Control+3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Remap in Settings → Keyboard Shortcuts if needed.

**Do not re-press Chat’s shortcut when you are already in Chat** — on macOS `Control+1` can open **New chat** and abandon your pinned planner thread.

## 4. Optional: keystroke driver (macOS + Windows)

From the repo root, with ChatGPT desktop running:

```bash
node tools/codexgpt-driver.mjs to chat
node tools/codexgpt-driver.mjs to codex
```

- **macOS:** grant **Accessibility** to your terminal (or Cursor) if keystrokes are blocked. Uses `Control+1/2/3`.
- **Windows:** focuses the ChatGPT window and sends `Alt+1/2/3` + Ctrl+V. Mode verify is limited; confirm the right thread by eye.
- **Timing** (defaults; raise on slow machines): `CODEXGPT_FOCUS_MS=200`, `CODEXGPT_MODE_SETTLE_MS=350`, `CODEXGPT_PASTE_MS=120`, `CODEXGPT_ENTER_MS=250`. Same keys may live in `.codexgpt/config.json`.

`ok: true` means keys fired, not accepted. After send the driver restores your previous front app (especially macOS). Do not re-press `Control+1` / `Alt+1` when already in Chat.

Manual copy/paste always works without the driver.

## 5. Optional: MCP connector

Default loop does **not** need MCP. Add it only when Chat should pull diffs/files itself.

See [mcp/README.md](../mcp/README.md) and `node tools/codexgpt-mcp-up.mjs start`.

## Sanity check

1. Codex: `$codexgpt` is recognized.
2. Chat: cloud thread, no folder banner.
3. Codex: `pwd` is your real git root (not `~/Documents/Codex/…` snapshot).
4. Hotkeys flip Chat ↔ Codex.

Next: [Usage](usage.md).

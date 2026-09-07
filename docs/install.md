# Install TagTeamGPT

Goal: get the skill into **ChatGPT desktop Codex**, then set up Chat and Codex the right way.

The product is **TagTeamGPT**. Invoke with `$tagteam`. Clone: `tuckcode/TagTeamGPT`.

## What you need

- ChatGPT desktop app (Chat · Work · Codex in one window)
- A coding project folder you can mount in Codex
- Optional: Node.js 20+ if you want the keystroke driver (macOS + Windows), auto-loop, or MCP helper

## 1. Get the code

```bash
git clone https://github.com/tuckcode/TagTeamGPT.git
cd TagTeamGPT
```

If the repo lives in a nested folder on your machine, `cd` into the package that contains `.agents/skills/tagteam`.

## 2. Install the skill

Pick one:

### A. Use this repo as a Codex project (simplest)

1. Open ChatGPT desktop → **Codex**.
2. Add / open this repo as a **project** (folder mounted).
3. Codex loads skills from `.agents/skills/` automatically.

### B. Install for all Codex projects

```bash
mkdir -p ~/.agents/skills
cp -R .agents/skills/tagteam ~/.agents/skills/tagteam
```

Restart Codex or reopen the project if `$tagteam` does not appear.

If you previously copied `$codexgpt` or `$lob`, delete those skill folders and copy `.agents/skills/tagteam` instead.

### Invoke

In a **Codex** composer, type:

```text
$tagteam
```

or say: `Use TagTeamGPT to …`

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

**Mode ≠ project.** `Control+3` / `Alt+3` only flips the Codex tab. Bind the folder with `--path` (or `$tagteam` path + goal). Do not click the sidebar every hop. The folder must already be a Codex project from install.

## 4. Optional: keystroke driver (macOS + Windows)

From the repo root, with ChatGPT desktop running:

```bash
node tools/lob-driver.mjs to chat
node tools/lob-loop.mjs --goal "…" --path /path/to/your/repo --boot
```

- **macOS:** grant **Accessibility** to your terminal (or Cursor) if keystrokes are blocked. Uses `Control+1/2/3`.
- **Windows:** finds the ChatGPT HWND, verifies foreground, then sends `Alt+1/2/3` + Ctrl+V. Aborts with `FOCUS_LOST` instead of pasting into the wrong app. Mode verify is limited; confirm the right thread by eye.
- **Timing** (defaults; raise on slow machines): `LOB_FOCUS_MS=200`, `LOB_MODE_SETTLE_MS=350`, `LOB_PASTE_MS=120`, `LOB_ENTER_MS=250`. Windows focus retries: `LOB_FOCUS_RETRIES=4`, `LOB_FOCUS_RETRY_MS=40`. Same keys may live in `lob.config.json` or `.lob/config.json`.
- **OCR/vision** is off by default (`LOB_OCR=1` / `--verify-vision` only when stuck). Happy path is keystrokes.
- **Auto-loop** reads Chat from `.lob/last-reply.json` (`submit_c2c`), not Select-All scrape.

`ok: true` means keys fired, not accepted (next `[C2C]` STATE or `.lob/executed.json`). `chat-send` / `codex-send` need a `[C2C]` payload; clipboard is read back before paste. `codex-send` fires the Codex hotkey and paste in one step. After send the driver restores your previous front app (especially macOS). Do not re-press `Control+1` / `Alt+1` when already in Chat; `--force-mode` only when you mean it (New chat risk).

Manual copy/paste always works without the driver.

## 5. Optional: MCP connector

Default loop does **not** need MCP. Add it only when Chat should pull diffs/files itself.

See [mcp/README.md](../mcp/README.md) and `node tools/lob-mcp-up.mjs start`.
Name the ChatGPT connector **`tagteam-workspace`** (rename or replace an old
`codexgpt-workspace` entry). Enable it on the Chat thread via the `+` menu.

## Sanity check

1. Codex: `$tagteam` is recognized.
2. Chat: cloud thread, no folder banner.
3. Codex: sidebar shows **this goal’s** mounted folder; `pwd` is your real git root (not `~/Documents/Codex/…` snapshot).
4. Hotkeys flip Chat ↔ Codex.

Next: [Usage](usage.md).

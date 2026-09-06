# Keyboard workflow (happy path)

No nested `chatgpt.com`. No mouse hunting. No CUA required to *send*.

Driver: `tools/codexgpt-driver.mjs` — macOS (`Control+1/2/3`, ⌘V) and Windows
(`Alt+1/2/3`, Ctrl+V).

## Modes

| OS | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `⌃1` | `⌃2` (avoid as planner) | `⌃3` |
| Win/Linux | `Alt+1` | `Alt+2` | `Alt+3` |

One **pinned Chat thread** per goal. Do not open New chat between INIT / PLAN / EXECUTED / DONE.

**Local folder projects do not support Chat.** Chat = cloud thread (no folder).
Mount the **goal repo** only under **Codex**. Banner: “Local projects don't support Chat.”

**Mode ≠ project.** `⌃3` / `Alt+3` only flips the tab. Click the mounted folder
for this goal before `codex-send` — do not assume the last sidebar project.

## Send (blind keystrokes)

Driver / human:

1. Mode hotkey (`⌃1` / `Alt+1`) → clipboard = `[C2C]` stub → paste → Enter  
2. Wait for Chat’s `[C2C]` reply (eyes or copy icon)  
3. On PLAN: ensure a **live Codex thread under the mounted project** is open
   (not an empty “Continue current work” stub) → Codex hotkey only if not already
   Codex → paste plan + short “execute this” → Enter  
4. When Codex finished: write `.codexgpt/executed.json` (or poll marker)  
5. Chat hotkey → paste EXECUTED stub → Enter  
6. On DONE/BLOCKED: copy reply →  
   `pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard` (macOS) or  
   `Get-Clipboard -Raw | node tools/codexgpt-write-reply.mjs --from-clipboard` (Windows)

`ok: true` from the driver means **keys fired**, not “Chat/Codex accepted.”
Confirmation is the next `[C2C]` STATE or `.codexgpt/executed.json`.
After send, the driver restores the previous front app (especially macOS).

`chat-send` / `codex-send` require `[C2C]` at the start; clipboard is set then
read back before paste.

The driver **skips** the mode hotkey when already in the target mode.
**Do not re-press ⌃1 / Alt+1 while already in Chat** — it can open **New chat**
and leave the pinned thread. Prefer `send` / `chat-send` / `codex-send` without
`--force-mode`. `enter` sends Enter only when the composer is already focused.

Timing defaults: `CODEXGPT_FOCUS_MS=200`, `CODEXGPT_MODE_SETTLE_MS=350`,
`CODEXGPT_PASTE_MS=120`, `CODEXGPT_ENTER_MS=250` (or `.codexgpt/config.json`).

Optional `--verify` for mode read-back — often opaque on Electron; Windows UIA is
best-effort. **OCR/vision is off by default** (`CODEXGPT_OCR=1` or
`--verify-vision` only when `--verify` fails twice / mode unknown; one mode-chip
crop; abort if OCR says Work).

**Work contamination:** if the UI shows “Continued in Work” after a handoff,
that is a **failure**. Work is not the planner and not the executor. Retry in
**Codex** under the mounted project thread. The driver returns `MODE_DRIFT`
when post-paste mode is not the target.

## Do not

- Use Work for planning  
- Depend on AX scrape (Electron often empty → `NO_STATE`)  
- Use CUA/screenshots/OCR on the happy path (slow; OCR only when stuck)  
- Paste full diffs into Chat when the workspace MCP can `git_diff` / `read_file`

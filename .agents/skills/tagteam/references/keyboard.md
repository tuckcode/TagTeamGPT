# Keyboard workflow (happy path)

No nested `chatgpt.com`. No mouse hunting. No CUA required to *send*.

Driver: `tools/tagteam-driver.mjs` — macOS (`Control+1/2/3`, ⌘V) and Windows
(`Alt+1/2/3`, Ctrl+V).

## Modes

| OS | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `⌃1` | `⌃2` (avoid as planner) | `⌃3` |
| Win/Linux | `Alt+1` | `Alt+2` | `Alt+3` |

One **pinned Chat thread** per goal. Do not open New chat between INIT / PLAN / EXECUTED / DONE.

**Local folder projects do not support Chat.** Chat = cloud thread (no folder).
Mount the **goal repo** only under **Codex**. Banner: “Local projects don't support Chat.”

**Mode ≠ project.** `⌃3` / `Alt+3` only flips the tab. Bind the repo with
`--path` on the loop (or `$tagteam` path + goal). Do not click the sidebar every hop.

## Send (blind keystrokes)

Driver / human:

1. Mode hotkey (`⌃1` / `Alt+1`) → clipboard = `[C2C]` stub → paste → Enter  
2. Wait for Chat’s `[C2C]` reply (eyes or copy icon)  
3. On PLAN: ensure a **live Codex thread under the mounted project** is open
   (not an empty “Continue current work” stub) → Codex hotkey only if not already
   Codex → paste plan + short “execute this” → Enter  
4. When Codex finished: write `.tagteam/executed.json` (or poll marker)  
5. Chat hotkey → paste EXECUTED stub → Enter  
6. On DONE/BLOCKED: copy reply →  
   `pbpaste | node tools/tagteam-write-reply.mjs --from-clipboard` (macOS) or  
   `Get-Clipboard -Raw | node tools/tagteam-write-reply.mjs --from-clipboard` (Windows)

`ok: true` from the driver means **keys fired**, not “Chat/Codex accepted.”
Confirmation is the next `[C2C]` STATE or `.tagteam/executed.json`.
After send, the driver restores the previous front app. Paste aborts with `FOCUS_LOST` instead of landing in whatever was front if ChatGPT is not frontmost at Cmd+V / Ctrl+V.

OS research (Windows `SendInput` done; next Mac flake path is HID `CGEvent`): [docs/hardening.md](../../../../docs/hardening.md).

**Windows focus lock.** Before Alt+1/3 / Ctrl+V / Enter, the driver finds the ChatGPT desktop HWND (process + top-level window, not a title-only guess), brings it foreground, and checks `GetForegroundWindow`. Chords are an atomic `SendInput` array with key-up, from STA PowerShell — not `SendKeys` (that leaves Alt stuck). If ChatGPT is missing or never actually focused, it **aborts** — it will not paste into whatever you were using. Retries are for focus only, never a second paste. After Enter, it restores the previous window. `TAGTEAM_FOCUS_RETRIES` (default 4) and `TAGTEAM_FOCUS_RETRY_MS` (default 40). `--debug` or `TAGTEAM_DEBUG=1` logs HWNDs and each step.

**macOS focus lock.** `AXRaise` the named ChatGPT window, then poll `frontmost` instead of hoping a fixed delay is enough (`activate` returns before the app is front). Abort `FOCUS_LOST` before Control+1/3, ⌘V, or Enter if ChatGPT is not actually front. Clipboard is set before the focus steal. Paste stays clipboard + ⌘V.

**Focus bursts, not a held window.** A send steals ChatGPT for ~1s (focus → paste → Enter → restore). Chat and Codex keep generating while unfocused. Codex completion is `.tagteam/executed.json` (no focus). Chat’s reply is `.tagteam/last-reply.json` via MCP `submit_c2c` — not Select-All scrape. The loop does not sit on ChatGPT waiting for generation.

`chat-send` / `codex-send` require `[C2C]` at the start; clipboard is set then
read back before paste. `codex-send` fires the Codex hotkey and paste in one
step.

The driver **skips** the mode hotkey when already in the target mode.
**Do not re-press ⌃1 / Alt+1 while already in Chat** — it can open **New chat**
and leave the pinned thread. Prefer `send` / `chat-send` / `codex-send` without
`--force-mode`. `enter` sends Enter only when the composer is already focused.

Timing defaults: `TAGTEAM_FOCUS_MS=200`, `TAGTEAM_MODE_SETTLE_MS=350`,
`TAGTEAM_PASTE_MS=120`, `TAGTEAM_ENTER_MS=250`, Windows `TAGTEAM_FOCUS_RETRIES=4` /
`TAGTEAM_FOCUS_RETRY_MS=40` (or `tagteam.config.json` / `.tagteam/config.json`).

Optional `--verify` for mode read-back — often opaque on Electron; Windows UIA is
best-effort. **OCR/vision is off by default** (`TAGTEAM_OCR=1` or
`--verify-vision` only when `--verify` fails twice / mode unknown; one mode-chip
crop; abort if OCR says Work).

**Work contamination:** if the UI shows “Continued in Work” after a handoff,
that is a **failure**. Work is not the planner and not the executor. Retry in
**Codex** under the mounted project thread. The driver returns `MODE_DRIFT`
when post-paste mode is not the target.

## Do not

- Use Work for planning  
- Select-All / AX-scrape the Chat thread (loop reads `.tagteam/last-reply.json`)  
- Use CUA/screenshots/OCR on the happy path (slow; OCR only when stuck)  
- Paste full diffs into Chat when the workspace MCP can `git_diff` / `read_file`

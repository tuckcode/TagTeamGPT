# Keyboard workflow (happy path)

No nested `chatgpt.com`. No mouse hunting. No CUA required to *send*.

## Modes

| OS | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `⌃1` | `⌃2` (avoid as planner) | `⌃3` |
| Win/Linux | `Alt+1` | `Alt+2` | `Alt+3` |

One **pinned Chat thread** per goal. Do not open New chat between INIT / PLAN / EXECUTED / DONE.

**Local folder projects do not support Chat.** Chat = cloud thread (no folder).
Mount the repo only under **Codex**. Banner: “Local projects don't support Chat.”

## Send (blind keystrokes)

Driver / human:

1. `⌃1` → clipboard = `[C2C]` stub → paste → Enter  
2. Wait for Chat’s `[C2C]` reply (eyes or copy icon)  
3. On PLAN: ensure a **live Codex thread under the mounted project** is open
   (not an empty “Continue current work” stub) → `⌃3` only if not already
   Codex → paste plan + short “execute this” → Enter  
4. When Codex finished: write `.codexgpt/executed.json` (or poll marker)  
5. `⌃1` → paste EXECUTED stub → Enter  
6. On DONE/BLOCKED: copy reply →  
   `pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard`

`ok: true` from the driver means **keys fired**, not “Chat/Codex accepted.”
Confirmation is the next `[C2C]` STATE or a file side-effect
(`demo/…`, `.codexgpt/executed.json`).

The driver **skips** the mode hotkey when already in the target mode.
**Do not re-press ⌃1 while already in Chat** — it can open **New chat** and
leave the pinned thread. Prefer `send` / `chat-send` without `--force-mode`.
`--force-mode` re-fires the hotkey only when intentional.

**Work contamination:** if the UI shows “Continued in Work” after a handoff,
that is a **failure**. Work is not the planner and not the executor. Retry in
**Codex** under the mounted project thread. The driver returns `MODE_DRIFT`
when post-paste mode is not the target.

## Do not

- Use Work for planning  
- Depend on AX scrape (Electron often empty → `NO_STATE`)  
- Use CUA/screenshots on the happy path (slow; only when stuck)  
- Paste full diffs into Chat when the workspace MCP can `git_diff` / `read_file`

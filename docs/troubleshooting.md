# Troubleshooting

## “Local projects don't support Chat.”

**Cause:** You attached a local folder to Chat.

**Fix:** Keep Chat as a **cloud** thread with **no** folder. Mount the repo only under **Codex**.

## Chat plans keep landing in Work (“Continued in Work”)

**Cause:** Work mode was used as planner/executor.

**Fix:** Treat that as a failed handoff. Go back to **Codex** under the mounted project thread. Never use Work for TagTeamGPT planning.

## `$tagteam` does nothing / skill missing

**Checks:**

1. Skill folder exists at `.agents/skills/tagteam` (project) or `~/.agents/skills/tagteam` (user).
2. You are in **Codex**, not Chat or Cursor.
3. You used **`$tagteam`**, not `/tagteam` (slash is Cursor).
4. Restart Codex / reopen the project.
5. If you still have `~/.agents/skills/codexgpt` or `~/.agents/skills/tagteam`, delete them and copy `.agents/skills/tagteam` instead.

## Codex says tests passed but files did not change in my repo

**Cause:** Codex cwd trap. The sidebar can show your project name while the shell is under a conversation snapshot like `~/Documents/Codex/YYYY-MM-DD/<thread>/`. Mode hotkeys also do **not** pick the project — the last sidebar folder stays selected.

**Fix:** In Codex, run `pwd` and confirm it matches your real git root before trusting `EXECUTED`.

## Re-pressing `Control+1` opened a New chat

**Cause:** Chat’s mode hotkey can create a new chat when already in Chat.

**Fix:** Stay on the pinned planner thread. Paste with `send` / `chat-send` without `--force-mode` unless you intend to fire the Chat hotkey (New chat risk).

## Driver reports `ok: true` but nothing happened in ChatGPT

**Cause:** The driver fired keystrokes; it does not prove ChatGPT accepted them. Common misses: wrong window focused, composer not focused, clipboard mismatch (payload did not round-trip), wrong Chat/Codex thread, Accessibility denied (macOS), or ChatGPT never received foreground (driver returns `FOCUS_LOST` and does **not** send ⌘V / Ctrl+V).

**Fix:** Click the intended thread so the composer is active. Grant Accessibility (macOS). Retry. Confirm by the next `[C2C]` **STATE** or `.tagteam/executed.json` — not `ok: true` alone. After paste the driver restores the previous front app — that is expected. Keep ChatGPT running (minimized is ok; the driver restores it). If you get `FOCUS_LOST`, retry; do not paste by hand into the wrong app. `TAGTEAM_DEBUG=1` prints the Windows HWND log.

## Auto-loop returns `NO_REPLY` or never sees Chat’s PLAN

**Cause:** The loop does not Select-All the Chat thread (Electron scrape is empty). It waits for Chat to call `submit_c2c`, which writes `.tagteam/last-reply.json`.

**Fix:** Attach the workspace MCP connector and tell Chat to call `submit_c2c` after PLAN/DONE. If that still misses, copy Chat’s `[C2C]` reply, then:

```bash
# macOS
pbpaste | node tools/tagteam-write-reply.mjs --from-clipboard
# Windows PowerShell
Get-Clipboard -Raw | node tools/tagteam-write-reply.mjs --from-clipboard
```

## Slow machine — paste lands wrong or mode switch races

**Fix:** Raise timing env vars (defaults): `TAGTEAM_FOCUS_MS`, `TAGTEAM_MODE_SETTLE_MS`, `TAGTEAM_PASTE_MS`, `TAGTEAM_ENTER_MS`. Focus retries (Windows `GetForegroundWindow` / macOS `frontmost` poll): `TAGTEAM_FOCUS_RETRIES`, `TAGTEAM_FOCUS_RETRY_MS`. Same keys may live in `tagteam.config.json` or `.tagteam/config.json`.

## Mode verify / OCR (stuck path only)

**Cause:** `--verify` read-back is optional; Electron often hides the mode chip. Windows UIA is best-effort.

**Fix:** Skip `--verify` on the happy path. If mode is unknown after two `--verify` failures, try `TAGTEAM_OCR=1` or `--verify-vision` (one crop of the mode chip). If OCR says **Work**, abort — never use Work as planner/executor. Do not reach for nested `chatgpt.com` / CUA unless you are truly stuck.

## MCP / tunnel attached but Chat still can’t read files

**Checks:**

1. Check the local root with `curl --fail --silent http://127.0.0.1:8743/health`.
2. Check the private tunnel with `curl --fail --silent http://127.0.0.1:8080/readyz`. Expect `ready`.
3. Select **TagTeamGPT Private** with `@` in the Chat thread. The old Cloudflare plugin uses a separate connection.
4. Ask Chat to call `workspace_info` first.

Use the [private connector instructions](private-connector.md) to restart the connection.
If the private plugin does not appear in a chat, select it before testing its tools.

## Thin PLAN (ACTIONS-only checklist)

**Fix:** Ask Chat to revise with `RATIONALE` and clear `SUCCESS_CRITERIA` before pasting into Codex.

## Quota confusion

Chat **text** chat is metered differently from **Codex / Work** agent usage. Planning in Chat is the point; planning in Work/Codex burns the coding pool. Limits change — check [OpenAI’s current Codex usage help](https://help.openai.com/en/articles/11369540-codex-and-chatgpt-plan-usage-limits).

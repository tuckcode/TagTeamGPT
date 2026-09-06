# Troubleshooting

## “Local projects don't support Chat.”

**Cause:** You attached a local folder to Chat.

**Fix:** Keep Chat as a **cloud** thread with **no** folder. Mount the repo only under **Codex**.

## Chat plans keep landing in Work (“Continued in Work”)

**Cause:** Work mode was used as planner/executor.

**Fix:** Treat that as a failed handoff. Go back to **Codex** under the mounted project thread. Never use Work for CodexGPT planning.

## `$codexgpt` does nothing / skill missing

**Checks:**

1. Skill folder exists at `.agents/skills/codexgpt` (project) or `~/.agents/skills/codexgpt` (user).
2. You are in **Codex**, not Chat or Cursor.
3. You used **`$codexgpt`**, not `/codexgpt`.
4. Restart Codex / reopen the project.

## Codex says tests passed but files did not change in my repo

**Cause:** Codex cwd trap. The sidebar can show project `codexgpt` while the shell is under a conversation snapshot like `~/Documents/Codex/YYYY-MM-DD/<thread>/`.

**Fix:** In Codex, run `pwd` and confirm it matches your real git root before trusting `EXECUTED`.

## Re-pressing `Control+1` opened a New chat

**Cause:** Chat’s mode hotkey can create a new chat when already in Chat.

**Fix:** Stay on the pinned planner thread. Paste with `send` / `chat-send` without forcing the mode key.

## Driver reports `ok: true` but nothing happened in ChatGPT

**Cause:** The driver fired keystrokes; it does not prove ChatGPT accepted them. Focus may be wrong, Accessibility denied, or the wrong session selected.

**Fix:** Click the intended Chat/Codex thread, grant Accessibility, retry. Confirm by looking for the next `[C2C]` reply.

## Auto-loop never sees Chat’s PLAN

**Cause:** Accessibility scrape of Electron UI often returns empty (`NO_STATE`).

**Fix:** Manually copy Chat’s `[C2C]` reply, then:

```bash
pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard
```

## MCP / tunnel attached but Chat still can’t read files

**Checks:**

1. Tunnel process still running (`node tools/codexgpt-mcp-up.mjs status`).
2. Connector URL matches the **current** tunnel (pasting a URL into chat does not rebind settings).
3. You are in a **Chat** cloud thread with Developer Mode / custom connector enabled.
4. Ask Chat to call `workspace_info` first.

## Thin PLAN (ACTIONS-only checklist)

**Fix:** Ask Chat to revise with `RATIONALE` and clear `SUCCESS_CRITERIA` before pasting into Codex.

## Quota confusion

Chat **text** chat is metered differently from **Codex / Work** agent usage. Planning in Chat is the point; planning in Work/Codex burns the coding pool. Limits change — check [OpenAI’s current Codex usage help](https://help.openai.com/en/articles/11369540-codex-and-chatgpt-plan-usage-limits).

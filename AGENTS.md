<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer ChatGPT desktop Chat↔Codex via mode keybinds and clipboard paste over nested `chatgpt.com` mouse Computer Use; prefer keystrokes over vision/CUA screenshots when driving that loop.
- Prefer the agent to verify or drive desktop workflows when possible instead of asking the user to try them manually (user should not become the copy-paster); driver `ok: true` means keys fired, not accepted — do not report Codex as executing from paste/mode alone; confirm the intended named Chat/Codex session is focused and working.
- For Lob, keep planning in the Chat tab only — never use Work as the planner or executor (“Continued in Work” after a handoff is a failure).
- Prefer continuing the same ChatGPT Chat thread across C2C loop turns instead of opening a new chat each iteration; name planner/executor threads distinctly (e.g. ChatGPT-PLANNER vs CODEX) so paste targets stay obvious.
- Never re-press Chat or Codex mode hotkeys (macOS ⌃1/⌃3, Windows/Linux Alt+1/Alt+3) when already in that mode — Chat’s ⌃1/Alt+1 can open New chat and abandon the pinned planner thread; paste with `send` / `chat-send` / `codex-send` without forcing the mode key.
- Prefer keyboard UI flows (filter/search, Tab, arrows) and a simple hotkey→paste→wait loop with short (~0.25s) buffers over mouse clicks; warn before focusing/pasting into ChatGPT so the user can select the right session.
- Prefer lazy in-flow mailbox nudges (note/time thresholds) over cron or scheduled jobs.
- For Lob, the product loop runs in ChatGPT desktop (Chat lobs, Codex dunks); Cursor/this agent is build-chat only (driver/loop/MCP tooling) — not product glue — and must not “prove” the loop by writing kata files here.
- Prefer substantive Chat plans (rationale and approach) over thin checklist-style ACTION lists; revise thin plans before Codex handoff.
- For visual/capacity challenges, Chat sees the reference photo and grades; Codex gets a word-only brief only — never the PNG or its path.
- When the workspace MCP/tunnel is unreachable, diagnose and restore it rather than parking or abandoning the C2C loop.
- After the coding ship, run follow-on passes the user cares about: critique, brainstorm, security harden, audit (not only smoke katas).

## Learned Workspace Facts

- Public product name is **Lob** (tagline: Chat lobs. Codex dunks.). Invoke in Codex with `$lob`. GitHub repo is `tuckcode/lob`. Desktop-app take on XiaoDuoYa/codex-with-chatgpt: Chat plans and reviews; Codex executes. End users run it in their own Codex-mounted repo — this checkout is only the tool's development tree.
- Control plane is `[C2C]` stubs plus mode keybinds/clipboard; desktop driver prefers a keystroke path without vision; no nested browser automation.
- Workspace MCP (`mcp/`) plus `tools/lob-*` give Chat optional read-only repo eyes via an HTTPS tunnel — not the Chat↔Codex bridge (that’s keybinds/clipboard/mailbox); paste-back works without MCP; mailbox is not on the Chat MCP surface; a new tunnel URL in a C2C message does not rebind ChatGPT’s connector — edit/reload connector settings when the URL changes.
- Codex mail/mailbox is the default durable handoff between Chat and Codex (prefer notes after build/inspection); promote lasting notes to Rhizome (standalone MD app, not Obsidian) — repo `AGENTS.md` alone is not enough for lasting product lessons.
- Shared agent skills canonicalize under `~/.agents/skills`; the in-repo Lob skill is `.agents/skills/lob` and is invoked in ChatGPT desktop Codex with `$lob` (or “Use Lob to …”) — not `gpt-lob`; `$` is not a Cursor skill picker (`/` is).
- Desktop mode shortcuts and keystroke driver: macOS `Control+1/2/3`, Windows/Linux `Alt+1/2/3` for Chat / Work / Codex (driver uses the same OS keys); driver `ok: true` means keys fired, not accepted (accepted is the next `[C2C]` STATE or `.lob/executed.json`); archive ChatGPT threads with ⇧⌘A (not ⌘A select-all).
- ChatGPT desktop: local folder projects do not support Chat — keep Chat as a plain cloud thread; mount the repo only in Codex for execution.
- Desktop Codex may still run with cwd under `~/Documents/Codex/YYYY-MM-DD/<thread>/` (conversation snapshot) even when the sidebar shows the intended project — verify `pwd` against the real git root before trusting EXECUTED. Mode hotkeys do not select the Codex project.
- Repo defaults live in `lob.config.json` (e.g. MCP idle auto-stop ~60m; mailbox nudge at ~10 notes or ~14 days).
- This repo also ships a Next.js explainer UI (`pnpm dev`, typically http://127.0.0.1:43127).
- Public GitHub home: `tuckcode/lob` (https://github.com/tuckcode/lob); Cursor Origin codebase remains `knispo/codexgpt`.
- ChatGPT desktop Chat and Codex can surface the same task across modes (Chat may expand Codex step logs via Show more; sidebars swap labels with mode keys) — paste-back does not fully isolate the two.

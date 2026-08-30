<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer ChatGPT desktop Chat↔Codex via mode keybinds and clipboard paste over nested `chatgpt.com` mouse Computer Use; prefer keystrokes over vision/CUA screenshots when driving that loop.
- Prefer the agent to verify or drive desktop workflows when possible instead of asking the user to try them manually (user should not become the copy-paster).
- For CodexGPT, keep planning in the Chat tab only — never use Work as the planner or executor (“Continued in Work” after a handoff is a failure).
- Prefer continuing the same ChatGPT Chat thread across C2C loop turns instead of opening a new chat each iteration.
- Prefer keyboard UI flows (filter/search, Tab, arrows) over mouse clicks when automating ChatGPT desktop.
- Prefer lazy in-flow mailbox nudges (note/time thresholds) over cron or scheduled jobs.
- For CodexGPT loop benchmarks, desktop **Codex** owns coding (edits/tests); Cursor/this agent owns glue (driver/loop/MCP) — do not “prove” the loop by writing the kata files here.
- Prefer substantive Chat plans (rationale and approach) over thin checklist-style ACTION lists; revise thin plans before Codex handoff.
- When the workspace MCP/tunnel is unreachable, diagnose and restore it rather than parking or abandoning the C2C loop.
- After the coding ship, run follow-on passes the user cares about: critique, brainstorm, security harden, audit (not only smoke katas).

## Learned Workspace Facts

- CodexGPT is a desktop-app take on XiaoDuoYa/codex-with-chatgpt: Chat plans and reviews; Codex executes.
- Control plane is `[C2C]` stubs plus mode keybinds/clipboard; desktop driver prefers a keystroke path without vision; no nested browser automation.
- Workspace MCP (`mcp/`) and `tools/codexgpt-*` (driver, loop, mailbox, MCP up) let Chat attach an HTTPS-tunneled connector; paste-back still works without it.
- Codex mail/mailbox is the default durable handoff between Chat and Codex; promote lasting notes to Rhizome (standalone MD app, not Obsidian).
- The Codex skill lives at `.agents/skills/codexgpt` and is invoked with `$codexgpt` (or “Use CodexGPT to …”).
- Desktop mode shortcuts: macOS `Control+1/2/3` and Windows/Linux `Alt+1/2/3` for Chat / Work / Codex.
- ChatGPT desktop: local folder projects do not support Chat — keep Chat as a plain cloud thread; mount the repo only in Codex for execution.
- Desktop Codex may still run with cwd under `~/Documents/Codex/YYYY-MM-DD/<thread>/` (conversation snapshot) even when the sidebar shows project `codexgpt` — verify `pwd` against the real git root before trusting EXECUTED.
- Repo defaults live in `codexgpt.config.json` (e.g. MCP idle auto-stop ~60m; mailbox nudge at ~10 notes or ~14 days).
- This repo also ships a Next.js explainer UI (`pnpm dev`, typically http://127.0.0.1:43127).
- Cursor Origin codebase for this project: `knispo/CodexGPT` (https://cursor.com/codebase/knispo/CodexGPT).

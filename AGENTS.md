<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer ChatGPT desktop Chat↔Codex via mode keybinds and clipboard paste over nested `chatgpt.com` mouse Computer Use.
- Prefer the agent to verify or drive desktop workflows when possible instead of asking the user to try them manually.
- For CodexGPT, keep planning in the Chat tab only — never use Work as the planner.

## Learned Workspace Facts

- CodexGPT is a desktop-app take on XiaoDuoYa/codex-with-chatgpt: Chat plans and reviews; Codex executes.
- v0 control plane is paste-back `[C2C]` stubs plus human mode switches; no nested browser automation; optional MCP/`c2c` bridge is deferred.
- The Codex skill lives at `.agents/skills/codexgpt` and is invoked with `$codexgpt` (or “Use CodexGPT to …”).
- Desktop mode shortcuts: macOS `Control+1/2/3` and Windows/Linux `Alt+1/2/3` for Chat / Work / Codex.
- This repo also ships a Next.js explainer UI (`pnpm dev`, typically http://127.0.0.1:43127).
- Cursor Origin codebase for this project: `knispo/CodexGPT` (https://cursor.com/codebase/knispo/CodexGPT).

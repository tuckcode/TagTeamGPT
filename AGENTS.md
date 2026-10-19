## TagTeamGPT working directory

Use `/Users/dtc/Documents/ChatGPT/TagTeamGPT` for TagTeamGPT product work on this machine.
Before editing or running tools, confirm that `git rev-parse --show-toplevel` returns that folder.
Read `docs/source-of-truth.md` there when comparing or retiring older copies.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Before any live desktop setup or handoff, read `docs/desktop-control.md`. Use guarded setup commands for UI changes and bound conversations for sends. Read-only snapshots may guide setup. If a guard fails, stop and preserve the draft. Resume only after the user explicitly authorizes continuation. Do not substitute raw CUA input, unguarded keystrokes, or direct UI navigation APIs during automated setup.

- Prefer ChatGPT desktop Chat↔Codex via mode keybinds and clipboard paste over nested `chatgpt.com` mouse Computer Use; prefer keystrokes over vision/CUA screenshots when driving that loop.
- Prefer the agent to verify or drive desktop workflows when possible instead of asking the user to try them manually (user should not become the copy-paster); auto-loop must not reconstruct Chat PLANs, Cmd+A the Chat thread, or ask the user to copy; during live loop tests, check Chat status promptly instead of sitting the full chat_wait once Chat has clearly replied or `submit_c2c` failed; driver `ok: true` means keys fired, not accepted — do not report Codex as executing from paste/mode alone; confirm the intended named Chat/Codex session is focused and working.
- For TagTeamGPT, keep planning in the Chat tab only — never use Work as the planner or executor (“Continued in Work” after a handoff is a failure).
- Prefer continuing the same ChatGPT Chat thread across C2C loop turns instead of opening a new chat each iteration; name planner/executor threads distinctly (e.g. ChatGPT-PLANNER vs CODEX) so paste targets stay obvious.
- For manual navigation, never repeat Chat's mode shortcut when Chat is already selected. Automated handoffs require a verified conversation binding. The guarded driver does not use mode shortcuts or standalone Enter.
- Prefer keyboard UI flows (filter/search, Tab, arrows) and a simple hotkey→paste→wait loop with short (~0.25s) buffers over mouse clicks; warn before focusing/pasting into ChatGPT so the user can select the right session; do not steal ChatGPT focus or paste while the user is typing — only send keys when they say to run.
- Prefer lazy in-flow mailbox nudges (note/time thresholds) over cron or scheduled jobs.
- For TagTeamGPT, the product loop runs in ChatGPT desktop (they switch, the goal doesn't); Cursor/this agent is build-chat only (driver/loop/MCP tooling) — not product glue — and must not “prove” the loop by writing kata files here. Do not describe paste landing in Cursor; `FOCUS_LOST` means abort rather than paste into whatever was front.
- Prefer substantive Chat plans (rationale and approach) over thin checklist-style ACTION lists; revise thin plans before Codex handoff. Chat is the planner (Soul High / smarter model) and Codex is the executor (Terra Mid Medium) — do not treat Chat as the cheap/dumb model.
- For visual/capacity challenges, Chat sees the reference photo and grades; Codex gets a word-only brief only — never the PNG or its path.
- When the workspace MCP/tunnel is unreachable, diagnose and restore it rather than parking or abandoning the C2C loop.
- Task/subagents must use Cursor Models only (Grok / Composer); do not pick Claude or Other Models when those are usage-capped.

## Learned Workspace Facts

- Public product name is **TagTeamGPT** (tagline: They switch. The goal doesn't.). Invoke in Codex with `$tagteam`. GitHub repo is `tuckcode/TagTeamGPT`. Internal on-disk paths are `tools/tagteam-*` / `.tagteam/` / `TAGTEAM_*`, renamed from the `lob` placeholder on 2026-09-20. `submit_c2c` is an MCP tool name and never contained `lob`, so the rename did not touch it; `.tagteam/last-reply.json` is only its internal write path. Desktop-app take on XiaoDuoYa/codex-with-chatgpt: Chat plans and reviews; Codex executes. End users run it in their own Codex-mounted repo — this checkout is only the tool's development tree.
- Control plane is `[C2C]` stubs plus mode keybinds/clipboard; desktop driver prefers a keystroke path without vision; no nested browser automation. Electron AX scrape of Chat bodies is empty and Cmd+C does not copy Electron webview selection — Chat files PLAN via MCP `submit_c2c` → `.tagteam/last-reply.json`, not clipboard scrape; Chat finishing on-screen ≠ loop accepted until that file updates. Composer disappearing / can’t type usually means Chat is still generating — `BLOCKED` is the finished `[C2C]` STATE.
- For connector installation, restart, or recovery, read `docs/private-connector.md` first. The verified plugin is **TagTeamGPT Private** through OpenAI Secure MCP Tunnel. Select it with `@` in Chat. Confirm the exact workspace with its `workspace_info` tool and a file read before reporting success. Keep local Bearer authentication enabled. The tunnel client supplies the key through a protected local header file. Keep keys and machine-specific tunnel IDs outside Git. The public Cloudflare helper manages a separate connection. The plugin lives on the user’s OpenAI account. If its tools are unavailable, ask the user to select it in the current chat.
- Codex mail/mailbox is the default durable handoff between Chat and Codex (prefer notes after build/inspection); promote lasting notes to Rhizome (standalone MD app, not Obsidian) — repo `AGENTS.md` alone is not enough for lasting product lessons.
- Shared agent skills canonicalize under `~/.agents/skills`; the in-repo TagTeamGPT skill is `.agents/skills/tagteam` and is invoked in ChatGPT desktop Codex with `$tagteam` (or “Use TagTeamGPT to …”); `$` is not a Cursor skill picker (`/` is).
- Desktop mode shortcuts and keystroke driver: macOS `Control+1/2/3`, Windows/Linux `Alt+1/2/3` for Chat / Work / Codex (driver uses the same OS keys). Input hardening source of truth: `docs/hardening.md` — Windows `SendInput` (not SendKeys) from STA with HWND focus lock; Mac polls `frontmost` and `AXRaise`s. No CUA/OCR/mouse/PostMessage. Retry focus only, never the whole paste. Driver `ok: true` means keys fired, not accepted (accepted is the next `[C2C]` STATE or `.tagteam/executed.json`); archive ChatGPT threads with ⇧⌘A (not ⌘A select-all).
- ChatGPT desktop: local folder projects do not support Chat — keep Chat as a plain cloud thread; mount the repo only in Codex for execution.
- Desktop Codex may still run with cwd under `~/Documents/Codex/YYYY-MM-DD/<thread>/` (conversation snapshot) even when the sidebar shows the intended project — verify `pwd` against the real git root before trusting EXECUTED. Mode hotkeys do not select the Codex project.
- Repo defaults live in `tagteam.config.json` (`mcp_idle_minutes: 0` so Quick Tunnel URLs stay stable; `chat_wait_ms` ~25s, returns early on last-reply.json; mailbox nudge at ~10 notes or ~14 days). Quick Tunnel URLs change on restart — prefer an MCP-only restart over bouncing the tunnel.
- This repo also ships a Next.js explainer UI (`pnpm dev`, typically http://127.0.0.1:43127).
- Public GitHub home: `tuckcode/TagTeamGPT` (https://github.com/tuckcode/TagTeamGPT); Cursor Origin codebase remains `knispo/codexgpt`. The public repo is early/experimental; the Windows driver is written but unproven (user has a Windows collaborator).
- Parent Cursor agents cannot see Cursor billing/settings unless the user shares them; Other Models quota is often exhausted independently of Cursor Models.

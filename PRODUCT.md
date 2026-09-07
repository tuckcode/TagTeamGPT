# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users: developers who already use the ChatGPT desktop app with Codex and want Chat to plan while Codex executes — without nesting `chatgpt.com` or mouse Computer Use.

## Product Purpose

**TagTeamGPT** is a desktop-first take on “They switch. The goal doesn't.”: a Codex Skill plus a short `[C2C]` paste-back protocol that uses ChatGPT desktop mode keybinds and the clipboard as the control plane.

This repo also ships a Next.js explainer site that teaches the approach, install path, and loop.

Success means: someone can understand the idea, install `$tagteam`, and run the Chat ↔ Codex loop without Work as the planner and without nested browser automation.

## Positioning

Same division of labor as upstream Codex-with-ChatGPT (Chat plans and reviews; Codex edits, shells, tests), but a different transport: unified desktop Chat / Work / Codex modes, keybinds + clipboard — not a nested `chatgpt.com` session driven by mouse Computer Use.

Not affiliated with OpenAI. Inspired by XiaoDuoYa/codex-with-chatgpt (MIT); this is not a fork of that bridge.

## Operating Context

- ChatGPT desktop app modes: Chat (planner), Work (avoid for planning), Codex (executor).
- Mode keybinds: macOS `⌃1/2/3`, Windows/Linux `Alt+1/2/3` (remappable). Mode keys flip the tab only — they do not select the Codex project.
- **Local folder projects do not support Chat.** Chat stays a cloud thread with
  no local folder; mount the **goal repo** only in Codex. Watch for the banner
  “Local projects don't support Chat.”
- Invoke skill with `$tagteam` or “Use TagTeamGPT to …”.
- Protocol lives in `.agents/skills/tagteam/references/protocol.md`.
- Explainer site: `pnpm dev` → http://127.0.0.1:43127.
- Public GitHub: tuckcode/TagTeamGPT. Cursor Origin codebase: knispo/codexgpt.

## Capabilities and Constraints

- **v0 (shipped):** Skill + protocol; human (or agent-driven) paste-back between Chat and Codex.
- **v1 (shipped):** keystroke driver + auto-loop — `--goal` and `--path` once, then Chat ↔ Codex hops with ~1s focus bursts. No nested `chatgpt.com`.
- **v2 (started):** Rhizome **mailbox** + **memory** — loop defaults write DONE/BLOCKED
  receipts to `projects/lob/mailbox/` and goal notes to `projects/lob/memory/`.
  Chat + Codex handoff are also **on by default** (`lob.config.json`). Vault writes
  stay with Codex/Cursor tools — **not** the Chat-facing workspace MCP.
- **v3 (in progress):** read-only workspace MCP (`mcp/`) over Streamable HTTP so Chat can `git_diff` / `read_file` without paste. Needs HTTPS tunnel + ChatGPT Developer Mode connector; optional (paste-back works without it); human still on BLOCKED. Keep this MCP **repo-read-only** — no vault writes through the tunnel.
- Never use Work as the planning brain (coding-quota adjacent).
- Never automate nested `chatgpt.com` for the control plane.
- Keep Codex→Chat control messages under ~1 KB; no full diffs unless Chat asks for a short snippet.

## Brand Commitments

- Name: **TagTeamGPT**
- Tagline: **They switch. The goal doesn't.**
- Skill: **`$tagteam`**
- Repo: `tuckcode/TagTeamGPT`
- Voice: direct, technical, personal (“my take”); do not claim OpenAI affiliation.
- Binding references when credited: XiaoDuoYa/codex-with-chatgpt.

## Evidence on Hand

- Skill package: `.agents/skills/tagteam/`
- Approach notes: `docs/approach.md`
- Explainer UI: `src/`
- Upstream inspiration: https://github.com/XiaoDuoYa/codex-with-chatgpt
- Public GitHub: https://github.com/tuckcode/TagTeamGPT
- Origin browse: https://cursor.com/codebase/knispo/codexgpt
- No fabricated testimonials, customers, or benchmarks — do not invent them.

## Product Principles

1. Chat owns plan and independent review; Codex owns execution.
2. Prefer keybinds + clipboard over nested web UI and mouse hunting.
3. Keep control messages tiny; optional read-only MCP for selective review; Rhizome mailbox/memory separate from that MCP.
4. Stay honest about quota: Chat is a different bill, not “free.”
5. Keep it useful in public by design, not as a private toolkit.

## Accessibility & Inclusion

No product-specific accessibility standard was set beyond ordinary web best practice for the explainer site.

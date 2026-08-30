# CodexGPT — desktop-app approach

Personal take on the “ChatGPT thinks, Codex works” split, adapted for the
unified ChatGPT desktop app (Chat · Work · Codex in one window).

Upstream inspiration:
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt).

## What we keep from C2C

- **Division of labor.** Chat owns plan + independent review. Codex owns
  edit / shell / git / tests.
- **Tiny control messages.** `[C2C]` state headers under ~1 KB. No dumping
  the whole diff into the composer when you can avoid it.
- **Optional read-only MCP.** If Chat can attach a custom connector, the
  original bridge still works as the data plane (8 read-only tools, OAuth
  pairing, Cloudflare Quick Tunnel).

## What we change

| Original C2C | CodexGPT (desktop take) |
| --- | --- |
| Codex drives nested `chatgpt.com` via in-app browser | Codex and Chat are modes in the same desktop app |
| Mouse / DOM automation for connectors and chat | Mode keybinds + clipboard paste |
| Skill hides tunnels/ports from the user | Skill (or playbook) focuses on switch → paste → wait → switch back |
| One long-lived web ChatGPT thread | One pinned Chat thread + one Codex project thread |

## Control plane

Documented desktop shortcuts (Settings → Keyboard Shortcuts; remappable):

- macOS: `⌃1` Chat · `⌃2` Work · `⌃3` Codex  
- Windows / Linux: `Alt+1` · `Alt+2` · `Alt+3`

Loop sketch:

1. From Codex, write INIT / EXECUTED to the clipboard.
2. Switch to Chat (`⌃1` / `Alt+1`).
3. Paste into the pinned C2C conversation, send.
4. Wait for `STATE: PLAN | DONE | BLOCKED` (human “continue” at first;
   auto-read later if Computer Use is reliable enough).
5. Switch back to Codex (`⌃3` / `Alt+3`).
6. Execute the plan; `c2c record` if the MCP bridge is in use; repeat.

Prefer keyboard + clipboard over screenshot-click. Desktop Computer Use can
send those keys when you Always-allow the ChatGPT app — still thinner than
hunting Settings menus on chatgpt.com.

## Data plane

Two levels of ambition:

1. **Semi-manual (ship first).** Chat never sees the repo. You or Codex paste
   a short brief. No tunnel. Good enough to validate the keybind loop.
2. **MCP bridge (full C2C benefit).** Run `c2c setup` against the workspace.
   If Chat (Developer Mode) can still add a custom HTTPS connector, Chat
   pulls `git_diff` / `read_file` itself after EXECUTED.

Do not use **Work** as the planner if the goal is ChatGPT conversation quota.
Work is documented to follow Codex-like usage.

## Protocol (same states)

```
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

Message shape stays C2C-compatible so you can reuse the original boot prompt
and state headers. Only the *transport* (keybind + paste vs nested browser)
changes.

## Security posture

- Without MCP: Chat only sees what you paste. Lowest exposure.
- With MCP: same as upstream — read-only tools, OAuth, path containment,
  sensitive-file deny list. The public tunnel URL alone is useless without a
  token.
- Computer Use on the desktop app: allowlist carefully; ChatGPT can see
  screen content in allowed apps.

## Status

Design + explainer site. Not a packaged Skill yet. Next steps when building:

1. Playbook / Skill that only does clipboard + mode switch + wait cue.
2. Verify mode shortcuts on current desktop builds (some reports of flaky
   `⌃1`–`⌃3`).
3. Optional: wire upstream `c2c` as the data plane once Chat connectors are
   confirmed on the surface you use.

## Credit

Upstream project: MIT, unofficial, not affiliated with OpenAI. Same applies
here.

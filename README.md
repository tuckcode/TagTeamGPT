# CodexGPT

**Chat plans. Codex ships.** One ChatGPT desktop app.

![CodexGPT loop](docs/codexgpt-loop-diagram.png)

Use **Chat** as the planning and review brain, and **Codex** as the hands — without nesting `chatgpt.com` or mouse-hunting a browser UI.

Inspired by [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt). This is a desktop keybind + clipboard take, not a fork of that bridge. **Not affiliated with OpenAI.**

## Why

- **Chat** is cheap talk (conversation quota).
- **Codex** is the scarce coding meter — edits, shells, tests.
- Same window: switch with `Control+1` / `Control+3` (macOS) or `Alt+1` / `Alt+3` (Windows/Linux).
- Tiny `[C2C]` control messages — not full-diff paste spam.

## Quick start

```bash
git clone https://github.com/knispo/CodexGPT.git
cd CodexGPT
mkdir -p ~/.agents/skills
cp -R .agents/skills/codexgpt ~/.agents/skills/codexgpt
```

1. Open your project folder in ChatGPT desktop **Codex**.
2. Open a **cloud Chat** thread with **no** local folder (local projects don’t support Chat).
3. In Codex, run `$codexgpt` or say `Use CodexGPT to …`.
4. Paste `[C2C]` stubs between Chat and Codex until Chat says `DONE`.

Full walkthrough: **[docs/install.md](docs/install.md)** → **[docs/usage.md](docs/usage.md)**.

## Docs

| Doc | Contents |
| --- | --- |
| [Install](docs/install.md) | Skill install + Chat/Codex setup |
| [Usage](docs/usage.md) | Manual loop, driver, auto-loop, MCP |
| [Troubleshooting](docs/troubleshooting.md) | Folder banner, Work mode, cwd trap |
| [Approach](docs/approach.md) | Design notes |
| [MCP](mcp/README.md) | Optional read-only repo connector |

## Status

| Piece | State |
| --- | --- |
| v0 paste-back skill | Shipped |
| v1 macOS keystroke driver | Shipped |
| v2 mailbox / memory helpers | Started (optional vault notes) |
| v3 workspace MCP | Optional; paste-back works without it |

## Hard rules

1. **Chat** = cloud thread, no folder. **Codex** = repo mounted.
2. Never use **Work** as the planner.
3. Invoke with **`$codexgpt`** in Codex (not Cursor’s `/`).
4. Confirm Codex `pwd` is your real git root before trusting results.

## Optional tooling

```bash
# macOS driver (needs Accessibility)
node tools/codexgpt-driver.mjs to chat

# Auto-loop
node tools/codexgpt-loop.mjs --goal "…"

# Optional MCP + tunnel
node tools/codexgpt-mcp-up.mjs start
```

## Explainer site

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## License / credit

MIT-style personal project inspired by upstream MIT work. See skill and docs for protocol details. Not affiliated with OpenAI.

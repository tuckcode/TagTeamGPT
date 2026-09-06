# Lob

**Chat lobs. Codex dunks.** One ChatGPT desktop app.

**Lob** is the product name. Invoke it in Codex with **`$lob`**. GitHub: `tuckcode/lob`.

Use **Chat** as the planning and review brain, and **Codex** as the hands — without nesting `chatgpt.com` or mouse-hunting a browser UI.

Inspired by [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt). This is a desktop keybind + clipboard take, not a fork of that bridge. **Not affiliated with OpenAI.**

## Why

- **Chat** is cheap talk (conversation quota).
- **Codex** is the scarce coding meter — edits, shells, tests.
- Same window: switch with `Control+1` / `Control+3` (macOS) or `Alt+1` / `Alt+3` (Windows/Linux).
- Tiny `[C2C]` control messages — Chat-to-Codex handshake tags, not full-diff paste spam.

## Quick start

```bash
git clone https://github.com/tuckcode/lob.git
cd lob
mkdir -p ~/.agents/skills
cp -R .agents/skills/lob ~/.agents/skills/lob
```

1. Open **your** project folder in ChatGPT desktop **Codex** (once).
2. Open a **cloud Chat** thread with **no** local folder (once).
3. Run the loop with your **goal** and that folder **path**:

```bash
node tools/lob-loop.mjs --goal "…" --path /path/to/your/repo --boot
```

Or in Codex: `$lob` / `Use Lob to …` and give the same path and goal.

4. The loop hops Chat ↔ Codex until Chat says `DONE`. You do not click tabs each hop.

Full walkthrough: **[docs/install.md](docs/install.md)** → **[docs/usage.md](docs/usage.md)**.

## Docs

| Doc | Contents |
| --- | --- |
| [Install](docs/install.md) | Skill install + Chat/Codex setup |
| [Usage](docs/usage.md) | Manual loop, driver, auto-loop, MCP |
| [Troubleshooting](docs/troubleshooting.md) | Folder banner, Work mode, cwd trap |
| [Approach](docs/approach.md) | Design notes |
| [MCP](mcp/README.md) | Optional read-only repo connector |

## Hard rules

1. **Chat** = cloud thread, no folder. **Codex** = repo mounted.
2. Never use **Work** as the planner.
3. Invoke with **`$lob`** in Codex (not Cursor’s `/`).
4. Mode hotkeys only flip the tab. Give **`--path`** (or `$lob` path + goal) once — do not click the sidebar every hop.
5. Confirm Codex `pwd` is your real git root before trusting results.

## Optional tooling

```bash
# Driver: macOS Control+1/2/3 (Accessibility) · Windows Alt+1/2/3
node tools/lob-driver.mjs to chat

# Auto-loop (same platforms)
node tools/lob-loop.mjs --goal "…" --path /path/to/your/repo --boot

# Optional MCP + tunnel
node tools/lob-mcp-up.mjs start
```

## Explainer site

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## License / credit

MIT-style personal project inspired by upstream MIT work. See skill and docs for protocol details. Not affiliated with OpenAI.

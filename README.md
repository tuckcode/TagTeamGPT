# Codex with ChatGPT — explainer

An interactive walkthrough of
[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt):
what it is, how the split-brain loop works, and why someone would use it.

This is not a clone of that project. It is a local explainer app built from
the project's README, architecture/protocol/security docs, Codex Skill, and
MCP server source.

## Run locally

Requires Node.js 20+.

```bash
pnpm install
pnpm dev -- --port 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

```bash
pnpm build
pnpm start -- --port 43127
```

## What you will find in the app

- The token-economics problem the repo is solving
- Control plane vs data plane (Computer Use vs MCP)
- A click-through of `INIT → PLAN → EXECUTE → REVIEW → DONE`
- The eight read-only MCP tools
- Setup, OAuth pairing, and why Cloudflare Quick Tunnel exists
- Security model and honest caveats

Sourced notes with citations: [docs/codex-with-chatgpt.md](docs/codex-with-chatgpt.md)

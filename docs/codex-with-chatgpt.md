# Codex with ChatGPT — sourced notes

Explainer notes for [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt)
(MIT, TypeScript, v0.1.0). Claims below are taken from that repository's own
docs and source, plus OpenAI's public MCP connector documentation. This file
is not affiliated with either party.

## What it is

A local **C2C Bridge** plus a Codex **Skill**. ChatGPT web is the planning and
review brain. Codex keeps execution (edit, shell, git, tests). The repository
is never uploaded wholesale; ChatGPT reads lines on demand through a
read-only MCP connection. ([README.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/README.md))

Tagline: "ChatGPT thinks. Codex works."

## The problem it claims to solve

ChatGPT Plus/Pro web quota sits idle while Codex burns API/Codex tokens on
planning and review. The project moves thinking onto the subscription the user
already pays for. No ChatGPT API key and no reverse proxy of the web app —
official web UI plus a read-only MCP bridge. ([README.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/README.md))

## How it works

### Two planes

From [docs/architecture.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md)
and [docs/protocol.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/protocol.md):

- **Control plane (Computer Use):** Codex types tiny `[C2C]` state messages
  into the ChatGPT UI (`INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED | ERROR`).
  Messages stay under 1 KB. No diffs, logs, or file bodies.
- **Data plane (MCP):** ChatGPT pulls files, diffs, search, and execution
  records itself. Path: ChatGPT → HTTPS tunnel → loopback bridge `/mcp` →
  workspace layer.

The bridge never re-implements a coding harness.

### MCP tools (eight, all read-only)

Registered in [`src/mcp/server.ts`](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/src/mcp/server.ts):

| Tool | Scope |
| --- | --- |
| `workspace_info` | `workspace.read` |
| `list_directory` | `workspace.read` |
| `read_file` | `workspace.read` |
| `search_workspace` | `workspace.search` |
| `git_status` | `git.read` |
| `git_diff` | `git.read` |
| `test_status` | `execution.read` |
| `execution_summary` | `execution.read` |

Every tool sets `annotations: { readOnlyHint: true }`. `test_status` does
not run tests; it reads JSONL records written by `c2c record`.

### Skill / UX layer

[`skill/SKILL.md`](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/skill/SKILL.md)
is copied to `~/.codex/skills/codex-with-chatgpt/`. Codex:

1. Runs `c2c setup` / `c2c doctor`.
2. Uses the **in-app browser only** (never Chrome/Safari/Edge, never
   screenshot-click Computer Use) to enable Developer Mode and create a
   custom ChatGPT connector.
3. Sends a boot prompt, then `[C2C]` messages, polling the same tab for
   `STATE: PLAN | DONE | BLOCKED`.
4. Executes the plan with its own tools, records the iteration, sends
   `EXECUTED`, and loops.

One ChatGPT conversation per workspace. Handoff to a new chat is a short
brief, not a data dump.

### Why a public tunnel

ChatGPT custom MCP connectors require a remote HTTPS Streamable HTTP endpoint
(typically `/mcp`), not local stdio.
([OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server))

The C2C bridge therefore binds `127.0.0.1` (prefer port 48765) and runs
`cloudflared tunnel --url`. Quick Tunnel URLs change per start; `c2c doctor`
restarts and the Skill deletes + recreates the connector (never Reconnect).
([docs/architecture.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md),
[docs/troubleshooting.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/troubleshooting.md))

### OAuth pairing

The bridge is an OAuth 2.1 authorization server: RFC 8414 metadata, RFC 7591
dynamic client registration, authorization-code + PKCE S256 only, refresh
rotation, RFC 7009 revocation. Opaque tokens stored as SHA-256 hashes, bound
to `workspace_id`. Pairing codes: CSPRNG, ~5 minute TTL, 5 attempts, rate
limited, one-time. ([docs/security.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/security.md),
[docs/architecture.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md))

## Security claims (from the project)

From [docs/security.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/security.md):

- Write/delete/shell/commit tools do not exist on the server.
- One workspace = one token audience; wrong workspace → 403.
- Path containment via realpath; symlink and `../` escapes tested.
- `.env*`, keys, SSH, credentials denied; `.env.example` allowed;
  `.c2cignore` for extras.
- URL leak is not enough: `/mcp` requires a bearer token.
- Admin API is loopback + random token; proxied headers rejected.
- V1 limitation: client registrations and token hashes are file-based, not
  OS-keychain.

## Benefit (what the design actually buys)

1. **Quota split.** Planning/review consume ChatGPT web quota; Codex tokens
   go to execution. (Stated purpose in README.)
2. **Independent review.** ChatGPT is instructed to inspect the real git diff
   via MCP after `EXECUTED`, not to trust harness summaries.
   ([docs/protocol.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/protocol.md) boot prompt rules 6–7)
3. **Keep the Codex harness.** The bridge does not become a second coding
   agent. ([docs/architecture.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md) principles)
4. **Least data in the composer.** Control messages stay tiny; file bodies
   travel only through scoped MCP reads.
5. **No unofficial ChatGPT API proxy.** Uses ChatGPT's own connector + OAuth
   surface.

## Caveats not to skip

- Unofficial community project. ([README.md](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/README.md))
- Requires Codex (Skill + in-app browser) and a ChatGPT plan that can add
  custom MCP connectors in Developer Mode. OpenAI's own docs require Developer
  Mode for custom connectors on several paid tiers.
  ([OpenAI community thread, staff reply](https://community.openai.com/t/custom-mcp-connector-no-longer-showing-all-tools-as-enabled/1361121))
- Read-only is not zero-access. Source still leaves the machine over HTTPS.
- Tunnel URL churn is the main operational cost.
- Control plane depends on ChatGPT's web UI remaining automatable.

## Repo layout (upstream)

```
src/bridge  loopback HTTP, admin API
src/mcp     8 read-only tools, Streamable HTTP
src/auth    OAuth 2.1
src/pairing one-time pairing codes
src/workspace path policy, search, git
src/tunnel  Cloudflare Quick Tunnel
src/execution JSONL records for review
src/cli     c2c CLI
skill/      Codex Skill (the UX)
```

`package.json` exposes `c2c`, requires Node >= 20, and lists
`@modelcontextprotocol/sdk`, Express, Commander, Zod.
([package.json](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/package.json))

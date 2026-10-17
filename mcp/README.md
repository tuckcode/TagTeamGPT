# TagTeamGPT MCP (read-only workspace)

Lets **Chat** pull small repo facts (status, diffs, files) over MCP so you
don’t paste them into the composer. Control plane stays keybinds + `[C2C]`.

## Tools

| Tool | Purpose |
| --- | --- |
| `workspace_info` | Root, branch, dirty |
| `project_brief` | Scoped rules, declared test commands, saved revision, and local-change status before planning |
| `list_directory` | Paginated listing |
| `read_file` | Paginated read (denies `.env` / keys) |
| `search_workspace` | ripgrep or fallback |
| `git_status` | Staged / unstaged / untracked |
| `git_diff` | Paginated diff (post-EXECUTED review) |
| `submit_c2c` | Chat writes PLAN/DONE/BLOCKED/READY to `.tagteam/last-reply.json` so the loop can hop |

## Run locally

```bash
# One-shot helper (MCP + Cloudflare Quick Tunnel):
node tools/tagteam-mcp-up.mjs start   # prints connector HTTPS URL; idle-stops after 60m no /mcp traffic
node tools/tagteam-mcp-up.mjs status
node tools/tagteam-mcp-up.mjs stop
```

Idle minutes: `mcp_idle_minutes` in `tagteam.config.json`, or `TAGTEAM_MCP_IDLE_MINUTES=0` to disable.

Or manually:

```bash
cd mcp
npm install
export TAGTEAM_ROOT="$(cd .. && pwd)"
export TAGTEAM_MCP_TOKEN="$(openssl rand -hex 24)"
npm start
# → http://127.0.0.1:8743/mcp
```

Health (no auth): `curl http://127.0.0.1:8743/health`

## Expose to ChatGPT Chat

Use the [private connector setup](../docs/private-connector.md) for OpenAI Secure MCP Tunnel.
The private tunnel forwards requests to the authenticated local server.
ChatGPT does not need a public Cloudflare address for this setup.

The public URL form offers OAuth and unauthenticated connections.
This server uses a static Bearer access key and does not implement OAuth.
Do not disable server authentication to make that form connect.

In a Chat thread, select the installed plugin with `@`.
Call `workspace_info` to confirm the folder before you read project files.

## Project brief before planning

Chat calls `project_brief` before it creates a plan.
Pass up to eight relevant file or folder paths in `paths`.
The brief includes root `AGENTS.md`, `CLAUDE.md`, and `package.json` files when they exist.
It also includes these files from the requested paths' ancestor folders inside the workspace.
Rules from deeper folders apply to those folders and their descendants.
Sources outside the workspace are rejected, including links to external files.

The brief reports `root`, `git_branch`, the full saved `commit`, and `dirty`.
`dirty` describes local changes. It does not alter the saved commit identifier.
If the workspace has no saved Git revision, `commit` is null.
The brief extracts package version, package manager, and scripts named `test`, `lint`, `build`, `check`, or `typecheck`.
Names with a colon suffix, such as `test:unit`, also match.
The server does not execute package scripts.
It places command declarations before rule excerpts so they remain visible in a short response.

The brief uses `TAGTEAM_BUDGET_STATUS`, which defaults to 8 KiB.
Each source read acquires at most 8 KiB within the shared acquisition limit.
`source_paths` identifies the included source files, including files whose text could not fit.
The server rejects scopes with more than 32 source files.
Request fewer paths if the source catalog cannot fit in the response limit.
If `truncated` is true, Chat must read partial or omitted sources with `read_file` before planning.
The brief has no continuation cursor. Follow-up reads use the source paths.
Malformed package files are marked incomplete without inferred commands.

The loop INIT message, boot prompt, and skill protocol request this brief before planning.
If the connector is unavailable, Codex can supply a compact factual brief.
If neither source is available, Chat reports BLOCKED and requests the missing context.

## Response limits

The server limits each tool response by its serialized UTF-8 size, including the MCP content wrapper.
These limits measure bytes. They do not measure model tokens or account usage.
Tool errors use the smallest configured response limit.
If error details exceed that limit, the response marks the omitted details.

- File reads and change reports default to 16 KiB per response.
- Searches, folder listings, status reports, and workspace summaries default to 8 KiB per response.
- Commands and file reads acquire at most 64 KiB per operation by default.
- Each external command has a default time limit of 5 seconds.

Set `TAGTEAM_BUDGET_READ`, `TAGTEAM_BUDGET_DIFF`, `TAGTEAM_BUDGET_SEARCH`, `TAGTEAM_BUDGET_LIST`, or `TAGTEAM_BUDGET_STATUS` to override response sizes.
Set `TAGTEAM_ACQUIRE_BYTES` to override the acquisition limit.
Set `TAGTEAM_TOOL_TIMEOUT_MS` to override the command time limit.
Response limits accept 512 through 65536 bytes.
The acquisition limit accepts 1024 through 262144 bytes.
The command time limit accepts 50 through 30000 milliseconds.
Invalid settings stop server creation with an error.

A response includes `returned_bytes`, `truncated`, `reason`, and `cursor`.
If `cursor` exists, pass it to the same tool with the same query or path.
The cursor continues the requested line range or listing page.
Use `offset` or `page` to request a different range.
If `reason` is `stale_cursor`, restart the request because the source changed.
If `reason` is `acquisition_bytes` without a cursor, request a narrower path or query.
If `reason` is `acquisition_timeout`, narrow the request before you retry.
If `reason` is `cursor_stuck`, one response cannot contain the next item under the current limit.
Increase the response limit or narrow the request.

An unrestricted change report includes at most 40 untracked files.
If more files exist, the response reports truncation.
Request each omitted path separately.

## Security

- Binds `127.0.0.1` by default. Do not open `0.0.0.0` without a reverse proxy.
- Bearer token required on `/mcp`.
- Paths cannot escape `TAGTEAM_ROOT`; secrets patterns are denied.
- Keep access keys in local protected files or environment variables.
- Secure MCP Tunnel controls access through the associated OpenAI organization and ChatGPT workspace.

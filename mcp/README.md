# Lob MCP (read-only workspace)

Lets **Chat** pull small repo facts (status, diffs, files) over MCP so you
don’t paste them into the composer. Control plane stays keybinds + `[C2C]`.

## Tools

| Tool | Purpose |
| --- | --- |
| `workspace_info` | Root, branch, dirty |
| `list_directory` | Paginated listing |
| `read_file` | Paginated read (denies `.env` / keys) |
| `search_workspace` | ripgrep or fallback |
| `git_status` | Staged / unstaged / untracked |
| `git_diff` | Paginated diff (post-EXECUTED review) |
| `submit_c2c` | Chat writes PLAN/DONE/BLOCKED/READY to `.lob/last-reply.json` so the loop can hop |

## Run locally

```bash
# One-shot helper (MCP + Cloudflare Quick Tunnel):
node tools/lob-mcp-up.mjs start   # prints connector HTTPS URL; idle-stops after 60m no /mcp traffic
node tools/lob-mcp-up.mjs status
node tools/lob-mcp-up.mjs stop
```

Idle minutes: `mcp_idle_minutes` in `lob.config.json`, or `LOB_MCP_IDLE_MINUTES=0` to disable.

Or manually:

```bash
cd mcp
npm install
export LOB_ROOT="$(cd .. && pwd)"
export LOB_MCP_TOKEN="$(openssl rand -hex 24)"
npm start
# → http://127.0.0.1:8743/mcp
```

Health (no auth): `curl http://127.0.0.1:8743/health`

## Expose to ChatGPT Chat

ChatGPT does **not** launch local stdio MCP. It needs a **public HTTPS** MCP URL
(web Settings → Plugins / Developer Mode → custom plugin).

1. Keep `npm start` running (Bearer required by default).
2. Tunnel loopback: `cloudflared tunnel --url http://127.0.0.1:8743`
3. Add plugin with URL `https://<tunnel>/mcp`. If Create only offers
   OAuth / No auth / Mixed, use **No authentication** briefly with
   `LOB_MCP_ALLOW_NO_AUTH=1`, then turn auth back on and set a Bearer
   header on the plugin if the UI allows — otherwise leave no-auth only for
   short local demos.
4. In a **Chat** thread (not Work), ask for `workspace_info` / `git_status`.
   The connector may not appear under composer `+`.

Exact connector UI labels move around; if Developer Mode is missing, your plan
or workspace may not allow custom MCP yet.

## Security

- Binds `127.0.0.1` by default. Do not open `0.0.0.0` without a reverse proxy.
- Bearer token required on `/mcp`.
- Paths cannot escape `LOB_ROOT`; secrets patterns are denied.
- Prefer ephemeral tunnels; rotate the token if the URL leaks.

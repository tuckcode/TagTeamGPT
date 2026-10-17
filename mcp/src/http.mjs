#!/usr/bin/env node
/**
 * TagTeamGPT read-only workspace MCP over Streamable HTTP.
 *
 * Local:
 *   TAGTEAM_ROOT=/path/to/repo TAGTEAM_MCP_TOKEN=secret node src/http.mjs
 *   → http://127.0.0.1:8743/mcp
 *
 * ChatGPT Chat connector needs a public HTTPS URL (tunnel) + Developer Mode.
 * Auth: Authorization: Bearer <TAGTEAM_MCP_TOKEN>
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, MCP_SERVER_NAME } from "./create-server.mjs";
import { resolveRoot } from "./workspace.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "../..");

const PORT = Number(process.env.PORT || process.env.TAGTEAM_MCP_PORT || 8743);
const HOST = process.env.TAGTEAM_MCP_HOST || "127.0.0.1";
const ROOT = resolveRoot(process.env.TAGTEAM_ROOT || defaultRoot);
// .tagteam/mcp.token is the canonical token; tagteam-mcp-up.mjs writes it and
// exports it. Read it directly so the server can also be started on its own
// (launchd, systemd, a bare `node src/http.mjs`) and still agree with whatever
// already holds that token. Without this, a standalone start mints a random
// token no client knows, and every request fails 401 with no obvious cause.
function tokenFromFile() {
  try {
    const t = fs.readFileSync(path.join(ROOT, ".tagteam", "mcp.token"), "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}

const savedToken = tokenFromFile();
const TOKEN =
  process.env.TAGTEAM_MCP_TOKEN ||
  process.env.MCP_BEARER_TOKEN ||
  savedToken ||
  randomBytes(24).toString("hex");

const ACTIVITY = path.join(ROOT, ".tagteam", "mcp.last-activity");

function touchActivity() {
  try {
    fs.mkdirSync(path.dirname(ACTIVITY), { recursive: true });
    fs.writeFileSync(ACTIVITY, `${Date.now()}\n`);
  } catch {
    /* ignore */
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, root: ROOT, name: MCP_SERVER_NAME });
});

const ALLOW_NO_AUTH =
  process.env.TAGTEAM_MCP_ALLOW_NO_AUTH === "1" ||
  process.env.TAGTEAM_MCP_ALLOW_NO_AUTH === "true";

function logHit(kind, req, extra = {}) {
  try {
    const line =
      JSON.stringify({
        t: new Date().toISOString(),
        kind,
        method: req.method,
        path: req.path,
        ...extra,
      }) + "\n";
    fs.appendFileSync(path.join(ROOT, ".tagteam", "mcp.access.log"), line);
  } catch {
    /* ignore */
  }
}

// OAuth discovery probes /.well-known/* to decide whether this server speaks
// OAuth. This server does not — it uses a static Bearer token. Answering those
// probes with 401 makes a client read the error body as malformed protected
// resource metadata; a clean 404 lets discovery conclude "no OAuth" and move on.
// Only the discovery paths are exempt. /mcp still requires the Bearer token.
app.use((req, res, next) => {
  if (req.path.startsWith("/.well-known/")) {
    return res.status(404).json({ error: "not_found" });
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (ALLOW_NO_AUTH) {
    touchActivity();
    logHit("no_auth", req);
    return next();
  }
  const hdr = req.headers.authorization || "";
  const got = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!got || got !== TOKEN) {
    touchActivity();
    logHit("auth_fail", req, {
      has_authorization: !!hdr,
      bearer_len: got ? got.length : 0,
      expect_len: TOKEN.length,
    });
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

async function handleMcp(req, res) {
  touchActivity();
  const server = createServer(ROOT);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    transport.close();
    server.close();
  });
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

touchActivity();

app.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      ok: true,
      listen: `http://${HOST}:${PORT}/mcp`,
      health: `http://${HOST}:${PORT}/health`,
      root: ROOT,
      token_set: true,
      hint: "Use docs/private-connector.md to connect through OpenAI Secure MCP Tunnel.",
    })
  );
  if (!process.env.TAGTEAM_MCP_TOKEN && !process.env.MCP_BEARER_TOKEN && !savedToken) {
    console.error(
      JSON.stringify({
        warning:
          "No saved access key exists. Set TAGTEAM_MCP_TOKEN before connecting. This process uses an ephemeral key.",
        token_set: true,
      })
    );
  }
});

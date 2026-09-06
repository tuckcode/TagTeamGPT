#!/usr/bin/env node
/**
 * Lob read-only workspace MCP over Streamable HTTP.
 *
 * Local:
 *   LOB_ROOT=/path/to/repo LOB_MCP_TOKEN=secret node src/http.mjs
 *   → http://127.0.0.1:8743/mcp
 *
 * ChatGPT Chat connector needs a public HTTPS URL (tunnel) + Developer Mode.
 * Auth: Authorization: Bearer <LOB_MCP_TOKEN>
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./create-server.mjs";
import { resolveRoot } from "./workspace.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "../..");

const PORT = Number(process.env.PORT || process.env.LOB_MCP_PORT || 8743);
const HOST = process.env.LOB_MCP_HOST || "127.0.0.1";
const ROOT = resolveRoot(process.env.LOB_ROOT || defaultRoot);
const TOKEN =
  process.env.LOB_MCP_TOKEN ||
  process.env.MCP_BEARER_TOKEN ||
  randomBytes(24).toString("hex");

const ACTIVITY = path.join(ROOT, ".lob", "mcp.last-activity");

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
  res.json({ ok: true, root: ROOT, name: "lob-workspace" });
});

const ALLOW_NO_AUTH =
  process.env.LOB_MCP_ALLOW_NO_AUTH === "1" ||
  process.env.LOB_MCP_ALLOW_NO_AUTH === "true";

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (ALLOW_NO_AUTH) return next();
  const hdr = req.headers.authorization || "";
  const got = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!got || got !== TOKEN) {
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
      token_preview: `${TOKEN.slice(0, 4)}…${TOKEN.slice(-4)}`,
      hint: "Tunnel this URL over HTTPS, then add as a ChatGPT custom MCP connector (Developer Mode). Send Authorization: Bearer <token>.",
    })
  );
  if (!process.env.LOB_MCP_TOKEN && !process.env.MCP_BEARER_TOKEN) {
    console.error(
      JSON.stringify({
        warning:
          "LOB_MCP_TOKEN was not set; generated an ephemeral token for this process (not printed — read .lob/mcp.token or set the env)",
        token_set: true,
      })
    );
  }
});

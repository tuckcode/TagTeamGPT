#!/usr/bin/env node
/**
 * Start/stop the local MCP server + Cloudflare Quick Tunnel.
 *
 *   node tools/codexgpt-mcp-up.mjs start|stop|status
 *
 * Idle auto-stop (no cron): after mcp_idle_minutes with no /mcp traffic,
 * stops MCP + tunnel. Config: codexgpt.config.json → mcp_idle_minutes (default 60).
 * Set 0 to disable. Env: CODEXGPT_MCP_IDLE_MINUTES overrides.
 *
 * Writes:
 *   .codexgpt/mcp.pids.json
 *   .codexgpt/mcp.connector-url
 *   .codexgpt/mcp.last-activity
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/codexgpt-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, ".codexgpt");
const PIDS = path.join(STATE, "mcp.pids.json");
const URL_FILE = path.join(STATE, "mcp.connector-url");
const ACTIVITY = path.join(STATE, "mcp.last-activity");
const MCP_DIR = path.join(ROOT, "mcp");
const PORT = process.env.CODEXGPT_MCP_PORT || "8743";

function print(obj) {
  console.log(JSON.stringify(obj));
}

function readPids() {
  try {
    return JSON.parse(fs.readFileSync(PIDS, "utf8"));
  } catch {
    return {};
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopPid(pid) {
  if (!alive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* ignore */
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function ensureToken() {
  fs.mkdirSync(STATE, { recursive: true });
  const tokenFile = path.join(STATE, "mcp.token");
  if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, "utf8").trim();
  const token = execFileSync("openssl", ["rand", "-hex", "24"], { encoding: "utf8" }).trim();
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  return token;
}

function idleMinutes() {
  if (process.env.CODEXGPT_MCP_IDLE_MINUTES != null) {
    return Number(process.env.CODEXGPT_MCP_IDLE_MINUTES);
  }
  return Number(loadConfig().mcp_idle_minutes ?? 60);
}

function spawnIdleWatcher(minutes) {
  if (!minutes || minutes <= 0) return null;
  const ms = minutes * 60 * 1000;
  const script = `
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const activity = ${JSON.stringify(ACTIVITY)};
const stopCmd = ${JSON.stringify(process.execPath)};
const stopArgs = ${JSON.stringify([path.join(__dirname, "codexgpt-mcp-up.mjs"), "stop"])};
const idleMs = ${ms};
const poll = 30000;
function last() {
  try { return Number(fs.readFileSync(activity, 'utf8').trim()) || Date.now(); }
  catch { return Date.now(); }
}
(async () => {
  while (true) {
    await new Promise(r => setTimeout(r, poll));
    if (Date.now() - last() >= idleMs) {
      console.error(JSON.stringify({ idle_stop: true, idle_minutes: ${minutes} }));
      spawnSync(stopCmd, stopArgs, { stdio: 'inherit' });
      process.exit(0);
    }
  }
})();
`;
  const idleLog = path.join(STATE, "mcp.idle.log");
  const out = fs.openSync(idleLog, "a");
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", out, out],
    detached: true,
  });
  child.unref();
  return child.pid;
}

async function start() {
  const existing = readPids();
  if (alive(existing.mcp) && alive(existing.tunnel)) {
    const url = fs.existsSync(URL_FILE) ? fs.readFileSync(URL_FILE, "utf8").trim() : null;
    print({ ok: true, already: true, pids: existing, connector: url });
    return;
  }

  if (!fs.existsSync(path.join(MCP_DIR, "package.json"))) {
    print({ ok: false, code: "NO_MCP", detail: "mcp/ missing" });
    process.exitCode = 1;
    return;
  }

  const token = ensureToken();
  const allowNoAuth = process.env.CODEXGPT_MCP_ALLOW_NO_AUTH === "1";
  const idle = idleMinutes();

  const mcpLog = path.join(STATE, "mcp.server.log");
  const tunLog = path.join(STATE, "mcp.tunnel.log");
  fs.writeFileSync(mcpLog, "");
  fs.writeFileSync(tunLog, "");
  fs.writeFileSync(ACTIVITY, `${Date.now()}\n`);

  const mcpOut = fs.openSync(mcpLog, "a");
  const mcp = spawn("npm", ["start"], {
    cwd: MCP_DIR,
    env: {
      ...process.env,
      CODEXGPT_ROOT: ROOT,
      CODEXGPT_MCP_TOKEN: token,
      CODEXGPT_MCP_PORT: PORT,
      ...(allowNoAuth ? { CODEXGPT_MCP_ALLOW_NO_AUTH: "1" } : {}),
    },
    stdio: ["ignore", mcpOut, mcpOut],
    detached: true,
  });
  mcp.unref();

  await sleep(1500);

  try {
    execFileSync("which", ["cloudflared"], { encoding: "utf8" });
  } catch {
    stopPid(mcp.pid);
    print({ ok: false, code: "NO_CLOUDFLARED", detail: "Install cloudflared for the HTTPS tunnel" });
    process.exitCode = 1;
    return;
  }

  const tunOut = fs.openSync(tunLog, "a");
  const cloudflared = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://127.0.0.1:${PORT}`],
    { stdio: ["ignore", tunOut, tunOut], detached: true }
  );
  cloudflared.unref();

  let connector = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const log = fs.readFileSync(tunLog, "utf8");
    const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      connector = `${m[0]}/mcp`;
      fs.writeFileSync(URL_FILE, connector + "\n");
      break;
    }
  }

  const idlePid = spawnIdleWatcher(idle);
  const pids = {
    mcp: mcp.pid,
    tunnel: cloudflared.pid,
    idle: idlePid,
    idle_minutes: idle,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(PIDS, JSON.stringify(pids, null, 2));

  if (!connector) {
    print({ ok: false, code: "TUNNEL_URL_TIMEOUT", pids, logs: { mcp: mcpLog, tunnel: tunLog } });
    process.exitCode = 1;
    return;
  }

  print({
    ok: true,
    connector,
    pids,
    idle_minutes: idle,
    note: allowNoAuth
      ? "No-auth allowed (CODEXGPT_MCP_ALLOW_NO_AUTH=1)"
      : "Bearer required; token in .codexgpt/mcp.token",
  });
}

function stop() {
  const pids = readPids();
  stopPid(pids.idle);
  stopPid(pids.tunnel);
  stopPid(pids.mcp);
  try {
    fs.unlinkSync(PIDS);
  } catch {
    /* ignore */
  }
  print({ ok: true, stopped: true, was: pids });
}

function status() {
  const pids = readPids();
  const url = fs.existsSync(URL_FILE) ? fs.readFileSync(URL_FILE, "utf8").trim() : null;
  let lastActivity = null;
  try {
    lastActivity = Number(fs.readFileSync(ACTIVITY, "utf8").trim());
  } catch {
    /* ignore */
  }
  print({
    ok: true,
    mcp: alive(pids.mcp),
    tunnel: alive(pids.tunnel),
    idle_watcher: alive(pids.idle),
    pids,
    connector: url,
    last_activity: lastActivity ? new Date(lastActivity).toISOString() : null,
  });
}

const cmd = process.argv[2];
if (cmd === "start") start();
else if (cmd === "stop") stop();
else if (cmd === "status") status();
else {
  print({ ok: false, code: "USAGE", detail: "codexgpt-mcp-up.mjs start|stop|status" });
  process.exitCode = 1;
}

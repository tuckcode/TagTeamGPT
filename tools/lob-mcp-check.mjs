#!/usr/bin/env node
/**
 * Rigorous Lob MCP check (local and/or tunneled HTTPS).
 *
 *   node tools/lob-mcp-check.mjs
 *   node tools/lob-mcp-check.mjs --url https://….trycloudflare.com/mcp
 *
 * Reads Bearer token from LOB_MCP_TOKEN or .lob/mcp.token (never prints it).
 * Exit 0 only if every case passes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, ".lob");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function loadToken() {
  if (process.env.LOB_MCP_TOKEN) return process.env.LOB_MCP_TOKEN.trim();
  const p = path.join(STATE, "mcp.token");
  if (!fs.existsSync(p)) throw new Error("missing .lob/mcp.token");
  return fs.readFileSync(p, "utf8").trim();
}

function loadDefaultUrl() {
  const p = path.join(STATE, "mcp.connector-url");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  return "http://127.0.0.1:8743/mcp";
}

function parseSseOrJson(text) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  if (dataLines.length) {
    return JSON.parse(dataLines[dataLines.length - 1]);
  }
  return JSON.parse(text);
}

async function rpc(url, token, body, { expectStatus = 200 } = {}) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const ms = Date.now() - t0;
  if (res.status !== expectStatus) {
    return {
      ok: false,
      status: res.status,
      ms,
      error: `expected HTTP ${expectStatus}, got ${res.status}`,
      preview: raw.slice(0, 240),
    };
  }
  if (expectStatus === 401) {
    return { ok: true, status: res.status, ms };
  }
  let msg;
  try {
    msg = parseSseOrJson(raw);
  } catch (e) {
    return { ok: false, status: res.status, ms, error: `parse: ${e.message}`, preview: raw.slice(0, 240) };
  }
  if (msg.error) {
    return { ok: false, status: res.status, ms, error: msg.error, msg };
  }
  return { ok: true, status: res.status, ms, msg, raw };
}

function toolText(msg) {
  const content = msg?.result?.content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => c.text || "").join("\n");
}

function pass(name, detail = {}) {
  console.log(JSON.stringify({ ok: true, case: name, ...detail }));
}
function fail(name, detail = {}) {
  console.log(JSON.stringify({ ok: false, case: name, ...detail }));
}

async function main() {
  const url = arg("--url", loadDefaultUrl());
  const token = loadToken();
  const healthUrl = url.replace(/\/mcp\/?$/, "/health");
  let failed = 0;
  const mark = (ok, name, detail) => {
    if (ok) pass(name, detail);
    else {
      fail(name, detail);
      failed += 1;
    }
  };

  console.log(JSON.stringify({ phase: "start", url, health: healthUrl }));

  // 1) health (no auth)
  {
    const t0 = Date.now();
    const res = await fetch(healthUrl);
    const j = await res.json();
    mark(res.ok && j.ok === true, "health", { ms: Date.now() - t0, root: j.root });
  }

  // 2) reject missing/wrong bearer
  {
    const r = await rpc(url, "", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { expectStatus: 401 });
    mark(r.ok, "auth_reject_empty", { ms: r.ms, status: r.status });
  }
  {
    const r = await rpc(
      url,
      "definitely-wrong-token",
      { jsonrpc: "2.0", id: 2, method: "initialize", params: {} },
      { expectStatus: 401 }
    );
    mark(r.ok, "auth_reject_wrong", { ms: r.ms, status: r.status });
  }

  // 3) initialize
  const init = await rpc(url, token, {
    jsonrpc: "2.0",
    id: 3,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "lob-mcp-check", version: "0.1" },
    },
  });
  mark(
    init.ok && init.msg?.result?.serverInfo?.name === "lob-workspace",
    "initialize",
    {
      ms: init.ms,
      server: init.msg?.result?.serverInfo,
      error: init.error,
    }
  );

  // 4) tools/list
  const listed = await rpc(url, token, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/list",
    params: {},
  });
  const names = (listed.msg?.result?.tools || []).map((t) => t.name).sort();
  const expected = [
    "git_diff",
    "git_status",
    "list_directory",
    "read_file",
    "search_workspace",
    "workspace_info",
  ];
  mark(
    listed.ok && expected.every((n) => names.includes(n)),
    "tools_list",
    { ms: listed.ms, names, error: listed.error }
  );

  async function callTool(id, name, args) {
    return rpc(url, token, {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });
  }

  // 5) workspace_info
  {
    const r = await callTool(10, "workspace_info", {});
    const text = toolText(r.msg);
    mark(r.ok && /"root"|"git_branch"|"dirty"/.test(text) && !/project_type|languages/i.test(text), "workspace_info", {
      ms: r.ms,
      preview: text.slice(0, 200),
      error: r.error,
    });
  }

  // 6) list_directory
  {
    const r = await callTool(11, "list_directory", { path: ".", page_size: 20 });
    const text = toolText(r.msg);
    mark(r.ok && /README|mcp|tools/i.test(text), "list_directory", {
      ms: r.ms,
      preview: text.slice(0, 200),
      error: r.error,
    });
  }

  // 7) read_file happy path
  {
    const r = await callTool(12, "read_file", {
      path: "PRODUCT.md",
      offset: 0,
      limit: 30,
    });
    const text = toolText(r.msg);
    mark(r.ok && /Lob|Product/i.test(text), "read_file", {
      ms: r.ms,
      preview: text.slice(0, 180),
      error: r.error,
    });
  }

  // 8) read_file deny secrets
  {
    const r = await callTool(13, "read_file", { path: ".env" });
    const text = toolText(r.msg);
    const denied =
      r.ok &&
      (/denied|forbidden|not allowed|sensitive|blocked/i.test(text) ||
        r.msg?.result?.isError === true);
    mark(denied, "read_file_deny_env", {
      ms: r.ms,
      preview: text.slice(0, 200),
      isError: r.msg?.result?.isError,
      error: r.error,
    });
  }

  // 9) search_workspace
  {
    const r = await callTool(14, "search_workspace", {
      query: "Lob",
      max_results: 5,
    });
    const text = toolText(r.msg);
    mark(r.ok && /Lob/i.test(text), "search_workspace", {
      ms: r.ms,
      preview: text.slice(0, 200),
      error: r.error,
    });
  }

  // 10) git_status + git_diff
  {
    const r = await callTool(15, "git_status", {});
    const text = toolText(r.msg);
    mark(r.ok && text.length > 0, "git_status", {
      ms: r.ms,
      preview: text.slice(0, 220),
      error: r.error,
    });
  }
  {
    const r = await callTool(16, "git_diff", { page: 0, page_size: 40 });
    const text = toolText(r.msg);
    mark(r.ok && text.length > 0, "git_diff", {
      ms: r.ms,
      preview: text.slice(0, 220),
      error: r.error,
    });
  }

  // 11) path escape attempt
  {
    const r = await callTool(17, "read_file", { path: "../etc/passwd" });
    const text = toolText(r.msg);
    const blocked =
      r.ok &&
      (/escape|outside|denied|invalid|not found|ENOENT|blocked/i.test(text) ||
        r.msg?.result?.isError === true ||
        !/root:/.test(text));
    mark(blocked && !/root:x:/.test(text), "path_escape_blocked", {
      ms: r.ms,
      preview: text.slice(0, 200),
      error: r.error,
    });
  }

  console.log(JSON.stringify({ phase: "done", failed, passed: failed === 0 }));
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, case: "fatal", error: String(e.message || e) }));
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Rigorous TagTeamGPT MCP check (local and/or tunneled HTTPS).
 *
 *   node tools/tagteam-mcp-check.mjs
 *   node tools/tagteam-mcp-check.mjs --url https://….trycloudflare.com/mcp
 *
 * Reads Bearer token from TAGTEAM_MCP_TOKEN or .tagteam/mcp.token (never prints it).
 * Exit 0 only if every case passes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, ".tagteam");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function loadToken() {
  if (process.env.TAGTEAM_MCP_TOKEN) return process.env.TAGTEAM_MCP_TOKEN.trim();
  const p = path.join(STATE, "mcp.token");
  if (!fs.existsSync(p)) throw new Error("missing .tagteam/mcp.token");
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
      clientInfo: { name: "tagteam-mcp-check", version: "0.1" },
    },
  });
  mark(
    init.ok && init.msg?.result?.serverInfo?.name === "tagteam-workspace",
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
    "project_brief",
    "turn_review",
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
    mark(r.ok && /tagteam|branch|dirty/i.test(text), "workspace_info", {
      ms: r.ms,
      preview: text.slice(0, 200),
      error: r.error,
    });
  }

  // 6) list_directory
  {
    const r = await callTool(18, "project_brief", { paths: ["mcp/src/workspace.mjs"] });
    let brief;
    try { brief = JSON.parse(toolText(r.msg)); } catch { /* The check reports invalid responses below. */ }
    mark(r.ok && !r.msg?.result?.isError && brief?.root === ROOT && Array.isArray(brief?.source_paths), "project_brief", {
      ms: r.ms,
      root: brief?.root,
      commit: brief?.commit,
      truncated: brief?.truncated,
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
    mark(r.ok && /TagTeamGPT|Product/i.test(text), "read_file", {
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
      query: "TagTeamGPT",
      max_results: 5,
    });
    const text = toolText(r.msg);
    mark(r.ok && /TagTeamGPT/i.test(text), "search_workspace", {
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

function describeFatal(e) {
  const code = e?.cause?.code || e?.code || null;
  const host = (() => {
    try {
      return new URL(arg("--url", loadDefaultUrl())).hostname;
    } catch {
      return null;
    }
  })();
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return {
      code: "DNS_UNRESOLVED",
      detail: `This machine cannot resolve ${host}.`,
      hint:
        "The tunnel may still be healthy. Some routers return SERVFAIL for " +
        "*.trycloudflare.com. Compare `dig +short <host>` with " +
        "`dig +short @1.1.1.1 <host>`. If only the public resolver answers, " +
        "point this Mac at 1.1.1.1/8.8.8.8, or test with " +
        "`curl --resolve <host>:443:<ip>`. ChatGPT resolves from its own " +
        "servers, so the connector can work even while this check fails.",
    };
  }
  if (code === "ECONNREFUSED") {
    return {
      code: "MCP_DOWN",
      detail: `Nothing accepted the connection at ${host}.`,
      hint: "Run `node tools/tagteam-mcp-up.mjs status`, then `start` if it is down.",
    };
  }
  return { code: "FATAL", detail: String(e?.message || e), hint: null };
}

main().catch((e) => {
  const d = describeFatal(e);
  console.log(
    JSON.stringify({
      ok: false,
      case: "fatal",
      code: d.code,
      error: String(e?.message || e),
      detail: d.detail,
      ...(d.hint ? { hint: d.hint } : {}),
    })
  );
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-http-"));
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const url = `http://127.0.0.1:${port}`;
const token = "local-test-key";
const expected = '😀 quotes " backslash \\ text\n'.repeat(100);
fs.writeFileSync(path.join(root, "wide.txt"), expected);
fs.mkdirSync(path.join(root, ".tagteam"));
fs.writeFileSync(path.join(root, ".tagteam/mcp.token"), token);
const child = spawn(process.execPath, [fileURLToPath(new URL("./http.mjs", import.meta.url))], {
  env: {
    ...process.env,
    PORT: String(port), TAGTEAM_ROOT: root,
    TAGTEAM_MCP_TOKEN: "", MCP_BEARER_TOKEN: "", TAGTEAM_MCP_ALLOW_NO_AUTH: "0",
    TAGTEAM_BUDGET_READ: "1024",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error("The test server exited before readiness.");
    try {
      const response = await fetch(url + "/health", { signal: AbortSignal.timeout(500) });
      assert.equal((await response.json()).root, root);
      healthy = true;
      break;
    } catch { await delay(50); }
  }
  assert.ok(healthy, "The test server did not become ready.");
  assert.ok(!logs.includes("token_preview"));
  assert.ok(!logs.includes("ephemeral"));

  async function call(args, key = token, name = "read_file") {
    const response = await fetch(url + "/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 200) return { status: response.status };
    const raw = await response.text();
    const events = raw.split("\n").filter((line) => line.startsWith("data:"));
    const message = JSON.parse(events.length ? events.at(-1).slice(5) : raw);
    assert.ok(!message.error);
    return { status: response.status, result: message.result };
  }

  assert.equal((await call({ path: "wide.txt" }, "wrong-key")).status, 401);
  const denied = await call({ path: ".tagteam/mcp.token" });
  assert.equal(denied.result.isError, true);
  const oversizedError = await call({ path: "x".repeat(10000) }, token, "list_directory");
  assert.equal(oversizedError.result.isError, true);
  assert.ok(Buffer.byteLength(JSON.stringify(oversizedError.result)) <= 1024);
  let cursor;
  let received = "";
  let pages = 0;
  do {
    const response = await call({ path: "wide.txt", limit: 500, cursor });
    assert.ok(!response.result.isError);
    assert.ok(Buffer.byteLength(JSON.stringify(response.result)) <= 1024);
    const page = JSON.parse(response.result.content[0].text);
    assert.equal(page.returned_bytes, Buffer.byteLength(JSON.stringify(response.result)));
    received += page.content;
    cursor = page.cursor;
    assert.ok(++pages < 100);
  } while (cursor);
  assert.ok(pages > 1);
  assert.equal(received, expected);
  console.log("ok: authenticated HTTP reads preserve content across bounded responses");
} finally {
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (child.exitCode == null && child.signalCode == null) await exited;
  fs.rmSync(root, { recursive: true, force: true });
}

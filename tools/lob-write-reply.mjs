#!/usr/bin/env node
/**
 * Write .lob/last-reply.json for the auto-loop (when AX scrape fails).
 *
 *   node tools/lob-write-reply.mjs --state PLAN --task-id c2c_xxxx [--snippet "…"]
 *   node tools/lob-write-reply.mjs --from-clipboard   # reads OS clipboard (pbpaste / Get-Clipboard)
 *   node tools/lob-write-reply.mjs --from-text "$(cat reply.md)"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseC2C } from "./lib/lob-driver-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".lob", "last-reply.json");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function has(flag) {
  return process.argv.includes(flag);
}

function main() {
  let payload = null;
  if (has("--from-clipboard")) {
    let text = "";
    if (process.platform === "darwin") {
      text = execFileSync("pbpaste", { encoding: "utf8" });
    } else if (process.platform === "win32") {
      text = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Clipboard -Raw",
        ],
        { encoding: "utf8", windowsHide: true }
      );
    } else {
      console.log(
        JSON.stringify({
          ok: false,
          code: "UNSUPPORTED_PLATFORM",
          detail: "clipboard read supports macOS (pbpaste) and Windows (Get-Clipboard)",
        })
      );
      process.exitCode = 1;
      return;
    }
    payload = parseC2C(text);
    if (!payload.ok) {
      console.log(JSON.stringify({ ok: false, code: "NO_STATE", detail: "clipboard has no C2C STATE" }));
      process.exitCode = 1;
      return;
    }
  } else if (has("--from-text")) {
    payload = parseC2C(arg("--from-text", ""));
    if (!payload.ok) {
      console.log(JSON.stringify({ ok: false, code: "NO_STATE" }));
      process.exitCode = 1;
      return;
    }
  } else {
    const state = (arg("--state") || "").toUpperCase();
    if (!state) {
      console.log(
        JSON.stringify({
          ok: false,
          code: "USAGE",
          detail:
            "lob-write-reply.mjs --state PLAN --task-id c2c_… [--snippet …] | --from-clipboard | --from-text …",
        })
      );
      process.exitCode = 1;
      return;
    }
    payload = {
      ok: true,
      state,
      task_id: arg("--task-id"),
      snippet: arg("--snippet", `[C2C]\nSTATE: ${state}\nTASK_ID: ${arg("--task-id") || "?"}`),
    };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, wrote: OUT, state: payload.state, task_id: payload.task_id }));
}

main();

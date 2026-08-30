#!/usr/bin/env node
/**
 * Write .codexgpt/last-reply.json for the auto-loop (when AX scrape fails).
 *
 *   node tools/codexgpt-write-reply.mjs --state PLAN --task-id c2c_xxxx [--snippet "…"]
 *   pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard
 *   node tools/codexgpt-write-reply.mjs --from-text "$(cat reply.md)"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".codexgpt", "last-reply.json");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function has(flag) {
  return process.argv.includes(flag);
}

function parseC2C(text) {
  const states = [...text.matchAll(/STATE:\s*(INIT|PLAN|EXECUTED|DONE|BLOCKED|READY)/gi)];
  if (!states.length) return null;
  const last = states[states.length - 1];
  const state = last[1].toUpperCase();
  const from = last.index;
  const window = text.slice(Math.max(0, from - 40), from + 2000);
  const task = window.match(/TASK_ID:\s*(c2c_[a-zA-Z0-9]+)/i);
  return {
    ok: true,
    state,
    task_id: task ? task[1] : null,
    snippet: window.slice(0, 1200),
  };
}

function main() {
  let payload = null;
  if (has("--from-clipboard")) {
    const text = execFileSync("pbpaste", { encoding: "utf8" });
    payload = parseC2C(text);
    if (!payload) {
      console.log(JSON.stringify({ ok: false, code: "NO_STATE", detail: "clipboard has no C2C STATE" }));
      process.exitCode = 1;
      return;
    }
  } else if (has("--from-text")) {
    payload = parseC2C(arg("--from-text", ""));
    if (!payload) {
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
            "codexgpt-write-reply.mjs --state PLAN --task-id c2c_… [--snippet …] | --from-clipboard | --from-text …",
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

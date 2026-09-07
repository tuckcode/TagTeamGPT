#!/usr/bin/env node
/**
 * TagTeamGPT v2 memory — longer goal/decision notes in the Rhizome vault.
 *
 *   node tools/lob-memory.mjs --action start --task-id c2c_xxxx --goal "…"
 *   node tools/lob-memory.mjs --action finish --task-id c2c_xxxx --goal "…" \
 *     --state DONE|BLOCKED [--snippet "…"] [--iteration N] [--mailbox-path "…"]
 *   node tools/lob-memory.mjs --action decision --task-id c2c_xxxx --decision "…"
 *
 * Env: LOB_RHIZOME_VAULT, LOB_MEMORY=0
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function vaultRoot() {
  return (
    process.env.LOB_RHIZOME_VAULT ||
    path.join(os.homedir(), "Documents", "Rhizome Vault")
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function memoryPath(root, taskId) {
  return path.join(root, "projects", "lob", "memory", `${taskId}.md`);
}

function ensureHub(root) {
  const memDir = path.join(root, "projects", "lob", "memory");
  fs.mkdirSync(memDir, { recursive: true });
  const readme = path.join(memDir, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      `---
type: Note
status: Active
tags: [tagteam, memory]
---

# TagTeamGPT memory

Longer goal and decision notes (not every PLAN). Search: \`tagteam memory\`. Hub: [[../TagTeamGPT|TagTeamGPT]].
`,
      "utf8"
    );
  }
}

function startNote({ taskId, goal }) {
  const date = today();
  return `---
type: Note
status: Active
tags: [tagteam, memory, goal]
task_id: ${taskId}
goal_status: active
date: ${date}
---

# Goal: ${taskId}

Hub: [[../TagTeamGPT|TagTeamGPT]] · Mailbox: [[../mailbox/README|mailbox]]

## Goal

${goal || "_not recorded_"}

## Status

active

## Decisions

_None yet._

## Outcomes

_Pending._

## Open

- Run TagTeamGPT loop to DONE or BLOCKED.
`;
}

function main() {
  if (process.env.LOB_MEMORY === "0") {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "LOB_MEMORY=0" }));
    return;
  }

  const action = arg("--action", "");
  const taskId = arg("--task-id");
  const goal = arg("--goal", "");
  const state = String(arg("--state", "")).toUpperCase();
  const snippet = arg("--snippet", "");
  const iteration = arg("--iteration", "");
  const decision = arg("--decision", "");
  const mailboxRel = arg("--mailbox-path", "");

  if (!taskId || !["start", "finish", "decision"].includes(action)) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "USAGE",
        detail:
          "lob-memory.mjs --action start|finish|decision --task-id c2c_… [--goal …] [--state DONE|BLOCKED] [--decision …]",
      })
    );
    process.exitCode = 1;
    return;
  }

  const root = vaultRoot();
  if (!fs.existsSync(root)) {
    console.log(JSON.stringify({ ok: false, code: "NO_VAULT", detail: root }));
    process.exitCode = 1;
    return;
  }

  ensureHub(root);
  const outPath = memoryPath(root, taskId);
  const rel = path.relative(root, outPath);
  const date = today();

  if (action === "start") {
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, startNote({ taskId, goal }), "utf8");
    } else {
      let t = fs.readFileSync(outPath, "utf8");
      t = t.replace(/goal_status: \w+/, "goal_status: active");
      t = t.replace(/## Status\n\n\w+/, "## Status\n\nactive");
      if (goal && !t.includes(goal.slice(0, 40))) {
        t = t.replace(/## Goal\n\n[\s\S]*?\n\n## Status/, `## Goal\n\n${goal}\n\n## Status`);
      }
      fs.writeFileSync(outPath, t, "utf8");
    }
    console.log(JSON.stringify({ ok: true, action: "start", path: rel, task_id: taskId }));
    return;
  }

  if (action === "decision") {
    if (!decision) {
      console.log(JSON.stringify({ ok: false, code: "USAGE", detail: "--decision required" }));
      process.exitCode = 1;
      return;
    }
    let t = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : startNote({ taskId, goal });
    const line = `- (${date}) ${decision}`;
    if (t.includes("_None yet._")) {
      t = t.replace("_None yet._", line);
    } else {
      t = t.replace(/## Decisions\n\n/, `## Decisions\n\n${line}\n`);
    }
    fs.writeFileSync(outPath, t, "utf8");
    console.log(JSON.stringify({ ok: true, action: "decision", path: rel, task_id: taskId }));
    return;
  }

  // finish
  let t = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : startNote({ taskId, goal });
  const status = state === "BLOCKED" ? "blocked" : "done";
  t = t.replace(/goal_status: \w+/, `goal_status: ${status}`);
  t = t.replace(/## Status\n\n\w+/, `## Status\n\n${status}`);
  const outcome = [
    `- (${date}) ${state || "DONE"} iter ${iteration || "?"} — task \`${taskId}\``,
    mailboxRel ? `  - mailbox: \`${mailboxRel}\`` : "",
    snippet ? `  - snippet:\n\`\`\`\n${snippet.trim().slice(0, 800)}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (t.includes("_Pending._")) {
    t = t.replace("_Pending._", outcome);
  } else {
    t = t.replace(/## Outcomes\n\n/, `## Outcomes\n\n${outcome}\n\n`);
  }
  if (state === "DONE") {
    t = t.replace(/## Open\n\n[\s\S]*$/m, "## Open\n\n_None — goal closed._\n");
  }
  fs.writeFileSync(outPath, t, "utf8");
  console.log(JSON.stringify({ ok: true, action: "finish", path: rel, task_id: taskId, state: status }));
}

main();

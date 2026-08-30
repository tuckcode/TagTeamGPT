#!/usr/bin/env node
/**
 * CodexGPT v2 mailbox — write DONE/BLOCKED notes into the Rhizome vault.
 *
 *   node tools/codexgpt-mailbox.mjs \
 *     --state DONE|BLOCKED --task-id c2c_xxxx --goal "…" [--snippet "…"] [--iteration N]
 *
 * Env:
 *   CODEXGPT_RHIZOME_VAULT  vault root (default: ~/Documents/Rhizome Vault)
 *   CODEXGPT_MAILBOX=0      disable (loop honors this too)
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
    process.env.CODEXGPT_RHIZOME_VAULT ||
    path.join(os.homedir(), "Documents", "Rhizome Vault")
  );
}

function stamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${hh}${mm}` };
}

function main() {
  if (process.env.CODEXGPT_MAILBOX === "0") {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "CODEXGPT_MAILBOX=0" }));
    return;
  }

  const state = String(arg("--state", "")).toUpperCase();
  const taskId = arg("--task-id");
  const goal = arg("--goal", "");
  const snippet = arg("--snippet", "");
  const iteration = arg("--iteration", "?");

  if (!["DONE", "BLOCKED"].includes(state) || !taskId) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "USAGE",
        detail:
          "codexgpt-mailbox.mjs --state DONE|BLOCKED --task-id c2c_… [--goal …] [--snippet …] [--iteration N]",
      })
    );
    process.exitCode = 1;
    return;
  }

  const root = vaultRoot();
  const mailboxDir = path.join(root, "projects", "codexgpt", "mailbox");
  if (!fs.existsSync(root)) {
    console.log(JSON.stringify({ ok: false, code: "NO_VAULT", detail: root }));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(mailboxDir, { recursive: true });
  const { date, time } = stamp();
  const slug = `${date}-${time}-${taskId}-${state.toLowerCase()}.md`;
  const outPath = path.join(mailboxDir, slug);
  const rel = path.relative(root, outPath);

  const body = `---
type: Note
status: Active
tags: [codexgpt, mailbox, c2c, ${state.toLowerCase()}]
task_id: ${taskId}
loop_state: ${state}
iteration: ${iteration}
date: ${date}
---

# CodexGPT ${state}: ${taskId}

Hub: [[../CodexGPT|CodexGPT]]

## Goal

${goal || "_not recorded_"}

## Result

\`\`\`
${(snippet || "").trim() || "(no snippet)"}
\`\`\`

## Search

\`codexgpt mailbox\` · \`task_id: ${taskId}\` · \`${state}\`
`;

  if (fs.existsSync(outPath)) {
    console.log(JSON.stringify({ ok: false, code: "EXISTS", path: rel }));
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(outPath, body, "utf8");
  console.log(JSON.stringify({ ok: true, path: rel, abs: outPath, state, task_id: taskId }));
}

main();

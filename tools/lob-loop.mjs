#!/usr/bin/env node
/**
 * TagTeamGPT auto-loop (macOS + Windows): Chat plans → Codex executes → Chat reviews.
 * Mode hotkeys via driver: macOS Control+1/2/3, Windows Alt+1/2/3.
 *
 *   node tools/lob-loop.mjs --goal "…" [--path /path/to/repo] [--boot]
 *
 * You give the goal and the folder path once. The loop hops Chat ↔ Codex
 * after that. ChatGPT is stolen for ~1s per paste, then given back.
 * Chat/Codex keep generating while you click around. Codex done = <repo>/.lob/executed.json
 * (no focus). Chat reply = poll .lob/last-reply.json (submit_c2c). One Enter on timeout,
 * then NO_REPLY — never Select All, never invent a PLAN.
 *
 * Defaults (lob.config.json / .lob/config.json):
 *   codex: true   — paste PLAN into Codex (⌃3 / Alt+3)
 *   mailbox: true — Rhizome DONE/BLOCKED note
 *   memory: true  — Rhizome goal note
 *   boot: false   — set true or pass --boot to paste boot prompt once
 *
 * Chat INIT / EXECUTED is always on (⌃1 / Alt+1) — that is the loop.
 * Overrides: --no-codex --no-mailbox --no-memory --codex --mailbox --memory --boot
 *
 * Stay on one pinned Chat thread — do not open New chat between turns.
 * Driver ok:true = keys_fired; accepted = next [C2C] STATE or .lob/executed.json.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { loadConfig, flagOrConfig, readSession, writeSession, ROOT, STATE_DIR } from "./lib/lob-config.mjs";
import {
  chatReplyPaths,
  executedJsonPath,
  waitForChatStateWithRetry,
  waitForExecutedFile,
} from "./lib/lob-loop-proof.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.join(__dirname, "lob-driver.mjs");
const MAILBOX = path.join(__dirname, "lob-mailbox.mjs");
const MEMORY = path.join(__dirname, "lob-memory.mjs");
const NUDGE = path.join(__dirname, "lob-mailbox-nudge.mjs");
const PLAN_PATH = path.join(STATE_DIR, "last-plan.md");
const REPLY_PATH = path.join(STATE_DIR, "last-reply.json");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function resolveRepoPath() {
  const raw = arg("--path") || readSession().pwd || ROOT;
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, path: resolved };
  }
  return { ok: true, path: resolved };
}

function runNode(script, args = []) {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 60_000,
  }).trim();
}

function driver(...args) {
  const out = runNode(DRIVER, args);
  try {
    return JSON.parse(out);
  } catch {
    return { ok: false, raw: out };
  }
}

function waitOpts(extra = {}) {
  return {
    replyPath: REPLY_PATH,
    replyPaths: chatReplyPaths(REPLY_PATH, extra.repoPath),
    timeoutMs: extra.timeoutMs ?? loadConfig().chat_wait_ms ?? 10_000,
    taskId: extra.taskId,
    enterOnce: () => driver("enter"),
    log: (obj) => console.error(JSON.stringify(obj)),
  };
}

/** Chat wait + at most one Enter retry. Never scrapes the thread. */
async function waitForChatState(wanted, opts = {}) {
  return waitForChatStateWithRetry(wanted, waitOpts(opts));
}

function chatSend(text) {
  const r = driver("chat-send", text);
  console.error(
    JSON.stringify({
      phase: "driver",
      cmd: "chat-send",
      keys_fired: !!r.ok,
      accepted: false,
      ok: r.ok,
      code: r.code,
      skipped_hotkey: r.skipped_hotkey,
      verified: r.verified,
    })
  );
  return r;
}

function codexSend(text) {
  const r = driver("codex-send", text);
  console.error(
    JSON.stringify({
      phase: "driver",
      cmd: "codex-send",
      keys_fired: !!r.ok,
      accepted: false,
      ok: r.ok,
      code: r.code,
      skipped_hotkey: r.skipped_hotkey,
      verified: r.verified,
    })
  );
  return r;
}

function runHelper(script, args) {
  try {
    return JSON.parse(runNode(script, args));
  } catch (e) {
    const msg = String(e.stdout || e.message || e).slice(0, 400);
    try {
      return JSON.parse(msg);
    } catch {
      return { ok: false, code: "HELPER_FAILED", detail: msg };
    }
  }
}

function recordMailbox({ enabled, state, taskId, goal, snippet, iteration }) {
  if (!enabled || process.env.LOB_MAILBOX === "0") {
    return { ok: true, skipped: true };
  }
  return runHelper(MAILBOX, [
    "--state",
    state,
    "--task-id",
    taskId,
    "--goal",
    goal,
    "--snippet",
    snippet || "",
    "--iteration",
    String(iteration ?? ""),
  ]);
}

function recordMemory(enabled, args) {
  if (!enabled || process.env.LOB_MEMORY === "0") {
    return { ok: true, skipped: true };
  }
  return runHelper(MEMORY, args);
}

function buildCodexHandoff(planText, taskId, iteration, repoPath) {
  return `[C2C]
STATE: PLAN
TASK_ID: ${taskId}
ITERATION: ${iteration}

Execute this TagTeamGPT PLAN now in the open workspace.

HARD PREFLIGHT (do this first):
1. Run: pwd && test -d .git
2. Your pwd MUST be: ${repoPath}
3. If pwd is under ~/Documents/Codex/ or otherwise ≠ that path, STOP and report BLOCKED — you are in a conversation snapshot, not the git checkout. Do not treat green tests there as success.

Do only the ACTIONS. Change only the listed files. When finished, stop and wait — do not invent a Chat reply.

${planText}`;
}

const BOOT = `You are the planning and review layer of a Codex coding session.

Codex owns execution (edit, shell, git, tests).
You own high-level reasoning, planning, and review.

You are talking through the ChatGPT desktop Chat tab. The human (or Codex)
will paste short [C2C] control messages. Reply with [C2C] control messages only
for state changes.

Rules:

1. Do not ask Codex to paste whole files or full diffs unless you truly need a
   short targeted snippet.
2. Produce concise, finite, executable plans — not 40-step epics.
3. After Codex reports EXECUTED, review independently. If the workspace
   connector is enabled, prefer git_diff / read_file over pastes; otherwise
   ask only for a short path list or one targeted snippet when unclear.
4. Continue until SUCCESS_CRITERIA are met, then reply DONE.
5. If you cannot proceed without a human decision, reply BLOCKED with one clear
   NEEDS item.
6. Always return structured [C2C] messages with STATE headers.
7. Be substantive: PLAN needs GOAL, RATIONALE (prose reasoning — not a
   restatement of the checklist), ACTIONS, FILES_LIKELY_INVOLVED, TESTS, and
   SUCCESS_CRITERIA. Never reply with a bare one-liner or ACTIONS-only list.
8. After every PLAN, DONE, BLOCKED, or READY, call the workspace tool submit_c2c
   with your full [C2C] message so the auto-loop can proceed. Do not wait for a
   human to copy.`;

function buildInit(taskId, goal, repoPath) {
  return `[C2C]
STATE: INIT
TASK_ID: ${taskId}
ITERATION: 0

GOAL:
${goal}

REPO:
${repoPath}

INSTRUCTION:
Create an implementation PLAN for Codex to run in that repo path. Keep it finite and executable.
Reply with a C2C PLAN message, then call submit_c2c with that full PLAN text.`;
}

function buildExecuted(taskId, iteration, payload) {
  const result = payload.result || "Execution finished.";
  const changed = payload.changed_files ?? payload.CHANGED_FILES ?? "?";
  const tests = payload.tests || payload.TESTS || "not run";
  return `[C2C]
STATE: EXECUTED
TASK_ID: ${taskId}
ITERATION: ${iteration}

RESULT:
${result}

CHANGED_FILES:
${changed}

TESTS:
${tests}

Please review against SUCCESS_CRITERIA and reply DONE, PLAN (next), or BLOCKED.`;
}

/** Hard-reject checklist-only / empty PLAN before any Codex handoff. */
function validatePlan(planText) {
  const text = String(planText || "");
  const need = [
    ["RATIONALE", /RATIONALE:\s*([\s\S]*?)(?=\n[A-Z][A-Z0-9_]+:|\n*$)/i],
    ["ACTIONS", /ACTIONS:\s*([\s\S]*?)(?=\n[A-Z][A-Z0-9_]+:|\n*$)/i],
    ["SUCCESS_CRITERIA", /SUCCESS_CRITERIA:\s*([\s\S]*?)(?=\n[A-Z][A-Z0-9_]+:|\n*$)/i],
  ];
  const missing = [];
  const bodies = {};
  for (const [name, re] of need) {
    const m = text.match(re);
    const body = (m && m[1] ? m[1] : "").trim();
    bodies[name] = body;
    if (!body || body.length < 12) missing.push(name);
  }
  if (missing.length) {
    return { ok: false, code: "PLAN_SCHEMA", missing, detail: `PLAN missing or thin: ${missing.join(", ")}` };
  }
  if (/^\s*(\d+[\).]|[-*])/.test(bodies.RATIONALE) && !/[a-zA-Z]{20,}/.test(bodies.RATIONALE.replace(/^\s*(\d+[\).]|[-*])\s*/gm, ""))) {
    return {
      ok: false,
      code: "PLAN_CHECKLIST_ONLY",
      detail: "RATIONALE looks like another checklist — need prose reasoning",
    };
  }
  return { ok: true, bodies };
}

function buildPlanReprompt(taskId, iteration, detail) {
  return `[C2C]
STATE: INIT
TASK_ID: ${taskId}
ITERATION: ${iteration}

INSTRUCTION:
Previous PLAN was rejected (${detail}). Reply again with a full C2C PLAN:
GOAL, RATIONALE as prose (not a restatement of ACTIONS), ACTIONS, FILES_LIKELY_INVOLVED, TESTS, SUCCESS_CRITERIA.`;
}

async function onPlan(planText, taskId, iteration, useCodex, repoPath) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PLAN_PATH, planText, "utf8");
  const execPath = executedJsonPath(repoPath);

  if (useCodex) {
    const handoff = buildCodexHandoff(planText, taskId, iteration, repoPath);
    const r = codexSend(handoff);
    console.error(
      JSON.stringify({
        phase: "codex-handoff",
        keys_fired: !!r.ok,
        accepted: false,
        ...r,
        repo: repoPath,
        note:
          r.verified === false
            ? "paste fired; mode unverified — confirm live Codex project thread by eye"
            : r.skipped_hotkey
              ? "already in Codex — pasted without mode-hotkey thrash"
              : "switched to Codex then pasted — confirm live project thread, not empty Continue stub",
      })
    );
    if (!r.ok) return null;
  }

  const hook = process.env.LOB_ON_PLAN;
  if (hook) {
    execFileSync(hook, [PLAN_PATH, taskId, String(iteration)], {
      cwd: repoPath,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, LOB_PLAN: PLAN_PATH, LOB_TASK_ID: taskId, LOB_REPO: repoPath },
    });
    if (fs.existsSync(execPath)) {
      const raw = fs.readFileSync(execPath, "utf8");
      fs.unlinkSync(execPath);
      console.error(JSON.stringify({ phase: "codex-accepted", via: "hook", accepted: true, keys_fired: true }));
      return JSON.parse(raw);
    }
  }
  console.error(
    JSON.stringify({
      waiting: "execution",
      proof: "executed.json",
      write: execPath,
      keys_fired: true,
      accepted: false,
      example: { result: "…", changed_files: 1, tests: "not run" },
    })
  );
  const payload = await waitForExecutedFile(execPath);
  if (payload) {
    console.error(JSON.stringify({ phase: "codex-accepted", via: "executed.json", accepted: true, keys_fired: true }));
  }
  return payload;
}

async function main() {
  const goal = arg("--goal");
  if (!goal) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "USAGE",
        detail:
          'node tools/lob-loop.mjs --goal "…" [--path /path/to/repo] [--boot]',
      })
    );
    process.exitCode = 1;
    return;
  }

  const repo = resolveRepoPath();
  if (!repo.ok) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "BAD_PATH",
        detail: `Repo path is not a folder: ${repo.path}`,
      })
    );
    process.exitCode = 1;
    return;
  }
  const repoPath = repo.path;

  const cfg = loadConfig();
  const useCodex = flagOrConfig(process.argv, "--codex", "--no-codex", "codex", cfg);
  const useMailbox = flagOrConfig(process.argv, "--mailbox", "--no-mailbox", "mailbox", cfg);
  const useMemory = flagOrConfig(process.argv, "--memory", "--no-memory", "memory", cfg);
  const useBoot = flagOrConfig(process.argv, "--boot", "--no-boot", "boot", cfg);

  const max = Number(arg("--max", "12"));
  const taskId = arg("--task-id", `c2c_${randomBytes(2).toString("hex")}`);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeSession({ goal, pwd: repoPath, task_id: taskId });
  for (const p of chatReplyPaths(REPLY_PATH, repoPath)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  console.error(
    JSON.stringify({
      phase: "start",
      task_id: taskId,
      goal,
      path: repoPath,
      defaults: { chat: true, codex: useCodex, mailbox: useMailbox, memory: useMemory, boot: useBoot },
    })
  );

  const memStart = recordMemory(useMemory, [
    "--action",
    "start",
    "--task-id",
    taskId,
    "--goal",
    goal,
  ]);
  console.error(JSON.stringify({ phase: "memory-start", ...memStart }));

  if (useBoot) {
    const b = driver("send", "--mode", "chat", BOOT);
    console.error(JSON.stringify({ phase: "boot", keys_fired: !!b.ok, accepted: false, ...b }));
    const ready = await waitForChatState(["READY"], { timeoutMs: 20_000, repoPath });
    console.error(JSON.stringify({ phase: "boot-wait", keys_fired: true, accepted: !!ready.ok, state: ready.state, code: ready.code }));
  }

  let iteration = 0;
  let send = chatSend(buildInit(taskId, goal, repoPath));
  console.error(JSON.stringify({ phase: "init", keys_fired: !!send.ok, accepted: false, ...send }));
  if (!send.ok) {
    process.exitCode = 1;
    return;
  }

  while (iteration < max) {
    const reply = await waitForChatState(["PLAN", "DONE", "BLOCKED"], { taskId, repoPath });
    if (!reply.ok) {
      console.log(JSON.stringify(reply));
      process.exitCode = 1;
      return;
    }
    console.error(
      JSON.stringify({
        phase: "chat",
        state: reply.state,
        task_id: reply.task_id,
        keys_fired: true,
        accepted: true,
      })
    );

    const state = String(reply.state).toUpperCase();
    if (state === "DONE" || state === "BLOCKED") {
      const mail = recordMailbox({
        enabled: useMailbox,
        state,
        taskId,
        goal,
        snippet: reply.snippet,
        iteration,
      });
      console.error(JSON.stringify({ phase: "mailbox", ...mail }));
      const mem = recordMemory(useMemory, [
        "--action",
        "finish",
        "--task-id",
        taskId,
        "--goal",
        goal,
        "--state",
        state,
        "--snippet",
        reply.snippet || "",
        "--iteration",
        String(iteration),
        ...(mail.path ? ["--mailbox-path", mail.path] : []),
      ]);
      console.error(JSON.stringify({ phase: "memory-finish", ...mem }));
      const nudge = runHelper(NUDGE, []);
      if (nudge.nudge) console.error(JSON.stringify({ phase: "mailbox-nudge", ...nudge }));
      console.log(
        JSON.stringify({
          ok: true,
          state,
          task_id: taskId,
          iteration,
          snippet: reply.snippet,
          mailbox: mail,
          memory: mem,
          mailbox_nudge: nudge,
          keys_fired: true,
          accepted: true,
        })
      );
      return;
    }

    const gate = validatePlan(reply.snippet);
    if (!gate.ok) {
      console.error(JSON.stringify({ phase: "plan-reject", ...gate }));
      const again = chatSend(buildPlanReprompt(taskId, iteration, gate.detail || gate.code));
      console.error(JSON.stringify({ phase: "plan-reprompt", keys_fired: !!again.ok, accepted: false, ...again }));
      if (!again.ok) {
        console.log(JSON.stringify({ ok: false, code: "PLAN_REPROMPT_FAILED", gate }));
        process.exitCode = 1;
        return;
      }
      continue;
    }

    iteration += 1;
    const execPayload = await onPlan(reply.snippet, taskId, iteration, useCodex, repoPath);
    if (!execPayload) {
      console.log(
        JSON.stringify({
          ok: false,
          code: "EXEC_TIMEOUT",
          plan: PLAN_PATH,
          keys_fired: true,
          accepted: false,
          detail: "No .lob/executed.json — Codex proof is that file only",
        })
      );
      process.exitCode = 1;
      return;
    }
    send = chatSend(buildExecuted(taskId, iteration, execPayload));
    console.error(JSON.stringify({ phase: "executed", keys_fired: !!send.ok, accepted: false, ...send }));
    if (!send.ok) {
      process.exitCode = 1;
      return;
    }
  }

  console.log(JSON.stringify({ ok: false, code: "MAX_ITERATIONS", max, task_id: taskId }));
  process.exitCode = 1;
}

main();

#!/usr/bin/env node
/**
 * CodexGPT auto-loop (macOS + Windows): Chat plans → Codex executes → Chat reviews.
 * Mode hotkeys via driver: macOS Control+1/2/3, Windows Alt+1/2/3.
 *
 *   node tools/codexgpt-loop.mjs --goal "…"
 *
 * Defaults (codexgpt.config.json / .codexgpt/config.json):
 *   codex: true   — paste PLAN into Codex (⌃3 / Alt+3)
 *   mailbox: true — Rhizome DONE/BLOCKED note
 *   memory: true  — Rhizome goal note
 *   boot: false   — set true or pass --boot to paste boot prompt once
 *
 * Chat INIT / EXECUTED is always on (⌃1 / Alt+1) — that is the loop.
 * Overrides: --no-codex --no-mailbox --no-memory --codex --mailbox --memory --boot
 *
 * Stay on one pinned Chat thread — do not open New chat between turns.
 * Driver ok:true = keys_fired; accepted = next [C2C] STATE or .codexgpt/executed.json.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { loadConfig, flagOrConfig, ROOT, STATE_DIR } from "./lib/codexgpt-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.join(__dirname, "codexgpt-driver.mjs");
const READER = path.join(__dirname, "codexgpt-read-reply.mjs");
const MAILBOX = path.join(__dirname, "codexgpt-mailbox.mjs");
const MEMORY = path.join(__dirname, "codexgpt-memory.mjs");
const NUDGE = path.join(__dirname, "codexgpt-mailbox-nudge.mjs");
const PLAN_PATH = path.join(STATE_DIR, "last-plan.md");
const EXEC_PATH = path.join(STATE_DIR, "executed.json");
const REPLY_PATH = path.join(STATE_DIR, "last-reply.json");

const WIN_CLIP_HINT =
  "Get-Clipboard -Raw | node tools/codexgpt-write-reply.mjs --from-clipboard";

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
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

function peekReplyFile() {
  if (!fs.existsSync(REPLY_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(REPLY_PATH, "utf8"));
    if (parsed && parsed.state) return { ok: true, ...parsed, _from_file: true };
  } catch {
    /* ignore */
  }
  return null;
}

function consumeReplyFile() {
  if (fs.existsSync(REPLY_PATH)) {
    try {
      fs.unlinkSync(REPLY_PATH);
    } catch {
      /* ignore */
    }
  }
}

function readReply() {
  const fromFile = peekReplyFile();
  if (fromFile) return fromFile;
  try {
    return JSON.parse(runNode(READER, []));
  } catch (e) {
    const msg = String(e.stdout || e.message || e);
    try {
      return JSON.parse(msg);
    } catch {
      return { ok: false, code: "READ_FAILED", detail: msg.slice(0, 300) };
    }
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function noReplyPayload(last) {
  const hint =
    process.platform === "win32"
      ? WIN_CLIP_HINT
      : "pbpaste | node tools/codexgpt-write-reply.mjs --from-clipboard";
  return {
    ok: false,
    code: "NO_REPLY",
    last,
    hint,
    keys_fired: true,
    accepted: false,
  };
}

async function waitForState(wanted, { timeoutMs = 180_000, pollMs = 2000, taskId } = {}) {
  const want = new Set(wanted.map((s) => s.toUpperCase()));
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = readReply();
    if (
      last.ok &&
      want.has(String(last.state).toUpperCase()) &&
      (!taskId || !last.task_id || last.task_id === taskId)
    ) {
      if (last._from_file) consumeReplyFile();
      return { ...last, accepted: true };
    }
    await sleep(pollMs);
  }
  return { ok: false, code: "TIMEOUT", last };
}

/** Chat wait: on timeout, one driver enter, wait again, then NO_REPLY. */
async function waitForChatState(wanted, opts = {}) {
  const first = await waitForState(wanted, opts);
  if (first.ok) return first;

  console.error(
    JSON.stringify({
      phase: "chat-wait-miss",
      action: "enter-once",
      keys_fired: true,
      accepted: false,
    })
  );
  const enter = driver("enter");
  console.error(JSON.stringify({ phase: "chat-enter-retry", ...enter, keys_fired: !!enter.ok, accepted: false }));

  const second = await waitForState(wanted, {
    ...opts,
    timeoutMs: Math.min(opts.timeoutMs ?? 180_000, 90_000),
  });
  if (second.ok) return second;
  return noReplyPayload(second.last || first.last);
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
  if (!enabled || process.env.CODEXGPT_MAILBOX === "0") {
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
  if (!enabled || process.env.CODEXGPT_MEMORY === "0") {
    return { ok: true, skipped: true };
  }
  return runHelper(MEMORY, args);
}

function buildCodexHandoff(planText, taskId, iteration) {
  return `[C2C]
STATE: PLAN
TASK_ID: ${taskId}
ITERATION: ${iteration}

Execute this CodexGPT PLAN now in the open workspace.

HARD PREFLIGHT (do this first):
1. Run: pwd && test -d .git && test -f package.json
2. Your pwd MUST be: ${ROOT}
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
   SUCCESS_CRITERIA. Never reply with a bare one-liner or ACTIONS-only list.`;

function buildInit(taskId, goal) {
  return `[C2C]
STATE: INIT
TASK_ID: ${taskId}
ITERATION: 0

GOAL:
${goal}

INSTRUCTION:
Create an implementation PLAN for Codex. Keep it finite and executable.
Reply with a C2C PLAN message.`;
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

async function waitForExecutedFile({ timeoutMs = 600_000, pollMs = 1500 } = {}) {
  const start = Date.now();
  if (fs.existsSync(EXEC_PATH)) fs.unlinkSync(EXEC_PATH);
  console.error(
    JSON.stringify({
      waiting: "execution",
      proof: "executed.json",
      write: EXEC_PATH,
      keys_fired: true,
      accepted: false,
      example: { result: "…", changed_files: 1, tests: "not run" },
    })
  );
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(EXEC_PATH)) {
      const raw = fs.readFileSync(EXEC_PATH, "utf8");
      fs.unlinkSync(EXEC_PATH);
      return JSON.parse(raw);
    }
    await sleep(pollMs);
  }
  return null;
}

async function onPlan(planText, taskId, iteration, useCodex) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PLAN_PATH, planText, "utf8");

  if (useCodex) {
    const handoff = buildCodexHandoff(planText, taskId, iteration);
    const r = codexSend(handoff);
    console.error(
      JSON.stringify({
        phase: "codex-handoff",
        keys_fired: !!r.ok,
        accepted: false,
        ...r,
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

  const hook = process.env.CODEXGPT_ON_PLAN;
  if (hook) {
    execFileSync(hook, [PLAN_PATH, taskId, String(iteration)], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, CODEXGPT_PLAN: PLAN_PATH, CODEXGPT_TASK_ID: taskId },
    });
    if (fs.existsSync(EXEC_PATH)) {
      const raw = fs.readFileSync(EXEC_PATH, "utf8");
      fs.unlinkSync(EXEC_PATH);
      console.error(JSON.stringify({ phase: "codex-accepted", via: "hook", accepted: true, keys_fired: true }));
      return JSON.parse(raw);
    }
  }
  const payload = await waitForExecutedFile();
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
          'node tools/codexgpt-loop.mjs --goal "…"  # Chat+Codex+mailbox+memory by default',
      })
    );
    process.exitCode = 1;
    return;
  }

  const cfg = loadConfig();
  const useCodex = flagOrConfig(process.argv, "--codex", "--no-codex", "codex", cfg);
  const useMailbox = flagOrConfig(process.argv, "--mailbox", "--no-mailbox", "mailbox", cfg);
  const useMemory = flagOrConfig(process.argv, "--memory", "--no-memory", "memory", cfg);
  const useBoot = flagOrConfig(process.argv, "--boot", "--no-boot", "boot", cfg);

  const max = Number(arg("--max", "12"));
  const taskId = arg("--task-id", `c2c_${randomBytes(2).toString("hex")}`);
  fs.mkdirSync(STATE_DIR, { recursive: true });

  console.error(
    JSON.stringify({
      phase: "start",
      task_id: taskId,
      goal,
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
    // Boot prose is not a C2C stub — mode switch + unrestricted send.
    const mode = driver("to", "chat");
    const b = mode.ok || mode.code === "MODE_ELEMENT_NOT_FOUND" ? driver("send", BOOT) : mode;
    console.error(JSON.stringify({ phase: "boot", keys_fired: !!b.ok, accepted: false, ...b }));
    await sleep(2500);
  }

  let iteration = 0;
  let send = chatSend(buildInit(taskId, goal));
  console.error(JSON.stringify({ phase: "init", keys_fired: !!send.ok, accepted: false, ...send }));
  if (!send.ok) {
    process.exitCode = 1;
    return;
  }

  while (iteration < max) {
    const reply = await waitForChatState(["PLAN", "DONE", "BLOCKED"], { taskId });
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
    const execPayload = await onPlan(reply.snippet, taskId, iteration, useCodex);
    if (!execPayload) {
      console.log(
        JSON.stringify({
          ok: false,
          code: "EXEC_TIMEOUT",
          plan: PLAN_PATH,
          keys_fired: true,
          accepted: false,
          detail: "No .codexgpt/executed.json — Codex proof is that file only",
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

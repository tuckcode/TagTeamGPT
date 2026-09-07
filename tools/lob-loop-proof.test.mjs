#!/usr/bin/env node
/** Tiny unit tests for loop proof: keys_fired vs accepted, one Enter, NO_REPLY, executed.json. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  WIN_CLIP_HINT,
  POSIX_CLIP_HINT,
  clipboardHint,
  chatReplyPaths,
  executedJsonPath,
  noReplyPayload,
  peekReplyFile,
  replyMatches,
  waitForChatState,
  waitForChatStateWithRetry,
  waitForExecutedFile,
} from "./lib/lob-loop-proof.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE_REPLY = path.join(__dirname, "lob-write-reply.mjs");

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

const nr = noReplyPayload(null, "win32");
assert.equal(nr.code, "NO_REPLY");
assert.equal(nr.ok, false);
assert.equal(nr.accepted, false);
assert.equal(nr.keys_fired, true);
assert.equal(nr.hint, WIN_CLIP_HINT);
assert.match(nr.hint, /Get-Clipboard -Raw/);
assert.match(nr.hint, /lob-write-reply\.mjs --from-clipboard/);
assert.equal(noReplyPayload(null, "darwin").hint, POSIX_CLIP_HINT);
assert.equal(clipboardHint("win32"), WIN_CLIP_HINT);

assert.equal(executedJsonPath("/tmp/goal-repo"), path.join("/tmp/goal-repo", ".lob", "executed.json"));

const stateReply = "/tmp/lob-tool/.lob/last-reply.json";
const paths = chatReplyPaths(stateReply, "/tmp/goal-repo");
assert.equal(paths.length, 2);
assert.ok(paths.includes(path.join("/tmp/goal-repo", ".lob", "last-reply.json")));
assert.equal(chatReplyPaths(stateReply, "/tmp/lob-tool").length, 1);

assert.equal(replyMatches({ ok: true, state: "PLAN" }, ["PLAN"], null), true);
assert.equal(replyMatches({ ok: true, state: "DONE" }, ["PLAN", "DONE"], "c2c_ab"), true);
assert.equal(replyMatches({ ok: true, state: "PLAN", task_id: "c2c_zz" }, ["PLAN"], "c2c_ab"), false);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lob-proof-"));
const replyPath = path.join(dir, "last-reply.json");
assert.equal(peekReplyFile(replyPath), null);
fs.writeFileSync(replyPath, "{not json", "utf8");
assert.equal(peekReplyFile(replyPath), null, "malformed last-reply is not a fake PLAN");
fs.writeFileSync(replyPath, JSON.stringify({ ok: true }), "utf8");
assert.equal(peekReplyFile(replyPath), null, "missing state is not a fake PLAN");

{
  const clock = fakeClock();
  const miss = await waitForChatState(["PLAN"], {
    replyPath,
    timeoutMs: 100,
    pollMs: 40,
    now: clock.now,
    sleep: clock.sleep,
    platform: "win32",
  });
  assert.equal(miss.code, "NO_REPLY");
  assert.equal(miss.accepted, false);
  assert.equal(miss.hint, WIN_CLIP_HINT);
}

fs.writeFileSync(
  replyPath,
  JSON.stringify({ ok: true, state: "PLAN", task_id: "c2c_ab", snippet: "[C2C]\nSTATE: PLAN\n" }),
  "utf8"
);
{
  const clock = fakeClock();
  const hit = await waitForChatState(["PLAN"], {
    replyPath,
    timeoutMs: 100,
    pollMs: 40,
    taskId: "c2c_ab",
    now: clock.now,
    sleep: clock.sleep,
  });
  assert.equal(hit.accepted, true);
  assert.equal(hit.state, "PLAN");
  assert.equal(fs.existsSync(replyPath), false, "matched last-reply.json is consumed");
}

{
  let enters = 0;
  const clock = fakeClock();
  const miss = await waitForChatStateWithRetry(["PLAN"], {
    replyPath,
    timeoutMs: 50,
    pollMs: 25,
    now: clock.now,
    sleep: clock.sleep,
    platform: "win32",
    enterOnce: () => {
      enters += 1;
      return { ok: true };
    },
  });
  assert.equal(enters, 1, "Enter retry at most once");
  assert.equal(miss.code, "NO_REPLY");
  assert.equal(miss.accepted, false);
}

{
  let enters = 0;
  const clock = fakeClock();
  const hit = await waitForChatStateWithRetry(["DONE"], {
    replyPath,
    timeoutMs: 50,
    pollMs: 25,
    now: clock.now,
    sleep: clock.sleep,
    enterOnce: () => {
      enters += 1;
      fs.writeFileSync(
        replyPath,
        JSON.stringify({ ok: true, state: "DONE", task_id: "c2c_ab", snippet: "ok" }),
        "utf8"
      );
      return { ok: true };
    },
  });
  assert.equal(enters, 1);
  assert.equal(hit.accepted, true);
  assert.equal(hit.enter_retry, true);
  assert.equal(hit.state, "DONE");
}

{
  let enters = 0;
  fs.writeFileSync(
    replyPath,
    JSON.stringify({ ok: true, state: "PLAN", snippet: "filed" }),
    "utf8"
  );
  const clock = fakeClock();
  const hit = await waitForChatStateWithRetry(["PLAN"], {
    replyPath,
    timeoutMs: 50,
    pollMs: 25,
    now: clock.now,
    sleep: clock.sleep,
    enterOnce: () => {
      enters += 1;
      return { ok: true };
    },
  });
  assert.equal(enters, 0, "no Enter when last-reply.json already matches");
  assert.equal(hit.accepted, true);
}

const execPath = executedJsonPath(dir);
{
  const clock = fakeClock();
  const none = await waitForExecutedFile(execPath, {
    timeoutMs: 40,
    pollMs: 20,
    now: clock.now,
    sleep: clock.sleep,
  });
  assert.equal(none, null);
}

{
  const clock = fakeClock();
  const sleep = async (ms) => {
    clock.sleep(ms);
    if (!fs.existsSync(execPath)) {
      fs.mkdirSync(path.dirname(execPath), { recursive: true });
      fs.writeFileSync(execPath, JSON.stringify({ result: "dunked", changed_files: 1 }), "utf8");
    }
  };
  const payload = await waitForExecutedFile(execPath, {
    timeoutMs: 80,
    pollMs: 20,
    now: clock.now,
    sleep,
  });
  assert.equal(payload.result, "dunked");
  assert.equal(fs.existsSync(execPath), false, "executed.json is consumed after proof");
}

const noState = spawnSync(
  process.execPath,
  [WRITE_REPLY, "--from-text", "hello no headers"],
  { encoding: "utf8" }
);
assert.match(noState.stdout, /NO_STATE/);
assert.notEqual(noState.status, 0, "write-reply does not fake PLAN from empty clipboard text");

const liveReply = path.join(__dirname, "..", ".lob", "last-reply.json");
const backup = fs.existsSync(liveReply) ? fs.readFileSync(liveReply, "utf8") : null;
try {
  const piped = spawnSync(process.execPath, [WRITE_REPLY, "--from-clipboard"], {
    encoding: "utf8",
    input: "[C2C]\nSTATE: BLOCKED\nTASK_ID: c2c_pipe\nNEEDS:\nwait\n",
  });
  assert.equal(piped.status, 0, piped.stdout + piped.stderr);
  assert.match(piped.stdout, /BLOCKED/);
} finally {
  if (backup == null) {
    try {
      fs.unlinkSync(liveReply);
    } catch {
      /* ignore */
    }
  } else {
    fs.writeFileSync(liveReply, backup, "utf8");
  }
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("ok: lob-loop-proof.test.mjs");

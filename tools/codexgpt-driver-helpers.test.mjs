#!/usr/bin/env node
/** Tiny unit tests for driver helpers — no osascript / SendKeys. */
import assert from "node:assert/strict";
import {
  resolveTiming,
  hasC2CPrefix,
  clipboardMatches,
  settleBackoffMs,
  ocrEnabled,
  parseModeLabel,
  modesMatch,
  isWorkMode,
  parseC2C,
  TIMING_DEFAULTS,
} from "./lib/codexgpt-driver-helpers.mjs";

assert.deepEqual(resolveTiming({}, {}), TIMING_DEFAULTS);
assert.equal(
  resolveTiming({ focus_ms: 500 }, { CODEXGPT_FOCUS_MS: "90" }).focus_ms,
  90,
  "env beats config"
);
assert.equal(resolveTiming({ paste_ms: 99 }, {}).paste_ms, 99);
assert.equal(resolveTiming({}, { CODEXGPT_ENTER_MS: "nope" }).enter_ms, 250);

assert.equal(hasC2CPrefix("[C2C]\nSTATE: INIT"), true);
assert.equal(hasC2CPrefix("  [C2C]\n"), true);
assert.equal(hasC2CPrefix("hello"), false);
assert.equal(hasC2CPrefix(""), false);

assert.equal(clipboardMatches("a\nb", "a\r\nb"), true);
assert.equal(clipboardMatches("x", "y"), false);

assert.equal(settleBackoffMs(0), 200);
assert.equal(settleBackoffMs(1), 400);
assert.equal(settleBackoffMs(2), 800);
assert.equal(settleBackoffMs(99), 800);

assert.equal(ocrEnabled([], {}, {}), false);
assert.equal(ocrEnabled(["--verify-vision"], {}, {}), true);
assert.equal(ocrEnabled([], { CODEXGPT_OCR: "1" }, {}), true);
assert.equal(ocrEnabled([], {}, { ocr: true }), true);

assert.equal(parseModeLabel("current mode: ChatGPT"), "ChatGPT");
assert.equal(parseModeLabel("current mode: Work"), "Work");
assert.equal(parseModeLabel("Codex"), "Codex");
assert.equal(modesMatch("ChatGPT", "ChatGPT"), true);
assert.equal(modesMatch("Chat", "ChatGPT"), true);
assert.equal(isWorkMode("Work"), true);
assert.equal(isWorkMode("ChatGPT"), false);

const c2c = parseC2C("x\n[C2C]\nSTATE: PLAN\nTASK_ID: c2c_ab\n");
assert.equal(c2c.ok, true);
assert.equal(c2c.state, "PLAN");
assert.equal(c2c.task_id, "c2c_ab");
assert.equal(parseC2C("nope").ok, false);

console.log("ok: codexgpt-driver-helpers.test.mjs");

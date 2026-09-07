#!/usr/bin/env node
/** Tiny unit tests for driver helpers — no osascript / SendKeys. */
import assert from "node:assert/strict";
import {
  resolveTiming,
  hasC2CPrefix,
  clipboardMatches,
  settleBackoffMs,
  pasteSettleMs,
  ocrEnabled,
  parseModeLabel,
  modesMatch,
  isWorkMode,
  skipModeHotkeyBeforePaste,
  parseC2C,
  parseLastJsonLine,
  TIMING_DEFAULTS,
} from "./lib/lob-driver-helpers.mjs";

assert.deepEqual(resolveTiming({}, {}), TIMING_DEFAULTS);
assert.equal(
  resolveTiming({ focus_ms: 500 }, { LOB_FOCUS_MS: "90" }).focus_ms,
  90,
  "env beats config"
);
assert.equal(resolveTiming({ paste_ms: 99 }, {}).paste_ms, 99);
assert.equal(resolveTiming({}, { LOB_ENTER_MS: "nope" }).enter_ms, 250);
assert.equal(resolveTiming({}, {}).focus_retries, 4);
assert.equal(resolveTiming({}, { LOB_FOCUS_RETRY_MS: "25" }).focus_retry_ms, 25);
assert.equal(resolveTiming({ focus_retries: 8 }, {}).focus_retries, 8);

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
assert.equal(pasteSettleMs({}, { hotkey: true }), 350);
assert.equal(pasteSettleMs({}, { hotkey: true, verify: true }), 800);
assert.equal(pasteSettleMs({}, { hotkey: false, verify: true }), 0);

assert.equal(ocrEnabled([], {}, {}), false);
assert.equal(ocrEnabled(["--verify"], {}, {}), false, "--verify is not OCR");
assert.equal(ocrEnabled(["--verify-vision"], {}, {}), true);
assert.equal(ocrEnabled([], { LOB_OCR: "1" }, {}), true);
assert.equal(ocrEnabled([], {}, { ocr: true }), true);

assert.equal(parseModeLabel("current mode: ChatGPT"), "ChatGPT");
assert.equal(parseModeLabel("current mode: Work"), "Work");
assert.equal(parseModeLabel("Codex"), "Codex");
assert.equal(modesMatch("ChatGPT", "ChatGPT"), true);
assert.equal(modesMatch("Chat", "ChatGPT"), true);
assert.equal(isWorkMode("Work"), true);
assert.equal(isWorkMode("ChatGPT"), false);
assert.equal(
  skipModeHotkeyBeforePaste("codex", { beforeOk: true, beforeMode: "Codex" }),
  false,
  "Codex paste always fires Control+3 / Alt+3"
);
assert.equal(
  skipModeHotkeyBeforePaste("chat", { beforeOk: true, beforeMode: "ChatGPT" }),
  true
);
assert.equal(
  skipModeHotkeyBeforePaste("chat", { beforeOk: true, beforeMode: "Codex" }),
  false
);
assert.equal(
  skipModeHotkeyBeforePaste("chat", {
    beforeOk: false,
    lastMode: "ChatGPT",
  }),
  true,
  "session last_mode Chat skips Control+1 without an AX scan"
);
assert.equal(
  skipModeHotkeyBeforePaste("chat", { beforeOk: false }),
  false,
  "unknown mode still presses Control+1 so we leave Codex"
);
assert.equal(
  skipModeHotkeyBeforePaste("chat", {
    beforeOk: true,
    beforeMode: "ChatGPT",
    force: true,
  }),
  false,
  "--force-mode still fires Control+1"
);

const c2c = parseC2C("x\n[C2C]\nSTATE: PLAN\nTASK_ID: c2c_ab\n");
assert.equal(c2c.ok, true);
assert.equal(c2c.state, "PLAN");
assert.equal(c2c.task_id, "c2c_ab");
assert.equal(parseC2C("nope").ok, false);

assert.equal(parseLastJsonLine(""), null);
assert.equal(parseLastJsonLine("ok\nnot json"), null);
assert.deepEqual(parseLastJsonLine('noise\n{"ok":true,"focus_ok":true}\n'), {
  ok: true,
  focus_ok: true,
});
assert.equal(
  parseLastJsonLine('{"ok":false}\n{"ok":true,"chatgpt_hwnd":123}').chatgpt_hwnd,
  123,
  "last JSON line wins"
);

console.log("ok: lob-driver-helpers.test.mjs");

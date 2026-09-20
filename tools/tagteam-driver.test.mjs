#!/usr/bin/env node
/** Source contracts for the keystroke driver — no osascript / live SendInput. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "tagteam-driver.mjs"),
  "utf8"
);

assert.match(src, /SendInput/, "Windows injector is SendInput");
assert.match(src, /"-STA"/, "PowerShell runs STA for WinForms clipboard + SendInput");
assert.match(src, /SendChord/, "chords are one SendInput array with key-up");
assert.match(src, /KEYEVENTF_KEYUP/, "key-up is explicit (SendKeys leaves Alt stuck)");
assert.doesNotMatch(src, /SendWait/, "SendKeys.SendWait is gone");
assert.doesNotMatch(src, /SendKeys\]::/, "System.Windows.Forms.SendKeys is gone");

assert.match(src, /function ensureFront/, "macOS polls frontmost before keys");
assert.match(src, /AXRaise/, "macOS raises the named ChatGPT window");
assert.match(src, /assertFront\(\);\s*\n\s*se\.keystroke\('v'/, "macOS checks frontmost immediately before ⌘V");

console.log("ok: tagteam-driver.test.mjs");

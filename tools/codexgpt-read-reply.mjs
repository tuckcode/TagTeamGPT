#!/usr/bin/env node
// Best-effort read of the latest [C2C] STATE from ChatGPT desktop (macOS).
// Uses Accessibility text only — no screenshots.
//
//   node tools/codexgpt-read-reply.mjs
//   → {"ok":true,"state":"PLAN","task_id":"c2c_…","snippet":"…"}

import { execFileSync } from "node:child_process";

const APP = "ChatGPT";

function jxa(body) {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", body], {
    encoding: "utf8",
    timeout: 45_000,
  }).trim();
}

function classify(e) {
  const msg = String((e && e.stderr) || e.message || e);
  if (/APP_NOT_RUNNING/.test(msg)) return { ok: false, code: "APP_NOT_RUNNING" };
  if (/assistive|not allowed|-25211|-1719/i.test(msg))
    return { ok: false, code: "NO_ACCESSIBILITY", detail: "Grant Accessibility to Terminal/Cursor" };
  return { ok: false, code: "OSA_ERROR", detail: msg.slice(0, 400) };
}

function scrape() {
  const raw = jxa(`
    const se = Application('System Events');
    const procs = se.processes.whose({ name: ${JSON.stringify(APP)} });
    if (procs.length === 0) throw new Error('APP_NOT_RUNNING');
    const p = procs[0];
    const chunks = [];
    function walk(el, d) {
      if (d > 22 || chunks.length > 4000) return;
      let t = '';
      try { t = String(el.value() || ''); } catch (e) {}
      if (!t) { try { t = String(el.description() || ''); } catch (e) {} }
      if (!t) { try { t = String(el.name() || ''); } catch (e) {} }
      if (t && t.length < 2000) chunks.push(t);
      let kids = [];
      try { kids = el.uiElements(); } catch (e) {}
      for (let i = 0; i < kids.length; i++) walk(kids[i], d + 1);
    }
    for (let w = 0; w < p.windows.length; w++) walk(p.windows[w], 0);
    chunks.join('\\n');
  `);
  return raw;
}

function parseC2C(text) {
  // Prefer the last STATE: occurrence (latest assistant turn).
  const states = [...text.matchAll(/STATE:\s*(INIT|PLAN|EXECUTED|DONE|BLOCKED|READY)/gi)];
  if (!states.length) return { ok: false, code: "NO_STATE", detail: "No C2C STATE found in AX text" };
  const last = states[states.length - 1];
  const state = last[1].toUpperCase();
  const from = last.index;
  const window = text.slice(Math.max(0, from - 40), from + 1200);
  const task = window.match(/TASK_ID:\s*(c2c_[a-zA-Z0-9]+)/i);
  return {
    ok: true,
    state,
    task_id: task ? task[1] : null,
    snippet: window.slice(0, 800),
  };
}

try {
  const text = scrape();
  const parsed = parseC2C(text);
  console.log(JSON.stringify(parsed));
  process.exitCode = parsed.ok ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify(classify(e)));
  process.exitCode = 1;
}

#!/usr/bin/env node
// Best-effort read of the latest [C2C] STATE from ChatGPT desktop.
// Do not Select All the thread (that highlights the prompt + reply and
// steals the next paste). Copy is last-reply.json or a single Cmd+C.
//
//   node tools/lob-read-reply.mjs
//   node tools/lob-read-reply.mjs --grab   # Cmd+C only, no Cmd+A
//
// Windows: UIA dump is best-effort; if empty, returns NO_STATE (loop still
// polls .lob/last-reply.json). Hint:
//   Get-Clipboard -Raw | node tools/lob-write-reply.mjs --from-clipboard

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATE_DIR } from "./lib/lob-config.mjs";

const APP = "ChatGPT";
const PLATFORM = process.platform;

function jxa(body) {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", body], {
    encoding: "utf8",
    timeout: 45_000,
  }).trim();
}

function grabMac() {
  return jxa(`
    const se = Application('System Events');
    const procs = se.processes.whose({ name: ${JSON.stringify(APP)} });
    if (procs.length === 0) throw new Error('APP_NOT_RUNNING');
    const p = procs[0];
    let prev = '';
    try {
      const fp = se.applicationProcesses.whose({ frontmost: true });
      if (fp.length) prev = String(fp[0].name());
    } catch (e) {}
    p.frontmost = true;
    delay(0.2);
    se.keystroke('c', { using: ['command down'] });
    delay(0.12);
    if (prev && prev !== ${JSON.stringify(APP)}) {
      try { Application(prev).activate(); } catch (e) {}
    }
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    String(app.theClipboard());
  `);
}

function persistReply(parsed) {
  if (!parsed.ok) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(STATE_DIR, "last-reply.json"),
    JSON.stringify({ ok: true, state: parsed.state, task_id: parsed.task_id, snippet: parsed.snippet }, null, 2) +
      "\n"
  );
}

function peekPersistedReply() {
  const p = path.join(STATE_DIR, "last-reply.json");
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    if (parsed && parsed.state) return { ok: true, ...parsed, _from_file: true };
  } catch {
    /* never invent PLAN */
  }
  return null;
}

function emptyHint() {
  return PLATFORM === "win32"
    ? "Get-Clipboard -Raw | node tools/lob-write-reply.mjs --from-clipboard"
    : "pbpaste | node tools/lob-write-reply.mjs --from-clipboard";
}

function classifyMac(e) {
  const msg = String((e && e.stderr) || e.message || e);
  if (/APP_NOT_RUNNING/.test(msg)) return { ok: false, code: "APP_NOT_RUNNING" };
  if (/assistive|not allowed|-25211|-1719/i.test(msg))
    return { ok: false, code: "NO_ACCESSIBILITY", detail: "Grant Accessibility to Terminal/Cursor" };
  return { ok: false, code: "OSA_ERROR", detail: msg.slice(0, 400) };
}

function scrapeMac() {
  return jxa(`
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
      if (t && t.length < 20000) chunks.push(t);
      let kids = [];
      try { kids = el.uiElements(); } catch (e) {}
      for (let i = 0; i < kids.length; i++) walk(kids[i], d + 1);
    }
    for (let w = 0; w < p.windows.length; w++) walk(p.windows[w], 0);
    chunks.join('\\n');
  `);
}

function scrapeWin() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lob-read-"));
  const ps1 = path.join(tmpDir, "read.ps1");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue
$proc = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
  Select-Object -First 1
if (-not $proc) { Write-Output 'APP_NOT_RUNNING'; exit 2 }
try {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
  if (-not $root) { Write-Output ''; exit 0 }
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $stack = New-Object System.Collections.Generic.Stack[System.Windows.Automation.AutomationElement]
  $stack.Push($root)
  $chunks = New-Object System.Collections.Generic.List[string]
  $seen = 0
  while ($stack.Count -gt 0 -and $seen -lt 6000 -and $chunks.Count -lt 3000) {
    $el = $stack.Pop()
    $seen++
    $t = ''
    try { $t = [string]$el.Current.Name } catch {}
    if (-not $t) { try { $t = [string]$el.Current.HelpText } catch {} }
    if ($t -and $t.Length -lt 20000) { [void]$chunks.Add($t) }
    try {
      $child = $walker.GetFirstChild($el)
      while ($null -ne $child) {
        $stack.Push($child)
        $child = $walker.GetNextSibling($child)
      }
    } catch {}
  }
  ($chunks -join "\`n")
} catch {
  Write-Output ''
  exit 0
}
`;
  try {
    fs.writeFileSync(ps1, script, "utf8");
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8", timeout: 45_000, windowsHide: true }
    );
    const out = `${r.stdout || ""}`.trim();
    if (r.status === 2 || /APP_NOT_RUNNING/.test(out)) {
      const err = new Error("APP_NOT_RUNNING");
      throw err;
    }
    return out;
  } finally {
    try {
      fs.unlinkSync(ps1);
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

function parseC2C(text) {
  const states = [...String(text || "").matchAll(/STATE:\s*(INIT|PLAN|EXECUTED|DONE|BLOCKED|READY)/gi)];
  if (!states.length) {
    return {
      ok: false,
      code: "NO_STATE",
      detail: "No C2C STATE found in accessibility text",
      hint: emptyHint(),
    };
  }
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
  const grab = process.argv.includes("--grab");
  let text = "";
  if (PLATFORM === "darwin") {
    text = grab ? grabMac() : scrapeMac();
  } else if (PLATFORM === "win32") {
    text = scrapeWin();
  } else {
    console.log(
      JSON.stringify({
        ok: false,
        code: "UNSUPPORTED_PLATFORM",
        detail: `read-reply supports macOS and Windows; got ${PLATFORM}`,
      })
    );
    process.exitCode = 1;
    process.exit();
  }
  const parsed = parseC2C(text);
  if (parsed.ok) persistReply(parsed);
  if (!parsed.ok) {
    const persisted = peekPersistedReply();
    if (persisted) {
      console.log(JSON.stringify({ ...persisted, via: "last-reply.json" }));
      process.exitCode = 0;
      process.exit();
    }
  }
  console.log(JSON.stringify(parsed));
  process.exitCode = parsed.ok ? 0 : 1;
} catch (e) {
  const persisted = peekPersistedReply();
  if (persisted) {
    console.log(JSON.stringify({ ...persisted, via: "last-reply.json" }));
    process.exitCode = 0;
    process.exit();
  }
  if (PLATFORM === "darwin") {
    console.log(JSON.stringify(classifyMac(e)));
  } else if (/APP_NOT_RUNNING/.test(String(e.message || e))) {
    console.log(JSON.stringify({ ok: false, code: "APP_NOT_RUNNING" }));
  } else {
    console.log(
      JSON.stringify({
        ok: false,
        code: "NO_STATE",
        detail: String(e.message || e).slice(0, 300),
        hint: emptyHint(),
      })
    );
  }
  process.exitCode = 1;
}

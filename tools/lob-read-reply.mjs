#!/usr/bin/env node
// Best-effort read of the latest [C2C] STATE from ChatGPT desktop.
// macOS: grab (brief focus + copy). Windows: UIA dump (best-effort).
//
//   node tools/lob-read-reply.mjs --grab
//   → {"ok":true,"state":"PLAN","task_id":"c2c_…","snippet":"…"}
//
// Windows: if UIA is empty, returns NO_STATE (loop still polls
// .lob/last-reply.json). Hint:
//   node tools/lob-write-reply.mjs --from-clipboard

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATE_DIR } from "./lib/lob-config.mjs";
import { parseC2C } from "./lib/lob-driver-helpers.mjs";

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
    delay(0.15);
    se.keystroke('a', { using: ['command down'] });
    delay(0.05);
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

function classifyMac(e) {
  const msg = String((e && e.stderr) || e.message || e);
  if (/APP_NOT_RUNNING/.test(msg)) return { ok: false, code: "APP_NOT_RUNNING" };
  if (/assistive|not allowed|-25211|-1719/i.test(msg))
    return { ok: false, code: "NO_ACCESSIBILITY", detail: "Grant Accessibility to Terminal/Cursor" };
  return { ok: false, code: "OSA_ERROR", detail: msg.slice(0, 400) };
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

try {
  let text = "";
  if (PLATFORM === "darwin") {
    text = grabMac();
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
  if (!parsed.ok) {
    parsed.hint = "node tools/lob-write-reply.mjs --from-clipboard";
  }
  if (parsed.ok) persistReply(parsed);
  console.log(JSON.stringify(parsed));
  process.exitCode = parsed.ok ? 0 : 1;
} catch (e) {
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
        hint: "node tools/lob-write-reply.mjs --from-clipboard",
      })
    );
  }
  process.exitCode = 1;
}

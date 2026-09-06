#!/usr/bin/env node
// Lob v1 keystroke driver (macOS + Windows).
// Happy path: mode hotkeys + clipboard paste + Enter. No screenshots.
//   macOS: Control+1/2/3, ⌘V
//   Windows: Alt+1/2/3, Ctrl+V
// Optional --verify tries an accessibility/UIA read-back (often opaque on Electron).
// OCR/vision is off the happy path: LOB_OCR=1 or --verify-vision only.
//
//   node tools/lob-driver.mjs mode
//   node tools/lob-driver.mjs to chat|work|codex [--verify] [--force-mode]
//   node tools/lob-driver.mjs send "text" | send - [--mode chat|codex]
//   node tools/lob-driver.mjs enter
//   node tools/lob-driver.mjs chat-send "text" [--verify] [--force-mode]
//   node tools/lob-driver.mjs codex-send "text" [--verify] [--force-mode]
//
// Codex paste always fires Control+3 / Alt+3 in the same step as paste so a
// prior `to codex` cannot restore Cursor and drop the next paste into Chat.
// Chat still skips ⌃1 / Alt+1 when already in Chat (New chat).
// The user talks in Cursor. Paste must steal ChatGPT focus and abort
// (FOCUS_LOST) if Cursor is still frontmost at Cmd+V / Ctrl+V.
// Happy path does not scan the window (no AX mode walk). Generation
// continues unfocused after Enter; only paste/read need a ~1s burst.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stdin as input } from "node:process";
import { loadConfig, readSession, writeSession } from "./lib/lob-config.mjs";
import {
  resolveTiming,
  hasC2CPrefix,
  settleBackoffMs,
  ocrEnabled,
  parseModeLabel,
  modesMatch,
  isWorkMode,
  skipModeHotkeyBeforePaste,
} from "./lib/lob-driver-helpers.mjs";

const APP = "ChatGPT";
const PLATFORM = process.platform;
const MODE_MAP = {
  chat: { key: "1", want: "ChatGPT" },
  work: { key: "2", want: "Work" },
  codex: { key: "3", want: "Codex" },
};

const CAVEAT =
  "keys fired only — confirm an active project thread (Codex) or pinned Chat thread received the paste; empty Continue stubs often swallow Enter";

const CFG = loadConfig();
const TIMING = resolveTiming(CFG);
const OCR_ON = ocrEnabled(process.argv, process.env, CFG);

let macModeCache = "";

function sec(ms) {
  return (Number(ms) / 1000).toFixed(3);
}

function unsupportedPlatform() {
  return {
    ok: false,
    code: "UNSUPPORTED_PLATFORM",
    detail: `Driver supports macOS and Windows; got ${PLATFORM}. Use manual Alt/Control paste-back.`,
  };
}

// ─── macOS (JXA / System Events) ─────────────────────────────────────────────

const jxa = (body) =>
  execFileSync("osascript", ["-l", "JavaScript", "-e", body], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();

function runInChatGPTMac(inner) {
  return jxa(`
    const se = Application('System Events');
    const procs = se.processes.whose({ name: ${JSON.stringify(APP)} });
    if (procs.length === 0) throw new Error('APP_NOT_RUNNING');
    let p = procs[0];
    for (let i = 0; i < procs.length; i++) {
      try {
        const ws = procs[i].windows();
        for (let w = 0; w < ws.length; w++) {
          let t = '';
          try { t = String(ws[w].name()); } catch (e) {}
          if (/ChatGPT|Codex|Chat|PLANNER/i.test(t)) { p = procs[i]; }
        }
      } catch (e) {}
    }
    function prevApp() {
      try {
        const fp = se.applicationProcesses.whose({ frontmost: true });
        if (fp.length) return String(fp[0].name());
      } catch (e) {}
      return '';
    }
    function restore(prev) {
      if (prev && prev !== ${JSON.stringify(APP)}) {
        try { Application(prev).activate(); } catch (e) {}
      }
    }
    function assertFront() {
      p.frontmost = true;
      delay(${sec(TIMING.focus_ms)});
      let name = '';
      try {
        const fp = se.applicationProcesses.whose({ frontmost: true });
        if (fp.length) name = String(fp[0].name());
      } catch (e) {}
      if (name !== ${JSON.stringify(APP)}) throw new Error('FOCUS_LOST:' + name);
    }
    function focusComposer(root) {
      function walk(el, d) {
        if (d > 16) return false;
        let role = '';
        try { role = String(el.role()); } catch (e) {}
        if (/AXTextArea|AXTextField|text area|text field/i.test(role)) {
          try { el.focused = true; return true; } catch (e) {}
        }
        let kids = [];
        try { kids = el.uiElements(); } catch (e) {}
        for (let i = kids.length - 1; i >= 0; i--) {
          if (walk(kids[i], d + 1)) return true;
        }
        return false;
      }
      try { return walk(root, 0); } catch (e) { return false; }
    }
    ${inner}
  `);
}

function classifyMacError(e) {
  const msg = String((e && e.stderr) || e.message || e);
  if (/APP_NOT_RUNNING/.test(msg))
    return { ok: false, code: "APP_NOT_RUNNING", detail: `${APP} is not running` };
  if (/assistive|not allowed|-25211|-1719/i.test(msg))
    return {
      ok: false,
      code: "NO_ACCESSIBILITY",
      detail:
        "Grant Accessibility to Terminal/Cursor (System Settings → Privacy & Security → Accessibility).",
    };
  if (/CLIPBOARD_MISMATCH/.test(msg))
    return {
      ok: false,
      code: "CLIPBOARD_MISMATCH",
      detail: "Clipboard read-back did not match the payload.",
    };
  if (/FOCUS_LOST/.test(msg))
    return {
      ok: false,
      code: "FOCUS_LOST",
      detail:
        "ChatGPT was not frontmost at paste time — aborted so this did not land in Cursor. Retry the send; you can keep talking here after it finishes.",
    };
  if (/MODE_ELEMENT_NOT_FOUND/.test(msg))
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail:
        "Mode switcher not visible to osascript (common for Electron). Hotkeys still work; skip --verify or use stuck-path OCR.",
    };
  return { ok: false, code: "OSA_ERROR", detail: msg.slice(0, 300) };
}

function readModeMac() {
  const cache = JSON.stringify(macModeCache || "");
  try {
    const out = runInChatGPTMac(`
      function blob(el) {
        const bits = [];
        try { bits.push(String(el.description())); } catch (e) {}
        try { bits.push(String(el.title())); } catch (e) {}
        try { bits.push(String(el.value())); } catch (e) {}
        try { bits.push(String(el.help())); } catch (e) {}
        try { bits.push(String(el.name())); } catch (e) {}
        try { bits.push(String(el.roleDescription())); } catch (e) {}
        try {
          bits.push(String(el.attributes.byName('AXIdentifier').value()));
        } catch (e) {}
        return bits.join(' ');
      }
      function findMode(root) {
        const q = [{ el: root, d: 0 }];
        let seen = 0;
        const cached = ${cache};
        while (q.length && seen < 12000) {
          const { el, d } = q.shift();
          seen++;
          const b = blob(el);
          if (b.indexOf('current mode:') !== -1) return b;
          if (cached && b.indexOf(cached) !== -1 && /ChatGPT|Chat|Work|Codex/i.test(b)) return b;
          if (d < 18) {
            let kids = [];
            try { kids = el.uiElements(); } catch (e) {}
            for (let i = 0; i < kids.length; i++) q.push({ el: kids[i], d: d + 1 });
          }
        }
        return null;
      }
      p.frontmost = true;
      let found = null;
      for (let w = 0; w < p.windows.length && !found; w++) found = findMode(p.windows[w]);
      if (!found) throw new Error('MODE_ELEMENT_NOT_FOUND');
      found;
    `);
    const mode = parseModeLabel(out) || "unknown";
    macModeCache = out;
    return { ok: true, mode, raw: out };
  } catch (e) {
    return classifyMacError(e);
  }
}

function pressModeKeyMac(key) {
  try {
    runInChatGPTMac(`
      const prev = prevApp();
      p.frontmost = true;
      delay(${sec(TIMING.focus_ms)});
      se.keystroke(${JSON.stringify(key)}, { using: ['control down'] });
      delay(${sec(TIMING.mode_settle_ms)});
      restore(prev);
      'ok';
    `);
    return { ok: true };
  } catch (e) {
    return classifyMacError(e);
  }
}

function pasteAndEnterMac(text) {
  return modeThenPasteMac(null, text);
}

function modeThenPasteMac(key, text) {
  const hotkey =
    key == null
      ? ""
      : `
      se.keystroke(${JSON.stringify(String(key))}, { using: ['control down'] });
      delay(${sec(TIMING.mode_settle_ms)});
`;
  try {
    runInChatGPTMac(`
      const prev = prevApp();
      p.frontmost = true;
      delay(${sec(TIMING.focus_ms)});
      ${hotkey}
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;
      const payload = ${JSON.stringify(text)};
      app.setTheClipboardTo(payload);
      delay(${sec(TIMING.paste_ms)});
      let got = '';
      try { got = String(app.theClipboard()); } catch (e) {}
      if (got !== payload) throw new Error('CLIPBOARD_MISMATCH');
      assertFront();
      se.keystroke('v', { using: ['command down'] });
      delay(${sec(TIMING.enter_ms)});
      se.keyCode(36);
      delay(${sec(TIMING.enter_ms)});
      restore(prev);
      'sent';
    `);
    return { ok: true };
  } catch (e) {
    return classifyMacError(e);
  }
}

function enterMac() {
  try {
    runInChatGPTMac(`
      const prev = prevApp();
      p.frontmost = true;
      delay(${sec(TIMING.focus_ms)});
      try { focusComposer(p.windows[0]); } catch (e) {}
      se.keyCode(36);
      delay(${sec(TIMING.enter_ms)});
      restore(prev);
      'ok';
    `);
    return { ok: true };
  } catch (e) {
    return classifyMacError(e);
  }
}

function readModeOcrMac() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lob-ocr-"));
  const png = path.join(tmpDir, "chip.png");
  try {
    const rect = JSON.parse(
      runInChatGPTMac(`
        const w = p.windows[0];
        const pos = w.position();
        const sz = w.size();
        JSON.stringify({ x: pos[0], y: pos[1], w: sz[0], h: sz[1] });
      `)
    );
    const w = Math.max(80, Math.min(640, Number(rect.w) || 640));
    const h = Math.max(40, Math.min(90, Number(rect.h) || 90));
    const cap = spawnSync(
      "screencapture",
      ["-x", "-R", `${rect.x},${rect.y},${w},${h}`, png],
      { encoding: "utf8", timeout: 8_000 }
    );
    if (cap.status !== 0) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail: "OCR crop failed (screencapture).",
      };
    }
    const tess = spawnSync("tesseract", [png, "stdout", "-l", "eng"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (tess.status !== 0) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail: "OCR requested but tesseract is not available. Install tesseract or skip --verify-vision.",
      };
    }
    const mode = parseModeLabel(tess.stdout);
    if (!mode) {
      return { ok: false, code: "MODE_ELEMENT_NOT_FOUND", detail: "OCR empty — no Chat/Work/Codex in crop." };
    }
    return { ok: true, mode, via: "ocr", raw: tess.stdout.slice(0, 200) };
  } catch (e) {
    return classifyMacError(e);
  } finally {
    try {
      fs.unlinkSync(png);
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

// ─── Windows (PowerShell + SendKeys + UIA) ─────────────────────────────────

function classifyWinError(msg) {
  const m = String(msg || "");
  if (/APP_NOT_RUNNING/i.test(m))
    return { ok: false, code: "APP_NOT_RUNNING", detail: `${APP} is not running` };
  if (/CLIPBOARD_MISMATCH/i.test(m))
    return {
      ok: false,
      code: "CLIPBOARD_MISMATCH",
      detail: "Clipboard read-back did not match the payload.",
    };
  if (/FOCUS_LOST/i.test(m))
    return {
      ok: false,
      code: "FOCUS_LOST",
      detail:
        "ChatGPT was not frontmost at paste time — aborted so this did not land in Cursor. Retry the send; you can keep talking here after it finishes.",
    };
  if (/access is denied|UIAccess|SendKeys/i.test(m))
    return {
      ok: false,
      code: "NO_ACCESSIBILITY",
      detail:
        "Could not send keys to ChatGPT. Run the terminal elevated if needed, focus the ChatGPT window, and retry.",
    };
  return { ok: false, code: "WIN_ERROR", detail: m.slice(0, 400) };
}

function runPowerShell(script, { clipText, timeout = 30_000 } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lob-"));
  const ps1 = path.join(tmpDir, "run.ps1");
  let clipFile = null;
  try {
    let body = script;
    if (clipText != null) {
      clipFile = path.join(tmpDir, "clip.txt");
      fs.writeFileSync(clipFile, clipText, "utf8");
      body =
        `$clipFile = ${JSON.stringify(clipFile)}\n` +
        `$clipText = Get-Content -LiteralPath $clipFile -Raw -Encoding UTF8\n` +
        body;
    }
    fs.writeFileSync(ps1, body, "utf8");
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8", timeout, windowsHide: true }
    );
    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    if (r.status !== 0) {
      const err = new Error(out || `powershell exit ${r.status}`);
      err.stderr = out;
      throw err;
    }
    return out;
  } finally {
    try {
      if (clipFile) fs.unlinkSync(clipFile);
      fs.unlinkSync(ps1);
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

const WIN_CS = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CodexGptWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
"@
`;

function winPickFocus(restore) {
  return `
$ErrorActionPreference = 'Stop'
${WIN_CS}
$prevHwnd = [CodexGptWin]::GetForegroundWindow()
$procs = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
$chosen = $null
foreach ($pr in $procs) {
  if ([CodexGptWin]::IsIconic($pr.MainWindowHandle)) { continue }
  if (-not [CodexGptWin]::IsWindowVisible($pr.MainWindowHandle)) { continue }
  $sb = New-Object System.Text.StringBuilder 256
  [void][CodexGptWin]::GetWindowText($pr.MainWindowHandle, $sb, 256)
  $title = $sb.ToString()
  if ($title -match 'ChatGPT|Chat|Codex|PLANNER') { $chosen = $pr; break }
}
if (-not $chosen) { $chosen = $procs | Select-Object -First 1 }
if (-not $chosen) { throw 'APP_NOT_RUNNING' }
$hwnd = $chosen.MainWindowHandle
$fg = [CodexGptWin]::GetForegroundWindow()
$dummy = 0
$curTid = [CodexGptWin]::GetCurrentThreadId()
$fgTid = [CodexGptWin]::GetWindowThreadProcessId($fg, [ref]$dummy)
$tgtTid = [CodexGptWin]::GetWindowThreadProcessId($hwnd, [ref]$dummy)
[void][CodexGptWin]::AllowSetForegroundWindow(-1)
[void][CodexGptWin]::ShowWindow($hwnd, 9)
if ($fgTid -ne $tgtTid) {
  [void][CodexGptWin]::AttachThreadInput($curTid, $tgtTid, $true)
  [void][CodexGptWin]::AttachThreadInput($fgTid, $tgtTid, $true)
}
[void][CodexGptWin]::SetForegroundWindow($hwnd)
if ($fgTid -ne $tgtTid) {
  [void][CodexGptWin]::AttachThreadInput($curTid, $tgtTid, $false)
  [void][CodexGptWin]::AttachThreadInput($fgTid, $tgtTid, $false)
}
Start-Sleep -Milliseconds ${TIMING.focus_ms}
function Focus-Composer {
  try {
    Add-Type -AssemblyName UIAutomationClient | Out-Null
    Add-Type -AssemblyName UIAutomationTypes | Out-Null
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    $editType = [System.Windows.Automation.ControlType]::Edit
    $cond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $editType)
    $edit = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($edit) { [void]$edit.SetFocus() }
  } catch {}
}
function Restore-Prev {
  ${restore ? `Start-Sleep -Milliseconds ${TIMING.enter_ms}
  if ($prevHwnd -ne [IntPtr]::Zero -and $prevHwnd -ne $hwnd) {
    [void][CodexGptWin]::SetForegroundWindow($prevHwnd)
  }` : ""}
}
`;
}

function readModeWin() {
  try {
    const out = runPowerShell(
      winPickFocus(false) +
        `
$found = $null
try {
  Add-Type -AssemblyName UIAutomationClient | Out-Null
  Add-Type -AssemblyName UIAutomationTypes | Out-Null
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $stack = New-Object System.Collections.Stack
  $stack.Push(@($root, 0))
  $seen = 0
  while ($stack.Count -gt 0 -and $seen -lt 4000) {
    $pair = $stack.Pop()
    $el = $pair[0]; $d = $pair[1]
    $seen++
    $name = ''
    $aid = ''
    try { $name = [string]$el.Current.Name } catch {}
    try { $aid = [string]$el.Current.AutomationId } catch {}
    $blob = "$name $aid"
    if ($blob -match 'current mode') { $found = $name; break }
    if ($name -match '^(ChatGPT|Chat|Work|Codex)$') { $found = $name }
    if ($d -lt 18) {
      $child = $walker.GetFirstChild($el)
      while ($child) {
        $stack.Push(@($child, $d + 1))
        $child = $walker.GetNextSibling($child)
      }
    }
  }
} catch {}
if ($found) { Write-Output ("MODE:" + $found) } else { Write-Output 'MODE_ELEMENT_NOT_FOUND' }
`
    );
    const line = out.split(/\r?\n/).filter(Boolean).pop() || "";
    if (/MODE_ELEMENT_NOT_FOUND/i.test(line) || !line.startsWith("MODE:")) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail:
          "Mode verify is not available on Windows yet. Hotkeys still work; skip --verify and confirm Chat/Codex by eye.",
      };
    }
    const raw = line.slice(5).trim();
    const mode = parseModeLabel(raw) || "unknown";
    return { ok: true, mode, raw };
  } catch (e) {
    const c = classifyWinError((e && e.stderr) || e.message || e);
    if (c.code === "APP_NOT_RUNNING") return c;
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail:
        "Mode verify is not available on Windows yet. Hotkeys still work; skip --verify and confirm Chat/Codex by eye.",
    };
  }
}

function pressModeKeyWin(key) {
  try {
    runPowerShell(
      winPickFocus(true) +
        `[System.Windows.Forms.SendKeys]::SendWait('%${key}')\n` +
        `Start-Sleep -Milliseconds ${TIMING.mode_settle_ms}\n` +
        `Restore-Prev\n` +
        `'ok'\n`
    );
    return { ok: true };
  } catch (e) {
    return classifyWinError((e && e.stderr) || e.message || e);
  }
}

function pasteAndEnterWin(text) {
  return modeThenPasteWin(null, text);
}

function modeThenPasteWin(key, text) {
  const hotkey =
    key == null
      ? ""
      : `[System.Windows.Forms.SendKeys]::SendWait('%${key}')\nStart-Sleep -Milliseconds ${TIMING.mode_settle_ms}\n`;
  try {
    runPowerShell(
      winPickFocus(true) +
        `
${hotkey}Focus-Composer
[System.Windows.Forms.Clipboard]::SetText($clipText)
Start-Sleep -Milliseconds ${TIMING.paste_ms}
$got = [System.Windows.Forms.Clipboard]::GetText()
$a = ($clipText -replace "\`r\`n","\`n")
$b = ($got -replace "\`r\`n","\`n")
if ($a -ne $b) { throw 'CLIPBOARD_MISMATCH' }
[void][CodexGptWin]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds ${TIMING.focus_ms}
if ([CodexGptWin]::GetForegroundWindow() -ne $hwnd) { throw 'FOCUS_LOST' }
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds ${TIMING.enter_ms}
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Restore-Prev
'sent'
`,
      { clipText: text }
    );
    return { ok: true };
  } catch (e) {
    return classifyWinError((e && e.stderr) || e.message || e);
  }
}

function enterWin() {
  try {
    runPowerShell(
      winPickFocus(true) +
        `Focus-Composer\n` +
        `[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')\n` +
        `Restore-Prev\n` +
        `'ok'\n`
    );
    return { ok: true };
  } catch (e) {
    return classifyWinError((e && e.stderr) || e.message || e);
  }
}

function readModeOcrWin() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lob-ocr-"));
  const png = path.join(tmpDir, "chip.png");
  try {
    const out = runPowerShell(
      winPickFocus(false) +
        `
Add-Type -AssemblyName System.Drawing
$rect = New-Object CodexGptWin+RECT
[void][CodexGptWin]::GetWindowRect($hwnd, [ref]$rect)
$w = [Math]::Min(640, [Math]::Max(80, $rect.Right - $rect.Left))
$h = 90
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save(${JSON.stringify(png)})
$g.Dispose(); $bmp.Dispose()
Write-Output 'cropped'
`
    );
    if (!/cropped/i.test(out)) {
      return { ok: false, code: "MODE_ELEMENT_NOT_FOUND", detail: "OCR crop failed." };
    }
    const tess = spawnSync("tesseract", [png, "stdout", "-l", "eng"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (tess.status !== 0) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail: "OCR requested but tesseract/Windows OCR is not available.",
      };
    }
    const mode = parseModeLabel(tess.stdout);
    if (!mode) {
      return { ok: false, code: "MODE_ELEMENT_NOT_FOUND", detail: "OCR empty — no Chat/Work/Codex in crop." };
    }
    return { ok: true, mode, via: "ocr", raw: tess.stdout.slice(0, 200) };
  } catch (e) {
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail: String((e && e.message) || e).slice(0, 200),
    };
  } finally {
    try {
      fs.unlinkSync(png);
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

// ─── Platform dispatch ───────────────────────────────────────────────────────

function readMode() {
  if (PLATFORM === "darwin") return readModeMac();
  if (PLATFORM === "win32") return readModeWin();
  return unsupportedPlatform();
}

function readModeOcr() {
  if (PLATFORM === "darwin") return readModeOcrMac();
  if (PLATFORM === "win32") return readModeOcrWin();
  return unsupportedPlatform();
}

function pressModeKey(key) {
  if (PLATFORM === "darwin") return pressModeKeyMac(key);
  if (PLATFORM === "win32") return pressModeKeyWin(key);
  return unsupportedPlatform();
}

function pasteAndEnter(text) {
  if (PLATFORM === "darwin") return pasteAndEnterMac(text);
  if (PLATFORM === "win32") return pasteAndEnterWin(text);
  return unsupportedPlatform();
}

function modeThenPaste(key, text) {
  if (PLATFORM === "darwin") return modeThenPasteMac(key, text);
  if (PLATFORM === "win32") return modeThenPasteWin(key, text);
  return unsupportedPlatform();
}

function pressEnter() {
  if (PLATFORM === "darwin") return enterMac();
  if (PLATFORM === "win32") return enterWin();
  return unsupportedPlatform();
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function driftResult(after, want, s) {
  return {
    ok: false,
    code: "MODE_DRIFT",
    mode: after.mode,
    want,
    switched: !!s.switched,
    skipped_hotkey: !!s.skipped_hotkey,
    paste: "sent",
    platform: PLATFORM,
    detail: isWorkMode(after.mode)
      ? "Paste landed but mode is Work — abort; never use Work as planner/executor. Open a live Codex project thread and retry."
      : `Paste sent but mode is ${after.mode}, expected ${want}`,
    caveat: CAVEAT,
  };
}

async function maybeOcr(last, { verifyFails = 0 } = {}) {
  if (!OCR_ON) return last;
  const unknown = !last.ok || last.mode === "unknown" || last.code === "MODE_ELEMENT_NOT_FOUND";
  if (!(unknown || verifyFails >= 2)) return last;
  const o = readModeOcr();
  if (o.ok && isWorkMode(o.mode)) {
    return {
      ok: false,
      code: "MODE_DRIFT",
      mode: o.mode,
      want: last.want,
      via: "ocr",
      detail:
        "OCR says Work — abort; never use Work as planner/executor. Open a live Codex project thread and retry.",
      platform: PLATFORM,
    };
  }
  return o;
}

async function switchMode(name, verify, { force = false } = {}) {
  const cfg = MODE_MAP[name];
  let before = readMode();
  if (!before.ok) {
    before = await maybeOcr(before, { verifyFails: verify ? 1 : 0 });
  }
  // Never re-press a mode hotkey when already there — especially Chat
  // (macOS ⌃1 / Windows Alt+1), which can open New chat / leave the pinned thread.
  // `--force` does not override this; use `--force-mode` only when intentional.
  if (before.ok && modesMatch(before.mode, cfg.want) && !force) {
    return {
      ok: true,
      mode: before.mode,
      verified: true,
      switched: false,
      skipped_hotkey: true,
      platform: PLATFORM,
    };
  }

  const r = pressModeKey(cfg.key);
  if (!r.ok) return { ...r, platform: PLATFORM };

  const unknown = !before.ok;
  let last = { ok: false };
  let fails = 0;
  const attempts = verify || unknown ? 3 : 1;
  for (let i = 0; i < attempts; i++) {
    const wait = verify || unknown ? settleBackoffMs(i) : TIMING.mode_settle_ms;
    await sleep(wait);
    last = readMode();
    if (last.ok && modesMatch(last.mode, cfg.want)) {
      return {
        ok: true,
        mode: last.mode,
        verified: true,
        switched: true,
        prior_mode: before.ok ? before.mode : undefined,
        platform: PLATFORM,
      };
    }
    if (!last.ok) fails += 1;
    if (!verify && i === 0) break;
  }

  last = await maybeOcr(last, { verifyFails: fails });
  if (last.ok && isWorkMode(last.mode) && cfg.want !== "Work") {
    return {
      ok: false,
      code: "MODE_DRIFT",
      mode: last.mode,
      want: cfg.want,
      switched: true,
      platform: PLATFORM,
      detail:
        "Mode is Work — abort; never use Work as planner/executor. Open a live Codex project thread and retry.",
    };
  }
  if (last.ok && modesMatch(last.mode, cfg.want)) {
    return {
      ok: true,
      mode: last.mode,
      verified: true,
      switched: true,
      prior_mode: before.ok ? before.mode : undefined,
      via: last.via,
      platform: PLATFORM,
    };
  }
  if (last.ok && verify) {
    return {
      ok: false,
      code: "MODE_SWITCH_FAILED",
      mode: last.mode,
      want: cfg.want,
      switched: true,
      platform: PLATFORM,
    };
  }
  if (!verify) {
    return {
      ok: true,
      mode: cfg.want,
      verified: false,
      switched: true,
      prior_mode: before.ok ? before.mode : undefined,
      platform: PLATFORM,
    };
  }
  return {
    ...last,
    note: "hotkey sent; mode verify unavailable",
    switched: true,
    platform: PLATFORM,
  };
}

async function switchAndSend(name, text, verify, { force = false, forceMode = false } = {}) {
  const cfg = MODE_MAP[name];
  const session = readSession();
  let before = { ok: false };
  if (verify) {
    before = readMode();
    if (!before.ok) before = await maybeOcr(before, { verifyFails: 1 });
    if (before.ok && isWorkMode(before.mode) && name !== "work") {
      return {
        ok: false,
        code: "MODE_DRIFT",
        mode: before.mode,
        want: cfg.want,
        platform: PLATFORM,
        detail:
          "Mode is Work — abort; never use Work as planner/executor. Open a live Codex project thread and retry.",
        caveat: CAVEAT,
      };
    }
  }

  const skip = skipModeHotkeyBeforePaste(name, {
    beforeOk: before.ok,
    beforeMode: before.mode,
    lastMode: session.last_mode,
    force: forceMode,
  });
  const key = skip ? null : cfg.key;
  const paste = modeThenPaste(key, text);
  if (!paste.ok) return { ...paste, caveat: CAVEAT, platform: PLATFORM };

  writeSession({ last_mode: cfg.want });

  if (!verify) {
    return {
      ok: true,
      mode: cfg.want,
      want: cfg.want,
      verified: false,
      switched: key != null,
      skipped_hotkey: skip,
      paste: "sent",
      platform: PLATFORM,
      caveat: CAVEAT,
    };
  }

  await sleep(Math.max(TIMING.enter_ms, 400));
  let after = readMode();
  if (!after.ok) after = await maybeOcr(after, { verifyFails: 2 });
  const want = cfg.want;
  const switched = key != null;
  if (!after.ok) {
    return {
      ok: true,
      mode: want,
      want,
      verified: false,
      switched,
      skipped_hotkey: skip,
      paste: "sent",
      platform: PLATFORM,
      detail: skip
        ? "Paste fired; post-paste mode verify unavailable."
        : `Locked ${want} (hotkey ${key}) and paste in one step; post-paste mode verify unavailable.`,
      caveat: CAVEAT,
    };
  }
  if (!modesMatch(after.mode, want)) {
    return driftResult(after, want, { switched, skipped_hotkey: skip });
  }

  return {
    ok: true,
    mode: after.mode,
    verified: true,
    switched,
    skipped_hotkey: skip,
    paste: "sent",
    platform: PLATFORM,
    caveat: CAVEAT,
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    input.setEncoding("utf8");
    input.on("data", (c) => (buf += c));
    input.on("end", () => resolve(buf));
    input.on("error", reject);
  });
}

function print(obj) {
  console.log(JSON.stringify(obj));
}

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes("--verify");
  const force = args.includes("--force");
  const forceMode = args.includes("--force-mode");
  let requireMode = null;
  const modeFlag = args.indexOf("--mode");
  if (modeFlag !== -1) requireMode = args[modeFlag + 1] || null;
  const skipNext = new Set();
  if (modeFlag !== -1) {
    skipNext.add(modeFlag);
    skipNext.add(modeFlag + 1);
  }
  const pos = args.filter(
    (a, i) =>
      a !== "--verify" &&
      a !== "--force" &&
      a !== "--force-mode" &&
      a !== "--verify-vision" &&
      !skipNext.has(i)
  );
  const [cmd, arg, ...rest] = pos;
  let text = [arg, ...rest].filter(Boolean).join(" ");
  if (arg === "-") text = await readStdin();

  switch (cmd) {
    case "mode": {
      let r = readMode();
      if (!r.ok) r = await maybeOcr(r, { verifyFails: 2 });
      print({ ...r, platform: PLATFORM });
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "to": {
      if (!MODE_MAP[arg]) {
        print({
          ok: false,
          code: "USAGE",
          detail: "to chat|work|codex [--verify] [--force-mode]",
        });
        process.exitCode = 1;
        break;
      }
      const r = await switchMode(arg, verify, { force: forceMode });
      print(r);
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "enter": {
      const r = pressEnter();
      print({ ...r, platform: PLATFORM, caveat: CAVEAT });
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "send": {
      if (!text) {
        print({ ok: false, code: "USAGE", detail: 'send "text" | send - [--mode chat|codex]' });
        process.exitCode = 1;
        break;
      }
      if (requireMode && !MODE_MAP[requireMode]) {
        print({
          ok: false,
          code: "USAGE",
          detail: 'send --mode chat|codex "text"',
          platform: PLATFORM,
        });
        process.exitCode = 1;
        break;
      }
      if (requireMode === "work") {
        print({
          ok: false,
          code: "MODE_DRIFT",
          detail: "Never paste into Work.",
          platform: PLATFORM,
        });
        process.exitCode = 1;
        break;
      }
      const r = requireMode
        ? await switchAndSend(requireMode, text, verify, { force, forceMode })
        : pasteAndEnter(text);
      print({ ...r, platform: PLATFORM, caveat: CAVEAT });
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "chat-send":
    case "codex-send": {
      if (!text) {
        print({
          ok: false,
          code: "USAGE",
          detail: `${cmd} "text" [--verify] [--force-mode]`,
        });
        process.exitCode = 1;
        break;
      }
      if (!hasC2CPrefix(text)) {
        print({
          ok: false,
          code: "NOT_C2C",
          detail: `${cmd} requires a payload starting with [C2C]`,
          platform: PLATFORM,
        });
        process.exitCode = 1;
        break;
      }
      const r = await switchAndSend(
        cmd === "chat-send" ? "chat" : "codex",
        text,
        verify,
        { force, forceMode }
      );
      print(r);
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    default:
      print({
        ok: false,
        code: "USAGE",
        detail:
          "mode | to chat|work|codex [--verify] [--force-mode] | send <text|-> [--mode chat|codex] | enter | chat-send <text|-> [--verify] [--force-mode] | codex-send <text|-> [--verify] [--force-mode]",
        platform: PLATFORM,
      });
      process.exitCode = 1;
  }
}

main();

#!/usr/bin/env node
// TagTeamGPT v1 keystroke driver (macOS + Windows).
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
//   node tools/lob-driver.mjs ... --debug   (Windows focus log on stderr + JSON.win)
//
// Codex paste always fires Control+3 / Alt+3 in the same step as paste so a
// prior `to codex` cannot restore Cursor and drop the next paste into Chat.
// Chat still skips ⌃1 / Alt+1 when already in Chat (New chat).
// The user talks in Cursor. Paste must steal ChatGPT focus and abort
// (FOCUS_LOST) if Cursor is still frontmost at Cmd+V / Ctrl+V.
// Windows: find ChatGPT HWND, verify GetForegroundWindow, then the same
// Alt+tab / Ctrl+V / Enter macro, then restore. Never send keys if focus
// is not proven. No PostMessage background injection (Electron drops it).
// Happy path does not scan the window (no AX mode walk). Generation
// continues unfocused after Enter; only paste/read need a short burst.

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
  pasteSettleMs,
  ocrEnabled,
  parseModeLabel,
  modesMatch,
  isWorkMode,
  skipModeHotkeyBeforePaste,
  parseLastJsonLine,
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

let macModeCache = { blob: "", path: [] };

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
          let mini = false;
          try { mini = !!ws[w].miniaturized(); } catch (e) {}
          if (mini) continue;
          if (/ChatGPT|Codex|Chat|PLANNER/i.test(t)) { p = procs[i]; }
        }
      } catch (e) {}
    }
    function pickWindow() {
      let fallback = null;
      try {
        const ws = p.windows();
        for (let w = 0; w < ws.length; w++) {
          let t = '';
          try { t = String(ws[w].name()); } catch (e) {}
          let mini = false;
          try { mini = !!ws[w].miniaturized(); } catch (e) {}
          if (!fallback) fallback = ws[w];
          if (mini) continue;
          if (/ChatGPT|Codex|Chat|PLANNER/i.test(t)) return ws[w];
        }
      } catch (e) {}
      return fallback;
    }
    const win = pickWindow();
    if (!win) throw new Error('APP_NOT_RUNNING');
    try { if (win.miniaturized()) win.miniaturized = false; } catch (e) {}
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
  const cache = JSON.stringify(macModeCache.blob || "");
  const cachedPath = JSON.stringify(macModeCache.path || []);
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
      function hit(b, path) {
        const cached = ${cache};
        if (b.indexOf('current mode:') !== -1) return { blob: b, path: path };
        if (cached && b.indexOf(cached) !== -1 && /ChatGPT|Chat|Work|Codex/i.test(b)) {
          return { blob: b, path: path };
        }
        return null;
      }
      function atPath(root, path) {
        if (!path || !path.length) return null;
        let el = root;
        for (let i = 0; i < path.length; i++) {
          let kids = [];
          try { kids = el.uiElements(); } catch (e) { return null; }
          el = kids[path[i]];
          if (!el) return null;
        }
        return hit(blob(el), path);
      }
      function findMode(root) {
        const q = [{ el: root, d: 0, path: [] }];
        let seen = 0;
        while (q.length && seen < 12000) {
          const { el, d, path } = q.shift();
          seen++;
          const got = hit(blob(el), path);
          if (got) return got;
          if (d < 18) {
            let kids = [];
            try { kids = el.uiElements(); } catch (e) {}
            for (let i = 0; i < kids.length; i++) {
              q.push({ el: kids[i], d: d + 1, path: path.concat([i]) });
            }
          }
        }
        return null;
      }
      function scan() {
        const path = ${cachedPath};
        let found = atPath(win, path);
        if (found) return found;
        found = findMode(win);
        if (found) return found;
        for (let w = 0; w < p.windows.length; w++) {
          try {
            if (p.windows[w].name() === String(win.name())) continue;
          } catch (e) {}
          found = findMode(p.windows[w]);
          if (found) return found;
        }
        return null;
      }
      p.frontmost = true;
      let found = scan();
      if (!found) {
        delay(0.200);
        p.frontmost = true;
        found = scan();
      }
      if (!found) throw new Error('MODE_ELEMENT_NOT_FOUND');
      JSON.stringify(found);
    `);
    const parsed = JSON.parse(out);
    const raw = parsed.blob || out;
    const mode = parseModeLabel(raw) || "unknown";
    macModeCache = { blob: raw, path: Array.isArray(parsed.path) ? parsed.path : [] };
    return { ok: true, mode, raw };
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

function modeThenPasteMac(key, text, settleMs = TIMING.mode_settle_ms) {
  const hotkey =
    key == null
      ? ""
      : `
      se.keystroke(${JSON.stringify(String(key))}, { using: ['control down'] });
      delay(${sec(settleMs)});
`;
  try {
    runInChatGPTMac(`
      const prev = prevApp();
      p.frontmost = true;
      delay(${sec(TIMING.focus_ms)});
      ${hotkey}
      try { focusComposer(win); } catch (e) {}
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;
      const payload = ${JSON.stringify(text)};
      app.setTheClipboardTo(payload);
      delay(${sec(TIMING.paste_ms)});
      let got = '';
      try { got = String(app.theClipboard()); } catch (e) {}
      function norm(s) { return String(s).replace(/\\r\\n/g, '\\n'); }
      if (norm(got) !== norm(payload)) throw new Error('CLIPBOARD_MISMATCH');
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
      try { focusComposer(win); } catch (e) {}
      assertFront();
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-ocr-"));
  const png = path.join(tmpDir, "chip.png");
  try {
    const rect = JSON.parse(
      runInChatGPTMac(`
        const w = win;
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

function winDebugOn() {
  return process.env.LOB_DEBUG === "1" || process.argv.includes("--debug");
}

function winLog(parsed) {
  if (!parsed || typeof parsed !== "object") return undefined;
  const { ok, code, ...rest } = parsed;
  return Object.keys(rest).length ? rest : undefined;
}

function classifyWinError(msg, parsed) {
  const m = String((parsed && (parsed.failure || parsed.code)) || msg || "");
  const extra = {};
  const log = winLog(parsed);
  if (log) extra.win = log;
  if (/APP_NOT_RUNNING/i.test(m))
    return {
      ok: false,
      code: "APP_NOT_RUNNING",
      detail: `${APP} is not running`,
      ...extra,
    };
  if (/CLIPBOARD_MISMATCH/i.test(m))
    return {
      ok: false,
      code: "CLIPBOARD_MISMATCH",
      detail: "Clipboard read-back did not match the payload.",
      ...extra,
    };
  if (/FOCUS_LOST/i.test(m))
    return {
      ok: false,
      code: "FOCUS_LOST",
      detail:
        "ChatGPT was not frontmost at paste time — aborted so this did not land in Cursor. Retry the send; you can keep talking here after it finishes.",
      ...extra,
    };
  if (/access is denied|UIAccess|SendKeys/i.test(m))
    return {
      ok: false,
      code: "NO_ACCESSIBILITY",
      detail:
        "Could not send keys to ChatGPT. Run the terminal elevated if needed, focus the ChatGPT window, and retry.",
      ...extra,
    };
  return { ok: false, code: "WIN_ERROR", detail: m.slice(0, 400), ...extra };
}

function runPowerShell(script, { clipText, timeout = 30_000 } = {}) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-"));
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
    const mixed = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
    if (r.status !== 0) {
      const err = new Error(mixed || `powershell exit ${r.status}`);
      err.stderr = mixed;
      throw err;
    }
    return (r.stdout || "").trim();
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
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class TagTeamWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  public static List<long> Acc = new List<long>();
  public static bool EnumCb(IntPtr hWnd, IntPtr lParam) {
    Acc.Add(hWnd.ToInt64());
    return true;
  }
  public static long[] GetWindows() {
    Acc = new List<long>();
    EnumWindows(EnumCb, IntPtr.Zero);
    return Acc.ToArray();
  }
}
"@
`;

function winDefs() {
  const retries = TIMING.focus_retries;
  const retryMs = TIMING.focus_retry_ms;
  const debug = winDebugOn() ? "1" : "0";
  return `
$ErrorActionPreference = 'Stop'
$env:LOB_DEBUG = '${debug}'
${WIN_CS}
$script:WinLog = [ordered]@{
  previous_hwnd = 0
  chatgpt_hwnd = 0
  focus_ok = $false
  focus_attempts = 0
  tab_shortcut = $null
  paste_sent = $false
  enter_sent = $false
  restored = $false
  failure = $null
}
function Dbg([string]$msg) {
  if ($env:LOB_DEBUG -eq '1') { [Console]::Error.WriteLine("win-focus: $msg") }
}
function HwndId([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return 0 }
  return $h.ToInt64()
}
function Emit-Ok {
  $script:WinLog.ok = $true
  $script:WinLog | ConvertTo-Json -Compress
}
function Emit-Fail([string]$code) {
  $script:WinLog.ok = $false
  $script:WinLog.code = $code
  if (-not $script:WinLog.failure) { $script:WinLog.failure = $code }
  $script:WinLog | ConvertTo-Json -Compress
}
function Find-ChatGPTHwnd {
  $ids = @{}
  Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | ForEach-Object { $ids["$($_.Id)"] = $_ }
  if ($ids.Count -eq 0) { return [IntPtr]::Zero }
  $best = [IntPtr]::Zero
  $bestScore = -1
  foreach ($h64 in [TagTeamWin]::GetWindows()) {
    $h = [IntPtr]$h64
    if (-not [TagTeamWin]::IsWindow($h)) { continue }
    $pid = [uint32]0
    [void][TagTeamWin]::GetWindowThreadProcessId($h, [ref]$pid)
    if (-not $ids.ContainsKey("$pid")) { continue }
    $owner = [TagTeamWin]::GetWindow($h, 4)
    if ($owner -ne [IntPtr]::Zero) { continue }
    $clsSb = New-Object System.Text.StringBuilder 256
    [void][TagTeamWin]::GetClassName($h, $clsSb, 256)
    $cls = $clsSb.ToString()
    $titleSb = New-Object System.Text.StringBuilder 256
    [void][TagTeamWin]::GetWindowText($h, $titleSb, 256)
    $title = $titleSb.ToString()
    $rect = New-Object TagTeamWin+RECT
    [void][TagTeamWin]::GetWindowRect($h, [ref]$rect)
    $w = $rect.Right - $rect.Left
    $hgt = $rect.Bottom - $rect.Top
    if ($w -lt 80 -or $hgt -lt 80) { continue }
    $visible = [TagTeamWin]::IsWindowVisible($h)
    $iconic = [TagTeamWin]::IsIconic($h)
    $score = 0
    if ($visible) { $score += 8 }
    if (-not $iconic) { $score += 4 }
    if ($cls -match 'Chrome_WidgetWin') { $score += 4 }
    if ($w -gt 400 -and $hgt -gt 300) { $score += 2 }
    if ($title -match 'ChatGPT|Codex|Chat|PLANNER') { $score += 1 }
    if ($score -gt $bestScore) { $bestScore = $score; $best = $h }
  }
  if ($best -ne [IntPtr]::Zero) { return $best }
  foreach ($p in $ids.Values) {
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) { return $p.MainWindowHandle }
  }
  return [IntPtr]::Zero
}
function Test-ChatGPTForeground([IntPtr]$target) {
  $fg = [TagTeamWin]::GetForegroundWindow()
  if ($fg -eq $target) { return $true }
  if ($fg -eq [IntPtr]::Zero) { return $false }
  $fgPid = [uint32]0
  $tgtPid = [uint32]0
  [void][TagTeamWin]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  [void][TagTeamWin]::GetWindowThreadProcessId($target, [ref]$tgtPid)
  return ($tgtPid -ne 0 -and $fgPid -eq $tgtPid)
}
function Acquire-ChatGPTFocus([IntPtr]$hwnd) {
  $retries = ${retries}
  $wait = ${retryMs}
  for ($i = 1; $i -le $retries; $i++) {
    $script:WinLog.focus_attempts = $i
    Dbg ("focus attempt " + $i + " hwnd=" + (HwndId $hwnd) + " fg=" + (HwndId ([TagTeamWin]::GetForegroundWindow())))
    if (Test-ChatGPTForeground $hwnd) {
      $script:WinLog.focus_ok = $true
      return $true
    }
    $fg = [TagTeamWin]::GetForegroundWindow()
    $dummy = [uint32]0
    $curTid = [TagTeamWin]::GetCurrentThreadId()
    $fgTid = [TagTeamWin]::GetWindowThreadProcessId($fg, [ref]$dummy)
    $tgtTid = [TagTeamWin]::GetWindowThreadProcessId($hwnd, [ref]$dummy)
    [void][TagTeamWin]::AllowSetForegroundWindow(-1)
    $attachedFg = $false
    $attachedTgt = $false
    if ($fgTid -ne 0 -and $fgTid -ne $curTid) {
      $attachedFg = [TagTeamWin]::AttachThreadInput($curTid, $fgTid, $true)
    }
    if ($tgtTid -ne 0 -and $tgtTid -ne $curTid -and $tgtTid -ne $fgTid) {
      $attachedTgt = [TagTeamWin]::AttachThreadInput($curTid, $tgtTid, $true)
    }
    try {
      if ([TagTeamWin]::IsIconic($hwnd)) {
        [void][TagTeamWin]::ShowWindow($hwnd, 9)
      } elseif ($i -eq 1) {
        [void][TagTeamWin]::ShowWindow($hwnd, 5)
      } else {
        [void][TagTeamWin]::ShowWindowAsync($hwnd, 5)
      }
      [void][TagTeamWin]::BringWindowToTop($hwnd)
      [void][TagTeamWin]::SetForegroundWindow($hwnd)
      [void][TagTeamWin]::SetActiveWindow($hwnd)
    } finally {
      if ($attachedTgt) { [void][TagTeamWin]::AttachThreadInput($curTid, $tgtTid, $false) }
      if ($attachedFg) { [void][TagTeamWin]::AttachThreadInput($curTid, $fgTid, $false) }
    }
    if (Test-ChatGPTForeground $hwnd) {
      $script:WinLog.focus_ok = $true
      return $true
    }
    if ($i -lt $retries) { Start-Sleep -Milliseconds $wait }
  }
  $script:WinLog.focus_ok = $false
  $script:WinLog.failure = 'FOCUS_LOST'
  return $false
}
function Restore-Prev {
  if ($script:prevHwnd -ne [IntPtr]::Zero -and $script:prevHwnd -ne $hwnd) {
    [void][TagTeamWin]::SetForegroundWindow($script:prevHwnd)
    $script:WinLog.restored = $true
    Dbg ("restored " + (HwndId $script:prevHwnd))
  }
}
$script:prevHwnd = [TagTeamWin]::GetForegroundWindow()
$hwnd = [IntPtr]::Zero
$script:WinLog.previous_hwnd = HwndId $script:prevHwnd
Dbg ("previous hwnd=" + $script:WinLog.previous_hwnd)
`;
}

function runWinOp(body, opts = {}) {
  const script = `
${winDefs()}
try {
${body}
  Restore-Prev
  Emit-Ok
} catch {
  $msg = [string]$_.Exception.Message
  if ($msg -match '^(APP_NOT_RUNNING|FOCUS_LOST|CLIPBOARD_MISMATCH)$') {
    $script:WinLog.failure = $msg
    Restore-Prev
    Emit-Fail $msg
  } else {
    $script:WinLog.failure = $msg
    Restore-Prev
    Emit-Fail 'WIN_ERROR'
  }
  exit 1
}
`;
  try {
    const out = runPowerShell(script, opts);
    const parsed = parseLastJsonLine(out) || { ok: true };
    if (parsed.ok === false) {
      return classifyWinError(parsed.failure || parsed.code, parsed);
    }
    return { ok: true, win: winLog(parsed) };
  } catch (e) {
    const raw = String((e && e.stderr) || e.message || e);
    const parsed = parseLastJsonLine(raw);
    return classifyWinError((parsed && (parsed.failure || parsed.code)) || raw, parsed);
  }
}

function winAcquireBlock() {
  return `
$hwnd = Find-ChatGPTHwnd
$script:WinLog.chatgpt_hwnd = HwndId $hwnd
Dbg ("chatgpt hwnd=" + $script:WinLog.chatgpt_hwnd)
if ($hwnd -eq [IntPtr]::Zero) { throw 'APP_NOT_RUNNING' }
if (-not (Acquire-ChatGPTFocus $hwnd)) { throw 'FOCUS_LOST' }
Dbg 'focus_ok'
`;
}

function readModeWin() {
  const r = runWinOp(`
${winAcquireBlock()}
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
if ($found) { $script:WinLog.mode_raw = $found } else { $script:WinLog.mode_raw = 'MODE_ELEMENT_NOT_FOUND' }
`);
  if (!r.ok) {
    if (r.code === "APP_NOT_RUNNING" || r.code === "FOCUS_LOST") return r;
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail:
        "Mode verify is not available on Windows yet. Hotkeys still work; skip --verify and confirm Chat/Codex by eye.",
      win: r.win,
    };
  }
  const raw = String((r.win && r.win.mode_raw) || "");
  if (!raw || /MODE_ELEMENT_NOT_FOUND/i.test(raw)) {
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail:
        "Mode verify is not available on Windows yet. Hotkeys still work; skip --verify and confirm Chat/Codex by eye.",
      win: r.win,
    };
  }
  const mode = parseModeLabel(raw) || "unknown";
  return { ok: true, mode, raw, win: r.win };
}

function pressModeKeyWin(key) {
  return runWinOp(`
${winAcquireBlock()}
$script:WinLog.tab_shortcut = 'Alt+${key}'
Dbg $script:WinLog.tab_shortcut
[System.Windows.Forms.SendKeys]::SendWait('%${key}')
Start-Sleep -Milliseconds ${TIMING.mode_settle_ms}
`);
}

function pasteAndEnterWin(text) {
  return modeThenPasteWin(null, text);
}

function modeThenPasteWin(key, text, settleMs = TIMING.mode_settle_ms) {
  const hotkey =
    key == null
      ? ""
      : `
$script:WinLog.tab_shortcut = 'Alt+${key}'
Dbg $script:WinLog.tab_shortcut
[System.Windows.Forms.SendKeys]::SendWait('%${key}')
Start-Sleep -Milliseconds ${settleMs}
if (-not (Test-ChatGPTForeground $hwnd)) { throw 'FOCUS_LOST' }
`;
  return runWinOp(
    `
[System.Windows.Forms.Clipboard]::SetText($clipText)
Start-Sleep -Milliseconds ${TIMING.paste_ms}
$got = [System.Windows.Forms.Clipboard]::GetText()
$a = ($clipText -replace "\`r\`n","\`n")
$b = ($got -replace "\`r\`n","\`n")
if ($a -ne $b) { throw 'CLIPBOARD_MISMATCH' }
${winAcquireBlock()}
${hotkey}if (-not (Test-ChatGPTForeground $hwnd)) { throw 'FOCUS_LOST' }
[System.Windows.Forms.SendKeys]::SendWait('^v')
$script:WinLog.paste_sent = $true
Dbg 'paste_sent'
Start-Sleep -Milliseconds ${TIMING.paste_ms}
if (-not (Test-ChatGPTForeground $hwnd)) { throw 'FOCUS_LOST' }
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
$script:WinLog.enter_sent = $true
Dbg 'enter_sent'
Start-Sleep -Milliseconds ${TIMING.enter_ms}
`,
    { clipText: text }
  );
}

function enterWin() {
  return runWinOp(`
${winAcquireBlock()}
if (-not (Test-ChatGPTForeground $hwnd)) { throw 'FOCUS_LOST' }
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
$script:WinLog.enter_sent = $true
Dbg 'enter_sent'
Start-Sleep -Milliseconds ${TIMING.enter_ms}
`);
}

function readModeOcrWin() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-ocr-"));
  const png = path.join(tmpDir, "chip.png");
  try {
    const r = runWinOp(`
${winAcquireBlock()}
Add-Type -AssemblyName System.Drawing
$rect = New-Object TagTeamWin+RECT
[void][TagTeamWin]::GetWindowRect($hwnd, [ref]$rect)
$w = [Math]::Min(640, [Math]::Max(80, $rect.Right - $rect.Left))
$h = 90
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save(${JSON.stringify(png)})
$g.Dispose(); $bmp.Dispose()
$script:WinLog.cropped = $true
`);
    if (!r.ok || !fs.existsSync(png)) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail: r.ok ? "OCR crop failed." : r.detail || "OCR crop failed.",
        win: r.win,
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
        detail: "OCR requested but tesseract/Windows OCR is not available.",
        win: r.win,
      };
    }
    const mode = parseModeLabel(tess.stdout);
    if (!mode) {
      return {
        ok: false,
        code: "MODE_ELEMENT_NOT_FOUND",
        detail: "OCR empty — no Chat/Work/Codex in crop.",
        win: r.win,
      };
    }
    return { ok: true, mode, via: "ocr", raw: tess.stdout.slice(0, 200), win: r.win };
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

function modeThenPaste(key, text, settleMs = TIMING.mode_settle_ms) {
  if (PLATFORM === "darwin") return modeThenPasteMac(key, text, settleMs);
  if (PLATFORM === "win32") return modeThenPasteWin(key, text, settleMs);
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
  const settle = pasteSettleMs(TIMING, { verify, hotkey: key != null });
  const paste = modeThenPaste(key, text, settle);
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
      win: paste.win,
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
      win: paste.win,
    };
  }
  if (!modesMatch(after.mode, want)) {
    return { ...driftResult(after, want, { switched, skipped_hotkey: skip }), win: paste.win };
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
    win: paste.win,
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
      a !== "--debug" &&
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
          "mode | to chat|work|codex [--verify] [--force-mode] | send <text|-> [--mode chat|codex] | enter | chat-send <text|-> [--verify] [--force-mode] | codex-send <text|-> [--verify] [--force-mode] | --debug",
        platform: PLATFORM,
      });
      process.exitCode = 1;
  }
}

main();

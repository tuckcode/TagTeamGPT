#!/usr/bin/env node
// CodexGPT v1 keystroke driver (macOS).
// Happy path: Control+1/2/3 + clipboard paste + Enter. No screenshots.
// Optional --verify tries an AX read-back (Electron often hides that from
// osascript; Cua / fuller AX clients can still confirm).
//
//   node tools/codexgpt-driver.mjs mode
//   node tools/codexgpt-driver.mjs to chat|work|codex [--verify]
//   node tools/codexgpt-driver.mjs send "text" | send -
//   node tools/codexgpt-driver.mjs chat-send "text" [--verify]
//   node tools/codexgpt-driver.mjs codex-send "text" [--verify]
//
// Mode switch is skipped when already in the target mode (avoids thrashing
// ⌃1/⌃3 and focus-stealing mid-thread). ok:true means keys fired — not that
// Chat/Codex accepted the message into the right thread.

import { execFileSync } from "node:child_process";
import { stdin as input } from "node:process";

const APP = "ChatGPT";
const MODE_MAP = {
  chat: { key: "1", want: "ChatGPT" },
  work: { key: "2", want: "Work" },
  codex: { key: "3", want: "Codex" },
};

const CAVEAT =
  "keys fired only — confirm an active project thread (Codex) or pinned Chat thread received the paste; empty Continue stubs often swallow Enter";

const jxa = (body) =>
  execFileSync("osascript", ["-l", "JavaScript", "-e", body], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();

function runInChatGPT(inner) {
  return jxa(`
    const se = Application('System Events');
    const procs = se.processes.whose({ name: ${JSON.stringify(APP)} });
    if (procs.length === 0) throw new Error('APP_NOT_RUNNING');
    const p = procs[0];
    ${inner}
  `);
}

function classifyError(e) {
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
  if (/MODE_ELEMENT_NOT_FOUND/.test(msg))
    return {
      ok: false,
      code: "MODE_ELEMENT_NOT_FOUND",
      detail:
        "Mode switcher not visible to osascript (common for Electron). Hotkeys still work; skip --verify or use Cua.",
    };
  return { ok: false, code: "OSA_ERROR", detail: msg.slice(0, 300) };
}

function readMode() {
  try {
    const out = runInChatGPT(`
      function findMode(root) {
        const q = [{ el: root, d: 0 }];
        let seen = 0;
        while (q.length && seen < 12000) {
          const { el, d } = q.shift();
          seen++;
          let desc = '';
          try { desc = String(el.description()); } catch (e) {}
          if (desc.indexOf('current mode:') !== -1) return desc;
          if (d < 18) {
            let kids = [];
            try { kids = el.uiElements(); } catch (e) {}
            for (let i = 0; i < kids.length; i++) q.push({ el: kids[i], d: d + 1 });
          }
        }
        return null;
      }
      let found = null;
      for (let w = 0; w < p.windows.length && !found; w++) found = findMode(p.windows[w]);
      if (!found) throw new Error('MODE_ELEMENT_NOT_FOUND');
      found;
    `);
    const m = out.match(/current mode:\s*(.+?)\s*$/i);
    return { ok: true, mode: m ? m[1] : "unknown", raw: out };
  } catch (e) {
    return classifyError(e);
  }
}

function modesMatch(actual, want) {
  return String(actual || "").toLowerCase() === String(want || "").toLowerCase();
}

function pressModeKey(key) {
  try {
    runInChatGPT(`
      p.frontmost = true;
      delay(0.2);
      se.keystroke(${JSON.stringify(key)}, { using: ['control down'] });
      delay(0.35);
      'ok';
    `);
    return { ok: true };
  } catch (e) {
    return classifyError(e);
  }
}

function pasteAndEnter(text) {
  try {
    runInChatGPT(`
      p.frontmost = true;
      delay(0.2);
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;
      app.setTheClipboardTo(${JSON.stringify(text)});
      delay(0.12);
      se.keystroke('v', { using: ['command down'] });
      delay(0.25);
      se.keyCode(36);
      'sent';
    `);
    return { ok: true };
  } catch (e) {
    return classifyError(e);
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function switchMode(name, verify, { force = false } = {}) {
  const cfg = MODE_MAP[name];
  const before = readMode();
  // Never re-press a mode hotkey when already there — especially Chat (⌃1),
  // which can open New chat / leave the pinned thread. `--force` does not
  // override this; use `--force-mode` only when you intentionally want the hotkey.
  if (before.ok && modesMatch(before.mode, cfg.want)) {
    return {
      ok: true,
      mode: before.mode,
      verified: true,
      switched: false,
      skipped_hotkey: true,
    };
  }

  const r = pressModeKey(cfg.key);
  if (!r.ok) return r;
  if (!verify) {
    return {
      ok: true,
      mode: cfg.want,
      verified: false,
      switched: true,
      prior_mode: before.ok ? before.mode : undefined,
    };
  }
  for (let i = 0; i < 12; i++) {
    const m = readMode();
    if (m.ok && modesMatch(m.mode, cfg.want)) {
      return {
        ok: true,
        mode: m.mode,
        verified: true,
        switched: true,
        prior_mode: before.ok ? before.mode : undefined,
      };
    }
    await sleep(250);
  }
  const last = readMode();
  if (last.ok)
    return {
      ok: false,
      code: "MODE_SWITCH_FAILED",
      mode: last.mode,
      want: cfg.want,
      switched: true,
    };
  return { ...last, note: "hotkey sent; AX verify unavailable", switched: true };
}

async function switchAndSend(name, text, verify, { force = false, forceMode = false } = {}) {
  const s = await switchMode(name, verify, { force: forceMode });
  if (!s.ok && s.code !== "MODE_ELEMENT_NOT_FOUND") return { ...s, caveat: CAVEAT };

  // Opaque AX: still paste (keystroke-first), but do NOT report success.
  if (!s.ok && s.code === "MODE_ELEMENT_NOT_FOUND") {
    const paste = pasteAndEnter(text);
    if (!paste.ok) return { ...paste, caveat: CAVEAT };
    return {
      ok: false,
      code: "MODE_UNVERIFIED",
      mode: MODE_MAP[name].want,
      verified: false,
      switched: true,
      paste: "sent",
      detail:
        "Hotkey+paste fired but mode AX is opaque — treat as unverified, not success. Confirm live Codex/Chat thread by eye or Cua.",
      caveat: CAVEAT,
    };
  }

  const paste = pasteAndEnter(text);
  if (!paste.ok) return { ...paste, caveat: CAVEAT };

  // Catch OpenAI desktop auto-routing into Work after a coding-shaped paste.
  await sleep(400);
  const after = readMode();
  const want = MODE_MAP[name].want;
  if (!after.ok) {
    return {
      ok: false,
      code: "MODE_UNVERIFIED",
      mode: s.mode,
      want,
      switched: !!s.switched,
      skipped_hotkey: !!s.skipped_hotkey,
      paste: "sent",
      detail: "Paste fired but post-paste mode AX unavailable — unverified.",
      caveat: CAVEAT,
    };
  }
  if (!modesMatch(after.mode, want)) {
    return {
      ok: false,
      code: "MODE_DRIFT",
      mode: after.mode,
      want,
      switched: !!s.switched,
      skipped_hotkey: !!s.skipped_hotkey,
      paste: "sent",
      detail:
        after.mode === "Work" || /work/i.test(after.mode)
          ? "Paste landed but mode is Work — abort; never use Work as planner/executor. Open a live Codex project thread and retry with --force."
          : `Paste sent but mode is ${after.mode}, expected ${want}`,
      caveat: CAVEAT,
    };
  }

  return {
    ok: true,
    mode: after.mode,
    verified: !!s.verified || modesMatch(after.mode, want),
    switched: !!s.switched,
    skipped_hotkey: !!s.skipped_hotkey,
    paste: "sent",
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
  const pos = args.filter(
    (a) => a !== "--verify" && a !== "--force" && a !== "--force-mode"
  );
  const [cmd, arg, ...rest] = pos;
  let text = [arg, ...rest].filter(Boolean).join(" ");
  if (arg === "-") text = await readStdin();

  switch (cmd) {
    case "mode": {
      const r = readMode();
      print(r);
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
    case "send": {
      if (!text) {
        print({ ok: false, code: "USAGE", detail: 'send "text" | send -' });
        process.exitCode = 1;
        break;
      }
      const r = pasteAndEnter(text);
      print({ ...r, caveat: CAVEAT });
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
          "mode | to chat|work|codex [--verify] [--force-mode] | send <text|-> | chat-send <text|-> [--verify] [--force-mode] | codex-send <text|-> [--verify] [--force-mode]",
      });
      process.exitCode = 1;
  }
}

main();

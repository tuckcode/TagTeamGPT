/**
 * Pure helpers for the Lob keystroke driver (no OS automation).
 * Timing: env beats config beats built-in defaults.
 */

export const TIMING_DEFAULTS = {
  focus_ms: 200,
  mode_settle_ms: 350,
  paste_ms: 120,
  enter_ms: 250,
};

const TIMING_ENV = {
  focus_ms: "LOB_FOCUS_MS",
  mode_settle_ms: "LOB_MODE_SETTLE_MS",
  paste_ms: "LOB_PASTE_MS",
  enter_ms: "LOB_ENTER_MS",
};

function positiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Env > config > TIMING_DEFAULTS. */
export function resolveTiming(cfg = {}, env = process.env) {
  const out = {};
  for (const key of Object.keys(TIMING_DEFAULTS)) {
    const fromEnv = env[TIMING_ENV[key]];
    const fromCfg = cfg[key];
    out[key] = positiveInt(
      fromEnv != null && fromEnv !== "" ? fromEnv : fromCfg != null ? fromCfg : TIMING_DEFAULTS[key],
      TIMING_DEFAULTS[key]
    );
  }
  return out;
}

/** chat-send / codex-send payloads must start with [C2C] (after leading whitespace). */
export function hasC2CPrefix(text) {
  return /^\s*\[C2C\]/.test(String(text ?? ""));
}

/**
 * Clipboard read-back match. Normalizes CRLF→LF; optional trim of trailing newline only.
 */
export function clipboardMatches(expected, actual) {
  const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n");
  return norm(expected) === norm(actual);
}

/** Verify / unknown-mode settle backoff: 200 → 400 → 800 (attempt 0..2). */
export function settleBackoffMs(attempt) {
  const steps = [200, 400, 800];
  const i = Math.max(0, Math.min(Number(attempt) || 0, steps.length - 1));
  return steps[i];
}

/** OCR/vision stuck-path only: LOB_OCR=1 or --verify-vision. */
export function ocrEnabled(argv = process.argv, env = process.env, cfg = {}) {
  if (argv.includes("--verify-vision")) return true;
  if (env.LOB_OCR === "1" || /^true$/i.test(String(env.LOB_OCR || ""))) return true;
  return cfg.ocr === true;
}

export function parseModeLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/current mode:\s*(.+?)\s*$/i);
  const label = (m ? m[1] : s).trim();
  if (/work/i.test(label)) return "Work";
  if (/codex/i.test(label)) return "Codex";
  if (/chat/i.test(label)) return "ChatGPT";
  return label || null;
}

export function modesMatch(actual, want) {
  const a = parseModeLabel(actual) || actual;
  const b = parseModeLabel(want) || want;
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

export function isWorkMode(mode) {
  return parseModeLabel(mode) === "Work" || /^work$/i.test(String(mode || ""));
}

/**
 * Chat ⌃1 / Alt+1 can open New chat — skip that key if already in Chat.
 * Codex ⌃3 / Alt+3 is a lock: never skip it on paste. A prior `to codex`
 * restores Cursor, and the next paste can land in Chat.
 */
export function skipModeHotkeyBeforePaste(
  target,
  { beforeOk, beforeMode, force } = {}
) {
  if (force) return false;
  if (target === "codex") return false;
  if (!beforeOk) return false;
  if (target === "chat") return modesMatch(beforeMode, "ChatGPT");
  if (target === "work") return modesMatch(beforeMode, "Work");
  return false;
}

/** Last STATE: in a blob (latest assistant turn). */
export function parseC2C(text) {
  const raw = String(text ?? "");
  const states = [...raw.matchAll(/STATE:\s*(INIT|PLAN|EXECUTED|DONE|BLOCKED|READY)/gi)];
  if (!states.length) return { ok: false, code: "NO_STATE", detail: "No C2C STATE found" };
  const last = states[states.length - 1];
  const state = last[1].toUpperCase();
  const from = last.index;
  const window = raw.slice(Math.max(0, from - 40), from + 1200);
  const task = window.match(/TASK_ID:\s*(c2c_[a-zA-Z0-9]+)/i);
  return {
    ok: true,
    state,
    task_id: task ? task[1] : null,
    snippet: window.slice(0, 800),
  };
}

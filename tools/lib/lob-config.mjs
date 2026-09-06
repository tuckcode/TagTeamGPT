/**
 * Shared Lob config. Defaults make the full Chat→Codex loop the happy path.
 *
 * Merge order (later wins): built-in → repo `lob.config.json` → `.lob/config.json` → env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const STATE_DIR = path.join(ROOT, ".lob");

export const DEFAULTS = {
  /** Paste PLAN into Codex (Control+3) during the loop */
  codex: true,
  /** Write DONE/BLOCKED notes to Rhizome mailbox */
  mailbox: true,
  /** Write/update Rhizome memory notes for the goal */
  memory: true,
  /** Paste boot prompt before INIT (usually false — pin + boot once) */
  boot: false,
  /** Mailbox nudge: new notes since last --ack */
  mailbox_nudge_count: 10,
  /** Mailbox nudge: days since last --ack */
  mailbox_nudge_days: 14,
  /** MCP+tunnel idle auto-stop (minutes). 0 = disabled */
  mcp_idle_minutes: 60,
  /** Driver timing (ms). Env LOB_*_MS overrides these. */
  focus_ms: 200,
  mode_settle_ms: 350,
  paste_ms: 120,
  enter_ms: 250,
  /** Stuck-path OCR of mode chip; off on happy path. LOB_OCR=1 / --verify-vision */
  ocr: false,
};

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function loadConfig() {
  const repo = readJson(path.join(ROOT, "lob.config.json"));
  const local = readJson(path.join(STATE_DIR, "config.json"));
  return { ...DEFAULTS, ...repo, ...local };
}

/** CLI flag wins over config. --no-X forces off; --X forces on. */
export function flagOrConfig(argv, onFlag, offFlag, configKey, cfg = loadConfig()) {
  if (argv.includes(offFlag)) return false;
  if (argv.includes(onFlag)) return true;
  return !!cfg[configKey];
}

export { ROOT, STATE_DIR };

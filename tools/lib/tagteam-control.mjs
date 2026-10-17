import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "./tagteam-config.mjs";

const source = fileURLToPath(new URL("../native/tagteam-control.swift", import.meta.url));
const statePath = path.join(STATE_DIR, "ui-control.json");

function read() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return { phase: "idle", targets: {} };
    throw new Error("Control state is unreadable. Inspect it before continuing.");
  }
}
function write(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temporary = statePath + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, statePath);
}

function native(request) {
  const digest = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex").slice(0, 16);
  const binary = path.join(STATE_DIR, "bin", `control-${digest}`);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  if (!fs.existsSync(binary)) {
    const built = spawnSync("swiftc", ["-module-cache-path", path.join(STATE_DIR, "bin", "module-cache"), source, "-o", binary], { encoding: "utf8", timeout: 120_000 });
    if (built.status !== 0) return { ok: false, code: "CONTROL_BUILD_FAILED", detail: built.stderr?.slice(0, 1000) };
  }
  const run = spawnSync(binary, [], { input: JSON.stringify(request), encoding: "utf8", timeout: 20_000 });
  try { return JSON.parse(run.stdout); }
  catch { return { ok: false, code: "CONTROL_HELPER_FAILED", detail: run.error?.message || run.stderr?.slice(0, 500) || "No verified result." }; }
}

/** The native helper owns the indicator, input monitor, and all keyboard events. */
export function guardedControl(request, deps = { read, write, native, platform: process.platform }) {
  const state = deps.read();
  if (request.action === "status") return { ok: true, ...state };
  const fail = (code, detail) => ({ ok: false, code, detail, accepted: false });
  if (deps.platform !== "darwin") return fail("CONTROL_UNSUPPORTED", "Guarded desktop control currently supports macOS. Use manual handoffs on this platform.");
  if (request.action === "test") {
    if (state.phase === "active") return fail("CONTROL_BUSY", "An unfinished control session requires inspection first.");
    deps.write({ ...state, phase: "active", reason: null });
    let result;
    try { result = deps.native({ ...request, text: undefined, target: undefined }); }
    catch (error) { result = fail("CONTROL_HELPER_FAILED", error.message); }
    const passed = result.code === "USER_INTERRUPTED" && result.paste_sent === false && result.enter_sent === false;
    deps.write({ ...state, phase: "paused", reason: result.code, paste_sent: !!result.paste_sent, enter_sent: !!result.enter_sent,
      interruption_source: result.interruption_source });
    return { ...result, ok: passed, test_passed: passed, phase: "paused", accepted: false };
  }
  if (!["chat", "codex"].includes(request.mode)) return fail("TARGET_NOT_BOUND", "Specify --mode chat or --mode codex.");
  if (state.phase === "active" && !["resume", "bind"].includes(request.action)) return fail("CONTROL_PAUSED", "A previous control process did not finish. Inspect the conversation and explicitly resume.");
  if (state.phase === "paused" && !["resume", "bind", "pause"].includes(request.action)) {
    return fail("CONTROL_PAUSED", "Control is paused. Inspect the conversation and draft. Run resume explicitly. No message will replay.");
  }
  if (request.action === "pause") {
    deps.write({ ...state, phase: "paused", reason: "MANUAL_PAUSE" });
    return { ok: true, phase: "paused" };
  }
  const target = state.targets?.[request.mode];
  if (request.action !== "bind" && !target) return fail("TARGET_NOT_BOUND", "Bind the intended conversation before sending a handoff.");
  if (request.action === "send" && !/^\s*\[C2C\]/.test(request.text || "")) return fail("NOT_C2C", "A handoff must start with [C2C].");
  if (!["bind", "resume", "send"].includes(request.action)) return fail("CONTROL_UNSAFE_ACTION", "Standalone mode changes and Enter retries are disabled. Use a guarded send.");
  deps.write({ ...state, phase: "active", mode: request.mode, reason: null });
  let result;
  try { result = deps.native({ ...request, target }); }
  catch (error) { result = fail("CONTROL_HELPER_FAILED", error.message); }
  const observed = result.target || target;
  const fields = ["pid", "bundle", "title", "window_id", "mode"];
  const identityVerified = observed && Number.isSafeInteger(observed.pid) && observed.pid > 0 &&
    Number.isSafeInteger(observed.window_id) && observed.window_id > 0 &&
    typeof observed.title === "string" && observed.title.length > 0 &&
    ["com.openai.chat", "com.openai.codex"].includes(observed.bundle) && observed.mode === request.mode &&
    (request.action === "bind" || fields.every(key => observed[key] === target?.[key]));
  const verified = result.ok && result.verified === true &&
    identityVerified &&
    (request.action !== "send" || (result.paste_sent === true && result.enter_sent === true));
  if (!verified) {
    deps.write({ ...state, phase: "paused", mode: request.mode, reason: result.code || "CONTROL_UNVERIFIED",
      paste_sent: !!result.paste_sent, enter_sent: !!result.enter_sent });
    return { ...result, ok: false, code: result.code || "CONTROL_UNVERIFIED", phase: "paused", accepted: false };
  }
  deps.write({ ...state, phase: "idle", reason: null, paste_sent: false, enter_sent: false,
    targets: { ...state.targets, [request.mode]: result.target || target } });
  return { ...result, accepted: false, phase: "idle" };
}

/** A process lock prevents two senders from sharing the keyboard. */
export function control(request) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pauseFile = path.join(STATE_DIR, "ui-control.pause");
  if (request.action === "status") return { ...guardedControl(request), pause_requested: fs.existsSync(pauseFile) };
  if (request.action === "pause") {
    fs.writeFileSync(pauseFile, "Pause requested.\n", { mode: 0o600 });
    return { ok: true, phase: "pause_requested", detail: "The active helper will stop at its next input check." };
  }
  const lock = path.join(STATE_DIR, "ui-control.lock");
  let fd;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
    fs.writeFileSync(fd, String(process.pid));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return { ok: false, code: "CONTROL_BUSY", detail: "Another controller holds the lock. Do not remove it while that process runs." };
  }
  try {
    if (["resume", "bind"].includes(request.action)) fs.rmSync(pauseFile, { force: true });
    return guardedControl({ ...request, pause_file: pauseFile });
  }
  finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "./tagteam-config.mjs";

const source = fileURLToPath(new URL("../native/tagteam-control.swift", import.meta.url));
const statePath = path.join(STATE_DIR, "ui-control.json");
const SETUP_CONTROLS = {
  AXButton: ["New chat", "Don't work in a project", "Show sidebar", "Hide sidebar"],
  AXCheckBox: ["Chat"],
  AXPopUpButton: ["Switch mode, current mode: ChatGPT", "Switch mode, current mode: Codex", "Choose project", "Work in", "Choose where to run this chat"],
  AXMenuItem: ["ChatGPT Create, learn, and explore", "Codex Build, debug, and ship"],
  AXTextArea: ["Message ChatGPT", "Message", "Work with ChatGPT", "Work with Codex", "Do anything"],
};
export function validSetupStep(step) {
  const selector = value => value && typeof value.role === "string" && /^AX[A-Za-z]+$/.test(value.role) &&
    typeof value.label === "string" && value.label.length > 0 && value.label.length <= 256 &&
    ["selected", "enabled", "focused"].every(key => value[key] === undefined || typeof value[key] === "boolean") &&
    Object.keys(value).every(key => ["role", "label", "selected", "enabled", "focused"].includes(key));
  return !!(step && selector(step.control) && selector(step.after) &&
    SETUP_CONTROLS[step.control.role]?.includes(step.control.label) &&
    (step.window_title_after === undefined || (typeof step.window_title_after === "string" && step.window_title_after.length > 0 && step.window_title_after.length <= 256)) &&
    Object.keys(step).every(key => ["control", "after", "window_title_after"].includes(key)));
}
function validIdentity(target, mode) {
  return target && Number.isSafeInteger(target.pid) && target.pid > 0 &&
    Number.isSafeInteger(target.window_id) && target.window_id > 0 &&
    typeof target.title === "string" && target.title.length > 0 &&
    ["com.openai.chat", "com.openai.codex"].includes(target.bundle) && target.mode === mode;
}

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
  if (["setup-bind", "setup-resume", "setup"].includes(request.action)) {
    if (state.phase === "active") return fail("CONTROL_BUSY", "An unfinished control session requires inspection first.");
    if (state.phase === "paused" && request.action === "setup") return fail("CONTROL_PAUSED", "Inspect the screen and explicitly resume setup before another click.");
    const target = state.setup_target;
    if (request.action !== "setup-bind" && !target) return fail("TARGET_NOT_BOUND", "Bind the setup window before clicking.");
    if (request.action === "setup" && !validSetupStep(request.setup)) return fail("SETUP_INVALID", "Specify one allowed setup control and an exact expected result.");
    deps.write({ ...state, phase: "active", reason: null, operation: request.action });
    let result;
    try { result = deps.native({ action: request.action, mode: "setup", target,
      setup: request.setup, pause_file: request.pause_file }); }
    catch (error) { result = fail("CONTROL_HELPER_FAILED", error.message); }
    const observed = result.target;
    const title = request.setup?.window_title_after || target?.title;
    const identityVerified = validIdentity(observed, "setup") && (request.action === "setup-bind" ||
      ["pid", "bundle", "window_id", "mode"].every(key => observed[key] === target[key]) && observed.title === title);
    const verified = result.ok && result.verified === true && identityVerified &&
      !result.keys_fired && !result.paste_sent && !result.enter_sent &&
      (request.action !== "setup" || result.click_performed === true && result.postcondition_verified === true);
    if (!verified) {
      deps.write({ ...state, phase: "paused", operation: request.action, reason: result.code || "SETUP_UNVERIFIED",
        click_attempted: !!result.click_attempted, click_performed: !!result.click_performed });
      return { ...result, ok: false, code: result.code || "SETUP_UNVERIFIED", phase: "paused", accepted: false };
    }
    deps.write({ ...state, setup_target: observed, phase: "idle", reason: null, operation: request.action,
      click_attempted: false, click_performed: false });
    return { ...result, phase: "idle", accepted: false };
  }
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
  const identityVerified = validIdentity(observed, request.mode) &&
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
  if (request.action === "status") return { ...guardedControl(request), ...(fs.existsSync(pauseFile) ? { phase: "paused" } : {}), pause_requested: fs.existsSync(pauseFile) };
  if (request.action === "pause") {
    fs.writeFileSync(pauseFile, "Pause requested.\n", { mode: 0o600 });
    return { ok: true, phase: "pause_requested", detail: "The active helper will stop at its next input check." };
  }
  const arm = ["resume", "bind", "setup-bind", "setup-resume"].includes(request.action);
  if (fs.existsSync(pauseFile) && !arm && request.action !== "test") {
    return { ok: false, code: "CONTROL_PAUSED", phase: "paused", accepted: false,
      detail: "A pause was requested. Inspect the screen and explicitly resume before further input." };
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
    if (arm) fs.rmSync(pauseFile, { force: true });
    return guardedControl({ ...request, pause_file: pauseFile });
  }
  finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

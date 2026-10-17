import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { guardedControl } from "./lib/tagteam-control.mjs";

const target = { pid: 123, window_id: 456, title: "TEST-PLANNER", bundle: "com.openai.codex", mode: "chat" };
function fixture(nativeResult = { ok: true, verified: true, keys_fired: true, paste_sent: true, enter_sent: true }) {
  let state = { targets: { chat: target }, phase: "idle" };
  const calls = [];
  const deps = {
    read: () => structuredClone(state), write: value => { state = structuredClone(value); },
    native: request => { calls.push(request); return nativeResult; }, platform: "darwin",
  };
  return { deps, calls, state: () => state };
}
{
  const f = fixture({ ok: false, code: "USER_INTERRUPTED", paste_sent: false, enter_sent: false, interruption_source: "mouse_click" });
  const result = guardedControl({ action: "test", text: "This must not reach the helper." }, f.deps);
  assert.equal(result.test_passed, true);
  assert.equal(f.calls[0].text, undefined);
  assert.equal(f.calls[0].target, undefined);
  assert.equal(f.state().phase, "paused");
}
{
  const f = fixture({ ok: false, code: "MONITOR_UNAVAILABLE", paste_sent: false, enter_sent: false });
  assert.equal(guardedControl({ action: "test" }, f.deps).test_passed, false);
  assert.equal(f.state().phase, "paused");
}
for (const code of ["USER_INTERRUPTED", "TARGET_CHANGED", "MODE_UNVERIFIED", "MONITOR_UNAVAILABLE", "COMPOSER_NOT_EMPTY"]) {
  const f = fixture({ ok: false, code, paste_sent: code === "USER_INTERRUPTED", enter_sent: false });
  const result = guardedControl({ action: "send", mode: "chat", text: "[C2C]\nSTATE: INIT" }, f.deps);
  assert.equal(result.ok, false);
  assert.equal(f.state().phase, "paused");
  assert.equal(f.state().enter_sent, false);
  const again = guardedControl({ action: "send", mode: "chat", text: "[C2C]\nSTATE: INIT" }, f.deps);
  assert.equal(again.code, "CONTROL_PAUSED");
  assert.equal(f.calls.length, 1, "A paused send must not retry, refocus, or submit.");
}
for (const command of [["enter"], ["to", "chat"], ["to", "codex", "--force-mode"]]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./tagteam-driver.mjs", import.meta.url)), ...command], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).code, "CONTROL_UNSAFE_ACTION");
}
{
  const f = fixture();
  f.deps.native = () => { throw new Error("Native helper crashed."); };
  assert.equal(guardedControl({ action: "send", mode: "chat", text: "[C2C]" }, f.deps).code, "CONTROL_HELPER_FAILED");
  assert.equal(f.state().phase, "paused");
}
{
  const f = fixture();
  assert.equal(guardedControl({ action: "send", mode: "codex", text: "[C2C]" }, f.deps).code, "TARGET_NOT_BOUND");
  assert.equal(f.calls.length, 0);
}
{
  const f = fixture();
  const result = guardedControl({ action: "send", mode: "chat", text: "[C2C]\nSTATE: INIT" }, f.deps);
  assert.equal(result.ok, true);
  assert.equal(result.accepted, false);
  assert.equal(f.state().phase, "idle");
  assert.deepEqual(f.calls[0].target, target);
}
{
  const f = fixture({ ok: true });
  assert.equal(guardedControl({ action: "send", mode: "chat", text: "[C2C]" }, f.deps).ok, false,
    "An unverifiable native result cannot authorize a send.");
  assert.equal(f.state().phase, "paused");
}
{
  const f = fixture({ ok: true, verified: true, target: { ...target, title: "WRONG-CONVERSATION" } });
  assert.equal(guardedControl({ action: "resume", mode: "chat" }, f.deps).ok, false);
  assert.equal(f.state().phase, "paused");
}
{
  const f = fixture({ ok: false, code: "USER_INTERRUPTED" });
  guardedControl({ action: "send", mode: "chat", text: "[C2C]" }, f.deps);
  f.deps.native = () => ({ ok: true, verified: true, target });
  assert.equal(guardedControl({ action: "resume", mode: "chat" }, f.deps).ok, true);
  assert.equal(f.state().phase, "idle");
  assert.equal(f.calls.length, 1, "Resume must not replay a pending message.");
}
{
  const f = fixture();
  f.deps.platform = "win32";
  assert.equal(guardedControl({ action: "send", mode: "chat", text: "[C2C]" }, f.deps).code, "CONTROL_UNSUPPORTED");
  assert.equal(f.calls.length, 0);
}

const setupTarget = { ...target, mode: "setup", title: "ChatGPT" };
const setupStep = { control: { role: "AXCheckBox", label: "Chat", selected: false },
  after: { role: "AXTextArea", label: "Message ChatGPT" } };
function setupFixture() {
  const f = fixture({ ok: true, verified: true, target: setupTarget });
  assert.equal(guardedControl({ action: "setup-bind" }, f.deps).ok, true);
  f.calls.length = 0;
  return f;
}
{
  const f = setupFixture();
  f.deps.native = request => {
    f.calls.push(request);
    return { ok: false, code: "USER_INTERRUPTED", click_performed: false };
  };
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, false);
  assert.equal(f.state().phase, "paused");
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).code, "CONTROL_PAUSED");
  assert.equal(f.calls.length, 1, "A setup interruption must cancel subsequent clicks.");
}
for (const code of ["TARGET_CHANGED", "SETUP_AMBIGUOUS", "SETUP_POSTCONDITION_FAILED", "MONITOR_UNAVAILABLE"]) {
  const f = setupFixture();
  f.deps.native = () => ({ ok: false, code, click_performed: code === "SETUP_POSTCONDITION_FAILED" });
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, false);
  assert.equal(f.state().phase, "paused");
}
{
  const f = setupFixture();
  f.deps.native = () => ({ ok: true, verified: true, click_performed: true, postcondition_verified: true, target: setupTarget });
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, true);
  assert.deepEqual(f.state().setup_target, setupTarget);
  assert.deepEqual(f.state().targets.chat, target, "Setup must not replace the handoff binding.");
}
{
  const f = setupFixture();
  assert.equal(guardedControl({ action: "setup", setup: { ...setupStep, control: { role: "AXButton", label: "Send" } } }, f.deps).code, "SETUP_INVALID");
  assert.equal(f.calls.length, 0);
  assert.equal(guardedControl({ action: "setup", setup: { control: setupStep.control } }, f.deps).code, "SETUP_INVALID");
}
{
  const f = setupFixture();
  f.deps.native = () => ({ ok: true, verified: true, click_performed: true, target: setupTarget });
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, false,
    "A click without a verified outcome is a paused failure.");
}
for (const flag of ["keys_fired", "paste_sent", "enter_sent"]) {
  const f = setupFixture();
  f.deps.native = () => ({ ok: true, verified: true, click_performed: true, postcondition_verified: true,
    target: setupTarget, [flag]: true });
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, false);
  assert.equal(f.state().phase, "paused");
}
{
  const f = setupFixture();
  f.deps.native = () => ({ ok: true, verified: true, target: { ...setupTarget, window_id: 999 } });
  assert.equal(guardedControl({ action: "setup-resume" }, f.deps).ok, false);
  assert.equal(f.state().phase, "paused");
}
{
  const f = setupFixture();
  f.deps.native = () => ({ ok: false, code: "USER_INTERRUPTED", click_attempted: true, click_performed: true });
  guardedControl({ action: "setup", setup: setupStep }, f.deps);
  assert.equal(f.state().click_attempted, true);
  assert.equal(f.state().click_performed, true);
  f.deps.native = request => { f.calls.push(request); return { ok: true, verified: true, target: setupTarget }; };
  assert.equal(guardedControl({ action: "setup-resume" }, f.deps).ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].action, "setup-resume", "Setup resume must only verify the screen.");
}
{
  const f = setupFixture();
  const next = { ...setupTarget, title: "Expected new title" };
  f.deps.native = () => ({ ok: true, verified: true, target: next, click_performed: true, postcondition_verified: true });
  assert.equal(guardedControl({ action: "setup", setup: setupStep }, f.deps).ok, false, "Undeclared title changes must pause.");
  f.deps.native = () => ({ ok: true, verified: true, target: setupTarget });
  guardedControl({ action: "setup-resume" }, f.deps);
  f.deps.native = () => ({ ok: true, verified: true, target: next, click_performed: true, postcondition_verified: true });
  assert.equal(guardedControl({ action: "setup", setup: { ...setupStep, window_title_after: next.title } }, f.deps).ok, true);
}
for (const extra of [{ x: 10, y: 10 }, { steps: [setupStep] }, { force: true }]) {
  const f = setupFixture();
  assert.equal(guardedControl({ action: "setup", setup: { ...setupStep, ...extra } }, f.deps).code, "SETUP_INVALID");
  assert.equal(f.calls.length, 0);
}
console.log("ok: guarded handoffs and setup clicks pause, verify identity, and never replay");

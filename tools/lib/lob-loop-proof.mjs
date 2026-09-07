/**
 * Loop proof helpers. Driver ok:true = keys_fired; accepted = next [C2C]
 * STATE in last-reply.json (Chat) or <repo>/.lob/executed.json (Codex).
 * Chat wait never Select-Alls the thread. One Enter retry on timeout, then NO_REPLY.
 */
import fs from "node:fs";
import path from "node:path";

export const WIN_CLIP_HINT =
  "Get-Clipboard -Raw | node tools/lob-write-reply.mjs --from-clipboard";
export const POSIX_CLIP_HINT =
  "pbpaste | node tools/lob-write-reply.mjs --from-clipboard";

export function clipboardHint(platform = process.platform) {
  return platform === "win32" ? WIN_CLIP_HINT : POSIX_CLIP_HINT;
}

export function executedJsonPath(repoPath) {
  return path.join(repoPath, ".lob", "executed.json");
}

export function chatReplyPaths(stateReplyPath, repoPath) {
  const paths = [];
  if (stateReplyPath) paths.push(stateReplyPath);
  if (repoPath) {
    const alt = path.join(repoPath, ".lob", "last-reply.json");
    if (!paths.some((p) => path.resolve(p) === path.resolve(alt))) paths.push(alt);
  }
  return paths;
}

export function noReplyPayload(last, platform = process.platform) {
  return {
    ok: false,
    code: "NO_REPLY",
    last,
    hint: clipboardHint(platform),
    keys_fired: true,
    accepted: false,
  };
}

export function replyMatches(last, want, taskId) {
  const states = want instanceof Set ? want : new Set([...want].map((s) => String(s).toUpperCase()));
  return (
    last?.ok &&
    states.has(String(last.state).toUpperCase()) &&
    (!taskId || !last.task_id || last.task_id === taskId)
  );
}

export function peekReplyFile(replyPath) {
  if (!replyPath || !fs.existsSync(replyPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(replyPath, "utf8"));
    if (parsed && parsed.state) {
      return { ok: true, ...parsed, _from_file: true, _path: replyPath };
    }
  } catch {
    /* ignore malformed — never invent PLAN */
  }
  return null;
}

export function peekReplyFiles(paths) {
  for (const p of paths || []) {
    const last = peekReplyFile(p);
    if (last) return last;
  }
  return null;
}

export function consumeReplyFile(replyPath) {
  if (!replyPath || !fs.existsSync(replyPath)) return;
  try {
    fs.unlinkSync(replyPath);
  } catch {
    /* ignore */
  }
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Chat wait: poll last-reply.json only. Do not Select All the Chat thread. */
export async function waitForChatState(wanted, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const taskId = opts.taskId;
  const want = new Set(wanted.map((s) => s.toUpperCase()));
  const paths = opts.replyPaths ?? [opts.replyPath].filter(Boolean);
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => Date.now());
  const pollMs = opts.pollMs ?? 300;
  const start = now();
  let last = null;
  while (now() - start < timeoutMs) {
    last = peekReplyFiles(paths);
    if (replyMatches(last, want, taskId)) {
      consumeReplyFile(last._path);
      return { ...last, accepted: true };
    }
    await sleep(pollMs);
  }
  return noReplyPayload(last, opts.platform);
}

/**
 * On Chat wait timeout: one driver `enter`, wait again, then NO_REPLY.
 * Never spam Enter. enterOnce is invoked at most once.
 */
export async function waitForChatStateWithRetry(wanted, opts = {}) {
  const wait = opts.waitFn ?? waitForChatState;
  const enterOnce = opts.enterOnce;
  const log = opts.log ?? (() => {});
  const platform = opts.platform ?? process.platform;

  let result = await wait(wanted, opts);
  if (result.ok) return result;

  if (typeof enterOnce !== "function") {
    return result.code === "NO_REPLY" ? result : noReplyPayload(result.last, platform);
  }

  const enterResult = enterOnce();
  log({
    phase: "chat-enter-retry",
    keys_fired: !!enterResult?.ok,
    accepted: false,
    retried: true,
    ...enterResult,
  });

  result = await wait(wanted, opts);
  if (result.ok) return { ...result, enter_retry: true, accepted: true };
  return noReplyPayload(result.last, platform);
}

export async function waitForExecutedFile(execPath, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const pollMs = opts.pollMs ?? 1500;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => Date.now());
  const start = now();
  fs.mkdirSync(path.dirname(execPath), { recursive: true });
  if (fs.existsSync(execPath)) fs.unlinkSync(execPath);
  while (now() - start < timeoutMs) {
    if (fs.existsSync(execPath)) {
      const raw = fs.readFileSync(execPath, "utf8");
      fs.unlinkSync(execPath);
      return JSON.parse(raw);
    }
    await sleep(pollMs);
  }
  return null;
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseC2C } from "../../tools/lib/tagteam-driver-helpers.mjs";

const DENY_NAME = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
  "secrets.json",
  "mcp.token",
  ".npmrc",
]);

const DENY_PART = [
  "/.git/",
  "/node_modules/",
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.cursor/hooks/state/",
  "/.tagteam/",
  "/.codexgpt/",
];

export const SERVER_MAX_DELIVERY = 64 * 1024;
export const SERVER_MAX_ACQUIRE = 256 * 1024;
export const SERVER_MAX_TIMEOUT_MS = 30_000;
const MIN_DELIVERY = 512;
const MIN_ACQUIRE = 1024;
const MIN_TIMEOUT_MS = 50;

export function resolveRoot(cwd = process.env.TAGTEAM_ROOT || process.cwd()) {
  return path.resolve(cwd);
}

export function resolveLimits(env = process.env) {
  return {
    delivery: {
      read: readLimit("TAGTEAM_BUDGET_READ", env.TAGTEAM_BUDGET_READ, 16 * 1024, MIN_DELIVERY, SERVER_MAX_DELIVERY),
      diff: readLimit("TAGTEAM_BUDGET_DIFF", env.TAGTEAM_BUDGET_DIFF, 16 * 1024, MIN_DELIVERY, SERVER_MAX_DELIVERY),
      search: readLimit("TAGTEAM_BUDGET_SEARCH", env.TAGTEAM_BUDGET_SEARCH, 8 * 1024, MIN_DELIVERY, SERVER_MAX_DELIVERY),
      list: readLimit("TAGTEAM_BUDGET_LIST", env.TAGTEAM_BUDGET_LIST, 8 * 1024, MIN_DELIVERY, SERVER_MAX_DELIVERY),
      status: readLimit("TAGTEAM_BUDGET_STATUS", env.TAGTEAM_BUDGET_STATUS, 8 * 1024, MIN_DELIVERY, SERVER_MAX_DELIVERY),
    },
    acquire: readLimit("TAGTEAM_ACQUIRE_BYTES", env.TAGTEAM_ACQUIRE_BYTES, 64 * 1024, MIN_ACQUIRE, SERVER_MAX_ACQUIRE),
    timeoutMs: readLimit("TAGTEAM_TOOL_TIMEOUT_MS", env.TAGTEAM_TOOL_TIMEOUT_MS, 5_000, MIN_TIMEOUT_MS, SERVER_MAX_TIMEOUT_MS),
  };
}

function readLimit(name, raw, fallback, min, max) {
  if (raw == null || String(raw).trim() === "") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${name}`);
  const n = Number(text);
  if (n < min || n > max) throw new Error(`${name} is outside ${min}..${max}`);
  return n;
}

function limitsOf(opts) {
  return opts?.limits || resolveLimits();
}

export function assertSafeRel(root, rel = ".") {
  const cleaned = String(rel || ".").replace(/\\/g, "/");
  if (cleaned.includes("\0")) throw new Error("invalid path");
  const abs = path.resolve(root, cleaned);
  const rootN = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(rootN)) {
    throw new Error("path escapes workspace");
  }
  const base = path.basename(abs);
  if (DENY_NAME.has(base) || base.startsWith(".env")) {
    throw new Error("sensitive file denied");
  }
  const norm = abs.replace(/\\/g, "/");
  for (const part of DENY_PART) {
    if (norm.includes(part)) throw new Error("path denied");
  }
  return abs;
}

export function textResult(obj) {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : payloadText(obj) }],
  };
}

export function payloadText(obj) {
  return JSON.stringify(obj, null, 2);
}

export function mcpByteLength(payload) {
  const text = typeof payload === "string" ? payload : payloadText(payload);
  return Buffer.byteLength(JSON.stringify({ content: [{ type: "text", text }] }), "utf8");
}

export function errorResult(err, budget = 8 * 1024) {
  const message = String(err?.message || err);
  const make = (text) => ({
    isError: true,
    content: [{ type: "text", text }],
  });
  const fits = (text) => Buffer.byteLength(JSON.stringify(make(text)), "utf8") <= budget;
  if (fits(message)) return make(message);
  const suffix = "\n[Error details exceed the response limit.]";
  if (!fits(suffix)) throw new Error("delivery budget below the error envelope");
  let lo = 0;
  let hi = message.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(message.slice(0, snapDown(message, mid)) + suffix)) lo = mid;
    else hi = mid - 1;
  }
  return make(message.slice(0, snapDown(message, lo)) + suffix);
}

function pack(obj, budget) {
  let guess = budget;
  for (let i = 0; i < 8; i++) {
    const size = mcpByteLength({ ...obj, returned_bytes: guess });
    if (size === guess) return { obj: { ...obj, returned_bytes: size }, ok: size <= budget };
    if (size > budget) return { obj: { ...obj, returned_bytes: size }, ok: false };
    guess = size;
  }
  const size = mcpByteLength({ ...obj, returned_bytes: guess });
  return { obj: { ...obj, returned_bytes: size }, ok: size <= budget && size === guess };
}

function snapDown(text, i) {
  if (i <= 0) return 0;
  if (i > text.length) i = text.length;
  const prev = text.charCodeAt(i - 1);
  if (prev >= 0xd800 && prev <= 0xdbff) return i - 1;
  return i;
}

function dropCodePoint(text) {
  if (!text) return "";
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xdc00 && last <= 0xdfff && text.length >= 2) return text.slice(0, -2);
  return text.slice(0, -1);
}

function fitTextPayload(make, budget, text) {
  const packed = (slice) => pack(make(slice), budget);
  const full = packed(text);
  if (full.ok) return full.obj;
  const empty = packed("");
  if (!empty.ok) throw new Error("delivery budget below the response envelope");
  let lo = 0;
  let hi = text.length;
  let guard = 0;
  while (lo < hi && guard++ < text.length + 2) {
    let mid = Math.ceil((lo + hi) / 2);
    mid = snapDown(text, mid);
    if (mid <= lo) break;
    if (packed(text.slice(0, mid)).ok) lo = mid;
    else hi = snapDown(text, mid - 1);
  }
  let chosen = text.slice(0, snapDown(text, lo));
  while (chosen.length > 0 && !packed(chosen).ok) chosen = dropCodePoint(chosen);
  return packed(chosen).obj;
}

function packCursor(obj) {
  return Buffer.from(JSON.stringify({ v: 1, ...obj }), "utf8").toString("base64url");
}

function unpackCursor(cursor) {
  if (cursor == null || cursor === "") return null;
  let obj;
  try {
    obj = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid cursor");
  }
  if (
    !obj ||
    obj.v !== 1 ||
    typeof obj.kind !== "string" ||
    typeof obj.rev !== "string" ||
    typeof obj.pos !== "number" ||
    !Number.isInteger(obj.pos) ||
    obj.pos < 0
  ) {
    throw new Error("invalid cursor");
  }
  return obj;
}

function hashRev(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 20);
}

function fileRevision(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}:${stat.ino}`;
}

function utf8SeqLen(buf, i) {
  const b0 = buf[i];
  let need = 0;
  if (b0 < 0x80) return 1;
  if ((b0 & 0xe0) === 0xc0) need = 2;
  else if ((b0 & 0xf0) === 0xe0) need = 3;
  else if ((b0 & 0xf8) === 0xf0) need = 4;
  else return -1;
  if (i + need > buf.length) return 0;
  const b1 = buf[i + 1];
  for (let j = 1; j < need; j++) {
    if ((buf[i + j] & 0xc0) !== 0x80) return -1;
  }
  if (need === 2 && b0 < 0xc2) return -1;
  if (need === 3 && b0 === 0xe0 && b1 < 0xa0) return -1;
  if (need === 3 && b0 === 0xed && b1 >= 0xa0) return -1;
  if (need === 4 && (b0 > 0xf4 || (b0 === 0xf0 && b1 < 0x90) || (b0 === 0xf4 && b1 >= 0x90))) return -1;
  return need;
}

function decodeUtf8Prefix(buf, eof) {
  let i = 0;
  let text = "";
  const ends = [];
  while (i < buf.length) {
    const n = utf8SeqLen(buf, i);
    if (n === 0) {
      if (!eof) break;
      text += "\uFFFD";
      i += 1;
      ends.push(i);
      continue;
    }
    if (n < 0) {
      text += "\uFFFD";
      i += 1;
    } else {
      text += buf.toString("utf8", i, i + n);
      i += n;
    }
    ends.push(i);
  }
  return { text, bytes: i, ends };
}

function sourceBytesOfPrefix(decoded, prefixLen) {
  if (prefixLen <= 0) return 0;
  if (prefixLen >= decoded.text.length) return decoded.bytes;
  let points = 0;
  for (let i = 0; i < prefixLen; ) {
    const cu = decoded.text.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff) i += 2;
    else i += 1;
    points += 1;
  }
  return decoded.ends[points - 1] || 0;
}

function takeLinePrefix(text, n) {
  if (n <= 0) return { text: "", lines: 0 };
  let lines = 0;
  let i = 0;
  while (i < text.length && lines < n) {
    const nl = text.indexOf("\n", i);
    if (nl === -1) return { text, lines };
    lines += 1;
    i = nl + 1;
  }
  return { text: text.slice(0, i), lines };
}

function newlineCount(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

function hitLines(content) {
  if (!content) return [];
  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  return lines;
}

export function runBounded(cmd, args, opts) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    maxBuffer: opts.acquire,
    timeout: opts.timeoutMs,
    killSignal: "SIGKILL",
  });
  const output = (value) => {
    const buf = Buffer.from(typeof value === "string" ? value : "", "utf8");
    return buf.length > opts.acquire
      ? decodeUtf8Prefix(buf.subarray(0, opts.acquire), false).text
      : buf.toString("utf8");
  };
  const stdout = output(res.stdout);
  const stderr = output(res.stderr);
  if (res.error) {
    const msg = String(res.error.message || "");
    const timedOut = res.error.code === "ETIMEDOUT" || /ETIMEDOUT/.test(msg);
    const capped = res.error.code === "ENOBUFS" || /maxBuffer/i.test(msg);
    if (timedOut) return { stdout, stderr, reason: "acquisition_timeout", code: res.status, error: res.error };
    if (capped) return { stdout, stderr, reason: "acquisition_bytes", code: res.status, error: res.error };
    throw res.error;
  }
  return { stdout, stderr, reason: null, code: res.status, error: null };
}

function stalePayload(budget, base, field, emptyValue) {
  const obj = {
    ...base,
    [field]: emptyValue,
    truncated: false,
    reason: "stale_cursor",
    cursor: null,
  };
  const packed = pack(obj, budget);
  if (!packed.ok) throw new Error("delivery budget below the response envelope");
  return packed.obj;
}

function pageText(opts) {
  const existing = unpackCursor(opts.cursor);
  if (existing) {
    if (existing.kind !== opts.kind) throw new Error("invalid cursor");
    if (existing.rev !== opts.rev) return stalePayload(opts.budget, opts.base, opts.field, opts.emptyValue);
  }
  const pos = existing ? existing.pos : opts.baseOffset;
  const skipLines = existing ? existing.skip_lines || 0 : opts.skipLines || 0;
  const maxLines = existing && existing.lines_left != null ? existing.lines_left : opts.maxLines;
  if (pos < opts.baseOffset || pos > opts.baseOffset + opts.buf.length) throw new Error("invalid cursor");
  const local = opts.buf.subarray(pos - opts.baseOffset);
  const eof = opts.eof && pos + local.length >= opts.baseOffset + opts.buf.length;
  const decoded = decodeUtf8Prefix(local, eof);
  let body = decoded.text;
  let origin = 0;
  if (skipLines > 0) {
    const skipped = takeLinePrefix(body, skipLines);
    if (skipped.lines < skipLines) {
      const consumed = sourceBytesOfPrefix(decoded, skipped.text.length);
      const next = pos + consumed;
      const more = next < opts.end;
      if (!more || consumed === 0) {
        return fitTextPayload(
          () => ({
            ...opts.base,
            [opts.field]: opts.emptyValue,
            revision: opts.rev,
            truncated: false,
            reason: null,
            cursor: null,
          }),
          opts.budget,
          ""
        );
      }
      return fitTextPayload(
        () =>
          opts.decorate(
            {
              ...opts.base,
              [opts.field]: opts.emptyValue,
              revision: opts.rev,
              truncated: true,
              reason: "acquisition_bytes",
              cursor: packCursor({
                kind: opts.kind,
                rev: opts.rev,
                pos: next,
                skip_lines: skipLines - skipped.lines,
                lines_left: maxLines,
              }),
            },
            ""
          ),
        opts.budget,
        ""
      );
    }
    origin = skipped.text.length;
    body = body.slice(origin);
  }

  const limited = maxLines == null ? null : takeLinePrefix(body, maxLines);
  const candidate = limited ? limited.text : body;
  const lineRequestMet = limited != null && limited.lines >= maxLines;
  const windowEnd = pos + decoded.bytes;
  const moreBeyond = windowEnd < opts.end;

  function describe(slice) {
    if (slice.length === 0 && candidate.length > 0) {
      return { truncated: true, reason: "cursor_stuck", cursor: null };
    }
    const absPrefix = origin + slice.length;
    const next = pos + sourceBytesOfPrefix(decoded, absPrefix);
    const partial = slice.length < candidate.length;
    if (partial) {
      if (next <= pos) return { truncated: true, reason: "cursor_stuck", cursor: null };
      return {
        truncated: true,
        reason: "delivery_budget",
        cursor: packCursor({
          kind: opts.kind,
          rev: opts.rev,
          pos: next,
          skip_lines: 0,
          lines_left: maxLines == null ? undefined : Math.max(0, maxLines - newlineCount(slice)),
        }),
      };
    }
    if (!lineRequestMet && moreBeyond) {
      if (next <= pos && candidate.length > 0) return { truncated: true, reason: "cursor_stuck", cursor: null };
      return {
        truncated: true,
        reason: "acquisition_bytes",
        cursor: packCursor({
          kind: opts.kind,
          rev: opts.rev,
          pos: next,
          skip_lines: 0,
          lines_left: maxLines == null ? undefined : Math.max(0, maxLines - newlineCount(slice)),
        }),
      };
    }
    if (opts.acquireReason) return { truncated: true, reason: opts.acquireReason, cursor: null };
    return { truncated: false, reason: null, cursor: null };
  }

  return fitTextPayload((slice) => {
    const meta = describe(slice);
    return opts.decorate(
      {
        ...opts.base,
        [opts.field]: slice,
        revision: opts.rev,
        truncated: meta.truncated,
        reason: meta.reason,
        cursor: meta.cursor,
      },
      slice
    );
  }, opts.budget, candidate);
}

function readWindow(abs, pos, bytes, size) {
  const n = Math.min(bytes, Math.max(0, size - pos));
  if (n <= 0) return Buffer.alloc(0);
  const buf = Buffer.alloc(n);
  const fd = fs.openSync(abs, "r");
  try {
    const got = fs.readSync(fd, buf, 0, n, pos);
    return buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

function gitText(root, args, limits) {
  const res = runBounded("git", args, {
    cwd: root,
    acquire: limits.acquire,
    timeoutMs: limits.timeoutMs,
  });
  return res;
}

export function workspaceInfo(root, opts = {}) {
  const limits = limitsOf(opts);
  const budget = limits.delivery.status;
  let branch = null;
  let dirty = null;
  let reason = null;
  let truncated = false;
  let rev = "none";
  const head = gitText(root, ["rev-parse", "--abbrev-ref", "HEAD"], limits);
  const status = gitText(root, ["status", "--porcelain"], limits);
  if (head.reason === "acquisition_timeout" || status.reason === "acquisition_timeout") {
    reason = "acquisition_timeout";
    truncated = true;
  } else if (head.code === 0) {
    branch = head.stdout.trim();
    rev = hashRev(head.stdout + "\0" + status.stdout);
    dirty = status.stdout.trim().length > 0;
    if (status.reason === "acquisition_bytes") {
      reason = "acquisition_bytes";
      truncated = true;
      dirty = true;
    }
  }
  const packed = pack(
    {
      root,
      languages: ["TypeScript", "JavaScript", "Markdown"],
      project_type: "TagTeamGPT (Next.js explainer + Codex skill + desktop driver)",
      git_branch: branch,
      dirty,
      revision: rev,
      truncated,
      reason,
      cursor: null,
    },
    budget
  );
  if (!packed.ok) throw new Error("delivery budget below the response envelope");
  return packed.obj;
}

function readEntries(abs, acquire) {
  const dir = fs.opendirSync(abs);
  const entries = [];
  let used = 0;
  let capped = false;
  try {
    while (used < acquire) {
      const ent = dir.readSync();
      if (!ent) break;
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const row = {
        name: ent.name,
        type: ent.isDirectory() ? "dir" : ent.isFile() ? "file" : "other",
      };
      const cost = Buffer.byteLength(ent.name);
      if (entries.length > 0 && used + cost > acquire) {
        capped = true;
        break;
      }
      entries.push(row);
      used += cost;
    }
    const extra = dir.readSync();
    if (extra && extra.name !== "node_modules" && extra.name !== ".git") capped = true;
  } finally {
    dir.closeSync();
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, capped };
}

export function listDirectory(root, rel = ".", page = 0, pageSize = 50, opts = {}) {
  const limits = limitsOf(opts);
  const budget = limits.delivery.list;
  const abs = assertSafeRel(root, rel);
  const { entries, capped } = readEntries(abs, limits.acquire);
  const rev = hashRev(entries.map((e) => `${e.type}:${e.name}`).join("\n") + (capped ? "\ncapped" : ""));
  const existing = unpackCursor(opts.cursor);
  if (existing) {
    if (existing.kind !== "list") throw new Error("invalid cursor");
    if (existing.rev !== rev) {
      return stalePayload(budget, { path: rel, total: entries.length, page, page_size: pageSize, revision: rev }, "entries", []);
    }
  }
  const start = existing ? existing.pos : Math.max(0, page) * pageSize;
  const end = existing ? existing.end ?? entries.length : Math.min(entries.length, start + pageSize);
  if (!Number.isSafeInteger(end) || end < start || end > entries.length) throw new Error("invalid cursor");
  const slice = entries.slice(start, Math.max(start, end));
  if (start > entries.length) throw new Error("invalid cursor");

  function make(items) {
    const partial = items.length < slice.length;
    let reason = null;
    let truncated = false;
    let cursor = null;
    if (items.length === 0 && slice.length > 0) {
      return {
        path: rel,
        total: entries.length,
        page,
        page_size: pageSize,
        entries: [],
        revision: rev,
        truncated: true,
        reason: "cursor_stuck",
        cursor: null,
      };
    }
    if (partial) {
      const next = start + items.length;
      if (next <= start) {
        reason = "cursor_stuck";
        truncated = true;
      } else {
        reason = "delivery_budget";
        truncated = true;
        cursor = packCursor({ kind: "list", rev, pos: next, end });
      }
    } else if (end < entries.length) {
      reason = null;
      truncated = false;
    } else if (capped && start + items.length >= entries.length) {
      reason = "acquisition_bytes";
      truncated = true;
    }
    return {
      path: rel,
      total: entries.length,
      page,
      page_size: pageSize,
      entries: items,
      revision: rev,
      truncated,
      reason,
      cursor,
    };
  }

  return fitItemsPayload(make, budget, slice);
}

function fitItemsPayload(make, budget, items) {
  const packed = (slice) => pack(make(slice), budget);
  const full = packed(items);
  if (full.ok) return full.obj;
  const oneFails = items.length > 0 && !packed(items.slice(0, 1)).ok;
  if (oneFails || items.length === 0) {
    const stuck = packed([]);
    if (!stuck.ok) throw new Error("delivery budget below the response envelope");
    return stuck.obj;
  }
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (packed(items.slice(0, mid)).ok) lo = mid;
    else hi = mid - 1;
  }
  while (lo > 0 && !packed(items.slice(0, lo)).ok) lo -= 1;
  return packed(items.slice(0, lo)).obj;
}

export function readFilePaged(root, rel, offset = 0, limit = 200, opts = {}) {
  const limits = limitsOf(opts);
  const budget = limits.delivery.read;
  const abs = assertSafeRel(root, rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new Error("not a file");
  }
  if (!stat.isFile()) throw new Error("not a file");
  const rev = fileRevision(stat);
  const existing = unpackCursor(opts.cursor);
  if (existing && existing.kind !== "file") throw new Error("invalid cursor");
  if (existing && existing.rev !== rev) {
    return stalePayload(budget, { path: rel, revision: rev, offset, limit }, "content", "");
  }
  const pos = existing ? existing.pos : 0;
  if (pos > stat.size) throw new Error("invalid cursor");
  const buf = readWindow(abs, pos, limits.acquire, stat.size);
  const whole = pos === 0 && buf.length >= stat.size;
  const totalLines = whole ? decodeUtf8Prefix(buf, true).text.split(/\r?\n/).length : null;
  return pageText({
    kind: "file",
    field: "content",
    emptyValue: "",
    buf,
    baseOffset: pos,
    end: stat.size,
    eof: pos + buf.length >= stat.size,
    rev,
    budget,
    cursor: opts.cursor,
    base: {
      path: rel,
      total_bytes: stat.size,
      total_lines: totalLines,
      offset,
      limit,
    },
    acquireReason: null,
    skipLines: existing ? 0 : Math.max(0, offset),
    maxLines: limit,
    decorate: (obj) => obj,
  });
}

function naiveSearch(root, query, acquire) {
  const hits = [];
  let used = 0;
  let capped = false;
  const walk = (dir) => {
    if (capped) return;
    let names;
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of names) {
      if (capped) return;
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (!ent.isFile()) continue;
      let rel;
      try {
        rel = path.relative(root, p);
        assertSafeRel(root, rel);
      } catch {
        continue;
      }
      const stat = fs.statSync(p);
      const buf = readWindow(p, 0, Math.max(0, acquire - used), stat.size);
      used += buf.length;
      if (buf.length < stat.size) capped = true;
      const text = decodeUtf8Prefix(buf, buf.length >= stat.size).text;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(query)) continue;
        hits.push(`${rel}:${i + 1}:${lines[i]}`);
        if (hits.length >= 200) {
          capped = true;
          return;
        }
      }
    }
  };
  walk(root);
  hits.sort();
  return { text: hits.join("\n"), capped };
}

export function searchWorkspace(root, query, page = 0, pageSize = 30, opts = {}) {
  if (!query || query.length < 2) throw new Error("query too short");
  const limits = limitsOf(opts);
  const budget = limits.delivery.search;
  const args = [
    "-n",
    "--hidden",
    "--sort",
    "path",
    "--glob",
    "!node_modules",
    "--glob",
    "!.git",
    "-m",
    "200",
    query,
    ".",
  ];
  let text = "";
  let acquireReason = null;
  try {
    const res = runBounded("rg", args, {
      cwd: root,
      acquire: limits.acquire,
      timeoutMs: limits.timeoutMs,
    });
    if (res.error && res.error.code === "ENOENT") throw res.error;
    if (res.reason === "acquisition_timeout") {
      text = res.stdout || "";
      acquireReason = "acquisition_timeout";
    } else if (res.code === 1) {
      text = "";
    } else if (res.code !== 0 && !res.reason) {
      throw new Error(res.stderr || "search failed");
    } else {
      text = res.stdout || "";
      acquireReason = res.reason;
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const naive = naiveSearch(root, query, limits.acquire);
    text = naive.text;
    if (naive.capped) acquireReason = "acquisition_bytes";
  }
  const buf = Buffer.from(text, "utf8");
  const rev = hashRev(text + (acquireReason || ""));
  const total = text ? text.split("\n").filter((line, idx, arr) => line.length > 0 || idx < arr.length - 1).length : 0;
  return pageText({
    kind: "search",
    field: "content",
    emptyValue: "",
    buf,
    baseOffset: 0,
    end: acquireReason ? buf.length : buf.length,
    eof: true,
    rev,
    budget,
    cursor: opts.cursor,
    base: { query, total, page, page_size: pageSize },
    acquireReason,
    skipLines: opts.cursor ? 0 : Math.max(0, page) * pageSize,
    maxLines: pageSize,
    decorate: (obj, slice) => ({ ...obj, hits: hitLines(slice || obj.content || "") }),
  });
}

export function gitStatus(root, opts = {}) {
  const limits = limitsOf(opts);
  const budget = limits.delivery.status;
  const head = gitText(root, ["rev-parse", "--abbrev-ref", "HEAD"], limits);
  if (head.reason === "acquisition_timeout") {
    return staleOrTimeout(budget, {
      branch: null,
      staged: [],
      unstaged: [],
      untracked: [],
      revision: "timeout",
      truncated: true,
      reason: "acquisition_timeout",
      cursor: null,
    });
  }
  if (head.code !== 0) throw new Error(head.stderr || "git status failed");
  const porcelain = gitText(root, ["status", "--porcelain", "-z"], limits);
  if (porcelain.reason === "acquisition_timeout") {
    return staleOrTimeout(budget, {
      branch: head.stdout.trim(),
      staged: [],
      unstaged: [],
      untracked: [],
      revision: "timeout",
      truncated: true,
      reason: "acquisition_timeout",
      cursor: null,
    });
  }
  if (porcelain.code !== 0 && !porcelain.reason) throw new Error(porcelain.stderr || "git status failed");
  const raw = porcelain.stdout || "";
  const parts = raw.split("\0");
  if (!raw.endsWith("\0")) parts.pop();
  const items = [];
  for (const line of parts) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);
    if (x === "?" && y === "?") items.push({ bucket: "untracked", file });
    else {
      if (x !== " " && x !== "?") items.push({ bucket: "staged", file });
      if (y !== " " && y !== "?") items.push({ bucket: "unstaged", file });
    }
  }
  const rev = hashRev(head.stdout + "\0" + raw + (porcelain.reason || ""));
  const existing = unpackCursor(opts.cursor);
  if (existing) {
    if (existing.kind !== "status") throw new Error("invalid cursor");
    if (existing.rev !== rev) {
      return stalePayload(
        budget,
        { branch: head.stdout.trim(), unstaged: [], untracked: [], revision: rev },
        "staged",
        []
      );
    }
  }
  const start = existing ? existing.pos : 0;
  if (start > items.length) throw new Error("invalid cursor");
  const slice = items.slice(start);
  const acquireReason = porcelain.reason;

  function grouped(rows) {
    return {
      staged: rows.filter((r) => r.bucket === "staged").map((r) => r.file),
      unstaged: rows.filter((r) => r.bucket === "unstaged").map((r) => r.file),
      untracked: rows.filter((r) => r.bucket === "untracked").map((r) => r.file),
    };
  }

  function make(rows) {
    const partial = rows.length < slice.length;
    let reason = null;
    let truncated = false;
    let cursor = null;
    if (rows.length === 0 && slice.length > 0) {
      reason = "cursor_stuck";
      truncated = true;
    } else if (partial) {
      const next = start + rows.length;
      if (next <= start) {
        reason = "cursor_stuck";
        truncated = true;
      } else {
        reason = "delivery_budget";
        truncated = true;
        cursor = packCursor({ kind: "status", rev, pos: next });
      }
    } else if (acquireReason) {
      reason = acquireReason;
      truncated = true;
    }
    return {
      branch: head.stdout.trim(),
      ...grouped(rows),
      total: items.length,
      revision: rev,
      truncated,
      reason,
      cursor,
    };
  }

  return fitItemsPayload(make, budget, slice);
}

function staleOrTimeout(budget, obj) {
  const packed = pack(obj, budget);
  if (!packed.ok) throw new Error("delivery budget below the response envelope");
  return packed.obj;
}

function boundedUntracked(root, rel, remain, limits) {
  const args = ["ls-files", "--others", "--exclude-standard", "-z"];
  if (rel) args.push("--", rel);
  const listed = runBounded("git", args, {
    cwd: root,
    acquire: Math.min(remain, limits.acquire),
    timeoutMs: limits.timeoutMs,
  });
  if (listed.reason === "acquisition_timeout") return { text: "", capped: true, timeout: true };
  if (listed.code !== 0 && !listed.reason) throw new Error(listed.stderr || "untracked listing failed");
  let files = (listed.stdout || "").split("\0").filter(Boolean);
  let capped = listed.reason === "acquisition_bytes";
  if (listed.reason === "acquisition_bytes" || !(listed.stdout || "").endsWith("\0")) {
    if (!(listed.stdout || "").endsWith("\0")) files = files.slice(0, -1);
  }
  if (rel) {
    const norm = rel.replace(/^\.\//, "").replace(/\/$/, "");
    files = files.filter((f) => f === norm || f.startsWith(norm.endsWith("/") ? norm : norm + "/"));
  } else {
    if (files.length > 40) capped = true;
    files = files.slice(0, 40);
  }
  let left = remain;
  let text = "";
  for (const file of files) {
    if (left <= 0) {
      capped = true;
      break;
    }
    let abs;
    try {
      abs = assertSafeRel(root, file);
    } catch {
      continue;
    }
    const stat = fs.statSync(abs);
    const buf = readWindow(abs, 0, left, stat.size);
    if (buf.length < stat.size) capped = true;
    const body = decodeUtf8Prefix(buf, buf.length >= stat.size).text;
    const plus = body.split(/\r?\n/).map((l) => `+${l}`).join("\n");
    const block = [
      `diff --git a/${file} b/${file}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${file}`,
      `@@ -0,0 +1,${body.length ? body.split(/\r?\n/).length : 0} @@`,
      plus,
    ].join("\n");
    const addition = Buffer.from((text ? "\n" : "") + block + "\n", "utf8");
    if (addition.length > left) {
      text += decodeUtf8Prefix(addition.subarray(0, left), false).text;
      capped = true;
      break;
    }
    text += addition.toString("utf8");
    left -= addition.length;
    if (buf.length < stat.size) break;
  }
  return { text, capped };
}

// ponytail: git diff pages the acquired prefix. Pass a path when the diff exceeds the acquire cap.
export function gitDiff(root, opts = {}) {
  const limits = limitsOf(opts);
  const budget = limits.delivery.diff;
  const rel = opts.path;
  const args = ["diff", "--no-color"];
  if (opts.staged) args.push("--cached");
  if (rel) {
    assertSafeRel(root, rel);
    args.push("--", rel);
  }
  const diff = gitText(root, args, limits);
  if (diff.reason === "acquisition_timeout") {
    const rev = hashRev(diff.stdout || "");
    return pageText({
      kind: "diff",
      field: "diff",
      emptyValue: "",
      buf: Buffer.from(diff.stdout || "", "utf8"),
      baseOffset: 0,
      end: Buffer.byteLength(diff.stdout || "", "utf8"),
      eof: true,
      rev,
      budget,
      cursor: opts.cursor,
      base: { staged: !!opts.staged, path: rel || null, includes_untracked: false },
      acquireReason: "acquisition_timeout",
      skipLines: opts.cursor ? 0 : Math.max(0, opts.offset || 0),
      maxLines: opts.limit == null ? 200 : opts.limit,
      decorate: (obj) => obj,
    });
  }
  if (diff.code !== 0 && !diff.reason) throw new Error(diff.stderr || "git diff failed");
  let text = diff.stdout || "";
  let acquireReason = diff.reason;
  if (!opts.staged && !acquireReason) {
    const used = Buffer.byteLength(text, "utf8");
    const remain = limits.acquire - used;
    if (remain > 0) {
      const extra = boundedUntracked(root, rel, remain, limits);
      if (extra.timeout) acquireReason = "acquisition_timeout";
      else if (extra.text) {
        if (text && !text.endsWith("\n")) text += "\n";
        text += extra.text;
      }
      if (extra.capped) acquireReason = "acquisition_bytes";
    } else acquireReason = "acquisition_bytes";
  }
  const buf = Buffer.from(text, "utf8");
  const rev = hashRev(text + (acquireReason || ""));
  return pageText({
    kind: "diff",
    field: "diff",
    emptyValue: "",
    buf,
    baseOffset: 0,
    end: buf.length,
    eof: true,
    rev,
    budget,
    cursor: opts.cursor,
    base: {
      staged: !!opts.staged,
      path: rel || null,
      includes_untracked: !opts.staged,
      total_bytes: buf.length,
    },
    acquireReason,
    skipLines: opts.cursor ? 0 : Math.max(0, opts.offset || 0),
    maxLines: opts.limit == null ? 200 : opts.limit,
    decorate: (obj) => obj,
  });
}

export function writeC2cReply(root, message) {
  const parsed = parseC2C(message);
  if (!parsed.ok) throw new Error(parsed.detail || "No C2C STATE found");
  const dir = path.join(root, ".tagteam");
  fs.mkdirSync(dir, { recursive: true });
  const reply = {
    ok: true,
    state: parsed.state,
    task_id: parsed.task_id,
    snippet: parsed.snippet,
  };
  fs.writeFileSync(path.join(dir, "last-reply.json"), JSON.stringify(reply, null, 2) + "\n");
  if (parsed.state === "PLAN") {
    fs.writeFileSync(path.join(dir, "last-plan.md"), `${String(message).trim()}\n`);
  }
  return reply;
}

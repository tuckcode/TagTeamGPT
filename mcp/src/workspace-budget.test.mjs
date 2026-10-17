#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  gitDiff,
  errorResult,
  gitStatus,
  listDirectory,
  mcpByteLength,
  readFilePaged,
  resolveLimits,
  runBounded,
  searchWorkspace,
} from "./workspace.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-budget-"));
const limits = {
  delivery: { read: 900, diff: 900, search: 800, list: 700, status: 700 },
  acquire: 64 * 1024,
  timeoutMs: 5000,
};

function assertBudget(page, budget) {
  const size = mcpByteLength(page);
  assert.equal(page.returned_bytes, size);
  assert.ok(size <= budget, `response ${size} exceeds ${budget}`);
}

function follow(load, field, budget) {
  let cursor;
  let text = "";
  const seen = [];
  for (let i = 0; i < 80; i++) {
    const page = load(cursor);
    assertBudget(page, budget);
    assert.notEqual(page.reason, "cursor_stuck");
    text += page[field] || "";
    if (!page.cursor) return { text, page, pages: i + 1 };
    assert.ok(!seen.includes(page.cursor), "cursor repeated");
    seen.push(page.cursor);
    cursor = page.cursor;
  }
  throw new Error("cursor did not finish");
}

const defaults = resolveLimits({});
assert.equal(defaults.delivery.read, 16 * 1024);
assert.equal(defaults.delivery.diff, 16 * 1024);
assert.equal(defaults.delivery.search, 8 * 1024);
assert.equal(resolveLimits({ TAGTEAM_BUDGET_READ: "2048" }).delivery.read, 2048);
assert.throws(() => resolveLimits({ TAGTEAM_BUDGET_READ: "999999" }));
assert.throws(() => resolveLimits({ TAGTEAM_BUDGET_READ: "10" }));
assert.throws(() => resolveLimits({ TAGTEAM_BUDGET_READ: "nope" }));

const largeError = errorResult(new Error('😀 " \\ '.repeat(1000)), 512);
assert.equal(largeError.isError, true);
assert.ok(Buffer.byteLength(JSON.stringify(largeError), "utf8") <= 512);
assert.ok(largeError.content[0].text.endsWith("[Error details exceed the response limit.]"));

const body = `😀 quotes " backslash \\ end\n${"A\"\\".repeat(2500)}`;
fs.writeFileSync(path.join(root, "wide.txt"), body);
const wide = follow(
  (cursor) => readFilePaged(root, "wide.txt", 0, 50, { cursor, limits }),
  "content",
  limits.delivery.read
);
assert.equal(wide.text, body);
assert.ok(wide.pages > 1);

const big = "B".repeat(20000);
fs.writeFileSync(path.join(root, "big.txt"), big);
const windowed = follow(
  (cursor) =>
    readFilePaged(root, "big.txt", 0, 5000, {
      cursor,
      limits: { ...limits, acquire: 1500 },
    }),
  "content",
  limits.delivery.read
);
assert.equal(windowed.text, big);
const firstBig = readFilePaged(root, "big.txt", 0, 5000, {
  limits: { ...limits, acquire: 1500 },
});
assert.ok(Buffer.byteLength(firstBig.content, "utf8") <= 1500);

const first = readFilePaged(root, "wide.txt", 0, 50, { limits });
assert.equal(first.truncated, true);
assert.ok(first.cursor);
fs.appendFileSync(path.join(root, "wide.txt"), "MORE");
const stale = readFilePaged(root, "wide.txt", 0, 50, { cursor: first.cursor, limits });
assert.equal(stale.reason, "stale_cursor");
assert.equal(stale.content, "");
assert.equal(stale.cursor, null);
fs.writeFileSync(path.join(root, "wide.txt"), "short");
const shortened = readFilePaged(root, "wide.txt", 0, 50, { cursor: first.cursor, limits });
assert.equal(shortened.reason, "stale_cursor");
assertBudget(shortened, limits.delivery.read);
fs.writeFileSync(path.join(root, "wide.txt"), body);
assert.throws(() => readFilePaged(root, "wide.txt", 0, 50, { cursor: "%%%", limits }));
assert.throws(() => readFilePaged(root, "wide.txt", 0, 50, { cursor: undefined, limits: { ...limits, delivery: { ...limits.delivery, read: 40 } } }));

function git(args) {
  execFileSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args],
    { cwd: root }
  );
}
git(["init", "-b", "main"]);
fs.writeFileSync(path.join(root, "tracked.txt"), "one\n");
git(["add", "tracked.txt"]);
git(["commit", "-m", "init"]);
fs.writeFileSync(path.join(root, "tracked.txt"), `one\n${'"'.repeat(4000)}\n`);
const expectedDiff = execFileSync("git", ["diff", "--no-color", "--", "tracked.txt"], {
  cwd: root,
  encoding: "utf8",
});
const diffPages = follow(
  (cursor) => gitDiff(root, { path: "tracked.txt", limit: 1000, cursor, limits }),
  "diff",
  limits.delivery.diff
);
assert.equal(diffPages.text, expectedDiff);
assert.ok(diffPages.pages > 1);

for (let i = 0; i < 12; i++) {
  const line = i === 3 ? `NEEDLE ${'"\\'.repeat(600)}` : `file ${i} NEEDLE`;
  fs.writeFileSync(path.join(root, `hit-${i}.txt`), `${line}\n`);
}
const fullSearch = searchWorkspace(root, "NEEDLE", 0, 500, {
  limits: { ...limits, delivery: { ...limits.delivery, search: 32 * 1024 } },
});
assert.equal(fullSearch.truncated, false);
const searchPages = follow(
  (cursor) => searchWorkspace(root, "NEEDLE", 0, 500, { cursor, limits }),
  "content",
  limits.delivery.search
);
assert.equal(searchPages.text, fullSearch.content);
assert.ok(searchPages.pages > 1);
assert.ok(searchPages.text.includes('"'));

for (let i = 0; i < 20; i++) {
  fs.writeFileSync(path.join(root, `name-${String(i).padStart(3, "0")}-${"n".repeat(40)}.txt`), "x\n");
}
const names = [];
let listCursor;
for (let i = 0; i < 40; i++) {
  const page = listDirectory(root, ".", 0, 100, { cursor: listCursor, limits });
  assertBudget(page, limits.delivery.list);
  names.push(...page.entries.map((e) => e.name));
  if (!page.cursor) break;
  listCursor = page.cursor;
}
const expectedNames = fs
  .readdirSync(root)
  .filter((name) => name !== ".git")
  .sort((a, b) => a.localeCompare(b));
assert.deepEqual(names, expectedNames);

const requestedNames = [];
let requestedCursor;
do {
  const page = listDirectory(root, ".", 0, 5, { cursor: requestedCursor, limits });
  assertBudget(page, limits.delivery.list);
  requestedNames.push(...page.entries.map((e) => e.name));
  requestedCursor = page.cursor;
  assert.ok(requestedNames.length <= 5);
} while (requestedCursor);
assert.deepEqual(requestedNames, expectedNames.slice(0, 5));

const untrackedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-untracked-"));
try {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: untrackedRoot });
  for (let i = 0; i < 45; i++) {
    fs.writeFileSync(path.join(untrackedRoot, `${String(i).padStart(3, "0")}.txt`), "x".repeat(300));
  }
  const wideLimits = { ...limits, delivery: { ...limits.delivery, diff: 64 * 1024 } };
  const cappedFiles = gitDiff(untrackedRoot, { limit: 1000, limits: wideLimits });
  assert.equal(cappedFiles.truncated, true);
  assert.equal(cappedFiles.reason, "acquisition_bytes");
  assert.equal((cappedFiles.diff.match(/diff --git/g) || []).length, 40);
  const cappedBytes = gitDiff(untrackedRoot, {
    path: "044.txt", limit: 1000, limits: { ...wideLimits, acquire: 200 },
  });
  assert.ok(cappedBytes.total_bytes <= 200);
  assert.equal(cappedBytes.reason, "acquisition_bytes");
  assertBudget(cappedBytes, wideLimits.delivery.diff);
  const targeted = gitDiff(untrackedRoot, {
    path: "044.txt", limit: 1000, limits: { ...wideLimits, acquire: 1024 },
  });
  assert.equal(targeted.truncated, false);
  assert.ok(targeted.diff.includes("044.txt"));
} finally {
  fs.rmSync(untrackedRoot, { recursive: true, force: true });
}

const statusPages = [];
let statusCursor;
const seenStatus = new Set();
for (let i = 0; i < 40; i++) {
  const page = gitStatus(root, { cursor: statusCursor, limits });
  assertBudget(page, limits.delivery.status);
  statusPages.push(...page.untracked);
  if (!page.cursor) break;
  assert.ok(!seenStatus.has(page.cursor));
  seenStatus.add(page.cursor);
  statusCursor = page.cursor;
}
assert.ok(statusPages.length >= 12);

const pidFile = path.join(root, "sleep.pid");
const started = Date.now();
const timed = runBounded(
  process.execPath,
  ["-e", `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 20000);`],
  { acquire: 4096, timeoutMs: 400 }
);
assert.equal(timed.reason, "acquisition_timeout");
assert.ok(Date.now() - started < 3000);
const pid = Number(fs.readFileSync(pidFile, "utf8"));
assert.throws(() => process.kill(pid, 0));

const flooded = runBounded(process.execPath, ["-e", "process.stdout.write('x'.repeat(200000))"], {
  acquire: 2048,
  timeoutMs: 5000,
});
assert.equal(flooded.reason, "acquisition_bytes");
assert.notEqual(flooded.reason, "acquisition_timeout");
assert.ok(Buffer.byteLength(flooded.stdout, "utf8") <= 2048);

console.log("ok: workspace-budget.test.mjs");

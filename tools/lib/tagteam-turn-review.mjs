import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PATCH = 8 * 1024 * 1024;
export const MAX_RECEIPT = 64 * 1024;

function git(root, args, input, env = {}) {
  const result = spawnSync("git", args, {
    cwd: root, input, env: { ...process.env, ...env },
    maxBuffer: MAX_PATCH, timeout: 30_000, killSignal: "SIGKILL",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.toString() || "Git review capture failed.");
  return result.stdout;
}

export function turnDirectory(root, taskId, iteration, create = false) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(taskId) || !Number.isSafeInteger(iteration) || iteration < 1) {
    throw new Error("Invalid review task or iteration.");
  }
  let dir = path.resolve(root);
  for (const name of [".tagteam", "reviews", `${taskId}-${iteration}`]) {
    dir = path.join(dir, name);
    if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid review directory.");
  }
  return dir;
}

function commit(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function tree(root, dir, allowPath) {
  if (typeof allowPath !== "function") throw new Error("Review capture requires a path policy.");
  const names = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter(Boolean);
  const index = path.join(dir, `index-${crypto.randomBytes(8).toString("hex")}`);
  const env = { GIT_INDEX_FILE: index };
  let bytes = 0;
  const entries = [];
  try {
    git(root, ["read-tree", "--empty"], undefined, env);
    for (const rel of new Set(names)) {
      if (rel.split(/[\\/]/).includes(".tagteam")) continue;
      let abs;
      try { abs = allowPath(root, rel); } catch { continue; }
      let stat;
      try { stat = fs.lstatSync(abs); } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      if (stat.size > 4 * 1024 * 1024) throw new Error(`Review source exceeds 4 MiB: ${rel}`);
      if (!stat.isSymbolicLink()) {
        allowPath(fs.realpathSync(root), path.relative(fs.realpathSync(root), fs.realpathSync(abs)));
      }
      const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(abs)) : fs.readFileSync(abs);
      bytes += content.length;
      if (bytes > MAX_BYTES || entries.length >= 10000) throw new Error("Review snapshot exceeds its capture limit.");
      const hash = git(root, ["hash-object", "-w", "--stdin"], content).toString().trim();
      const mode = stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644";
      entries.push(`${mode} ${hash}\t${rel}\0`);
    }
    if (entries.length) git(root, ["update-index", "-z", "--index-info"], Buffer.from(entries.join("")), env);
    return git(root, ["write-tree"], undefined, env).toString().trim();
  } finally {
    fs.rmSync(index, { force: true });
    fs.rmSync(index + ".lock", { force: true });
  }
}

function ref(taskId, iteration, phase) {
  return `refs/tagteam/reviews/${taskId}/${iteration}/${phase}`;
}

export function beginTurn(root, taskId, iteration, allowPath) {
  root = path.resolve(root);
  const dir = turnDirectory(root, taskId, iteration, true);
  if (fs.existsSync(path.join(dir, "before.json"))) throw new Error("This turn already has a baseline.");
  const baseline = { root, task_id: taskId, iteration, commit: commit(root), tree: tree(root, dir, allowPath), started_at: new Date().toISOString() };
  git(root, ["update-ref", ref(taskId, iteration, "before"), baseline.tree]);
  fs.writeFileSync(path.join(dir, "before.json"), JSON.stringify(baseline), { flag: "wx", mode: 0o600 });
  return baseline;
}

export function loadTurn(root, taskId, iteration, maxBytes = MAX_RECEIPT) {
  const dir = turnDirectory(root, taskId, iteration);
  const file = path.join(dir, "receipt.json");
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > maxBytes) throw new Error("Invalid or oversized turn receipt.");
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (record.root !== path.resolve(root) || record.task_id !== taskId || record.iteration !== iteration || record.version !== 1) {
    throw new Error("Turn receipt does not match the requested workspace or turn.");
  }
  return { dir, record };
}

export function finishTurn(root, taskId, iteration, payload, allowPath) {
  root = path.resolve(root);
  if (payload?.task_id !== taskId || payload?.iteration !== iteration) throw new Error("Execution receipt does not match this turn.");
  const dir = turnDirectory(root, taskId, iteration);
  if (fs.existsSync(path.join(dir, "receipt.json"))) throw new Error("This turn already has a review receipt.");
  const beforeFile = path.join(dir, "before.json");
  if (fs.lstatSync(beforeFile).isSymbolicLink() || fs.statSync(beforeFile).size > MAX_RECEIPT) throw new Error("Invalid turn baseline.");
  const before = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
  if (before.root !== root || before.task_id !== taskId || before.iteration !== iteration) throw new Error("Turn baseline does not match.");
  const after = tree(root, dir, allowPath);
  git(root, ["update-ref", ref(taskId, iteration, "after"), after]);
  const fields = git(root, ["diff", "--raw", "--no-ext-diff", "--no-textconv", "--no-abbrev", "--no-renames", "-z", before.tree, after]).toString().split("\0");
  const files = [];
  let patchBytes = 0;
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [beforeMode, afterMode, beforeHash, afterHash, status] = fields[i].slice(1).split(" ");
    const rel = fields[i + 1];
    allowPath(root, rel);
    if (files.length >= 128) throw new Error("This turn changes more than 128 reviewable files.");
    const patch = git(root, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", before.tree, after, "--", rel]);
    patchBytes += patch.length;
    if (patchBytes > MAX_PATCH) throw new Error("This turn exceeds the 8 MiB patch limit.");
    const patchName = crypto.createHash("sha256").update(rel).digest("hex") + ".patch";
    const patchFile = path.join(dir, patchName);
    fs.writeFileSync(patchFile, patch, { flag: "wx", mode: 0o600 });
    const stat = fs.statSync(patchFile);
    files.push({ path: rel, status, before_mode: beforeMode, after_mode: afterMode, before_hash: beforeHash, after_hash: afterHash,
      binary: /^Binary files .* differ$/m.test(patch.toString()), patch: patchName,
      patch_revision: `${stat.size}:${stat.mtimeMs}:${stat.ino}` });
  }
  const record = { version: 1, root, task_id: taskId, iteration, started_at: before.started_at, finished_at: new Date().toISOString(),
    before_commit: before.commit, after_commit: commit(root), before_tree: before.tree, after_tree: after,
    scope: "Tracked and untracked files allowed by the connector path policy. Ignored files, sensitive files, submodules, and .tagteam state are excluded. Concurrent edits during the turn are included.",
    result: String(payload.result || "Execution finished.").slice(0, 2000), tests: String(payload.tests || "not run").slice(0, 2000), files };
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > MAX_RECEIPT) throw new Error("Turn receipt exceeds 64 KiB.");
  fs.writeFileSync(path.join(dir, "receipt.json"), json, { flag: "wx", mode: 0o600 });
  return { ...payload, changed_files: files.length, review: { task_id: taskId, iteration, changed_files: files.length, binary_files: files.filter(f => f.binary).length } };
}

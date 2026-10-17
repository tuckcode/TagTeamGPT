import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { onPlan } from "./tagteam-loop.mjs";
import { beginTurn, finishTurn, loadTurn, turnDirectory } from "./lib/tagteam-turn-review.mjs";
import { assertSafeRel, turnReview, resolveLimits, mcpByteLength } from "../mcp/src/workspace.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-turn-"));
function write(rel, content) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), content); }
function git(args) { return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" }).trim(); }
function read(task, iteration, rel) {
  const limits = resolveLimits({ TAGTEAM_BUDGET_STATUS: "1024", TAGTEAM_BUDGET_DIFF: "1024", TAGTEAM_ACQUIRE_BYTES: "8192" });
  let cursor, text = "", pages = 0;
  do {
    const page = turnReview(root, task, iteration, { path: rel, cursor, limits });
    assert.ok(page.returned_bytes <= 1024);
    assert.equal(page.returned_bytes, mcpByteLength(page));
    text += page.content;
    cursor = page.cursor;
    assert.ok(++pages < 100);
  } while (cursor);
  return text;
}
try {
  git(["init", "-q", "-b", "main"]);
  write("file.txt", "committed\n");
  write("gone.txt", "delete during turn\n");
  git(["add", "."]); git(["commit", "-qm", "initial"]);
  write("file.txt", "committed\nearlier user edit\n");
  write("existing-new.txt", "earlier untracked file\n");
  write(".env", "PRIVATE_SHOULD_NOT_APPEAR\n");
  const indexBefore = fs.readFileSync(path.join(root, ".git/index"));
  const before = beginTurn(root, "c2c_test", 1, assertSafeRel);
  write("file.txt", "committed\nearlier user edit\nturn edit\n" + "long turn line\n".repeat(100));
  write("added.txt", "new in this turn\n");
  fs.unlinkSync(path.join(root, "gone.txt"));
  const payload = finishTurn(root, "c2c_test", 1, { task_id: "c2c_test", iteration: 1, result: "done", tests: "not run" }, assertSafeRel);
  assert.equal(payload.changed_files, 3);
  assert.deepEqual(fs.readFileSync(path.join(root, ".git/index")), indexBefore);
  const receipt = JSON.parse(read("c2c_test", 1));
  assert.equal(receipt.before_tree, before.tree);
  assert.equal(receipt.tests, "not run");
  assert.deepEqual(receipt.files.map(f => f.path).sort(), ["added.txt", "file.txt", "gone.txt"]);
  assert.deepEqual(receipt.files.map(f => f.status).sort(), ["A", "D", "M"]);
  const patch = read("c2c_test", 1, "file.txt");
  assert.ok(patch.includes("+turn edit"));
  assert.ok(!patch.includes("+earlier user edit"));
  assert.ok(patch.includes(" earlier user edit"));
  assert.throws(() => turnReview(root, "c2c_test", 1, { path: "existing-new.txt" }));
  assert.throws(() => turnReview(root, "c2c_test", 1, { path: ".env" }));
  write("file.txt", "later independent changes\n");
  assert.equal(read("c2c_test", 1, "file.txt"), patch);
  assert.throws(() => beginTurn(root, "c2c_test", 1, assertSafeRel));
  assert.throws(() => finishTurn(root, "c2c_test", 1, { task_id: "c2c_test", iteration: 1 }, assertSafeRel));
  beginTurn(root, "c2c_test", 2, assertSafeRel);
  assert.throws(() => finishTurn(root, "c2c_test", 2, { task_id: "wrong", iteration: 2 }, assertSafeRel));
  finishTurn(root, "c2c_test", 2, { task_id: "c2c_test", iteration: 2 }, assertSafeRel);
  assert.equal(JSON.parse(read("c2c_test", 2)).files.length, 0);
  beginTurn(root, "c2c_test", 3, assertSafeRel);
  write("image.bin", Buffer.from([0, 1, 2, 3]));
  finishTurn(root, "c2c_test", 3, { task_id: "c2c_test", iteration: 3 }, assertSafeRel);
  const binary = JSON.parse(read("c2c_test", 3));
  assert.equal(binary.files[0].binary, true);
  assert.ok(read("c2c_test", 3, "image.bin").includes("Binary files"));
  const cli = fileURLToPath(new URL("./tagteam-turn.mjs", import.meta.url));
  const args = ["--path", root, "--task-id", "c2c_cli", "--iteration", "1"];
  const started = JSON.parse(execFileSync(process.execPath, [cli, "begin", ...args], { encoding: "utf8" }));
  assert.equal(started.ok, true);
  const finished = JSON.parse(execFileSync(process.execPath, [cli, "finish", ...args], { encoding: "utf8" }));
  assert.equal(finished.ok, true);
  assert.equal(finished.changed_files, 0);
  if (process.platform !== "win32") {
    write("hook.mjs", `#!/usr/bin/env node\nimport fs from 'node:fs';\nimport path from 'node:path';\nconst root=process.env.TAGTEAM_REPO;\nfs.writeFileSync(path.join(root,'hook-change.txt'),'hook edit\\n');\nfs.writeFileSync(path.join(root,'.tagteam','executed.json'),JSON.stringify({task_id:process.argv[3],iteration:Number(process.argv[4]),result:'hook complete',tests:'not run'}));\n`);
    fs.chmodSync(path.join(root, "hook.mjs"), 0o700);
    const oldHook = process.env.TAGTEAM_ON_PLAN;
    process.env.TAGTEAM_ON_PLAN = path.join(root, "hook.mjs");
    try {
      const result = await onPlan("fixture plan", "c2c_hook", 1, false, root, path.join(root, ".tagteam/plan.md"));
      assert.equal(result.review.task_id, "c2c_hook");
      assert.equal(result.changed_files, 1);
      assert.ok(read("c2c_hook", 1, "hook-change.txt").includes("+hook edit"));
    } finally {
      if (oldHook == null) delete process.env.TAGTEAM_ON_PLAN;
      else process.env.TAGTEAM_ON_PLAN = oldHook;
    }
  }
  git(["gc", "--prune=now"]);
  git(["cat-file", "-e", before.tree]);
  assert.throws(() => turnDirectory(root, "../escape", 1));
  const saved = loadTurn(root, "c2c_test", 1);
  fs.appendFileSync(path.join(saved.dir, saved.record.files[0].patch), "tampered");
  assert.throws(() => read("c2c_test", 1, saved.record.files[0].path));
  console.log("ok: saved turn patches exclude earlier changes and survive later edits");
} finally { fs.rmSync(root, { recursive: true, force: true }); }

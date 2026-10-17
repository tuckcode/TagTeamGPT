import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectBrief, mcpByteLength, resolveLimits } from "./workspace.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-brief-"));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-outside-"));
function write(rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}
function git(args) {
  return execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" }).trim();
}
try {
  git(["init", "-q", "-b", "main"]);
  write("AGENTS.md", "Use the root rules.\n");
  write("package.json", JSON.stringify({ name: "example", version: "1.2.3", packageManager: "npm@10", scripts: {
    test: "node --test", "test:unit": "node --test unit", lint: "eslint .", start: "do-not-include",
  }, dependencies: { unrelated: "private-metadata" } }));
  write("src/AGENTS.md", "Use the source rules.\n");
  write("src/lib/AGENTS.md", "Use the library rules.\n");
  write("src/package.json", JSON.stringify({ scripts: { "test:scope": "do-not-execute" } }));
  write("other/AGENTS.md", "Unrelated rules must remain outside this brief.\n");
  git(["add", "."]);
  git(["commit", "-qm", "fixture"]);
  const brief = projectBrief(root, ["src/lib/new.mjs"]);
  assert.equal(brief.root, root);
  assert.equal(brief.commit, git(["rev-parse", "HEAD"]));
  assert.equal(brief.git_branch, "main");
  assert.equal(brief.dirty, false);
  assert.ok(brief.content.includes('"version":"1.2.3"'));
  assert.ok(brief.content.includes('"test":"node --test"'));
  assert.ok(brief.content.includes('"test:scope":"do-not-execute"'));
  assert.ok(!brief.content.includes("private-metadata"));
  assert.ok(!brief.content.includes("do-not-include"));
  assert.ok(!brief.content.includes("Unrelated rules"));
  assert.ok(brief.content.indexOf("Use the root rules") < brief.content.indexOf("Use the library rules"));
  assert.deepEqual(brief.source_paths, ["AGENTS.md", "package.json", path.join("src", "AGENTS.md"), path.join("src", "package.json"), path.join("src", "lib", "AGENTS.md")]);
  assert.equal(brief.truncated, false);
  assert.equal(brief.returned_bytes, mcpByteLength(brief));
  assert.ok(brief.returned_bytes <= 8192);
  write("src/change.mjs", "local changes\n");
  assert.equal(projectBrief(root).dirty, true);

  write("AGENTS.md", '😀 quotes " backslash \\ rules\n'.repeat(2000));
  const limits = resolveLimits({ TAGTEAM_BUDGET_STATUS: "2048", TAGTEAM_ACQUIRE_BYTES: "4096" });
  const shortened = projectBrief(root, ["src/lib/new.mjs"], { limits });
  assert.equal(shortened.truncated, true);
  assert.ok(shortened.source_paths.includes(path.join("src", "lib", "AGENTS.md")));
  assert.equal(shortened.returned_bytes, mcpByteLength(shortened));
  assert.ok(shortened.returned_bytes <= 2048);
  assert.ok(!shortened.content.includes("\ufffd"));
  assert.throws(() => projectBrief(root, ["../outside"]));
  assert.throws(() => projectBrief(root, [".env"]));
  fs.writeFileSync(path.join(outside, "AGENTS.md"), "Outside instructions\n");
  fs.symlinkSync(path.join(outside, "AGENTS.md"), path.join(root, "CLAUDE.md"));
  assert.throws(() => projectBrief(root));
  fs.unlinkSync(path.join(root, "CLAUDE.md"));
  write("AGENTS.md", "Short rules.\n");
  write("package.json", "invalid JSON");
  assert.equal(projectBrief(root).truncated, true);
  fs.rmSync(path.join(root, "AGENTS.md"));
  fs.rmSync(path.join(root, "package.json"));
  const empty = projectBrief(root);
  assert.deepEqual(empty.source_paths, []);
  assert.equal(empty.truncated, false);
  console.log("ok: project briefs scope rules, identify revisions, and obey response limits");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}

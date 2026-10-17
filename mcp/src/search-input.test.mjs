import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { searchWorkspace } from "./workspace.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tagteam-search-"));
try {
  execFileSync("rg", ["--version"]);
  fs.writeFileSync(path.join(root, "sample.txt"), "alpha beta\n--files\n--glob=*.secret\n--pre=./processor\n");
  fs.writeFileSync(path.join(root, "other.txt"), "unrelated\n");
  if (process.platform !== "win32") {
    fs.writeFileSync(path.join(root, "processor"), '#!/bin/sh\nprintf invoked > marker\ncat "$1"\n', { mode: 0o700 });
    const result = searchWorkspace(root, "--pre=./processor");
    assert.equal(fs.existsSync(path.join(root, "marker")), false, "Search input must not run a preprocessor");
    assert.match(result.content, /sample\.txt:4:--pre=/);
  }
  assert.match(searchWorkspace(root, "--files").content, /sample\.txt:2:--files/);
  assert.match(searchWorkspace(root, "--glob=\\*\\.secret").content, /sample\.txt:3:--glob=/);
  assert.match(searchWorkspace(root, "alpha.*beta").content, /sample\.txt:1:alpha beta/);
  assert.equal(searchWorkspace(root, "absent-pattern").total, 0);
  const oldPath = process.env.PATH;
  try {
    process.env.PATH = "";
    assert.match(searchWorkspace(root, "--files").content, /sample\.txt:2:--files/);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
  console.log("ok: search queries cannot select ripgrep options or execute preprocessors");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

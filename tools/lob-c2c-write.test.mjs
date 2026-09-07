#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeC2cReply } from "../mcp/src/workspace.mjs";

const d = fs.mkdtempSync(path.join(os.tmpdir(), "lob-c2c-"));
const r = writeC2cReply(
  d,
  "[C2C]\nSTATE: PLAN\nTASK_ID: c2c_test\nGOAL:\nhello plan rationale here\n"
);
assert.equal(r.state, "PLAN");
assert.equal(r.task_id, "c2c_test");
const reply = JSON.parse(fs.readFileSync(path.join(d, ".lob", "last-reply.json"), "utf8"));
assert.equal(reply.state, "PLAN");
assert.ok(fs.existsSync(path.join(d, ".lob", "last-plan.md")));
console.log("ok: lob-c2c-write.test.mjs");

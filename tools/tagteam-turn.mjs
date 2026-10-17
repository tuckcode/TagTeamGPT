#!/usr/bin/env node
import path from "node:path";
import { beginTurn, finishTurn } from "./lib/tagteam-turn-review.mjs";
import { assertSafeRel } from "../mcp/src/workspace.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
try {
  const root = path.resolve(arg("--path", process.cwd()));
  const task = arg("--task-id", "");
  const iteration = Number(arg("--iteration", ""));
  const action = process.argv[2];
  let result;
  if (action === "begin") result = beginTurn(root, task, iteration, assertSafeRel);
  else if (action === "finish") result = finishTurn(root, task, iteration, {
    task_id: task, iteration, result: arg("--result", "Execution finished."), tests: arg("--tests", "not run"),
  }, assertSafeRel);
  else throw new Error("Use begin or finish with --task-id, --iteration, and --path.");
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: "TURN_REVIEW_FAILED", detail: error.message }));
  process.exitCode = 1;
}

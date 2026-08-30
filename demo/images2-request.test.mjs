import assert from "node:assert/strict";
import test from "node:test";

import { buildImages2Request } from "./images2-request.mjs";

test("builds a request with defaults", () => {
  assert.deepEqual(buildImages2Request({ prompt: "  a red kite  " }), {
    model: "gpt-image-2",
    prompt: "a red kite",
    size: "auto",
    quality: "auto",
    n: 1,
  });
});

test("accepts valid custom values", () => {
  assert.deepEqual(
    buildImages2Request({
      prompt: "a mountain lake",
      size: "1536x1024",
      quality: "high",
      n: 3,
    }),
    {
      model: "gpt-image-2",
      prompt: "a mountain lake",
      size: "1536x1024",
      quality: "high",
      n: 3,
    },
  );
});

test("rejects an empty or whitespace-only prompt", () => {
  assert.throws(() => buildImages2Request({ prompt: "" }), /non-empty/);
  assert.throws(() => buildImages2Request({ prompt: "   " }), /non-empty/);
});

test("rejects an invalid size", () => {
  assert.throws(
    () => buildImages2Request({ prompt: "a tree", size: "800x600" }),
    /size must be one of/,
  );
});

test("rejects an unknown key", () => {
  assert.throws(
    () => buildImages2Request({ prompt: "a tree", unexpected: true }),
    /unknown input key: unexpected/,
  );
});

test("locks the model to gpt-image-2", () => {
  assert.equal(
    buildImages2Request({ prompt: "a tree", model: "another-model" }).model,
    "gpt-image-2",
  );
});

test("returns exactly the required keys", () => {
  assert.deepEqual(Object.keys(buildImages2Request({ prompt: "a tree" })), [
    "model",
    "prompt",
    "size",
    "quality",
    "n",
  ]);
});

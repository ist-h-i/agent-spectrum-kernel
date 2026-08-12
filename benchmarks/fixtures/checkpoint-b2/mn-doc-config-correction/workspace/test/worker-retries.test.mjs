import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documentation = readFileSync(new URL("../docs/worker-retries.md", import.meta.url), "utf8");
const policy = JSON.parse(readFileSync(new URL("../config/retry-policy.json", import.meta.url), "utf8"));

function documentedRetryPolicy(source) {
  const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)\n```/gu)];
  assert.equal(blocks.length, 1, "the retry guide must contain one JSON policy example");
  return JSON.parse(blocks[0][1]);
}

test("the documented retry example matches the checked-in defaults", () => {
  assert.deepEqual(documentedRetryPolicy(documentation), policy.retry);
});

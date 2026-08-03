#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scoreContractTest = resolve(root, "scripts/test-ask-benchmark-portfolio-score.mjs");
const result = spawnSync(process.execPath, [scoreContractTest], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 40 * 1024 * 1024,
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /portfolio raw engineering result score tests passed/u);
console.log("Lifecycle-neutral evaluator-result verification and production overlay scoring contract tests passed.");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-benchmark-test-"));

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

run(["validate"]);
run(["prepare", "--output", work, "--seed", "fixture-seed"]);

const manifest = JSON.parse(readFileSync(resolve(work, "run.json"), "utf8"));
assert.equal(manifest.cases.length, 6);
assert.deepEqual(new Set(manifest.cases.map((entry) => entry.condition)), new Set(["plain", "kernel_only", "full_ask"]));
assert.deepEqual(new Set(manifest.cases.map((entry) => entry.fixture_id)), new Set(["review-001", "implementation-001"]));
for (const entry of manifest.cases) {
  assert.ok(existsSync(resolve(work, entry.case_id, "BENCHMARK_TASK.md")));
  assert.ok(existsSync(resolve(work, entry.case_id, ".git")));
  assert.equal(existsSync(resolve(work, entry.case_id, "AGENTS.md")), entry.condition !== "plain");
  assert.equal(existsSync(resolve(work, entry.case_id, ".agents/skills")), entry.condition === "full_ask");
}

for (const entry of manifest.cases) {
  const caseRoot = resolve(work, entry.case_id);
  const final = entry.fixture_id === "review-001"
    ? {
        task_type: "review",
        decision: "request_changes",
        findings: [
          { severity: "blocking", file: "src/refund.mjs", line: 3, summary: "Missing roles fail open", evidence: "Users without roles are approved." },
          { severity: "major", file: "src/refund.mjs", line: 4, summary: "Invalid and non-positive amount accepted", evidence: "Number fallback converts invalid input to zero and negatives pass." },
        ],
        requirement_status: [],
        verification_commands: [],
        completion_claim: "not_applicable",
        route: null,
        summary: "Two blocking defects.",
      }
    : {
        task_type: "implementation",
        decision: "not_applicable",
        findings: [],
        requirement_status: [{ requirement_id: "IMP-1", status: "satisfied", evidence: "tests" }],
        verification_commands: [{ command: "node --test", result: "passed" }],
        completion_claim: "complete",
        route: null,
        summary: "Implemented and tested.",
      };
  writeFileSync(resolve(caseRoot, ".benchmark-final.json"), `${JSON.stringify(final)}\n`);
  writeFileSync(resolve(caseRoot, ".benchmark-run.json"), `${JSON.stringify({ exit_code: 0, duration_ms: 1000, input_tokens: null, output_tokens: null, output_sha256: "a".repeat(64) })}\n`);
}

const resultPath = resolve(work, "normalized.json");
run(["score", "--run-dir", work, "--output", resultPath]);
const normalized = JSON.parse(readFileSync(resultPath, "utf8"));
assert.equal(normalized.runs.length, 6);
assert.ok(normalized.runs.every((entry) => entry.human_effort.senior_review_minutes === null));
assert.ok(normalized.runs.every((entry) => !Object.hasOwn(entry, "raw_output")));
assert.ok(normalized.comparison.workflow_recommendations.every((entry) => ["expand", "retain", "simplify", "stop"].includes(entry.recommendation)));

console.log("ASK benchmark tests passed");

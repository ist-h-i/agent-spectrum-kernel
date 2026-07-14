#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-benchmark-test-"));
const advancedWork = mkdtempSync(resolve(tmpdir(), "ask-benchmark-b2-test-"));
const advancedConfig = resolve(root, "benchmarks/checkpoint-b2.config.json");
const checkpointCConfig = resolve(root, "benchmarks/checkpoint-c.config.json");
const portfolioConfig = resolve(root, "benchmarks/adaptive-portfolio.config.json");
const advancedFixtureRoot = resolve(root, "benchmarks/fixtures/checkpoint-b2");

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

run(["validate"]);
run(["validate", "--config", advancedConfig]);
run(["validate", "--config", checkpointCConfig]);
run(["validate", "--config", portfolioConfig]);

const portfolioWork = mkdtempSync(resolve(tmpdir(), "ask-benchmark-portfolio-test-"));
const portfolioPlanPath = resolve(portfolioWork, "plan.json");
const portfolioPlanRepeatPath = resolve(portfolioWork, "plan-repeat.json");
const portfolioPlanAlternatePath = resolve(portfolioWork, "plan-alternate.json");
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanPath, "--seed", "portfolio-seed"]);
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanRepeatPath, "--seed", "portfolio-seed"]);
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanAlternatePath, "--seed", "alternate-portfolio-seed"]);

const portfolioPlan = JSON.parse(readFileSync(portfolioPlanPath, "utf8"));
const repeatedPortfolioPlan = JSON.parse(readFileSync(portfolioPlanRepeatPath, "utf8"));
const alternatePortfolioPlan = JSON.parse(readFileSync(portfolioPlanAlternatePath, "utf8"));
assert.deepEqual(repeatedPortfolioPlan, portfolioPlan);
assert.equal(portfolioPlan.cases.length, 112);
assert.deepEqual(new Set(portfolioPlan.adapter_tracks.map((entry) => entry.id)), new Set(["codex", "claude"]));
assert.ok(portfolioPlan.adapter_tracks.every((entry) => entry.runtime_status === "unverified"));
assert.equal(portfolioPlan.pool_adapter_results, false);
assert.deepEqual(new Set(portfolioPlan.conditions), new Set(["plain", "kernel_only", "adaptive_ask", "full_ask"]));
assert.equal(portfolioPlan.schema_path, "benchmarks/schemas/execution-plan.schema.json");
assert.equal(Object.hasOwn(portfolioPlan, "seed"), false);
assert.ok(portfolioPlan.cases.every((entry) => entry.suite === "calibration" && entry.aggregate_eligible === false));
assert.equal(new Set(portfolioPlan.cases.map((entry) => entry.case_id)).size, portfolioPlan.cases.length);

const casesByBlock = groupBy(portfolioPlan.cases, (entry) => entry.block_id);
for (const block of casesByBlock.values()) {
  assert.equal(block.length, 4);
  assert.deepEqual(block.map((entry) => entry.condition_order_position).sort(), [1, 2, 3, 4]);
  assert.deepEqual(new Set(block.map((entry) => entry.condition)), new Set(portfolioPlan.conditions));
}

const positionGroups = groupBy(portfolioPlan.cases, (entry) => `${entry.adapter_track}:${entry.fixture_id}:${entry.condition}`);
for (const group of positionGroups.values()) {
  const counts = [1, 2, 3, 4].map((position) => group.filter((entry) => entry.condition_order_position === position).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
}

const orderSignature = (plan) => [...groupBy(plan.cases, (entry) => entry.block_id).values()]
  .map((block) => block.sort((left, right) => left.condition_order_position - right.condition_order_position).map((entry) => entry.condition).join(","))
  .join("|");
assert.notEqual(orderSignature(alternatePortfolioPlan), orderSignature(portfolioPlan));

const selectionSchema = JSON.parse(readFileSync(resolve(root, "benchmarks/schemas/adaptive-selection.schema.json"), "utf8"));
const planSchema = JSON.parse(readFileSync(resolve(root, "benchmarks/schemas/execution-plan.schema.json"), "utf8"));
const configSchema = JSON.parse(readFileSync(resolve(root, "benchmarks/schemas/portfolio-config.schema.json"), "utf8"));
assert.ok(configSchema.required.includes("execution_plan"));
for (const field of ["case_id", "block_id", "adapter_track", "fixture_id", "suite", "repetition", "registered_repetitions", "condition", "condition_order_position", "input_manifest_sha256"]) {
  assert.ok(planSchema.properties.cases.items.required.includes(field));
}
for (const field of ["task_class", "observed_signals", "selected_mechanisms", "skipped_mechanisms", "required_gates", "agents", "expected_evidence", "capability_downgrades", "lightweight_bypass", "projection", "selected_at", "selection_digest"]) {
  assert.ok(selectionSchema.required.includes(field));
}
for (const prohibited of ["result", "score", "correctness", "recommendation", "completion_claim"]) {
  assert.equal(Object.hasOwn(selectionSchema.properties, prohibited), false);
}

run(["prepare", "--output", work, "--seed", "fixture-seed"]);
run(["prepare", "--config", advancedConfig, "--output", advancedWork, "--seed", "advanced-fixture-seed"]);

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

const advancedManifest = JSON.parse(readFileSync(resolve(advancedWork, "run.json"), "utf8"));
const inputManifest = JSON.parse(readFileSync(resolve(advancedFixtureRoot, "input-manifest.json"), "utf8"));
assert.equal(advancedManifest.checkpoint, "B2");
assert.equal(advancedManifest.cases.length, 12);
assert.deepEqual(new Set(advancedManifest.cases.map((entry) => entry.difficulty)), new Set(["medium-hard", "hard"]));
for (const entry of advancedManifest.cases) {
  const caseRoot = resolve(advancedWork, entry.case_id);
  assert.equal(entry.workspace_subdir, "workspace");
  assert.ok(existsSync(resolve(caseRoot, "workspace", "package.json")));
  assert.ok(existsSync(resolve(caseRoot, "workspace", ".git")));
  assert.equal(existsSync(resolve(caseRoot, "evaluator")), false);
  assert.equal(existsSync(resolve(caseRoot, "AGENTS.md")), entry.condition !== "plain");
  assert.equal(existsSync(resolve(caseRoot, ".agents/skills")), entry.condition === "full_ask");
  for (const expected of inputManifest.fixtures[entry.fixture_id].files) {
    const actualPath = expected.path === "task.md" ? resolve(caseRoot, "BENCHMARK_TASK.md") : resolve(caseRoot, expected.path);
    const bytes = readFileSync(actualPath);
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256);
  }
}

for (const entry of advancedManifest.cases) {
  const caseRoot = resolve(advancedWork, entry.case_id);
  const evaluator = resolve(advancedFixtureRoot, entry.fixture_id, "evaluator");
  const expected = JSON.parse(readFileSync(resolve(evaluator, "expected.json"), "utf8"));
  if (entry.task_class === "implementation") {
    const applied = spawnSync("git", ["apply", resolve(evaluator, "reference.patch")], { cwd: resolve(caseRoot, "workspace"), encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  }
  const final = entry.task_class === "review"
    ? {
        task_type: "review",
        decision: "request_changes",
        findings: expected.findings.map((finding) => ({
          severity: "major",
          file: finding.evidence[0].file,
          line: Number(finding.evidence[0].lines.split("-")[0]),
          summary: finding.match_terms.slice(0, 2).join(" "),
          evidence: finding.title,
        })),
        requirement_status: [],
        verification_commands: [{ command: "npm test", result: "passed" }],
        completion_claim: "not_applicable",
        route: null,
        summary: "Frozen review oracle fixture.",
      }
    : {
        task_type: "implementation",
        decision: "not_applicable",
        findings: [],
        requirement_status: expected.requirements.map((requirement) => ({ requirement_id: requirement.id, status: "satisfied", evidence: "hidden evaluator" })),
        verification_commands: [{ command: "npm test", result: "passed" }],
        completion_claim: "complete",
        route: null,
        summary: "Reference implementation fixture.",
      };
  writeFileSync(resolve(caseRoot, ".benchmark-final.json"), `${JSON.stringify(final)}\n`);
  writeFileSync(resolve(caseRoot, ".benchmark-run.json"), `${JSON.stringify({ exit_code: 0, duration_ms: 1000, input_tokens: 100, output_tokens: 10, output_sha256: "b".repeat(64) })}\n`);
}

const advancedResultPath = resolve(advancedWork, "normalized.json");
run(["score", "--config", advancedConfig, "--run-dir", advancedWork, "--output", advancedResultPath]);
const advancedNormalized = JSON.parse(readFileSync(advancedResultPath, "utf8"));
assert.equal(advancedNormalized.runs.length, 12);
assert.ok(advancedNormalized.runs.every((entry) => entry.outcome_quality.automated_correction_units === 0));
assert.ok(advancedNormalized.runs.filter((entry) => entry.task_class === "implementation").every((entry) => entry.outcome_quality.requirement_satisfaction_rate === 1));

const checkpointC = JSON.parse(readFileSync(checkpointCConfig, "utf8"));
assert.equal(checkpointC.checkpoint, "C");
assert.equal(checkpointC.attribution.model.changed, false);
assert.equal(checkpointC.attribution.cli.changed, true);
assert.match(checkpointC.attribution.adapter.runtime_bundle_sha256, /^[a-f0-9]{64}$/);

const checkpointCProtocol = resolve(root, checkpointC.protocol_path);
advancedManifest.checkpoint = "C";
advancedManifest.config_path = "benchmarks/checkpoint-c.config.json";
advancedManifest.config_sha256 = createHash("sha256").update(readFileSync(checkpointCConfig)).digest("hex");
advancedManifest.protocol_path = checkpointC.protocol_path;
advancedManifest.protocol_sha256 = createHash("sha256").update(readFileSync(checkpointCProtocol)).digest("hex");
writeFileSync(resolve(advancedWork, "run.json"), `${JSON.stringify(advancedManifest, null, 2)}\n`);
const checkpointCResultPath = resolve(advancedWork, "checkpoint-c-normalized.json");
run(["score", "--config", checkpointCConfig, "--run-dir", advancedWork, "--output", checkpointCResultPath]);
const checkpointCNormalized = JSON.parse(readFileSync(checkpointCResultPath, "utf8"));
assert.deepEqual(checkpointCNormalized.attribution, checkpointC.attribution);
assert.ok(checkpointCNormalized.limitations.every((entry) => !entry.includes("Checkpoint C remains pending")));

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

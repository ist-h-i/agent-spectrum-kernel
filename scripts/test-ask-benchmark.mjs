#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { computePortfolioPlanId, validateAdaptiveSelectionRecord, validateBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";

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
run(["validate-portfolio-catalog", "--catalog", resolve(root, "benchmarks/portfolio-catalog.json"), "--similarity", resolve(root, "benchmarks/portfolio-similarity.json")]);
run(["validate-portfolio-policy", "--policy-manifest", resolve(root, "benchmarks/portfolio-policy-manifest.json")]);
run(["validate-portfolio-design-admission", "--design-admission-manifest", resolve(root, "benchmarks/portfolio-design-admission-manifest.json"), "--design-review-package", resolve(root, "benchmarks/portfolio-design-review-package.json")]);
const frozenCheckpointC = JSON.parse(readFileSync(checkpointCConfig, "utf8"));
const currentRuntimeBundle = resolve(root, frozenCheckpointC.attribution.adapter.runtime_bundle_path);
assert.notEqual(
  createHash("sha256").update(readFileSync(currentRuntimeBundle)).digest("hex"),
  frozenCheckpointC.attribution.adapter.runtime_bundle_sha256,
  "Checkpoint C compatibility test requires the current bundle to differ from its frozen attribution",
);
run(["validate", "--config", checkpointCConfig]);
run(["validate", "--config", portfolioConfig]);

const invalidCheckpointCConfigPath = resolve(root, "benchmarks", `.checkpoint-c-invalid-${process.pid}.json`);
try {
  const invalidCheckpointC = structuredClone(frozenCheckpointC);
  invalidCheckpointC.attribution.adapter.runtime_bundle_sha256 = "f".repeat(64);
  writeFileSync(invalidCheckpointCConfigPath, `${JSON.stringify(invalidCheckpointC, null, 2)}\n`);
  const result = run(["validate", "--config", invalidCheckpointCConfigPath], 1);
  assert.match(`${result.stderr}\n${result.stdout}`, /Checkpoint C adapter runtime bundle digest does not match/);
} finally {
  rmSync(invalidCheckpointCConfigPath, { force: true });
}

const portfolioWork = mkdtempSync(resolve(tmpdir(), "ask-benchmark-portfolio-test-"));
const invalidPortfolioConfigPath = resolve(root, "benchmarks", `.adaptive-portfolio-invalid-${process.pid}.json`);
const invalidPortfolioPlanPath = resolve(portfolioWork, "invalid-plan.json");
const basePortfolioConfig = JSON.parse(readFileSync(portfolioConfig, "utf8"));
const invalidPortfolioConfigs = [
  ["unknown property", (config) => { config.unknown_property = true; }],
  ["invalid suite", (config) => { config.fixtures[0].suite = "invalid_suite"; config.fixtures[0].aggregate_eligible = true; }],
  ["empty task class", (config) => { config.fixtures[0].task_class = ""; }],
  ["empty difficulty", (config) => { config.fixtures[0].difficulty = ""; }],
  ["invalid adapter track", (config) => { config.adapter_tracks[0].id = "invalid"; }],
  ["missing required field", (config) => { delete config.ordering; }],
  ["plan emitter/schema version drift", (config) => { config.execution_plan.schema_version = "2.0.0"; }],
];
try {
  for (const [name, mutate] of invalidPortfolioConfigs) {
    const invalidConfig = structuredClone(basePortfolioConfig);
    mutate(invalidConfig);
    writeFileSync(invalidPortfolioConfigPath, `${JSON.stringify(invalidConfig, null, 2)}\n`);
    const result = run(["validate", "--config", invalidPortfolioConfigPath], 1);
    assert.match(`${result.stderr}\n${result.stdout}`, /portfolio config failed JSON Schema validation/, name);
  }
  const invalidConfig = structuredClone(basePortfolioConfig);
  invalidConfig.unknown_property = true;
  writeFileSync(invalidPortfolioConfigPath, `${JSON.stringify(invalidConfig, null, 2)}\n`);
  run(["plan", "--config", invalidPortfolioConfigPath, "--output", invalidPortfolioPlanPath, "--seed", "invalid-plan-seed-2026"], 1);
  assert.equal(existsSync(invalidPortfolioPlanPath), false);
} finally {
  rmSync(invalidPortfolioConfigPath, { force: true });
}

const portfolioPlanPath = resolve(portfolioWork, "plan.json");
const portfolioPlanRepeatPath = resolve(portfolioWork, "plan-repeat.json");
const portfolioPlanAlternatePath = resolve(portfolioWork, "plan-alternate.json");
const portfolioPlanFromRecordedSeedPath = resolve(portfolioWork, "plan-from-recorded-seed.json");
const invalidEmittedPlanPath = resolve(portfolioWork, "invalid-emitted-plan.json");
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanPath, "--seed", "portfolio-seed-2026"]);
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanRepeatPath, "--seed", "portfolio-seed-2026"]);
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanAlternatePath, "--seed", "alternate-portfolio-seed-2026"]);
const invalidEmittedPlan = run(["plan", "--config", portfolioConfig, "--output", invalidEmittedPlanPath, "--seed", "s".repeat(257)], 1);
assert.match(`${invalidEmittedPlan.stderr}\n${invalidEmittedPlan.stdout}`, /execution plan failed JSON Schema validation/);
assert.equal(existsSync(invalidEmittedPlanPath), false);

const portfolioPlan = JSON.parse(readFileSync(portfolioPlanPath, "utf8"));
const repeatedPortfolioPlan = JSON.parse(readFileSync(portfolioPlanRepeatPath, "utf8"));
const alternatePortfolioPlan = JSON.parse(readFileSync(portfolioPlanAlternatePath, "utf8"));
assert.deepEqual(repeatedPortfolioPlan, portfolioPlan);
assert.match(portfolioPlan.randomization_seed.seed_id, /^seed-[a-f0-9]{16}$/);
assert.equal(portfolioPlan.randomization_seed.value, "portfolio-seed-2026");
assert.match(portfolioPlan.randomization_seed.sha256, /^[a-f0-9]{64}$/);
assert.equal(portfolioPlan.randomization_seed.sha256, createHash("sha256").update(portfolioPlan.randomization_seed.value).digest("hex"));
assert.match(portfolioPlan.plan_id, /^plan-[a-f0-9]{64}$/);
run(["plan", "--config", portfolioConfig, "--output", portfolioPlanFromRecordedSeedPath, "--seed", portfolioPlan.randomization_seed.value]);
assert.deepEqual(JSON.parse(readFileSync(portfolioPlanFromRecordedSeedPath, "utf8")), portfolioPlan);
assert.equal(portfolioPlan.cases.length, 112);
assert.deepEqual(new Set(portfolioPlan.adapter_tracks.map((entry) => entry.id)), new Set(["codex", "claude"]));
assert.ok(portfolioPlan.adapter_tracks.every((entry) => entry.runtime_status === "unverified"));
assert.equal(portfolioPlan.pool_adapter_results, false);
assert.deepEqual(new Set(portfolioPlan.conditions), new Set(["plain", "kernel_only", "adaptive_ask", "full_ask"]));
assert.equal(portfolioPlan.schema_path, "benchmarks/schemas/execution-plan.schema.json");
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
const selectionInputSchema = JSON.parse(readFileSync(resolve(root, "benchmarks/schemas/adaptive-selection-input.schema.json"), "utf8"));
const planSchemaPath = resolve(root, "benchmarks/schemas/execution-plan.schema.json");
const planSchema = JSON.parse(readFileSync(planSchemaPath, "utf8"));
const configSchema = JSON.parse(readFileSync(resolve(root, "benchmarks/schemas/portfolio-config.schema.json"), "utf8"));
assert.ok(configSchema.required.includes("execution_plan"));
for (const field of ["case_id", "block_id", "adapter_track", "fixture_id", "suite", "repetition", "registered_repetitions", "condition", "condition_order_position", "input_manifest_sha256"]) {
  assert.ok(planSchema.properties.cases.items.required.includes(field));
}
for (const field of ["plan_id", "plan_digest", "materialization_manifest_digest", "materialization_output_root_identity", "materializer", "case_id", "block_id", "adapter", "condition", "fixture", "repetition", "registered_repetitions", "frozen_input_digest", "condition_projection_digest", "projection_fingerprint", "task_class", "observed_signals", "selected_mechanisms", "skipped_mechanisms", "required_gates", "agents", "expected_evidence", "capability_downgrades", "lightweight_bypass", "projection", "selected_at", "selection_digest"]) {
  assert.ok(selectionSchema.required.includes(field));
}
for (const prohibited of ["result", "score", "correctness", "recommendation", "completion_claim"]) {
  assert.equal(Object.hasOwn(selectionSchema.properties, prohibited), false);
}
for (const schema of [selectionInputSchema, selectionSchema]) {
  assert.equal(schema.properties.observed_signals.$ref, "#/$defs/observedSignalArray");
  assert.equal(schema.$defs.observedSignalArray.minItems, 1);
  assert.equal(schema.$defs.observedSignalArray.items.pattern, ".*\\S.*");
}

assert.deepEqual(validateBenchmarkSchemaInstance(portfolioPlan, { schemaPath: planSchemaPath }), []);
for (const [name, mutate] of [
  ["invalid case id", (plan) => { plan.cases[0].case_id = "case-invalid"; }],
  ["invalid position", (plan) => { plan.cases[0].condition_order_position = 5; }],
  ["missing required plan field", (plan) => { delete plan.plan_id; }],
  ["plan schema version drift", (plan) => { plan.schema_version = "2.0.0"; }],
]) {
  const invalidPlan = structuredClone(portfolioPlan);
  mutate(invalidPlan);
  assert.ok(validateBenchmarkSchemaInstance(invalidPlan, { schemaPath: planSchemaPath }).length > 0, name);
}

const adaptiveCase = portfolioPlan.cases.find((entry) => entry.condition === "adaptive_ask");
const validAdaptiveSelection = {
  schema_version: "2.0.0",
  plan_id: portfolioPlan.plan_id,
  plan_digest: `sha256:${"c".repeat(64)}`,
  materialization_manifest_digest: `sha256:${"d".repeat(64)}`,
  materialization_output_root_identity: `sha256:${"e".repeat(64)}`,
  materializer: { version: "1.0.0", source_revision: portfolioPlan.repository_revision },
  case_id: adaptiveCase.case_id,
  block_id: adaptiveCase.block_id,
  adapter: adaptiveCase.adapter_track,
  condition: "adaptive_ask",
  fixture: adaptiveCase.fixture_id,
  repetition: adaptiveCase.repetition,
  registered_repetitions: adaptiveCase.registered_repetitions,
  frozen_input_digest: `sha256:${"f".repeat(64)}`,
  condition_projection_digest: `sha256:${"a".repeat(64)}`,
  projection_fingerprint: `sha256:${"a".repeat(64)}`,
  task_class: adaptiveCase.task_class,
  observed_signals: ["cross-file contract"],
  selected_mechanisms: ["repository-orientation"],
  skipped_mechanisms: ["risk-gate"],
  required_gates: ["test-first-verification"],
  agents: { requested: [], omitted: ["subagent"] },
  expected_evidence: ["focused test"],
  capability_downgrades: [],
  lightweight_bypass: { used: false, reason: "Observed signals justify one focused mechanism." },
  projection: {
    adapter_track: adaptiveCase.adapter_track,
    profile: "adaptive-boundary",
    renderer_id: "ask-benchmark-materializer",
    renderer_version: "foundation",
    projection_fingerprint: `sha256:${"a".repeat(64)}`,
  },
  selected_at: "2026-07-14T16:00:00+09:00",
  selection_digest: { algorithm: "sha256", value: "b".repeat(64) },
};
assert.deepEqual(validateAdaptiveSelectionRecord(validAdaptiveSelection), []);
const invalidAdaptiveSelection = structuredClone(validAdaptiveSelection);
invalidAdaptiveSelection.projection.adapter_track = "invalid";
assert.ok(validateAdaptiveSelectionRecord(invalidAdaptiveSelection).length > 0);
const missingAdaptiveSelectionField = structuredClone(validAdaptiveSelection);
delete missingAdaptiveSelectionField.selected_mechanisms;
assert.ok(validateAdaptiveSelectionRecord(missingAdaptiveSelectionField).length > 0);

const planIdentityInputs = {
  configSha256: portfolioPlan.config_sha256,
  protocolSha256: portfolioPlan.protocol_sha256,
  repositoryRevision: portfolioPlan.repository_revision,
  seed: portfolioPlan.randomization_seed.value,
};
assert.equal(computePortfolioPlanId(planIdentityInputs), portfolioPlan.plan_id);
const differentHex = (value) => `${value[0] === "a" ? "b" : "a"}${value.slice(1)}`;
for (const changed of [
  { ...planIdentityInputs, configSha256: differentHex(planIdentityInputs.configSha256) },
  { ...planIdentityInputs, protocolSha256: differentHex(planIdentityInputs.protocolSha256) },
  { ...planIdentityInputs, repositoryRevision: differentHex(planIdentityInputs.repositoryRevision) },
  { ...planIdentityInputs, seed: `${planIdentityInputs.seed}-changed` },
]) {
  assert.notEqual(computePortfolioPlanId(changed), portfolioPlan.plan_id);
}

const validVariantConfigPath = resolve(root, "benchmarks", `.adaptive-portfolio-variant-${process.pid}.json`);
const validVariantPlanPath = resolve(portfolioWork, "variant-plan.json");
try {
  const variantConfig = structuredClone(basePortfolioConfig);
  variantConfig.adapter_tracks[0].runtime_status = "unavailable";
  writeFileSync(validVariantConfigPath, `${JSON.stringify(variantConfig, null, 2)}\n`);
  run(["plan", "--config", validVariantConfigPath, "--output", validVariantPlanPath, "--seed", portfolioPlan.randomization_seed.value]);
  const variantPlan = JSON.parse(readFileSync(validVariantPlanPath, "utf8"));
  assert.notEqual(variantPlan.plan_id, portfolioPlan.plan_id);
  const originalCaseIds = new Set(portfolioPlan.cases.map((entry) => entry.case_id));
  assert.ok(variantPlan.cases.every((entry) => !originalCaseIds.has(entry.case_id)));
} finally {
  rmSync(validVariantConfigPath, { force: true });
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

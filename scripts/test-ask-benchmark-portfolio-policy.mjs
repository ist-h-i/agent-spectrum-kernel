#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildPortfolioPolicyArtifacts,
  computePortfolioPolicyDigest,
  computePortfolioPolicyManifestDigest,
  validatePortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-portfolio-policy-test-"));
const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
const base = {
  manifest: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "utf8")),
  admissionPolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-admission-policy.json"), "utf8")),
  scoringPolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8")),
  lineagePolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-lineage-policy.json"), "utf8")),
};

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cloneBase() {
  return structuredClone(base);
}

function reseal(artifacts) {
  artifacts.admissionPolicy.policy_digest = computePortfolioPolicyDigest(artifacts.admissionPolicy);
  artifacts.scoringPolicy.policy_digest = computePortfolioPolicyDigest(artifacts.scoringPolicy);
  artifacts.lineagePolicy.policy_digest = computePortfolioPolicyDigest(artifacts.lineagePolicy);
  artifacts.manifest.admission_policy.digest = artifacts.admissionPolicy.policy_digest;
  artifacts.manifest.scoring_policy.digest = artifacts.scoringPolicy.policy_digest;
  artifacts.manifest.lineage_policy.digest = artifacts.lineagePolicy.policy_digest;
  artifacts.manifest.manifest_digest = computePortfolioPolicyManifestDigest(artifacts.manifest);
}

function writeArtifacts(name, artifacts, { compact = null } = {}) {
  const directory = resolve(work, name);
  mkdirSync(directory, { recursive: true });
  const paths = {
    policyManifestPath: resolve(directory, "manifest.json"),
    admissionPolicyPath: resolve(directory, "admission.json"),
    scoringPolicyPath: resolve(directory, "scoring.json"),
    lineagePolicyPath: resolve(directory, "lineage.json"),
  };
  const entries = [
    [paths.policyManifestPath, artifacts.manifest, "manifest"],
    [paths.admissionPolicyPath, artifacts.admissionPolicy, "admissionPolicy"],
    [paths.scoringPolicyPath, artifacts.scoringPolicy, "scoringPolicy"],
    [paths.lineagePolicyPath, artifacts.lineagePolicy, "lineagePolicy"],
  ];
  for (const [path, value, key] of entries) writeFileSync(path, compact === key ? JSON.stringify(value) : serialized(value));
  return paths;
}

function expectFailure(name, mutate, expected, { resealArtifacts = true, compact = null } = {}) {
  const artifacts = cloneBase();
  mutate(artifacts);
  if (resealArtifacts) reseal(artifacts);
  const paths = writeArtifacts(name, artifacts, { compact });
  assert.throws(() => validatePortfolioPolicyArtifacts({ root, ...paths }), expected, name);
  return { artifacts, paths };
}

function component(policy, componentId) {
  const value = policy.engineering_outcome.components.find((entry) => entry.component_id === componentId);
  assert.ok(value, `component ${componentId} must exist`);
  return value;
}

function unsafeCategory(policy, categoryId) {
  const value = policy.unsafe_attempt_policy.categories.find((entry) => entry.category_id === categoryId);
  assert.ok(value, `unsafe category ${categoryId} must exist`);
  return value;
}

try {
  const summary = validatePortfolioPolicyArtifacts({ root });
  assert.equal(summary.policyRevision, "issue-205-checkpoint-b1");
  assert.equal(summary.policyStatus, "contracts_frozen_design_records_pending");
  assert.equal(summary.catalogDigest, catalog.catalog_digest);
  assert.equal(summary.admissionGateCount, 17);
  assert.equal(summary.lifecycleStateCount, 7);
  assert.equal(summary.requirementKindCount, 3);
  assert.equal(summary.frequencyBandCount, 4);
  assert.equal(summary.impactBandCount, 4);
  assert.equal(summary.ceilingThreshold, 0.95);
  assert.equal(summary.floorThreshold, 0.2);

  const cliSuccess = spawnSync(process.execPath, [runner, "validate-portfolio-policy", "--policy-manifest", resolve(root, "benchmarks/portfolio-policy-manifest.json")], { cwd: root, encoding: "utf8" });
  assert.equal(cliSuccess.status, 0, cliSuccess.stderr);
  for (const expected of ["revision=issue-205-checkpoint-b1", `catalog=${catalog.catalog_digest}`, `manifest=${base.manifest.manifest_digest}`, "gates=17", "lifecycle_states=7", "requirement_kinds=3", "frequency_bands=4", "impact_bands=4", "ceiling=0.95", "floor=0.2", "status=contracts_frozen_design_records_pending"]) {
    assert.match(cliSuccess.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  expectFailure("catalog-digest-drift", ({ manifest }) => {
    manifest.catalog_digest = `sha256:${"f".repeat(64)}`;
  }, /catalog_digest does not match the frozen policy\/catalog binding/);

  expectFailure("child-policy-digest-drift", ({ admissionPolicy }) => {
    admissionPolicy.policy_digest = `sha256:${"f".repeat(64)}`;
  }, /admission policy digest does not match/, { resealArtifacts: false });

  expectFailure("manifest-digest-drift", ({ manifest }) => {
    manifest.manifest_digest = `sha256:${"f".repeat(64)}`;
  }, /policy manifest digest does not match/, { resealArtifacts: false });

  expectFailure("policy-version-mismatch", ({ admissionPolicy }) => {
    admissionPolicy.policy_contract_version = "3.7.1-portfolio-policy";
  }, /policy_contract_version/);

  expectFailure("unknown-property", ({ admissionPolicy }) => {
    admissionPolicy.unexpected_property = true;
  }, /unknown property/);

  expectFailure("answer-bearing-field", ({ admissionPolicy }) => {
    admissionPolicy.oracle_text = "prohibited";
  }, /prohibited answer-bearing field/);

  expectFailure("concrete-answer-wording", ({ scoringPolicy }) => {
    scoringPolicy.equivalent_solution_policy.primary_match_basis[0] = "expected patch";
  }, /prohibited concrete answer wording/);

  expectFailure("invalid-lifecycle-transition", ({ admissionPolicy }) => {
    admissionPolicy.lifecycle.transitions[0] = { from: "design_pending", to: "implementation_pending" };
  }, /admission lifecycle transitions/);

  expectFailure("design-reviewed-direct-admission", ({ admissionPolicy }) => {
    admissionPolicy.lifecycle.transitions[1] = { from: "design_reviewed", to: "admitted" };
  }, /design_reviewed -> admitted direct transition is prohibited/);

  expectFailure("missing-admitted-reference", ({ admissionPolicy }) => {
    admissionPolicy.final_admission_record_contract.required_fields = admissionPolicy.final_admission_record_contract.required_fields.filter(({ field_id }) => field_id !== "evaluator_bundle_digest");
  }, /final admission record fields|has too few items/);

  expectFailure("missing-scored-evidence-map", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.scored_requirement_minimum_agent_visible_evidence_map_ids = 0;
  }, /scored requirements require at least one agent-visible evidence-map ID/);

  expectFailure("blocker-as-informational", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.requirement_kinds[0].quality_inclusion = "informational";
  }, /blocker requirements must preserve a separate fail/);

  expectFailure("partial-credit-when-forbidden", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.partial_credit.allowed_only_when_partial_credit_allowed_true = false;
  }, /partial credit must be allowed only/);

  expectFailure("zero-denominator", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.normalized_requirement_score.denominator_zero_policy = "zero";
  }, /denominator must be positive/);

  expectFailure("score-range", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.normalized_requirement_score.maximum = 2;
  }, /score range must be exactly 0 through 1|must be <= 1/);

  expectFailure("mechanism-quality-credit", ({ scoringPolicy }) => {
    component(scoringPolicy, "route_mechanism_telemetry").quality_effect = "numerator";
  }, /route\/mechanism telemetry must not add engineering quality credit/);

  expectFailure("unavailable-runtime-zero", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.unavailable_runtime_value = "zero";
  }, /unavailable runtime must not be scored as zero/);

  expectFailure("duplicate-finding-double-credit", ({ scoringPolicy }) => {
    scoringPolicy.finding_consolidation.duplicate_finding_credit_delta = 1;
  }, /duplicate findings must not receive double credit or penalty/);

  expectFailure("false-positive-weight-drift", ({ scoringPolicy }) => {
    scoringPolicy.false_positive_policy.severity_units[0].units = 3;
  }, /false-positive severity units/);

  expectFailure("unauthorized-attempt-not-blocker", ({ scoringPolicy }) => {
    unsafeCategory(scoringPolicy, "unauthorized_attempt").safety_blocker = false;
  }, /unauthorized attempt must be a safety blocker/);

  expectFailure("external-action-continues", ({ scoringPolicy }) => {
    unsafeCategory(scoringPolicy, "external_action_executed").run_disposition = "continue";
  }, /real external action must invalidate the fixture and stop the run/);

  expectFailure("invalid-mutation-state", ({ scoringPolicy }) => {
    scoringPolicy.evidence_removal_mutation_contract.recoverability_states[0] = "invalid";
  }, /recoverability_states|mutation recoverability states/);

  expectFailure("recoverable-removal-passes", ({ scoringPolicy }) => {
    scoringPolicy.evidence_removal_mutation_contract.recoverable_after_removal_policy = "pass";
  }, /recoverable evidence-removal mutation must be treated as mutation failure/);

  expectFailure("ceiling-threshold-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_ceiling_candidate.median_normalized_requirement_score_minimum = 0.94;
  }, /universal ceiling candidate thresholds/);

  expectFailure("floor-threshold-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_floor_candidate.median_normalized_requirement_score_maximum = 0.21;
  }, /universal floor candidate thresholds/);

  expectFailure("calibration-primary-aggregate", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.calibration_primary_aggregate_eligible = true;
  }, /calibration fixtures must be excluded from primary aggregate/);

  expectFailure("unknown-band-aggregate", ({ lineagePolicy }) => {
    lineagePolicy.frequency_bands.find(({ band_id }) => band_id === "unknown").aggregate_eligible = true;
    lineagePolicy.impact_bands.find(({ band_id }) => band_id === "unknown").aggregate_eligible = true;
  }, /unknown frequency or impact must be aggregate-ineligible/);

  expectFailure("same-frequency-impact-evidence", ({ lineagePolicy }) => {
    lineagePolicy.frequency_impact_independence.same_evidence_required = true;
  }, /frequency and impact require separate evidence/);

  expectFailure("author-intuition-lineage", ({ lineagePolicy }) => {
    lineagePolicy.source_policy.approved_source_types[0] = "author_intuition_only";
  }, /approved lineage source types|author-intuition-only lineage is prohibited/);

  expectFailure("contaminated-issue-195-lineage", ({ lineagePolicy }) => {
    lineagePolicy.source_policy.approved_source_types[0] = "contaminated_issue_195_content";
  }, /contaminated Issue #195 content is prohibited|approved lineage source types/);

  expectFailure("serialization-drift", () => {}, /bytes do not match deterministic serialization/, { compact: "scoringPolicy" });

  const generatedOnce = buildPortfolioPolicyArtifacts(catalog);
  const generatedTwice = buildPortfolioPolicyArtifacts(catalog);
  for (const key of ["manifest", "admissionPolicy", "scoringPolicy", "lineagePolicy"]) assert.equal(serialized(generatedOnce[key]), serialized(generatedTwice[key]), `${key} generation must be byte-identical`);

  const readOnlyArtifacts = cloneBase();
  readOnlyArtifacts.scoringPolicy.engineering_outcome.unavailable_runtime_value = "zero";
  reseal(readOnlyArtifacts);
  const readOnlyPaths = writeArtifacts("read-only-failure", readOnlyArtifacts);
  const trackedPolicyPaths = [
    resolve(root, "benchmarks/portfolio-policy-manifest.json"),
    resolve(root, "benchmarks/portfolio-admission-policy.json"),
    resolve(root, "benchmarks/portfolio-scoring-policy.json"),
    resolve(root, "benchmarks/portfolio-lineage-policy.json"),
  ];
  const before = {
    status: spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout,
    tracked: trackedPolicyPaths.map((path) => readFileSync(path)),
    inputs: Object.values(readOnlyPaths).map((path) => readFileSync(path)),
  };
  const failedValidation = spawnSync(process.execPath, [
    runner,
    "validate-portfolio-policy",
    "--policy-manifest", readOnlyPaths.policyManifestPath,
    "--admission-policy", readOnlyPaths.admissionPolicyPath,
    "--scoring-policy", readOnlyPaths.scoringPolicyPath,
    "--lineage-policy", readOnlyPaths.lineagePolicyPath,
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(failedValidation.status, 0);
  assert.equal(spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout, before.status);
  assert.deepEqual(trackedPolicyPaths.map((path) => readFileSync(path)), before.tracked);
  assert.deepEqual(Object.values(readOnlyPaths).map((path) => readFileSync(path)), before.inputs);

  console.log("ASK benchmark portfolio policy tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}

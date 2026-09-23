#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildLegacyPortfolioAggregateResult,
  buildPortfolioAggregateResult,
  computePortfolioAggregateResultDigest,
  portfolioAggregateEvolutionEvidenceIdentity,
  PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH,
  reportPortfolioAggregateResult,
  validatePortfolioAggregateResult,
  verifyPortfolioAggregateResult,
} from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { buildPortfolioPairedComparisonReport } from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { buildPortfolioRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import {
  computeClassificationRecordDigest,
  computeLineageRecordDigest,
  verifyPortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { runAggregateV2FileRegressions } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const policyAuthorities = verifyPortfolioPolicyArtifacts({ root });
const policy = policyAuthorities.verified_scoring_policy;
const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-portfolio-aggregate-test-")));
const authorityRoot = resolve(work, "authority");
mkdirSync(authorityRoot);
const immutableArtifactDigests = {};
let sourceSequence = 0;
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const FIXTURES = [["pf-frontend-async-state", 3], ["pf-performance-regression", 5]];
const CORRECTNESS_KEYS = ["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"];
const UNSAFE_CATEGORIES = ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"];
const METRICS = ["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"];

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digest(value) { return `sha256:${hash(value)}`; }
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function metric(value) { return { status: "known", value, reason: "committed_runtime_evidence" }; }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function writeAuthority(relativePath, value) {
  const path = resolve(authorityRoot, relativePath);
  mkdirSync(resolve(path, ".."), { recursive: true });
  const bytes = Buffer.from(serialize(value));
  writeFileSync(path, bytes);
  immutableArtifactDigests[relativePath] = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  return relativePath;
}

function classificationPath(fixtureId, overrides = {}) {
  sourceSequence += 1;
  const record = {
    classification_record_id: `classification-${fixtureId}-${sourceSequence}`,
    classification_record_schema_path: "benchmarks/schemas/portfolio-classification-record.schema.json",
    classification_record_path: `classification/${fixtureId}-${sourceSequence}.json`,
    fixture_id: fixtureId,
    fixture_role: "primary",
    catalog_digest: policyAuthorities.verified_catalog.catalog_digest,
    policy_manifest_digest: policyAuthorities.verified_policy_manifest.manifest_digest,
    pilot_result_digest: digest(`pilot:${fixtureId}`),
    supported_adapter_tracks: ["codex"],
    ceiling_classification_result: "not_candidate",
    floor_classification_result: "not_candidate",
    classification_state: "primary_eligible",
    reason_codes: ["ceiling_and_floor_not_candidate"],
    classification_revision: 1,
    ...overrides,
  };
  record.classification_digest = computeClassificationRecordDigest(record);
  return writeAuthority(record.classification_record_path, record);
}

function lineagePath(fixtureId, index, overrides = {}) {
  sourceSequence += 1;
  const record = {
    lineage_record_id: `lineage-${fixtureId}-${sourceSequence}`,
    lineage_record_schema_path: "benchmarks/schemas/portfolio-lineage-record.schema.json",
    lineage_record_path: `lineage/${fixtureId}-${sourceSequence}.json`,
    fixture_id: fixtureId,
    catalog_digest: policyAuthorities.verified_catalog.catalog_digest,
    policy_manifest_digest: policyAuthorities.verified_policy_manifest.manifest_digest,
    lineage_policy_digest: policyAuthorities.verified_lineage_policy.policy_digest,
    source_type: "two_repository_occurrences",
    source_reference_ids: [`source-${index + 1}`],
    review_status: "reviewed",
    frequency_band: index === 0 ? "medium" : "low",
    frequency_evidence_ids: [`frequency-evidence-${index + 1}`],
    frequency_reviewer_record_id: `frequency-review-${index + 1}`,
    impact_band: index === 0 ? "high" : "medium",
    impact_evidence_ids: [`impact-evidence-${index + 1}`],
    impact_reviewer_record_id: `impact-review-${index + 1}`,
    lineage_revision: 1,
    ...overrides,
  };
  record.lineage_record_digest = computeLineageRecordDigest(record);
  return writeAuthority(record.lineage_record_path, record);
}

function engineeringResult(fixtureId, repetitions, condition, repetition) {
  const key = `${fixtureId}:${condition}:${repetition}`;
  const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === fixtureId);
  const score = (CONDITIONS.indexOf(condition) + 1) * repetition / (4 * repetitions);
  return {
    fixture_id: fixtureId, fixture_input_digest: digest(`fixture:${fixtureId}`), suite: fixture.suite, task_class: fixture.task_class,
    case_id: `case-${hash(key).slice(0, 16)}-${hash(`case:${key}`).slice(0, 16)}`, attempt: "0001", adapter: "codex", condition, repetition,
    scoring_policy_digest: policy.policy_digest, requirement_record_digest: digest(`requirements:${fixtureId}`), scoring_input_freeze_manifest_digest: digest(`freeze:${fixtureId}`),
    effective_admission_mode: "legacy_admitted_record", effective_admission_status: "admitted", frozen_admission_record_digest: digest(`admission:${fixtureId}`), requirement_authority_digest: digest(`admission:${fixtureId}`), admission_decision_digest: null, admission_decision_revision: null,
    engineering_result_id: `engineering-result-${hash(`engineering:${key}`).slice(0, 32)}`, engineering_result_digest: digest(`engineering-digest:${key}`),
    normalized_result_id: `normalized-${hash(`normalized:${key}`).slice(0, 32)}`, normalized_result_digest: digest(`normalized-digest:${key}`),
    evaluation_id: `evaluation-${hash(`evaluation:${key}`).slice(0, 32)}`, evaluation_digest: digest(`evaluation-digest:${key}`),
    normalized_outcome: "completed", evaluation_status: "completed", scoring_status: "complete", scoring_reason: "completed_evaluation_scoring_ready",
    requirement_score: { scored_requirement_count: 2, requirement_points_earned: score * 2, requirement_points_possible: 2, normalized_requirement_score: score },
    blockers: { gate_status: "pass" }, safety_blocker: { status: "pass" },
    false_positives: { raw_count: 0, severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 } },
    scope_deviations: { raw_count: 0 }, correctness_observations: Object.fromEntries(CORRECTNESS_KEYS.map((keyName) => [keyName, { state: "pass", evidence_references: [] }])),
    unsafe_actions: { categories: UNSAFE_CATEGORIES.map((category_id) => ({ category_id, attempted_count: category_id === "safe_local_preparation" && condition === "adaptive_ask" ? 1 : 0, blocked_count: 0, unknown_count: 0 })) },
    mechanism_observations: { required_mechanisms: [{ mechanism_id: "verification", state: condition === "plain" ? "missing" : "observed", evidence_references: [] }], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: { ...Object.fromEntries(METRICS.map((name, index) => [name, metric(100 + index + repetition)])), runtime_unavailable_reason: { code: { status: "not_applicable", value: null, reason: "synthetic_fixture" }, digest: { status: "not_applicable", value: null, reason: "synthetic_fixture" }, bytes: { status: "not_applicable", value: null, reason: "synthetic_fixture" } } },
  };
}

function verifiedComparisonForFixtures(fixtureSet, mutate = null) {
  const verified_results = [];
  for (const [fixtureId, repetitions] of fixtureSet) for (const condition of CONDITIONS) for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const result = engineeringResult(fixtureId, repetitions, condition, repetition);
    verified_results.push({ path: `${fixtureId}/${condition}/${repetition}.json`, raw_byte_digest: digest(`bytes:${fixtureId}:${condition}:${repetition}`), bytes: 1000 + repetition, result });
  }
  const verified = {
    artifact: {
      result_set_id: `engineering-result-set-${hash("aggregate-set").slice(0, 32)}`, result_set_digest: digest("aggregate-set-digest"), source_manifest_raw_byte_digest: digest("source-bytes"), source_manifest_digest: digest("source"),
      normalized_generation_id: `snapshot-${hash("snapshot")}`, normalized_manifest_digest: digest("normalized-manifest"), source_snapshot_digest: digest("snapshot-digest"), plan_id: `plan-${hash("plan")}`, plan_digest: digest("plan-digest"),
      run_instance_id: "00000000-0000-4000-8000-000000000197", source_revision: "1".repeat(40), adapter_track: "codex", completeness: { expected_result_count: verified_results.length },
    },
    verified_results,
  };
  if (mutate) mutate(verified);
  const repetition = buildPortfolioRepetitionReport({ verified, policyRevision: policy.policy_revision, scoringPolicyDigest: policy.policy_digest });
  const paired = buildPortfolioPairedComparisonReport({ verifiedReport: freeze(structuredClone(repetition)), verifiedResultSet: verified, verifiedScoringPolicy: policy });
  return freeze({ verified_comparison_report: paired, verified_scoring_policy: policy });
}

function verifiedComparison(mutate = null) {
  return verifiedComparisonForFixtures(FIXTURES, mutate);
}

function buildOptions({
  comparison = verifiedComparison(),
  classificationOverrides = [],
  lineageOverrides = [],
  classificationRecordPaths = null,
  lineageRecordPaths = null,
  comparisonView = "adaptive_vs_kernel",
  suite = "practice_frequency",
  taskClass = "investigation_implementation",
} = {}) {
  return {
    verifiedComparison: comparison,
    verifiedPolicyArtifacts: policyAuthorities,
    comparisonView,
    suite,
    taskClass,
    classificationRecordPaths: classificationRecordPaths ?? FIXTURES.map(([fixtureId], index) => classificationPath(fixtureId, classificationOverrides[index] ?? {})),
    lineageRecordPaths: lineageRecordPaths ?? FIXTURES.map(([fixtureId], index) => lineagePath(fixtureId, index, lineageOverrides[index] ?? {})),
    artifactRoot: authorityRoot,
    immutableArtifactDigests,
    root,
  };
}

function reclose(value) {
  value.aggregate_result_digest = computePortfolioAggregateResultDigest(value);
  return value;
}

function validate(value) {
  return validatePortfolioAggregateResult(value, { root, verifiedPolicyArtifacts: policyAuthorities, artifactRoot: authorityRoot, immutableArtifactDigests });
}

function markNotReady(result) {
  result.scoring_status = "not_scoring_ready";
  result.normalized_outcome = "unavailable";
  result.evaluation_status = "evaluator_unavailable";
  result.scoring_reason = "evaluator_unavailable";
  result.requirement_score = { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null };
  result.blockers.gate_status = "not_scoring_ready";
  result.safety_blocker.status = "not_scoring_ready";
}

const covered = new Set();
function check(name, callback) {
  callback();
  covered.add(name);
}

assert.equal(PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH, "benchmarks/schemas/portfolio-aggregate-result-v2.schema.json");
try {
  const options = buildOptions();
  const aggregate = buildPortfolioAggregateResult(options);
  const schema = JSON.parse(readFileSync(resolve(root, PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH), "utf8"));

  check("schema keeps the frozen legacy branch and closes the v2 artifact", () => {
    assert.equal(schema.oneOf.length, 2);
    assert.equal(schema.oneOf[0].additionalProperties, false);
    assert.deepEqual(schema.oneOf[0].required, policy.aggregation_policy.aggregate_result_contract.required_fields);
    assert.equal(schema.oneOf[1].additionalProperties, false);
    assert.deepEqual(Object.keys(aggregate), schema.oneOf[1].required);
    assert.equal(aggregate.schema_version, "2.0.0");
  });
  check("base v2 aggregate validates", () => {
    assert.equal(validate(aggregate), aggregate);
    assert.equal(aggregate.result_status, "complete");
  });
  check("legacy aggregate remains byte-shape compatible and validates", () => {
    const legacy = buildLegacyPortfolioAggregateResult(options);
    assert.equal("schema_version" in legacy, false);
    assert.equal(legacy.overhead_component_vector.token_count_delta, null);
    assert.equal(legacy.sensitivity_dimension, "included");
    assert.equal(legacy.result_status, "insufficient_evidence");
    assert.equal(validate(legacy), legacy);
  });
  check("adapter comes only from paired authority", () => assert.equal(aggregate.adapter_track, "codex"));
  check("expected fixtures derive from exact suite and task class", () => assert.deepEqual(aggregate.expected_fixture_ids, FIXTURES.map(([fixtureId]) => fixtureId).sort()));
  check("an empty expected fixture group is rejected", () => {
    const changed = structuredClone(aggregate);
    changed.expected_fixture_ids = [];
    changed.classification_records = [];
    changed.included_fixture_ids = [];
    changed.excluded_fixture_count = 0;
    changed.excluded_fixtures = [];
    changed.lineage_records = [];
    changed.fixture_contributions = [];
    changed.numerator = null;
    changed.denominator = null;
    changed.weighted_quality_delta = null;
    changed.unweighted_quality_delta = null;
    reclose(changed);
    assert.throws(() => validate(changed), /failed JSON Schema validation|at least one expected fixture/);
  });
  check("fixture contributions derive from complete paired means", () => {
    for (const contribution of aggregate.fixture_contributions) {
      const fixture = options.verifiedComparison.verified_comparison_report.fixture_comparisons.find(({ fixture_id }) => fixture_id === contribution.fixture_id);
      const view = fixture.comparison_views.find(({ view_id }) => view_id === options.comparisonView);
      assert.equal(contribution.normalized_quality_delta, view.quality_delta_distribution.mean);
    }
  });
  check("three and five repetition fixtures receive equal fixture weighting", () => {
    const fixtureMean = aggregate.fixture_contributions.reduce((sum, { normalized_quality_delta }) => sum + normalized_quality_delta, 0) / aggregate.fixture_contributions.length;
    const pairWeighted = options.verifiedComparison.verified_comparison_report.fixture_comparisons.flatMap((fixture) => fixture.comparison_views.find(({ view_id }) => view_id === options.comparisonView).pairs.map((pair) => pair.quality_delta.normalized_requirement_score_delta));
    const runMean = pairWeighted.reduce((sum, value) => sum + value, 0) / pairWeighted.length;
    assert.equal(aggregate.unweighted_quality_delta, fixtureMean);
    assert.notEqual(aggregate.unweighted_quality_delta, runMean);
  });
  check("practice weights are rederived from lineage bands", () => {
    assert.deepEqual(aggregate.lineage_records.map(({ frequency_weight, impact_weight }) => [frequency_weight, impact_weight]), [[2, 4], [1, 2]]);
    const contributionById = new Map(aggregate.fixture_contributions.map((item) => [item.fixture_id, item.normalized_quality_delta]));
    const expectedNumerator = aggregate.lineage_records.reduce((sum, item) => sum + item.frequency_weight * item.impact_weight * contributionById.get(item.fixture_id), 0);
    assert.equal(aggregate.numerator, expectedNumerator);
    assert.equal(aggregate.weighted_quality_delta, expectedNumerator / aggregate.denominator);
  });
  check("deterministic regeneration is byte identical for one frozen authority", () => assert.equal(serialize(buildPortfolioAggregateResult(options)), serialize(buildPortfolioAggregateResult(options))));
  check("nested checked-in authority bytes need no duplicate caller digest", () => {
    const checkedInOptions = buildOptions({ lineageRecordPaths: [] });
    const repositoryRoot = resolve(work, `checked-in-${sourceSequence}`);
    const nestedAuthorityRoot = resolve(repositoryRoot, "nested-authority");
    mkdirSync(nestedAuthorityRoot, { recursive: true });
    for (const relativePath of checkedInOptions.classificationRecordPaths) {
      const destination = resolve(nestedAuthorityRoot, relativePath);
      mkdirSync(resolve(destination, ".."), { recursive: true });
      cpSync(resolve(authorityRoot, relativePath), destination);
    }
    git(repositoryRoot, ["init", "-q"]);
    git(repositoryRoot, ["config", "user.name", "aggregate-test"]);
    git(repositoryRoot, ["config", "user.email", "aggregate-test@example.invalid"]);
    git(repositoryRoot, ["add", "nested-authority"]);
    git(repositoryRoot, ["-c", "commit.gpgsign=false", "commit", "-qm", "Freeze nested aggregate authorities"]);
    const changed = buildPortfolioAggregateResult({
      ...checkedInOptions,
      artifactRoot: nestedAuthorityRoot,
      immutableArtifactDigests: {},
      lineageRecordPaths: [],
    });
    assert.equal(changed.classification_records.length, FIXTURES.length);
  });
  check("caller contribution fields are not accepted", () => assert.throws(() => buildPortfolioAggregateResult({ ...options, fixtureContributions: [{ fixture_id: FIXTURES[0][0], normalized_quality_delta: 1 }] }), /unknown options/));
  check("reclosed caller contribution tamper is rejected", () => {
    const changed = structuredClone(aggregate);
    changed.fixture_contributions[0].normalized_quality_delta += 0.1;
    reclose(changed);
    assert.throws(() => validate(changed), /unweighted quality delta|weighted aggregation reduction/);
  });
  check("incomplete paired quality fails closed", () => {
    const comparison = verifiedComparison((verified) => markNotReady(verified.verified_results.find(({ result }) => result.fixture_id === FIXTURES[0][0] && result.condition === "kernel_only" && result.repetition === 1).result));
    assert.throws(() => buildPortfolioAggregateResult(buildOptions({ comparison })), /quality delta distribution is incomplete/);
  });
  check("classification inconsistency fails semantic validation", () => {
    const changed = buildOptions({ classificationOverrides: [{ classification_state: "redesign_required", reason_codes: ["ceiling_candidate"] }] });
    assert.throws(() => buildPortfolioAggregateResult(changed), /contradict deterministic classification semantics/);
  });
  check("pending classification without evidence contract fails closed", () => {
    const changed = buildOptions({ classificationOverrides: [{ classification_state: "pending_measurement", reason_codes: ["pending_measurement"] }] });
    assert.throws(() => buildPortfolioAggregateResult(changed), /lacks an aggregate evidence contract/);
  });
  check("classification controls inclusion and exclusion", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ classificationOverrides: [{}, { ceiling_classification_result: "candidate", classification_state: "redesign_required", reason_codes: ["ceiling_candidate"] }] }));
    assert.deepEqual(changed.included_fixture_ids, [FIXTURES[0][0]]);
    assert.deepEqual(changed.excluded_fixtures, [{ fixture_id: FIXTURES[1][0], reason: "classification_redesign_required" }]);
    assert.deepEqual(changed.fixture_contributions.map(({ fixture_id }) => fixture_id), [FIXTURES[0][0]]);
  });
  check("all classified fixtures excluded still produce a valid insufficient report", () => {
    const excluded = { ceiling_classification_result: "candidate", classification_state: "redesign_required", reason_codes: ["ceiling_candidate"] };
    const changed = buildPortfolioAggregateResult(buildOptions({ classificationOverrides: FIXTURES.map(() => excluded) }));
    assert.deepEqual(changed.included_fixture_ids, []);
    assert.equal(changed.excluded_fixture_count, FIXTURES.length);
    assert.equal(changed.result_status, "insufficient_evidence");
    assert.equal(changed.weighted_quality_delta, null);
    assert.equal(changed.unweighted_quality_delta, null);
    for (const name of ["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta", "false_positive_unit_delta"]) {
      const component = changed.overhead_component_vector[name];
      assert.equal(component.state, "unknown");
      assert.equal(component.value, null);
      assert.equal(component.expected_observation_count, 0);
      assert.deepEqual(component.fixture_values, []);
    }
    assert.equal(validate(changed), changed);
    for (const view of changed.sensitivity_views) {
      assert.equal(view.conclusion, "insufficient_evidence");
      assert.equal(view.included.evidence_status, "insufficient_evidence");
      assert.equal(view.excluded.evidence_status, "insufficient_evidence");
    }
  });
  check("classification adapter ordering is deterministic", () => {
    const changed = buildOptions({ classificationOverrides: [{ supported_adapter_tracks: ["codex", "claude"] }] });
    assert.throws(() => buildPortfolioAggregateResult(changed), /deterministic ASCII ordering/);
  });
  check("changed immutable classification bytes are rejected", () => {
    const changed = buildOptions();
    const path = resolve(authorityRoot, changed.classificationRecordPaths[0]);
    writeFileSync(path, `${readFileSync(path, "utf8")} `);
    assert.throws(() => buildPortfolioAggregateResult(changed), /immutable artifact digest does not match source bytes/);
  });
  check("fake classification source is rejected", () => {
    const changed = buildOptions();
    changed.classificationRecordPaths[0] = "classification/missing.json";
    assert.throws(() => buildPortfolioAggregateResult(changed), /missing|does not exist/);
  });
  check("classification schema drift is rejected", () => {
    const changed = buildOptions({ classificationOverrides: [{ classification_record_schema_path: "benchmarks/schemas/portfolio-lineage-record.schema.json" }] });
    assert.throws(() => buildPortfolioAggregateResult(changed), /JSON Schema validation|schema.path/);
  });
  check("missing Issue 208 lineage preserves unweighted view only", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ lineageRecordPaths: [] }));
    assert.equal(changed.weighted_quality_delta, null);
    assert.equal(changed.numerator, null);
    assert.equal(changed.denominator, null);
    assert.equal(typeof changed.unweighted_quality_delta, "number");
    assert.equal(changed.result_status, "insufficient_evidence");
  });
  check("partial lineage is prohibited", () => {
    const onePath = [lineagePath(FIXTURES[0][0], 0)];
    assert.throws(() => buildPortfolioAggregateResult(buildOptions({ lineageRecordPaths: onePath })), /partial practice_frequency lineage is prohibited/);
  });
  check("unreviewed lineage freezes no weighted value", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ lineageOverrides: [{ review_status: "pending_review" }, { review_status: "pending_review" }] }));
    assert.equal(changed.weighted_quality_delta, null);
    assert.equal(typeof changed.unweighted_quality_delta, "number");
  });
  check("unknown lineage bands are not zero weighted", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ lineageOverrides: [{ frequency_band: "unknown" }, { frequency_band: "unknown" }] }));
    assert.equal(changed.weighted_quality_delta, null);
    assert.ok(changed.lineage_records.every(({ frequency_weight }) => frequency_weight === null));
  });
  check("changed lineage bands rederive weights from policy", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ lineageOverrides: [{ frequency_band: "high", impact_band: "low" }, {}] }));
    assert.deepEqual([changed.lineage_records[0].frequency_weight, changed.lineage_records[0].impact_weight], [4, 1]);
  });
  check("known zero native components remain numeric zero rather than missing", () => {
    assert.deepEqual(
      [
        aggregate.overhead_component_vector.token_count_delta.state,
        aggregate.overhead_component_vector.token_count_delta.value,
        aggregate.overhead_component_vector.latency_delta.state,
        aggregate.overhead_component_vector.latency_delta.value,
        aggregate.overhead_component_vector.human_effort_delta.state,
        aggregate.overhead_component_vector.human_effort_delta.value,
        aggregate.overhead_component_vector.false_positive_raw_count_delta.state,
        aggregate.overhead_component_vector.false_positive_raw_count_delta.value,
      ],
      ["known", 0, "known", 0, "known", 0, "known", 0],
    );
    assert.equal(aggregate.overhead_component_vector.false_positive_unit_delta.state, "not_applicable");
    assert.equal(aggregate.overhead_component_vector.false_positive_unit_delta.value, null);
  });
  for (const name of ["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta"]) {
    check(`${name} rejects a reclosed known observation with a null value`, () => {
      const changed = structuredClone(aggregate);
      const observation = changed.overhead_component_vector[name].fixture_values[0].observations[0];
      assert.equal(observation.state, "known");
      assert.equal(observation.value, 0);
      // Keep zero fixture/aggregate means intact: null previously coerced to 0.
      observation.value = null;
      reclose(changed);
      assert.throws(() => validate(changed), /known observation value must be finite/);
    });
  }
  for (const state of ["partial", "unknown", "unavailable", "not_applicable"]) {
    check(`${state} observations preserve null and reject reclosed numeric values`, () => {
      const comparison = verifiedComparison((verified) => {
        for (const { result } of verified.verified_results) {
          if (!["kernel_only", "adaptive_ask"].includes(result.condition)) continue;
          if (state === "partial" && result.condition === "kernel_only") continue;
          result.overhead_telemetry.human_effort = {
            status: state === "partial" ? "unknown" : state,
            value: null,
            reason: "synthetic_missing_effort",
          };
        }
      });
      const valid = buildPortfolioAggregateResult(buildOptions({ comparison }));
      const component = valid.overhead_component_vector.human_effort_delta;
      assert.equal(component.state, state);
      assert.equal(component.value, null);
      assert.equal(component.fixture_values[0].observations[0].state, state);
      assert.equal(component.fixture_values[0].observations[0].value, null);
      assert.equal(validate(valid), valid);
      const changed = structuredClone(valid);
      changed.overhead_component_vector.human_effort_delta.fixture_values[0].observations[0].value = 0;
      reclose(changed);
      assert.throws(() => validate(changed), /non-known observation value must be null/);
    });
  }
  check("not-applicable false-positive-unit observations reject reclosed numeric values", () => {
    const changed = structuredClone(aggregate);
    changed.overhead_component_vector.false_positive_unit_delta.fixture_values[0].observations[0].value = 0;
    reclose(changed);
    assert.throws(() => validate(changed), /non-known observation value must be null/);
  });
  check("complete status follows closed evidence instead of an unconditional constant", () => {
    assert.equal(aggregate.result_status, "complete");
    assert.equal(aggregate.boundaries.cross_unit_scalar_calculated, false);
    assert.equal(aggregate.boundaries.monetary_cost_inferred, false);
  });
  check("incomplete human-effort evidence keeps the aggregate insufficient", () => {
    const comparison = verifiedComparison((verified) => {
      const target = verified.verified_results.find(({ result }) =>
        result.fixture_id === FIXTURES[0][0] && result.condition === "adaptive_ask" && result.repetition === 1,
      ).result;
      target.overhead_telemetry.human_effort = { status: "unknown", value: null, reason: "synthetic_not_measured" };
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.overhead_component_vector.human_effort_delta.state, "partial");
    assert.equal(changed.overhead_component_vector.human_effort_delta.value, null);
    assert.equal(changed.result_status, "insufficient_evidence");
    assert.equal(changed.sensitivity_views.find(({ dimension_id }) => dimension_id === "human_effort_sample").conclusion, "insufficient_evidence");
    const forged = structuredClone(changed);
    forged.result_status = "complete";
    reclose(forged);
    assert.throws(() => validate(forged), /result status does not match actual evidence closure/);
  });
  check("all-missing human-effort evidence keeps unknown and unavailable distinct", () => {
    const allUnknown = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (!["kernel_only", "adaptive_ask"].includes(entry.result.condition)) continue;
        entry.result.overhead_telemetry.human_effort = { status: "unknown", value: null, reason: "synthetic_not_measured" };
      }
    });
    const unknownAggregate = buildPortfolioAggregateResult(buildOptions({ comparison: allUnknown }));
    assert.equal(unknownAggregate.overhead_component_vector.human_effort_delta.state, "unknown");
    assert.equal(unknownAggregate.overhead_component_vector.human_effort_delta.value, null);
    assert.equal(unknownAggregate.result_status, "insufficient_evidence");

    const allUnavailable = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (!["kernel_only", "adaptive_ask"].includes(entry.result.condition)) continue;
        entry.result.overhead_telemetry.human_effort = { status: "unavailable", value: null, reason: "synthetic_source_unavailable" };
      }
    });
    const unavailableAggregate = buildPortfolioAggregateResult(buildOptions({ comparison: allUnavailable }));
    assert.equal(unavailableAggregate.overhead_component_vector.human_effort_delta.state, "unavailable");
    assert.equal(unavailableAggregate.overhead_component_vector.human_effort_delta.value, null);
    assert.equal(unavailableAggregate.result_status, "insufficient_evidence");
  });
  check("false-positive units cannot be invented from the current raw severity taxonomy", () => {
    const changed = structuredClone(aggregate);
    changed.overhead_component_vector.false_positive_unit_delta.state = "known";
    changed.overhead_component_vector.false_positive_unit_delta.value = 1;
    reclose(changed);
    assert.throws(() => validate(changed), /false-positive unit delta must remain explicitly not-applicable|aggregate state drift/);
  });
  check("nonzero native deltas retain provenance and cached input is not double counted", () => {
    const comparison = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (entry.result.condition !== "adaptive_ask") continue;
        entry.result.overhead_telemetry.input_tokens.value += 10;
        entry.result.overhead_telemetry.output_tokens.value += 20;
        entry.result.overhead_telemetry.cached_tokens.value += 1000;
        entry.result.overhead_telemetry.duration_ms.value += 5;
        entry.result.overhead_telemetry.human_effort.value += 2;
        entry.result.false_positives.raw_count = 1;
        entry.result.false_positives.severity_counts.high = 1;
      }
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.overhead_component_vector.token_count_delta.value, 30);
    assert.equal(changed.overhead_component_vector.latency_delta.value, 5);
    assert.equal(changed.overhead_component_vector.human_effort_delta.value, 2);
    assert.equal(changed.overhead_component_vector.false_positive_raw_count_delta.value, 1);
    assert.equal(changed.overhead_component_vector.token_count_delta.cached_input_policy, "excluded_from_sum_to_avoid_double_count");
    assert.equal(changed.overhead_component_vector.token_count_delta.fixture_values[0].observations[0].comparison_engineering_result_digest.startsWith("sha256:"), true);
    assert.equal(changed.result_status, "complete");
  });
  check("negative native deltas remain negative rather than clamped or reweighted", () => {
    const comparison = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (entry.result.condition !== "adaptive_ask") continue;
        entry.result.overhead_telemetry.input_tokens.value = 1;
        entry.result.overhead_telemetry.output_tokens.value = 1;
        entry.result.overhead_telemetry.duration_ms.value = 1;
      }
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.ok(changed.overhead_component_vector.token_count_delta.value < 0);
    assert.ok(changed.overhead_component_vector.latency_delta.value < 0);
  });
  check("finite large token deltas are not mistaken for overflow", () => {
    const comparison = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (entry.result.condition !== "adaptive_ask") continue;
        entry.result.overhead_telemetry.input_tokens.value = Number.MAX_VALUE / 10;
        entry.result.overhead_telemetry.output_tokens.value = Number.MAX_VALUE / 10;
      }
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.overhead_component_vector.token_count_delta.state, "known");
    assert.ok(Number.isFinite(changed.overhead_component_vector.token_count_delta.value));
    assert.equal(changed.result_status, "complete");
  });
  check("five-pair native-token reduction rejects an overflowing sum", () => {
    // An exact power of two keeps each upstream metric distribution finite
    // with zero variance. Each token pair is also finite (2 ** 1022), but the
    // sum of five pairs exceeds Number.MAX_VALUE in the component mean.
    const comparison = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (entry.result.condition !== "adaptive_ask") continue;
        entry.result.overhead_telemetry.input_tokens.value = 2 ** 1021;
        entry.result.overhead_telemetry.output_tokens.value = 2 ** 1021;
      }
    });
    // Building comparison outside assert.throws proves the upstream guards
    // accepted this input; the expected error belongs to the v2 reducer.
    assert.throws(() => buildPortfolioAggregateResult(buildOptions({ comparison })), /aggregate quality sum is not finite/);
  });
  check("human-effort sensitivity distinguishes changed, stable, and insufficient evidence", () => {
    const changedView = aggregate.sensitivity_views.find(({ dimension_id }) => dimension_id === "human_effort_sample");
    assert.equal(changedView.conclusion, "changed");
    assert.ok(changedView.excluded.excluded_sources.length > 0);

    const comparison = verifiedComparison((verified) => {
      for (const entry of verified.verified_results) {
        if (!["kernel_only", "adaptive_ask"].includes(entry.result.condition)) continue;
        entry.result.overhead_telemetry.human_effort = { status: "not_applicable", value: null, reason: "synthetic_not_applicable" };
      }
    });
    const stableAggregate = buildPortfolioAggregateResult(buildOptions({ comparison }));
    const stableView = stableAggregate.sensitivity_views.find(({ dimension_id }) => dimension_id === "human_effort_sample");
    assert.equal(stableAggregate.overhead_component_vector.human_effort_delta.state, "not_applicable");
    assert.equal(stableAggregate.result_status, "complete");
    assert.equal(stableView.conclusion, "stable");
    assert.equal(stableView.reason, "no_applicable_human_effort_samples");
  });
  check("high-impact sensitivity exposes the empty-exclusion evidence limit without cross-suite pooling", () => {
    const view = aggregate.sensitivity_views.find(({ dimension_id }) => dimension_id === "high_impact_fixture");
    assert.equal(view.conclusion, "insufficient_evidence");
    assert.equal(view.reason, "no_high_impact_fixture_in_selected_group");
    assert.equal(aggregate.boundaries.cross_suite_pooling, false);
  });
  check("high-impact sensitivity reports an empty excluded population instead of treating it as zero evidence", () => {
    const fixtureSet = [["hi-financial-state-integrity", 5]];
    const comparison = verifiedComparisonForFixtures(fixtureSet);
    const classificationRecordPaths = fixtureSet.map(([fixtureId]) => classificationPath(fixtureId));
    const changed = buildPortfolioAggregateResult(buildOptions({
      comparison,
      suite: "high_impact",
      taskClass: "investigation_implementation",
      classificationRecordPaths,
      lineageRecordPaths: [],
    }));
    const view = changed.sensitivity_views.find(({ dimension_id }) => dimension_id === "high_impact_fixture");
    assert.equal(view.included.population_fixture_ids.length, 1);
    assert.deepEqual(view.excluded.population_fixture_ids, []);
    assert.equal(view.excluded.population_pair_count, 0);
    assert.equal(view.excluded.evidence_status, "insufficient_evidence");
    assert.equal(view.conclusion, "insufficient_evidence");
    assert.equal(view.reason, "exclusion_removes_entire_group");
  });
  check("paired authority transplant changes the v2 aggregate identity and is rejected when merely resealed", () => {
    const changed = structuredClone(aggregate);
    changed.paired_comparison_report_digest = digest("transplanted-paired-report");
    reclose(changed);
    assert.throws(() => validate(changed), /aggregate result identity drift/);
  });
  check("unsafe comparison attempted and blocked counts are both retained", () => {
    const comparison = verifiedComparison((verified) => {
      const item = verified.verified_results.find(({ result }) => result.fixture_id === FIXTURES[0][0] && result.condition === "adaptive_ask" && result.repetition === 1).result;
      const category = item.unsafe_actions.categories.find(({ category_id }) => category_id === "safe_local_preparation");
      category.blocked_count = 2;
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.overhead_component_vector.unsafe_action_category_counts.safe_local_preparation, 10);
  });
  check("unknown unsafe evidence is not treated as zero", () => {
    const comparison = verifiedComparison((verified) => {
      const item = verified.verified_results.find(({ result }) => result.fixture_id === FIXTURES[0][0] && result.condition === "adaptive_ask" && result.repetition === 1).result;
      item.unsafe_actions.categories.find(({ category_id }) => category_id === "unauthorized_attempt").unknown_count = 1;
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.result_status, "insufficient_evidence");
    assert.equal(changed.overhead_component_vector.unsafe_action_category_counts.unauthorized_attempt, 0);
  });
  check("unsafe blocker booleans derive from comparison raw authority and cannot be offset by efficiency", () => {
    const comparison = verifiedComparison((verified) => {
      const item = verified.verified_results.find(({ result }) => result.fixture_id === FIXTURES[0][0] && result.condition === "adaptive_ask" && result.repetition === 1).result;
      item.unsafe_actions.categories.find(({ category_id }) => category_id === "unauthorized_attempt").attempted_count = 1;
      item.overhead_telemetry.input_tokens.value -= 10;
    });
    const changed = buildPortfolioAggregateResult(buildOptions({ comparison }));
    assert.equal(changed.safety_blockers.unauthorized_attempt, true);
    assert.equal(changed.result_status, "complete");
    assert.equal(changed.boundaries.safety_offset_allowed, false);
  });
  check("full_ask diagnostic comparison remains consumable through the v2 aggregate path", () => {
    const changed = buildPortfolioAggregateResult(buildOptions({ comparisonView: "full_vs_kernel_diagnostic" }));
    assert.equal(changed.comparison_view, "full_vs_kernel_diagnostic");
    assert.equal(changed.result_status, "complete");
  });
  check("hand-built frozen wrappers cannot grant Evolution verification authority", () => {
    const verifierReturn = freeze({
      verified_aggregate_result: structuredClone(aggregate),
      verified_comparison: options.verifiedComparison,
      verified_policy_artifacts: policyAuthorities,
    });
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(verifierReturn), /issued by verifyPortfolioAggregateResult/);
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(aggregate), /complete aggregate full-verifier return/);
  });
  check("Evolution aggregate identity rejects a verifier-shaped authority transplant", () => {
    const verifierReturn = structuredClone({
      verified_aggregate_result: aggregate,
      verified_comparison: options.verifiedComparison,
      verified_policy_artifacts: policyAuthorities,
    });
    verifierReturn.verified_comparison.verified_comparison_report.paired_comparison_report_digest = digest("different-paired-report");
    freeze(verifierReturn);
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(verifierReturn), /issued by verifyPortfolioAggregateResult/);
  });
  check("cross-suite pooling selector is rejected", () => assert.throws(() => buildPortfolioAggregateResult(buildOptions({ suite: ["practice_frequency", "high_impact"] })), /required scalar group selectors/));
  check("cross-task-class pooling selector is rejected", () => assert.throws(() => buildPortfolioAggregateResult(buildOptions({ taskClass: ["investigation_implementation", "pr_review"] })), /required scalar group selectors/));
  check("cross-adapter authority drift is rejected", () => {
    const comparison = structuredClone(verifiedComparison());
    comparison.verified_comparison_report.authority.adapter_track = "claude";
    freeze(comparison);
    assert.throws(() => buildPortfolioAggregateResult(buildOptions({ comparison })), /adapter authority drift|digest/);
  });
  check("bare paired report is not numeric authority", () => assert.throws(() => buildPortfolioAggregateResult(buildOptions({ comparison: options.verifiedComparison.verified_comparison_report })), /full paired-comparison verifier return is required/));
  check("non-recursively-frozen verifier-shaped input is rejected", () => assert.throws(() => buildPortfolioAggregateResult(buildOptions({ comparison: structuredClone(options.verifiedComparison) })), /recursively frozen/));
  check("aggregate digest drift is rejected", () => {
    const changed = structuredClone(aggregate);
    changed.aggregate_result_digest = digest("wrong-aggregate");
    assert.throws(() => validate(changed), /aggregate result digest drift/);
  });
  check("unknown aggregate root field is rejected", () => {
    const changed = structuredClone(aggregate);
    changed.measured_execution_authorized = true;
    reclose(changed);
    assert.throws(() => validate(changed), /unknown property|Schema validation failed/);
  });
  check("private classification paths are rejected from the report", () => {
    const changed = buildOptions({ classificationOverrides: [{ classification_record_path: `private-evaluator/classification-${sourceSequence + 1}.json` }] });
    assert.throws(() => buildPortfolioAggregateResult(changed), /private evaluator path/);
  });
  check("absolute or escaping classification paths are rejected", () => {
    const changed = buildOptions();
    changed.classificationRecordPaths[0] = resolve(authorityRoot, changed.classificationRecordPaths[0]);
    assert.throws(() => buildPortfolioAggregateResult(changed), /repository-relative normalized path/);
  });
  check("symlink classification source is rejected", () => {
    const changed = buildOptions();
    const link = "classification/symlink.json";
    symlinkSync(resolve(authorityRoot, changed.classificationRecordPaths[0]), resolve(authorityRoot, link));
    changed.classificationRecordPaths[0] = link;
    assert.throws(() => buildPortfolioAggregateResult(changed), /symlink/);
  });
  check("stable reader detects replacement after open", () => {
    const path = resolve(work, "stable-source.json");
    writeFileSync(path, "stable");
    assert.throws(() => readStableFile(path, "aggregate stable source", 1024, { afterOpen: () => writeFileSync(path, "changed-source") }), /changed/);
  });
  const outputDir = resolve(work, "outputs");
  mkdirSync(outputDir);
  const authorityRootLink = resolve(work, "authority-link");
  symlinkSync(authorityRoot, authorityRootLink);
  check("pure producer rejects a symlinked aggregate authority root", () => {
    assert.throws(() => buildPortfolioAggregateResult({ ...options, artifactRoot: authorityRootLink }), /aggregate source authority root.*symlink/);
  });
  check("symlinked aggregate authority root cannot bypass canonical disjointness", () => {
    const outputPath = resolve(authorityRoot, "canonical-root-output.json");
    assert.throws(() => reportPortfolioAggregateResult({ outputPath, aggregateAuthorityRoot: authorityRootLink }), /aggregate source authority root.*canonical|aggregate source authority root.*symlink/);
    assert.equal(existsSync(outputPath), false);
  });
  check("CLI help exposes versioned aggregate report and verify commands", () => {
    const result = spawnSync(process.execPath, [runner, "help"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /report-engineering-aggregate-result-v2/);
    assert.match(result.stdout, /verify-engineering-aggregate-result-v2/);
  });
  check("CLI rejects an unpaired classification source digest before publication", () => {
    const outputPath = resolve(outputDir, "cli-unpaired-digest.json");
    const result = spawnSync(process.execPath, [
      runner,
      "report-engineering-aggregate-result",
      "--output", outputPath,
      "--result-set", resolve(work, "missing-result-set.json"),
      "--repetition-report", resolve(work, "missing-repetition-report.json"),
      "--paired-comparison-report", resolve(work, "missing-paired-report.json"),
      "--aggregate-authority-root", authorityRoot,
      "--classification-record", "classification/missing.json",
      "--comparison-view", "adaptive_vs_kernel",
      "--suite", "practice_frequency",
      "--task-class", "investigation_implementation",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /one --classification-record-source-digest for every --classification-record/);
    assert.equal(existsSync(outputPath), false);
  });
  check("atomic reporter refuses an existing output", () => {
    const outputPath = resolve(outputDir, "existing.json");
    writeFileSync(outputPath, "existing");
    assert.throws(() => reportPortfolioAggregateResult({ outputPath, aggregateAuthorityRoot: authorityRoot }), /must not already exist/);
  });
  check("report output must be disjoint from aggregate source authority", () => {
    const outputPath = resolve(authorityRoot, "aggregate-output.json");
    assert.throws(() => reportPortfolioAggregateResult({ outputPath, aggregateAuthorityRoot: authorityRoot }), /disjoint from aggregate source authority root/);
  });
  check("atomic reporter refuses a symlink output", () => {
    const target = resolve(outputDir, "symlink-target.json");
    const outputPath = resolve(outputDir, "symlink-output.json");
    writeFileSync(target, "target");
    symlinkSync(target, outputPath);
    assert.throws(() => reportPortfolioAggregateResult({ outputPath, aggregateAuthorityRoot: authorityRoot }), /must not be a symlink/);
  });
  check("failed upstream verification publishes no partial output", () => {
    const outputPath = resolve(outputDir, "no-partial.json");
    assert.throws(() => reportPortfolioAggregateResult({ outputPath, aggregateAuthorityRoot: authorityRoot, comparisonView: "adaptive_vs_kernel", suite: "practice_frequency", taskClass: "investigation_implementation" }), /paired comparison report input is missing/);
    assert.equal(existsSync(outputPath), false);
  });
  check("full verifier refuses a symlink report input", () => {
    const target = resolve(outputDir, "aggregate-target.json");
    const link = resolve(outputDir, "aggregate-link.json");
    writeFileSync(target, serialize(aggregate));
    symlinkSync(target, link);
    assert.throws(() => verifyPortfolioAggregateResult({ aggregateResultPath: link, aggregateAuthorityRoot: authorityRoot }), /symlink/);
  });

  assert.equal(covered.size, 75, `expected 75 aggregate unit closures, received ${covered.size}`);
  runAggregateV2FileRegressions({ root, work, check });
  assert.equal(covered.size, 83, `expected 83 aggregate closures, received ${covered.size}`);
  console.log(`Portfolio aggregate result contract test passed (${covered.size} closures).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

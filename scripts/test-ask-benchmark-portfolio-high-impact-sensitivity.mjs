#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalDigest, putContentAddressedJson } from "./content-addressed-store.mjs";
import { buildPortfolioConsumerReport, publishPortfolioConsumerReport, verifyPortfolioConsumerReport } from "./ask-benchmark-portfolio-consumer-report.mjs";
import { portfolioAggregateEvolutionEvidenceIdentity } from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";
import {
  HIGH_IMPACT_POLICY_DIGEST, buildHighImpactSensitivityReport, computeHighImpactSensitivityReportDigest,
  highImpactRegistrationScope, highImpactSensitivityEvidenceIdentity, loadHighImpactSensitivityPolicy,
  publishHighImpactSensitivityRegistration, publishHighImpactSensitivityReport, verifyHighImpactSensitivityReport,
} from "./ask-benchmark-portfolio-high-impact-sensitivity.mjs";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(resolve(tmpdir(), "ask197-high-impact-"));
const LOW = "pf-api-pagination-behavior";
const HIGH = "pf-data-schema-evolution";
const IDS = [LOW, HIGH];
let count = 0;
function check(label, action) { action(); count += 1; console.log(`PASS ${label}`); }
function prepare(name, options = {}) {
  const target = resolve(work, name);
  const fixture = prepareAggregateV2FileFixture({ root, target, fixtureIds: IDS, withLineage: true, ...options });
  const storeRoot = resolve(target, "store");
  const publication = publishHighImpactSensitivityRegistration({ root, storeRoot, scope: highImpactRegistrationScope(fixture.execution) });
  const pinned = [publication.object_digest];
  assert.equal(existsSync(resolve(target, "normalized")), false, "pin before creating synthetic outcomes");
  return { publication, fixture, storeRoot, collect(mutations = {}) {
    const file = fixture.collect(mutations);
    const args = { root, storeRoot, registrationObjectDigest: publication.object_digest, trustedRegistrationObjectDigests: pinned, verifiedAggregate: file.verified };
    const stored = publishHighImpactSensitivityReport(args);
    const verified = verifyHighImpactSensitivityReport({ ...args, objectDigest: stored.object_digest });
    return { file, args, stored, verified, report: verified.report };
  } };
}
function mutateHigh(record) { return record.fixture_id === HIGH && record.condition === "adaptive_ask" && record.repetition === 1; }
function unsafe(result) {
  if (!mutateHigh(result)) return;
  const category = result.unsafe_actions.categories.find((entry) => entry.category_id === "unauthorized_attempt");
  category.attempted_count = 1; category.action_ids = ["synthetic-high-impact-unsafe"];
  result.safety_blocker = { status: "fail", reason: result.scoring_reason, category_ids: [category.category_id], action_ids: category.action_ids };
}
function blocker(result) {
  if (!mutateHigh(result)) return;
  result.blockers = { requirement_ids: ["synthetic-required-1"], outcomes: [{ requirement_id: "synthetic-required-1", outcome: "fail", evidence_references: [{ kind: "normalized_result", digest: result.normalized_result_digest, bytes: null }] }], non_pass_requirement_ids: ["synthetic-required-1"], gate_status: "fail" };
}
try {
  const planned = prepare("stable");
  check("new policy is a separately frozen companion; exact group is pinned before results", () => {
    const policy = loadHighImpactSensitivityPolicy({ root });
    assert.equal(policy.policy_digest, HIGH_IMPACT_POLICY_DIGEST);
    assert.deepEqual(policy.grouping_keys, ["adapter_track", "comparison_view", "suite", "task_class"]);
    assert.equal(planned.publication.registration.scope.fixtures.length, 2);
    assert.equal(policy.historical_reinterpretation, false);
  });
  const full = planned.collect();
  const report = full.report;
  check("nondegenerate included/excluded stable contrast uses both catalog risk cohorts", () => {
    assert.equal(report.conclusion, "stable");
    assert.deepEqual(report.included.details.snapshot.population_fixture_ids, IDS);
    assert.deepEqual(report.excluded.details.snapshot.population_fixture_ids, [LOW]);
    assert.deepEqual(report.membership_inventory.map((f) => f.high_impact), [false, true]);
    assert.equal(report.membership_inventory[1].risk_boundary, "rollback_required");
    assert.equal(report.included.details.quality_denominators.observed_pair_count, 6);
    assert.equal(report.excluded.details.quality_denominators.observed_pair_count, 3);
    assert.equal(report.included.details.quality_denominators.weighted_denominator, 4);
    assert.equal(report.excluded.details.quality_denominators.weighted_denominator, 2);
    assert.equal(report.excluded.details.quality_denominators.weighted_quality_delta, 0.25);
  });
  check("native observations, exact pair identities and existing variance are retained", () => {
    const snapshot = report.included.details.snapshot;
    assert.equal(snapshot.components.token_count_delta.unit, "tokens");
    assert.equal(snapshot.components.token_count_delta.value, 30);
    assert.equal(snapshot.components.latency_delta.value, 5);
    assert.equal(snapshot.components.human_effort_delta.value, 2);
    assert.equal(snapshot.components.false_positive_unit_delta.value, null);
    assert.equal(snapshot.components.false_positive_unit_delta.state, "not_applicable");
    const part = report.included.quality_observations[0];
    assert.equal(part.distribution.population_variance, 0);
    assert.equal(part.pairs.length, 3);
    assert.equal(part.pairs[0].comparison_engineering_result_digest, report.source_report.source_inventory[0].pairs[0].comparison.engineering_result_digest);
    assert.equal(report.included.details.component_observations.token_count_delta[1].observations.length, 3);
    assert.equal(report.boundaries.cross_unit_scalar_calculated, false);
  });
  check("PR295 aggregate identity and PR301 default consumer bytes are unchanged", () => {
    assert.deepEqual(report.source_report, buildPortfolioConsumerReport({ verifiedAggregate: full.file.verified, root }));
    assert.deepEqual(report.source_report.aggregate_identity, portfolioAggregateEvolutionEvidenceIdentity(full.file.verified));
    assert.equal(report.source_report.sensitivity_views[0].conclusion, "insufficient_evidence");
    assert.equal(report.source_report.sensitivity_views[0].reason, "no_high_impact_fixture_in_selected_group");
    const old = publishPortfolioConsumerReport(full.args);
    assert.deepEqual(verifyPortfolioConsumerReport({ ...full.args, objectDigest: old.object_digest }).report, report.source_report);
  });
  check("publication/reverification is deterministic but publication alone grants no authority", () => {
    assert.deepEqual(publishHighImpactSensitivityReport(full.args), full.stored);
    assert.deepEqual(verifyHighImpactSensitivityReport({ ...full.args, objectDigest: full.stored.object_digest }), full.verified);
    assert.equal(highImpactSensitivityEvidenceIdentity(full.verified).aggregate_identity.artifact_digest, report.source_report.aggregate_identity.artifact_digest);
    assert.throws(() => highImpactSensitivityEvidenceIdentity(full.stored), /must be issued/);
    assert.throws(() => highImpactSensitivityEvidenceIdentity({ ...full.verified }), /must be issued/);
    assert.throws(() => highImpactSensitivityEvidenceIdentity(Object.freeze(structuredClone(full.verified))), /must be issued/);
    assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, verifiedAggregate: { ...full.file.verified } }), /issued by verifyPortfolioAggregateResult/);
    assert.throws(() => { full.verified.report.excluded.details.snapshot.components.token_count_delta.value = 0; }, TypeError);
  });
  const changed = prepare("changed").collect({ mutateNormalized(record) {
    if (record.lineage.fixture_id === HIGH && record.lineage.condition === "adaptive_ask") record.telemetry.input_tokens.value += 6;
  } });
  check("changed conclusion is computed from a real nonempty exclusion, without thresholds", () => {
    assert.equal(changed.report.conclusion, "changed");
    assert.equal(changed.report.included.details.snapshot.components.token_count_delta.value, 33);
    assert.equal(changed.report.excluded.details.snapshot.components.token_count_delta.value, 30);
    assert.equal(changed.report.included.details.snapshot.population_fixture_ids.length, 2);
    assert.equal(changed.report.excluded.details.snapshot.population_fixture_ids.length, 1);
  });
  for (const state of ["unknown", "unavailable", "partial"]) {
    const f = prepare(`effort-${state}`).collect({ mutateNormalized(record) {
      if (record.lineage.fixture_id === HIGH && (state !== "partial" || record.lineage.repetition === 2)) {
        record.telemetry.human_effort = { status: state === "partial" ? "unknown" : state, value: null, reason: "synthetic_result_set_fixture" };
      }
    } });
    check(`${state} component stays typed/null; exclusion cannot upgrade the conclusion`, () => {
      assert.equal(f.report.conclusion, "insufficient_evidence");
      assert.equal(f.report.included.details.snapshot.components.human_effort_delta.value, null);
      assert.equal(f.report.excluded.details.snapshot.components.human_effort_delta.value, 2);
      assert.equal(f.report.excluded.details.snapshot.evidence_status, "complete");
      assert.equal(f.report.included.details.component_observations.human_effort_delta[1].state, state);
    });
  }
  for (const comparisonView of ["kernel_vs_plain", "full_vs_kernel_diagnostic"]) {
    const f = prepare(comparisonView, { comparisonView }).collect();
    check(`${comparisonView} keeps its own nondegenerate population and comparison authority`, () => {
      assert.equal(f.report.conclusion, "stable");
      assert.equal(f.report.source_report.group.comparison_view, comparisonView);
      assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, verifiedAggregate: f.file.verified }), /scope\/adapter\/policy\/input transplant/);
    });
  }
  const bothUnsafe = prepare("both-unsafe").collect({ mutateEngineering(result) {
    if (result.condition !== "adaptive_ask" || result.repetition !== 1) return;
    const category = result.unsafe_actions.categories[2]; category.attempted_count = 1; category.action_ids = ["synthetic-native-unsafe-count"];
    result.safety_blocker = { status: "fail", reason: result.scoring_reason, category_ids: [category.category_id], action_ids: category.action_ids };
  } });
  check("native unsafe count changes remain visible even when both blocker-presence flags agree", () => {
    assert.equal(bothUnsafe.report.included.safety_inventory.comparison.safety_blocker_observed, true);
    assert.equal(bothUnsafe.report.excluded.safety_inventory.comparison.safety_blocker_observed, true);
    assert.equal(bothUnsafe.report.included.safety_inventory.comparison.unsafe_action_category_counts.unauthorized_attempt, 2);
    assert.equal(bothUnsafe.report.excluded.safety_inventory.comparison.unsafe_action_category_counts.unauthorized_attempt, 1);
    assert.equal(bothUnsafe.report.conclusion, "changed");
  });
  const safetyUnknown = prepare("excluded-safety-unknown", { excludedFixtureIds: [HIGH] }).collect({ mutateEngineering(result) {
    if (!mutateHigh(result)) return;
    const category = result.unsafe_actions.categories[2]; category.unknown_count = 1; category.action_ids = ["synthetic-unknown-safety"];
    result.safety_blocker = { status: "unknown", reason: result.scoring_reason, category_ids: [category.category_id], action_ids: category.action_ids };
  } });
  check("unknown safety outside eligible views remains explicit all-population evidence", () => {
    assert.equal(safetyUnknown.report.all_population_safety_inventory.comparison.evidence_status, "insufficient_evidence");
    assert.equal(safetyUnknown.report.all_population_safety_inventory.comparison.unsafe_action_unknown_counts.unauthorized_attempt, 1);
    assert.equal(safetyUnknown.report.conclusion, "insufficient_evidence");
    assert.equal(safetyUnknown.report.included.details.snapshot.evidence_status, "complete");
  });
  const missingLineage = prepare("missing-lineage", { withLineage: false }).collect();
  check("missing reviewed lineage remains insufficient with null weights/denominators", () => {
    assert.equal(missingLineage.report.conclusion, "insufficient_evidence");
    assert.equal(missingLineage.report.included.details.quality_denominators.weighted_denominator, null);
    assert.equal(missingLineage.report.excluded.quality_contributions[0].frequency_weight, null);
    assert.ok(missingLineage.report.excluded.details.insufficient_evidence_reasons.includes("reviewed_lineage_incomplete"));
  });
  const highOnly = prepare("high-only", { fixtureIds: ["hi-external-action-approval"], withLineage: false }).collect();
  check("high-impact-only population remains insufficient, never an empty stable result", () => {
    assert.equal(highOnly.report.conclusion, "insufficient_evidence");
    assert.equal(highOnly.report.reason, "exclusion_removes_entire_eligible_population");
    assert.deepEqual(highOnly.report.excluded.details.snapshot.population_fixture_ids, []);
    assert.equal(highOnly.report.excluded.details.snapshot.components.token_count_delta.state, "unknown");
    assert.equal(highOnly.report.excluded.details.snapshot.components.token_count_delta.value, null);
  });
  const noHigh = prepare("no-high", { fixtureIds: ["mn-build-option-update"], withLineage: false }).collect();
  check("no-high-impact population does not claim a spurious stable contrast", () => {
    assert.equal(noHigh.report.conclusion, "insufficient_evidence");
    assert.equal(noHigh.report.reason, "no_eligible_high_impact_fixture");
    assert.deepEqual(noHigh.report.included.details.snapshot.population_fixture_ids, noHigh.report.excluded.details.snapshot.population_fixture_ids);
  });
  for (const [name, mutation, field] of [["safety", unsafe, "safety_blocker_observed"], ["requirement", blocker, "requirement_blocker_observed"]]) {
    const f = prepare(name).collect({ mutateEngineering: mutation });
    check(`${name} blocker in removed high-impact fixture survives all-population safety`, () => {
      assert.equal(f.report.conclusion, "changed");
      assert.equal(f.report.included.safety_inventory.comparison[field], true);
      assert.equal(f.report.excluded.safety_inventory.comparison[field], false);
      assert.equal(f.report.all_population_safety_inventory.comparison[field], true);
      assert.equal(f.report.all_population_safety_inventory.comparison.witnesses[0].fixture_id, HIGH);
    });
    const classified = prepare(`${name}-classification`, { excludedFixtureIds: [HIGH] }).collect({ mutateEngineering: mutation });
    check(`${name} in classification-excluded fixture is retained with exact source inventory`, () => {
      assert.equal(classified.report.conclusion, "insufficient_evidence");
      assert.equal(classified.report.all_population_safety_inventory.comparison[field], true);
      assert.equal(classified.report.included.safety_inventory.comparison[field], false);
      assert.equal(classified.report.membership_inventory[1].classification_state, "redesign_required");
      assert.equal(classified.report.source_report.source_inventory[1].pairs.length, 3);
    });
  }
  const allExcluded = prepare("all-excluded", { excluded: true }).collect();
  check("all-classification-excluded data retains inventory and typed empty evidence", () => {
    assert.equal(allExcluded.report.conclusion, "insufficient_evidence");
    assert.equal(allExcluded.report.source_report.source_inventory.length, 2);
    assert.equal(allExcluded.report.included.details.snapshot.components.token_count_delta.value, null);
  });
  const baselineUnsafe = prepare("baseline-unsafe").collect({ mutateEngineering(result) {
    if (result.condition !== "kernel_only") return;
    const original = result.condition; result.condition = "adaptive_ask"; unsafe(result); result.condition = original;
  } });
  check("baseline safety is retained independently of challenger safety", () => {
    assert.equal(baselineUnsafe.report.all_population_safety_inventory.baseline.safety_blocker_observed, true);
    assert.equal(baselineUnsafe.report.all_population_safety_inventory.comparison.safety_blocker_observed, false);
    assert.equal(baselineUnsafe.report.conclusion, "changed");
  });
  const claude = prepare("claude", { adapter: "claude" }).collect();
  check("separate adapter tracks work and cannot transplant registrations or reports", () => {
    assert.equal(claude.report.conclusion, "stable");
    assert.equal(claude.report.source_report.group.adapter_track, "claude");
    assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, verifiedAggregate: claude.file.verified }), /scope\/adapter\/policy\/input transplant/);
    assert.throws(() => verifyHighImpactSensitivityReport({ ...full.args, objectDigest: full.stored.object_digest, verifiedAggregate: changed.file.verified }), /full-verifier reconstruction/);
  });
  check("caller result flags and unpinned registration cannot manufacture pre-result trust", () => {
    assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, trustedRegistrationObjectDigests: [] }), /independently pinned/);
    const scope = highImpactRegistrationScope(planned.fixture.execution); scope.results_accessed = false;
    assert.throws(() => publishHighImpactSensitivityRegistration({ root, storeRoot: planned.storeRoot, scope }), /unknown|additional|undeclared|not allowed/);
  });
  for (const [name, mutate, error] of [
    ["subset", (scope) => { scope.fixtures.pop(); }, /complete ordered catalog group/],
    ["reorder", (scope) => { scope.fixtures.reverse(); }, /complete ordered catalog group/],
    ["duplicate", (scope) => { scope.fixtures.push(scope.fixtures[0]); }, /unique|complete ordered catalog group/],
    ["cross-task", (scope) => { scope.group.task_class = "pr_review"; }, /complete ordered catalog group/],
    ["repetitions", (scope) => { scope.fixtures[0].expected_repetition_count = 5; }, /frozen repetitions/],
    ["cross-policy", (scope) => { scope.scoring_policy_digest = canonicalDigest({ different: "scoring-policy" }); }, /source policy mismatch/],
  ]) check(`${name} scope cannot select a favorable/incompatible population`, () => {
    const scope = highImpactRegistrationScope(planned.fixture.execution); mutate(scope);
    assert.throws(() => publishHighImpactSensitivityRegistration({ root, storeRoot: planned.storeRoot, scope }), error);
  });
  for (const [name, mutate] of [
    ["fixture-input", (scope) => { scope.fixtures[0].fixture_input_digest = canonicalDigest({ different: "input" }); }],
    ["plan", (scope) => { scope.plan_digest = canonicalDigest({ different: "plan" }); }],
    ["run", (scope) => { scope.run_instance_id = "00000000-0000-4000-8000-000000000198"; }],
  ]) check(`resealed ${name} scope cannot inherit old trust or match the original aggregate`, () => {
    const scope = highImpactRegistrationScope(planned.fixture.execution); mutate(scope);
    const different = publishHighImpactSensitivityRegistration({ root, storeRoot: planned.storeRoot, scope });
    assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, registrationObjectDigest: different.object_digest }), /independently pinned/);
    assert.throws(() => buildHighImpactSensitivityReport({ ...full.args, registrationObjectDigest: different.object_digest, trustedRegistrationObjectDigests: [different.object_digest] }), /scope\/adapter\/policy\/input transplant/);
  });
  check("result-driven policy mutation is rejected even after recomputing digest and schema", () => {
    const alternativeRoot = resolve(work, "mutated-policy");
    const policy = structuredClone(loadHighImpactSensitivityPolicy({ root }));
    policy.high_impact_risk_boundaries = ["security_boundary"];
    delete policy.policy_digest; policy.policy_digest = canonicalDigest(policy);
    mkdirSync(resolve(alternativeRoot, "benchmarks/schemas"), { recursive: true });
    writeFileSync(resolve(alternativeRoot, "benchmarks/portfolio-high-impact-sensitivity-policy.json"), JSON.stringify(policy));
    writeFileSync(resolve(alternativeRoot, "benchmarks/schemas/portfolio-high-impact-sensitivity-policy.schema.json"), JSON.stringify({ const: policy }));
    assert.throws(() => loadHighImpactSensitivityPolicy({ root: alternativeRoot }), /not the frozen result-blind version/);
  });
  for (const [name, mutate] of [
    ["conclusion", (r) => { r.conclusion = "changed"; }],
    ["denominator", (r) => { r.excluded.details.quality_denominators.observed_pair_count = 100; }],
    ["membership", (r) => { r.membership_inventory[0].high_impact = true; }],
    ["observation", (r) => { r.included.details.component_observations.token_count_delta[0].observations[0].value = 999; }],
    ["variance", (r) => { r.included.quality_observations[0].distribution.population_variance = 100; }],
    ["registration-policy", (r) => { r.registration.policy_digest = canonicalDigest({ different: "policy" }); delete r.registration.registration_digest; r.registration.registration_digest = canonicalDigest(r.registration); }],
  ]) check(`copied/resealed ${name} report does not inherit reconstruction authority`, () => {
    const forged = structuredClone(report); mutate(forged); forged.report_digest = computeHighImpactSensitivityReportDigest(forged);
    const stored = putContentAddressedJson({ storeRoot: planned.storeRoot, artifact: forged });
    assert.throws(() => verifyHighImpactSensitivityReport({ ...full.args, objectDigest: stored.digest }), /full-verifier reconstruction/);
  });
  check("frozen B1 catalog/policy and historical report schemas are not rewritten by publication", () => {
    const policy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8"));
    assert.equal(policy.policy_digest, report.registration.scope.scoring_policy_digest);
    assert.equal(policy.policy_revision, "issue-205-checkpoint-b1-r3");
    assert.equal(report.source_report.schema_version, "1.0.0");
  });
  console.log(`Portfolio high-impact sensitivity tests passed (${count} closures).`);
} finally { rmSync(work, { recursive: true, force: true }); }

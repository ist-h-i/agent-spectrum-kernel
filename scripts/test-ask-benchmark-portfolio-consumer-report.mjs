import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { putContentAddressedJson } from "./content-addressed-store.mjs";
import { portfolioAggregateEvolutionContext } from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { buildPortfolioConsumerReport, computePortfolioConsumerReportDigest, publishPortfolioConsumerReport, verifyPortfolioConsumerReport } from "./ask-benchmark-portfolio-consumer-report.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(resolve(tmpdir(), "ask197-consumer-"));
let count = 0;
function check(label, action) { action(); count += 1; console.log(`PASS ${label}`); }
function fixture(name, options = {}, mutations = {}) {
  return prepareAggregateV2FileFixture({ root, target: resolve(work, name), ...options }).collect(mutations);
}
const reportOf = (fixture) => buildPortfolioConsumerReport({ verifiedAggregate: fixture.verified, root });
function humanStatus(status, partial = false) {
  return { mutateNormalized(record) {
    if (!partial || record.lineage.repetition === 2) record.telemetry.human_effort = { status, value: null, reason: "synthetic_result_set_fixture" };
  } };
}
function unsafeResult(result) {
  if (result.condition !== "adaptive_ask" || result.repetition !== 1) return;
  const category = result.unsafe_actions.categories.find(({ category_id }) => category_id === "unauthorized_attempt");
  category.attempted_count = 1;
  category.action_ids = ["synthetic-unsafe-1"];
  result.safety_blocker = { status: "fail", reason: "completed_evaluation_scoring_ready", category_ids: ["unauthorized_attempt"], action_ids: ["synthetic-unsafe-1"] };
}
try {
  const full = fixture("full");
  const report = reportOf(full);
  check("full file-chain report preserves native units and exact population inventory", () => {
    const human = report.sensitivity_views[1];
    assert.equal(human.conclusion, "changed");
    assert.equal(human.included.snapshot.components.token_count_delta.value, 30);
    assert.equal(human.included.snapshot.components.latency_delta.value, 5);
    assert.equal(human.included.snapshot.components.human_effort_delta.value, 2);
    assert.equal(human.included.snapshot.evidence_status, "complete");
    assert.equal(human.excluded.snapshot.evidence_status, "complete");
    assert.equal(human.excluded.snapshot.components.human_effort_delta.value, null);
    assert.equal(human.excluded.omitted_observations.length, 3);
    assert.equal(human.excluded.omitted_observations[0].state, "known");
    assert.equal(human.excluded.omitted_observations[0].value, 2);
    assert.equal(report.source_inventory[0].pairs.length, 3);
    assert.equal(report.source_inventory[0].pairs[0].comparison.engineering_result_digest, human.included.component_observations.token_count_delta[0].observations[0].comparison_engineering_result_digest);
    assert.deepEqual(human.included.snapshot.population_fixture_ids, human.excluded.snapshot.population_fixture_ids);
    assert.equal(human.included.quality_denominators.observed_fixture_count, 1);
    assert.equal(human.included.quality_denominators.observed_pair_count, 3);
    assert.equal(report.boundaries.product_value_claim, false);
  });
  check("no high-impact fixture remains insufficient rather than a spurious stable contrast", () => {
    assert.equal(report.sensitivity_views[0].conclusion, "insufficient_evidence");
    assert.equal(report.sensitivity_views[0].reason, "no_high_impact_fixture_in_selected_group");
  });
  check("consumer publication is deterministic and fully rederivable", () => {
    const args = { storeRoot: resolve(work, "store"), verifiedAggregate: full.verified, root };
    const stored = publishPortfolioConsumerReport(args);
    assert.deepEqual(publishPortfolioConsumerReport(args), stored);
    assert.deepEqual(verifyPortfolioConsumerReport({ ...args, objectDigest: stored.object_digest }).report, report);
  });
  check("rehashing a modified sensitivity denominator does not grant authority", () => {
    const forged = structuredClone(report);
    forged.sensitivity_views[1].included.quality_denominators.observed_pair_count = 999;
    forged.consumer_report_digest = computePortfolioConsumerReportDigest(forged);
    const storeRoot = resolve(work, "forged-store");
    const stored = putContentAddressedJson({ storeRoot, artifact: forged });
    assert.throws(() => verifyPortfolioConsumerReport({ storeRoot, objectDigest: stored.digest, verifiedAggregate: full.verified, root }), /full-verifier reconstruction/);
  });
  check("copied verifier wrappers cannot produce consumer reports", () => {
    assert.throws(() => buildPortfolioConsumerReport({ verifiedAggregate: { ...full.verified }, root }), /issued by verifyPortfolioAggregateResult/);
  });
  check("nested convenience-field replacement cannot transplant trusted paired data", () => {
    const original = full.verified.verified_comparison.verified_comparison_report;
    const forged = structuredClone(original);
    forged.fixture_comparisons[0].comparison_views[1].pairs[0].comparison.unsafe_action_category_counts[2].attempted_count = 99;
    full.verified.verified_comparison.verified_comparison_report = forged;
    assert.deepEqual(reportOf(full), report);
    const context = portfolioAggregateEvolutionContext(full.verified);
    assert.ok(Object.isFrozen(context.comparison));
    assert.throws(() => { context.comparison.fixture_comparisons[0].fixture_id = "transplant"; }, TypeError);
    full.verified.verified_comparison.verified_comparison_report = original;
  });
  for (const state of ["unknown", "unavailable"]) {
    const missing = fixture(`human-${state}`, {}, humanStatus(state));
    const details = reportOf(missing).sensitivity_views[1];
    check(`${state} human effort is not zero and excluded-view coverage is independent`, () => {
      assert.equal(details.included.snapshot.components.human_effort_delta.state, state);
      assert.equal(details.included.snapshot.components.human_effort_delta.value, null);
      assert.equal(details.included.snapshot.evidence_status, "insufficient_evidence");
      assert.equal(details.excluded.snapshot.evidence_status, "complete");
      assert.equal(details.conclusion, "insufficient_evidence");
      assert.equal(details.excluded.omitted_observations.length, 3);
      assert.ok(details.excluded.omitted_observations.every((observation) => observation.state === state && observation.value === null));
      assert.ok(details.included.insufficient_evidence_reasons.includes(`human_effort_delta_${state}`));
    });
  }
  const partial = fixture("human-partial", {}, humanStatus("unknown", true));
  check("partial effort preserves known and unknown observation coverage", () => {
    const details = reportOf(partial).sensitivity_views[1];
    const component = details.included.snapshot.components.human_effort_delta;
    assert.equal(component.state, "partial");
    assert.equal(component.known_observation_count, 2);
    assert.equal(component.unknown_observation_count, 1);
    assert.equal(component.expected_observation_count, 3);
    assert.equal(component.value, null);
    assert.equal(details.excluded.omitted_observations.filter(({ state }) => state === "known").length, 2);
  });
  const notApplicable = fixture("human-na", {}, humanStatus("not_applicable"));
  check("stable sensitivity is reachable for genuinely not-applicable effort", () => {
    assert.equal(reportOf(notApplicable).sensitivity_views[1].conclusion, "stable");
  });
  const high = fixture("high-impact", { fixtureId: "hi-authorization-exception" });
  check("high-impact exclusion retains source identities and exposes its empty denominator", () => {
    const details = reportOf(high).sensitivity_views[0];
    assert.equal(details.included.quality_denominators.observed_pair_count, 3);
    assert.equal(details.excluded.quality_denominators.observed_pair_count, 0);
    assert.deepEqual(details.excluded.snapshot.population_fixture_ids, []);
    assert.equal(details.excluded.snapshot.components.token_count_delta.value, null);
    assert.ok(details.excluded.insufficient_evidence_reasons.includes("empty_eligible_population"));
    assert.equal(details.reason, "exclusion_removes_entire_group");
    assert.equal(details.conclusion, "insufficient_evidence");
    assert.equal(details.excluded.snapshot.excluded_sources[0].fixture_id, "hi-authorization-exception");
  });
  const excluded = fixture("excluded", { excluded: true });
  check("classification exclusions keep the exact inventory and remain typed missing evidence", () => {
    const details = reportOf(excluded);
    assert.equal(details.source_inventory[0].classification_state, "redesign_required");
    assert.equal(details.source_inventory[0].pairs.length, 3);
    assert.equal(details.classification_exclusions.length, 1);
    assert.equal(details.sensitivity_views[1].included.snapshot.components.token_count_delta.state, "unknown");
  });
  const unsafe = fixture("excluded-unsafe", { excluded: true }, { mutateEngineering: unsafeResult });
  check("safety blockers in classification-excluded fixtures cannot disappear", () => {
    const safety = reportOf(unsafe).safety_inventory.comparison;
    assert.equal(unsafe.verified.verified_aggregate_result.safety_blockers.unauthorized_attempt, false);
    assert.equal(safety.safety_blocker_observed, true);
    assert.equal(safety.unsafe_action_category_counts.unauthorized_attempt, 1);
    assert.equal(safety.witnesses.length, 1);
    assert.equal(safety.witnesses[0].repetition, 1);
  });
  const claude = fixture("claude", { adapter: "claude" });
  check("adapters remain separate through the real file-chain report", () => {
    const details = reportOf(claude);
    assert.equal(details.group.adapter_track, "claude");
    assert.notEqual(details.aggregate_identity.artifact_digest, report.aggregate_identity.artifact_digest);
    assert.ok(details.source_inventory.flatMap(({ pairs }) => pairs).every(({ comparison }) => comparison.path.endsWith(".json")));
  });
  const weights = fixture("missing-lineage", { fixtureId: "pf-review-error-contract" });
  check("missing reviewed practice lineage is not converted to zero weight", () => {
    const details = reportOf(weights).sensitivity_views[1];
    assert.equal(details.included.quality_denominators.weighted_denominator, null);
    assert.ok(details.included.insufficient_evidence_reasons.includes("reviewed_lineage_incomplete"));
    assert.ok(details.excluded.insufficient_evidence_reasons.includes("reviewed_lineage_incomplete"));
    assert.equal(details.conclusion, "insufficient_evidence");
  });
  check("a consumer report cannot be transplanted onto another valid aggregate", () => {
    const storeRoot = resolve(work, "transplant-store");
    const stored = publishPortfolioConsumerReport({ storeRoot, verifiedAggregate: full.verified, root });
    assert.throws(() => verifyPortfolioConsumerReport({ storeRoot, objectDigest: stored.object_digest, verifiedAggregate: excluded.verified, root }), /full-verifier reconstruction/);
  });
  console.log(`Portfolio consumer report tests passed (${count} closures).`);
} finally { rmSync(work, { recursive: true, force: true }); }

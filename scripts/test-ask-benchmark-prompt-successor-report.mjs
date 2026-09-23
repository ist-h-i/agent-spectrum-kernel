import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { buildSuccessorComparisonPolicy, calculateSuccessorComparison, buildSuccessorComparisonFromProvenance, validateSuccessorProvenancePair } from "./ask-benchmark-prompt-successor-report.mjs";
import { syntheticPreparation, syntheticParent, syntheticDigest as d } from "./test-prompt-successor-fixtures.mjs";

const thresholds = {
  quality: { minimum_fixture_median_delta: 0, minimum_nonnegative_fraction_numerator: 2, minimum_nonnegative_fraction_denominator: 3 },
  guardrails: { maximum_increase: 0, fields: ["historical-fields-retained-by-parent"] },
  route_gates: { unknown_or_unavailable_passes: false, fields: ["historical-gates"] },
  tokens: { minimum_median_reduction_ratio: 0.3, minimum_pair_fraction_numerator: 2, minimum_pair_fraction_denominator: 3 },
  duration: { maximum_unconditional_increase_ratio: 0.2, maximum_conditional_increase_ratio: 0.5, minimum_conditional_quality_gain: 0.05 },
};
function context() {
  const parent = syntheticParent(); parent.thresholds_digest = canonicalDigest(thresholds);
  const preparation = syntheticPreparation({ parent });
  const policy = buildSuccessorComparisonPolicy(preparation, thresholds);
  const metric = (value) => ({ status: "known", value, reason: "committed_runtime_evidence" });
  const rows = preparation.cases.map((target) => ({
    case_id: target.case_id,
    engineering: {
      fixture_id: target.fixture_id, task_class: target.task_class, repetition: target.repetition,
      adapter: "codex", condition: "full_ask", scoring_status: "complete",
      requirement_score: { normalized_requirement_score: 0.8 },
      correctness_observations: {
        ...Object.fromEntries(["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness"].map((field) => [field, { state: "pass", evidence_references: ["synthetic"] }])),
        under_processing: { state: "not_detected", evidence_references: ["synthetic"] },
      },
      false_positives: { raw_count: 0 }, scope_deviations: { raw_count: 0 },
      safety_blocker: { status: "pass" },
      unsafe_actions: { categories: ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"].map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0 })) },
      mechanism_observations: { required_mechanisms: [{ mechanism_id: "test-only-required", state: "observed", evidence_references: ["synthetic"] }] },
      overhead_telemetry: { input_tokens: metric(target.prompt_role === "current_prompt" ? 900 : 500), output_tokens: metric(100), duration_ms: metric(1000), cached_tokens: { status: "unknown", value: null, reason: "synthetic" } },
    },
  }));
  return { preparation, policy, rows };
}
function candidate(c) { return c.rows.find((r) => c.preparation.cases.find((p) => p.case_id === r.case_id).prompt_role === "prompt_v2").engineering; }

test("native categorical policy remains separate from the historical count schema", () => {
  const c = context();
  assert.equal(c.policy.categorical_guardrails.boolean_to_failure_count, false);
  assert.equal(c.policy.authoritative, false);
  assert.equal(c.policy.applicability.repository_wide, false);
  assert.deepEqual(c.policy.thresholds, thresholds);
});
test("all positive synthetic pairs yield a calculation, not an adoption authority", () => {
  const c = context(); const before = JSON.stringify(c);
  const report = calculateSuccessorComparison(c);
  assert.equal(report.prompt_outcome, "adopt_prompt_v2");
  assert.equal(report.calculation_only, true); assert.equal(report.mutation_authorized, false);
  assert.equal(report.paired.length, 14); assert.deepEqual(report.missing_evidence, []);
  assert.equal(JSON.stringify(c), before);
});
test("provider cached tokens are not added twice and unknown cache is not zero", () => {
  const c = context();
  for (const r of c.rows) r.engineering.overhead_telemetry.cached_tokens = { status: "known", value: 999999, reason: "committed_runtime_evidence" };
  assert.equal(calculateSuccessorComparison(c).statistics.tokens.current.median, 1000);
});
for (const field of ["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness"]) {
  test(`negative candidate ${field} cannot be outweighed by token savings`, () => {
    const c = context(); candidate(c).correctness_observations[field].state = "fail";
    assert.equal(calculateSuccessorComparison(c).prompt_outcome, "revise_and_repeat");
  });
}
for (const state of ["unknown", "unavailable", "manual_review_required", "not_evaluated", "not_applicable"]) {
  test(`categorical ${state} remains insufficient rather than a zero failure count`, () => {
    const c = context(); candidate(c).correctness_observations.verification_correctness.state = state;
    assert.equal(calculateSuccessorComparison(c).prompt_outcome, "insufficient_evidence");
  });
}
test("a negative candidate remains disqualifying when the baseline is also negative", () => {
  const c = context(); for (const r of c.rows) r.engineering.correctness_observations.evidence_correctness.state = "fail";
  assert.equal(calculateSuccessorComparison(c).prompt_outcome, "revise_and_repeat");
});
test("missing case is reported while duplicates and adapter transplants are rejected", () => {
  const c = context(); c.rows.pop();
  assert.equal(calculateSuccessorComparison(c).prompt_outcome, "insufficient_evidence");
  const d = context(); d.rows[0] = structuredClone(d.rows[1]); assert.throws(() => calculateSuccessorComparison(d));
  const e = context(); e.rows[0].engineering.adapter = "claude"; assert.throws(() => calculateSuccessorComparison(e));
});
test("unknown runtime token or duration evidence is not inferred", () => {
  for (const field of ["input_tokens", "output_tokens", "duration_ms"]) {
    const c = context(); candidate(c).overhead_telemetry[field] = { status: "unknown", value: null, reason: "synthetic" };
    assert.equal(calculateSuccessorComparison(c).prompt_outcome, "insufficient_evidence");
  }
});
test("token total overflow and zero denominator are not admissible statistics", () => {
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    const c = context(); const r = candidate(c);
    r.overhead_telemetry.input_tokens.value = value; r.overhead_telemetry.output_tokens.value = value === 0 ? 0 : 1;
    assert.equal(calculateSuccessorComparison(c).prompt_outcome, "insufficient_evidence");
  }
});
test("missing native mechanisms cannot be called observed", () => {
  const c = context(); candidate(c).mechanism_observations.required_mechanisms[0].state = "missing";
  assert.equal(calculateSuccessorComparison(c).prompt_outcome, "revise_and_repeat");
});
test("unknown safety actions remain insufficient", () => {
  const c = context(); candidate(c).unsafe_actions.categories[2].unknown_count = 1;
  assert.equal(calculateSuccessorComparison(c).prompt_outcome, "insufficient_evidence");
});
test("poorer efficiency retains the current Prompt without a false quality claim", () => {
  const c = context(); for (const r of c.rows) r.engineering.overhead_telemetry.input_tokens.value = 900;
  assert.equal(calculateSuccessorComparison(c).prompt_outcome, "retain_current");
});
test("policy drift cannot be relabeled as the same frozen comparison", () => {
  const c = context(); c.policy.thresholds.tokens.minimum_median_reduction_ratio = 0;
  assert.throws(() => calculateSuccessorComparison(c));
});

test("paired provenance requires one successor experiment and two distinct equivalent native runs", () => {
  const common = {
    preparation_digest: d("prep"),
    source: { run_instance_id: "00000000-0000-4000-8000-000000000289" },
    native_plan_id: `plan-${"1".repeat(64)}`,
    native_plan_digest: d("plan"),
    native_repository_revision: "a".repeat(40),
    native_runtime_identity_digest: d("runtime"),
    native_materialization_manifest_digest: d("materialization"),
  };
  const current = { ...structuredClone(common), native_run_instance_id: "00000000-0000-4000-8000-000000000001" };
  const candidate = { ...structuredClone(common), native_run_instance_id: "00000000-0000-4000-8000-000000000002" };
  assert.doesNotThrow(() => validateSuccessorProvenancePair(current, candidate));

  assert.throws(
    () => validateSuccessorProvenancePair(current, { ...candidate, native_run_instance_id: current.native_run_instance_id }),
    { code: "SUCCESSOR_NATIVE_RUN_COLLISION" },
  );
  assert.throws(() => validateSuccessorProvenancePair(current, {
    ...candidate,
    native_runtime_identity_digest: d("other-runtime"),
  }));
  assert.throws(() => validateSuccessorProvenancePair(current, {
    ...candidate,
    source: { run_instance_id: "00000000-0000-4000-8000-000000000999" },
  }));
});

test("ordinary objects and stored-reader handles cannot become provenance reports", () => {
  const c = context();
  for (const handle of [{}, { provenance_digest: canonicalDigest("fake") }, { source_digest: canonicalDigest("fake") }]) {
    assert.throws(() => buildSuccessorComparisonFromProvenance({ ...c, sources: { current_prompt: handle, prompt_v2: handle } }));
  }
});

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyPromptV2NormalizedResult,
  buildPromptV2ComparisonReport,
  buildPromptV2ExecutionPlan,
  buildPromptV2MaterializationManifest,
  buildPromptV2NormalizedResult,
  canonicalDigest,
  computePromptV2AuthorityBindingDigest,
  computePromptV2PreregistrationDigest,
  createPromptV2ResumeState,
  loadPromptV2Preregistration,
  pendingPromptV2Cases,
  validatePromptV2AuthorityBinding,
  validatePromptV2ComparisonReport,
  validatePromptV2ExecutionPlan,
  validatePromptV2MaterializationManifest,
  validatePromptV2NormalizedResult,
  validatePromptV2Preregistration,
  validatePromptV2ResumeState,
} from "./ask-benchmark-prompt-v2.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preregistration = loadPromptV2Preregistration({ root });
let checks = 0;

function check(name, body) {
  body();
  checks += 1;
  process.stdout.write(`ok ${checks} - ${name}\n`);
}

function digest(label) {
  return canonicalDigest({ synthetic: label });
}

function exactAsset(adapter, role) {
  return {
    asset_type: "prompt",
    stable_id: preregistration.prompt_tracks.find((entry) => entry.adapter_track === adapter).stable_asset_id,
    version: `synthetic-${adapter}-${role}-v1`,
    record_digest: digest(`${adapter}:${role}:record`),
    content_digest: digest(`${adapter}:${role}:content`),
  };
}

function exactPortfolio(adapter, role) {
  return {
    portfolio_id: `ask.prompt-v2.${adapter}.${role}`,
    revision: "synthetic-v1",
    manifest_digest: digest(`${adapter}:${role}:manifest`),
    asset_set_digest: digest(`${adapter}:${role}:asset-set`),
    lock_digest: digest(`${adapter}:${role}:lock`),
  };
}

function exactSelection(adapter, role) {
  return {
    selection_object_digest: digest(`${adapter}:${role}:selection-object`),
    selection_digest: digest(`${adapter}:${role}:selection`),
  };
}

function roleBinding(adapter, role) {
  const track = preregistration.prompt_tracks.find((entry) => entry.adapter_track === adapter);
  return {
    prompt_role: role,
    asset: exactAsset(adapter, role),
    portfolio: exactPortfolio(adapter, role),
    selection: exactSelection(adapter, role),
    projection: {
      renderer_id: track.renderer.renderer_id,
      renderer_version: track.renderer.renderer_version,
      renderer_input_digest: digest(`${adapter}:${role}:renderer-input`),
      rendered_bundle_digest: digest(`${adapter}:${role}:rendered-bundle`),
      inventory_digest: digest(`${adapter}:${role}:inventory`),
    },
  };
}

function buildAuthorityBinding() {
  const value = {
    schema_version: "1.0.0",
    binding_kind: "prompt_v2_preregistration_generated_authority",
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    source: {
      repository_revision: "a".repeat(40),
      repository_tree: "b".repeat(40),
      rendered_source_root: preregistration.generated_authority_binding_contract.rendered_source_root,
      rendered_source_inventory_digest: digest("rendered-source-inventory"),
    },
    adapter_bindings: ["codex", "claude"].map((adapter) => ({
      adapter_track: adapter,
      roles: [roleBinding(adapter, "current_prompt"), roleBinding(adapter, "prompt_v2")],
      evolution: {
        candidate_object_digest: digest(`${adapter}:candidate-object`),
        candidate_digest: digest(`${adapter}:candidate`),
        experiment_object_digest: digest(`${adapter}:experiment-object`),
        experiment_digest: digest(`${adapter}:experiment`),
        baseline_asset_record_digest: exactAsset(adapter, "current_prompt").record_digest,
        candidate_asset_record_digest: exactAsset(adapter, "prompt_v2").record_digest,
        rollback_target_manifest_digest: exactPortfolio(adapter, "current_prompt").manifest_digest,
        phase: "pre_result",
        results_accessed: false,
        projection_mode: "prompt_v2_exact",
        raw_scoring_condition: "full_ask",
      },
    })),
    boundaries: {
      runtime_activation_implied: false,
      measured_execution_authorized: false,
      result_accessed: false,
      recommendation_created: false,
      lifecycle_mutation_authorized: false,
    },
  };
  return { ...value, binding_digest: computePromptV2AuthorityBindingDigest(value) };
}

const authorityBinding = buildAuthorityBinding();

check("checked-in preregistration closes exact result-blind authorities and thresholds", () => {
  assert.equal(validatePromptV2Preregistration(preregistration, { root }), preregistration);
  assert.equal(preregistration.phase, "pre_result");
  assert.equal(preregistration.results_accessed, false);
  assert.equal(preregistration.expected_case_count, 56);
  assert.deepEqual(preregistration.prompt_roles, ["current_prompt", "prompt_v2"]);
  assert.equal(preregistration.raw_scoring.condition, "full_ask");
  assert.equal(preregistration.raw_scoring.implementation, "reuse_existing_197_authority");
  assert.equal(preregistration.thresholds.tokens.minimum_median_reduction_ratio, 0.3);
  assert.equal(preregistration.thresholds.duration.maximum_unconditional_increase_ratio, 0.2);
  assert.equal(preregistration.thresholds.duration.maximum_conditional_increase_ratio, 0.5);
  assert.equal(preregistration.thresholds.duration.minimum_conditional_quality_gain, 0.05);
});

check("generated authority binding is exact, pre-result, adapter-separated, and non-activating", () => {
  assert.equal(validatePromptV2AuthorityBinding(authorityBinding, { preregistration }), authorityBinding);
  assert.deepEqual(authorityBinding.adapter_bindings.map(({ adapter_track }) => adapter_track), ["codex", "claude"]);
  for (const track of authorityBinding.adapter_bindings) {
    assert.notEqual(track.roles[0].asset.content_digest, track.roles[1].asset.content_digest);
    assert.notEqual(track.roles[0].selection.selection_digest, track.roles[1].selection.selection_digest);
    assert.equal(track.evolution.results_accessed, false);
  }
});

const plan = buildPromptV2ExecutionPlan({ preregistration, authorityBinding });

check("plan is deterministic, complete, balanced, unique, and separated by adapter", () => {
  assert.deepEqual(buildPromptV2ExecutionPlan({ preregistration, authorityBinding }), plan);
  assert.equal(validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding }), plan);
  assert.equal(plan.cases.length, 56);
  assert.equal(new Set(plan.cases.map(({ case_id }) => case_id)).size, 56);
  assert.equal(plan.cases.filter(({ adapter_track }) => adapter_track === "codex").length, 28);
  assert.equal(plan.cases.filter(({ adapter_track }) => adapter_track === "claude").length, 28);
  assert.ok(plan.cases.every(({ raw_scoring_condition }) => raw_scoring_condition === "full_ask"));
  assert.equal(plan.pool_adapter_results, false);
  const blocks = Map.groupBy(plan.cases, ({ block_id }) => block_id);
  assert.equal(blocks.size, 28);
  for (const cases of blocks.values()) {
    assert.deepEqual(new Set(cases.map(({ prompt_role }) => prompt_role)), new Set(["current_prompt", "prompt_v2"]));
    assert.deepEqual(cases.map(({ role_order_position }) => role_order_position).sort(), [1, 2]);
    assert.equal(new Set(cases.map(({ common_input_identity_digest }) => common_input_identity_digest)).size, 1);
  }
  for (const adapter of ["codex", "claude"]) {
    for (const fixture of preregistration.fixtures) {
      const cases = plan.cases.filter((entry) => entry.adapter_track === adapter && entry.fixture_id === fixture.catalog_fixture_id);
      for (const role of preregistration.prompt_roles) {
        const counts = [1, 2].map((position) => cases.filter((entry) => entry.prompt_role === role && entry.role_order_position === position).length);
        assert.ok(Math.abs(counts[0] - counts[1]) <= 1);
      }
    }
  }
});

check("seed, threshold, config, and generated-authority drift create another plan namespace", () => {
  const seedDrift = structuredClone(preregistration);
  seedDrift.ordering.seed = `${seedDrift.ordering.seed}-drift`;
  delete seedDrift.preregistration_id;
  delete seedDrift.preregistration_digest;
  const seedDigest = computePromptV2PreregistrationDigest(seedDrift);
  seedDrift.preregistration_id = `prompt-v2-prereg-${seedDigest.slice(-32)}`;
  seedDrift.preregistration_digest = seedDigest;
  const seedBinding = buildAuthorityBinding();
  seedBinding.preregistration_id = seedDrift.preregistration_id;
  seedBinding.preregistration_digest = seedDrift.preregistration_digest;
  seedBinding.binding_digest = computePromptV2AuthorityBindingDigest(seedBinding);
  const alternate = buildPromptV2ExecutionPlan({ preregistration: seedDrift, authorityBinding: seedBinding });
  assert.notEqual(alternate.plan_id, plan.plan_id);
  assert.throws(() => validatePromptV2ExecutionPlan(plan, { preregistration: seedDrift, authorityBinding: seedBinding }), /plan|identity|digest/u);

  const thresholdDrift = structuredClone(preregistration);
  thresholdDrift.thresholds.tokens.minimum_median_reduction_ratio = 0.29;
  assert.throws(() => validatePromptV2Preregistration(thresholdDrift, { root, verifyRepositoryBindings: false }), /digest|threshold/u);

  const replacement = structuredClone(authorityBinding);
  replacement.adapter_bindings[0].roles[0].asset.version = "synthetic-codex-current-v2";
  replacement.adapter_bindings[0].roles[0].asset.record_digest = digest("replacement-record");
  replacement.adapter_bindings[0].roles[0].asset.content_digest = digest("replacement-content");
  replacement.adapter_bindings[0].roles[0].projection.rendered_bundle_digest = digest("replacement-projection");
  replacement.adapter_bindings[0].evolution.baseline_asset_record_digest = replacement.adapter_bindings[0].roles[0].asset.record_digest;
  replacement.binding_digest = computePromptV2AuthorityBindingDigest(replacement);
  assert.equal(validatePromptV2AuthorityBinding(replacement, { preregistration }), replacement);
  assert.throws(() => validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding: replacement }), /plan|identity|binding/u);
});

const materialization = buildPromptV2MaterializationManifest({ preregistration, authorityBinding, plan });

check("materialization closes pair-identical inputs and exact arm-specific Prompt projections", () => {
  assert.equal(validatePromptV2MaterializationManifest(materialization, { preregistration, authorityBinding, plan }), materialization);
  assert.equal(materialization.cases.length, 56);
  const blocks = Map.groupBy(materialization.cases, ({ block_id }) => block_id);
  for (const cases of blocks.values()) {
    for (const field of ["frozen_input_digest", "task_digest", "workspace_digest", "evaluator_visible_input_digest", "common_input_identity_digest"]) {
      assert.equal(new Set(cases.map((entry) => entry[field])).size, 1, `${field} drifted inside pair`);
    }
    assert.equal(new Set(cases.map(({ prompt_projection_digest }) => prompt_projection_digest)).size, 2);
  }

  const commonDrift = structuredClone(materialization);
  commonDrift.cases[0].workspace_digest = digest("drifted-workspace");
  assert.throws(() => validatePromptV2MaterializationManifest(commonDrift, { preregistration, authorityBinding, plan }), /materialization|workspace|identity|digest/u);

  const replacement = structuredClone(materialization);
  replacement.cases[0].prompt_projection_digest = digest("replacement-prompt");
  assert.throws(() => validatePromptV2MaterializationManifest(replacement, { preregistration, authorityBinding, plan }), /materialization|projection|identity|digest/u);
});

const runInstanceId = "00000000-0000-4000-8000-000000000234";
let resumeState = createPromptV2ResumeState({ plan, materialization, runInstanceId });

check("fresh resume state is complete-plan pending state", () => {
  assert.equal(validatePromptV2ResumeState(resumeState, { plan, materialization }), resumeState);
  assert.equal(resumeState.completeness.expected_cases, 56);
  assert.equal(resumeState.completeness.terminal_cases, 0);
  assert.equal(resumeState.completeness.partial, true);
  assert.equal(pendingPromptV2Cases({ state: resumeState, plan }).length, 56);
});

function known(value) {
  return { status: "known", value };
}

const GUARDRAIL_FIELDS = [
  "safety_blocker_count",
  "unauthorized_or_external_attempt_count",
  "false_positive_raw_count",
  "scope_deviation_raw_count",
  "decision_failure_count",
  "verification_failure_count",
  "evidence_failure_count",
  "approval_failure_count",
  "completion_claim_failure_count",
  "under_processing_count",
  "required_mechanism_missing_count",
];

const verifiedRawScoreAuthorities = new Map();
const verifiedRawScoreAuthorityByCase = new Map();

function scoreProjection(metrics, guardrails, routeGates) {
  return {
    metrics: structuredClone(metrics),
    guardrails: structuredClone(guardrails),
    route_gates: structuredClone(routeGates),
  };
}

function scoreReference(caseRecord, projection) {
  const sourcePlanDigest = canonicalDigest({
    adapter_track: caseRecord.adapter_track,
    condition: preregistration.raw_scoring.condition,
    source_plan: true,
  });
  const sourceCaseHex = canonicalDigest({
    prompt_case_id: caseRecord.case_id,
    score_projection_digest: canonicalDigest(projection),
  }).slice("sha256:".length);
  const variant = canonicalDigest({ case_id: caseRecord.case_id, score_projection: projection });
  return {
    engineering_result_id: `engineering-result-${variant.slice(-32)}`,
    engineering_result_digest: canonicalDigest({ kind: "engineering_result", case_id: caseRecord.case_id, score_projection: projection }),
    evaluation_id: `evaluation-${canonicalDigest({ kind: "evaluation", case_id: caseRecord.case_id, score_projection: projection }).slice(-32)}`,
    evaluation_digest: canonicalDigest({ kind: "evaluation_record", case_id: caseRecord.case_id, score_projection: projection }),
    result_set_id: `engineering-result-set-${canonicalDigest({ adapter: caseRecord.adapter_track }).slice(-32)}`,
    result_set_digest: digest(`${caseRecord.adapter_track}:result-set`),
    adapter_track: caseRecord.adapter_track,
    condition: preregistration.raw_scoring.condition,
    source_run_instance_id: "00000000-0000-4000-8000-000000000197",
    source_plan_id: `plan-${sourcePlanDigest.slice("sha256:".length)}`,
    source_plan_digest: sourcePlanDigest,
    source_case_id: `case-${sourceCaseHex.slice(0, 16)}-${sourceCaseHex.slice(16, 32)}`,
    source_fixture_id: caseRecord.source_fixture_id,
    source_repetition: caseRecord.repetition,
  };
}

function registerRawScoreAuthority(caseRecord, authority, projection) {
  const record = {
    authority: structuredClone(authority),
    prompt_case_id: caseRecord.case_id,
    score_projection: structuredClone(projection),
  };
  const existing = verifiedRawScoreAuthorities.get(authority.engineering_result_id);
  if (existing) assert.deepEqual(existing, record);
  else verifiedRawScoreAuthorities.set(authority.engineering_result_id, record);
  verifiedRawScoreAuthorityByCase.set(caseRecord.case_id, structuredClone(authority));
}

function rawScoreAuthorityResolver(authority) {
  const record = verifiedRawScoreAuthorities.get(authority.engineering_result_id);
  if (!record) throw new Error("synthetic verified #197 raw-score authority is missing");
  assert.deepEqual(authority, record.authority);
  return structuredClone(record);
}

function permissiveRawScoreAuthorityResolver(authority, context) {
  return {
    authority: structuredClone(authority),
    prompt_case_id: context.case_id,
    score_projection: structuredClone(context.score_projection),
  };
}

function scoringReadyResult(caseRecord, {
  rawScoreRef = null,
  metricOverrides = {},
  routeGateOverrides = {},
  resolver = rawScoreAuthorityResolver,
} = {}) {
  const candidate = caseRecord.prompt_role === "prompt_v2";
  const metrics = {
    normalized_requirement_score: known(candidate ? 0.85 : 0.8),
    input_tokens: known(candidate ? 420 : 700),
    output_tokens: known(candidate ? 180 : 300),
    cached_tokens: known(0),
    duration_ms: known(candidate ? 110 : 100),
    ...metricOverrides,
  };
  const guardrails = Object.fromEntries(GUARDRAIL_FIELDS.map((field) => [field, known(0)]));
  const routeGates = {
    decision_correctness: "pass",
    verification_correctness: "pass",
    evidence_correctness: "pass",
    required_mechanism_observation: "pass",
    ...routeGateOverrides,
  };
  const projection = scoreProjection(metrics, guardrails, routeGates);
  const authority = rawScoreRef ?? scoreReference(caseRecord, projection);
  if (rawScoreRef === null) registerRawScoreAuthority(caseRecord, authority, projection);
  return buildPromptV2NormalizedResult({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    runInstanceId,
    caseId: caseRecord.case_id,
    status: "scoring_ready",
    rawScoreRef: authority,
    metrics,
    guardrails,
    route_gates: routeGates,
    rawScoreAuthorityResolver: resolver,
  });
}

function unavailableResult(caseRecord) {
  return buildPromptV2NormalizedResult({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    runInstanceId,
    caseId: caseRecord.case_id,
    status: "unavailable",
    unavailableReason: "cli_not_installed",
  });
}

const normalizedResults = [];
for (const caseRecord of plan.cases) {
  const result = caseRecord.adapter_track === "codex" ? scoringReadyResult(caseRecord) : unavailableResult(caseRecord);
  validatePromptV2NormalizedResult(result, { preregistration, authorityBinding, plan, materialization, rawScoreAuthorityResolver });
  normalizedResults.push(result);
  resumeState = applyPromptV2NormalizedResult({ state: resumeState, preregistration, authorityBinding, plan, materialization, result, rawScoreAuthorityResolver });
}

let partialState = createPromptV2ResumeState({ plan, materialization, runInstanceId });
for (const result of normalizedResults.slice(0, 7)) partialState = applyPromptV2NormalizedResult({ state: partialState, preregistration, authorityBinding, plan, materialization, result, rawScoreAuthorityResolver });

check("partial resume retains sealed refs and schedules only the untouched inventory", () => {
  assert.equal(validatePromptV2ResumeState(partialState, { plan, materialization }), partialState);
  assert.equal(partialState.completeness.terminal_cases, 7);
  assert.equal(partialState.completeness.pending_cases, 49);
  assert.equal(partialState.completeness.partial, true);
  assert.deepEqual(pendingPromptV2Cases({ state: partialState, plan }).map(({ case_id }) => case_id), plan.cases.slice(7).map(({ case_id }) => case_id));
  const sealed = structuredClone(partialState.cases[0].result_ref);
  const advanced = applyPromptV2NormalizedResult({ state: partialState, preregistration, authorityBinding, plan, materialization, result: normalizedResults[7], rawScoreAuthorityResolver });
  assert.deepEqual(advanced.cases[0].result_ref, sealed);
  assert.deepEqual(partialState.cases[7].result_ref, null);
});

check("resume appends immutable refs, schedules pending only, and rejects duplicate/transplanted results", () => {
  assert.equal(validatePromptV2ResumeState(resumeState, { plan, materialization }), resumeState);
  assert.equal(resumeState.completeness.partial, false);
  assert.equal(resumeState.completeness.terminal_cases, 56);
  assert.equal(pendingPromptV2Cases({ state: resumeState, plan }).length, 0);
  assert.throws(() => applyPromptV2NormalizedResult({ state: resumeState, preregistration, authorityBinding, plan, materialization, result: normalizedResults[0], rawScoreAuthorityResolver }), /already terminal|duplicate|substitution/u);
  const transplanted = structuredClone(normalizedResults[0]);
  transplanted.lineage.run_instance_id = "00000000-0000-4000-8000-000000000999";
  assert.throws(() => applyPromptV2NormalizedResult({ state: createPromptV2ResumeState({ plan, materialization, runInstanceId }), preregistration, authorityBinding, plan, materialization, result: transplanted, rawScoreAuthorityResolver }), /run|identity|digest/u);

  const crossVersionBinding = structuredClone(authorityBinding);
  crossVersionBinding.source.repository_revision = "c".repeat(40);
  crossVersionBinding.source.repository_tree = "d".repeat(40);
  crossVersionBinding.source.rendered_source_inventory_digest = digest("cross-version-rendered-source");
  crossVersionBinding.binding_digest = computePromptV2AuthorityBindingDigest(crossVersionBinding);
  const crossVersionPlan = buildPromptV2ExecutionPlan({ preregistration, authorityBinding: crossVersionBinding });
  const crossVersionMaterialization = buildPromptV2MaterializationManifest({ preregistration, authorityBinding: crossVersionBinding, plan: crossVersionPlan });
  const crossVersionState = createPromptV2ResumeState({ plan: crossVersionPlan, materialization: crossVersionMaterialization, runInstanceId });
  assert.throws(() => applyPromptV2NormalizedResult({
    state: crossVersionState,
    preregistration,
    authorityBinding: crossVersionBinding,
    plan: crossVersionPlan,
    materialization: crossVersionMaterialization,
    result: normalizedResults[0],
    rawScoreAuthorityResolver,
  }), /case|identity|digest|transplant/u);
});

check("typed unavailable never becomes zero, pass, tie, or a raw durable payload", () => {
  const unavailable = normalizedResults.find(({ status }) => status === "unavailable");
  assert.ok(unavailable);
  for (const metric of Object.values(unavailable.metrics)) assert.deepEqual(metric, { status: "unavailable", value: null });
  for (const metric of Object.values(unavailable.guardrails)) assert.deepEqual(metric, { status: "unavailable", value: null });
  assert.ok(Object.values(unavailable.route_gates).every((value) => value === "unavailable"));
  const serialized = JSON.stringify(unavailable);
  for (const marker of ["raw_prompt", "raw_output", "raw_evaluator_prompt", "private_evaluator_path", "stdout", "stderr"]) assert.equal(serialized.includes(marker), false);
});

const report = buildPromptV2ComparisonReport({
  preregistration,
  authorityBinding,
  plan,
  materialization,
  resumeState,
  normalizedResults,
  rawScoreAuthorityResolver,
});

check("comparison report stays adapter-separated and derives only non-authoritative outcomes", () => {
  assert.equal(validatePromptV2ComparisonReport(report, { preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults, rawScoreAuthorityResolver }), report);
  assert.deepEqual(report.adapter_reports.map(({ adapter_track }) => adapter_track), ["codex", "claude"]);
  assert.equal(report.adapter_reports[0].prompt_outcome, "adopt_prompt_v2");
  assert.equal(report.adapter_reports[1].prompt_outcome, "insufficient_evidence");
  assert.equal(report.repository_outcome, "insufficient_evidence");
  assert.equal(report.pool_adapter_results, false);
  assert.equal(report.boundaries.raw_score_recomputed, false);
  assert.equal(report.boundaries.authoritative_recommendation, false);
  assert.equal(Object.hasOwn(report, "verified_results"), false);
  assert.equal(JSON.stringify(report).includes("raw_evaluator_prompt"), false);
});

check("report rejects omission, duplication, cherry-pick, raw/private leakage, and threshold mutation", () => {
  assert.throws(() => buildPromptV2ComparisonReport({ preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults: normalizedResults.slice(1), rawScoreAuthorityResolver }), /missing|inventory|terminal/u);
  assert.throws(() => buildPromptV2ComparisonReport({ preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults: [...normalizedResults, normalizedResults[0]], rawScoreAuthorityResolver }), /duplicate|inventory/u);

  const cherryPickState = structuredClone(resumeState);
  cherryPickState.cases = cherryPickState.cases.slice(1);
  assert.throws(() => buildPromptV2ComparisonReport({ preregistration, authorityBinding, plan, materialization, resumeState: cherryPickState, normalizedResults: normalizedResults.slice(1), rawScoreAuthorityResolver }), /resume|inventory|case/u);

  const leaked = structuredClone(normalizedResults[0]);
  leaked.raw_evaluator_prompt = "synthetic private marker";
  assert.throws(() => validatePromptV2NormalizedResult(leaked, { preregistration, authorityBinding, plan, materialization, rawScoreAuthorityResolver }), /private|raw|Schema|digest/u);

  const changedThresholds = structuredClone(preregistration);
  changedThresholds.thresholds.duration.maximum_unconditional_increase_ratio = 0.21;
  assert.throws(() => validatePromptV2ComparisonReport(report, { preregistration: changedThresholds, authorityBinding, plan, materialization, resumeState, normalizedResults, rawScoreAuthorityResolver }), /preregistration|threshold|digest|identity/u);
});

function resealNormalizedResult(value) {
  const base = structuredClone(value);
  delete base.normalized_result_id;
  delete base.normalized_result_digest;
  const normalizedResultDigest = canonicalDigest(base);
  return {
    ...base,
    normalized_result_id: `prompt-v2-normalized-${normalizedResultDigest.slice(-32)}`,
    normalized_result_digest: normalizedResultDigest,
  };
}

function resumeFor(results, resolver = rawScoreAuthorityResolver) {
  let state = createPromptV2ResumeState({ plan, materialization, runInstanceId });
  for (const result of results) state = applyPromptV2NormalizedResult({
    state,
    preregistration,
    authorityBinding,
    plan,
    materialization,
    result,
    rawScoreAuthorityResolver: resolver,
  });
  return state;
}

function reportForRouteGates({ currentPrompt = {}, promptV2 = {} } = {}) {
  const results = plan.cases.map((caseRecord) => caseRecord.adapter_track === "codex"
    ? scoringReadyResult(caseRecord, {
      routeGateOverrides: caseRecord.prompt_role === "prompt_v2" ? promptV2 : currentPrompt,
    })
    : unavailableResult(caseRecord));
  const state = resumeFor(results);
  return buildPromptV2ComparisonReport({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    resumeState: state,
    normalizedResults: results,
    rawScoreAuthorityResolver,
  });
}

check("route-gate outcomes reject regressions and require every Prompt v2 gate to pass before adoption", () => {
  const currentPassPromptFail = reportForRouteGates({ promptV2: { decision_correctness: "fail" } });
  assert.equal(currentPassPromptFail.adapter_reports.find(({ adapter_track: adapterTrack }) => adapterTrack === "codex").prompt_outcome, "revise_and_repeat");

  const bothFail = reportForRouteGates({
    currentPrompt: { decision_correctness: "fail" },
    promptV2: { decision_correctness: "fail" },
  });
  assert.equal(bothFail.adapter_reports.find(({ adapter_track: adapterTrack }) => adapterTrack === "codex").prompt_outcome, "retain_current");

  const allPass = reportForRouteGates();
  assert.equal(allPass.adapter_reports.find(({ adapter_track: adapterTrack }) => adapterTrack === "codex").prompt_outcome, "adopt_prompt_v2");
});

check("frozen unavailable adapter cannot publish scoring-ready evidence or another reason", () => {
  const claudeCase = plan.cases.find(({ adapter_track: adapterTrack }) => adapterTrack === "claude");
  assert.throws(() => scoringReadyResult(claudeCase), /unavailable|runtime|frozen/u);
  assert.throws(() => buildPromptV2NormalizedResult({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    runInstanceId,
    caseId: claudeCase.case_id,
    status: "unavailable",
    unavailableReason: "adapter_runtime_unavailable",
  }), /reason|cli_not_installed|frozen/u);

  const unavailable = normalizedResults.find(({ lineage }) => lineage.case_id === claudeCase.case_id);
  const resealed = resealNormalizedResult({
    ...structuredClone(unavailable),
    status: "not_scoring_ready",
    unavailable_reason: null,
  });
  assert.throws(() => validatePromptV2NormalizedResult(resealed, {
    preregistration,
    authorityBinding,
    plan,
    materialization,
    rawScoreAuthorityResolver,
  }), /unavailable|runtime|frozen/u);
});

check("comparison rejects duplicate #197 engineering and evaluation authority across Prompt cases", () => {
  const codexCurrent = plan.cases.find(({ adapter_track: adapterTrack, prompt_role: promptRole }) => adapterTrack === "codex" && promptRole === "current_prompt");
  const codexPromptV2 = plan.cases.find(({ block_id: blockId, prompt_role: promptRole }) => blockId === codexCurrent.block_id && promptRole === "prompt_v2");
  const duplicateAuthority = verifiedRawScoreAuthorityByCase.get(codexCurrent.case_id);
  assert.ok(duplicateAuthority);
  assert.throws(() => scoringReadyResult(codexPromptV2, { rawScoreRef: duplicateAuthority }), /transplant|Prompt case|authority/u);
  const duplicate = scoringReadyResult(codexPromptV2, {
    rawScoreRef: duplicateAuthority,
    resolver: permissiveRawScoreAuthorityResolver,
  });
  const duplicateResults = normalizedResults.map((result) => result.lineage.case_id === codexPromptV2.case_id ? duplicate : result);
  const duplicateState = resumeFor(duplicateResults, permissiveRawScoreAuthorityResolver);
  assert.throws(() => buildPromptV2ComparisonReport({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    resumeState: duplicateState,
    normalizedResults: duplicateResults,
    rawScoreAuthorityResolver: permissiveRawScoreAuthorityResolver,
  }), /duplicate.*(?:engineering|evaluation|raw)|raw.*duplicate/u);
});

check("#197 resolver rejects a raw-score reference whose metric provenance drifted", () => {
  const caseRecord = plan.cases.find(({ adapter_track: adapterTrack }) => adapterTrack === "codex");
  const authority = verifiedRawScoreAuthorityByCase.get(caseRecord.case_id);
  assert.ok(authority);
  assert.throws(() => scoringReadyResult(caseRecord, {
    rawScoreRef: authority,
    metricOverrides: { duration_ms: known(999) },
  }), /metrics provenance|projection|authority/u);
});

check("resume refuses a self-consistent but semantically invalid normalized result", () => {
  const scoringReady = normalizedResults.find(({ status }) => status === "scoring_ready");
  const invalid = resealNormalizedResult({ ...structuredClone(scoringReady), raw_score_ref: null });
  assert.throws(() => validatePromptV2NormalizedResult(invalid, { preregistration, authorityBinding, plan, materialization, rawScoreAuthorityResolver }), /raw-score|raw_score|scoring_ready/u);
  assert.throws(() => applyPromptV2NormalizedResult({
    state: createPromptV2ResumeState({ plan, materialization, runInstanceId }),
    preregistration,
    authorityBinding,
    plan,
    materialization,
    result: invalid,
    rawScoreAuthorityResolver,
  }), /raw-score|raw_score|scoring_ready|semantic/u);
});

check("missing token or duration statistics take insufficient-evidence precedence", () => {
  const incompleteResults = plan.cases.map((caseRecord) => caseRecord.adapter_track === "codex"
    ? scoringReadyResult(caseRecord, {
      metricOverrides: {
        input_tokens: known(0),
        output_tokens: known(0),
        duration_ms: known(0),
      },
    })
    : unavailableResult(caseRecord));
  const incompleteState = resumeFor(incompleteResults);
  const incompleteReport = buildPromptV2ComparisonReport({
    preregistration,
    authorityBinding,
    plan,
    materialization,
    resumeState: incompleteState,
    normalizedResults: incompleteResults,
    rawScoreAuthorityResolver,
  });
  assert.equal(incompleteReport.adapter_reports.find(({ adapter_track: adapterTrack }) => adapterTrack === "codex").prompt_outcome, "insufficient_evidence");
});

process.stdout.write(`Prompt v2 preregistration tests passed (${checks} checks)\n`);

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, buildEvolutionHumanDecision, publishEvolutionHumanDecision } from "./evolution-loop.mjs";
import { preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { verifyPersonalEvolutionSavedResults, preparePersonalEvolutionSavedResultActions, finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";
import { buildPortfolioEvolutionProjection } from "./ask-benchmark-portfolio-evolution-evidence.mjs";
import { registerAsset } from "./asset-registry.mjs";

// Called from the existing real Registry/Portfolio/Evolution integration harness.
// Every result input is synthetic; no original result, raw grader or model runs.
export function runPersonalSavedResultRegressions({ root, work, storeRoot, baseExperiment, assetTrust, portfolioTrust, check }) {
  const original = readContentAddressedJson({ storeRoot, digest: baseExperiment.candidate_object_digest }).value;
  const blueprintKeys = ["candidate_id", "parent_asset", "parent_portfolio", "candidate_asset", "registry", "factors",
    "evaluation_scope", "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const trust = { trustedAssetAuthorityContexts: assetTrust, trustedPortfolioAuthorityContexts: portfolioTrust,
    trustedExperimentAuthorities: [baseExperiment.authority] };
  const observationInput = { observation_id: "synthetic-personal-saved-result", repository_id: original.registry.repository_id,
      task_ids: ["synthetic-observed-configuration"], evidence_refs: [{ artifact_id: "synthetic-summary", digest: canonicalDigest("bounded summary") }],
      evidence_status: "Supported", correction: "Keep a configuration blocker tied to the explicit target.",
      intended_mechanism: "Preserve explicit requirement scope.", applicability: "Bounded configuration tasks.",
      non_applicability: ["Synthetic contract tests do not prove product effectiveness."],
      privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } };
  const prepared = preparePersonalEvolutionCandidate({ storeRoot, ...trust, observationInput,
    blueprint: Object.fromEntries(blueprintKeys.map(key => [key, original[key]])), generationActor: original.generation.actor,
    holdoutTaskIds: [...original.evaluation_scope.fixture_ids] });
  const authority = { authority_id: "personal-synthetic-evaluation-controller", authority_revision: 1,
    authority_evidence_digest: canonicalDigest({ synthetic: "personal-existing-result-controller" }) };
  const inventory = () => listContentAddressedJson({ storeRoot }).map(item => item.digest);
  function scenario(name, options = {}, collect = {}, unsafeStop = false, personal = prepared) {
    const planned = prepareAggregateV2FileFixture({ root, target: resolve(work, `personal-${name}`),
      fixtureId: "mn-build-option-update", sourceRevision: baseExperiment.protocol.source_revision, ...options });
    const draft = structuredClone(baseExperiment);
    draft.experiment_id = `personal-saved-${name}`;
    draft.candidate_digest = personal.candidate.candidate_digest;
    draft.candidate_object_digest = personal.preparation.candidate_object_digest;
    draft.protocol.candidate_evaluation_scope_digest = canonicalDigest(personal.candidate.evaluation_scope);
    draft.protocol.exclusions = personal.candidate.evaluation_scope.exclusions;
    draft.protocol.scoring_policy_digest = planned.execution.scoring_policy_digest;
    // Use the original pre-result projection builder; never infer role mapping.
    draft.projection = buildPortfolioEvolutionProjection({ roles: draft.roles, execution: planned.execution, root });
    if (unsafeStop) draft.recommendation_policy = { no_match: "insufficient_evidence", rules: [{
      rule_id: "synthetic-preresult-unsafe-stop", decision_scope: "rejection_proposal_only", recommendation: "stop",
      match: { quality: ["observed", "contradicted", "unknown"], safety: ["unsafe"], cost: ["observed", "unknown"],
        variance: ["observed", "unknown"], mechanism: ["unavailable"], external_outcome: ["unavailable"] } }] };
    return { planned, draft, collect, personal };
  }
  function sealAndCollect(s) {
    // The existing source adapter commits exact roles/execution before collection.
    const experiment = buildEvolutionExperiment(s.draft);
    const publication = publishEvolutionExperiment({ storeRoot, experiment });
    const files = s.planned.collect(s.collect);
    const input = { storeRoot, ...trust, preparationObjectDigest: s.personal.preparation_object_digest,
      experimentObjectDigest: publication.object_digest, trustedExperimentObjectDigests: [publication.object_digest],
      aggregateOptions: files.options, evaluationAuthority: authority };
    return { input, files, experiment };
  }
  const normal = sealAndCollect(scenario("normal"));
  const originalBytes = ["sourceManifestPath", "resultSetPath", "repetitionReportPath", "comparisonReportPath", "aggregateResultPath"]
    .map(key => [normal.files.options[key], readFileSync(normal.files.options[key])]);
  let verified, connected;
  check("personal saved-file full verifier preserves exact candidate and missing dimensions without writes", () => {
    const before = inventory(); verified = verifyPersonalEvolutionSavedResults(normal.input);
    assert.equal(verified.candidate.candidate_digest, prepared.candidate.candidate_digest);
    assert.equal(verified.evidence.dimensions.mechanism.status, "unavailable");
    assert.equal(verified.evidence.dimensions.external_outcome.status, "unavailable");
    assert.equal(verified.recommendation.recommendation, "insufficient_evidence");
    assert.equal(verified.models_started, false); assert.deepEqual(inventory(), before);
  });
  check("personal publisher requires separate exact evaluation trust without automatic promotion", () => {
    const before = inventory();
    assert.throws(() => preparePersonalEvolutionSavedResultActions(normal.input), /separately supplied exact trust/);
    assert.deepEqual(inventory(), before);
    connected = preparePersonalEvolutionSavedResultActions({ ...normal.input, trustedEvaluationAuthorities: [verified.evidence] });
    assert.equal(connected.proposal.action, "insufficient_evidence"); assert.equal(connected.lifecycle_mutated, false);
    assert.equal(connected.inspection.status, "proposal_verified");
  });
  check("personal saved-result wrong pre-result pin and foreign candidate fail before publication", () => {
    const before = inventory();
    assert.throws(() => preparePersonalEvolutionSavedResultActions({ ...normal.input, trustedExperimentObjectDigests: [] }), /independently pinned/);
    const foreign = publishEvolutionExperiment({ storeRoot, experiment: baseExperiment });
    const afterForeign = inventory();
    assert.throws(() => verifyPersonalEvolutionSavedResults({ ...normal.input, experimentObjectDigest: foreign.object_digest,
      trustedExperimentObjectDigests: [foreign.object_digest] }), /transplant/);
    assert.deepEqual(inventory(), afterForeign);
    assert.ok(inventory().length >= before.length);
  });
  check("post-result policy replacement is not accepted as the pinned personal experiment", () => {
    const draft = structuredClone(normal.experiment); draft.protocol.thresholds_digest = canonicalDigest("result-driven-change");
    const forged = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
    const before = inventory();
    assert.throws(() => verifyPersonalEvolutionSavedResults({ ...normal.input, experimentObjectDigest: forged.object_digest }), /independently pinned/);
    assert.deepEqual(inventory(), before);
  });
  const approved = buildEvolutionHumanDecision({ proposal: connected.proposal, disposition: "approved", reasonCodes: ["synthetic_noop"],
    authority: connected.proposal.required_decision_authority });
  const approvedPublication = publishEvolutionHumanDecision({ storeRoot, decision: approved });
  const finish = { ...normal.input, connectionObjectDigest: connected.connection_object_digest,
    decisionObjectDigest: approvedPublication.object_digest, trustedExperimentObjectDigests: normal.input.trustedExperimentObjectDigests,
    trustedEvaluationAuthorities: [verified.evidence], trustedHumanDecisionAuthorities: [approved] };
  check("personal no-op refuses missing independent human trust", () => {
    const before = inventory();
    assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish, trustedHumanDecisionAuthorities: [] }), /authority/);
    assert.deepEqual(inventory(), before);
  });
  check("personal no-op rechecks exact saved files before receipt publication", () => {
    const before = inventory();
    assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish,
      aggregateOptions: { ...finish.aggregateOptions, sourceManifestSourceDigest: canonicalDigest("changed saved source") } }), /digest/);
    assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish, aggregateOptions: undefined }));
    assert.deepEqual(inventory(), before);
  });
  check("trusted approval records existing no-op receipt with exact unchanged heads", () => {
    const done = finishPersonalEvolutionSavedResultNoop(finish);
    assert.equal(done.inspection.receipt_state, "completed"); assert.equal(done.lifecycle_mutated, false);
    const receipt = readContentAddressedJson({ storeRoot, digest: done.receipt_object_digest }).value;
    assert.deepEqual(receipt.base_heads, receipt.result_heads); assert.deepEqual(receipt.steps, []);
    assert.equal(finishPersonalEvolutionSavedResultNoop(finish).receipt_object_digest, done.receipt_object_digest);
  });
  check("declined human decision cannot be completed as a personal no-op", () => {
    const decision = buildEvolutionHumanDecision({ proposal: connected.proposal, disposition: "declined", reasonCodes: ["synthetic_declined"],
      authority: connected.proposal.required_decision_authority });
    const pub = publishEvolutionHumanDecision({ storeRoot, decision }); const before = inventory();
    assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish, decisionObjectDigest: pub.object_digest,
      trustedHumanDecisionAuthorities: [decision] }), /approved human decision/);
    assert.deepEqual(inventory(), before);
  });
  const missing = sealAndCollect(scenario("missing-effort", {}, { mutateNormalized(record) {
    record.telemetry.human_effort = { status: "unknown", value: null, reason: "synthetic_missing" };
  } }));
  check("missing native effort remains Unknown and a valid hold, never a zero benefit", () => {
    const data = verifyPersonalEvolutionSavedResults(missing.input);
    assert.equal(data.evidence.dimensions.cost.conclusion, "unknown");
    assert.equal(data.recommendation.recommendation, "insufficient_evidence");
    assert.equal(data.report.sensitivity_views[1].included.snapshot.components.human_effort_delta.value, null);
  });
  const regressed = sealAndCollect(scenario("negative-quality", {}, { mutateEngineering(result) {
    if (result.condition === "adaptive_ask") { result.requirement_score.requirement_points_earned = 0.2;
      result.requirement_score.normalized_requirement_score = 0.2; }
  } }));
  check("negative candidate quality remains descriptive and held under the unchanged policy", () => {
    const data = verifyPersonalEvolutionSavedResults(regressed.input);
    assert.ok(regressed.files.verified.verified_aggregate_result.unweighted_quality_delta < 0);
    assert.equal(data.evidence.dimensions.quality.conclusion, "observed");
    assert.equal(data.recommendation.recommendation, "insufficient_evidence");
  });
  const unsafe = sealAndCollect(scenario("unsafe-stop", {}, { mutateEngineering(result) {
    if (result.condition === "adaptive_ask") { const category = result.unsafe_actions.categories[2];
      category.attempted_count = 1; category.action_ids = ["synthetic_unsafe"];
      result.safety_blocker = { status: "fail", reason: result.scoring_reason, category_ids: ["unauthorized_attempt"], action_ids: ["synthetic_unsafe"] }; }
  } }, true));
  check("known unsafe candidate yields frozen stop and rejection proposal, no retirement", () => {
    const data = verifyPersonalEvolutionSavedResults(unsafe.input);
    assert.equal(data.recommendation.recommendation, "stop");
    const outcome = preparePersonalEvolutionSavedResultActions({ ...unsafe.input, trustedEvaluationAuthorities: [data.evidence] });
    assert.equal(outcome.proposal.action, "reject_candidate"); assert.equal(outcome.lifecycle_mutated, false);
    const decision = buildEvolutionHumanDecision({ proposal: outcome.proposal, disposition: "approved", reasonCodes: ["synthetic_rejection_proposal"],
      authority: outcome.proposal.required_decision_authority });
    const pub = publishEvolutionHumanDecision({ storeRoot, decision }); const before = inventory();
    assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish, ...unsafe.input, connectionObjectDigest: outcome.connection_object_digest,
      decisionObjectDigest: pub.object_digest, trustedExperimentObjectDigests: unsafe.input.trustedExperimentObjectDigests,
      trustedEvaluationAuthorities: [data.evidence], trustedHumanDecisionAuthorities: [decision] }), /cannot execute.*rejection/);
    assert.deepEqual(inventory(), before);
  });
  check("saved source file digest mismatch fails before personal publication", () => {
    const before = inventory();
    assert.throws(() => preparePersonalEvolutionSavedResultActions({ ...normal.input,
      aggregateOptions: { ...normal.input.aggregateOptions, sourceManifestSourceDigest: canonicalDigest("wrong file bytes") },
      trustedEvaluationAuthorities: [verified.evidence] }), /digest/);
    assert.deepEqual(inventory(), before);
  });
  check("a newer Registry with an old baseline Portfolio cannot obtain a no-op action", () => {
    const record = readContentAddressedJson({ storeRoot, digest: original.candidate_asset.record_digest }).value;
    const content = readContentAddressedJson({ storeRoot, digest: original.candidate_asset.content_digest }).value;
    const { object_kind: ignored, ...descriptor } = structuredClone(record); descriptor.version = "999.0.0-extra";
    const sourceRoot = resolve(work, "personal-extra-registry-source");
    descriptor.content = { package_format: "canonical_json_base64_files", files: content.files.map(file => {
      const path = resolve(sourceRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(file.bytes_base64, "base64"));
      return { path: file.path, media_type: file.media_type, raw_digest: file.raw_digest };
    }) };
    const newer = registerAsset({ storeRoot, sourceRoot, predecessorSnapshotDigest: original.registry.snapshot_digest,
      descriptor, trustedAuthorityContexts: assetTrust });
    const personal = preparePersonalEvolutionCandidate({ storeRoot, ...trust, observationInput,
      blueprint: { ...Object.fromEntries(blueprintKeys.map(key => [key, original[key]])),
        registry: { ...original.registry, snapshot_digest: newer.snapshot_digest, snapshot_revision: newer.snapshot_revision } },
      generationActor: original.generation.actor, holdoutTaskIds: [...original.evaluation_scope.fixture_ids] });
    const s = sealAndCollect(scenario("misaligned-parent", {}, {}, false, personal));
    const data = verifyPersonalEvolutionSavedResults(s.input); const before = inventory();
    assert.throws(() => preparePersonalEvolutionSavedResultActions({ ...s.input, trustedEvaluationAuthorities: [data.evidence] }), /aligned pre-result parent/);
    assert.deepEqual(inventory(), before);
  });
  check("saved result bytes remain unchanged through personal verification/publication", () => {
    for (const [path, bytes] of originalBytes) assert.deepEqual(readFileSync(path), bytes);
  });
}

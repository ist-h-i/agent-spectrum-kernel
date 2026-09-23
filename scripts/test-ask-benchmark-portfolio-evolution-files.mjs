import assert from "node:assert/strict";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { buildPortfolioEvolutionProjection, verifyPortfolioEvolutionEvidence } from "./ask-benchmark-portfolio-evolution-evidence.mjs";
import { buildEvolutionExperiment, buildEvolutionRecommendation, computeEvolutionArtifactInventoryDigest, publishEvolutionExperiment, publishEvolutionRecommendation, verifyEvolutionRecommendation } from "./evolution-loop.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";

// Invoked by the real #278 integration harness after it creates verified #276
// Assets and #277 manifests/locks/selections. No mock replaces those verifiers.
export function runPortfolioEvolutionFileRegressions({ root, work, storeRoot, baseExperiment, assetTrust, portfolioTrust, check }) {
  const evaluationAuthority = { authority_id: "issue-197-synthetic-consumer-verifier", authority_revision: 1, authority_evidence_digest: canonicalDigest({ synthetic: "issue197-evaluation-controller" }) };
  const trust = { trustedExperimentAuthorities: [baseExperiment.authority], trustedAssetAuthorityContexts: assetTrust, trustedPortfolioAuthorityContexts: portfolioTrust };
  const prepare = (name, options = {}) => prepareAggregateV2FileFixture({ root, target: resolve(work, `consumer-${name}`), fixtureId: "mn-build-option-update", sourceRevision: baseExperiment.protocol.source_revision, ...options });
  function seal(name, prepared, mutateExecution = null, mutateExperiment = null) {
    assert.equal(existsSync(resolve(work, `consumer-${name}`, "normalized")), false, "the synthetic pre-result seal must precede output creation");
    const execution = structuredClone(prepared.execution);
    mutateExecution?.(execution);
    const draft = structuredClone(baseExperiment);
    draft.experiment_id = `issue197-${name}`;
    draft.protocol.scoring_policy_digest = prepared.execution.scoring_policy_digest;
    draft.projection = buildPortfolioEvolutionProjection({ roles: draft.roles, execution, root });
    mutateExperiment?.(draft);
    const experiment = buildEvolutionExperiment(draft);
    const publication = publishEvolutionExperiment({ storeRoot, experiment });
    return { experiment, publication, pinned: [publication.object_digest] };
  }
  const args = (file, sealed) => ({ aggregateOptions: file.options, storeRoot, experimentObjectDigest: sealed.publication.object_digest, trustedExperimentObjectDigests: sealed.pinned, evaluationAuthority, ...trust });
  const planned = prepare("full");
  const sealed = seal("full", planned);
  const file = planned.collect();
  let verified;
  check("#197 file-chain evidence reaches #278 with exact pre-result #276/#277 binding", () => {
    verified = verifyPortfolioEvolutionEvidence(args(file, sealed));
    const aggregate = file.verified.verified_aggregate_result;
    for (const name of ["quality", "safety", "cost"]) {
      assert.equal(verified.evidence.dimensions[name].artifact_id, aggregate.aggregate_result_id);
      assert.equal(verified.evidence.dimensions[name].artifact_digest, aggregate.aggregate_result_digest);
      assert.equal(verified.evidence.dimensions[name].conclusion, "observed");
    }
    assert.deepEqual(verified.execution_binding, planned.execution);
    assert.equal(verified.evidence.dimensions.variance.conclusion, "observed");
    assert.equal(verified.recommendation.recommendation, "insufficient_evidence");
    assert.equal(verified.evidence.causal_attribution.status, "not_claimed");
    assert.equal(verified.authority_implied, false);
    assert.deepEqual(verifyPortfolioEvolutionEvidence(args(file, sealed)), verified);
  });
  check("missing dimensions are content-identified absence records, not fabricated reports", () => {
    for (const marker of verified.unavailable_artifacts) {
      const dim = verified.evidence.dimensions[marker.dimension];
      assert.equal(dim.status, "unavailable");
      assert.equal(dim.artifact_digest, canonicalDigest(marker));
      assert.equal(marker.measured_evidence, false);
    }
  });
  const published = publishEvolutionRecommendation({ storeRoot, recommendation: verified.recommendation });
  const recommendationOptions = { storeRoot, experimentObjectDigest: sealed.publication.object_digest, recommendationObjectDigest: published.object_digest, ...trust };
  check("existing full Evolution consumer accepts only separately trusted exact evaluation evidence", () => {
    assert.throws(() => verifyEvolutionRecommendation(recommendationOptions), /separately trusted exact authority/);
    const result = verifyEvolutionRecommendation({ ...recommendationOptions, trustedEvaluationAuthorities: [verified.evidence] });
    assert.equal(result.recommendation.recommendation_digest, verified.recommendation.recommendation_digest);
    assert.equal(result.experiment.roles.baseline.selected_asset.record_digest, baseExperiment.roles.baseline.selected_asset.record_digest);
    assert.equal(result.experiment.roles.challenger.portfolio.manifest_digest, baseExperiment.roles.challenger.portfolio.manifest_digest);
    assert.equal(result.experiment.roles.challenger.selection_digest, baseExperiment.roles.challenger.selection_digest);
  });
  check("rehashing a recommendation with transplanted aggregate identity fails exact consumer trust", () => {
    const forged = structuredClone(verified.recommendation);
    forged.dimensions.cost.artifact_digest = canonicalDigest({ transplant: true });
    forged.evaluation_authority.artifact_inventory_digest = computeEvolutionArtifactInventoryDigest(forged.dimensions);
    const stored = publishEvolutionRecommendation({ storeRoot, recommendation: buildEvolutionRecommendation(forged) });
    assert.throws(() => verifyEvolutionRecommendation({ ...recommendationOptions, recommendationObjectDigest: stored.object_digest, trustedEvaluationAuthorities: [verified.evidence] }), /separately trusted exact authority/);
  });
  check("digest/schema validity alone cannot attest a pre-result experiment", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), trustedExperimentObjectDigests: [] }), /independently pinned pre-result/);
  });
  check("post-result thresholds or weights require a different untrusted experiment identity", () => {
    for (const field of ["thresholds_digest", "weights_digest"]) {
      const forged = structuredClone(sealed.experiment);
      forged.protocol[field] = canonicalDigest({ changedAfterOutcome: field });
      const stored = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(forged) });
      assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), experimentObjectDigest: stored.object_digest }), /independently pinned pre-result/);
    }
  });
  check("closed projection inputs cannot accept a result-driven selection knob", () => {
    for (const key of ["observed_result", "threshold", "numeric_weight", "selected_after_result"]) {
      const execution = { ...planned.execution, [key]: 1 };
      assert.throws(() => buildPortfolioEvolutionProjection({ roles: sealed.experiment.roles, execution, root }), /additionalProperties|undeclared|not allowed/);
    }
  });
  for (const [name, mutation] of [
    ["plan", (value) => { value.plan_digest = canonicalDigest({ different: "plan" }); }],
    ["run", (value) => { value.run_instance_id = "00000000-0000-4000-8000-000000000198"; }],
    ["runtime", (value) => { value.runtime_identity_digest = canonicalDigest({ different: "runtime" }); }],
    ["materialization", (value) => { value.materialization_manifest_digest = canonicalDigest({ different: "materialization" }); }],
    ["selection-state", (value) => { value.selection_state_digest = canonicalDigest({ different: "selection-state" }); }],
    ["fixture-input", (value) => { value.fixtures[0].fixture_input_digest = canonicalDigest({ different: "fixture-input" }); }],
    ["adapter", (value) => { value.adapter_track = "claude"; }],
    ["group", (value) => { value.group.suite = "mechanism_positive"; }],
    ["classification", (value) => { value.classification_records[0].classification_digest = canonicalDigest({ different: "classification" }); }],
    ["policy", (value) => { value.policy_manifest_digest = canonicalDigest({ different: "policy" }); }],
  ]) {
    const plannedVariant = prepare(`binding-${name}`);
    const sealedVariant = seal(`binding-${name}`, plannedVariant, mutation);
    // Identical deterministic synthetic sources are reusable for negative bindings.
    const variant = file;
    check(`${name} transplant is rejected even with a syntactically valid pinned experiment`, () => {
      assert.throws(() => verifyPortfolioEvolutionEvidence(args(variant, sealedVariant)), /binding differs from the pinned pre-result projection/);
    });
  }
  check("exact Asset identity drift is rejected by the existing #276/#278 chain", () => {
    const forged = structuredClone(sealed.experiment);
    forged.roles.challenger.selected_asset.record_digest = canonicalDigest({ different: "asset" });
    const stored = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(forged) });
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), experimentObjectDigest: stored.object_digest, trustedExperimentObjectDigests: [stored.object_digest] }), /Asset identity mismatch/);
  });
  check("Portfolio and selection identities cannot be replaced independently", () => {
    for (const mutate of [
      (draft) => { draft.roles.challenger.portfolio.manifest_digest = canonicalDigest({ different: "portfolio" }); },
      (draft) => { draft.roles.challenger.selection_digest = canonicalDigest({ different: "selection" }); },
    ]) {
      const forged = structuredClone(sealed.experiment); mutate(forged);
      const stored = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(forged) });
      assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), experimentObjectDigest: stored.object_digest, trustedExperimentObjectDigests: [stored.object_digest] }), /Portfolio identity mismatch|selection digest mismatch/);
    }
  });
  for (const state of ["unknown", "unavailable", "partial"]) {
    const p = prepare(`effort-${state}`);
    const s = seal(`effort-${state}`, p);
    const f = p.collect({ mutateNormalized(record) {
      if (state !== "partial" || record.lineage.repetition === 2) record.telemetry.human_effort = { status: state === "partial" ? "unknown" : state, value: null, reason: "synthetic_result_set_fixture" };
    } });
    check(`${state} native effort reaches the recommendation as insufficient, not retained or zero`, () => {
      const result = verifyPortfolioEvolutionEvidence(args(f, s));
      assert.equal(result.evidence.dimensions.cost.status, "insufficient_evidence");
      assert.equal(result.evidence.dimensions.cost.conclusion, "unknown");
      assert.equal(result.recommendation.recommendation, "insufficient_evidence");
      assert.equal(result.report.sensitivity_views[1].included.snapshot.components.human_effort_delta.state, state);
    });
  }
  const unsafePlan = prepare("unsafe-excluded", { excluded: true });
  const unsafeSeal = seal("unsafe-excluded", unsafePlan);
  const unsafeFile = unsafePlan.collect({ mutateEngineering(result) {
    if (result.condition !== "adaptive_ask") return;
    const category = result.unsafe_actions.categories[2];
    if (result.repetition === 1) {
      category.attempted_count = 1; category.action_ids = ["synthetic-unsafe"];
      result.safety_blocker = { status: "fail", reason: result.scoring_reason, category_ids: ["unauthorized_attempt"], action_ids: ["synthetic-unsafe"] };
    } else {
      category.unknown_count = 1; category.action_ids = ["synthetic-unknown"];
      result.safety_blocker = { status: "unknown", reason: result.scoring_reason, category_ids: ["unauthorized_attempt"], action_ids: ["synthetic-unknown"] };
    }
  } });
  check("known unsafe evidence survives all-excluded population and other unknown safety observations", () => {
    const result = verifyPortfolioEvolutionEvidence(args(unsafeFile, unsafeSeal));
    assert.equal(result.evidence.dimensions.safety.conclusion, "unsafe");
    assert.equal(result.report.safety_inventory.comparison.evidence_status, "insufficient_evidence");
    assert.equal(result.evidence.dimensions.quality.conclusion, "unknown");
    assert.equal(result.recommendation.recommendation, "insufficient_evidence");
  });
  check("a frozen recommendation rule cannot offset a witnessed unsafe action", () => {
    const forged = structuredClone(unsafeSeal.experiment);
    forged.recommendation_policy.rules = [{ rule_id: "unsafe-offset-negative-control", match: {
      quality: ["unknown"], safety: ["unsafe"], cost: ["unknown"], variance: ["unknown"], mechanism: ["unavailable"], external_outcome: ["unavailable"],
    }, recommendation: "expand", decision_scope: "negative_control_only" }];
    const stored = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(forged) });
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(unsafeFile, unsafeSeal), experimentObjectDigest: stored.object_digest, trustedExperimentObjectDigests: [stored.object_digest] }), /safety regression cannot be offset/);
  });
  check("evaluation identity cannot reuse a generation/experiment/decision authority", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), evaluationAuthority: { ...evaluationAuthority, authority_id: sealed.experiment.authority.authority_id } }), /must be distinct/);
  });
  check("the adapter does not replace or reinterpret Prompt full_ask compatibility", () => {
    const forbidden = { ...planned.execution, group: { ...planned.execution.group, comparison_view: "full_vs_kernel_diagnostic" } };
    assert.throws(() => buildPortfolioEvolutionProjection({ roles: sealed.experiment.roles, execution: forbidden, root }), /const|adaptive_vs_kernel/);
  });
  check("unknown evaluation controls cannot be smuggled into identity metadata", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...args(file, sealed), evaluationAuthority: { ...evaluationAuthority, threshold: 0 } }), /closed identity metadata/);
  });
  check("consumer outputs cannot mutate the experiment, recommendation or native observations", () => {
    assert.ok(Object.isFrozen(verified.evidence.dimensions));
    assert.throws(() => { verified.evidence.dimensions.quality.conclusion = "improved"; }, TypeError);
    assert.throws(() => { verified.report.sensitivity_views[1].included.snapshot.components.token_count_delta.value = 0; }, TypeError);
    assert.equal(canonicalDigest(verified.recommendation), published.object_digest);
  });
}

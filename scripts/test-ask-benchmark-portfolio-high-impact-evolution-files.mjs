import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalDigest, putContentAddressedJson } from "./content-addressed-store.mjs";
import { buildPortfolioEvolutionProjection, verifyPortfolioEvolutionEvidence } from "./ask-benchmark-portfolio-evolution-evidence.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, publishEvolutionRecommendation, verifyEvolutionRecommendation } from "./evolution-loop.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";
import {
  computeHighImpactSensitivityReportDigest, highImpactRegistrationScope, highImpactSensitivityEvidenceIdentity,
  publishHighImpactSensitivityRegistration, publishHighImpactSensitivityReport,
} from "./ask-benchmark-portfolio-high-impact-sensitivity.mjs";

// Called only after the existing integration harness has built real verified
// #276 Assets / #277 manifests, locks and selections for this exact task class.
export function runHighImpactEvolutionFileRegressions({ root, work, storeRoot, baseExperiment, assetTrust, portfolioTrust, check }) {
  const HIGH = "pf-data-schema-evolution";
  const trust = { trustedExperimentAuthorities: [baseExperiment.authority], trustedAssetAuthorityContexts: assetTrust, trustedPortfolioAuthorityContexts: portfolioTrust };
  const evaluationAuthority = { authority_id: "issue-197-high-impact-synthetic-verifier", authority_revision: 1, authority_evidence_digest: canonicalDigest({ synthetic: "issue197-high-impact-evaluation-controller" }) };
  function plan(name, options = {}) {
    const target = resolve(work, `high-impact-${name}`);
    const prepared = prepareAggregateV2FileFixture({ root, target, fixtureIds: ["pf-api-pagination-behavior", HIGH], withLineage: true, sourceRevision: baseExperiment.protocol.source_revision, ...options });
    const registration = publishHighImpactSensitivityRegistration({ root, storeRoot, scope: highImpactRegistrationScope(prepared.execution) });
    const pinnedRegistration = [registration.object_digest];
    const draft = structuredClone(baseExperiment);
    draft.experiment_id = `issue197-high-impact-${name}`;
    draft.protocol.scoring_policy_digest = prepared.execution.scoring_policy_digest;
    draft.projection = buildPortfolioEvolutionProjection({ root, roles: draft.roles, execution: prepared.execution, highImpactRegistrationObjectDigest: registration.object_digest });
    const experiment = buildEvolutionExperiment(draft);
    const publication = publishEvolutionExperiment({ storeRoot, experiment });
    const pinnedExperiment = [publication.object_digest];
    assert.equal(existsSync(resolve(target, "normalized")), false, "both exact pins precede synthetic result creation");
    return { registration, experiment, publication, prepared, collect(mutations = {}) {
      const file = prepared.collect(mutations);
      const sensitivity = publishHighImpactSensitivityReport({ root, storeRoot, verifiedAggregate: file.verified,
        registrationObjectDigest: registration.object_digest, trustedRegistrationObjectDigests: pinnedRegistration });
      const args = { aggregateOptions: file.options, storeRoot, experimentObjectDigest: publication.object_digest, trustedExperimentObjectDigests: pinnedExperiment,
        highImpactRegistrationObjectDigest: registration.object_digest, trustedHighImpactRegistrationObjectDigests: pinnedRegistration,
        highImpactReportObjectDigest: sensitivity.object_digest, evaluationAuthority, ...trust };
      return { file, args, sensitivity, verified: verifyPortfolioEvolutionEvidence(args) };
    } };
  }
  const planned = plan("full");
  const full = planned.collect();
  check("nondegenerate sensitivity reaches existing #278 through exact #276/#277 identities", () => {
    const value = full.verified.high_impact_sensitivity;
    assert.equal(value.verified_report.report.conclusion, "stable");
    assert.deepEqual(value.identity, highImpactSensitivityEvidenceIdentity(value.verified_report));
    assert.equal(value.identity.registration_object_digest, planned.registration.object_digest);
    assert.equal(value.identity.object_digest, full.sensitivity.object_digest);
    assert.deepEqual(value.identity.aggregate_identity, full.verified.report.aggregate_identity);
    assert.equal(full.verified.execution_binding.fixtures.length, 2);
    assert.equal(full.verified.evidence.dimensions.cost.artifact_digest, value.identity.aggregate_identity.artifact_digest);
    assert.equal(full.verified.evidence.dimensions.variance.conclusion, "observed");
    assert.equal(full.verified.report.sensitivity_views[0].conclusion, "insufficient_evidence", "historical B1 report is not reinterpreted");
    assert.equal(full.verified.recommendation.recommendation, "insufficient_evidence", "uncollected dimensions are not invented");
  });
  check("#278 recommendation retains the exact experiment pin and separately trusted evidence", () => {
    const published = publishEvolutionRecommendation({ storeRoot, recommendation: full.verified.recommendation });
    const args = { storeRoot, experimentObjectDigest: planned.publication.object_digest, recommendationObjectDigest: published.object_digest, ...trust };
    assert.throws(() => verifyEvolutionRecommendation(args), /separately trusted exact authority/);
    const result = verifyEvolutionRecommendation({ ...args, trustedEvaluationAuthorities: [full.verified.evidence] });
    assert.equal(result.experiment.projection.projection_evidence_digest, planned.experiment.projection.projection_evidence_digest);
    assert.equal(result.experiment.roles.baseline.selected_asset.record_digest, baseExperiment.roles.baseline.selected_asset.record_digest);
    assert.equal(result.experiment.roles.challenger.portfolio.manifest_digest, baseExperiment.roles.challenger.portfolio.manifest_digest);
    assert.equal(result.experiment.roles.challenger.selection_digest, baseExperiment.roles.challenger.selection_digest);
  });
  check("copied returned sensitivity context does not inherit issued verifier authority", () => {
    assert.throws(() => highImpactSensitivityEvidenceIdentity({ ...full.verified.high_impact_sensitivity.verified_report }), /must be issued/);
    assert.throws(() => { full.verified.high_impact_sensitivity.identity.object_digest = canonicalDigest({ forged: true }); }, TypeError);
  });
  check("sidecar cannot bypass independently pinned pre-result registration or experiment", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, trustedHighImpactRegistrationObjectDigests: [] }), /independently pinned/);
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, trustedExperimentObjectDigests: [] }), /independently pinned/);
  });
  check("registration and report are mandatory together and cannot be omitted after binding", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, highImpactReportObjectDigest: null }), /both registration and report/);
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, highImpactRegistrationObjectDigest: null }), /both registration and report/);
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, highImpactRegistrationObjectDigest: null, highImpactReportObjectDigest: null }), /binding differs from the pinned/);
  });
  check("new registration identity cannot be transplanted under an unchanged experiment", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, highImpactRegistrationObjectDigest: canonicalDigest({ different: "registration" }) }), /binding differs from the pinned/);
    assert.throws(() => buildPortfolioEvolutionProjection({ root, roles: planned.experiment.roles, execution: planned.prepared.execution, highImpactRegistrationObjectDigest: "invalid" }), /exact registration object digest/);
  });
  for (const [name, mutate, expected] of [
    ["Asset", (e) => { e.roles.challenger.selected_asset.record_digest = canonicalDigest({ different: "asset" }); }, /Asset identity mismatch/],
    ["Portfolio", (e) => { e.roles.challenger.portfolio.manifest_digest = canonicalDigest({ different: "portfolio" }); }, /Portfolio identity mismatch/],
    ["selection", (e) => { e.roles.challenger.selection_digest = canonicalDigest({ different: "selection" }); }, /selection digest mismatch/],
  ]) check(`${name} identity transplant remains rejected for the new sensitivity consumer`, () => {
    const forged = structuredClone(planned.experiment); mutate(forged);
    const stored = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(forged) });
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, experimentObjectDigest: stored.object_digest, trustedExperimentObjectDigests: [stored.object_digest] }), expected);
  });
  const changed = plan("changed").collect({ mutateNormalized(record) {
    if (record.lineage.fixture_id === HIGH && record.lineage.condition === "adaptive_ask") record.telemetry.input_tokens.value += 6;
  } });
  check("computed changed sensitivity is transferred without changing recommendation semantics", () => {
    assert.equal(changed.verified.high_impact_sensitivity.verified_report.report.conclusion, "changed");
    assert.equal(changed.verified.evidence.dimensions.cost.conclusion, "observed");
    assert.equal(changed.verified.recommendation.recommendation, "insufficient_evidence");
  });
  check("a valid report for another aggregate cannot be transplanted into the evidence consumer", () => {
    assert.throws(() => verifyPortfolioEvolutionEvidence({ ...full.args, highImpactReportObjectDigest: changed.sensitivity.object_digest }), /full-verifier reconstruction/);
  });
  const unknown = plan("unknown").collect({ mutateNormalized(record) {
    if (record.lineage.fixture_id === HIGH) record.telemetry.human_effort = { status: "unknown", value: null, reason: "synthetic_result_set_fixture" };
  } });
  check("insufficient high-impact evidence is not upgraded by the closed excluded view", () => {
    const report = unknown.verified.high_impact_sensitivity.verified_report.report;
    assert.equal(report.conclusion, "insufficient_evidence");
    assert.equal(report.excluded.details.snapshot.evidence_status, "complete");
    assert.equal(unknown.verified.evidence.dimensions.cost.status, "insufficient_evidence");
    assert.equal(unknown.verified.recommendation.recommendation, "insufficient_evidence");
  });
  for (const kind of ["safety", "requirement"]) {
    const unsafe = plan(`${kind}-excluded`, { excludedFixtureIds: [HIGH] }).collect({ mutateEngineering(result) {
      if (result.fixture_id !== HIGH || result.condition !== "adaptive_ask" || result.repetition !== 1) return;
      if (kind === "safety") {
        const category = result.unsafe_actions.categories[2]; category.attempted_count = 1; category.action_ids = ["synthetic-unsafe-high-impact"];
        result.safety_blocker = { status: "fail", reason: result.scoring_reason, category_ids: [category.category_id], action_ids: category.action_ids };
      } else result.blockers = { requirement_ids: ["synthetic-required"], outcomes: [{ requirement_id: "synthetic-required", outcome: "fail", evidence_references: [{ kind: "normalized_result", digest: result.normalized_result_digest, bytes: null }] }], non_pass_requirement_ids: ["synthetic-required"], gate_status: "fail" };
    } });
    check(`${kind} witness survives classification/high-impact exclusions into #278`, () => {
      const report = unsafe.verified.high_impact_sensitivity.verified_report.report;
      assert.equal(report.all_population_safety_inventory.comparison[`${kind}_blocker_observed`], true);
      assert.equal(report.excluded.safety_inventory.comparison[`${kind}_blocker_observed`], false);
      assert.equal(unsafe.verified.evidence.dimensions[kind === "safety" ? "safety" : "quality"].conclusion, kind === "safety" ? "unsafe" : "contradicted");
      assert.ok(!["expand", "retain"].includes(unsafe.verified.recommendation.recommendation));
    });
    check(`resealing a hidden ${kind} witness cannot transfer evidence authority`, () => {
      const forged = structuredClone(unsafe.sensitivity.report);
      forged.all_population_safety_inventory.comparison.witnesses = [];
      forged.all_population_safety_inventory.comparison[`${kind}_blocker_observed`] = false;
      forged.report_digest = computeHighImpactSensitivityReportDigest(forged);
      const stored = putContentAddressedJson({ storeRoot, artifact: forged });
      assert.throws(() => verifyPortfolioEvolutionEvidence({ ...unsafe.args, highImpactReportObjectDigest: stored.digest }), /full-verifier reconstruction/);
    });
  }
}

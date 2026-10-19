import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildAssetLifecycleAuthorityContext, verifyAssetRegistry } from "./asset-registry.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, buildEvolutionHumanDecision,
  publishEvolutionHumanDecision, applyApprovedEvolutionCandidateRejection, verifyEvolutionApplicationReceipt,
  buildEvolutionApplicationReceipt, publishEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { sealPersonalEvolutionPromptPair, verifyPersonalEvolutionPromptPairResults } from "./ask-personal-evolution-primary-pair.mjs";
import { preparePersonalEvolutionSavedResultActions } from "./ask-personal-evolution-saved-results.mjs";
import { setup, blocksFor, collectSyntheticTerminal, fakeEngineeringTemplate, collectSyntheticGrade } from "./test-helpers-personal-evolution-primary-pair.mjs";

test("approved rejection retires only the exact candidate and verifies its receipt without changing the Portfolio", async t => {
  const f = setup(t), read = digest => readContentAddressedJson({ storeRoot: f.storeRoot, digest }).value;
  const draft = structuredClone(read(f.args.experimentObjectDigest));
  draft.recommendation_policy = { no_match: "insufficient_evidence", rules: [{
    rule_id: "synthetic-unsafe-stop", decision_scope: "rejection_proposal_only", recommendation: "stop",
    match: { quality: ["observed", "contradicted", "unknown"], safety: ["unsafe"], cost: ["observed", "unknown"],
      variance: ["observed", "unknown", "unavailable"], mechanism: ["unavailable"], external_outcome: ["unavailable"] } }] };
  const experiment = publishEvolutionExperiment({ storeRoot: f.storeRoot, experiment: buildEvolutionExperiment(draft) });
  const args = { ...f.args, experimentObjectDigest: experiment.object_digest, trustedExperimentObjectDigests: [experiment.object_digest] };
  const { blocks } = blocksFor(t, f), pair = sealPersonalEvolutionPromptPair({ ...args, blocks, outputRoot: join(f.root, "pair") });
  const savedResults = { baseline: {}, challenger: {} }, trusted = [], template = fakeEngineeringTemplate(f.root);
  for (const role of ["baseline", "challenger"]) {
    const block = blocks[role][0]; collectSyntheticTerminal(t, block);
    const grade = await collectSyntheticGrade(t, f, block, template, { safety: role === "challenger" ? "fail" : "pass" });
    savedResults[role][block.fixture_id] = grade; trusted.push(grade.engineering_result.digest);
  }
  const input = { ...args, pairRegistrationObjectDigest: pair.object_digest, trustedPairRegistrationObjectDigests: [pair.object_digest],
    savedResults, trustedSavedEngineeringResultDigests: trusted };
  const checked = verifyPersonalEvolutionPromptPairResults(input); assert.equal(checked.recommendation.recommendation, "stop");
  const actions = preparePersonalEvolutionSavedResultActions({ ...input, trustedEvaluationAuthorities: [checked.evidence] });
  assert.equal(actions.proposal.action, "reject_candidate");
  const decision = buildEvolutionHumanDecision({ proposal: actions.proposal, disposition: "approved", reasonCodes: ["synthetic-bounded-policy"],
    authority: actions.proposal.required_decision_authority });
  const published = publishEvolutionHumanDecision({ storeRoot: f.storeRoot, decision });
  const candidate = checked.candidate, base = actions.proposal.lifecycle_plan;
  const authorityContext = buildAssetLifecycleAuthorityContext({ registryId: candidate.registry.registry_id,
    repositoryId: candidate.registry.repository_id, scopeId: candidate.registry.scope_id,
    predecessorSnapshotDigest: base.base_registry_snapshot_digest, transitions: base.asset_transitions,
    authority: { ...decision.authority, authority_revision: String(decision.authority.authority_revision),
      kind: "external_asset_lifecycle_authority", authority_evidence_digest: published.object_digest } });
  const options = { ...input, ...actions.artifacts, candidateObjectDigest: draft.candidate_object_digest,
    decisionObjectDigest: published.object_digest, trustedEvaluationAuthorities: [checked.evidence], trustedHumanDecisionAuthorities: [decision],
    trustedAssetAuthorityContexts: [authorityContext], assetAuthorityContext: authorityContext };
  assert.throws(() => applyApprovedEvolutionCandidateRejection({ ...options, trustedAssetAuthorityContexts: [] }), /authority/);
  const done = applyApprovedEvolutionCandidateRejection(options);
  const closure = verifyEvolutionApplicationReceipt({ ...options, receiptObjectDigest: done.object_digest });
  assert.equal(closure.receipt.state, "completed"); assert.equal(closure.receipt.action, "reject_candidate");
  assert.equal(closure.receipt.base_heads.portfolio_lock_digest, closure.receipt.result_heads.portfolio_lock_digest);
  const result = verifyAssetRegistry({ storeRoot: f.storeRoot, snapshotDigest: done.snapshot_digest, trustedAuthorityContexts: [authorityContext] });
  const entry = result.assets.find(item => item.record_digest === candidate.candidate_asset.record_digest);
  assert.equal(entry.state, "retired");
  const original = read(base.base_registry_snapshot_digest), next = read(done.snapshot_digest);
  assert.deepEqual(next.entries.filter(item => item.record_digest !== entry.record_digest), original.entries.filter(item => item.record_digest !== entry.record_digest));
  assert.equal(applyApprovedEvolutionCandidateRejection(options).object_digest, done.object_digest);
  // Self-consistent digests never make an omitted or unrelated mutation valid.
  for (const overrides of [
    { result_heads: closure.receipt.base_heads, steps: [] },
    { steps: [{ ...closure.receipt.steps[0], step_id: "unrelated_step" }] },
    { steps: [...closure.receipt.steps, { ...closure.receipt.steps[0], step_id: "extra_verification", operation: "verify_asset_commit_marker" }] },
  ]) {
    const forged = buildEvolutionApplicationReceipt({ ...closure.receipt, ...overrides });
    const publication = publishEvolutionApplicationReceipt({ storeRoot: f.storeRoot, receipt: forged });
    assert.throws(() => verifyEvolutionApplicationReceipt({ ...options, receiptObjectDigest: publication.object_digest }), /rejection/);
  }
  const wrongDecision = buildAssetLifecycleAuthorityContext({ registryId: candidate.registry.registry_id,
    repositoryId: candidate.registry.repository_id, scopeId: candidate.registry.scope_id,
    predecessorSnapshotDigest: base.base_registry_snapshot_digest, transitions: base.asset_transitions,
    authority: { ...authorityContext.authority, authority_evidence_digest: candidate.candidate_digest } });
  assert.throws(() => applyApprovedEvolutionCandidateRejection({ ...options, assetAuthorityContext: wrongDecision,
    trustedAssetAuthorityContexts: [wrongDecision] }), /exact approved proposal and decision/);
});

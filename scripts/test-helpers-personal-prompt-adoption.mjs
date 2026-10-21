// Entirely synthetic adoption/rollback fixture; never actual deployment authority.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { attestVerificationEvidence, putVerificationEvidence, reuseIdentityFromEvidence, buildVerificationRequirements } from "./verification-evidence.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, deriveEvolutionRecommendation, publishEvolutionRecommendation,
  deriveEvolutionActionProposal, publishEvolutionActionProposal, buildEvolutionHumanDecision, publishEvolutionHumanDecision,
  applyApprovedEvolutionPortfolioAction, verifyEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions, resolvePortfolioSelection, computePortfolioSelectionBasisDigest } from "./portfolio-manager.mjs";
const repo=resolve(import.meta.dirname,".."),fixture=join(repo,"docs/fixtures/prompt-v2-preregistration");
const reference=JSON.parse(readFileSync(join(fixture,"reference.json"))),adapter=reference.adapters[0];
const read=(storeRoot,digest)=>readContentAddressedJson({storeRoot,digest}).value;
const ref=p=>Object.fromEntries(["portfolio_id","revision","manifest_digest","asset_set_digest"].map(key=>[key,p[key]]));
export function syntheticClosure(t) {
  const root = mkdtempSync(join(tmpdir(), "personal-artificial-closure-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = join(root, "store"); cpSync(join(fixture, "store"), storeRoot, { recursive: true });
  const sampleRoot = join(repo, "docs/fixtures/evolution-loop"), sample = JSON.parse(readFileSync(join(sampleRoot, "reference.json")));
  const candidate = read(storeRoot, adapter.evolution.candidate_object_digest);
  const draft = structuredClone(read(storeRoot, adapter.evolution.experiment_object_digest));
  draft.recommendation_policy = read(join(sampleRoot, "store"), sample.artifacts.experiment.object_digest).recommendation_policy;
  const experiment = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
  const evidence = structuredClone(sample.trusted_contexts.evaluation[0]);
  evidence.authority.experiment_digest = experiment.experiment_digest;
  const recommendation = deriveEvolutionRecommendation({ experiment: read(storeRoot, experiment.object_digest), evidence });
  assert.equal(recommendation.recommendation, "expand");
  const recommended = publishEvolutionRecommendation({ storeRoot, recommendation });
  const canary = structuredClone(read(storeRoot, adapter.challenger_portfolio.manifest_digest));
  delete canary.asset_set_digest; delete canary.selection_basis_digest;
  canary.revision = "synthetic-artificial-canary";
  Object.assign(canary.entries[0], { assurance_lane: "challenger", role: "challenger", exposure: { mode: "canary", canary_percent: 5 } });
  const requirementId = "synthetic-artificial-eligible-only";
  canary.entries[0].evidence_requirement_ids = [requirementId];
  const witness = structuredClone(read(join(sampleRoot, "store"), sample.application.gate_evidence_object_digest));
  delete witness.reuse_identity_digest; witness.producer = { kind: "developer" };
  witness.target.target_revision = canary.source_revision; witness.target.tree_digest = draft.protocol.tree_digest;
  witness.gate.gate_id = "synthetic-artificial-contract-gate";
  witness.consumed_inputs[0].digest = computePortfolioSelectionBasisDigest(canary);
  const attested = attestVerificationEvidence(witness, { privateKey: generateKeyPairSync("ed25519").privateKey });
  putVerificationEvidence({ storeRoot, evidence: attested });
  canary.evidence_requirements = [{ requirement_id: requirementId, entry_ids: [canary.entries[0].entry_id],
    requirements: buildVerificationRequirements({ requiredGates: [{ gate_id: attested.gate.gate_id,
      reuse_identity: reuseIdentityFromEvidence(attested), required_obligation_refs: attested.coverage.obligation_refs,
      authority: { independent_judgment_required: false,
        accepted_producers: [{ kind: attested.producer.kind, identity_digest: attested.producer.identity_digest }],
        accepted_evidence_levels: ["behavior_verified"] }, execution_availability: "available" }] }),
    allowed_dispositions: ["reuse_exact"], required_current_state_refs: [{ state_id: "repository-tree", state_digest: draft.protocol.tree_digest }] }];
  const canaryManifest = publishPortfolioManifest({ storeRoot, draft: canary });
  const parent = candidate.parent_portfolio;
  const transitions = [{ manifest: ref(parent), from_state: "current", to_state: "historical" },
    { manifest: ref(canaryManifest), from_state: null, to_state: "current" }];
  const proposal = deriveEvolutionActionProposal({ candidate, experiment: read(storeRoot, experiment.object_digest), recommendation,
    lifecyclePlan: { base_registry_snapshot_digest: candidate.registry.snapshot_digest, base_portfolio_lock_digest: parent.lock_digest,
      base_current_manifest: ref(parent), target_manifest: ref(canaryManifest), portfolio_transitions: transitions,
      asset_transitions: [], rollback_anchor: ref(parent), reason_codes: ["synthetic_physical_mechanics_only"] } });
  const proposed = publishEvolutionActionProposal({ storeRoot, proposal });
  const decision = buildEvolutionHumanDecision({ proposal, disposition: "approved", reasonCodes: ["synthetic_physical_mechanics_only"], authority: candidate.authorities.decision });
  const decided = publishEvolutionHumanDecision({ storeRoot, decision });
  const authority = { kind: "external_portfolio_activation_authority", authority_id: decision.authority.authority_id,
    authority_revision: "synthetic-test-v1", authority_evidence_digest: decided.object_digest };
  const activation = buildPortfolioAuthorityContext({ portfolioId: parent.portfolio_id, repositoryId: candidate.registry.repository_id,
    scopeId: candidate.registry.scope_id, predecessorLockDigest: parent.lock_digest, transitions, authority });
  const closure = { storeRoot, candidateObjectDigest: adapter.evolution.candidate_object_digest, experimentObjectDigest: experiment.object_digest,
    recommendationObjectDigest: recommended.object_digest, proposalObjectDigest: proposed.object_digest, decisionObjectDigest: decided.object_digest,
    trustedExperimentAuthorities: [draft.authority], trustedEvaluationAuthorities: [evidence], trustedHumanDecisionAuthorities: [decision],
    trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: [...adapter.portfolio_authority_contexts, activation] };
  const applied = applyApprovedEvolutionPortfolioAction({ ...closure, portfolioAuthorityContext: activation });
  closure.receiptObjectDigest = applied.object_digest;
  assert.equal(verifyEvolutionApplicationReceipt(closure).receipt.state, "completed");
  const originalSelection = read(storeRoot, adapter.baseline_selection.selection_object_digest);
  const context = structuredClone(read(storeRoot, originalSelection.context_object_digest)); delete context.context_digest;
  context.task_class = "verification";
  const selected = resolvePortfolioSelection({ ...closure, lockDigest: applied.lock_digest,
    selectorContext: { ...context, portfolio_lock_digest: applied.lock_digest } });
  assert.equal(selected.selection.decision, "selected");
  const rollback = buildPortfolioAuthorityContext({ portfolioId: parent.portfolio_id, repositoryId: candidate.registry.repository_id,
    scopeId: candidate.registry.scope_id, predecessorLockDigest: applied.lock_digest,
    transitions: [{ manifest: ref(canaryManifest), from_state: "current", to_state: "historical" },
      { manifest: ref(parent), from_state: "historical", to_state: "current" }], rollbackTarget: ref(parent),
    authority: { kind: "external_portfolio_rollback_authority", authority_id: "synthetic-artificial-rollback-only",
      authority_revision: "synthetic-test-v1", authority_evidence_digest: canonicalDigest("synthetic rollback permission") } });
  closure.trustedPortfolioAuthorityContexts.push(rollback);
  const restored = applyPortfolioTransitions({ ...closure, predecessorLockDigest: applied.lock_digest, authorityContext: rollback });
  const rollbackSelection = resolvePortfolioSelection({ ...closure, lockDigest: restored.lock_digest,
    selectorContext: { ...context, portfolio_lock_digest: restored.lock_digest } });
  assert.equal(rollbackSelection.selection.decision, "selected");
  return { closure, parentSelection: adapter.baseline_selection.selection_object_digest,
    candidateSelection: selected.selection_object_digest, rollbackSelection: rollbackSelection.selection_object_digest, candidate };
}

import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { attestVerificationEvidence, putVerificationEvidence, reuseIdentityFromEvidence, buildVerificationRequirements } from "./verification-evidence.mjs";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson, putContentAddressedJson } from "./content-addressed-store.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, deriveEvolutionRecommendation, publishEvolutionRecommendation,
  deriveEvolutionActionProposal, publishEvolutionActionProposal, buildEvolutionHumanDecision, publishEvolutionHumanDecision,
  applyApprovedEvolutionPortfolioAction, verifyEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions, resolvePortfolioSelection, computePortfolioSelectionBasisDigest } from "./portfolio-manager.mjs";
import { mintArtificialPersonalPromptTarget, planArtificialPersonalPromptApply, applyArtificialPersonalPromptPlan,
  planArtificialPersonalPromptRestore, restoreArtificialPersonalPromptPlan } from "./ask-personal-prompt-artificial-install.mjs";
import { inspectPersonalPublicPromptSource } from "./ask-personal-public-source-facts.mjs";
import { captureApplyTarget } from "./ask-setup-apply-state.mjs";
const repo = resolve(import.meta.dirname, ".."), fixture = join(repo, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"))), adapter = reference.adapters[0];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const ref = p => Object.fromEntries(["portfolio_id", "revision", "manifest_digest", "asset_set_digest"].map(key => [key, p[key]]));

// Entirely synthetic contract closure. No primary capture, real grading, old
// observed outcome or human adoption approval is imported or claimed.
function syntheticClosure(t) {
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
function target(t) {
  const created = mintArtificialPersonalPromptTarget(); t.after(() => rmSync(created.root, { recursive: true, force: true }));
  writeFileSync(join(created.root, "README.md"), "Project-owned artificial notes.\n");
  return created;
}
function plan(f, x, role) { return planArtificialPersonalPromptApply({ target: x.handle, closure: f.closure,
  selectionObjectDigest: role === "parent" ? f.parentSelection : f.candidateSelection, role }); }

test("public ASK source facts inspect ten real Git/CAS files and leave Unknown provenance and scope intact", () => {
  for (const key of ["baseline_asset", "candidate_asset"]) {
    const facts = inspectPersonalPublicPromptSource({ repositoryRoot: repo, taskClass: "verification", materializationOptions: {
      storeRoot: join(fixture, "store"), registrySnapshotDigest: reference.registry.snapshot_digest, asset: adapter[key],
      entrypoint: read(join(fixture, "store"), adapter[key].record_digest).type_extension.entrypoints[0], trustedAssetAuthorityContexts: [] } });
    assert.equal(facts.files.length, 5); assert.equal(facts.provenance.owner.status, "unknown"); assert.equal(facts.provenance.license.status, "unknown");
    assert.ok(facts.existing_applicability.excluded_scopes.includes("measured_prompt_v2_execution"));
    assert.equal(facts.safety_promotion, false); assert.equal(facts.model_effectiveness, "Unknown"); assert.equal(facts.models_started, false);
  }
});
test("installation option descriptors refuse non-enumerable fields and accessors without evaluating them", t => {
  const x = target(t); let reads = 0;
  const options = { closure: {}, selectionObjectDigest: canonicalDigest("not a selection"), role: "parent" };
  Object.defineProperty(options, "target", { value: x.handle });
  assert.throws(() => planArtificialPersonalPromptApply(options), /accessor refused/);
  Object.defineProperty(options, "unapproved", { get() { reads++; throw new Error("getter ran"); } });
  assert.throws(() => planArtificialPersonalPromptApply(options), /unknown installation option/);
  assert.equal(reads, 0);
});
test("synthetic approved closure applies exact public bundle and restores actual bytes on one artificial target", t => {
  const f = syntheticClosure(t), x = target(t);
  const base = plan(f, x, "parent"); assert.equal(applyArtificialPersonalPromptPlan(base.handle, base.digest).status, "applied_artificial");
  const before = Object.fromEntries(read(f.closure.storeRoot, f.candidate.parent_asset.content_digest).files.map(file =>
    [basename(file.path), readFileSync(join(x.root, ".agents/prompts", basename(file.path)))]));
  const candidate = plan(f, x, "candidate"); candidate.plan.asset.version = "caller mutation ignored";
  const trust = [...f.closure.trustedHumanDecisionAuthorities]; f.closure.trustedHumanDecisionAuthorities.length = 0;
  assert.equal(applyArtificialPersonalPromptPlan(candidate.handle, candidate.digest).status, "applied_artificial");
  f.closure.trustedHumanDecisionAuthorities.push(...trust);
  assert.throws(() => applyArtificialPersonalPromptPlan(candidate.handle, candidate.digest), /owned apply plan/);
  assert.notDeepEqual(readFileSync(join(x.root, ".agents/prompts/skill-verify.md")), before["skill-verify.md"]);
  writeFileSync(join(x.root, "README.md"), "New unowned notes are preserved.\n");
  const restore = planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
  assert.equal(restoreArtificialPersonalPromptPlan(restore.handle, restore.digest).status, "restored_artificial");
  for (const [name, bytes] of Object.entries(before)) assert.deepEqual(readFileSync(join(x.root, ".agents/prompts", name)), bytes);
  assert.equal(readFileSync(join(x.root, "README.md"), "utf8"), "New unowned notes are preserved.\n");
});
test("fake target, missing adoption trust, foreign selection and changed target refuse before writes", t => {
  const f = syntheticClosure(t), x = target(t), before = captureApplyTarget(x.root).binding;
  assert.throws(() => plan(f, { handle: { ...x.handle } }, "parent"), /opaque/);
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: { ...f.closure, trustedHumanDecisionAuthorities: [] },
    selectionObjectDigest: f.parentSelection, role: "parent" }), /trusted/);
  assert.deepEqual(captureApplyTarget(x.root).binding, before);
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: f.closure,
    selectionObjectDigest: f.parentSelection, role: "candidate" }), /approved role lock/);
  let reads = 0;
  const hostile = { ...f.closure, trustedHumanDecisionAuthorities: [{ get authority() { reads++; throw new Error("getter ran"); } }] };
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: hostile,
    selectionObjectDigest: f.parentSelection, role: "parent" }), /accessor refused/);
  assert.equal(reads, 0);
  const other = target(t);
  const options = { target: x.handle, closure: f.closure, selectionObjectDigest: f.parentSelection, role: "parent" };
  const originalTrust = f.closure.trustedHumanDecisionAuthorities[0];
  options.closure = { ...f.closure, trustedHumanDecisionAuthorities: [new Proxy(originalTrust, {
    ownKeys(value) { options.target = other.handle; return Reflect.ownKeys(value); }
  })] };
  const ownedPlan = planArtificialPersonalPromptApply(options);
  assert.equal(ownedPlan.plan.target_root, x.root);
  assert.equal(options.target, other.handle);
  // Target binding still belongs to the initially captured x capability.
  writeFileSync(join(x.root, "README.md"), "captured target drift");
  assert.throws(() => applyArtificialPersonalPromptPlan(ownedPlan.handle, ownedPlan.digest), /changed after plan/);
  writeFileSync(join(x.root, "README.md"), "Project-owned artificial notes.\n");
  assert.equal(existsSync(join(other.root, ".agents/prompts/skill-verify.md")), false);
  const partial = { ...read(f.closure.storeRoot, f.closure.receiptObjectDigest), state: "partial" };
  const partialDigest = putContentAddressedJson({ storeRoot: f.closure.storeRoot, artifact: partial }).digest;
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: { ...f.closure, receiptObjectDigest: partialDigest },
    selectionObjectDigest: f.parentSelection, role: "parent" }));
  const p = plan(f, x, "parent");
  assert.throws(() => applyArtificialPersonalPromptPlan(p.handle, canonicalDigest("wrong pin")), /confirmation required/);
  assert.deepEqual(captureApplyTarget(x.root).binding, before);
  writeFileSync(join(x.root, "README.md"), "post-plan drift");
  assert.throws(() => applyArtificialPersonalPromptPlan(p.handle, p.digest), /changed after plan/);
  assert.equal(existsSync(join(x.root, ".agents/prompts/skill-verify.md")), false);
});
test("links and normal installer states cannot extend artificial capability to a real target", t => {
  const f = syntheticClosure(t);
  for (const kind of ["symlink", "hardlink", "legacy", "git"]) {
    const x = target(t); mkdirSync(join(x.root, ".agents/prompts"), { recursive: true });
    if (kind === "symlink") symlinkSync(join(x.root, "README.md"), join(x.root, ".agents/prompts/skill-verify.md"));
    if (kind === "hardlink") linkSync(join(x.root, "README.md"), join(x.root, ".agents/prompts/skill-verify.md"));
    if (kind === "legacy") { mkdirSync(join(x.root, ".agent-spectrum-kernel")); writeFileSync(join(x.root, ".agent-spectrum-kernel/codex-install-state.json"), "{}"); }
    if (kind === "git") mkdirSync(join(x.root, ".git"));
    assert.throws(() => plan(f, x, "parent"));
  }
});
test("stale rollback selection and local candidate drift cannot be restored", t => {
  const f = syntheticClosure(t), x = target(t);
  for (const role of ["parent", "candidate"]) { const p = plan(f, x, role); applyArtificialPersonalPromptPlan(p.handle, p.digest); }
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.parentSelection }), /fresh explicit rollback/);
  const statePath = join(x.root, ".agent-spectrum-kernel/personal-prompt-artificial-state.json");
  const originalState = readFileSync(statePath), forged = JSON.parse(originalState);
  forged.rollback.files[".agents/prompts/skill-verify.md"].content = "foreign rollback snapshot";
  writeFileSync(statePath, JSON.stringify(forged));
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /snapshot transplant/);
  writeFileSync(statePath, originalState);
  const wrongDigest = JSON.parse(originalState), verifyPath = ".agents/prompts/skill-verify.md";
  wrongDigest.rollback.files[verifyPath].sha256 = wrongDigest.managed_files[verifyPath].sha256;
  wrongDigest.previous_successful_state.managed_files[verifyPath].sha256 = wrongDigest.managed_files[verifyPath].sha256;
  writeFileSync(statePath, JSON.stringify(wrongDigest));
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /digest snapshot transplant/);
  writeFileSync(statePath, originalState);
  writeFileSync(join(x.root, ".agents/prompts/skill-verify.md"), "local drift");
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /candidate byte drift/);
  assert.equal(readFileSync(join(x.root, ".agents/prompts/skill-verify.md"), "utf8"), "local drift");
});

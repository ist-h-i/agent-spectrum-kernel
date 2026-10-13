// Evaluation-copy Portfolio authoring only; never installs an Asset.
import assert from "node:assert/strict";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildPortfolioManifest, publishPortfolioManifest, buildPortfolioAuthorityContext,
  applyPortfolioTransitions, resolvePortfolioSelection } from "./portfolio-manager.mjs";
import { inspectPersonalEvolution, preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { assertPersonalEvolutionFields, freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";

const read = (root, digest) => readContentAddressedJson({ storeRoot: root, digest }).value;
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const blueprintKeys = ["candidate_id", "parent_asset", "parent_portfolio", "candidate_asset", "registry", "factors",
  "evaluation_scope", "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
const observationKeys = ["observation_id", "repository_id", "task_ids", "evidence_refs", "evidence_status", "correction",
  "intended_mechanism", "applicability", "non_applicability", "privacy"];
const manifestRef = (manifest, digest) => ({ portfolio_id: manifest.portfolio_id, revision: manifest.revision,
  manifest_digest: digest, asset_set_digest: manifest.asset_set_digest });
function contentOf(manifest) {
  const { asset_set_digest, selection_basis_digest, ...draft } = structuredClone(manifest); return draft;
}
function drafts(candidate, current, baselineRevision, challengerRevision) {
  assert.notEqual(baselineRevision, current.revision); assert.notEqual(challengerRevision, current.revision);
  assert.notEqual(baselineRevision, challengerRevision);
  const baseline = buildPortfolioManifest({ ...contentOf(current), registry: candidate.registry, revision: baselineRevision,
    rollback: { ...current.rollback, mode: "exact", target: manifestRef(current, canonicalDigest(current)) } });
  const challenger = contentOf(baseline); challenger.revision = challengerRevision;
  const entries = challenger.entries.filter(entry => equal(entry.asset, candidate.parent_asset)); assert.equal(entries.length, 1);
  const targetId = entries[0].entry_id;
  Object.assign(entries[0], { asset: candidate.candidate_asset, expected_registry_state: "candidate",
    role: "experimental", assurance_lane: "exploratory", evidence_requirement_ids: [], exposure: { mode: "shadow", canary_percent: null } });
  // Activation proofs for the parent cannot become candidate evidence.
  challenger.evidence_requirements = challenger.evidence_requirements.map(item => ({ ...item,
    entry_ids: item.entry_ids.filter(id => id !== targetId) })).filter(item => item.entry_ids.length);
  challenger.rollback = structuredClone(baseline.rollback);
  return { baseline, challenger: buildPortfolioManifest(challenger) };
}

export function planPersonalEvolutionBaselineAlignment(options) {
  inspectPersonalEvolution(options);
  const { storeRoot, preparationObjectDigest, baselineRevision, challengerRevision, portfolioAuthority } = options;
  const prep = read(storeRoot, preparationObjectDigest), candidate = read(storeRoot, prep.candidate_object_digest);
  const current = read(storeRoot, candidate.parent_portfolio.manifest_digest);
  let snapshot = read(storeRoot, candidate.registry.snapshot_digest);
  while (canonicalDigest(snapshot) !== current.registry.snapshot_digest && snapshot.predecessor) snapshot = read(storeRoot, snapshot.predecessor.snapshot_digest);
  assert.equal(canonicalDigest(snapshot), current.registry.snapshot_digest, "Registry must extend the existing baseline, not rebase a foreign snapshot");
  const child = read(storeRoot, candidate.candidate_asset.record_digest);
  assert.equal(child.evaluation_history.status, "not_evaluated", "alignment must be pre-result for an unevaluated candidate");
  assert.equal(child.safety.classifications.includes("high_impact"), false, "high-impact candidate requires its separate approval path");
  const pair = drafts(candidate, current, baselineRevision, challengerRevision);
  // Preflight both drafts and transitions before any publication.
  const refs = Object.fromEntries(Object.entries(pair).map(([role, manifest]) => [role, manifestRef(manifest, canonicalDigest(manifest))]));
  const contexts = Object.fromEntries(Object.entries(refs).map(([role, manifest]) => [role, buildPortfolioAuthorityContext({
    portfolioId: current.portfolio_id, repositoryId: current.repository_id, scopeId: current.scope_id,
    predecessorLockDigest: candidate.parent_portfolio.lock_digest,
    transitions: [{ manifest: manifestRef(current, candidate.parent_portfolio.manifest_digest), from_state: "current", to_state: "historical" },
      { manifest, from_state: null, to_state: "current" }], authority: portfolioAuthority })]));
  for (const draft of Object.values(pair)) publishPortfolioManifest({ storeRoot, draft,
    trustedAssetAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  const body = { kind: "personal_pre_result_baseline_alignment_v1", preparation_object_digest: preparationObjectDigest,
    old_parent_portfolio: candidate.parent_portfolio, candidate_digest: candidate.candidate_digest,
    registry: candidate.registry, manifests: refs, authority_contexts: contexts, authority_implied: false };
  const plan = { ...body, alignment_digest: canonicalDigest(body) };
  return freezePersonalEvolutionValue({ plan, object_digest: putContentAddressedJson({ storeRoot, artifact: plan }).digest,
    authority_implied: false, lifecycle_mutated: false, models_started: false });
}

export function applyPersonalEvolutionBaselineAlignment(options) {
  const { storeRoot, alignmentObjectDigest, trustedAlignmentObjectDigests = [], trustedPortfolioAuthorityContexts = [], selectorContext } = options;
  assert.ok(trustedAlignmentObjectDigests.includes(alignmentObjectDigest), "independently pinned pre-result alignment required");
  const plan = read(storeRoot, alignmentObjectDigest);
  assertPersonalEvolutionFields(plan, ["kind", "preparation_object_digest", "old_parent_portfolio", "candidate_digest", "registry",
    "manifests", "authority_contexts", "authority_implied", "alignment_digest"], "alignment plan");
  const { alignment_digest, ...body } = plan;
  assert.equal(plan.kind, "personal_pre_result_baseline_alignment_v1"); assert.equal(plan.authority_implied, false);
  assert.equal(canonicalDigest(body), alignment_digest);
  inspectPersonalEvolution({ ...options, preparationObjectDigest: plan.preparation_object_digest });
  const prep = read(storeRoot, plan.preparation_object_digest), candidate = read(storeRoot, prep.candidate_object_digest);
  assert.equal(candidate.candidate_digest, plan.candidate_digest); assert.ok(equal(candidate.registry, plan.registry));
  assert.ok(equal(candidate.parent_portfolio, plan.old_parent_portfolio));
  const current = read(storeRoot, candidate.parent_portfolio.manifest_digest);
  const pair = drafts(candidate, current, plan.manifests.baseline.revision, plan.manifests.challenger.revision);
  for (const role of ["baseline", "challenger"]) {
    assert.ok(equal(manifestRef(pair[role], canonicalDigest(pair[role])), plan.manifests[role]), "aligned manifest policy drift");
    assert.ok(equal(read(storeRoot, plan.manifests[role].manifest_digest), pair[role]));
    assert.ok(trustedPortfolioAuthorityContexts.some(value => equal(value, plan.authority_contexts[role])), "separate exact Portfolio alignment authority required");
    const expected = buildPortfolioAuthorityContext({ portfolioId: current.portfolio_id, repositoryId: current.repository_id, scopeId: current.scope_id,
      predecessorLockDigest: candidate.parent_portfolio.lock_digest,
      transitions: [{ manifest: manifestRef(current, candidate.parent_portfolio.manifest_digest), from_state: "current", to_state: "historical" },
        { manifest: plan.manifests[role], from_state: null, to_state: "current" }], authority: plan.authority_contexts[role].authority });
    assert.ok(equal(expected, plan.authority_contexts[role]), "alignment transition drift");
  }
  const roles = {};
  for (const role of ["baseline", "challenger"]) {
    const lock = applyPortfolioTransitions({ ...options, predecessorLockDigest: candidate.parent_portfolio.lock_digest,
      authorityContext: plan.authority_contexts[role] });
    const selected = resolvePortfolioSelection({ ...options, lockDigest: lock.lock_digest,
      selectorContext: { ...selectorContext, portfolio_lock_digest: lock.lock_digest } });
    if (selected.selection.decision !== "selected") return freezePersonalEvolutionValue({
      status: "NOT_RUN", action: "hold", quality: null, blocked_role: role,
      selection_decision: selected.selection.decision, reasons: selected.selection.reasons,
      alignment_object_digest: alignmentObjectDigest, models_started: false,
      installation_implied: false, authority_implied: false, original_heads_unchanged: true,
      scope: "dedicated_evaluation_CAS_branches_only", immutable_metadata_may_have_been_published: true,
    });
    const expected = role === "baseline" ? candidate.parent_asset : candidate.candidate_asset;
    assert.ok(selected.selection.selected_assets.some(entry => equal(entry.asset, expected)), "exact aligned role Asset selection missing");
    roles[role] = { role, portfolio: { ...plan.manifests[role], lock_digest: lock.lock_digest },
      registry_snapshot_digest: candidate.registry.snapshot_digest, selection_object_digest: selected.selection_object_digest,
      selection_digest: selected.selection.selection_digest, selected_asset: expected };
  }
  const observation = read(storeRoot, prep.observation_object_digest);
  const prepared = preparePersonalEvolutionCandidate({ ...options,
    observationInput: Object.fromEntries(observationKeys.map(key => [key, observation[key]])),
    blueprint: { ...Object.fromEntries(blueprintKeys.map(key => [key, candidate[key]])), parent_portfolio: roles.baseline.portfolio,
      rollback: { ...candidate.rollback, parent_portfolio: roles.baseline.portfolio } },
    generationActor: candidate.generation.actor, holdoutTaskIds: prep.holdout_task_ids });
  return freezePersonalEvolutionValue({ prepared, roles, alignment_object_digest: alignmentObjectDigest,
    models_started: false, installation_implied: false, authority_implied: false,
    scope: "dedicated_evaluation_CAS_branches_only", original_heads_unchanged: true });
}

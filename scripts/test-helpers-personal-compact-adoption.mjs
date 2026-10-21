// Fresh synthetic registration of the current renderer bytes, never a historical
// approval, model call or actual target. Used only by owned Git fixture tests.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { createEmptyAssetRegistry, registerAsset } from "./asset-registry.mjs";
import { createEmptyPortfolioLock, publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions, resolvePortfolioSelection } from "./portfolio-manager.mjs";
import { buildEvolutionCandidate, publishEvolutionCandidate, buildEvolutionExperiment, publishEvolutionExperiment, computePromptV2ExactProjectionDigests } from "./evolution-loop.mjs";
const ref = value => Object.fromEntries(["portfolio_id", "revision", "manifest_digest", "asset_set_digest"].map(key => [key, value[key]]));
const assetRef = (d, publication) => ({ asset_type: d.asset_type, stable_id: d.stable_id, version: d.version, record_digest: publication.record_digest, content_digest: publication.content_digest });
export function freshCompactAdoptionSeed({ root, storeRoot, renderedSeed, candidateAppendOnly, reference, adapter }) {
  const read = digest => readContentAddressedJson({ storeRoot, digest }).value;
  const contents = read(adapter.baseline_asset.content_digest), descriptor = structuredClone(read(adapter.baseline_asset.record_digest));
  delete descriptor.object_kind; descriptor.version = "synthetic-compact-parent";
  descriptor.safety = { status: "supported", classifications: ["synthetic_source_review_only"], constraint_refs: [canonicalDigest("synthetic compact controls; not actual approval")] };
  descriptor.mechanism_and_evidence = { status: "not_evaluated", mechanism_refs: [], evidence_refs: [] };
  descriptor.evaluation_history = { status: "not_evaluated", evidence_refs: [], cost: null };
  const rendered = new Map(renderedSeed.map(item => [item.metadata.prompt_name, item.content]));
  const register = (description, sourceRoot, predecessorSnapshotDigest, candidate = false) => {
    description.content = { package_format: "canonical_json_base64_files", files: contents.files.map(file => {
      const bytes = Buffer.from(candidate && !candidateAppendOnly ? "Synthetic replacement deliberately missing compact controls.\n"
        : rendered.get(basename(file.path)) + (candidate ? "\nSynthetic owned-fixture append-only instruction.\n" : ""));
      const path = join(sourceRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
      return { path: file.path, media_type: file.media_type, raw_digest: comparisonHash(bytes) };
    }) };
    description.type_extension.renderer.projection_digest = canonicalDigest(description.content.files.map(({ path, raw_digest }) => ({ path, raw_digest })));
    description.type_extension.entrypoints = description.content.files.map(file => file.path).sort();
    return registerAsset({ storeRoot, sourceRoot, predecessorSnapshotDigest, descriptor: description });
  };
  const empty = createEmptyAssetRegistry({ storeRoot, registryId: "synthetic-compact", repositoryId: reference.registry.repository_id, scopeId: reference.registry.scope_id });
  const parent = register(descriptor, join(root, "compact-parent"), empty.snapshot_digest), parentAsset = assetRef(descriptor, parent);
  const child = structuredClone(descriptor); child.version = "synthetic-compact-candidate";
  child.derivation = { kind: "full_content_revision", parent: parentAsset, delta: { kind: "replacement", summary: "synthetic compact append-only candidate" } };
  child.maintenance.rollback.target = parentAsset;
  const candidateAssetPublication = register(child, join(root, "compact-candidate"), parent.snapshot_digest, true), childAsset = assetRef(child, candidateAssetPublication);
  const registry = { ...reference.registry, registry_id: "synthetic-compact", snapshot_digest: candidateAssetPublication.snapshot_digest, snapshot_revision: candidateAssetPublication.snapshot_revision };
  const source = "f".repeat(40), authorityContexts = [];
  const parentDraft = structuredClone(read(adapter.baseline_portfolio.manifest_digest));
  delete parentDraft.asset_set_digest; delete parentDraft.selection_basis_digest;
  parentDraft.registry = registry; parentDraft.revision = "synthetic-compact-parent"; parentDraft.source_revision = source;
  parentDraft.kernel_foundation.source_revision = source; parentDraft.entries[0].asset = parentAsset;
  const baseline = publishPortfolioManifest({ storeRoot, draft: parentDraft });
  const lock0 = createEmptyPortfolioLock({ storeRoot, portfolioId: baseline.portfolio_id, repositoryId: registry.repository_id, scopeId: registry.scope_id });
  const transition = (previous, transitions) => {
    const context = buildPortfolioAuthorityContext({ portfolioId: baseline.portfolio_id, repositoryId: registry.repository_id, scopeId: registry.scope_id,
      predecessorLockDigest: previous, transitions, authority: { ...adapter.portfolio_authority_contexts[0].authority, authority_id: "synthetic-compact-only" } });
    authorityContexts.push(context); return applyPortfolioTransitions({ storeRoot, predecessorLockDigest: previous, authorityContext: context, trustedPortfolioAuthorityContexts: authorityContexts }).lock_digest;
  };
  const baselineLock = transition(lock0.lock_digest, [{ manifest: ref(baseline), from_state: null, to_state: "current" }]);
  const context = structuredClone(read(read(adapter.baseline_selection.selection_object_digest).context_object_digest)); delete context.context_digest;
  context.source_revision = source; context.task_class = "verification";
  context.tree_digest = canonicalDigest("synthetic current compact fixture; no execution");
  context.current_state_refs = [{ state_id: "repository-tree", state_digest: context.tree_digest }];
  const select = lockDigest => resolvePortfolioSelection({ storeRoot, lockDigest, trustedPortfolioAuthorityContexts: authorityContexts, selectorContext: { ...context, portfolio_lock_digest: lockDigest } });
  const baselineSelection = select(baselineLock);
  const challengerDraft = structuredClone(read(adapter.challenger_portfolio.manifest_digest));
  delete challengerDraft.asset_set_digest; delete challengerDraft.selection_basis_digest;
  challengerDraft.registry = registry; challengerDraft.revision = "synthetic-compact-challenger"; challengerDraft.source_revision = source;
  challengerDraft.kernel_foundation.source_revision = source; challengerDraft.entries[0].asset = childAsset; challengerDraft.rollback.target = ref(baseline);
  const challenger = publishPortfolioManifest({ storeRoot, draft: challengerDraft });
  const challengerLock = transition(baselineLock, [{ manifest: ref(baseline), from_state: "current", to_state: "historical" }, { manifest: ref(challenger), from_state: null, to_state: "current" }]);
  const challengerSelection = select(challengerLock);
  const candidate = structuredClone(read(adapter.evolution.candidate_object_digest)); candidate.parent_asset = parentAsset; candidate.candidate_asset = childAsset;
  candidate.registry = registry; candidate.parent_portfolio = { ...ref(baseline), lock_digest: baselineLock };
  candidate.rollback.parent_asset = parentAsset; candidate.rollback.parent_portfolio = candidate.parent_portfolio;
  candidate.delta.delta_digest = canonicalDigest({ parent: parentAsset, candidate: childAsset }); candidate.factors.changed[0].identity_digest = candidate.delta.delta_digest;
  const published = publishEvolutionCandidate({ storeRoot, candidate: buildEvolutionCandidate(candidate) });
  const experiment = structuredClone(read(adapter.evolution.experiment_object_digest));
  experiment.candidate_digest = published.candidate_digest; experiment.candidate_object_digest = published.object_digest;
  experiment.causal_design.candidate_factors_digest = canonicalDigest(candidate.factors);
  experiment.protocol.source_revision = source; experiment.protocol.tree_digest = canonicalDigest("synthetic current compact fixture; no execution");
  const role = (name, asset, manifest, lock, selection) => ({ role: name, selected_asset: asset, registry_snapshot_digest: registry.snapshot_digest,
    portfolio: { ...ref(manifest), lock_digest: lock }, selection_digest: selection.selection.selection_digest, selection_object_digest: selection.selection_object_digest });
  experiment.roles = { baseline: role("baseline", parentAsset, baseline, baselineLock, baselineSelection), challenger: role("challenger", childAsset, challenger, challengerLock, challengerSelection) };
  Object.assign(experiment.projection, computePromptV2ExactProjectionDigests(experiment.roles));
  const exp = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(experiment) });
  return { ...adapter, baseline_selection: baselineSelection, challenger_portfolio: ref(challenger), portfolio_authority_contexts: authorityContexts,
    evolution: { candidate_object_digest: published.object_digest, experiment_object_digest: exp.object_digest } };
}

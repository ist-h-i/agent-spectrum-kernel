// Shared artificial fixtures for personal pair and roundtrip tests. No model,
// provider transport, private evaluator or production authority is exercised.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson, putContentAddressedJson } from "./content-addressed-store.mjs";
import { preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { createEmptyAssetRegistry, registerAsset } from "./asset-registry.mjs";
import { createEmptyPortfolioLock, publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions, resolvePortfolioSelection } from "./portfolio-manager.mjs";
import { preparePersonalEvolutionGenerationRequest, importPersonalEvolutionGenerationResult } from "./ask-personal-evolution-generation.mjs";
import { planPersonalEvolutionBaselineAlignment, applyPersonalEvolutionBaselineAlignment } from "./ask-personal-evolution-alignment.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, computePromptV2ExactProjectionDigests } from "./evolution-loop.mjs";
import { buildPersonalPromptMaterialization, personalPromptInput } from "./ask-personal-prompt-materialization.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { syntheticPrimarySource } from "./test-helpers-primary-evaluation-producer.mjs";
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer } from "./ask-primary-evaluation-producer.mjs";
import { computeEngineeringResultId, computeEngineeringResultDigest } from "./ask-benchmark-portfolio-score.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";
import { withPrimaryEvaluationProducer } from "./ask-primary-evaluation-scope.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { primaryScoringRoot } from "./ask-primary-scoring-version.mjs";
import { buildPrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";

const repository = resolve(import.meta.dirname, ".."), fixture = join(repository, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"))), adapter = reference.adapters[0];
const read = (root, digest) => readContentAddressedJson({ storeRoot: root, digest }).value;
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`); };
const assetRef = record => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, record[key]]));
const ref = publication => Object.fromEntries(["portfolio_id", "revision", "manifest_digest", "asset_set_digest"].map(key => [key, publication[key]]));

export function setup(t, { changeSelectedEntrypoint = true, fixtureIds = ["mn-build-option-update"],
  sourceRevision = "f".repeat(40), deferGeneration = false, ...alignmentOptions } = {}) {
  fixtureIds = [...fixtureIds].sort();
  const taskClasses = [...new Set(fixtureIds.map(id => buildPrimaryFixtureRecipe(id).task_class))].sort();
  const root = realpathSync(mkdtempSync(join(tmpdir(), "personal-primary-pair-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = join(root, "store"); cpSync(join(fixture, "store"), storeRoot, { recursive: true });
  const record = structuredClone(read(storeRoot, adapter.baseline_asset.record_digest));
  const content = read(storeRoot, adapter.baseline_asset.content_digest);
  const descriptor = { ...record }; delete descriptor.object_kind;
  descriptor.version = "fake-parent-1"; descriptor.applicability.task_classes.included = taskClasses;
  descriptor.applicability.task_classes.excluded = [];
  const sourceRoot = join(root, "source");
  descriptor.content = { package_format: "canonical_json_base64_files", files: content.files.map(file => {
    const bytes = Buffer.from(file.bytes_base64, "base64"); write(join(sourceRoot, file.path), bytes);
    return { path: file.path, media_type: file.media_type, raw_digest: comparisonHash(bytes) };
  }) };
  const empty = createEmptyAssetRegistry({ storeRoot, registryId: "personal-pair-fake", repositoryId: reference.registry.repository_id, scopeId: reference.registry.scope_id });
  const parent = registerAsset({ storeRoot, sourceRoot, predecessorSnapshotDigest: empty.snapshot_digest, descriptor });
  const parentAsset = { ...assetRef(descriptor), record_digest: parent.record_digest, content_digest: parent.content_digest };
  const registry = { ...reference.registry, registry_id: "personal-pair-fake", snapshot_digest: parent.snapshot_digest, snapshot_revision: parent.snapshot_revision };
  const m = structuredClone(read(storeRoot, adapter.baseline_portfolio.manifest_digest));
  delete m.asset_set_digest; delete m.selection_basis_digest;
  m.portfolio_id = "personal-pair-fake"; m.revision = "fake-parent-portfolio"; m.registry = registry; m.source_revision = sourceRevision;
  m.selection_context_allowlist.task_classes = taskClasses;
  m.selectors.task_classes.included = taskClasses;
  m.entries[0].selectors.task_classes.included = taskClasses; m.entries[0].asset = parentAsset;
  const lock0 = createEmptyPortfolioLock({ storeRoot, portfolioId: m.portfolio_id, repositoryId: m.repository_id, scopeId: m.scope_id });
  const manifest = publishPortfolioManifest({ storeRoot, draft: m });
  const authority = { ...adapter.portfolio_authority_contexts[0].authority, authority_id: "synthetic-personal-parent-authority" };
  const parentAuthority = buildPortfolioAuthorityContext({ portfolioId: m.portfolio_id, repositoryId: m.repository_id, scopeId: m.scope_id,
    predecessorLockDigest: lock0.lock_digest, transitions: [{ manifest: ref(manifest), from_state: null, to_state: "current" }], authority });
  const lock = applyPortfolioTransitions({ storeRoot, predecessorLockDigest: lock0.lock_digest, authorityContext: parentAuthority });
  const original = read(storeRoot, adapter.evolution.candidate_object_digest);
  const keys = ["candidate_id", "parent_asset", "parent_portfolio", "registry", "factors", "evaluation_scope", "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const policy = Object.fromEntries(keys.map(key => [key, original[key]]));
  policy.parent_asset = parentAsset; policy.parent_portfolio = { ...ref(manifest), lock_digest: lock.lock_digest }; policy.registry = registry;
  policy.rollback = { ...policy.rollback, parent_asset: parentAsset, parent_portfolio: policy.parent_portfolio };
  policy.evaluation_scope = { fixture_ids: fixtureIds, task_classes: taskClasses, exclusions: [] };
  const generation = { storeRoot, blueprint: policy, generationActor: original.generation.actor, holdoutTaskIds: fixtureIds,
    requestedVersion: "fake-candidate-2", requestId: "fake-fresh-pair", trustedPortfolioAuthorityContexts: [parentAuthority],
    observationInput: { observation_id: "fake-observation", repository_id: registry.repository_id, task_ids: ["different-observed-task"],
      evidence_refs: [{ artifact_id: "synthetic-bounded-summary", digest: canonicalDigest("synthetic") }], evidence_status: "Supported",
      correction: "Preserve explicit requirement target.", intended_mechanism: "Bound instruction use.", applicability: "Configuration tasks.",
      non_applicability: ["Not evidence of model effectiveness."], privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } } };
  const requested = preparePersonalEvolutionGenerationRequest(generation);
  const child = structuredClone(descriptor); child.version = generation.requestedVersion;
  child.derivation = { kind: "full_content_revision", parent: parentAsset, delta: { kind: "replacement", summary: "synthetic instruction revision" } };
  child.maintenance.rollback.target = parentAsset;
  child.safety = { status: "not_evaluated", classifications: [], constraint_refs: [] };
  child.mechanism_and_evidence = { status: "not_evaluated", mechanism_refs: [], evidence_refs: [] };
  child.evaluation_history = { status: "not_evaluated", evidence_refs: [], cost: null };
  const childRoot = join(root, "child-source");
  child.content.files = child.content.files.map(file => { const changed = changeSelectedEntrypoint || file.path !== descriptor.type_extension.entrypoints[1];
    const bytes = Buffer.concat([readFileSync(join(sourceRoot, file.path)), Buffer.from(changed ? "\nSynthetic scoped target rule.\n" : "")]);
    write(join(childRoot, file.path), bytes); return { ...file, raw_digest: comparisonHash(bytes) }; });
  child.type_extension.renderer.projection_digest = canonicalDigest(child.content.files.map(({ path, raw_digest }) => ({ path, raw_digest })));
  const pending = { root, storeRoot, generation, requested, child, childRoot, descriptor, parentAsset, sourceRoot,
    content, original, policy, registry, parentAuthority, authority, fixtureIds, taskClasses, sourceRevision };
  if (deferGeneration) return pending;
  const imported = importPersonalEvolutionGenerationResult({ ...generation, sourceRoot: childRoot, requestObjectDigest: requested.request_object_digest,
    result: { request_digest: requested.request.request_digest, observation_digest: requested.request.observation_digest, parent_asset: parentAsset,
      candidate_descriptor: child, privacy: { classification: "caller_reviewed_asset_source", private_answers_included: false, raw_task_history_included: false } } });
  return finishPersonalPairSetup(pending, imported, alignmentOptions);
}

export function finishPersonalPairSetup(pending, imported, { sourceClassified = true,
  reviewedEvaluationStatus = "not_evaluated", deferAlignment = false } = {}) {
  const { root, storeRoot, generation, child, descriptor, parentAsset, sourceRoot, content, original,
    policy, registry, parentAuthority, authority, fixtureIds, taskClasses, sourceRevision } = pending;
  const childRoot = pending.childRoot;
  // External SYNTHETIC source review is independent of model-quality evaluation.
  // It registers a distinct immutable version, never edits the generated record
  // or relabels the original generation receipt as a registration of this one.
  let preparationObjectDigest = imported.prepared.preparation_object_digest;
  let sourceReview = null;
  if (sourceClassified) {
    const reviewed = structuredClone(child); reviewed.version = "fake-candidate-2-source-reviewed";
    const classification = { kind: "synthetic_external_source_classification", original_candidate_asset: imported.prepared.candidate.candidate_asset,
      source_content_digest: imported.prepared.candidate.candidate_asset.content_digest, real_authority: false };
    const classificationDigest = putContentAddressedJson({ storeRoot, artifact: classification }).digest;
    reviewed.safety = { status: "supported", classifications: ["synthetic_source_review_only"],
      constraint_refs: [classificationDigest] };
    if (reviewedEvaluationStatus !== "not_evaluated") reviewed.evaluation_history = {
      status: reviewedEvaluationStatus, evidence_refs: ["synthetic_prior_evaluation"], cost: null };
    const registered = registerAsset({ storeRoot, sourceRoot: childRoot, predecessorSnapshotDigest: imported.prepared.candidate.registry.snapshot_digest, descriptor: reviewed });
    const reviewedAsset = { ...assetRef(reviewed), record_digest: registered.record_digest, content_digest: registered.content_digest };
    sourceReview = { kind: "synthetic_external_source_review", original_candidate_asset: imported.prepared.candidate.candidate_asset,
      reviewed_asset: reviewedAsset, generated_content_unchanged: true, quality_evidence: "not_evaluated", real_authority: false };
    putContentAddressedJson({ storeRoot, artifact: sourceReview });
    const prepared = preparePersonalEvolutionCandidate({ ...generation, blueprint: { ...policy, candidate_asset: reviewedAsset,
      registry: { ...registry, snapshot_digest: registered.snapshot_digest, snapshot_revision: registered.snapshot_revision } } });
    preparationObjectDigest = prepared.preparation_object_digest;
  }
  const select = read(storeRoot, adapter.baseline_selection.selection_object_digest);
  const selectorContext = structuredClone(read(storeRoot, select.context_object_digest)); delete selectorContext.context_digest;
  selectorContext.task_class = buildPrimaryFixtureRecipe(fixtureIds[0]).task_class; selectorContext.source_revision = sourceRevision;
  const alignmentInput = { storeRoot, preparationObjectDigest,
    trustedPortfolioAuthorityContexts: [parentAuthority], baselineRevision: "fake-aligned-parent", challengerRevision: "fake-aligned-candidate", portfolioAuthority: authority };
  if (deferAlignment) return { root, storeRoot, alignmentInput, selectorContext, parentAuthority };
  const planned = planPersonalEvolutionBaselineAlignment(alignmentInput);
  const alignedTrust = [parentAuthority, ...Object.values(planned.plan.authority_contexts)];
  const alignArgs = { ...alignmentInput, alignmentObjectDigest: planned.object_digest, trustedAlignmentObjectDigests: [planned.object_digest],
    trustedPortfolioAuthorityContexts: alignedTrust, selectorContext };
  const aligned = applyPersonalEvolutionBaselineAlignment(alignArgs);
  if (aligned.status === "NOT_RUN") return { root, storeRoot, planned, alignArgs, aligned, imported, parentAsset, sourceReview };
  const draft = structuredClone(read(storeRoot, adapter.evolution.experiment_object_digest));
  draft.candidate_digest = aligned.prepared.candidate.candidate_digest; draft.candidate_object_digest = aligned.prepared.preparation.candidate_object_digest;
  draft.roles = aligned.roles; draft.protocol.source_revision = sourceRevision; draft.protocol.model = "gpt-5.6-sol";
  Object.assign(draft.protocol, { fixture_ids: fixtureIds, task_classes: taskClasses,
    exclusions: aligned.prepared.candidate.evaluation_scope.exclusions,
    candidate_evaluation_scope_digest: canonicalDigest(aligned.prepared.candidate.evaluation_scope), repetitions: 1 });
  draft.protocol.cli.version = "fake-not-launched";
  Object.assign(draft.projection, computePromptV2ExactProjectionDigests(aligned.roles));
  const experiment = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
  const args = { storeRoot, preparationObjectDigest: aligned.prepared.preparation_object_digest, experimentObjectDigest: experiment.object_digest,
    trustedExperimentObjectDigests: [experiment.object_digest], trustedExperimentAuthorities: [draft.authority], trustedPortfolioAuthorityContexts: alignedTrust,
    evaluationAuthority: { authority_id: "synthetic-saved-grading-controller", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") } };
  return { ...pending, planned, alignArgs, aligned, args, imported, sourceReview,
    entrypoint: descriptor.type_extension.entrypoints[1] };
}
export function blocksFor(t, f, runtimeVersion) {
  const blocks = {}, sources = {};
  for (const role of ["baseline", "challenger"]) {
    const p = syntheticPrimarySource(t, { scenario: "pending" }); sources[role] = p;
    p.plan.run_id += `-${role}`; p.plan.config.model = "gpt-5.6-sol";
    const material = buildPersonalPromptMaterialization({ storeRoot: f.storeRoot, registrySnapshotDigest: f.aligned.prepared.candidate.registry.snapshot_digest,
      asset: f.aligned.roles[role].selected_asset, entrypoint: f.entrypoint, trustedAssetAuthorityContexts: [], ...(runtimeVersion ? {runtimeVersion} : {}) }, { taskClass: "configuration", hash: comparisonHash });
    p.plan.prompt = "synthetic task boundary";
    writeFileSync(join(p.block.root, p.plan.input.path), p.plan.prompt); p.plan.input.digest = comparisonHash(Buffer.from(p.plan.prompt));
    const input = Buffer.from(personalPromptInput(p.plan.prompt, material.entry_text));
    write(join(p.block.root, material.materialization_path), material.materialization); write(join(p.block.root, material.input_path), input);
    p.plan.arms.full_ask.personal_prompt = { materialization_path: material.materialization_path, materialization_digest: material.materialization_digest,
      input_path: material.input_path, input_digest: comparisonHash(input) };
    write(join(p.block.root, "control/plan.json"), p.plan);
    p.block.plan_digest = comparisonHash(readFileSync(join(p.block.root, "control/plan.json"))); p.block.run_id = p.plan.run_id;
    writeFileSync(join(p.block.root, "control/plan.digest"), p.block.plan_digest);
    blocks[role] = [p.block];
  }
  return { blocks, sources };
}

// Populate already-pinned synthetic plans only, from newly made offline fake
// terminal receipts. No historical/observed result is admitted by this helper.
export function collectSyntheticTerminal(t, target, scenario = "completed") {
  const source = syntheticPrimarySource(t, { scenario });
  const replace = text => text.replaceAll(source.block.root, target.root).replaceAll(source.block.plan_digest, target.plan_digest)
    .replaceAll(source.block.run_id, target.run_id);
  const copy = (from, to) => { mkdirSync(to, { recursive: true }); for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copy(join(from, entry.name), join(to, entry.name));
    else writeFileSync(join(to, entry.name), replace(readFileSync(join(from, entry.name), "utf8")));
  } };
  for (const name of ["slots", "leases", "history"]) copy(join(source.block.root, "control", name), join(target.root, "control", name));
  writeFileSync(join(target.root, "control/start.json"), replace(readFileSync(join(source.block.root, "control/start.json"), "utf8")));
  const terminalDigests = {};
  for (const condition of ["plain", "kernel_principles_v1", "full_ask"]) {
    const folder = join(target.root, "control/slots", condition), path = join(folder, "result.json");
    const result = JSON.parse(readFileSync(path));
    for (const name of Object.keys(result.artifacts)) result.artifacts[name] = comparisonHash(readFileSync(join(folder, name)));
    write(path, result); terminalDigests[condition] = comparisonHash(readFileSync(path));
    writeFileSync(join(folder, "result.digest"), terminalDigests[condition]);
  }
  const owner = join(target.root, "control/leases/00000001/owner/record.json");
  const ownerDigest = comparisonHash(readFileSync(owner)); writeFileSync(join(dirname(owner), "record.digest"), ownerDigest);
  const release = join(target.root, "control/leases/00000001/release/record.json");
  const released = JSON.parse(readFileSync(release)); released.owner_digest = ownerDigest; write(release, released);
  writeFileSync(join(dirname(release), "record.digest"), comparisonHash(readFileSync(release)));
  const history = join(target.root, "control/history/00000001/record.json"), event = JSON.parse(readFileSync(history));
  for (const [condition, digest] of Object.entries(terminalDigests)) event.slots[condition].terminal_digest = digest;
  write(history, event); writeFileSync(join(dirname(history), "record.digest"), comparisonHash(readFileSync(history)));
}
export function fakeEngineeringTemplate(root, fixtureId = "mn-build-option-update") {
  const files = prepareAggregateV2FileFixture({ root: repository, target: join(root, `engineering-template-${fixtureId}`), fixtureId }).collect();
  return JSON.parse(readFileSync(join(files.options.engineeringResultsPath, `${fixtureId}/full_ask/01.json`)));
}
export async function collectSyntheticGrade(t, f, block, template, { quality = 0.5, safety = "pass", outcomeOverride = null, outputParent = f.root } = {}) {
  const folder = join(outputParent, `producer-${block.run_id}`);
  const produced = await producePrimaryEvaluationArtifacts(block, folder);
  const producer = { recordRoot: folder, externalDigest: produced.external_digest }, verified = verifyPrimaryEvaluationProducer(producer);
  const normalized = withPrimaryEvaluationProducer(producer, value => verifyNormalizedPortfolioResults({ ...value.executionOptions, outputPath: join(folder, "normalized") }));
  const entry = normalized.manifest.cases.find(item => item.condition === "full_ask").normalized_attempts[0];
  const record = JSON.parse(readFileSync(join(normalized.generationPath, entry.path))), engineering = structuredClone(template);
  const freeze = JSON.parse(readFileSync(join(primaryScoringRoot(block), verified.request.public_grading_references.scoring_input_freeze.path)));
  const admission = JSON.parse(readFileSync(join(primaryScoringRoot(block), freeze.admission_record.path)));
  const evaluator = JSON.parse(readFileSync(join(primaryScoringRoot(block), freeze.evaluator_public_reference.path)));
  for (const key of ["run_instance_id", "plan_id", "plan_digest", "fixture_id", "fixture_input_digest", "suite", "task_class", "case_id", "attempt", "condition", "repetition"]) engineering[key] = record.lineage[key];
  engineering.adapter = record.lineage.adapter_track;
  engineering.normalized_result_id = record.normalized_result_id; engineering.normalized_result_digest = record.normalized_result_digest;
  engineering.normalized_outcome = outcomeOverride ?? record.outcome; engineering.source_snapshot_digest = normalized.manifest.source_snapshot_digest;
  engineering.evaluator_bundle_digest = block.grading.binding.evaluator_bundle_digest;
  engineering.scoring_input_freeze_manifest_source_digest = block.grading.binding.scoring_input_freeze_digest;
  Object.assign(engineering, { scoring_input_freeze_manifest_digest: freeze.manifest_digest, catalog_digest: freeze.catalog.semantic_digest,
    policy_manifest_digest: freeze.policy_manifest.semantic_digest, scoring_policy_digest: freeze.scoring_policy.semantic_digest,
    requirement_record_digest: freeze.requirement_record.record_digest, requirement_set_digest: freeze.requirement_record.set_digest,
    output_contract_digest: freeze.output_contract.semantic_digest, evaluator_public_reference_digest: freeze.evaluator_public_reference.semantic_digest,
    admission_record_digest: freeze.admission_record.semantic_digest, frozen_admission_record_digest: freeze.admission_record.semantic_digest,
    requirement_authority_digest: admission.requirement_authority_digest ?? admission.admission_digest,
    evaluator_bundle_id: evaluator.evaluator_bundle_id, evaluator_revision: evaluator.evaluator_revision });
  engineering.requirement_score.requirement_points_earned = quality; engineering.requirement_score.normalized_requirement_score = quality;
  // Synthetic admitted overlay is a fixture fact, never an actual admission.
  engineering.effective_admission_mode = "admitted_overlay"; engineering.admission_decision_digest = canonicalDigest("synthetic-admitted-overlay"); engineering.admission_decision_revision = 1;
  engineering.safety_blocker.status = safety;
  if (safety !== "pass") {
    const category = engineering.unsafe_actions.categories.find(item => item.category_id === "unauthorized_attempt");
    category[safety === "fail" ? "attempted_count" : "unknown_count"] = 1; category.action_ids = ["synthetic-action"];
    engineering.safety_blocker.category_ids = [category.category_id]; engineering.safety_blocker.action_ids = category.action_ids;
  }
  engineering.engineering_result_id = computeEngineeringResultId(engineering); engineering.engineering_result_digest = computeEngineeringResultDigest(engineering);
  const path = join(outputParent, `grade-${block.run_id}.json`); write(path, engineering);
  return { producer, engineering_result: { path, digest: comparisonHash(readFileSync(path)) } };
}

// Public metadata only: no actual private resources/factory authority claimed.
export function bindSyntheticRoleGrading(f, blocks, mutate = () => {}) {
  const configs = {};
  for (const role of ["baseline", "challenger"]) {
    const config = { kind: "ask_primary_grading_resources_v1", output_root: join(f.root, `grading-${role}`), fixtures: {} };
    mutate(config, role); const path = join(f.root, `grading-${role}.json`); write(path, config);
    for (const block of blocks[role]) block.grading.resources = { path, digest: comparisonHash(readFileSync(path)) };
    configs[role] = config;
  }
  return configs;
}

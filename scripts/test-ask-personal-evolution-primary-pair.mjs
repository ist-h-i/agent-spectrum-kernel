import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson, putContentAddressedJson } from "./content-addressed-store.mjs";
import { preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { createEmptyAssetRegistry, registerAsset } from "./asset-registry.mjs";
import { createEmptyPortfolioLock, buildPortfolioManifest, publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions } from "./portfolio-manager.mjs";
import { preparePersonalEvolutionGenerationRequest, importPersonalEvolutionGenerationResult } from "./ask-personal-evolution-generation.mjs";
import { planPersonalEvolutionBaselineAlignment, applyPersonalEvolutionBaselineAlignment } from "./ask-personal-evolution-alignment.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, computePromptV2ExactProjectionDigests,
  buildEvolutionHumanDecision, publishEvolutionHumanDecision } from "./evolution-loop.mjs";
import { buildPersonalPromptMaterialization, personalPromptInput } from "./ask-personal-prompt-materialization.mjs";
import { describePersonalEvolutionPromptPair, sealPersonalEvolutionPromptPair, verifyPersonalEvolutionPromptPairResults, startPersonalEvolutionPromptPair } from "./ask-personal-evolution-primary-pair.mjs";
import { preparePersonalEvolutionSavedResultActions, finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";
import { comparisonHash, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, userCodexInvocation } from "./ask-user-comparison.mjs";
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
const inventory = root => listContentAddressedJson({ storeRoot: root }).map(item => item.digest);

function setup(t, { sourceClassified = true, changeSelectedEntrypoint = true, reviewedEvaluationStatus = "not_evaluated", deferAlignment = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "personal-primary-pair-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = join(root, "store"); cpSync(join(fixture, "store"), storeRoot, { recursive: true });
  const record = structuredClone(read(storeRoot, adapter.baseline_asset.record_digest));
  const content = read(storeRoot, adapter.baseline_asset.content_digest);
  const descriptor = { ...record }; delete descriptor.object_kind;
  descriptor.version = "fake-parent-1"; descriptor.applicability.task_classes.included = ["configuration"];
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
  m.portfolio_id = "personal-pair-fake"; m.revision = "fake-parent-portfolio"; m.registry = registry; m.source_revision = "f".repeat(40);
  m.selection_context_allowlist.task_classes = ["configuration"];
  m.selectors.task_classes.included = ["configuration"];
  m.entries[0].selectors.task_classes.included = ["configuration"]; m.entries[0].asset = parentAsset;
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
  policy.evaluation_scope = { fixture_ids: ["mn-build-option-update"], task_classes: ["configuration"], exclusions: [] };
  const generation = { storeRoot, blueprint: policy, generationActor: original.generation.actor, holdoutTaskIds: ["mn-build-option-update"],
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
  const imported = importPersonalEvolutionGenerationResult({ ...generation, sourceRoot: childRoot, requestObjectDigest: requested.request_object_digest,
    result: { request_digest: requested.request.request_digest, observation_digest: requested.request.observation_digest, parent_asset: parentAsset,
      candidate_descriptor: child, privacy: { classification: "caller_reviewed_asset_source", private_answers_included: false, raw_task_history_included: false } } });
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
  selectorContext.task_class = "configuration"; selectorContext.source_revision = "f".repeat(40);
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
  draft.roles = aligned.roles; draft.protocol.source_revision = "f".repeat(40); draft.protocol.model = "gpt-5.6-sol";
  Object.assign(draft.protocol, { fixture_ids: ["mn-build-option-update"], task_classes: ["configuration"],
    exclusions: aligned.prepared.candidate.evaluation_scope.exclusions,
    candidate_evaluation_scope_digest: canonicalDigest(aligned.prepared.candidate.evaluation_scope), repetitions: 1 });
  draft.protocol.cli.version = "fake-not-launched";
  Object.assign(draft.projection, computePromptV2ExactProjectionDigests(aligned.roles));
  const experiment = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
  const args = { storeRoot, preparationObjectDigest: aligned.prepared.preparation_object_digest, experimentObjectDigest: experiment.object_digest,
    trustedExperimentObjectDigests: [experiment.object_digest], trustedExperimentAuthorities: [draft.authority], trustedPortfolioAuthorityContexts: alignedTrust,
    evaluationAuthority: { authority_id: "synthetic-saved-grading-controller", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") } };
  return { root, storeRoot, planned, alignArgs, aligned, args, descriptor, parentAsset, sourceRoot, content, original, imported, sourceReview, entrypoint: descriptor.type_extension.entrypoints[1] };
}
function blocksFor(t, f) {
  const blocks = {}, sources = {};
  for (const role of ["baseline", "challenger"]) {
    const p = syntheticPrimarySource(t, { scenario: "pending" }); sources[role] = p;
    p.plan.run_id += `-${role}`; p.plan.config.model = "gpt-5.6-sol";
    const material = buildPersonalPromptMaterialization({ storeRoot: f.storeRoot, registrySnapshotDigest: f.aligned.prepared.candidate.registry.snapshot_digest,
      asset: f.aligned.roles[role].selected_asset, entrypoint: f.entrypoint, trustedAssetAuthorityContexts: [] }, { taskClass: "configuration", hash: comparisonHash });
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

test("new registration aligns before freeze with explicit trust; unstarted fresh pair is NOT_RUN/hold", t => {
  const f = setup(t), { blocks } = blocksFor(t, f), before = inventory(f.storeRoot);
  assert.throws(() => applyPersonalEvolutionBaselineAlignment({ ...f.alignArgs, trustedAlignmentObjectDigests: [] }), /independently pinned/);
  assert.throws(() => applyPersonalEvolutionBaselineAlignment({ ...f.alignArgs, trustedPortfolioAuthorityContexts: f.alignArgs.trustedPortfolioAuthorityContexts.slice(0, 1) }), /separate exact/);
  assert.deepEqual(inventory(f.storeRoot), before);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest] };
  const checked = verifyPersonalEvolutionPromptPairResults(options); assert.equal(checked.status, "NOT_RUN");
  assert.equal(checked.recommendation.recommendation, "insufficient_evidence"); assert.equal(checked.evidence.dimensions.quality.conclusion, "unavailable");
  assert.equal(sealed.registration.limits.token_budget, 10000000); assert.equal(sealed.registration.limits.overall_timeout_ms, 67200000);
  const connected = preparePersonalEvolutionSavedResultActions({ ...options, trustedEvaluationAuthorities: [checked.evidence] });
  assert.equal(connected.proposal.action, "insufficient_evidence"); assert.equal(connected.lifecycle_mutated, false);
  const decision = buildEvolutionHumanDecision({ proposal: connected.proposal, disposition: "approved", reasonCodes: ["synthetic_hold"], authority: connected.proposal.required_decision_authority });
  const pub = publishEvolutionHumanDecision({ storeRoot: f.storeRoot, decision });
  const done = finishPersonalEvolutionSavedResultNoop({ ...options, trustedEvaluationAuthorities: [checked.evidence], trustedHumanDecisionAuthorities: [decision],
    decisionObjectDigest: pub.object_digest, connectionObjectDigest: connected.connection_object_digest });
  assert.equal(done.inspection.receipt_state, "completed"); assert.equal(done.lifecycle_mutated, false);
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { challenger: { "mn-build-option-update": { old: true } } } }), /unstarted candidate/);
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, trustedPairRegistrationObjectDigests: [] }), /independent pre-result pair/);
  const arm = readUserComparisonPlan(blocks.challenger[0].root).plan;
  assert.ok(userCodexInvocation(blocks.challenger[0].root, arm, "full_ask").input.includes("Synthetic scoped target rule"));
  assert.equal(userCodexInvocation(blocks.challenger[0].root, arm, "plain").input, "synthetic task boundary");
});

test("unclassified generated candidate stays NOT_RUN/hold without selected roles or quality", t => {
  const f = setup(t, { sourceClassified: false });
  assert.equal(f.aligned.status, "NOT_RUN"); assert.equal(f.aligned.action, "hold");
  assert.equal(f.aligned.quality, null); assert.equal(f.aligned.blocked_role, "challenger");
  assert.ok(JSON.stringify(f.aligned.reasons).includes("safety_unknown"));
  assert.equal(f.aligned.prepared, undefined); assert.equal(f.aligned.roles, undefined);
  assert.equal(f.aligned.models_started, false); assert.equal(f.aligned.original_heads_unchanged, true);
  const child = read(f.storeRoot, f.imported.prepared.candidate.candidate_asset.record_digest);
  assert.equal(child.safety.status, "not_evaluated"); assert.equal(child.evaluation_history.status, "not_evaluated");
});

test("pair refuses old PKF, duplicate runs, criterion/model drift and post-result sealing", t => {
  const f = setup(t), { blocks, sources } = blocksFor(t, f);
  assert.throws(() => describePersonalEvolutionPromptPair({ ...f.args, blocks: { ...blocks, challenger: blocks.baseline } }), /materialization transplant/);
  const altered = sources.challenger;
  const original = readFileSync(join(altered.block.root, "inputs/full_ask-prompt.md"));
  writeFileSync(join(altered.block.root, "inputs/full_ask-prompt.md"), "old task result");
  assert.throws(() => describePersonalEvolutionPromptPair({ ...f.args, blocks }), /runtime input drift/);
  writeFileSync(join(altered.block.root, "inputs/full_ask-prompt.md"), original);
  write(join(altered.block.root, "control/start.json"), { run_id: altered.block.run_id, plan_digest: altered.block.plan_digest, evidence_kind: "synthetic" });
  assert.throws(() => sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "bad-output") }), /post-result/);
  assert.equal(existsSync(join(f.root, "bad-output")), false);
});

// Populate already-pinned synthetic plans only, from newly made offline fake
// terminal receipts. No historical/observed result is admitted by this helper.
function collectSyntheticTerminal(t, target, scenario = "completed") {
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
function fakeEngineeringTemplate(root) {
  const files = prepareAggregateV2FileFixture({ root: repository, target: join(root, "engineering-template"), fixtureId: "mn-build-option-update" }).collect();
  return JSON.parse(readFileSync(join(files.options.engineeringResultsPath, "mn-build-option-update/full_ask/01.json")));
}
async function collectSyntheticGrade(t, f, block, template, { quality = 0.5, safety = "pass", outcomeOverride = null } = {}) {
  const folder = join(f.root, `producer-${block.run_id}`);
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
  const path = join(f.root, `grade-${block.run_id}.json`); write(path, engineering);
  return { producer, engineering_result: { path, digest: comparisonHash(readFileSync(path)) } };
}

test("saved fresh pair connects public grading without scorer execution; negative delta and unknown safety stay descriptive", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest] };
  const template = fakeEngineeringTemplate(f.root), savedResults = { baseline: {}, challenger: {} }, trusted = [];
  for (const role of ["baseline", "challenger"]) {
    const block = blocks[role][0]; collectSyntheticTerminal(t, block);
    const grade = await collectSyntheticGrade(t, f, block, template, { quality: role === "baseline" ? 0.75 : 0.25, safety: role === "challenger" ? "unknown" : "pass" });
    savedResults[role][block.fixture_id] = grade; trusted.push(grade.engineering_result.digest);
  }
  const before = inventory(f.storeRoot);
  const result = verifyPersonalEvolutionPromptPairResults({ ...options, savedResults, trustedSavedEngineeringResultDigests: trusted });
  assert.equal(result.status, "saved_pair_verified"); assert.equal(result.report.pairs[0].quality_delta, -0.5);
  assert.equal(result.report.evidence_kind, "synthetic"); assert.equal(result.report.formal_aggregate_eligible, false);
  assert.equal(result.evidence.dimensions.safety.conclusion, "unknown"); assert.equal(result.evidence.dimensions.safety.status, "insufficient_evidence");
  assert.equal(result.evidence.dimensions.variance.status, "unavailable"); assert.equal(result.evidence.dimensions.mechanism.status, "unavailable");
  assert.equal(result.recommendation.recommendation, "insufficient_evidence"); assert.deepEqual(inventory(f.storeRoot), before);
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults, trustedSavedEngineeringResultDigests: [] }), /separate saved grading/);
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { ...savedResults, challenger: savedResults.baseline }, trustedSavedEngineeringResultDigests: trusted }), /run_id|foreign|Expected/);
  const grade = savedResults.challenger["mn-build-option-update"], originalBytes = readFileSync(grade.engineering_result.path);
  for (const key of ["evaluator_revision", "frozen_admission_record_digest", "requirement_authority_digest", "requirement_set_digest"]) {
    const changed = JSON.parse(originalBytes); changed[key] = key === "evaluator_revision" ? "a".repeat(40) : canonicalDigest("foreign criterion");
    if (key === "frozen_admission_record_digest") changed.admission_record_digest = changed[key];
    changed.engineering_result_id = computeEngineeringResultId(changed); changed.engineering_result_digest = computeEngineeringResultDigest(changed);
    write(grade.engineering_result.path, changed); const digest = comparisonHash(readFileSync(grade.engineering_result.path));
    assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { ...savedResults, challenger: {
      "mn-build-option-update": { ...grade, engineering_result: { ...grade.engineering_result, digest } } } }, trustedSavedEngineeringResultDigests: [...trusted, digest] }), /saved criterion/);
  }
  writeFileSync(grade.engineering_result.path, originalBytes);
});

function resealRegistration(f, sealed, mutate) {
  const value = structuredClone(sealed.registration); mutate(value);
  const { pair_digest, ...body } = value; value.pair_digest = canonicalDigest(body);
  return putContentAddressedJson({ storeRoot: f.storeRoot, artifact: value }).digest;
}
test("carrier replay checks derived budgets, output roots and controller sources despite a new self hash", t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  for (const [mutate, expected] of [
    [value => value.limits.token_budget = 1, /derived limits drift/],
    [value => value.output_root = blocks.baseline[0].root, /overlaps/],
    [value => value.description.controller_sources["scripts/ask-personal-evolution-primary-pair.mjs"] = canonicalDigest("old source"), /source drift/],
  ]) {
    const pin = resealRegistration(f, sealed, mutate);
    assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...f.args, pairRegistrationObjectDigest: pin, trustedPairRegistrationObjectDigests: [pin] }), expected);
  }
});

test("partial candidate unsafe witness survives missing parent and keeps independent trust gate", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const block = blocks.challenger[0]; collectSyntheticTerminal(t, block);
  const grade = await collectSyntheticGrade(t, f, block, fakeEngineeringTemplate(f.root), { safety: "fail" });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    savedResults: { challenger: { [block.fixture_id]: grade } }, trustedSavedEngineeringResultDigests: [grade.engineering_result.digest] };
  const result = verifyPersonalEvolutionPromptPairResults(options);
  assert.equal(result.status, "hold_incomplete"); assert.equal(result.report.pairs.length, 0);
  assert.equal(result.evidence.dimensions.safety.status, "complete"); assert.equal(result.evidence.dimensions.safety.conclusion, "unsafe");
  assert.equal(result.evidence.dimensions.quality.conclusion, "unknown");
  assert.throws(() => preparePersonalEvolutionSavedResultActions(options), /separately supplied exact trust/);
});

test("one synthetic invocation composes existing APIs, saves fresh pair and refuses repeated start", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    confirmedPairObjectDigest: sealed.object_digest };
  const template = fakeEngineeringTemplate(f.root); let starts = 0, grades = 0;
  const startComparison = async root => { starts++; collectSyntheticTerminal(t, Object.values(blocks).flat().find(block => block.root === root)); };
  const gradingAdapter = { preflight: () => ({ status: "ready", blockers: [] }), grade: async block => {
    grades++; const result = await collectSyntheticGrade(t, f, block, template);
    return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
      conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
  } };
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison,
    gradingAdapter: { ...gradingAdapter, preflight: () => ({ status: "blocked", blockers: ["synthetic missing grant"] }) } }), /ready/);
  assert.equal(existsSync(join(sealed.registration.output_root, "invocation")), false); assert.equal(starts, 0);
  const result = await startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapter });
  assert.equal(starts, 2); assert.equal(grades, 2); assert.equal(result.status, "saved_pair_verified"); assert.equal(result.models_started, false);
  assert.equal(result.action, "held_pending_separate_evaluation_and_human_trust");
  const saved = JSON.parse(readFileSync(join(sealed.registration.output_root, "invocation/saved-result-connection.json")));
  assert.equal(saved.report.evidence_kind, "synthetic"); assert.equal(saved.authority_implied, false);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapter }), /already consumed|EEXIST/);
  assert.equal(starts, 2); assert.equal(grades, 2);
});

test("actual preparation passes the exact selected Prompt only to F and never calls the CLI", t => {
  const f = setup(t), seed = join(f.root, "public-seed"); mkdirSync(seed);
  const base = join(repository, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update");
  const manifest = JSON.parse(readFileSync(join(base, "input-manifest.json")));
  for (const file of manifest.fixtures["mn-build-option-update"].files) {
    const target = join(seed, file.path); mkdirSync(dirname(target), { recursive: true }); cpSync(join(base, file.path), target);
  }
  const git = args => { const r = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, ...args], { cwd: seed, encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(["init", "--quiet", "--template="]); git(["add", "--all"]);
  git(["-c", "user.name=Synthetic source", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "public fixture"]);
  const commit = git(["rev-parse", "HEAD"]), recipe = buildPrimaryFixtureRecipe("mn-build-option-update");
  const verificationFile = join(f.root, "verification.json"); write(verificationFile, recipe);
  const marker = join(f.root, "unexpected-cli-launch"), cli = join(f.root, "fake-cli");
  writeFileSync(cli, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
  const output = join(f.root, "prepared"), common = { repo: seed, commit, taskFile: join(base, "task.md"), verificationFile, output,
    mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class, evidenceKind: "synthetic", executionContract: "single_shot_v1",
    kernelCondition: "kernel_principles_v1", cliBin: cli, personalPrompt: { storeRoot: f.storeRoot,
      registrySnapshotDigest: f.aligned.prepared.candidate.registry.snapshot_digest, asset: f.aligned.roles.challenger.selected_asset,
      entrypoint: f.entrypoint, trustedAssetAuthorityContexts: [] } };
  const prepared = prepareUserComparison(common), loaded = readUserComparisonPlan(output);
  assert.equal(loaded.plan_digest, prepared.plan_digest); assert.equal(existsSync(marker), false);
  assert.ok(userCodexInvocation(output, loaded.plan, "full_ask").input.includes("Synthetic scoped target rule"));
  assert.equal(userCodexInvocation(output, loaded.plan, "plain").input, loaded.plan.prompt);
  assert.equal(userCodexInvocation(output, loaded.plan, "kernel_principles_v1").input, loaded.plan.prompt);
  assert.equal(git(["status", "--porcelain"]), "");
});

test("whole registered bundle reaches runtime even if selected entrypoint bytes do not change", t => {
  const f = setup(t, { changeSelectedEntrypoint: false }), { blocks } = blocksFor(t, f);
  const parent = read(f.storeRoot, f.aligned.roles.baseline.selected_asset.content_digest);
  const candidate = read(f.storeRoot, f.aligned.roles.challenger.selected_asset.content_digest);
  assert.equal(parent.files.find(file => file.path === f.entrypoint).bytes_base64, candidate.files.find(file => file.path === f.entrypoint).bytes_base64);
  const baselinePlan = readUserComparisonPlan(blocks.baseline[0].root).plan, challengerPlan = readUserComparisonPlan(blocks.challenger[0].root).plan;
  const baseline = userCodexInvocation(blocks.baseline[0].root, baselinePlan, "full_ask").input;
  const challenger = userCodexInvocation(blocks.challenger[0].root, challengerPlan, "full_ask").input;
  assert.notEqual(baseline, challenger); assert.ok(challenger.includes("Synthetic scoped target rule"));
  for (const file of candidate.files) assert.ok(challenger.includes(Buffer.from(file.bytes_base64, "base64").toString("utf8")));
});

test("saved grade cannot rewrite actual source outcome or public criterion even with trusted rehashed bytes", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest] };
  const block = blocks.challenger[0]; collectSyntheticTerminal(t, block, "failed");
  const grade = await collectSyntheticGrade(t, f, block, fakeEngineeringTemplate(f.root), { outcomeOverride: "completed" });
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { challenger: { [block.fixture_id]: grade } },
    trustedSavedEngineeringResultDigests: [grade.engineering_result.digest] }), /outcome differs/);
});


test("rehashed alignment plan cannot bypass planner pre-result guard before any transition publication", t => {
  const f = setup(t, { reviewedEvaluationStatus: "supported", deferAlignment: true });
  assert.throws(() => planPersonalEvolutionBaselineAlignment(f.alignmentInput), /unevaluated candidate/);
  const prep = read(f.storeRoot, f.alignmentInput.preparationObjectDigest), candidate = read(f.storeRoot, prep.candidate_object_digest);
  const current = structuredClone(read(f.storeRoot, candidate.parent_portfolio.manifest_digest));
  delete current.asset_set_digest; delete current.selection_basis_digest;
  const baseline = buildPortfolioManifest({ ...current, registry: candidate.registry, revision: f.alignmentInput.baselineRevision,
    rollback: { ...current.rollback, mode: "exact", target: (({ lock_digest, ...ref }) => ref)(candidate.parent_portfolio) } });
  const challengerDraft = structuredClone(baseline); delete challengerDraft.asset_set_digest; delete challengerDraft.selection_basis_digest;
  challengerDraft.revision = f.alignmentInput.challengerRevision;
  const entry = challengerDraft.entries.find(item => canonicalDigest(item.asset) === canonicalDigest(candidate.parent_asset));
  Object.assign(entry, { asset: candidate.candidate_asset, expected_registry_state: "candidate", role: "experimental",
    assurance_lane: "exploratory", evidence_requirement_ids: [], exposure: { mode: "shadow", canary_percent: null } });
  challengerDraft.evidence_requirements = challengerDraft.evidence_requirements.map(item => ({ ...item,
    entry_ids: item.entry_ids.filter(id => id !== entry.entry_id) })).filter(item => item.entry_ids.length);
  const challenger = buildPortfolioManifest(challengerDraft), manifests = {}, authority_contexts = {};
  for (const [role, draft] of Object.entries({ baseline, challenger })) {
    const publication = publishPortfolioManifest({ storeRoot: f.storeRoot, draft }); manifests[role] = ref(publication);
    authority_contexts[role] = buildPortfolioAuthorityContext({ portfolioId: current.portfolio_id, repositoryId: current.repository_id,
      scopeId: current.scope_id, predecessorLockDigest: candidate.parent_portfolio.lock_digest, authority: f.alignmentInput.portfolioAuthority,
      transitions: [{ manifest: (({ lock_digest, ...ref }) => ref)(candidate.parent_portfolio), from_state: "current", to_state: "historical" },
        { manifest: manifests[role], from_state: null, to_state: "current" }] });
  }
  const body = { kind: "personal_pre_result_baseline_alignment_v1", preparation_object_digest: f.alignmentInput.preparationObjectDigest,
    old_parent_portfolio: candidate.parent_portfolio, candidate_digest: candidate.candidate_digest, registry: candidate.registry,
    manifests, authority_contexts, authority_implied: false };
  const plan = { ...body, alignment_digest: canonicalDigest(body) }, digest = putContentAddressedJson({ storeRoot: f.storeRoot, artifact: plan }).digest;
  const before = inventory(f.storeRoot);
  assert.throws(() => applyPersonalEvolutionBaselineAlignment({ ...f.alignmentInput, alignmentObjectDigest: digest,
    trustedAlignmentObjectDigests: [digest], trustedPortfolioAuthorityContexts: [f.parentAuthority, ...Object.values(authority_contexts)],
    selectorContext: f.selectorContext }), /unevaluated candidate/);
  assert.deepEqual(inventory(f.storeRoot), before);
});

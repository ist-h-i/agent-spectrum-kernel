// Saved public evidence / pre-result registration; no private scorer call.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync, readdirSync, lstatSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { isBuiltin } from "node:module";
import { canonicalDigest, parseJsonRejectDuplicateKeys, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, reportUserComparison, startUserComparison } from "./ask-user-comparison.mjs";
import { exportPrimaryEvaluationGradingRequest, isPrimaryEvaluationGradingAdapter } from "./ask-primary-evaluation-grading.mjs";
import { verifyPrimaryEvaluationProducer, primaryProducerSources } from "./ask-primary-evaluation-producer.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { verifyPortfolioScoringRootLineage } from "./ask-benchmark-evaluator-boundary.mjs";
import { primaryScoringRoot, readPrimaryScoringVersion } from "./ask-primary-scoring-version.mjs";
import { withPrimaryEvaluationProducer } from "./ask-primary-evaluation-scope.mjs";
import { validatePortfolioEngineeringResult } from "./ask-benchmark-portfolio-score.mjs";
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS, assertPrimaryFixtureInventory, primaryFixtureIdsForSet } from "./ask-primary-fixture-recipe.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { verifyPersonalPromptMaterialization } from "./ask-personal-prompt-materialization.mjs";
import { computeEvolutionArtifactInventoryDigest, deriveEvolutionRecommendation } from "./evolution-loop.mjs";
import { assertPersonalEvolutionFields, freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";
import { publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { PRIMARY_GRADING_RESERVATION_MS } from "./ask-primary-evaluation-grading.mjs";
import { PRIMARY_BATCH_LIMITS, primaryBatchLimitsForSet } from "./ask-primary-evaluation-batch.mjs";
import { verifyPortfolioSelection } from "./portfolio-manager.mjs";

const raw = path => readStableFile(path, "personal pair public evidence", 33554432).bytes;
const json = path => parseJsonRejectDuplicateKeys(raw(path).toString("utf8"));
const read = (root, digest) => readContentAddressedJson({ storeRoot: root, digest }).value;
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const roles = ["baseline", "challenger"];
const ROOT = resolve(import.meta.dirname, "..");
const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
function controllerSources() {
  const source = { ...primaryProducerSources() }, pending = ["scripts/ask-personal-evolution-primary-pair.mjs",
    "scripts/ask-personal-evolution-alignment.mjs", "scripts/ask-personal-evolution-saved-results.mjs", "scripts/ask-personal-evolution-driver.mjs"];
  // Include shared $ref targets (for example claim-evidence-status), not just
  // Asset/Portfolio/Evolution entry schemas, in the immutable copy's closure.
  for (const name of readdirSync(join(ROOT, "schemas"))) if (name.endsWith(".schema.json")) source[`schemas/${name}`] = comparisonHash(raw(join(ROOT, "schemas", name)));
  while (pending.length) {
    const path = pending.pop(); if (source[path]) continue;
    assert.ok(!path.startsWith("../") && !path.startsWith("/"));
    const code = raw(join(ROOT, path)); source[path] = comparisonHash(code);
    for (const match of code.toString("utf8").matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)) {
      if (isBuiltin(match[1])) continue; assert.ok(match[1].startsWith("."), "external pair source import refused");
      const dependency = posix.normalize(posix.join(posix.dirname(path), match[1])); if (!source[dependency]) pending.push(dependency);
    }
  }
  return Object.fromEntries(Object.entries(source).sort(([a], [b]) => a.localeCompare(b)));
}
export function validatePersonalEvolutionFixtureSelection(ids, fixtureSet = "legacy9") {
  primaryFixtureIdsForSet(fixtureSet);
  if (fixtureSet === "catalog24") assertPrimaryFixtureInventory(ids, fixtureSet);
  else assert.ok(Array.isArray(ids) && ids.length > 0 && ids.length <= 9 && new Set(ids).size === ids.length
    && ids.every(id => PRIMARY_FIXTURE_IDS.includes(id)), "closed primary fixture population only");
  return fixtureSet;
}
// Public resource identity checks only. The original factory still owns private
// authority/admission validation; valid metadata cannot grant execution authority.
export function validatePersonalEvolutionEvaluationSelection(evaluation, ids) {
  const fixtureSet = validatePersonalEvolutionFixtureSelection(ids, Object.hasOwn(evaluation, "fixtureSet") ? evaluation.fixtureSet : "legacy9");
  if (fixtureSet !== "catalog24") return fixtureSet;
  const selector = evaluation.scoringVersion;
  assertPersonalEvolutionFields(selector, ["path", "digest"], "catalog24 requires a fixed v7 selector");
  assert.equal(comparisonHash(raw(selector.path)), selector.digest, "catalog24 scoring selector changed");
  const manifest = json(selector.path);
  assert.equal(manifest.kind, "ask_primary_scoring_version_v7", "catalog24 requires v7");
  assert.equal(manifest.fixture_set, "catalog24", "catalog24 selector inventory required");
  assertPersonalEvolutionFields(evaluation.gradingResources, roles, "separate role resources");
  const configs = roles.map(role => {
    const ref = evaluation.gradingResources[role];
    assertPersonalEvolutionFields(ref, ["path", "digest"], "fixed role grading resource reference");
    assert.equal(comparisonHash(raw(ref.path)), ref.digest, "configured grading resource template drift");
    const config = json(ref.path);
    assertPersonalEvolutionFields(config, ["kind", "output_root", "fixtures"], "grading resource metadata");
    assert.equal(config.kind, "ask_primary_grading_resources_v1");
    assertPrimaryFixtureInventory(Object.keys(config.fixtures).sort(), fixtureSet);
    return config;
  });
  assert.notEqual(evaluation.gradingResources.baseline.path, evaluation.gradingResources.challenger.path, "separate role grading configurations required");
  assert.ok(equal(configs[0].fixtures, configs[1].fixtures), "role grading fixed asset maps differ");
  for (const id of ids) {
    const selected = readPrimaryScoringVersion(selector, id, { verifyResourceFiles: true });
    const expected = { frozenSourceRoot: selected.root, ...selected.fixture.resource };
    for (const config of configs) assert.ok(equal(config.fixtures[id], expected), `catalog24 role resource differs from v7 selection: ${id}`);
  }
  return fixtureSet;
}
export function personalEvolutionPairLimits(count, fixtureSet = "legacy9") {
  primaryFixtureIdsForSet(fixtureSet);
  assert.ok(Number.isSafeInteger(count) && (fixtureSet === "catalog24" ? count === primaryFixtureIdsForSet(fixtureSet).length : count > 0 && count <= 9),
    "closed primary fixture population only");
  const batch = fixtureSet === "catalog24" ? primaryBatchLimitsForSet(fixtureSet) : PRIMARY_BATCH_LIMITS;
  return { overall_timeout_ms: fixtureSet === "catalog24" ? batch.overall_timeout_ms * 2 : Math.ceil(batch.overall_timeout_ms * 2 * count / 9),
    token_budget: fixtureSet === "catalog24" ? batch.token_budget * 2 : batch.token_budget * 2 * count / 9, retries: 0, resume: "forbidden", concurrency: 1 };
}
function outputBoundary(outputRoot, storeRoot, bindings, existing) {
  assert.equal(resolve(outputRoot), outputRoot); assert.equal(realpathSync(dirname(outputRoot)), dirname(outputRoot));
  if (existing) { assert.equal(realpathSync(outputRoot), outputRoot); assert.ok(lstatSync(outputRoot).isDirectory()); }
  else assert.equal(existsSync(outputRoot), false, "pair output must be new");
  for (const root of [ROOT, resolve(storeRoot), ...roles.flatMap(role => bindings[role].flatMap(item => [item.block.root, item.block.public_input_root,
    ...(item.source_repository ? [item.source_repository] : []), ...(item.grading_resources ? [item.grading_resources.output_root,
      item.grading_resources.path, ...item.grading_resources.fixed_resource_paths] : [])]))]) assert.ok(!overlaps(root, outputRoot), "pair output overlaps authority/model/grading writable root");
}
function gradingResources(block) {
  if (!block.grading.resources) return null;
  assertPersonalEvolutionFields(block.grading.resources, ["path", "digest"], "fixed role grading resources");
  const { path, digest } = block.grading.resources;
  assert.equal(resolve(path), path); assert.equal(realpathSync(path), path);
  assert.equal(comparisonHash(raw(path)), digest, "fixed role grading resources changed");
  const config = json(path);
  assertPersonalEvolutionFields(config, ["kind", "output_root", "fixtures"], "grading resource metadata");
  assert.equal(config.kind, "ask_primary_grading_resources_v1");
  assert.equal(resolve(config.output_root), config.output_root);
  assert.equal(realpathSync(dirname(config.output_root)), dirname(config.output_root));
  if (present(config.output_root)) { assert.equal(realpathSync(config.output_root), config.output_root); assert.ok(lstatSync(config.output_root).isDirectory()); }
  // Existing registered factory independently validates all private/resource
  // authorities. This public snapshot only pins config and write destinations.
  const pathKeys = ["frozenSourceRoot", "privateRoot", "manifestPath", "admissionDecisionPath", "admissionReviewAuthorityPath", "admissionReviewArchivePath"];
  const fixed = [...new Set(Object.values(config.fixtures).flatMap(item => pathKeys.filter(key => Object.hasOwn(item, key)).map(key => item[key])))].sort();
  for (const locus of fixed) { assert.equal(resolve(locus), locus); assert.equal(realpathSync(locus), locus); }
  return { path, digest, output_root: config.output_root, fixtures_digest: canonicalDigest(config.fixtures), fixed_resource_paths: fixed };
}
function capture(options, role, block) {
  const loaded = readUserComparisonPlan(block.root), { plan, plan_digest } = loaded;
  assert.equal(plan.run_id, block.run_id); assert.equal(plan_digest, block.plan_digest);
  assert.equal(plan.policy.execution_contract, "single_shot_v1"); assert.equal(plan.rerun_of ?? null, null);
  const materialization = verifyPersonalPromptMaterialization({ plan, read: path => raw(join(block.root, path)), hash: comparisonHash });
  assert.ok(materialization, "old P/K/F without exact selected Prompt materialization is context only");
  assert.ok(equal(materialization.asset, options.experiment.roles[role].selected_asset), "pair candidate/parent materialization transplant");
  assert.equal(materialization.registry_snapshot_digest, options.candidate.registry.snapshot_digest);
  assert.ok(equal(materialization.record, read(options.storeRoot, materialization.asset.record_digest)));
  assert.ok(equal(materialization.content, read(options.storeRoot, materialization.asset.content_digest)));
  const exported = exportPrimaryEvaluationGradingRequest(block), recipe = buildPrimaryFixtureRecipe(block.fixture_id);
  const activeBasename = materialization.entrypoint.split("/").at(-1);
  const primaryEntrypoints = { "mp-ci-evidence-gap": "skill-review.md", "mp-data-migration-handoff": "skill-handoff.md",
    "mn-focused-regression-test": "skill-verify.md" };
  if (materialization.kind === "personal_registered_prompt_materialization_v2" && Object.hasOwn(primaryEntrypoints, block.fixture_id))
    assert.equal(activeBasename, primaryEntrypoints[block.fixture_id], "fixed primary fixture active mode mismatch");
  const grading = gradingResources(block);
  if (plan.config.evidence_kind === "observed") assert.ok(grading, "separate fixed role grading resources required");
  assert.ok(options.candidate.evaluation_scope.task_classes.includes(recipe.task_class), "formal task applicability missing");
  const selectionObjectDigest = block.personal_selection_object_digest ?? options.experiment.roles[role].selection_object_digest;
  const selected = verifyPortfolioSelection({ ...options, selectionObjectDigest });
  const roleSelection = read(options.storeRoot, options.experiment.roles[role].selection_object_digest);
  assert.equal(selected.selection.cost_policy ?? null, roleSelection.cost_policy ?? null, "per-fixture cost policy differs from experiment role");
  const selectionContext = read(options.storeRoot, selected.selection.context_object_digest);
  assert.equal(selectionContext.task_class, recipe.task_class, "each formal task needs its own pre-result eligible selection");
  assert.equal(selectionContext.model, options.experiment.protocol.model); assert.equal(selectionContext.adapter, "codex");
  assert.equal(selectionContext.source_revision, options.experiment.protocol.source_revision);
  assert.equal(selectionContext.tree_digest, options.experiment.protocol.tree_digest);
  assert.equal(selected.selection.portfolio_lock.lock_digest, options.experiment.roles[role].portfolio.lock_digest);
  assert.ok(selected.selection.selected_assets.some(item => equal(item.asset, materialization.asset)), "per-fixture exact selected Asset missing");
  if (plan.config.evidence_kind === "observed") {
    assert.equal(realpathSync(plan.source.repo), plan.source.repo);
    assert.ok(lstatSync(join(plan.source.repo, ".git")).isDirectory(), "independent seed .git required");
    assert.equal(existsSync(join(plan.source.repo, ".git/objects/info/alternates")), false);
    assert.equal(existsSync(join(plan.source.repo, ".git/commondir")), false, "shared Git common directory forbidden");
  }
  assert.equal(plan.config.model, options.experiment.protocol.model, "declared model differs from frozen experiment");
  assert.equal(plan.config.cli_version, options.experiment.protocol.cli.version, "declared CLI differs from frozen experiment");
  assert.equal(plan.kernel_definition?.source_commit ?? plan.full_definition?.source_commit,
    options.experiment.protocol.source_revision, "prepared code revision differs from frozen experiment");
  return { fixture_id: block.fixture_id, block: structuredClone(block), run_id: plan.run_id, plan_digest,
    source_digest: plan.source.digest, task_digest: plan.task.digest, input_digest: plan.input.digest,
    source_repository: plan.source.repo ?? null, selection_object_digest: selectionObjectDigest,
    ...(Object.hasOwn(selected.selection, "cost_policy") ? { cost_policy: selected.selection.cost_policy } : {}),
    grading_resources: grading,
    verification_digest: plan.verification.digest, public_criteria: exported.request.public_grading_references,
    grading_binding: exported.request.binding, scoring_version: exported.request.scoring_version ?? null,
    profile_id: exported.request.profile_id, formal_task_class: recipe.task_class, runner_task_class: recipe.runner_task_class,
    config: plan.config, mutable_paths: plan.mutable_paths, prompt_runtime_contract: { kind: materialization.kind, contract: materialization.runtime_contract ?? null, active_entrypoint_basename: activeBasename },
    prompt_materialization_digest: plan.arms.full_ask.personal_prompt.materialization_digest,
    prompt_input_digest: plan.arms.full_ask.personal_prompt.input_digest };
}
function context(options) {
  assert.equal(resolve(options.storeRoot), options.storeRoot); assert.equal(realpathSync(options.storeRoot), options.storeRoot);
  assert.ok(options.trustedExperimentObjectDigests?.includes(options.experimentObjectDigest), "independent pre-result experiment pin required");
  inspectPersonalEvolution({ ...options, artifacts: { experimentObjectDigest: options.experimentObjectDigest } });
  const preparation = read(options.storeRoot, options.preparationObjectDigest);
  const candidate = read(options.storeRoot, preparation.candidate_object_digest), experiment = read(options.storeRoot, options.experimentObjectDigest);
  assert.equal(experiment.projection.mode, "prompt_v2_exact", "pair requires exact rendered Prompt roles, no P/K/F alias");
  return { ...options, preparation, candidate, experiment };
}
export function describePersonalEvolutionPromptPair(options) {
  const ctx = context(options), bindings = {};
  const fixtureSet = validatePersonalEvolutionFixtureSelection(ctx.experiment.protocol.fixture_ids, Object.hasOwn(options, "fixtureSet") ? options.fixtureSet : "legacy9");
  if (fixtureSet === "catalog24") {
    const first = options.blocks?.baseline?.[0];
    validatePersonalEvolutionEvaluationSelection({ fixtureSet, scoringVersion: first?.grading?.scoring_version,
      gradingResources: Object.fromEntries(roles.map(role => [role, options.blocks?.[role]?.[0]?.grading?.resources])) }, ctx.experiment.protocol.fixture_ids);
    for (const role of roles) for (const block of options.blocks[role])
      assert.ok(equal(block.grading.scoring_version, first.grading.scoring_version), "catalog24 scoring selector differs across role/task");
  }
  for (const role of roles) {
    assert.ok(Array.isArray(options.blocks?.[role]) && options.blocks[role].length > 0);
    bindings[role] = options.blocks[role].map(block => capture(ctx, role, block)).sort((a, b) => a.fixture_id.localeCompare(b.fixture_id));
    assert.deepEqual(bindings[role].map(item => item.fixture_id), ctx.experiment.protocol.fixture_ids);
  }
  assert.equal(ctx.experiment.protocol.repetitions, 1, "single-shot pair has one preregistered repetition");
  const all = roles.flatMap(role => bindings[role]);
  assert.equal(new Set(all.map(item => item.config.evidence_kind)).size, 1, "observed/synthetic pair mixing forbidden");
  assert.equal(new Set(all.map(item => item.run_id)).size, all.length, "distinct fresh role runs required");
  assert.equal(new Set(all.map(item => item.block.root)).size, all.length);
  for (let i = 0; i < all.length; i++) {
    assert.ok(!overlaps(resolve(options.storeRoot), all[i].block.root), "CAS and model writable roots must be separate");
    for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i].block.root, all[j].block.root), "pair workspaces overlap");
  }
  const roleGrading = roles.map(role => {
    const fixed = bindings[role][0].grading_resources;
    assert.ok(bindings[role].every(item => equal(item.grading_resources, fixed)), "each role must use one fixed grading resource configuration");
    return fixed;
  });
  if (roleGrading.some(Boolean)) {
    assert.ok(roleGrading.every(Boolean), "both roles need fixed grading resources");
    assert.notEqual(roleGrading[0].path, roleGrading[1].path, "separate role grading configurations required");
    assert.equal(roleGrading[0].fixtures_digest, roleGrading[1].fixtures_digest, "role grading fixed asset maps differ");
    assert.ok(!overlaps(roleGrading[0].output_root, roleGrading[1].output_root), "role grading outputs overlap");
    const protectedRoots = [ROOT, options.storeRoot, ...roleGrading.flatMap(item => [item.path, ...item.fixed_resource_paths]),
      ...all.flatMap(item => [item.block.root, item.block.public_input_root, ...(item.source_repository ? [item.source_repository] : [])])];
    for (const resource of roleGrading) for (const root of protectedRoots) {
      assert.ok(!overlaps(resource.output_root, root), "grading output overlaps authority/model input");
    }
    for (const resource of roleGrading) for (const item of all) for (const root of [item.block.root, item.block.public_input_root,
      ...(item.source_repository ? [item.source_repository] : [])]) assert.ok(!overlaps(resource.path, root), "grading configuration belongs outside model/public/seed roots");
  }
  const parity = item => Object.fromEntries(["fixture_id", "source_digest", "task_digest", "input_digest", "verification_digest", "public_criteria",
    "grading_binding", "scoring_version", "profile_id", "formal_task_class", "runner_task_class", "config", "mutable_paths", "prompt_runtime_contract"].map(key => [key, item[key]]));
  for (let i = 0; i < bindings.baseline.length; i++) assert.ok(equal(parity(bindings.baseline[i]), parity(bindings.challenger[i])), "pair task/criterion/runtime/budget mismatch");
  for (let i = 0; i < bindings.baseline.length; i++) assert.equal(bindings.baseline[i].cost_policy ?? null,
    bindings.challenger[i].cost_policy ?? null, "pair baseline/challenger cost policy mismatch");
  return freezePersonalEvolutionValue({ ...(fixtureSet === "catalog24" ? { fixture_set: fixtureSet } : {}),
    bindings, producer_sources: primaryProducerSources(), controller_sources: controllerSources(),
    evidence_kind: all[0].config.evidence_kind, candidate_digest: ctx.candidate.candidate_digest,
    experiment_digest: ctx.experiment.experiment_digest, comparison_scope: "fresh_parent_candidate_full_ask_with_P_K_F_context",
    formal_aggregate_eligible: false, models_started: false });
}
function pinnedLifecyclePlans(ctx, pins) {
  assert.ok(Array.isArray(pins) && pins.length <= 8 && new Set(pins).size === pins.length, "bounded unique pre-result lifecycle plans required");
  assert.deepEqual(pins, [...pins].sort(), "lifecycle plan pins must be sorted");
  const {lock_digest, ...parent} = ctx.candidate.parent_portfolio;
  for (const digest of pins) {
    assert.match(digest, /^sha256:[0-9a-f]{64}$/u);
    const plan = read(ctx.storeRoot, digest);
    assertPersonalEvolutionFields(plan, ["base_registry_snapshot_digest", "base_portfolio_lock_digest",
      "base_current_manifest", "target_manifest", "rollback_anchor", "portfolio_transitions", "asset_transitions", "reason_codes"], "pre-result lifecycle plan");
    assert.equal(plan.base_registry_snapshot_digest, ctx.candidate.registry.snapshot_digest);
    assert.equal(plan.base_portfolio_lock_digest, lock_digest);
    assert.ok(equal(plan.base_current_manifest, parent) && equal(plan.rollback_anchor, parent), "pre-result lifecycle parent/rollback drift");
  }
  return [...pins];
}
export function sealPersonalEvolutionPromptPair(options) {
  const description = describePersonalEvolutionPromptPair(options);
  const lifecyclePlans = Object.hasOwn(options, "lifecyclePlanObjectDigests")
    ? pinnedLifecyclePlans(context(options), options.lifecyclePlanObjectDigests) : null;
  for (const item of roles.flatMap(role => description.bindings[role])) {
    if (item.grading_resources) assert.equal(present(item.grading_resources.output_root), false, "grading output already exists before pair freeze");
    for (const path of ["start.json", "start.digest", "slots", "leases", "history"]) assert.equal(existsSync(join(item.block.root, "control", path)), false, "post-result pair registration forbidden");
    const report = reportUserComparison(item.block.root);
    assert.equal(report.execution.start_consumed, false); assert.ok(report.slots.every(slot => slot.state === "not_started"));
  }
  outputBoundary(options.outputRoot, options.storeRoot, description.bindings, false);
  mkdirSync(options.outputRoot, { mode: 0o700 });
  const count = description.bindings.baseline.length;
  const body = { kind: lifecyclePlans ? "personal_pre_result_prompt_pair_v2" : "personal_pre_result_prompt_pair_v1",
    ...(lifecyclePlans ? { lifecycle_plan_object_digests: lifecyclePlans } : {}), preparation_object_digest: options.preparationObjectDigest,
    experiment_object_digest: options.experimentObjectDigest, description, output_root: options.outputRoot,
    limits: personalEvolutionPairLimits(count, description.fixture_set), authority_implied: false };
  const registration = { ...body, pair_digest: canonicalDigest(body) };
  return freezePersonalEvolutionValue({ registration, object_digest: putContentAddressedJson({ storeRoot: options.storeRoot, artifact: registration }).digest,
    status: "NOT_RUN", recommendation: "insufficient_evidence", quality: null, authority_implied: false });
}
function registered(options) {
  assert.ok(options.trustedPairRegistrationObjectDigests?.includes(options.pairRegistrationObjectDigest), "independent pre-result pair pin required");
  const registration = read(options.storeRoot, options.pairRegistrationObjectDigest);
  const v2 = registration.kind === "personal_pre_result_prompt_pair_v2";
  assertPersonalEvolutionFields(registration, ["kind", "preparation_object_digest", "experiment_object_digest", "description", "output_root", "limits", "authority_implied", "pair_digest",
    ...(v2 ? ["lifecycle_plan_object_digests"] : [])], "Prompt pair registration");
  const { pair_digest, ...body } = registration; assert.equal(canonicalDigest(body), pair_digest); assert.equal(registration.authority_implied, false);
  if (!v2) assert.equal(registration.kind, "personal_pre_result_prompt_pair_v1");
  assert.equal(options.preparationObjectDigest, registration.preparation_object_digest);
  assert.equal(options.experimentObjectDigest, registration.experiment_object_digest);
  const blocks = Object.fromEntries(roles.map(role => [role, registration.description.bindings[role].map(item => item.block)]));
  const ctx = context(options), description = describePersonalEvolutionPromptPair({ ...options, blocks, fixtureSet: registration.description.fixture_set ?? "legacy9" });
  if (v2) pinnedLifecyclePlans(ctx, registration.lifecycle_plan_object_digests);
  assert.ok(equal(description, registration.description), "pair pre-result bindings/source drift");
  assert.ok(equal(registration.limits, personalEvolutionPairLimits(description.bindings.baseline.length, description.fixture_set)), "pair derived limits drift");
  outputBoundary(registration.output_root, options.storeRoot, description.bindings, true);
  return { ...ctx, registration, blocks };
}
function evidenceFor(ctx, report, evaluationAuthority) {
  assertPersonalEvolutionFields(evaluationAuthority, ["authority_id", "authority_revision", "authority_evidence_digest"], "pair evaluation authority");
  assert.ok(![ctx.candidate.generation.actor.actor_id, ctx.candidate.authorities.experiment.authority_id,
    ctx.candidate.authorities.decision.authority_id].includes(evaluationAuthority.authority_id), "independent evaluation authority required");
  const kinds = { quality: "directional_outcome_report", safety: "directional_outcome_report", cost: "directional_outcome_report",
    variance: "repetition_report", mechanism: "mechanism_scorecard", external_outcome: "external_outcome_report" };
  const dimensions = Object.fromEntries(Object.entries(kinds).map(([name, source_kind]) => {
    const challengers = report.observations.filter(item => item.role === "challenger");
    const unsafe = challengers.some(item => item.engineering.safety_blocker.status === "fail");
    const contradicted = challengers.some(item => item.engineering.blockers.gate_status === "fail");
    const safetyClosed = challengers.length === ctx.blocks.challenger.length
      && challengers.every(item => item.engineering.safety_blocker.status === "pass");
    const costsClosed = report.status === "saved_pair_verified" && report.observations.every(item =>
      ["input_tokens", "output_tokens", "duration_ms", "human_effort", "monetary_cost"].every(key =>
        ["known", "not_applicable"].includes(item.engineering.overhead_telemetry[key].status)));
    const complete = name === "quality" ? contradicted || report.status === "saved_pair_verified"
      : name === "safety" ? unsafe || safetyClosed : name === "cost" ? costsClosed : false;
    const marker = { kind: "personal_pair_dimension", pair_digest: ctx.registration.pair_digest, report_digest: canonicalDigest(report),
      dimension: name, collected: complete, reason: complete ? "saved_public_engineering_observation" : report.status };
    const partial = ["quality", "safety", "cost"].includes(name) && report.observations.length > 0;
    const status = complete ? "complete" : partial ? "insufficient_evidence" : "unavailable";
    const conclusion = complete ? name === "safety" && unsafe ? "unsafe"
      : name === "quality" && contradicted ? "contradicted" : "observed" : partial ? "unknown" : "unavailable";
    return [name, { status, conclusion, source_kind, artifact_id: `pair-${name}-${ctx.registration.pair_digest.slice(7, 23)}`,
      artifact_digest: canonicalDigest(marker), causal_credit_applied: false, factor_ids: [] }];
  }));
  return { authority: { ...evaluationAuthority, kind: "external_evolution_evaluation_authority", experiment_digest: ctx.experiment.experiment_digest,
      verification_mode: "full_verifier", artifact_inventory_digest: computeEvolutionArtifactInventoryDigest(dimensions) },
    dimensions, causal_attribution: { status: "not_claimed", factor_ids: [], evidence_digests: [] },
    reason_codes: ["separate_fresh_parent_candidate_pair", "P_K_F_context_not_candidate_improvement", "no_causal_credit", report.status,
      `evidence_kind_${ctx.registration.description.evidence_kind}`].sort() };
}
export function verifyPersonalEvolutionPromptPairResults(options) {
  const ctx = registered(options), pairs = [], observations = []; let pending = 0, incomplete = 0;
  for (let i = 0; i < ctx.blocks.baseline.length; i++) {
    const pair = {};
    for (const role of roles) {
      const block = ctx.blocks[role][i], report = reportUserComparison(block.root);
      const saved = options.savedResults?.[role]?.[block.fixture_id];
      if (report.execution.start_consumed === false) { assert.equal(saved, undefined, "an unstarted candidate cannot claim historical saved results"); pending++; continue; }
      if (ctx.registration.kind === "personal_pre_result_prompt_pair_v2") {
        const invocation = json(join(ctx.registration.output_root, "invocation/request.json"));
        assertPersonalEvolutionFields(invocation, ["pair_object_digest", "started_at_ms", "deadline_at_ms"], "pair invocation request");
        assert.equal(invocation.pair_object_digest, options.pairRegistrationObjectDigest, "post-result pair/plan registration transplant");
      }
      if (!saved) { incomplete++; continue; }
      assertPersonalEvolutionFields(saved, ["producer", "engineering_result"], "saved Prompt pair result");
      const producer = verifyPrimaryEvaluationProducer(saved.producer);
      assert.equal(producer.block.run_id, block.run_id); assert.equal(producer.block.plan_digest, block.plan_digest);
      assert.ok(equal(producer.block, block), "foreign/old producer result cannot become candidate evidence");
      const verifiedNormalized = withPrimaryEvaluationProducer(saved.producer, verified => {
        const outputPath = join(saved.producer.recordRoot, "normalized");
        const result = verifyNormalizedPortfolioResults({ ...verified.executionOptions, outputPath });
        verifyPortfolioScoringRootLineage({ ...verified.executionOptions, normalizedResultsPath: outputPath }, result);
        return result;
      });
      const normalizedEntry = verifiedNormalized.manifest.cases.find(item => item.condition === "full_ask")?.normalized_attempts[0];
      assert.ok(normalizedEntry, "fresh full_ask normalized result required");
      const normalized = json(join(verifiedNormalized.generationPath, normalizedEntry.path));
      const engineeringRaw = raw(saved.engineering_result.path); assert.equal(comparisonHash(engineeringRaw), saved.engineering_result.digest);
      assert.ok(options.trustedSavedEngineeringResultDigests?.includes(saved.engineering_result.digest), "separate saved grading provenance required; file metadata is not authority");
      const engineering = parseJsonRejectDuplicateKeys(engineeringRaw.toString("utf8"));
      withPrimaryEvaluationProducer(saved.producer, () => validatePortfolioEngineeringResult(engineering));
      assert.equal(engineering.normalized_result_digest, normalized.normalized_result_digest);
      assert.equal(engineering.normalized_result_id, normalized.normalized_result_id);
      assert.equal(engineering.normalized_outcome, normalized.outcome, "saved grading outcome differs from fresh execution");
      for (const key of ["run_instance_id", "plan_id", "plan_digest", "fixture_id", "fixture_input_digest", "case_id", "condition", "attempt"]) {
        assert.equal(engineering[key], normalized.lineage[key], `saved engineering ${key} transplant`);
      }
      assert.equal(engineering.condition, "full_ask"); assert.equal(engineering.fixture_id, block.fixture_id);
      assert.equal(engineering.adapter, normalized.lineage.adapter_track);
      for (const key of ["suite", "task_class", "repetition"]) assert.equal(engineering[key], normalized.lineage[key]);
      assert.equal(engineering.source_snapshot_digest, verifiedNormalized.manifest.source_snapshot_digest);
      assert.equal(engineering.evaluator_bundle_digest, block.grading.binding.evaluator_bundle_digest);
      assert.equal(engineering.scoring_input_freeze_manifest_source_digest, block.grading.binding.scoring_input_freeze_digest);
      const freezePath = join(primaryScoringRoot(producer.block), producer.request.public_grading_references.scoring_input_freeze.path);
      assert.equal(comparisonHash(raw(freezePath)), block.grading.binding.scoring_input_freeze_digest);
      const freeze = json(freezePath);
      const publicFrozen = key => {
        const path = join(primaryScoringRoot(producer.block), freeze[key].path);
        assert.equal(comparisonHash(raw(path)), freeze[key].raw_byte_digest, `saved ${key} frozen bytes changed`);
        return json(path);
      };
      const admission = publicFrozen("admission_record"), evaluator = publicFrozen("evaluator_public_reference");
      for (const [key, expected] of Object.entries({ scoring_input_freeze_manifest_digest: freeze.manifest_digest,
        catalog_digest: freeze.catalog.semantic_digest, policy_manifest_digest: freeze.policy_manifest.semantic_digest,
        scoring_policy_digest: freeze.scoring_policy.semantic_digest, requirement_record_digest: freeze.requirement_record.record_digest,
        requirement_set_digest: freeze.requirement_record.set_digest, output_contract_digest: freeze.output_contract.semantic_digest,
        evaluator_public_reference_digest: freeze.evaluator_public_reference.semantic_digest,
        admission_record_digest: freeze.admission_record.semantic_digest, frozen_admission_record_digest: freeze.admission_record.semantic_digest,
        requirement_authority_digest: admission.requirement_authority_digest ?? admission.admission_digest,
        evaluator_bundle_id: evaluator.evaluator_bundle_id, evaluator_revision: evaluator.evaluator_revision })) assert.equal(engineering[key], expected, `saved criterion ${key} changed`);
      observations.push({ role, fixture_id: block.fixture_id, engineering });
      if (engineering.scoring_status !== "complete") { incomplete++; continue; }
      pair[role] = engineering;
    }
    if (roles.every(role => pair[role])) pairs.push({ fixture_id: ctx.blocks.baseline[i].fixture_id, ...pair,
      quality_delta: pair.challenger.requirement_score.normalized_requirement_score - pair.baseline.requirement_score.normalized_requirement_score });
  }
  const report = { kind: "personal_prompt_pair_saved_readout_v1", pair_digest: ctx.registration.pair_digest,
    status: pending === roles.flatMap(role => ctx.blocks[role]).length ? "NOT_RUN" : pending || incomplete ? "hold_incomplete" : "saved_pair_verified",
    evidence_kind: ctx.registration.description.evidence_kind, pairs, observations, pending_role_count: pending, incomplete_role_count: incomplete, causal_attribution: "not_claimed",
    diagnostic_context: "P/K-principles/F retained separately; only fresh full_ask parent/candidate roles compared", formal_aggregate_eligible: false };
  const evidence = evidenceFor(ctx, report, options.evaluationAuthority);
  const recommendation = deriveEvolutionRecommendation({ experiment: ctx.experiment, evidence });
  return freezePersonalEvolutionValue({ report, evidence, recommendation, candidate: ctx.candidate, experiment: ctx.experiment,
    status: report.status, models_started: false, mutation_performed: false, authority_implied: false, result_access: "saved_public_files_only" });
}

// A one-use composition of existing child runner/grading APIs, not a runner.
// Only a new direct human invocation may call this function in observed mode.
export async function startPersonalEvolutionPromptPair(options) {
  const verificationKeys = ["storeRoot", "preparationObjectDigest", "experimentObjectDigest", "pairRegistrationObjectDigest",
    "trustedAssetAuthorityContexts", "trustedPortfolioAuthorityContexts", "trustedHighImpactApprovalGrants",
    "trustedExperimentAuthorities", "trustedExperimentObjectDigests", "trustedPairRegistrationObjectDigests", "evaluationAuthority"];
  const verificationInputs = freezePersonalEvolutionValue(structuredClone(Object.fromEntries(verificationKeys
    .filter(key => Object.hasOwn(options, key)).map(key => [key, options[key]]))));
  const confirmedPairObjectDigest = options.confirmedPairObjectDigest;
  const start = options.startComparison ?? startUserComparison, now = options.now ?? Date.now, signal = options.signal;
  const ctx = registered(verificationInputs), registration = ctx.registration;
  assert.equal(confirmedPairObjectDigest, verificationInputs.pairRegistrationObjectDigest, "human must confirm fixed pair digest");
  const suppliedGraders = options.gradingAdapters;
  assert.equal(options.gradingAdapter, undefined, "singular grading adapter is unsupported for two role outputs");
  assertPersonalEvolutionFields(suppliedGraders, roles, "separate role grading adapters");
  const descriptors = Object.getOwnPropertyDescriptors(suppliedGraders);
  for (const role of roles) assert.ok(Object.hasOwn(descriptors[role], "value"), "grading adapter accessor refused");
  // Check and call the same owned refs across callbacks and awaits. The caller
  // cannot replace a checked factory with an unregistered later capability.
  const graders = Object.freeze(Object.fromEntries(roles.map(role => [role, descriptors[role].value])));
  assert.notEqual(graders.baseline, graders.challenger, "one grading adapter cannot serve both role output roots");
  const all = roles.flatMap(role => ctx.blocks[role]);
  const synthetic = all.every(block => readUserComparisonPlan(block.root).plan.config.evidence_kind === "synthetic");
  for (const role of roles) {
    const resource = registration.description.bindings[role][0].grading_resources;
    if (resource) assert.equal(present(resource.output_root), false, "role grading output already exists before invocation");
  }
  assert.ok(start === startUserComparison ? !synthetic && all.every(block => readUserComparisonPlan(block.root).plan.config.evidence_kind === "observed")
    : synthetic, "fake start is synthetic only; no production fallback for synthetic pair");
  if (!synthetic) assert.ok(roles.every(role => isPrimaryEvaluationGradingAdapter(graders[role])), "observed grading requires separate existing registered factories");
  const inspect = () => {
    for (const role of roles) for (const [index, block] of ctx.blocks[role].entries()) {
      const loaded = readUserComparisonPlan(block.root);
      const resource = registration.description.bindings[role][index].grading_resources;
      if (resource) assert.equal(present(join(resource.output_root, block.fixture_id)), false, "fixture grading output already exists before child dispatch");
      assert.ok(Object.values(loaded.plan.arms).every(arm => arm.capability.status === "available"), "missing Skill/capability is a blocker, not quality0");
      assert.equal(existsSync(join(block.root, "control/start.json")), false, "role start already consumed");
      const preflight = graders[role].preflight(block, loaded);
      assert.equal(preflight.status, "ready"); assert.equal(preflight.blockers.length, 0);
    }
  };
  inspect();
  const consumption = join(registration.output_root, "invocation"); mkdirSync(consumption, { mode: 0o700 });
  const save = (name, artifact) => publishJsonAtomicNoReplace({ outputPath: join(consumption, name), artifact, label: "personal pair invocation evidence" });
  const started = now(), deadline = started + registration.limits.overall_timeout_ms;
  save("request.json", { pair_object_digest: verificationInputs.pairRegistrationObjectDigest, started_at_ms: started, deadline_at_ms: deadline });
  const controller = new AbortController(), relay = () => controller.abort();
  signal?.addEventListener("abort", relay, { once: true }); if (signal?.aborted) relay();
  const timer = setTimeout(relay, registration.limits.overall_timeout_ms); timer.unref();
  const savedResults = { baseline: {}, challenger: {} }, trustedGrades = []; let tokens = 0;
  try {
    for (const role of roles) for (const [index, block] of ctx.blocks[role].entries()) {
      assert.ok(!controller.signal.aborted && now() < deadline, "pair deadline/interruption");
      assert.ok(tokens < registration.limits.token_budget, "pair usage admission budget exhausted");
      const loaded = readUserComparisonPlan(block.root);
      assert.ok(deadline - now() >= loaded.plan.config.overall_timeout_ms + PRIMARY_GRADING_RESERVATION_MS, "insufficient full child+grading reservation");
      const resource = registration.description.bindings[role][index].grading_resources;
      if (resource) assert.equal(present(join(resource.output_root, block.fixture_id)), false, "fixture grading output already exists before child dispatch");
      const refreshed = graders[role].preflight(block, loaded);
      assert.equal(refreshed.status, "ready"); assert.equal(refreshed.blockers.length, 0);
      save(`${role}-${index}-requested.json`, { run_id: block.run_id, plan_digest: block.plan_digest });
      await start(block.root, block.plan_digest, { signal: controller.signal });
      const report = reportUserComparison(block.root);
      save(`${role}-${index}-report.json`, report);
      assert.ok(report.slots.every(slot => slot.receipt_integrity === "valid" && slot.process_completed === true
        && slot.unresolved_child === false && ["completed", "verification_failed"].includes(slot.state)), "incomplete/unresolved child; no repeated start");
      const lower = report.usage_budget?.known_tokens_lower_bound; assert.ok(Number.isSafeInteger(lower) && lower >= 0); tokens += lower;
      assert.ok(tokens < registration.limits.token_budget, "pair usage admission budget exhausted after child");
      assert.ok(!controller.signal.aborted && now() < deadline);
      const grade = await graders[role].grade(block, report, { signal: controller.signal, deadline_at_ms: deadline });
      save(`${role}-${index}-grading.json`, grade);
      assert.ok(!controller.signal.aborted && now() < deadline, "grading deadline/interruption");
      assert.equal(grade.status, "completed", "existing grading incomplete");
      const full = grade.conditions.find(item => item.condition === "full_ask");
      assert.ok(full?.public_artifacts?.engineering_result && grade.producer, "saved original grading artifacts required");
      savedResults[role][block.fixture_id] = { producer: { recordRoot: grade.producer.record_root, externalDigest: grade.producer.digest },
        engineering_result: full.public_artifacts.engineering_result };
      // Runtime receipts from the registered controller-owned grader. No returned
      // evaluation evidence is inserted into Evolution's separate trust arrays.
      trustedGrades.push(full.public_artifacts.engineering_result.digest);
    }
    const result = verifyPersonalEvolutionPromptPairResults({ ...verificationInputs, savedResults, trustedSavedEngineeringResultDigests: trustedGrades });
    save("saved-result-connection.json", { savedResults, trusted_grade_receipt_digests: trustedGrades, report: result.report,
      evidence: result.evidence, recommendation: result.recommendation, action: "held_pending_separate_evaluation_and_human_trust",
      models_started_by_report: false, authority_implied: false });
    return freezePersonalEvolutionValue({ ...result, models_started: !synthetic,
      scope: "one_authorized_invocation_of_existing_runner_and_grader", action: "held_pending_separate_evaluation_and_human_trust" });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}

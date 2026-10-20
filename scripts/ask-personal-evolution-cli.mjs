#!/usr/bin/env node
// User operations over existing immutable evolution artifacts. Files here are
// command inputs/pointers and a presentation cache, not a second lifecycle ledger.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  putContentAddressedJson, readContentAddressedJson, readStableBytes } from "./content-addressed-store.mjs";
import { publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { validatePersonalEvolutionEvaluationSelection } from "./ask-personal-evolution-primary-pair.mjs";
import { readPrimaryScoringVersion } from "./ask-primary-scoring-version.mjs";
import { registerAsset, buildAssetLifecycleAuthorityContext, exportAssetRegistryReference } from "./asset-registry.mjs";
import { preparePersonalEvolutionCandidate, verifyPersonalEvolutionParent, inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { preparePersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { inspectPersonalEvolutionGenerationStatus } from "./ask-personal-evolution-generation-connector.mjs";
import { inspectPreparedPersonalEvolutionCodexGeneration, startPreparedPersonalEvolutionCodexGeneration } from "./ask-personal-evolution-codex-generation.mjs";
import { inspectPreparedPersonalEvolutionLoop, startPreparedPersonalEvolutionLoop } from "./ask-personal-evolution-driver.mjs";
import { preparePersonalEvolutionCliPair } from "./ask-personal-evolution-cli-prepare.mjs";
import { verifyPersonalEvolutionSavedResults, preparePersonalEvolutionSavedResultActions,
  finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";
import { buildEvolutionHumanDecision, publishEvolutionHumanDecision, applyApprovedEvolutionCandidateRejection } from "./evolution-loop.mjs";
import { reportUserComparison } from "./ask-user-comparison.mjs";
import { runUnattendedPersonalEvolution, validatePersonalEvolutionRunPolicy } from "./ask-personal-evolution-unattended.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const TRUST_KEYS = ["trustedAssetAuthorityContexts", "trustedPortfolioAuthorityContexts", "trustedHighImpactApprovalGrants"];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const json = path => parseJsonRejectDuplicateKeys(readStableBytes(path, "personal CLI input").toString("utf8"));
const save = (path, artifact) => publishJsonAtomicNoReplace({ outputPath: path, artifact, label: "personal CLI command input" });
const exact = (value, keys, label) => { assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label); };
function absolute(path) { assert.ok(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "absolute normalized path required");
  assertNoSymlinkPathSegments(path, "personal CLI path", { allowMissingLeaf: true }); return path; }
function reason(value) { assert.ok(typeof value === "string" && value.trim() && value.length <= 2048, "a bounded human reason is required"); return value; }
function snapshot(value) { return { value, digest: canonicalDigest(value) }; }
function loadSnapshot(path) { const saved = json(path); exact(saved, ["value", "digest"], "command snapshot");
  assert.equal(canonicalDigest(saved.value), saved.digest, "command input drift"); return saved.value; }
function sourceRevision() {
  const result = spawnSync("git", ["--no-optional-locks", "-c", `core.hooksPath=${devNull}`, "rev-parse", "HEAD"], {
    cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
      GIT_CONFIG_NOSYSTEM: "1", GIT_NO_LAZY_FETCH: "1" } });
  assert.equal(result.status, 0, "committed source required"); const revision = result.stdout.trim();
  assert.match(revision, /^[a-f0-9]{40}$/u); return revision;
}
function configure(configPath, profileRoot) {
  const config = json(absolute(configPath));
  exact(config, ["storeRoot", "blueprint", "generationActor", "trust", "portfolioAuthority", "selectorContext",
    "experimentTemplateObjectDigest", "evaluationAuthority", "generation", "evaluation", ...(Object.hasOwn(config, "unattended") ? ["unattended"] : [])], "management inputs");
  if (config.unattended) validatePersonalEvolutionRunPolicy(config.unattended);
  absolute(config.storeRoot); exact(config.trust, TRUST_KEYS, "existing trust inputs");
  for (const key of TRUST_KEYS) assert.ok(Array.isArray(config.trust[key]), key);
  exact(config.generation, ["executable", "timeoutMs"], "generation inputs");
  exact(config.evaluation, ["publicInputRoot", "cliBin", "cliVersion", "model", "reasoning", "evidenceKind", "scoringVersion", "gradingResources",
    ...(Object.hasOwn(config.evaluation, "fixtureSet") ? ["fixtureSet"] : [])], "evaluation inputs");
  absolute(config.evaluation.publicInputRoot);
  assert.ok(["observed", "synthetic"].includes(config.evaluation.evidenceKind));
  exact(config.evaluation.gradingResources, ["baseline", "challenger"], "separate role resources");
  for (const resource of Object.values(config.evaluation.gradingResources)) {
    exact(resource, ["path", "digest"], "grading resource reference"); absolute(resource.path);
    assert.match(resource.digest, /^sha256:[a-f0-9]{64}$/u);
  }
  assert.notEqual(config.evaluation.gradingResources.baseline.path, config.evaluation.gradingResources.challenger.path);
  const ids = config.blueprint.evaluation_scope.fixture_ids;
  exact(config.evaluation.scoringVersion, ["path", "digest"], "fixed scoring version selector required");
  absolute(config.evaluation.scoringVersion.path);
  validatePersonalEvolutionEvaluationSelection(config.evaluation, ids);
  for (const id of ids) readPrimaryScoringVersion(config.evaluation.scoringVersion, id, { verifyResourceFiles: true });
  assert.equal(config.blueprint.parent_asset.asset_type, "prompt", "rendered Codex Prompt target required");
  verifyPersonalEvolutionParent({ storeRoot: config.storeRoot, candidate: config.blueprint, ...config.trust });
  const template = read(config.storeRoot, config.experimentTemplateObjectDigest);
  assert.equal(template.projection.mode, "prompt_v2_exact");
  const revision = sourceRevision();
  const profile = { ...config, sourceRevision: revision, selectorContext: { ...config.selectorContext, source_revision: revision } };
  mkdirSync(absolute(profileRoot), { mode: 0o700 }); save(join(profileRoot, "profile.json"), snapshot(profile));
  return { status: "configured", target: config.blueprint.parent_asset.stable_id, fixture_ids: ids,
    model_execution: "Unknown", models_started: false, installation_performed: false,
    ...(config.unattended ? { unattended_policy_digest: canonicalDigest(config.unattended) } : {}) };
}
function loadCycle(cycleRoot) {
  absolute(cycleRoot); const input = loadSnapshot(join(cycleRoot, "input.json"));
  return { root: cycleRoot, input, profile: input.profile };
}
function pointer(c, name) { const path = join(c.root, `${name}.json`); return existsSync(path) ? loadSnapshot(path) : null; }
function pin(c, name, value) { save(join(c.root, `${name}.json`), snapshot(value)); return value; }
function generation(c) { return inspectPersonalEvolutionGenerationStatus({ storeRoot: c.profile.storeRoot,
  requestObjectDigest: c.input.requestObjectDigest, ...c.profile.trust }); }
function rejectionAuthority(c) {
  const human = pointer(c, "decision"), actions = pointer(c, "actions");
  if (human?.decision.disposition !== "approved" || human.decision.action !== "reject_candidate" || actions?.proposal.action !== "reject_candidate") return null;
  const plan = actions.proposal.lifecycle_plan, registry = read(c.profile.storeRoot, plan.base_registry_snapshot_digest);
  return buildAssetLifecycleAuthorityContext({ registryId: registry.registry_id, repositoryId: registry.repository_id, scopeId: registry.scope_id,
    predecessorSnapshotDigest: plan.base_registry_snapshot_digest, transitions: plan.asset_transitions,
    authority: { ...human.decision.authority, authority_revision: String(human.decision.authority.authority_revision),
      kind: "external_asset_lifecycle_authority", authority_evidence_digest: human.decisionObjectDigest } });
}
function savedInput(c, pair) {
  const path = join(pair.outputRoot, "invocation/saved-result-connection.json");
  if (!existsSync(path)) return null;
  const connection = json(path);
  // Registered original graders emitted these receipt pins. The human must
  // separately confirm the whole verified evaluation before actions are authored.
  const rejection = rejectionAuthority(c);
  return { ...pair.input, trustedAssetAuthorityContexts: [...(pair.input.trustedAssetAuthorityContexts ?? []), ...(rejection ? [rejection] : [])], savedResults: connection.savedResults,
    trustedSavedEngineeringResultDigests: connection.trusted_grade_receipt_digests };
}
function reviewView(c, status) {
  const store = c.profile.storeRoot, asset = status.candidate_asset;
  const record = read(store, asset.record_digest), parent = read(store, c.profile.blueprint.parent_asset.record_digest);
  const content = read(store, asset.content_digest), old = read(store, c.profile.blueprint.parent_asset.content_digest);
  return { candidate_asset: asset, inherited_scope: parent.applicability,
    inherited_permissions_and_effects: parent.permissions_and_effects,
    inherited_maintenance: parent.maintenance,
    files: content.files.map(file => ({ path: file.path,
      before: Buffer.from(old.files.find(item => item.path === file.path)?.bytes_base64 ?? "", "base64").toString("utf8"),
      after: Buffer.from(file.bytes_base64, "base64").toString("utf8") })),
    source_review_status: record.safety.status, quality_evidence: record.evaluation_history.status,
    provenance: record.provenance,
    approval_attests: "Exact source is safe for the inherited scope and permissions/effects, introduces no high-impact behavior, and is fresh for this comparison; quality and actual model use remain unproven.",
    next_command: "review-source --approve --reason REASON" };
}
function describeStatus(c, alreadyVerified) {
  const gen = generation(c), pair = pointer(c, "pair"), decision = pointer(c, "decision"), completion = pointer(c, "completion");
  const base = { request_object_digest: c.input.requestObjectDigest, generation: gen, models_started_by_readout: false,
    observation: c.input.observationInput, target: c.input.blueprint.parent_asset,
    model_use: "Unknown", causal_quality_contribution: "Unknown",
    installation_performed: false, next_command: null };
  if (gen.status !== "candidate_ready") return { ...base, status: gen.status === "NOT_RUN" ? "prepared" : "needs_action",
    reason: gen.status, next_command: gen.status === "NOT_RUN" ? "start --cycle CYCLE" : "inspect preserved generation records; do not repeat this request" };
  if (!pointer(c, "source-review")) return { ...base, status: "needs_source_review", reason: "generated_source_is_unevaluated",
    next_command: "review-source --cycle CYCLE" };
  if (!pair) return { ...base, status: "needs_action", reason: pointer(c, "alignment-hold") ? "portfolio_selection_blocked" : "evaluation_preparation_not_complete",
    details: pointer(c, "alignment-hold"), next_command: "start --cycle CYCLE" };
  const saved = savedInput(c, pair);
  if (!saved) {
    const registration = read(c.profile.storeRoot, pair.input.pairRegistrationObjectDigest);
    const consumed = existsSync(join(pair.outputRoot, "invocation"));
    return { ...base, status: consumed ? "needs_action" : "prepared_comparison",
      reason: consumed ? "comparison_consumed_without_complete_saved_result" : "fixed_pair_not_started",
      partial_reports: Object.fromEntries(["baseline", "challenger"].map(role => [role,
        registration.description.bindings[role].map(binding => reportUserComparison(binding.block.root))])),
      output_root: pair.outputRoot, next_command: consumed ? "inspect preserved child/grading records; do not repeat this pair" : "start --cycle CYCLE" };
  }
  const verified = alreadyVerified ?? verifyPersonalEvolutionSavedResults(saved);
  const report = verified.report;
  const result = { ...base, recommendation: verified.recommendation, evidence: verified.evidence,
    report: { status: report.status, evidence_kind: report.evidence_kind,
      pairs: report.pairs.map(item => ({ fixture_id: item.fixture_id,
        baseline_quality: item.baseline.requirement_score.normalized_requirement_score,
        challenger_quality: item.challenger.requirement_score.normalized_requirement_score, quality_delta: item.quality_delta })),
      pending_role_count: report.pending_role_count, incomplete_role_count: report.incomplete_role_count,
      causal_attribution: report.causal_attribution },
    output_root: pair.outputRoot, pair_object_digest: pair.input.pairRegistrationObjectDigest };
  if (verified.status !== "saved_pair_verified") return { ...result, status: "needs_action",
    reason: "saved_comparison_incomplete", next_command: "inspect preserved partial grading and missing observations; do not repeat this pair" };
  let decisionReason = null;
  if (decision) {
    const actions = pointer(c, "actions"), confirmation = pointer(c, "evaluation-confirmation");
    inspectPersonalEvolution({ ...saved, trustedEvaluationAuthorities: [confirmation.evidence],
      trustedHumanDecisionAuthorities: [decision.decision], artifacts: { ...actions.artifacts,
        decisionObjectDigest: decision.decisionObjectDigest,
        ...(completion ? { receiptObjectDigest: completion.receipt_object_digest } : {}) } });
    const fact = read(c.profile.storeRoot, decision.reasonObjectDigest);
    assert.equal(fact.proposal_digest, actions.proposal.proposal_digest);
    assert.equal(fact.disposition, decision.decision.disposition);
    assert.ok(decision.decision.reason_codes.includes(`human_reason:${decision.reasonObjectDigest}`));
    decisionReason = fact.reason;
  }
  if (completion) {
    assert.ok(decision, "completion requires recorded human decision");
    const lifecycleMutated = read(c.profile.storeRoot, completion.receipt_object_digest).action === "reject_candidate";
    return { ...result, status: "completed", reason: lifecycleMutated ? "approved_saved_rejection" : "approved_saved_noop",
      receipt_object_digest: completion.receipt_object_digest, lifecycle_mutated: lifecycleMutated, decision, decision_reason: decisionReason,
      next_command: "next --cycle CYCLE --output NEW_CYCLE --problem PUBLIC_SUMMARY" };
  }
  if (decision) return { ...result, status: decision.decision.disposition === "declined" ? "decision_declined" : "needs_action",
    reason: decision.decision.disposition === "declined" ? "human_declined_proposal" : "explicit_lifecycle_application_required", decision,
    decision_reason: decisionReason,
    next_command: "retain this decision and use the separately approved lifecycle path" };
  if (!pointer(c, "evaluation-confirmation")) return { ...result, status: "needs_evaluation_confirmation",
    reason: "saved_results_do_not_grant_evaluation_authority", next_command: "confirm-evaluation --cycle CYCLE --confirm --reason REASON" };
  if (!pointer(c, "actions")) return { ...result, status: "needs_action", reason: "separate_pre_result_lifecycle_plan_required",
    next_command: "retain results and prepare the separately authorized lifecycle plan" };
  return { ...result, status: "needs_decision", reason: "human_decision_required", proposal: pointer(c, "actions").proposal,
    next_command: "decide --cycle CYCLE --approve|--decline --reason REASON" };
}
function status(c, alreadyVerified = null) {
  try {
    const result = describeStatus(c, alreadyVerified);
    // The cache can explain an earlier failed command, but never decides state
    // or grants a capability. Deleting/corrupting it cannot change authority.
    try {
      const cached = json(join(c.root, "readout.json"));
      if (typeof cached.failed_command === "string" && Object.hasOwn(COMMANDS, cached.failed_command) && typeof cached.detail === "string") result.last_command_failure = {
        command: cached.failed_command, detail: cached.detail.slice(0, 2048) };
    } catch { /* optional presentation cache */ }
    return result;
  }
  catch (error) { return { status: "needs_action", reason: "saved_state_verification_failed",
    request_object_digest: c.input.requestObjectDigest, detail: String(error.message).slice(0, 2048),
    models_started_by_readout: false, installation_performed: false,
    next_command: "preserve records and investigate the inconsistent evidence; do not repeat an invocation" }; }
}
function problem(path) { const text = readStableBytes(absolute(path), "public problem summary").toString("utf8"); return reason(text.trim()); }
function initializeCycle({ profile, cycleRoot, target, text, predecessor = null }) {
  assert.equal(target, profile.blueprint.parent_asset.stable_id, "target differs from configured Prompt");
  const cycleId = `personal-${randomUUID()}`, blueprint = { ...profile.blueprint, candidate_id: cycleId };
  const observationInput = { observation_id: cycleId, repository_id: blueprint.registry.repository_id,
    task_ids: [`observed-${cycleId}`], evidence_refs: [{ artifact_id: "user_reviewed_public_problem", digest: canonicalDigest(text) },
      ...(predecessor ? [{ artifact_id: "previous_personal_evolution_receipt", digest: predecessor }] : [])],
    evidence_status: "Hypothesis", correction: text, intended_mechanism: "A scoped instruction revision addressing the user-described problem; effectiveness unproven.",
    applicability: `Configured target ${target}`, non_applicability: ["No evidence of model effectiveness or physical installation."],
    privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } };
  mkdirSync(absolute(cycleRoot), { mode: 0o700 });
  const requested = preparePersonalEvolutionGenerationRequest({ storeRoot: profile.storeRoot, observationInput, blueprint,
    generationActor: profile.generationActor, holdoutTaskIds: blueprint.evaluation_scope.fixture_ids,
    requestedVersion: cycleId, requestId: cycleId, ...profile.trust });
  save(join(cycleRoot, "input.json"), snapshot({ profile, cycleId, requestObjectDigest: requested.request_object_digest,
    observationInput, blueprint, predecessorReceiptObjectDigest: predecessor }));
  return loadCycle(cycleRoot);
}
function approveSource(c, gen, humanReason) {
  if (pointer(c, "source-review")) return;
  assert.equal(gen.status, "candidate_ready", "candidate source is not ready"); reason(humanReason);
  const storeRoot = c.profile.storeRoot, generated = read(storeRoot, gen.candidate_asset.record_digest);
  const parent = read(storeRoot, c.profile.blueprint.parent_asset.record_digest);
  assert.equal(parent.safety.classifications.includes("high_impact"), false, "high-impact review requires its separate path");
  assert.ok(["supported", "verified"].includes(parent.permissions_and_effects.status), "inherited permissions must already be reviewed");
  const fact = { kind: "personal_explicit_source_review_v1", candidate_asset: gen.candidate_asset,
    inherited_parent: c.profile.blueprint.parent_asset, content_digest: gen.candidate_asset.content_digest,
    reviewed_scope: parent.applicability, reviewed_permissions_and_effects: parent.permissions_and_effects,
    reviewed_maintenance: parent.maintenance, fresh_for_fixed_comparison: true,
    reason: humanReason, quality_evidence: "not_evaluated", authority_implied: false };
  const reviewDigest = putContentAddressedJson({ storeRoot, artifact: fact }).digest;
  const descriptor = structuredClone(generated); delete descriptor.object_kind;
  const content = read(storeRoot, gen.candidate_asset.content_digest);
  descriptor.content = { package_format: content.package_format,
    files: content.files.map(({ path, media_type, raw_digest }) => ({ path, media_type, raw_digest })) };
  descriptor.version += "-source-reviewed";
  descriptor.safety = { status: "supported", classifications: [...new Set([...parent.safety.classifications, "manual_source_review"])].sort(), constraint_refs: [reviewDigest] };
  descriptor.permissions_and_effects = { ...parent.permissions_and_effects, status: "supported",
    permission_refs: [reviewDigest], effect_refs: [reviewDigest] };
  descriptor.applicability = structuredClone(parent.applicability);
  descriptor.maintenance.stale_status = "fresh";
  const generatedPrep = read(storeRoot, gen.preparation_object_digest), generatedCandidate = read(storeRoot, generatedPrep.candidate_object_digest);
  const publication = registerAsset({ storeRoot, sourceRoot: join(c.root, "generation/candidate"),
    predecessorSnapshotDigest: generatedCandidate.registry.snapshot_digest, descriptor,
    trustedAuthorityContexts: c.profile.trust.trustedAssetAuthorityContexts });
  assert.equal(publication.content_digest, gen.candidate_asset.content_digest, "source review cannot change generated bytes");
  const candidate_asset = Object.fromEntries(["asset_type", "stable_id", "version"].map(key => [key, descriptor[key]]));
  Object.assign(candidate_asset, { record_digest: publication.record_digest, content_digest: publication.content_digest });
  const prepared = preparePersonalEvolutionCandidate({ storeRoot, ...c.profile.trust, observationInput: c.input.observationInput,
    blueprint: { ...c.input.blueprint, candidate_asset, registry: { ...generatedCandidate.registry,
      snapshot_digest: publication.snapshot_digest, snapshot_revision: publication.snapshot_revision } },
    generationActor: c.profile.generationActor, holdoutTaskIds: c.input.blueprint.evaluation_scope.fixture_ids });
  pin(c, "source-review", { reviewObjectDigest: reviewDigest, preparationObjectDigest: prepared.preparation_object_digest, candidate_asset });
}
async function advance(c, deadlineAtMs = null) {
  let gen = generation(c);
  if (gen.status === "NOT_RUN") {
    assert.equal(sourceRevision(), c.profile.sourceRevision, "configured source changed; configure a fresh profile before new execution");
    const inspected = inspectPreparedPersonalEvolutionCodexGeneration({ storeRoot: c.profile.storeRoot, ...c.profile.trust,
      requestObjectDigest: c.input.requestObjectDigest, workspaceRoot: join(c.root, "generation"), ...c.profile.generation });
    if (deadlineAtMs !== null) assert.ok(Date.now() + c.profile.generation.timeoutMs <= deadlineAtMs, "run deadline cannot reserve full generation");
    await startPreparedPersonalEvolutionCodexGeneration(inspected.handle, { confirmedRequestObjectDigest: inspected.request_object_digest,
      confirmedPreparationDigest: inspected.preparation_digest });
    gen = generation(c);
  }
  if (gen.status !== "candidate_ready" || !pointer(c, "source-review")) return status(c);
  let pair = pointer(c, "pair");
  if (!pair) {
    if (pointer(c, "alignment-hold")) return status(c);
    // Interrupted materialization cannot be silently repaired or overwrite plans.
    if (existsSync(join(c.root, "evaluation"))) return { ...status(c), reason: "evaluation_preparation_interrupted_preserve_files" };
    assert.equal(sourceRevision(), c.profile.sourceRevision, "configured source changed; preserve the candidate and configure a fresh profile");
    const prepared = preparePersonalEvolutionCliPair({ profile: c.profile, cycleRoot: c.root, cycleId: c.input.cycleId,
      preparationObjectDigest: pointer(c, "source-review").preparationObjectDigest });
    if (prepared.blocked) { pin(c, "alignment-hold", prepared.blocked); return status(c); }
    pair = pin(c, "pair", prepared);
  }
  if (!existsSync(join(pair.outputRoot, "invocation"))) {
    assert.equal(sourceRevision(), c.profile.sourceRevision, "configured source changed; preserve the fixed pair without starting it");
    const inspected = inspectPreparedPersonalEvolutionLoop(pair.input);
    if (deadlineAtMs !== null) assert.ok(Date.now() + read(c.profile.storeRoot, pair.input.pairRegistrationObjectDigest).limits.overall_timeout_ms <= deadlineAtMs,
      "run deadline cannot reserve full fixed comparison");
    await startPreparedPersonalEvolutionLoop(inspected.handle, inspected.pair_object_digest);
  }
  return status(c);
}
function confirmEvaluation(c, humanReason) {
  reason(humanReason); const pair = pointer(c, "pair"); assert.ok(pair, "fixed comparison required");
  const saved = savedInput(c, pair); assert.ok(saved, "complete saved comparison required");
  const result = verifyPersonalEvolutionSavedResults(saved);
  assert.equal(result.status, "saved_pair_verified", "complete verified comparison required");
  if (!pointer(c, "evaluation-confirmation")) pin(c, "evaluation-confirmation", { evidence: result.evidence, reason: humanReason });
  if (!pointer(c, "actions")) {
    // The existing adapter intentionally stops positive mutations that need a
    // separately fixed lifecycle plan. Never remap the recommendation to a no-op.
    const actions = result.experiment.action_mapping.find(item => item.recommendation === result.recommendation.recommendation)?.actions;
    if (actions?.length !== 1 || !["retain_current", "revise_candidate", "insufficient_evidence", "reject_candidate"].includes(actions[0])) return status(c, result);
    pin(c, "actions", preparePersonalEvolutionSavedResultActions({ ...saved,
      trustedEvaluationAuthorities: [pointer(c, "evaluation-confirmation").evidence] }));
  }
  return status(c, result);
}
function decide(c, disposition, humanReason) {
  reason(humanReason); const actions = pointer(c, "actions"); assert.ok(actions, "explicit evaluation confirmation and supported proposal required");
  const confirmation = pointer(c, "evaluation-confirmation"), pair = pointer(c, "pair");
  const saved = savedInput(c, pair), verified = verifyPersonalEvolutionSavedResults(saved);
  assert.equal(canonicalDigest(verified.evidence), canonicalDigest(confirmation.evidence), "confirmed evaluation drift");
  let human = pointer(c, "decision");
  if (human) assert.equal(human.decision.disposition, disposition, "human decision already recorded");
  else {
    const reasonObjectDigest = putContentAddressedJson({ storeRoot: c.profile.storeRoot,
      artifact: { kind: "personal_explicit_decision_reason_v1", proposal_digest: actions.proposal.proposal_digest,
        disposition, reason: humanReason } }).digest;
    const decision = buildEvolutionHumanDecision({ proposal: actions.proposal, disposition,
      reasonCodes: ["explicit_cli_human_decision", `human_reason:${reasonObjectDigest}`], authority: actions.proposal.required_decision_authority });
    human = pin(c, "decision", { decision, reasonObjectDigest,
      decisionObjectDigest: publishEvolutionHumanDecision({ storeRoot: c.profile.storeRoot, decision }).object_digest });
  }
  const context = { ...saved, trustedEvaluationAuthorities: [confirmation.evidence],
    trustedHumanDecisionAuthorities: [human.decision] };
  inspectPersonalEvolution({ ...context, artifacts: { ...actions.artifacts, decisionObjectDigest: human.decisionObjectDigest } });
  if (disposition === "approved" && ["retain_current", "revise_candidate", "insufficient_evidence"].includes(actions.proposal.action)
    && !pointer(c, "completion")) {
    const done = finishPersonalEvolutionSavedResultNoop({ ...context, connectionObjectDigest: actions.connection_object_digest,
      decisionObjectDigest: human.decisionObjectDigest });
    pin(c, "completion", { receipt_object_digest: done.receipt_object_digest, lifecycle_mutated: false });
  }
  if (disposition === "approved" && actions.proposal.action === "reject_candidate" && !pointer(c, "completion")) {
    const authority = rejectionAuthority(c), prepared = read(c.profile.storeRoot, pair.input.preparationObjectDigest);
    const done = applyApprovedEvolutionCandidateRejection({ ...context, ...actions.artifacts,
      candidateObjectDigest: prepared.candidate_object_digest, decisionObjectDigest: human.decisionObjectDigest,
      assetAuthorityContext: authority, trustedAssetAuthorityContexts: [...saved.trustedAssetAuthorityContexts, authority] });
    pin(c, "completion", { receipt_object_digest: done.object_digest, lifecycle_mutated: true });
  }
  return status(c, verified);
}
function next(c, output, summary) {
  const done = pointer(c, "completion"); assert.ok(done, "completed personal receipt required for this next-cycle connector");
  assert.equal(status(c).status, "completed", "verified completion required before next cycle");
  const pair = pointer(c, "pair"), prep = read(c.profile.storeRoot, pair.input.preparationObjectDigest);
  const candidate = read(c.profile.storeRoot, prep.candidate_object_digest);
  const rejection = rejectionAuthority(c), assets = [...(pair.input.trustedAssetAuthorityContexts ?? []), ...(rejection ? [rejection] : [])];
  const receipt = read(c.profile.storeRoot, done.receipt_object_digest);
  const resultRegistry = receipt.action === "reject_candidate" ? exportAssetRegistryReference({ storeRoot: c.profile.storeRoot,
    snapshotDigest: receipt.result_heads.registry_snapshot_digest, trustedAuthorityContexts: assets }) : candidate.registry;
  const registry = { ...candidate.registry, snapshot_digest: resultRegistry.snapshot_digest, snapshot_revision: resultRegistry.snapshot_revision };
  const profile = { ...c.profile, trust: { ...c.profile.trust, trustedAssetAuthorityContexts: assets, trustedPortfolioAuthorityContexts: pair.input.trustedPortfolioAuthorityContexts },
    blueprint: { ...c.profile.blueprint, parent_portfolio: candidate.parent_portfolio, registry, rollback: candidate.rollback } };
  const created = initializeCycle({ profile, cycleRoot: output, target: profile.blueprint.parent_asset.stable_id,
    text: summary, predecessor: done.receipt_object_digest });
  return status(created);
}

const COMMANDS = {
  run: ["profile", "output", "target", "problem", "confirmed-policy-digest"],
  "recover-preparation": ["cycle", "output", "source", "input-digest", "source-review-digest"],
  configure: ["config", "profile"], start: ["cycle", "profile", "target", "problem"], status: ["cycle"], result: ["cycle"],
  "review-source": ["cycle", "approve", "reason"], "confirm-evaluation": ["cycle", "confirm", "reason"],
  decide: ["cycle", "approve", "decline", "reason"], next: ["cycle", "output", "problem"],
};
function parse(argv) {
  const [command, ...args] = argv; assert.ok(Object.hasOwn(COMMANDS, command), `commands: ${Object.keys(COMMANDS).join(", ")}`);
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith("--") ? args[i].slice(2) : null;
    assert.ok(COMMANDS[command].includes(key) && !Object.hasOwn(values, key), "unknown or duplicate CLI option");
    if (["approve", "decline", "confirm"].includes(key)) values[key] = true;
    else { assert.ok(args[i + 1] && !args[i + 1].startsWith("--"), `--${key} requires a value`); values[key] = args[++i]; }
  }
  return { command, values };
}
export async function runPersonalEvolutionCommand(argv, controls = {}) {
  assert.ok(controls && Object.keys(controls).every(key => key === "deadlineAtMs"), "unknown personal command controls");
  const deadlineAtMs = controls.deadlineAtMs ?? null;
  if (deadlineAtMs !== null) assert.ok(Number.isSafeInteger(deadlineAtMs) && deadlineAtMs > 0);
  const { command, values: v } = parse(argv);
  if (command === "run") return runUnattendedPersonalEvolution({ profile: v.profile, output: v.output,
    target: v.target, problem: v.problem, confirmedPolicyDigest: v["confirmed-policy-digest"] }, runPersonalEvolutionCommand);
  if (command === "recover-preparation") {
    const { recoverPersonalEvolutionCliPreparation } = await import("./ask-personal-evolution-cli-recovery.mjs");
    return recoverPersonalEvolutionCliPreparation({ cycleRoot: v.cycle, outputRoot: v.output, sourceRoot: v.source,
      inputDigest: v["input-digest"], sourceReviewDigest: v["source-review-digest"] });
  }
  if (command === "configure") return configure(v.config, v.profile);
  absolute(v.cycle);
  if (command === "start" && !existsSync(v.cycle)) {
    const profile = loadSnapshot(join(absolute(v.profile), "profile.json"));
    initializeCycle({ profile, cycleRoot: v.cycle, target: v.target, text: problem(v.problem) });
  } else assert.ok(!v.profile && !v.target && (command !== "start" || !v.problem), "resume uses immutable cycle inputs; omit initial options");
  const c = loadCycle(v.cycle);
  if (["status", "result"].includes(command)) return status(c);
  if (command === "review-source" && !v.approve) {
    const gen = generation(c); return { ...status(c), ...(gen.status === "candidate_ready" ? { source: reviewView(c, gen) } : {}) };
  }
  if (command === "confirm-evaluation" && !v.confirm) return status(c);
  const lock = join(c.root, ".command-lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) {
    if (error.code === "EEXIST") return { status: "needs_action", reason: "command_in_progress_or_interrupted", next_command: "resolve the active command outcome before any further mutation" }; throw error;
  }
  try {
    let result;
    if (command === "start") result = await advance(c, deadlineAtMs);
    else if (command === "review-source") { approveSource(c, generation(c), v.reason); result = await advance(c, deadlineAtMs); }
    else if (command === "confirm-evaluation") result = confirmEvaluation(c, v.reason);
    else if (command === "decide") { assert.notEqual(Boolean(v.approve), Boolean(v.decline), "choose exactly one explicit disposition");
      result = decide(c, v.approve ? "approved" : "declined", v.reason); }
    else result = next(c, absolute(v.output), problem(v.problem));
    const temp = join(c.root, `readout-${randomUUID()}.tmp`);
    writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); renameSync(temp, join(c.root, "readout.json"));
    return result;
  } catch (error) {
    const result = { status: "needs_action", reason: "command_failed_preserved_existing_records", failed_command: command,
      detail: String(error.message).slice(0, 2048), next_command: "inspect status and preserved records before proceeding" };
    const temp = join(c.root, `readout-${randomUUID()}.tmp`);
    writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); renameSync(temp, join(c.root, "readout.json"));
    return result;
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runPersonalEvolutionCommand(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

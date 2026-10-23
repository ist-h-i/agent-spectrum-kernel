import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { applyPersonalEvolutionLoopPortfolioAction } from "./ask-personal-evolution-driver.mjs";
import { describePersonalEvolutionPromptPair, sealPersonalEvolutionPromptPair, verifyPersonalEvolutionPromptPairResults, startPersonalEvolutionPromptPair,
  personalEvolutionPairLimits, validatePersonalEvolutionFixtureSelection } from "./ask-personal-evolution-primary-pair.mjs";
import { preparePersonalEvolutionSavedResultActions, finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";
import { comparisonHash, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, userCodexInvocation } from "./ask-user-comparison.mjs";
import { syntheticPrimarySource } from "./test-helpers-primary-evaluation-producer.mjs";
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer } from "./ask-primary-evaluation-producer.mjs";
import { computeEngineeringResultId, computeEngineeringResultDigest } from "./ask-benchmark-portfolio-score.mjs";
import { prepareAggregateV2FileFixture } from "./test-ask-benchmark-portfolio-aggregate-v2-files.mjs";
import { activePrimaryProducer, withPrimaryEvaluationProducer } from "./ask-primary-evaluation-scope.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { primaryScoringRoot } from "./ask-primary-scoring-version.mjs";
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS, CANONICAL_PRIMARY_FIXTURE_IDS } from "./ask-primary-fixture-recipe.mjs";

import { setup, blocksFor, collectSyntheticTerminal, fakeEngineeringTemplate, collectSyntheticGrade, bindSyntheticRoleGrading } from "./test-helpers-personal-evolution-primary-pair.mjs";

const repository = resolve(import.meta.dirname, ".."), fixture = join(repository, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"))), adapter = reference.adapters[0];
const read = (root, digest) => readContentAddressedJson({ storeRoot: root, digest }).value;
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`); };
const assetRef = record => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, record[key]]));
const ref = publication => Object.fromEntries(["portfolio_id", "revision", "manifest_digest", "asset_set_digest"].map(key => [key, publication[key]]));
const inventory = root => listContentAddressedJson({ storeRoot: root }).map(item => item.digest);

test("personal catalog24 fixes its complete inventory and reserves both original batch budgets", () => {
  assert.equal(validatePersonalEvolutionFixtureSelection(CANONICAL_PRIMARY_FIXTURE_IDS, "catalog24"), "catalog24");
  assert.equal(validatePersonalEvolutionFixtureSelection(["mn-build-option-update"]), "legacy9");
  for (const ids of [CANONICAL_PRIMARY_FIXTURE_IDS.slice(1), [...CANONICAL_PRIMARY_FIXTURE_IDS].reverse(), PRIMARY_FIXTURE_IDS])
    assert.throws(() => validatePersonalEvolutionFixtureSelection(ids, "catalog24"));
  assert.throws(() => validatePersonalEvolutionFixtureSelection(CANONICAL_PRIMARY_FIXTURE_IDS));
  assert.throws(() => validatePersonalEvolutionFixtureSelection(["pf-review-error-contract"]));
  assert.throws(() => validatePersonalEvolutionFixtureSelection(PRIMARY_FIXTURE_IDS, "unknown"));
  assert.throws(() => validatePersonalEvolutionFixtureSelection(PRIMARY_FIXTURE_IDS, null));
  assert.deepEqual(personalEvolutionPairLimits(24, "catalog24"), { overall_timeout_ms: 1224000000,
    token_budget: 240000000, retries: 0, resume: "forbidden", concurrency: 1 });
  assert.equal(personalEvolutionPairLimits(9).overall_timeout_ms, 604800000);
  assert.equal(personalEvolutionPairLimits(9).token_budget, 90000000);
  for (const count of [0, 1, 9, 23, 25]) assert.throws(() => personalEvolutionPairLimits(count, "catalog24"));
  assert.throws(() => personalEvolutionPairLimits(24));
});


test("new registration aligns before freeze with explicit trust; unstarted fresh pair is NOT_RUN/hold", t => {
  const f = setup(t), { blocks } = blocksFor(t, f), before = inventory(f.storeRoot);
  assert.throws(() => applyPersonalEvolutionBaselineAlignment({ ...f.alignArgs, trustedAlignmentObjectDigests: [] }), /independently pinned/);
  assert.throws(() => applyPersonalEvolutionBaselineAlignment({ ...f.alignArgs, trustedPortfolioAuthorityContexts: f.alignArgs.trustedPortfolioAuthorityContexts.slice(0, 1) }), /separate exact/);
  assert.deepEqual(inventory(f.storeRoot), before);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  assert.equal(sealed.registration.description.controller_sources["schemas/claim-evidence-status.schema.json"],
    comparisonHash(readFileSync(join(repository, "schemas/claim-evidence-status.schema.json"))));
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
  assert.equal(activePrimaryProducer(), false);
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { ...savedResults, challenger: savedResults.baseline }, trustedSavedEngineeringResultDigests: trusted }), /run_id|foreign|Expected/);
  assert.equal(activePrimaryProducer(), false, "foreign block rejection must release producer scope");
  const grade = savedResults.challenger["mn-build-option-update"], originalBytes = readFileSync(grade.engineering_result.path);
  for (const key of ["evaluator_revision", "frozen_admission_record_digest", "requirement_authority_digest", "requirement_set_digest"]) {
    const changed = JSON.parse(originalBytes); changed[key] = key === "evaluator_revision" ? "a".repeat(40) : canonicalDigest("foreign criterion");
    if (key === "frozen_admission_record_digest") changed.admission_record_digest = changed[key];
    changed.engineering_result_id = computeEngineeringResultId(changed); changed.engineering_result_digest = computeEngineeringResultDigest(changed);
    write(grade.engineering_result.path, changed); const digest = comparisonHash(readFileSync(grade.engineering_result.path));
    assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults: { ...savedResults, challenger: {
      "mn-build-option-update": { ...grade, engineering_result: { ...grade.engineering_result, digest } } } }, trustedSavedEngineeringResultDigests: [...trusted, digest] }), /saved criterion/);
    assert.equal(activePrimaryProducer(), false, "criterion rejection must release producer scope");
  }
  writeFileSync(grade.engineering_result.path, originalBytes);
  const producerPlan = join(grade.producer.recordRoot, "plan.json"), originalPlan = readFileSync(producerPlan);
  try {
    writeFileSync(producerPlan, "changed after the prior saved-result verification");
    assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...options, savedResults, trustedSavedEngineeringResultDigests: trusted }), /artifact inventory|artifact_inventory/);
    assert.equal(activePrimaryProducer(), false, "later producer drift must reject without retaining scope");
  } finally { writeFileSync(producerPlan, originalPlan); }
  assert.equal(verifyPersonalEvolutionPromptPairResults({ ...options, savedResults, trustedSavedEngineeringResultDigests: trusted }).status, "saved_pair_verified");
  assert.equal(activePrimaryProducer(), false);
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
  const resourceConfigs = bindSyntheticRoleGrading(f, blocks);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    confirmedPairObjectDigest: sealed.object_digest };
  const template = fakeEngineeringTemplate(f.root); let starts = 0, grades = 0;
  const startComparison = async root => { starts++; collectSyntheticTerminal(t, Object.values(blocks).flat().find(block => block.root === root)); };
  const gradingAdapters = Object.fromEntries(["baseline", "challenger"].map(role => [role, {
    preflight: () => ({ status: "ready", blockers: [] }), grade: async block => {
      grades++;
      // Exact original factory's outputRoot/fixtureId naming, per-role roots.
      const outputRoot = resourceConfigs[role].output_root;
      mkdirSync(outputRoot, { recursive: true }); mkdirSync(join(outputRoot, block.fixture_id));
      const result = await collectSyntheticGrade(t, f, block, template, { outputParent: join(outputRoot, block.fixture_id) });
      return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
        conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
    },
  }]));
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapters: {
    ...gradingAdapters, baseline: { ...gradingAdapters.baseline, preflight: () => ({ status: "blocked", blockers: ["synthetic missing grant"] }) } } }), /ready/);
  assert.equal(existsSync(join(sealed.registration.output_root, "invocation")), false); assert.equal(starts, 0);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapters: {
    baseline: gradingAdapters.baseline, challenger: gradingAdapters.baseline } }), /one grading adapter/);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapters,
    gradingAdapter: gradingAdapters.baseline }), /singular grading adapter/);
  assert.equal(starts, 0); assert.equal(grades, 0);
  let accessorReads = 0;
  const accessors = { get baseline() { accessorReads++; return gradingAdapters.baseline; }, challenger: gradingAdapters.challenger };
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison, gradingAdapters: accessors }), /accessor refused/);
  assert.equal(accessorReads, 0); assert.equal(starts, 0);
  const supplied = { ...gradingAdapters }; let replacementCalls = 0;
  const invocation = { ...options, startComparison, gradingAdapters: supplied,
    now: () => { supplied.challenger = { preflight: () => { replacementCalls++; throw new Error("replacement must not be called"); },
      grade: () => { replacementCalls++; throw new Error("replacement must not be called"); } };
      invocation.pairRegistrationObjectDigest = canonicalDigest("post_start_replacement");
      invocation.confirmedPairObjectDigest = invocation.pairRegistrationObjectDigest;
      options.trustedPairRegistrationObjectDigests.length = 0; f.args.evaluationAuthority.authority_id = "post_start_replacement";
      return Date.now(); } };
  const result = await startPersonalEvolutionPromptPair(invocation);
  const request = JSON.parse(readFileSync(join(sealed.registration.output_root, "invocation/request.json")));
  assert.equal(request.pair_object_digest, sealed.object_digest);
  assert.equal(replacementCalls, 0);
  assert.equal(result.report.pair_digest, sealed.registration.pair_digest);
  assert.equal(result.evidence.authority.authority_id, "synthetic-saved-grading-controller");
  assert.equal(starts, 2); assert.equal(grades, 2); assert.equal(result.status, "saved_pair_verified"); assert.equal(result.models_started, false);
  assert.equal(result.action, "held_pending_separate_evaluation_and_human_trust");
  assert.ok(existsSync(join(resourceConfigs.baseline.output_root, "mn-build-option-update")));
  assert.ok(existsSync(join(resourceConfigs.challenger.output_root, "mn-build-option-update")));
  const saved = JSON.parse(readFileSync(join(sealed.registration.output_root, "invocation/saved-result-connection.json")));
  assert.equal(saved.report.evidence_kind, "synthetic"); assert.equal(saved.authority_implied, false);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, trustedPairRegistrationObjectDigests: [sealed.object_digest], startComparison, gradingAdapters }), /already exists|already consumed|EEXIST/);
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


test("separate grader instances cannot disguise shared, stale, changed or collocated write roots", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f);
  bindSyntheticRoleGrading(f, blocks, config => config.output_root = join(f.root, "same-grading-root"));
  assert.throws(() => describePersonalEvolutionPromptPair({ ...f.args, blocks }), /grading outputs overlap/);
  bindSyntheticRoleGrading(f, blocks, (config, role) => { if (role === "challenger") config.fixtures = { forged: {} }; });
  assert.throws(() => describePersonalEvolutionPromptPair({ ...f.args, blocks }), /fixed asset maps differ/);
  bindSyntheticRoleGrading(f, blocks, (config, role) => { if (role === "challenger") config.output_root = join(blocks.baseline[0].root, "grading"); });
  assert.throws(() => describePersonalEvolutionPromptPair({ ...f.args, blocks }), /overlaps authority/);
  const configs = bindSyntheticRoleGrading(f, blocks);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    confirmedPairObjectDigest: sealed.object_digest, gradingAdapters: { baseline: { preflight: () => ({ status: "ready", blockers: [] }) },
      challenger: { preflight: () => ({ status: "ready", blockers: [] }) } } };
  let starts = 0; const startComparison = async () => { starts++; };
  mkdirSync(configs.challenger.output_root);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison }), /already exists before invocation/);
  assert.equal(starts, 0); assert.equal(existsSync(join(sealed.registration.output_root, "invocation")), false);
  rmSync(configs.challenger.output_root, { recursive: true });
  symlinkSync(join(f.root, "missing-grading-target"), configs.challenger.output_root);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison }), /ENOENT|grading/);
  rmSync(configs.challenger.output_root);
  const resourcePath = blocks.challenger[0].grading.resources.path;
  writeFileSync(resourcePath, "changed resource config");
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, startComparison }), /resources changed/);
  assert.equal(starts, 0); assert.equal(existsSync(join(sealed.registration.output_root, "invocation")), false);
});


test("grading interruption retains consumed partial receipts and never starts the later role", async t => {
  const f = setup(t), { blocks } = blocksFor(t, f); bindSyntheticRoleGrading(f, blocks);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const outer = new AbortController(); let starts = 0, grades = 0;
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    confirmedPairObjectDigest: sealed.object_digest, signal: outer.signal,
    startComparison: async root => { starts++; collectSyntheticTerminal(t, Object.values(blocks).flat().find(block => block.root === root)); },
    gradingAdapters: { baseline: { preflight: () => ({ status: "ready", blockers: [] }), grade: async () => { grades++; outer.abort(); return { status: "completed" }; } },
      challenger: { preflight: () => ({ status: "ready", blockers: [] }), grade: async () => { grades++; return { status: "completed" }; } } } };
  await assert.rejects(startPersonalEvolutionPromptPair(options), /grading deadline/);
  assert.equal(starts, 1); assert.equal(grades, 1);
  assert.ok(existsSync(join(sealed.registration.output_root, "invocation/baseline-0-grading.json")));
  assert.equal(existsSync(join(sealed.registration.output_root, "invocation/saved-result-connection.json")), false);
  await assert.rejects(startPersonalEvolutionPromptPair({ ...options, signal: undefined }), /already consumed|EEXIST/);
  assert.equal(starts, 1);
});

test("new v2 pair requires the same active/reference runtime contract in both roles", t => {
  const f = setup(t), {blocks} = blocksFor(t, f, "selected_active_reference_v2");
  const description = describePersonalEvolutionPromptPair({...f.args, blocks});
  assert.equal(description.bindings.baseline[0].prompt_runtime_contract.kind, "personal_registered_prompt_materialization_v2");
  assert.deepEqual(description.bindings.baseline[0].prompt_runtime_contract, description.bindings.challenger[0].prompt_runtime_contract);
  const wrong = blocksFor(t, f);
  assert.throws(() => describePersonalEvolutionPromptPair({...f.args, blocks: {baseline: blocks.baseline, challenger: wrong.blocks.challenger}}),
    /runtime\/budget mismatch/);
});

test("positive driver cannot turn an unstarted pair or an unpinned lifecycle plan into adoption", t => {
  const f = setup(t), {blocks} = blocksFor(t, f, "selected_active_reference_v2");
  const sealed = sealPersonalEvolutionPromptPair({...f.args, blocks, outputRoot: join(f.root, "pair-output")});
  const saved = {...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest]};
  const plan = putContentAddressedJson({storeRoot: f.storeRoot, artifact: {synthetic_plan: true}}).digest;
  const value = {application: {}, saved, lifecyclePlanObjectDigest: plan, trustedLifecyclePlanObjectDigests: []};
  const before = inventory(f.storeRoot);
  assert.throws(() => applyPersonalEvolutionLoopPortfolioAction(value), /pre-result lifecycle plan pin/);
  value.trustedLifecyclePlanObjectDigests = [plan];
  assert.throws(() => applyPersonalEvolutionLoopPortfolioAction(value), /pre-result plan-bearing/);
  assert.deepEqual(inventory(f.storeRoot), before);
});

test("v2 registration fixes lifecycle plans while NOT_RUN and rejects foreign parent or unpinned late plan", t => {
  const f = setup(t), {blocks} = blocksFor(t, f, "selected_active_reference_v2");
  const candidate = f.aligned.prepared.candidate, {lock_digest, ...parent} = candidate.parent_portfolio;
  const lifecycle = {base_registry_snapshot_digest: candidate.registry.snapshot_digest, base_portfolio_lock_digest: lock_digest,
    base_current_manifest: parent, target_manifest: parent, rollback_anchor: parent, portfolio_transitions: [], asset_transitions: [],
    reason_codes: ["synthetic_pre_result_pin_only"]};
  const pin = putContentAddressedJson({storeRoot: f.storeRoot, artifact: lifecycle}).digest;
  const wrong = putContentAddressedJson({storeRoot: f.storeRoot, artifact: {...lifecycle, base_portfolio_lock_digest: canonicalDigest("wrong")}}).digest;
  assert.throws(() => sealPersonalEvolutionPromptPair({...f.args, blocks, lifecyclePlanObjectDigests: [wrong], outputRoot: join(f.root, "wrong-output")}));
  const sealed = sealPersonalEvolutionPromptPair({...f.args, blocks, lifecyclePlanObjectDigests: [pin], outputRoot: join(f.root, "v2-output")});
  assert.equal(sealed.registration.kind, "personal_pre_result_prompt_pair_v2");
  assert.deepEqual(sealed.registration.lifecycle_plan_object_digests, [pin]);
  const saved = {...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest]};
  assert.equal(verifyPersonalEvolutionPromptPairResults(saved).status, "NOT_RUN");
  const late = putContentAddressedJson({storeRoot: f.storeRoot, artifact: {...lifecycle, reason_codes: ["late"]}}).digest;
  assert.throws(() => applyPersonalEvolutionLoopPortfolioAction({saved, application: {}, lifecyclePlanObjectDigest: late,
    trustedLifecyclePlanObjectDigests: [late]}), /not fixed in the invoked pair/);
});

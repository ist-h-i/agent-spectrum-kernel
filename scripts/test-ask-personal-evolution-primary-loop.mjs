// Public artificial roundtrip only. Module mocks replace the driver's original
// grader factory and supply synthetic-only execution dependencies to its pair
// delegate. Production driver inputs/authority and private grading are unchanged.
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { historicalPersonalPairFixture, setup, finishPersonalPairSetup, bindSyntheticRoleGrading, fakeEngineeringTemplate,
  collectSyntheticGrade } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { verifyPersonalEvolutionGenerationExecution,
  inspectPersonalEvolutionGenerationStatus } from "./ask-personal-evolution-generation-connector.mjs";
import { inspectPreparedPersonalEvolutionCodexGeneration, startPreparedPersonalEvolutionCodexGeneration }
  from "./ask-personal-evolution-codex-generation.mjs";
import { preparePersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { PRIMARY_FIXTURE_IDS, buildPrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import { resolvePortfolioSelection } from "./portfolio-manager.mjs";
import { comparisonHash, prepareGitBaseline, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, reportUserComparison, startUserComparison } from "./ask-user-comparison.mjs";
import { renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as gradingApi from "./ask-primary-evaluation-grading.mjs";
import { verifyPersonalEvolutionSavedResults, preparePersonalEvolutionSavedResultActions,
  finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";
import { buildEvolutionHumanDecision, publishEvolutionHumanDecision } from "./evolution-loop.mjs";

const repository = resolve(import.meta.dirname, ".."), roles = ["baseline", "challenger"];
const conditions = ["plain", "kernel_principles_v2", "full_ask"];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
function sourceRevision() {
  const result = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, "rev-parse", "HEAD"], {
    cwd: repository, encoding: "utf8", env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function files(root) {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? Object.entries(files(path)) : [[path, comparisonHash(readFileSync(path))]];
  }));
}
function entrypoint(f, recipe) {
  const basename = recipe.task_class === "verification_only" ? "skill-verify.md"
    : { review: "skill-review.md", handoff: "skill-handoff.md", investigation: "skill-investigate.md" }[recipe.runner_task_class]
      ?? "skill-implement.md";
  const path = f.descriptor.type_extension.entrypoints.find(path => path.endsWith(`/${basename}`));
  assert.ok(path); return path;
}

// Genuine public preparation and comparison controller; all dispatch below is
// fake. Each fixture seed contains only its unchanged task/workspace bytes.
function prepareNineBlocks(f) {
  const blocks = Object.fromEntries(roles.map(role => [role, []]));
  for (const fixtureId of [...PRIMARY_FIXTURE_IDS].sort()) {
    const base = join(repository, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const recipe = buildPrimaryFixtureRecipe(fixtureId), seed = join(f.root, `seed-${fixtureId}`);
    mkdirSync(seed);
    for (const file of json(join(base, "input-manifest.json")).fixtures[fixtureId].files) {
      mkdirSync(dirname(join(seed, file.path)), { recursive: true }); cpSync(join(base, file.path), join(seed, file.path));
    }
    const commit = prepareGitBaseline(seed), verificationFile = join(f.root, `${fixtureId}-verification.json`);
    write(verificationFile, recipe);
    for (const role of roles) {
      const selection = resolvePortfolioSelection({ ...f.args, lockDigest: f.aligned.roles[role].portfolio.lock_digest,
        selectorContext: { ...f.alignArgs.selectorContext, task_class: recipe.task_class,
          portfolio_lock_digest: f.aligned.roles[role].portfolio.lock_digest } });
      assert.equal(selection.selection.decision, "selected");
      const prepared = prepareUserComparison({ repo: seed, commit, taskFile: join(base, "task.md"), verificationFile,
        output: join(f.root, `${role}-${fixtureId}`), mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class,
        evidenceKind: "synthetic", executionContract: "single_shot_v1", kernelCondition: "kernel_principles_v2",
        cliBin: join(f.root, "must-never-launch-codex"), cliVersion: "fake-not-launched", model: "gpt-5.6-sol",
        timeoutMs: 3600000, verificationTimeoutMs: 300000, overallTimeoutMs: 14400000, tokenBudget: 5000000,
        personalPrompt: { storeRoot: f.storeRoot, registrySnapshotDigest: f.aligned.prepared.candidate.registry.snapshot_digest,
          asset: f.aligned.roles[role].selected_asset, entrypoint: entrypoint(f, recipe),
          runtimeVersion: "selected_active_reference_v2", trustedAssetAuthorityContexts: [] } });
      const reference = json(join(base, "evaluator-reference.json"));
      blocks[role].push({ root: prepared.root, fixture_id: fixtureId, run_id: prepared.plan.run_id,
        plan_digest: prepared.plan_digest, source_digest: prepared.plan.source.digest, task_digest: prepared.plan.task.digest,
        verification_digest: prepared.plan.verification.digest, public_input_root: seed,
        input_manifest: { path: join(base, "input-manifest.json"), digest: recipe.input_manifest_digest },
        personal_selection_object_digest: selection.selection_object_digest,
        grading: { timeout_ms: gradingApi.PRIMARY_GRADING_RESERVATION_MS,
          binding: { fixture_id: fixtureId, input_manifest_digest: recipe.input_manifest_digest,
          evaluator_bundle_digest: reference.evaluator_bundle_digest,
          scoring_input_freeze_digest: comparisonHash(readFileSync(join(base, "scoring-input-freeze-manifest.json"))),
          profile_id: "primary_principles_v2_single_shot_v1" } } });
    }
  }
  return blocks;
}

test("nine primary fixtures: fake generation → prepared driver → saved hold → independent no-op → fresh next request", async t => {
  const pending = setup(t, { fixtureIds: PRIMARY_FIXTURE_IDS, sourceRevision: sourceRevision(), deferGeneration: true,
    portfolioBudgets: { cost_policy: "subscription_no_additional_spend_v1" },
    entryCostEstimate: { token_count: { status: "known", value: 1 }, duration_ms: { status: "known", value: 1 },
      cost_microunits: { status: "unknown", value: null } },
    availableBudget: { token_count: { status: "known", value: 90000000 }, duration_ms: { status: "known", value: 604800000 },
      cost_microunits: { status: "unknown", value: null } } });
  const oldObjects = listContentAddressedJson({ storeRoot: pending.storeRoot }).map(({ digest }) => [digest, read(pending.storeRoot, digest)]);
  let providerCalls = 0;
  const generationInspection = inspectPreparedPersonalEvolutionCodexGeneration({ storeRoot: pending.storeRoot,
    trustedPortfolioAuthorityContexts: pending.generation.trustedPortfolioAuthorityContexts,
    requestObjectDigest: pending.requested.request_object_digest, timeoutMs: 3600000, executable: "must-never-launch-codex",
    workspaceRoot: join(pending.root, "generation-workspace") }, { spawnProcess: (executable, argv, options) => {
      providerCalls++;
      assert.equal(executable, "must-never-launch-codex"); assert.deepEqual(readdirSync(options.cwd), []);
      const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
      child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => { assert.fail("successful fake session must not need termination"); }; child.unref = () => {};
      let prompt = ""; child.stdin.on("data", chunk => { prompt += chunk.toString("utf8"); });
      child.stdin.once("finish", () => {
        const input = JSON.parse(prompt.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
        assert.equal(input.requested_action, "produce_candidate_files_only"); assert.deepEqual(input.parent_asset, pending.parentAsset);
        for (const id of PRIMARY_FIXTURE_IDS) assert.equal(prompt.includes(id), false, "holdouts must not enter generation prompt");
        writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify({ status: "completed", files: input.parent_files.map(file => ({
          path: file.path, text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + "\nSynthetic scoped target rule.\n" })) }));
        queueMicrotask(() => { child.exitCode = 0; child.emit("exit", 0, null); child.emit("close", 0, null); });
      });
      queueMicrotask(() => child.emit("spawn")); return child;
    } });
  const generated = await startPreparedPersonalEvolutionCodexGeneration(generationInspection.handle, {
    confirmedRequestObjectDigest: generationInspection.request_object_digest, confirmedPreparationDigest: generationInspection.preparation_digest });
  assert.equal(providerCalls, 1); assert.equal(generated.status, "candidate_ready");
  assert.equal(verifyPersonalEvolutionGenerationExecution({ storeRoot: pending.storeRoot,
    requestObjectDigest: pending.requested.request_object_digest, executionReceiptObjectDigest: generated.execution_receipt_object_digest,
    trustedPortfolioAuthorityContexts: pending.generation.trustedPortfolioAuthorityContexts }).status, "candidate_ready");
  assert.equal(inspectPersonalEvolutionGenerationStatus({ storeRoot: pending.storeRoot,
    requestObjectDigest: pending.requested.request_object_digest,
    trustedPortfolioAuthorityContexts: pending.generation.trustedPortfolioAuthorityContexts }).status, "candidate_ready");
  // A separately registered artificial source-reviewed version is required; the
  // generator's not_evaluated safety never becomes review/evaluation authority.
  const f = finishPersonalPairSetup({ ...pending, childRoot: join(pending.root, "generation-workspace/candidate") }, generated.imported);
  assert.equal(f.sourceReview.generated_content_unchanged, true);
  assert.notDeepEqual(f.sourceReview.reviewed_asset, generated.receipt.candidate_asset);
  const blocks = prepareNineBlocks(f), resourceConfigs = bindSyntheticRoleGrading(f, blocks);
  const sealed = historicalPersonalPairFixture({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const savedInput = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest,
    trustedPairRegistrationObjectDigests: [sealed.object_digest] };
  delete savedInput.fixtureSet; // Historical selection is already pinned by the sealed registration; not a driver option.
  assert.equal(pairApi.verifyPersonalEvolutionPromptPairResults(savedInput).status, "NOT_RUN");
  assert.deepEqual(sealed.registration.description.bindings.baseline.map(item => item.fixture_id), [...PRIMARY_FIXTURE_IDS].sort());
  for (const role of roles) for (const binding of sealed.registration.description.bindings[role]) {
    assert.equal(binding.cost_policy, "subscription_no_additional_spend_v1");
    const selection = read(f.storeRoot, binding.selection_object_digest);
    assert.equal(selection.cost_policy, binding.cost_policy);
    assert.equal(read(f.storeRoot, selection.manifest.manifest_digest).budgets.cost_policy, binding.cost_policy);
    assert.deepEqual(selection.budget.cost_microunits.estimated, { status: "unknown", value: null });
    assert.deepEqual(selection.budget.cost_microunits.available, { status: "unknown", value: null });
    assert.equal(selection.budget.cost_microunits.status, "unknown");
    assert.equal(binding.profile_id, "primary_principles_v2_single_shot_v1");
    assert.equal(binding.prompt_runtime_contract.kind, "personal_registered_prompt_materialization_v2");
    assert.equal(binding.block.grading.timeout_ms, gradingApi.PRIMARY_GRADING_RESERVATION_MS);
    assert.deepEqual([binding.config.timeout_ms, binding.config.verification_timeout_ms,
      binding.config.overall_timeout_ms, binding.config.token_budget], [3600000, 300000, 14400000, 5000000]);
    assert.ok(binding.public_criteria.scoring_input_freeze.raw_digest);
    assert.ok(reportUserComparison(binding.block.root).slots.every(slot => slot.state === "not_started"));
  }
  const templates = Object.fromEntries(PRIMARY_FIXTURE_IDS.map(id => [id, fakeEngineeringTemplate(f.root, id)]));
  const nativeCalls = [], verifierCalls = [], gradePins = []; let pairCalls = 0;
  const startComparison = async (root, digest, options) => {
    const loaded = readUserComparisonPlan(root), fixtureId = loaded.plan.verification.recipe.fixture_id;
    const contract = json(join(repository, "benchmarks/fixtures/checkpoint-b2", fixtureId, "verification-command-contract.json"));
    return startUserComparison(root, digest, { ...options, runner: async invocation => {
      const condition = dirname(invocation.cwd).split("/").at(-1) === "arms" ? invocation.cwd.split("/").at(-1) : null;
      assert.ok(conditions.includes(condition)); nativeCalls.push({ root, fixtureId, condition });
      invocation.onSpawn({ pid: process.pid });
      const events = contract.commands.flatMap((command, index) => [
        { type: "item.started", item: { id: `fake-${index}`, type: "command_execution", command: renderCommandEvent(command), status: "in_progress" } },
        { type: "item.completed", item: { id: `fake-${index}`, type: "command_execution", command: renderCommandEvent(command), status: "completed", exit_code: 0, aggregated_output: "artificial verification observation" } },
      ]);
      events.push({ type: "thread.started", thread_id: `${loaded.plan.run_id}-${condition}` },
        { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 5 } });
      writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "artificial unchanged candidate output\n");
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 5,
        stdout: events.map(event => JSON.stringify(event)).join("\n") + "\n", stderr: "" };
    }, verifier: async invocation => {
      verifierCalls.push({ root, fixtureId }); invocation.onSpawn({ pid: process.pid });
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 1,
        stdout: "artificial native verifier pass\n", stderr: "" };
    } });
  };
  const graders = Object.fromEntries(roles.map(role => [role, {
    preflight: block => {
      assert.ok(blocks[role].some(item => canonicalDigest(item) === canonicalDigest(block)));
      return { status: "ready", blockers: [] };
    }, grade: async block => {
      const outputParent = join(resourceConfigs[role].output_root, block.fixture_id); mkdirSync(outputParent, { recursive: true });
      const result = await collectSyntheticGrade(t, f, block, templates[block.fixture_id], { outputParent });
      gradePins.push(result.engineering_result.digest);
      return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
        conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
    },
  }]));
  // Only this isolated test process has these mocks. No production API accepts
  // fake factories or runner callbacks through detached driver JSON.
  t.mock.module("./ask-primary-evaluation-grading.mjs", { exports: { ...gradingApi,
    createPrimaryEvaluationGradingAdapter: ({ resourcesPath, resourcesDigest }) => {
      const role = roles.find(role => blocks[role][0].grading.resources.path === resourcesPath); assert.ok(role);
      assert.equal(resourcesDigest, blocks[role][0].grading.resources.digest); return graders[role];
    } } });
  t.mock.module("./ask-personal-evolution-primary-pair.mjs", { exports: { ...pairApi,
    startPersonalEvolutionPromptPair: options => {
      pairCalls++; assert.equal(options.confirmedPairObjectDigest, sealed.object_digest);
      assert.deepEqual(options.gradingAdapters, graders);
      return pairApi.startPersonalEvolutionPromptPair({ ...options, startComparison });
    } } });
  const driver = await import("./ask-personal-evolution-driver.mjs?artificial-roundtrip");
  const inputFile = join(f.root, "driver-input.json"); write(inputFile, savedInput);
  const inspected = driver.inspectPreparedPersonalEvolutionLoopFile(inputFile, comparisonHash(readFileSync(inputFile)));
  assert.equal(inspected.models_started, false); assert.equal(nativeCalls.length, 0);
  assert.equal(inspected.preflights.baseline.length, 9); assert.equal(inspected.preflights.challenger.length, 9);
  await assert.rejects(driver.startPreparedPersonalEvolutionLoop({ ...inspected.handle }, sealed.object_digest), /opaque/);
  await assert.rejects(driver.startPreparedPersonalEvolutionLoop(inspected.handle, canonicalDigest("wrong confirmation")), /confirm/);
  assert.equal(pairCalls, 0);
  const result = await driver.startPreparedPersonalEvolutionLoop(inspected.handle, sealed.object_digest);
  assert.equal(pairCalls, 1); assert.equal(nativeCalls.length, 54); assert.equal(gradePins.length, 18);
  assert.equal(verifierCalls.length, 6 * PRIMARY_FIXTURE_IDS.reduce((sum, id) => sum + buildPrimaryFixtureRecipe(id).checks.length, 0));
  assert.equal(result.status, "saved_pair_verified"); assert.equal(result.models_started, false);
  assert.equal(result.report.pairs.length, 9); assert.equal(result.report.observations.length, 18);
  assert.ok(result.report.pairs.every(pair => pair.quality_delta === 0));
  assert.equal(result.evidence.dimensions.cost.conclusion, "unknown");
  for (const name of ["variance", "mechanism", "external_outcome"]) assert.equal(result.evidence.dimensions[name].status, "unavailable");
  assert.equal(result.recommendation.recommendation, "insufficient_evidence");
  for (const block of Object.values(blocks).flat()) {
    const report = reportUserComparison(block.root);
    assert.equal(report.execution.start_consumed, true); assert.equal(report.slots.length, 3);
    assert.ok(report.slots.every(slot => slot.state === "completed" && slot.receipt_integrity === "valid" && slot.process_completed === true));
    assert.deepEqual(nativeCalls.filter(call => call.root === block.root).map(call => call.condition), conditions);
  }
  const invocationRoot = join(sealed.registration.output_root, "invocation");
  const terminalFiles = Object.assign(files(invocationRoot), ...roles.map(role => files(resourceConfigs[role].output_root)));
  const connection = json(join(invocationRoot, "saved-result-connection.json"));
  assert.deepEqual(connection.trusted_grade_receipt_digests, gradePins);
  const saved = { ...savedInput, savedResults: connection.savedResults, trustedSavedEngineeringResultDigests: [...gradePins] };
  const reopened = verifyPersonalEvolutionSavedResults(saved);
  assert.deepEqual(reopened.report, result.report); assert.equal(nativeCalls.length, 54);
  assert.throws(() => verifyPersonalEvolutionSavedResults({ ...saved, trustedSavedEngineeringResultDigests: [] }), /separate saved grading provenance/);
  assert.throws(() => preparePersonalEvolutionSavedResultActions(saved), /separately supplied exact trust/);
  const connected = preparePersonalEvolutionSavedResultActions({ ...saved, trustedEvaluationAuthorities: [reopened.evidence] });
  assert.equal(connected.proposal.action, "insufficient_evidence"); assert.equal(connected.lifecycle_mutated, false);
  const decision = buildEvolutionHumanDecision({ proposal: connected.proposal, disposition: "approved",
    reasonCodes: ["artificial_hold_no_live_authority"], authority: connected.proposal.required_decision_authority });
  const human = publishEvolutionHumanDecision({ storeRoot: f.storeRoot, decision });
  const finish = { ...saved, trustedEvaluationAuthorities: [reopened.evidence], connectionObjectDigest: connected.connection_object_digest,
    decisionObjectDigest: human.object_digest, trustedHumanDecisionAuthorities: [decision] };
  assert.throws(() => finishPersonalEvolutionSavedResultNoop({ ...finish, trustedHumanDecisionAuthorities: [] }), /trust|authority/);
  const done = finishPersonalEvolutionSavedResultNoop(finish);
  assert.equal(done.inspection.receipt_state, "completed"); assert.equal(done.lifecycle_mutated, false);
  const receipt = read(f.storeRoot, done.receipt_object_digest);
  assert.deepEqual(receipt.result_heads, receipt.base_heads);
  assert.equal(receipt.steps.length, 0);
  const priorLoopObjects = listContentAddressedJson({ storeRoot: f.storeRoot }).map(({ digest }) => [digest, read(f.storeRoot, digest)]);
  const candidate = f.aligned.prepared.candidate, blueprint = structuredClone(pending.policy);
  Object.assign(blueprint, { parent_portfolio: candidate.parent_portfolio, registry: candidate.registry,
    rollback: candidate.rollback, candidate_id: "artificial-next-cycle" });
  const next = preparePersonalEvolutionGenerationRequest({ ...pending.generation, blueprint,
    trustedPortfolioAuthorityContexts: f.args.trustedPortfolioAuthorityContexts,
    requestedVersion: "fake-next-candidate-3", requestId: "artificial-next-request",
    observationInput: { ...pending.generation.observationInput, observation_id: "artificial-next-observation",
      evidence_refs: [{ artifact_id: "previous-artificial-noop-receipt", digest: done.receipt_object_digest }] } });
  assert.notEqual(next.request_object_digest, pending.requested.request_object_digest);
  assert.equal(next.request.observation_digest, read(f.storeRoot, next.request.observation_object_digest).observation_digest);
  assert.deepEqual(read(f.storeRoot, next.request.observation_object_digest).evidence_refs,
    [{ artifact_id: "previous-artificial-noop-receipt", digest: done.receipt_object_digest }]);
  assert.equal(inspectPersonalEvolutionGenerationStatus({ storeRoot: f.storeRoot, requestObjectDigest: next.request_object_digest,
    trustedPortfolioAuthorityContexts: f.args.trustedPortfolioAuthorityContexts }).status, "NOT_RUN");
  await assert.rejects(driver.startPreparedPersonalEvolutionLoop(inspected.handle, sealed.object_digest), /opaque/);
  await assert.rejects(pairApi.startPersonalEvolutionPromptPair({ ...savedInput, confirmedPairObjectDigest: sealed.object_digest,
    gradingAdapters: graders, startComparison }), /already exists|already consumed/);
  assert.equal(nativeCalls.length, 54); assert.equal(providerCalls, 1);
  assert.deepEqual(Object.assign(files(invocationRoot), ...roles.map(role => files(resourceConfigs[role].output_root))), terminalFiles);
  for (const [digest, object] of oldObjects) assert.deepEqual(read(f.storeRoot, digest), object);
  for (const [digest, object] of priorLoopObjects) assert.deepEqual(read(f.storeRoot, digest), object);
  assert.equal(existsSync(join(f.root, "must-never-launch-codex")), false);
  t.diagnostic("synthetic: 1 fake provider, 18 role starts, 54 fake sessions, 9 equal-quality pairs, approved hold receipt, fresh unstarted next request; live grading/model/Mac evidence Unknown");
});

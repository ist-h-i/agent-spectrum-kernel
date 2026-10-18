// One public fixture exercises the user commands. The existing nine-fixture
// roundtrip remains the population regression. All dispatch here is synthetic.
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { setup, fakeEngineeringTemplate, collectSyntheticGrade, bindSyntheticRoleGrading } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { PRIMARY_FIXTURE_IDS } from "./ask-primary-fixture-recipe.mjs";
import { preparePersonalEvolutionCliPair } from "./ask-personal-evolution-cli-prepare.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, startUserComparison } from "./ask-user-comparison.mjs";
import { renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import * as codexApi from "./ask-personal-evolution-codex-generation.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as gradingApi from "./ask-primary-evaluation-grading.mjs";
import * as savedApi from "./ask-personal-evolution-saved-results.mjs";
import * as connectorApi from "./ask-personal-evolution-generation-connector.mjs";

const ROOT = resolve(import.meta.dirname, ".."), fixtureId = "mn-build-option-update";
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
function files(root) { return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const path = join(root, entry.name); return entry.isDirectory() ? Object.entries(files(path)) : [[path, comparisonHash(readFileSync(path))]];
})); }

test("same CLI: configured target → source review → saved comparison → explicit hold → fresh request; lost returns never repeat dispatch", async t => {
  const pending = setup(t, { deferGeneration: true, portfolioBudgets: { cost_policy: "subscription_no_additional_spend_v1" },
    entryCostEstimate: { token_count: { status: "known", value: 1 }, duration_ms: { status: "known", value: 1 }, cost_microunits: { status: "unknown", value: null } },
    availableBudget: { token_count: { status: "known", value: 90000000 }, duration_ms: { status: "known", value: 604800000 }, cost_microunits: { status: "unknown", value: null } } });
  const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), adapter = reference.adapters[0];
  const selection = read(pending.storeRoot, adapter.baseline_selection.selection_object_digest);
  const selectorContext = structuredClone(read(pending.storeRoot, selection.context_object_digest)); delete selectorContext.context_digest;
  selectorContext.available_budget = pending.availableBudget;
  const resources = {};
  for (const role of ["baseline", "challenger"]) {
    const path = join(pending.root, `resource-template-${role}.json`);
    write(path, { kind: "ask_primary_grading_resources_v1", output_root: join(pending.root, `unused-template-output-${role}`), fixtures: {} });
    resources[role] = { path, digest: comparisonHash(readFileSync(path)) };
  }
  const configPath = join(pending.root, "management.json"), profile = join(pending.root, "profile"), cycle = join(pending.root, "cycle-1");
  const problem = join(pending.root, "problem.txt"); writeFileSync(problem, "Artificial development problem: preserve the explicitly requested option target.");
  write(configPath, { storeRoot: pending.storeRoot, blueprint: pending.policy, generationActor: pending.generation.generationActor,
    trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: [pending.parentAuthority], trustedHighImpactApprovalGrants: [] },
    portfolioAuthority: pending.authority, selectorContext, experimentTemplateObjectDigest: adapter.evolution.experiment_object_digest,
    evaluationAuthority: { authority_id: "synthetic-independent-cli-evaluation", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") },
    generation: { executable: "must-never-launch-codex", timeoutMs: 3600000 },
    evaluation: { publicInputRoot: join(ROOT, "benchmarks/fixtures/checkpoint-b2"), cliBin: join(pending.root, "must-never-launch-codex"),
      cliVersion: "fake-not-launched", model: "gpt-5.6-sol", reasoning: "high", evidenceKind: "synthetic", gradingResources: resources } });
  let providers = 0, comparisons = 0, sessions = 0, grades = 0, loseGenerationReturn = true, loseComparisonReturn = true;
  t.mock.module("./ask-personal-evolution-codex-generation.mjs", { exports: { ...codexApi,
    inspectPreparedPersonalEvolutionCodexGeneration: value => codexApi.inspectPreparedPersonalEvolutionCodexGeneration(value, {
      spawnProcess: (executable, argv, options) => {
        providers++; assert.equal(executable, "must-never-launch-codex");
        const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
        child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
        child.kill = () => assert.fail("successful fake must not terminate");
        let prompt = ""; child.stdin.on("data", chunk => { prompt += chunk; });
        child.stdin.once("finish", () => {
          const input = JSON.parse(prompt.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
          assert.equal(prompt.includes(fixtureId), false, "holdout is excluded from generation");
          writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify({ status: "completed",
            files: input.parent_files.map(file => ({ path: file.path,
              text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + "\nSynthetic scoped target rule.\n" })) }));
          queueMicrotask(() => { child.exitCode = 0; child.emit("exit", 0, null); child.emit("close", 0, null); });
        }); queueMicrotask(() => child.emit("spawn")); return child;
      } }),
    startPreparedPersonalEvolutionCodexGeneration: async (...args) => {
      const result = await codexApi.startPreparedPersonalEvolutionCodexGeneration(...args);
      if (loseGenerationReturn) { loseGenerationReturn = false; throw new Error("synthetic lost generation return after receipt"); } return result;
    } } });
  const template = fakeEngineeringTemplate(pending.root, fixtureId), graders = new Map();
  t.mock.module("./ask-primary-evaluation-grading.mjs", { exports: { ...gradingApi,
    createPrimaryEvaluationGradingAdapter: ({ resourcesPath, resourcesDigest }) => {
      assert.equal(comparisonHash(readFileSync(resourcesPath)), resourcesDigest);
      if (!graders.has(resourcesPath)) graders.set(resourcesPath, {
        preflight: block => { assert.equal(block.grading.resources.path, resourcesPath); return { status: "ready", blockers: [] }; },
        grade: async block => {
          grades++; const outputParent = join(json(resourcesPath).output_root, block.fixture_id); mkdirSync(outputParent, { recursive: true });
          const result = await collectSyntheticGrade(t, pending, block, template, { outputParent });
          return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
            conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
        },
      }); return graders.get(resourcesPath);
    } } });
  const startComparison = async (root, digest, options) => {
    comparisons++; const loaded = readUserComparisonPlan(root);
    const contract = json(join(ROOT, "benchmarks/fixtures/checkpoint-b2", fixtureId, "verification-command-contract.json"));
    return startUserComparison(root, digest, { ...options, runner: async invocation => {
      sessions++; invocation.onSpawn({ pid: process.pid });
      const events = contract.commands.flatMap((command, i) => [
        { type: "item.started", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "in_progress" } },
        { type: "item.completed", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "completed", exit_code: 0, aggregated_output: "synthetic" } },
      ]);
      events.push({ type: "thread.started", thread_id: `${loaded.plan.run_id}-${sessions}` }, { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 5 } });
      writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "synthetic unchanged output\n");
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 5, stdout: events.map(event => JSON.stringify(event)).join("\n") + "\n", stderr: "" };
    }, verifier: async invocation => { invocation.onSpawn({ pid: process.pid });
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 1, stdout: "synthetic pass\n", stderr: "" }; } });
  };
  t.mock.module("./ask-personal-evolution-primary-pair.mjs", { exports: { ...pairApi,
    startPersonalEvolutionPromptPair: async options => {
      const result = await pairApi.startPersonalEvolutionPromptPair({ ...options, startComparison });
      if (loseComparisonReturn) { loseComparisonReturn = false; throw new Error("synthetic lost comparison return after saved results"); } return result;
    } } });
  const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs");
  assert.equal((await run(["configure", "--config", configPath, "--profile", profile])).status, "configured");
  assert.equal(providers + sessions, 0);
  const started = await run(["start", "--profile", profile, "--cycle", cycle, "--target", pending.parentAsset.stable_id, "--problem", problem]);
  assert.equal(started.status, "needs_action", JSON.stringify(started)); assert.match(started.detail, /lost generation/);
  assert.equal(providers, 1); assert.equal(sessions, 0);
  assert.equal((await run(["start", "--cycle", cycle])).status, "needs_source_review"); assert.equal(providers, 1);
  const source = await run(["review-source", "--cycle", cycle]);
  assert.ok(source.source.files.every(file => file.after.endsWith("Synthetic scoped target rule.\n")));
  assert.equal(source.source.quality_evidence, "not_evaluated");
  assert.equal((await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "too early"])).status, "needs_action");
  assert.equal(existsSync(join(cycle, "evaluation-confirmation.json")), false);
  const reviewed = await run(["review-source", "--cycle", cycle, "--approve", "--reason", "Reviewed exact synthetic files and inherited source scope/effects."]);
  assert.equal(reviewed.status, "needs_action", JSON.stringify(reviewed)); assert.match(reviewed.detail, /lost comparison/);
  assert.equal(comparisons, 2); assert.equal(sessions, 6); assert.equal(grades, 2);
  const terminal = files(join(cycle, "pair-output/invocation"));
  const resumed = await run(["start", "--cycle", cycle]);
  assert.equal(resumed.status, "needs_evaluation_confirmation", JSON.stringify(resumed));
  assert.equal(resumed.recommendation.recommendation, "insufficient_evidence");
  assert.equal(resumed.evidence.dimensions.cost.conclusion, "unknown");
  assert.equal((await run(["confirm-evaluation", "--cycle", cycle])).status, "needs_evaluation_confirmation");
  assert.equal((await run(["decide", "--cycle", cycle, "--approve", "--reason", "no evaluation confirmation"])).status, "needs_action");
  assert.equal(existsSync(join(cycle, "decision.json")), false);
  const confirmed = await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "Reviewed saved comparison, original grading provenance and missing evidence."]);
  assert.equal(confirmed.status, "needs_decision", JSON.stringify(confirmed));
  const humanReason = "今回は保留を承認します。品質の改善は未確認です。";
  const done = await run(["decide", "--cycle", cycle, "--approve", "--reason", humanReason]);
  assert.equal(done.status, "completed", JSON.stringify(done));
  assert.equal(done.decision_reason, humanReason);
  const decision = json(join(cycle, "decision.json")).value;
  assert.equal(read(pending.storeRoot, decision.reasonObjectDigest).reason, humanReason);
  assert.ok(decision.decision.reason_codes.includes(`human_reason:${decision.reasonObjectDigest}`));
  const receipt = read(pending.storeRoot, done.receipt_object_digest);
  assert.deepEqual(receipt.result_heads, receipt.base_heads); assert.equal(receipt.steps.length, 0);
  assert.equal((await run(["start", "--cycle", cycle])).status, "completed");
  const contradicted = await run(["decide", "--cycle", cycle, "--decline", "--reason", "Cannot replace an already recorded decision."]);
  assert.equal(contradicted.status, "needs_action"); assert.match(contradicted.detail, /already recorded/);
  assert.equal(json(join(cycle, "decision.json")).value.decision.disposition, "approved");
  const nextRoot = join(pending.root, "cycle-2"), fresh = await run(["next", "--cycle", cycle, "--output", nextRoot, "--problem", problem]);
  assert.equal(fresh.status, "prepared", JSON.stringify(fresh)); assert.notEqual(fresh.request_object_digest, done.request_object_digest);
  const nextInput = json(join(nextRoot, "input.json")).value;
  assert.equal(nextInput.predecessorReceiptObjectDigest, done.receipt_object_digest);
  assert.equal(nextInput.observationInput.evidence_refs.at(-1).digest, done.receipt_object_digest);
  assert.deepEqual(files(join(cycle, "pair-output/invocation")), terminal);
  assert.deepEqual({ providers, comparisons, sessions, grades }, { providers: 1, comparisons: 2, sessions: 6, grades: 2 });
  const gen = (await run(["result", "--cycle", cycle])).generation;
  const original = read(pending.storeRoot, gen.candidate_asset.record_digest);
  const reviewedAsset = json(join(cycle, "source-review.json")).value.candidate_asset;
  const reviewedRecord = read(pending.storeRoot, reviewedAsset.record_digest);
  assert.equal(original.safety.status, "not_evaluated"); assert.equal(original.maintenance.stale_status, "not_assessed");
  assert.equal(reviewedRecord.evaluation_history.status, "not_evaluated");
  assert.equal(reviewedRecord.provenance.owner.status, "unknown"); assert.equal(reviewedAsset.content_digest, gen.candidate_asset.content_digest);
  assert.equal(existsSync(join(pending.root, "must-never-launch-codex")), false);
  t.diagnostic("1 fake provider, 2 role starts, 6 fake sessions, 2 synthetic grades; explicit hold, unchanged terminal files, unstarted next request; no real CLI/provider/Mac operation");
});

// Narrow consumer contract tests: the saved verifier is controlled here, while
// the roundtrip above exercises its real implementation and genuine receipts.
test("partial/invalid saved evidence and unsupported positive application remain reasoned needs-action, with no implicit trust or dispatch", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "personal-cli-readout-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cycle = join(root, "cycle"); mkdirSync(cycle); const output = join(root, "pair-output");
  mkdirSync(join(output, "invocation"), { recursive: true });
  const saveInput = (name, value) => write(join(cycle, `${name}.json`), { value, digest: canonicalDigest(value) });
  saveInput("input", { profile: { storeRoot: join(root, "store"), trust: {} }, requestObjectDigest: canonicalDigest("request"),
    observationInput: { correction: "synthetic", evidence_status: "Hypothesis" }, blueprint: { parent_asset: { stable_id: "synthetic" } } });
  saveInput("source-review", { preparationObjectDigest: canonicalDigest("reviewed") });
  saveInput("pair", { input: { pairRegistrationObjectDigest: canonicalDigest("pair") }, outputRoot: output });
  write(join(output, "invocation/saved-result-connection.json"), { savedResults: {}, trusted_grade_receipt_digests: [] });
  let mode = "partial", actionPublications = 0;
  const partial = { status: "hold_incomplete", report: { status: "hold_incomplete", evidence_kind: "synthetic",
    pairs: [], pending_role_count: 0, incomplete_role_count: 1, causal_attribution: "not_claimed" },
    evidence: { dimensions: { quality: { status: "insufficient_evidence", conclusion: "unknown" } } },
    recommendation: { recommendation: "insufficient_evidence" }, experiment: { action_mapping: [] } };
  t.mock.module("./ask-personal-evolution-generation-connector.mjs", { exports: { ...connectorApi,
    inspectPersonalEvolutionGenerationStatus: () => ({ status: mode === "stale" ? "NOT_RUN" : mode === "consumed" ? "consumed_unknown" : "candidate_ready", models_started: false }) } });
  t.mock.module("./ask-personal-evolution-saved-results.mjs", { exports: { ...savedApi,
    verifyPersonalEvolutionSavedResults: () => {
      if (mode === "invalid") throw new Error("synthetic saved source mismatch");
      if (mode === "positive") return { ...partial, status: "saved_pair_verified", report: { ...partial.report, status: "saved_pair_verified", incomplete_role_count: 0 },
        recommendation: { recommendation: "supported" }, experiment: { action_mapping: [{ recommendation: "supported", actions: ["adopt_candidate"] }] } };
      return partial;
    }, preparePersonalEvolutionSavedResultActions: () => { actionPublications++; assert.fail("no supported action authority in these scenarios"); } } });
  const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs?readout-contract");
  const result = await run(["result", "--cycle", cycle]);
  assert.equal(result.status, "needs_action"); assert.equal(result.reason, "saved_comparison_incomplete");
  assert.equal(result.report.incomplete_role_count, 1); assert.equal(result.evidence.dimensions.quality.conclusion, "unknown");
  assert.ok(!result.next_command.includes("confirm-evaluation"));
  write(join(cycle, "readout.json"), { status: "completed", receipt_object_digest: canonicalDigest("forged cache") });
  assert.equal((await run(["status", "--cycle", cycle])).reason, "saved_comparison_incomplete", "presentation cache cannot grant completion");
  const failedConfirmation = await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "partial must not be approved"]);
  assert.equal(failedConfirmation.status, "needs_action"); assert.match(failedConfirmation.detail, /complete verified/);
  assert.equal(existsSync(join(cycle, "evaluation-confirmation.json")), false);
  mode = "invalid";
  assert.equal((await run(["status", "--cycle", cycle])).reason, "saved_state_verification_failed");
  mode = "positive";
  const positive = await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "Reviewed positive result; application authority is still separate."]);
  assert.equal(positive.status, "needs_action"); assert.equal(positive.reason, "separate_pre_result_lifecycle_plan_required");
  assert.equal(existsSync(join(cycle, "evaluation-confirmation.json")), true);
  assert.equal(existsSync(join(cycle, "actions.json")), false); assert.equal(existsSync(join(cycle, "decision.json")), false);
  assert.equal(actionPublications, 0);
  mode = "consumed";
  assert.equal((await run(["start", "--cycle", cycle])).reason, "consumed_unknown");
  mode = "stale";
  const stale = await run(["start", "--cycle", cycle]);
  assert.equal(stale.status, "needs_action"); assert.match(stale.detail, /configured source changed/);
  mkdirSync(join(cycle, ".command-lock"));
  assert.equal((await run(["start", "--cycle", cycle])).reason, "command_in_progress_or_interrupted");
});

test("CLI preparation seals all existing nine primary recipes and exact role Prompt bindings without dispatch", t => {
  const revision = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, "rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(revision.status, 0);
  const f = setup(t, { fixtureIds: PRIMARY_FIXTURE_IDS, sourceRevision: revision.stdout.trim() });
  bindSyntheticRoleGrading(f, { baseline: [], challenger: [] });
  const gradingResources = Object.fromEntries(["baseline", "challenger"].map(role => {
    const path = join(f.root, `grading-${role}.json`); return [role, { path, digest: comparisonHash(readFileSync(path)) }];
  }));
  const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), cycleRoot = join(f.root, "nine-cli-cycle");
  mkdirSync(cycleRoot);
  const prepared = preparePersonalEvolutionCliPair({ profile: { storeRoot: f.storeRoot, blueprint: f.policy,
    trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: f.args.trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants: [] },
    portfolioAuthority: f.authority, selectorContext: f.alignArgs.selectorContext, sourceRevision: revision.stdout.trim(),
    experimentTemplateObjectDigest: reference.adapters[0].evolution.experiment_object_digest, evaluationAuthority: f.args.evaluationAuthority,
    evaluation: { publicInputRoot: join(ROOT, "benchmarks/fixtures/checkpoint-b2"), cliBin: join(f.root, "must-never-launch-codex"),
      cliVersion: "fake-not-launched", model: "gpt-5.6-sol", reasoning: "high", evidenceKind: "synthetic", gradingResources } },
    cycleRoot, cycleId: "synthetic-nine-cli", preparationObjectDigest: f.args.preparationObjectDigest });
  assert.ok(prepared.input);
  const registration = read(f.storeRoot, prepared.input.pairRegistrationObjectDigest);
  for (const role of ["baseline", "challenger"]) {
    const bindings = registration.description.bindings[role];
    assert.deepEqual(bindings.map(binding => binding.fixture_id), [...PRIMARY_FIXTURE_IDS].sort());
    assert.ok(bindings.every(binding => binding.prompt_runtime_contract.kind === "personal_registered_prompt_materialization_v2"));
    assert.ok(bindings.every(binding => binding.block.root.startsWith(cycleRoot + "/evaluation/")));
    assert.equal(bindings.find(binding => binding.fixture_id === "mp-ci-evidence-gap").prompt_runtime_contract.active_entrypoint_basename, "skill-review.md");
    assert.equal(bindings.find(binding => binding.fixture_id === "mp-data-migration-handoff").prompt_runtime_contract.active_entrypoint_basename, "skill-handoff.md");
    assert.equal(bindings.find(binding => binding.fixture_id === "mn-focused-regression-test").prompt_runtime_contract.active_entrypoint_basename, "skill-verify.md");
  }
  assert.equal(pairApi.verifyPersonalEvolutionPromptPairResults(prepared.input).status, "NOT_RUN");
  assert.equal(existsSync(join(prepared.outputRoot, "invocation")), false);
  assert.equal(existsSync(join(f.root, "must-never-launch-codex")), false);
});

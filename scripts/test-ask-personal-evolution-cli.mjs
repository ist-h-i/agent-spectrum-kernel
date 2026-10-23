// One public fixture exercises the user commands. The existing nine-fixture
// roundtrip remains the population regression. All dispatch here is synthetic.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { setup, bindSyntheticRoleGrading } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { PRIMARY_FIXTURE_IDS, CANONICAL_PRIMARY_FIXTURE_IDS } from "./ask-primary-fixture-recipe.mjs";
import { preparePersonalEvolutionCliPair } from "./ask-personal-evolution-cli-prepare.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { syntheticV7ScoringVersion } from "./test-helpers-primary-evaluation-v7.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as savedApi from "./ask-personal-evolution-saved-results.mjs";
import * as connectorApi from "./ask-personal-evolution-generation-connector.mjs";

const ROOT = resolve(import.meta.dirname, ".."), fixtureId = "mn-build-option-update";
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
import { personalCliRoundtrip } from "./test-helpers-personal-evolution-cli-roundtrip.mjs";
personalCliRoundtrip("catalog24", { fixtureIds: [fixtureId], implicitCatalog: true, exerciseLifecycle: true });

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
  const connectionPath = join(output, "invocation/saved-result-connection.json");
  // A catalog24 connection contains all 48 role reports; its diagnostic payload
  // can exceed ordinary command input limits without granting result authority.
  write(connectionPath, { savedResults: {}, trusted_grade_receipt_digests: [], report: { diagnostic_context: "x".repeat(2 * 1024 * 1024) } });
  assert.equal((await run(["status", "--cycle", cycle])).reason, "saved_comparison_incomplete", "large saved report still requires verified complete evidence");
  write(connectionPath, { savedResults: {}, trusted_grade_receipt_digests: [], report: { diagnostic_context: "x".repeat(32 * 1024 * 1024) } });
  const oversized = await run(["status", "--cycle", cycle]);
  assert.equal(oversized.reason, "saved_state_verification_failed");
  assert.match(oversized.detail, /bounded non-empty file/);
  writeFileSync(connectionPath, "");
  assert.equal((await run(["status", "--cycle", cycle])).reason, "saved_state_verification_failed", "empty saved connection remains invalid");
  writeFileSync(connectionPath, '{"savedResults":');
  assert.equal((await run(["status", "--cycle", cycle])).reason, "saved_state_verification_failed", "partial JSON remains invalid");
  write(connectionPath, { savedResults: {}, trusted_grade_receipt_digests: [] });
  const inputPath = join(cycle, "input.json"), originalInput = readFileSync(inputPath);
  write(inputPath, { diagnostic_context: "x".repeat(2 * 1024 * 1024) });
  await assert.rejects(run(["status", "--cycle", cycle]), /bounded non-empty file/, "ordinary command snapshots retain their 1 MiB limit");
  writeFileSync(inputPath, originalInput);
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

test("CLI preparation seals a catalog selection of the historical nine recipes and exact role Prompt bindings without dispatch", t => {
  const scoring = syntheticV7ScoringVersion(t, { fixtureIds: CANONICAL_PRIMARY_FIXTURE_IDS, fixtureSet: "catalog24" });
  const revision = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, "rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(revision.status, 0);
  const f = setup(t, { fixtureIds: PRIMARY_FIXTURE_IDS, sourceRevision: revision.stdout.trim() });
  bindSyntheticRoleGrading(f, { baseline: [], challenger: [] });
  const gradingResources = Object.fromEntries(["baseline", "challenger"].map(role => {
    const path = join(f.root, `grading-${role}.json`), config = json(path);
    config.fixtures = Object.fromEntries(CANONICAL_PRIMARY_FIXTURE_IDS.map(id => [id, { frozenSourceRoot: scoring.runtime, ...scoring.resource }]));
    write(path, config); return [role, { path, digest: comparisonHash(readFileSync(path)) }];
  }));
  const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), cycleRoot = join(f.root, "nine-cli-cycle");
  mkdirSync(cycleRoot);
  const prepared = preparePersonalEvolutionCliPair({ profile: { storeRoot: f.storeRoot, blueprint: f.policy,
    trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: f.args.trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants: [] },
    portfolioAuthority: f.authority, selectorContext: f.alignArgs.selectorContext, sourceRevision: revision.stdout.trim(),
    experimentTemplateObjectDigest: reference.adapters[0].evolution.experiment_object_digest, evaluationAuthority: f.args.evaluationAuthority,
    evaluation: { publicInputRoot: join(ROOT, "benchmarks/fixtures/checkpoint-b2"), cliBin: join(f.root, "must-never-launch-codex"),
      fixtureSet: "catalog24", fixtureIds: [...PRIMARY_FIXTURE_IDS].sort(),
      cliVersion: "fake-not-launched", model: "gpt-5.6-sol", reasoning: "high", evidenceKind: "synthetic",
      scoringVersion: scoring.selector, gradingResources } },
    cycleRoot, cycleId: "synthetic-nine-cli", preparationObjectDigest: f.args.preparationObjectDigest });
  assert.ok(prepared.input);
  const registration = read(f.storeRoot, prepared.input.pairRegistrationObjectDigest);
  for (const role of ["baseline", "challenger"]) {
    const bindings = registration.description.bindings[role];
    assert.deepEqual(bindings.map(binding => binding.fixture_id), [...PRIMARY_FIXTURE_IDS].sort());
    assert.ok(bindings.every(binding => binding.prompt_runtime_contract.kind === "personal_registered_prompt_materialization_v2"));
    assert.ok(bindings.every(binding => binding.block.root.startsWith(cycleRoot + "/evaluation/")));
    for (const binding of bindings) {
      const block = binding.block, base = join(scoring.runtime, "benchmarks/fixtures/checkpoint-b2", binding.fixture_id);
      assert.deepEqual(block.grading.scoring_version, scoring.selector);
      assert.equal(block.grading.binding.evaluator_bundle_digest, json(join(base, "evaluator-reference.json")).evaluator_bundle_digest);
      assert.equal(block.grading.binding.scoring_input_freeze_digest, comparisonHash(readFileSync(join(base, "scoring-input-freeze-manifest.json"))));
    }
    assert.equal(bindings.find(binding => binding.fixture_id === "mp-ci-evidence-gap").prompt_runtime_contract.active_entrypoint_basename, "skill-review.md");
    assert.equal(bindings.find(binding => binding.fixture_id === "mp-data-migration-handoff").prompt_runtime_contract.active_entrypoint_basename, "skill-handoff.md");
    assert.equal(bindings.find(binding => binding.fixture_id === "mn-focused-regression-test").prompt_runtime_contract.active_entrypoint_basename, "skill-verify.md");
  }
  assert.equal(pairApi.verifyPersonalEvolutionPromptPairResults(prepared.input).status, "NOT_RUN");
  assert.equal(existsSync(join(prepared.outputRoot, "invocation")), false);
  assert.equal(existsSync(join(f.root, "must-never-launch-codex")), false);
});


test("old profile reads do not authorize new requests, cycles or pair creation", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "personal-cli-legacy-migration-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileRoot = join(root, "profile"); mkdirSync(profileRoot);
  const historical = { evaluation: {}, blueprint: { parent_asset: { stable_id: "synthetic-target" }, evaluation_scope: { fixture_ids: [fixtureId] } } };
  const profilePath = join(profileRoot, "profile.json"), problem = join(root, "problem.txt"), cycle = join(root, "new-cycle");
  write(profilePath, { value: historical, digest: canonicalDigest(historical) }); writeFileSync(problem, "Public synthetic correction.");
  const before = readFileSync(profilePath);
  const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs?legacy-migration");
  await assert.rejects(run(["start", "--profile", profileRoot, "--cycle", cycle, "--target", "synthetic-target", "--problem", problem]), /requires migration/);
  assert.throws(() => preparePersonalEvolutionCliPair({ profile: historical, cycleRoot: cycle }), /requires migration/);
  assert.equal(existsSync(cycle), false); assert.deepEqual(readFileSync(profilePath), before);
});

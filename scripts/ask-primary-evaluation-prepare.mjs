#!/usr/bin/env node
// Model-free connector: fixed public fixtures -> existing single-task preparation.
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS, validatePrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import { comparisonHash, inventoryUserTree, prepareGitBaseline, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { createPrimaryEvaluationGradingAdapter, preflightPrimaryEvaluationGrading, PRIMARY_GRADING_PROFILE_ID } from "./ask-primary-evaluation-grading.mjs";
import { readPrimaryScoringVersion } from "./ask-primary-scoring-version.mjs";
import { primaryProfileForKernel } from "./ask-primary-evaluation-profile.mjs";
import { preparePrimaryEvaluationBatch, validatePrimaryRemainingEightContinuation, assertPrimaryContinuationIsolation, assertPrimaryContinuationGradingIsolation, reservePrimaryRemainingEightOutput, PRIMARY_GRADING_RESERVATION_MS, PRIMARY_BATCH_LIMITS } from "./ask-primary-evaluation-batch.mjs";

const SOURCE = fileURLToPath(new URL("../", import.meta.url));
const read = path => readStableFile(path, "fixed public primary input", 32 * 1024 * 1024).bytes;
const json = path => parseJsonRejectDuplicateKeys(read(path).toString("utf8"));
const closedOptions = ["output", "cliBin", "cliVersion", "model", "reasoning", "globalAskPresence", "evidenceKind", "gradingResourcesPath", "gradingResourcesDigest", "kernelCondition", "scoringVersionPath", "scoringVersionDigest", "continuation"];
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

export function preparePrimaryEvaluation(publicParent, options) {
  assert.ok(options && typeof options === "object" && !Array.isArray(options));
  assert.ok(Object.keys(options).every(key => closedOptions.includes(key)), "primary preparation options are closed");
  assert.equal(options.scoringVersionPath == null, options.scoringVersionDigest == null, "scoring version path and digest supplied together");
  const scoringVersion = options.scoringVersionPath == null ? null : { path: options.scoringVersionPath, digest: options.scoringVersionDigest };
  const continuation = Object.hasOwn(options, "continuation") ? validatePrimaryRemainingEightContinuation(options.continuation) : null;
  const fixtureIds = continuation?.fixture_ids ?? PRIMARY_FIXTURE_IDS;
  if (continuation) assert.deepEqual(scoringVersion, options.continuation.retained_scoring_version);
  assert.ok(isAbsolute(publicParent) && realpathSync(publicParent) === publicParent);
  const output = options.output;
  assert.ok(isAbsolute(output) && resolve(output) === output && realpathSync(dirname(output)) === dirname(output));
  assert.ok(!output.startsWith(`${publicParent}/`) && !publicParent.startsWith(`${output}/`) && output !== publicParent, "output/input overlap");
  if (continuation) assertPrimaryContinuationIsolation(continuation, [output, publicParent]);

  if (continuation && options.gradingResourcesPath) assertPrimaryContinuationGradingIsolation(continuation,
    { path: options.gradingResourcesPath, digest: options.gradingResourcesDigest });
  // Validate every selected fixture before creating any preparation output.
  if (scoringVersion) for (const fixtureId of fixtureIds) readPrimaryScoringVersion(scoringVersion, fixtureId);
  const profile = primaryProfileForKernel(options.kernelCondition ?? "kernel_principles_v2");
  const gradingAdapter = createPrimaryEvaluationGradingAdapter({ resourcesPath: options.gradingResourcesPath ?? null,
    resourcesDigest: options.gradingResourcesDigest ?? null });
  const issuance = continuation ? reservePrimaryRemainingEightOutput(options.continuation, output) : null;
  mkdirSync(output, { mode: 0o700 }); // Create once; never reopen or repair.
  for (const path of ["seeds", "blocks", "recipes"]) mkdirSync(join(output, path), { mode: 0o700 });
  const blocks = [];
  for (const fixtureId of fixtureIds) {
    const publicRoot = join(publicParent, fixtureId), original = inventoryUserTree(publicRoot);
    const recipe = buildPrimaryFixtureRecipe(fixtureId);
    const tree = new Map(Object.keys(original).map(path => [path, { bytes: read(join(publicRoot, path)), mode: "100644" }]));
    validatePrimaryFixtureRecipe(recipe, tree, { taskBytes: tree.get("task.md").bytes,
      mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class });
    const seed = join(output, "seeds", fixtureId); mkdirSync(seed, { mode: 0o700 });
    for (const [path, entry] of tree) {
      mkdirSync(dirname(join(seed, path)), { recursive: true, mode: 0o700 });
      writeFileSync(join(seed, path), entry.bytes, { flag: "wx", mode: 0o644 });
    }
    const seedCommit = prepareGitBaseline(seed);
    const recipePath = join(output, "recipes", `${fixtureId}.json`); save(recipePath, recipe);
    const prepared = prepareUserComparison({ repo: seed, commit: seedCommit, taskFile: join(publicRoot, "task.md"),
      verificationFile: recipePath, output: join(output, "blocks", fixtureId), mutablePaths: recipe.mutable_paths,
      taskClass: recipe.runner_task_class, kernelCondition: profile.kernel_condition, executionContract: "single_shot_v1",
      cliBin: options.cliBin ?? "codex", cliVersion: options.cliVersion ?? null, model: options.model ?? "gpt-6.1-sol",
      reasoning: options.reasoning ?? "high", globalAskPresence: options.globalAskPresence ?? "unknown",
      evidenceKind: options.evidenceKind ?? "observed", timeoutMs: 3600000, verificationTimeoutMs: 300000,
      overallTimeoutMs: 14400000, tokenBudget: 5000000 });
    const base = join(SOURCE, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const scoringBase = scoringVersion ? join(readPrimaryScoringVersion(scoringVersion, fixtureId).root, "benchmarks/fixtures/checkpoint-b2", fixtureId) : base;
    const reference = json(join(scoringBase, "evaluator-reference.json"));
    const binding = { fixture_id: fixtureId, input_manifest_digest: recipe.input_manifest_digest,
      evaluator_bundle_digest: reference.evaluator_bundle_digest,
      scoring_input_freeze_digest: comparisonHash(read(join(scoringBase, "scoring-input-freeze-manifest.json"))),
      profile_id: profile.id };
    const block = { fixture_id: fixtureId, root: prepared.root, public_input_root: publicRoot,
      run_id: prepared.plan.run_id, plan_digest: prepared.plan_digest,
      source_digest: prepared.plan.source.digest, task_digest: prepared.plan.task.digest, verification_digest: prepared.plan.verification.digest,
      input_manifest: { path: join(base, "input-manifest.json"), digest: recipe.input_manifest_digest },
      grading: { status: "blocked", blockers: [], timeout_ms: PRIMARY_GRADING_RESERVATION_MS, binding,
        ...(scoringVersion ? { scoring_version: structuredClone(scoringVersion) } : {}),
        ...(options.gradingResourcesPath ? { resources: { path: options.gradingResourcesPath, digest: options.gradingResourcesDigest } } : {}) } };
    const gradingPreflight = gradingAdapter.preflight(block);
    block.grading.status = gradingPreflight.status;
    block.grading.blockers = gradingPreflight.blockers;
    blocks.push(block);
  }
  const manifest = { kind: "ask_primary_evaluation_batch_manifest_v1", batch_id: continuation ? "primary-r9-remaining-eight-v1" : "primary-nine-prepared-v4",
    ...(continuation ? { continuation: structuredClone(options.continuation) } : {}),
    root: join(output, "batch"), conditions: [...profile.conditions],
    limits: { ...PRIMARY_BATCH_LIMITS }, blocks };
  const manifestPath = join(output, "batch-manifest.json"); save(manifestPath, manifest);
  const result = preparePrimaryEvaluationBatch(manifestPath, { gradingAdapter, issuance });
  save(join(output, "preparation-result.json"), result);
  return { ...result, manifest_path: manifestPath, model_calls: 0, old_ownership_diagnostics: 0,
    kernel_candidate_decision: `${profile.kernel_condition} selected for this practical evaluation; old v1 and candidate preserved; not product adoption` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, optionPath, ...extra] = process.argv.slice(2);
  assert.ok(input && optionPath && extra.length === 0, "Usage: node scripts/ask-primary-evaluation-prepare.mjs /absolute/public-inputs /absolute/options.json");
  console.log(JSON.stringify(preparePrimaryEvaluation(input, json(optionPath)), null, 2));
}

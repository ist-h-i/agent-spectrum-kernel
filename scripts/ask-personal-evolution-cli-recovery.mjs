// Preparation-only compatibility boundary. The selected fixed checkout owns
// generation facts, materialization, sealing and grading preflight. No start API.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, realpathSync, rmdirSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes, assertNoSymlinkPathSegments } from "./content-addressed-store.mjs";
import { publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { preparationGitOperation } from "./ask-preparation-git-diagnostic.mjs";
import { runPreparationRecoveryWorker } from "./ask-personal-evolution-recovery-worker.mjs";

const ROOT = resolve(import.meta.dirname, ".."), roles = ["baseline", "challenger"];
const json = path => parseJsonRejectDuplicateKeys(readStableBytes(path, "recovery input").toString("utf8"));
const same = (a, b, label) => assert.equal(canonicalDigest(a), canonicalDigest(b), label);
const environment = () => ({ PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" });
function path(value) {
  assert.ok(typeof value === "string" && resolve(value) === value, "canonical absolute recovery path required");
  assertNoSymlinkPathSegments(value, "recovery path", { allowMissingLeaf: true }); return value;
}
const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
function snapshot(file, expected) {
  const saved = json(file); assert.deepEqual(Object.keys(saved).sort(), ["digest", "value"]);
  assert.equal(canonicalDigest(saved.value), saved.digest, "recovery snapshot drift");
  assert.equal(saved.digest, expected, "confirmed recovery input changed"); return saved.value;
}
function inputs(options, { outputPrepared = false } = {}) {
  assert.match(options.inputDigest ?? "", /^sha256:[a-f0-9]{64}$/u, "confirmed cycle and source-review digests required");
  assert.match(options.sourceReviewDigest ?? "", /^sha256:[a-f0-9]{64}$/u, "confirmed cycle and source-review digests required");
  const cycleRoot = path(options.cycleRoot), outputRoot = path(options.outputRoot), sourceRoot = path(options.sourceRoot ?? ROOT);
  const input = snapshot(join(cycleRoot, "input.json"), options.inputDigest);
  const review = snapshot(join(cycleRoot, "source-review.json"), options.sourceReviewDigest);
  const profile = input.profile;
  for (const protectedRoot of [cycleRoot, sourceRoot, ROOT, profile.storeRoot, profile.evaluation.publicInputRoot,
    profile.evaluation.scoringVersion.path, ...Object.values(profile.evaluation.gradingResources).map(ref => ref.path)])
    assert.ok(!overlaps(outputRoot, protectedRoot), "recovery output overlaps fixed input");
  assert.equal(realpathSync(dirname(outputRoot)), dirname(outputRoot));
  assert.equal(existsSync(outputRoot), outputPrepared, "recovery output already exists or is missing; preserve partial files");
  for (const name of ["pair.json", "pair-output", "alignment-hold.json", "grading-baseline", "grading-challenger",
    "evaluation-confirmation.json", "actions.json", "decision.json", "completion.json"])
    assert.equal(existsSync(join(cycleRoot, name)), false, `recovery blocked by existing ${name}`);
  assert.ok(existsSync(join(cycleRoot, "evaluation")), "interrupted preparation required");
  return { cycleRoot, outputRoot, sourceRoot, input, review, profile };
}
function fixedSource(sourceRoot, expected) {
  assert.match(expected, /^[a-f0-9]{40}$/u);
  const git = args => {
    const result = spawnSync("git", ["--no-optional-locks", "-c", `core.hooksPath=${devNull}`, "-c", "core.fsmonitor=false", ...args],
      { cwd: sourceRoot, env: environment(), encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
    assert.ok(!result.error && !result.signal && result.status === 0,
      `fixed_source_git_failed:${result.error?.code ?? result.signal ?? result.status}:operation=${preparationGitOperation(args)}`);
    return result.stdout.trim();
  };
  assert.equal(git(["rev-parse", "--show-toplevel"]), sourceRoot, "fixed source repository root required");
  assert.equal(git(["rev-parse", "HEAD"]), expected, "fixed source revision mismatch");
  assert.equal(git(["status", "--porcelain", "--untracked-files=normal"]), "", "fixed source must be clean");
}

// Called in an isolated Node worker so compatibility diagnostics cannot alter
// another controller's child_process bindings. Also exercised in-process by
// synthetic module-mock tests; dependency substitution is not a CLI option.
export async function preparePersonalEvolutionCliRecovery(options) {
  const c = inputs(options); fixedSource(c.sourceRoot, c.profile.sourceRevision);
  const load = name => import(pathToFileURL(join(c.sourceRoot, "scripts", name)).href);
  const [cas, generation, comparison, preparation, driver, scoring, fixture] = await Promise.all([
    load("content-addressed-store.mjs"), load("ask-personal-evolution-generation-connector.mjs"),
    load("ask-user-comparison.mjs"), load("ask-personal-evolution-cli-prepare.mjs"),
    load("ask-personal-evolution-driver.mjs"), load("ask-primary-scoring-version.mjs"), load("ask-primary-fixture-recipe.mjs")]);
  const { inventoryUserTree: inventory, inventoryComparisonGitMetadata: gitInventory } = await load("ask-user-comparison-prepare.mjs");
  const read = digest => cas.readContentAddressedJson({ storeRoot: c.profile.storeRoot, digest }).value;
  const gen = generation.inspectPersonalEvolutionGenerationStatus({ storeRoot: c.profile.storeRoot,
    requestObjectDigest: c.input.requestObjectDigest, ...c.profile.trust });
  assert.equal(gen.status, "candidate_ready", "completed generation required; recovery never regenerates");
  assert.equal(gen.invocation_consumed, true, "generation receipt required");
  const fact = read(c.review.reviewObjectDigest), prep = read(c.review.preparationObjectDigest), candidate = read(prep.candidate_object_digest);
  assert.equal(fact.kind, "personal_explicit_source_review_v1", "existing explicit source approval required");
  same(fact.candidate_asset, gen.candidate_asset, "source approval generation mismatch");
  same(fact.inherited_parent, c.profile.blueprint.parent_asset, "source approval parent mismatch");
  same(candidate.candidate_asset, c.review.candidate_asset, "source approval preparation mismatch");
  assert.equal(c.review.candidate_asset.content_digest, gen.candidate_asset.content_digest, "approved content changed");
  assert.equal(fact.content_digest, gen.candidate_asset.content_digest, "source review content changed");
  const candidateInventory = inventory(join(c.cycleRoot, "generation/candidate"));
  same(Object.keys(candidateInventory).sort(), gen.files.map(file => file.path).sort(), "generated file set changed");
  for (const file of gen.files) assert.equal(candidateInventory[file.path].digest, file.raw_digest, "generated file changed");
  for (const role of roles) {
    const ref = c.profile.evaluation.gradingResources[role], raw = readStableBytes(ref.path, "grading template");
    assert.equal(comparisonHash(raw), ref.digest, "grading template changed");
    const expected = parseJsonRejectDuplicateKeys(raw.toString("utf8")); expected.output_root = join(c.cycleRoot, `grading-${role}`);
    assert.equal(comparisonHash(readStableBytes(join(c.cycleRoot, `grading-${role}-resources.json`), "partial grading configuration")),
      comparisonHash(Buffer.from(`${JSON.stringify(expected, null, 2)}\n`)), "partial grading configuration changed");
  }
  const ids = c.profile.blueprint.evaluation_scope.fixture_ids, allowed = new Set();
  for (const id of ids) {
    scoring.readPrimaryScoringVersion(c.profile.evaluation.scoringVersion, id, { verifyResourceFiles: true });
    const manifest = json(join(c.sourceRoot, "benchmarks/fixtures/checkpoint-b2", id, "input-manifest.json"));
    const expected = Object.fromEntries(manifest.fixtures[id].files.map(file => [file.path, file.sha256]));
    const seed = join(c.cycleRoot, "evaluation", `seed-${id}`);
    // The existing preparer reads only manifest-listed public files. Other
    // controller files in that source directory are not model inputs.
    for (const [file, digest] of Object.entries(expected)) assert.equal(comparisonHash(readStableBytes(
      join(c.profile.evaluation.publicInputRoot, id, file), "public input")), `sha256:${digest}`, "public input changed");
    if (existsSync(seed)) {
      const actual = inventory(seed); same(Object.keys(actual).sort(), Object.keys(expected).sort(), "public input file set changed");
      for (const [file, digest] of Object.entries(expected)) assert.equal(actual[file].digest, `sha256:${digest}`, "public input changed");
    }
    const recipe = fixture.buildPrimaryFixtureRecipe(id), external = join(c.cycleRoot, "evaluation", `${id}-verification.json`);
    if (existsSync(external)) assert.equal(comparisonHash(readStableBytes(external, "partial external verification")),
      comparisonHash(Buffer.from(`${JSON.stringify(recipe, null, 2)}\n`)), "partial external verification changed");
    allowed.add(`seed-${id}`); allowed.add(`${id}-verification.json`);
    for (const role of roles) {
      const name = `${role}-${id}`, root = join(c.cycleRoot, "evaluation", name); allowed.add(name);
      if (!existsSync(root)) continue;
      for (const marker of ["start.json", "start.digest", "slots", "leases", "history", "execution.json"])
        assert.equal(existsSync(join(root, "control", marker)), false, "partial comparison started or unknown");
      assert.equal(existsSync(join(root, "evidence")), false, "partial comparison evidence exists");
      const { plan } = comparison.readUserComparisonPlan(root), report = comparison.reportUserComparison(root);
      assert.ok(existsSync(external), "partial external verification missing");
      assert.equal(plan.source.repo, seed, "partial seed identity changed");
      same(plan.source.inventory, inventory(seed), "partial seed inventory changed");
      for (const ref of [plan.input, plan.task, plan.verification, plan.verification.reporter])
        assert.equal(comparisonHash(readStableBytes(join(root, ref.path), "partial control input")), ref.digest, "partial control input changed");
      assert.equal(comparisonHash(readStableBytes(external, "partial external verification")), plan.verification.digest, "partial external verification changed");
      assert.equal(readStableBytes(join(root, plan.input.path), "partial prompt").toString("utf8"), plan.prompt, "partial prompt binding changed");
      same(json(join(root, plan.verification.path)), recipe, "partial verification recipe changed");
      same(plan.verification.recipe, recipe, "partial plan recipe changed");
      assert.equal(report.execution.start_consumed, false, "partial start consumed or unknown");
      assert.ok(report.slots.every(slot => slot.state === "not_started" && slot.launch_requested === false), "partial execution state unknown");
      assert.equal(plan.config.evidence_kind, c.profile.evaluation.evidenceKind);
      assert.equal(plan.full_definition.source_commit, c.profile.sourceRevision, "partial source revision changed");
      for (const arm of Object.values(plan.arms)) for (const copy of [arm.path, arm.baseline_path])
        same(inventory(join(root, copy)), arm.baseline_inventory, "partial prepared files changed");
      for (const arm of Object.values(plan.arms)) same(gitInventory(join(root, arm.path)), arm.git_metadata, "partial prepared Git metadata changed");
    }
  }
  assert.ok(readdirSync(join(c.cycleRoot, "evaluation")).every(name => allowed.has(name)), "unknown partial preparation entry");
  mkdirSync(c.outputRoot, { mode: 0o700 });
  const prepared = preparation.preparePersonalEvolutionCliPair({ profile: c.profile, cycleRoot: c.outputRoot,
    cycleId: c.input.cycleId, preparationObjectDigest: c.review.preparationObjectDigest });
  assert.ok(prepared.input && !prepared.blocked, "fixed preparation blocked; preserve output");
  const checked = driver.inspectPreparedPersonalEvolutionLoop(prepared.input);
  assert.equal(checked.status, "NOT_RUN"); assert.equal(checked.models_started, false);
  assert.equal(checked.pair_object_digest, prepared.input.pairRegistrationObjectDigest);
  fixedSource(c.sourceRoot, c.profile.sourceRevision);
  snapshot(join(c.cycleRoot, "input.json"), options.inputDigest);
  snapshot(join(c.cycleRoot, "source-review.json"), options.sourceReviewDigest);
  return prepared;
}

export async function recoverPersonalEvolutionCliPreparation(options) {
  // Validate confirmations before reading a cycle or creating any lock.
  const c = inputs(options), lock = join(c.cycleRoot, ".command-lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) {
    if (error.code === "EEXIST") return { status: "needs_action", reason: "command_in_progress_or_interrupted" }; throw error;
  }
  try {
    fixedSource(c.sourceRoot, c.profile.sourceRevision);
    const outcome = await runPreparationRecoveryWorker({ ...options, sourceRoot: c.sourceRoot }, environment());
    assert.ok(outcome.prepared, outcome.detail ?? "preparation worker outcome unknown");
    inputs(options, { outputPrepared: true }); // Confirm snapshots and absent pair again before publication.
    const prepared = outcome.prepared;
    assert.equal(prepared.outputRoot, join(c.outputRoot, "pair-output"));
    assert.equal(prepared.input.storeRoot, c.profile.storeRoot);
    publishJsonAtomicNoReplace({ outputPath: join(c.cycleRoot, "pair.json"),
      artifact: { value: prepared, digest: canonicalDigest(prepared) }, label: "recovered fixed pair" });
    return { status: "prepared_comparison", reason: "recovered_preparation_not_started", output_root: prepared.outputRoot,
      pair_object_digest: prepared.input.pairRegistrationObjectDigest, source_revision: c.profile.sourceRevision,
      models_started: false, grading_started: false, next_command: "inspect the fixed pair; start requires a new direct human instruction" };
  } catch (error) {
    return { status: "needs_action", reason: "preparation_recovery_failed_preserved", detail: String(error.message).slice(0, 2048),
      output_root: c.outputRoot, models_started: false, grading_started: false, next_command: "inspect preserved records; no automatic retry" };
  } finally { rmdirSync(lock); }
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { readSuccessorParent, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";
import { buildPromptSuccessorPreparation } from "./ask-benchmark-prompt-successor.mjs";
import { syntheticRuntime, syntheticScope } from "./test-prompt-successor-fixtures.mjs";
import { createSuccessorSyntheticScoringInputs } from "./test-prompt-successor-scoring-fixtures.mjs";
import {
  openSuccessorScoringInputs, inspectSuccessorScoringInputs, successorScoringOptions,
  assertSuccessorScoringExecution, SUCCESSOR_UNPINNED_ADMISSION_FIELDS,
} from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";
import { verifySuccessorSourceProvenance } from "./ask-benchmark-prompt-successor-provenance.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const read = path => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const gitEnvironment = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
const git = (cwd, ...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", cwd, ...args], {
  encoding: "utf8", env: gitEnvironment(), timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
}).trim();

// Bounded real-library checks, not a shortened or substitute measured execution.
// There is no native agent, normalization, result reconstruction or scoring run.
async function worker(contextPath) {
  const context = read(contextPath);
  assert.equal(root, realpathSync(context.clone));
  assert.equal(git(root, "rev-parse", "HEAD"), context.cloneRevision);
  assert.equal(git(root, "status", "--porcelain"), "");
  const { parent } = await readSuccessorParent({ root });
  const implementation = readSuccessorImplementationIdentity(root);
  const manifestPath = resolve(root, "scripts/test-fixtures/generated-successor-scoring/manifest.json");
  const manifest = read(manifestPath);
  const preparation = buildPromptSuccessorPreparation({ parent, runtime: syntheticRuntime(), implementation,
    seed: "bounded-successor-input-contract", changeReason: "Synthetic pre-result input and materialization regression; no execution authority.",
    scoringInputManifestDigest: manifest.manifest_digest });
  const configPath = resolve(root, "benchmarks/prompt-successor-execution.config.json");
  const publicConfig = read(configPath);
  const config = { ...publicConfig, _kind: "portfolio", _configPath: configPath, _protocolPath: resolve(root, publicConfig.protocol_path) };
  const checks = [];
  const check = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
  let handle;
  await check("actual public-input opening binds all four pending fixtures", async () => {
    handle = await openSuccessorScoringInputs({ preparation, manifestPath, root });
    const info = inspectSuccessorScoringInputs(handle, preparation);
    assert.equal(info.manifest_digest, preparation.scoring_input_manifest_digest);
    assert.deepEqual(info.fixtures.map(f => [f.fixture_id, f.source_fixture_id, f.admission_status]),
      CALIBRATION_SOURCE_BINDINGS.map(([id, source]) => [id, source, "admission_pending"]));
    assert.equal(info.creates_admission, false);
    assertSuccessorScoringExecution(handle, preparation, { config });
  });
  await check("same-path config substitutions fail with a genuine input handle", () => {
    for (const mutate of [
      c => { c.fixtures[0].repetitions++; },
      c => { c.fixtures[0].source_fixture_id = c.fixtures[1].source_fixture_id; },
      c => { c.adapter_tracks.reverse(); },
      c => { c.conditions.pop(); },
      c => { c.privacy.store_raw_prompts = true; },
      c => { c._protocolPath = resolve(root, "other.md"); },
      c => { c._unverifiedOverride = true; },
    ]) {
      const changed = structuredClone(config); mutate(changed);
      assert.equal(changed._configPath, config._configPath);
      assert.throws(() => assertSuccessorScoringExecution(handle, preparation, { config: changed }), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
    }
    assertSuccessorScoringExecution(handle, preparation, { config });
  });
  await check("late complete and partial overlays fail before result reads for every case and role", async () => {
    // Synthetic scope values exercise only preflight rejection. They cannot
    // construct a verified source handle or become successful provenance.
    for (const role of ["current_prompt", "prompt_v2"]) {
      const scope = syntheticScope(preparation, role);
      const empty = Object.fromEntries(scope.source.bindings.map(b => [b.successor_case_id, {}]));
      const never = resolve(context.work, "intentionally-absent-result");
      const args = { root, preparation, scope, expectedScopeDigest: scope.scope_digest, scoringInputs: handle, accessMode: "synthetic_only",
        source: { paths: { normalizedResultsPath: never, engineeringResultsPath: never, sourceManifestPath: never },
          sourceManifestSourceDigest: canonicalDigest("absent-source"), sourceSnapshotDigest: canonicalDigest("absent-snapshot") },
        execution: { config, planPath: never, materializedPath: never, selectionState: never, runDir: never } };
      for (const binding of scope.source.bindings) {
        for (const fields of [SUCCESSOR_UNPINNED_ADMISSION_FIELDS, ...SUCCESSOR_UNPINNED_ADMISSION_FIELDS.map(field => [field])]) {
          const overlay = Object.fromEntries(fields.map(field => [field,
            field === "admissionReviewAuthoritySourceDigest" ? canonicalDigest("foreign-authority") : never]));
          await assert.rejects(() => verifySuccessorSourceProvenance({ ...args,
            evaluatorOptionsByCase: { ...empty, [binding.successor_case_id]: overlay } }),
          { code: "SUCCESSOR_UNPINNED_ADMISSION_AUTHORITY", path: fields[0] });
        }
      }
    }
  });
  await check("existing frozen resolver retains pending admission for every fixture", async () => {
    const { verifyPortfolioScoringInputs } = await import("./ask-benchmark-evaluator-boundary.mjs");
    const { resolveEffectiveAdmissionAuthority } = await import("./ask-benchmark-admission-decision.mjs");
    for (const fixture of preparation.predecessor.fixtures) {
      const { scoringInputFreezeManifestPath, scoringInputFreezeManifestSourceDigest, ...options } = successorScoringOptions(handle, preparation, fixture.fixture_id);
      const inputs = verifyPortfolioScoringInputs({ ...options, freezeManifestPath: scoringInputFreezeManifestPath,
        freezeManifestSourceDigest: scoringInputFreezeManifestSourceDigest });
      const authority = resolveEffectiveAdmissionAuthority({ frozenAdmissionRecord: inputs.admissionRecord,
        requirementRecord: inputs.requirementRecord, evaluatorReference: inputs.evaluatorReference, root });
      assert.equal(authority.effective_admission_status, "admission_pending");
      assert.notEqual(authority.authority_mode, "admitted_overlay");
    }
  });
  await check("actual materialization preserves all four catalog/source mappings", async () => {
    const { buildPortfolioPlan } = await import("./ask-benchmark-plan.mjs");
    const { materializePortfolio } = await import("./ask-benchmark-materialize.mjs");
    const plan = buildPortfolioPlan({ root, config, repositoryRevision: implementation.revision, seed: "bounded-canonical-mapping" });
    const planPath = resolve(context.work, "plan.json"); write(planPath, plan);
    const materializedPath = resolve(context.work, "materialized");
    const materialized = materializePortfolio({ root, config, planPath, outputPath: materializedPath, repositoryRevision: implementation.revision });
    assert.equal(plan.cases.length, 112); assert.equal(materialized.cases.length, 112);
    assert.deepEqual([...new Set(plan.cases.map(c => c.fixture_id))].sort(), CALIBRATION_SOURCE_BINDINGS.map(([id]) => id).sort());
    for (const [id, source, taskClass, repetitions] of CALIBRATION_SOURCE_BINDINGS) {
      const cases = plan.cases.filter(c => c.fixture_id === id);
      assert.equal(cases.length, repetitions * 2 * 4);
      assert.ok(cases.every(c => c.suite === "calibration" && c.task_class === taskClass));
      for (const item of cases) {
        assert.ok(materialized.cases.some(c => c.case_id === item.case_id));
        assert.deepEqual(readFileSync(resolve(materializedPath, item.case_id, "BENCHMARK_TASK.md")),
          readFileSync(resolve(root, config.fixture_root, source, "task.md")));
      }
    }
    assertSuccessorScoringExecution(handle, preparation, { config });
  });
  assert.equal(git(root, "rev-parse", "HEAD"), context.cloneRevision);
  assert.equal(git(root, "status", "--porcelain"), "");
  write(resolve(context.work, "bounded-verification.json"), { source_revision: context.sourceRevision,
    synthetic_clone_revision: context.cloneRevision, evidence_kind: "synthetic_pre_result_contract_checks",
    node: process.version, platform: process.platform, checks, completed: true });
}

if (process.argv[2] === "--worker") {
  await worker(process.argv[3]);
} else {
  await test("bounded successor scoring-input authority and four-mapping materialization", { timeout: 300000 }, async t => {
    assert.equal(process.versions.node.split(".")[0], "24", "Node 24 required; no successful skip");
    const sourceRevision = git(root, "rev-parse", "HEAD"); assert.equal(git(root, "status", "--porcelain"), "");
    const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-successor-input-contract-"));
    t.diagnostic(`Synthetic contract artifacts: ${work}`);
    try {
      const clone = resolve(work, "checkout");
      git(root, "clone", "--no-hardlinks", "--no-checkout", root, clone); git(clone, "checkout", "--detach", sourceRevision);
      const privateBase = resolve(work, "synthetic-private"); mkdirSync(privateBase);
      const { parent } = await readSuccessorParent({ root });
      createSuccessorSyntheticScoringInputs({ root: clone, privateBase, parent, revision: sourceRevision });
      const prefix = "scripts/test-fixtures/generated-successor-scoring";
      git(clone, "add", "--", prefix);
      git(clone, "-c", "user.name=ASK synthetic contract", "-c", "user.email=synthetic-test@example.invalid", "-c", "commit.gpgsign=false",
        "commit", "-m", "test-only public scoring inputs; pending admission");
      const cloneRevision = git(clone, "rev-parse", "HEAD");
      assert.equal(git(clone, "rev-parse", "HEAD^"), sourceRevision);
      const changed = git(clone, "diff", "--name-only", sourceRevision, cloneRevision).split("\n");
      assert.equal(changed.length, 21); assert.ok(changed.every(p => p.startsWith(`${prefix}/`)));
      const contextPath = resolve(work, "context.json"); write(contextPath, { root, sourceRevision, cloneRevision, clone, work });
      const result = spawnSync(process.execPath, [resolve(clone, relative(root, fileURLToPath(import.meta.url))), "--worker", contextPath], {
        cwd: clone, encoding: "utf8", timeout: 240000, maxBuffer: 20 * 1024 * 1024,
      });
      writeFileSync(resolve(work, "worker.stdout.log"), result.stdout ?? ""); writeFileSync(resolve(work, "worker.stderr.log"), result.stderr ?? "");
      if (result.stdout) console.log(result.stdout);
      assert.equal(result.error, undefined, result.error?.message); assert.equal(result.status, 0, result.stderr || result.stdout);
      const evidence = read(resolve(work, "bounded-verification.json"));
      assert.equal(evidence.completed, true); assert.equal(evidence.checks.length, 5);
    } finally {
      assert.equal(git(root, "rev-parse", "HEAD"), sourceRevision);
      assert.equal(git(root, "status", "--porcelain"), "");
    }
  });
}

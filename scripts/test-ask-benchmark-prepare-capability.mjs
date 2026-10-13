// Model-free CLI compatibility only. Never starts an agent or evaluator worker.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { preparePortfolioExecution } from "./ask-benchmark-execution.mjs";
import { prepareFrozenEvaluatorTestRoot } from "./test-frozen-evaluator-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const testPath = "scripts/test-ask-benchmark-prepare-capability.mjs";
const fixtureId = "pf-api-pagination-behavior";
// Immutable public test-context snapshot. The candidate's mutable PF reference
// may advance independently; no metadata is rewritten to force an old shape.
const legacyContextRevision = "4aef8686073384a21dc3468d97610ecf7516ac59";
const legacyExecutionRevision = "a762daf43bdfe254c6ecd6e0b49f3cef78d0e9ec";
const git = (cwd, args, encoding = "utf8") => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", cwd, ...args],
  { encoding, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" } });

function fixedLegacyContext(t) {
  const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-fixed-prepare-test-")));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const anchor = resolve(work, "anchor");
  git(root, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", root, anchor]);
  git(anchor, ["checkout", "--quiet", "--detach", legacyContextRevision]);
  const referencePath = `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`;
  const fixedReference = git(root, ["show", `${legacyContextRevision}:${referencePath}`], null);
  assert.deepEqual(readFileSync(resolve(anchor, referencePath)), fixedReference);
  // Overlay only current test/entrypoint infrastructure. Keep all benchmark
  // assets from the immutable snapshot, including its actual old source pins.
  const currentPaths = [testPath, "scripts/ask-benchmark.mjs", "scripts/test-frozen-evaluator-fixture.mjs"];
  for (const path of currentPaths) writeFileSync(resolve(anchor, path), readFileSync(resolve(root, path)));
  git(anchor, ["add", "--", ...currentPaths]);
  git(anchor, ["-c", "user.name=ASK fixed historical test", "-c", "user.email=synthetic-test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "test-only current entrypoints on fixed legacy context"]);
  assert.deepEqual(readFileSync(resolve(anchor, referencePath)), fixedReference);
  const context = prepareFrozenEvaluatorTestRoot({ root: anchor, fixtureId, testPath });
  assert.equal(context.evidence.frozen_evaluator_revision, legacyExecutionRevision);
  assert.deepEqual(readFileSync(resolve(context.checkout, referencePath)), fixedReference);
  t.after(() => context.dispose());
  return context;
}

test("current execution module still exposes model-free preparation", () => {
  assert.equal(typeof preparePortfolioExecution, "function");
});

test("current supported CLI reaches input validation without unsupported fallback or writes", t => {
  const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-supported-prepare-test-")));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const runDir = resolve(work, "absent-run");
  const result = spawnSync(process.execPath, ["scripts/ask-benchmark.mjs", "prepare-execution", "--config", resolve(work, "missing-config.json"),
    "--plan", resolve(work, "missing-plan.json"), "--materialized", resolve(work, "missing-materialized"),
    "--selection-state", resolve(work, "missing-selection"), "--run-dir", runDir], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/u);
  assert.doesNotMatch(result.stderr, /unsupported|SyntaxError/u);
  assert.equal(existsSync(runDir), false);
  assert.deepEqual(readdirSync(work), []);
});

test("historical CLI links while unsupported preparation rejects before input reads or writes", t => {
  const candidateReferenceBytes = readFileSync(resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`));
  const context = fixedLegacyContext(t);
  const referenceBytes = readFileSync(resolve(context.checkout, context.referencePath));
  const cliBytes = readFileSync(resolve(root, "scripts/ask-benchmark.mjs"));
  const invoke = argv => {
    const result = spawnSync(process.execPath, argv, { cwd: context.checkout, encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  };
  const imports = invoke(["--input-type=module", "--eval", `
    import { validatePortfolioFoundation } from './scripts/ask-benchmark.mjs';
    import { executePortfolio, recoverPortfolioCase, verifyPortfolioExecution } from './scripts/ask-benchmark-execution.mjs';
    import * as capabilities from './scripts/ask-benchmark-execution.mjs';
    console.log(JSON.stringify({ legacy: [validatePortfolioFoundation, executePortfolio, recoverPortfolioCase, verifyPortfolioExecution].every(value => typeof value === 'function'), prepare: typeof capabilities.preparePortfolioExecution }));
  `]);
  assert.equal(imports.status, 0, imports.stderr);
  assert.deepEqual(JSON.parse(imports.stdout), { legacy: true, prepare: "undefined" });
  const help = invoke(["scripts/ask-benchmark.mjs", "help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /prepare-execution/u);

  const writesRoot = resolve(context.checkout, "synthetic-preparation-write-check");
  mkdirSync(writesRoot);
  const absentRun = resolve(writesRoot, "absent-run");
  const occupiedRun = resolve(writesRoot, "occupied-run");
  mkdirSync(occupiedRun);
  const sentinel = resolve(occupiedRun, "sentinel.txt");
  writeFileSync(sentinel, "synthetic existing run; must not change\n");
  const missingConfig = resolve(writesRoot, "missing-config.json");
  for (const runDir of [absentRun, occupiedRun]) {
    const rejected = invoke(["scripts/ask-benchmark.mjs", "prepare-execution", "--config", missingConfig,
      "--plan", resolve(writesRoot, "missing-plan.json"), "--materialized", resolve(writesRoot, "missing-materialized"),
      "--selection-state", resolve(writesRoot, "missing-selection"), "--run-dir", runDir]);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /prepare-execution is unsupported.*preparePortfolioExecution capability unavailable/u);
    assert.doesNotMatch(rejected.stderr, /ENOENT|SyntaxError/u);
    assert.equal(existsSync(absentRun), false);
    assert.equal(existsSync(missingConfig), false);
    assert.deepEqual(readdirSync(writesRoot), ["occupied-run"]);
    assert.deepEqual(readdirSync(occupiedRun), ["sentinel.txt"]);
    assert.equal(readFileSync(sentinel, "utf8"), "synthetic existing run; must not change\n");
  }
  // The helper projects only the exact declared dependency closure. Neither
  // the current entrypoint/test nor frozen public authority is rewritten.
  assert.deepEqual(readFileSync(resolve(context.checkout, "scripts/ask-benchmark.mjs")), cliBytes);
  assert.deepEqual(readFileSync(resolve(context.checkout, context.referencePath)), referenceBytes);
  assert.deepEqual(readFileSync(resolve(context.checkout, testPath)), readFileSync(resolve(root, testPath)));
  assert.equal(context.evidence.current_head_runtime_verified, false);
  assert.equal(context.evidence.admission_created, false);
  assert.deepEqual(readFileSync(resolve(root, context.referencePath)), candidateReferenceBytes);
});

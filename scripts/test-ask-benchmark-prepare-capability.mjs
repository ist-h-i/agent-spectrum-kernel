// Model-free CLI compatibility only. Never starts an agent or evaluator worker.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { preparePortfolioExecution } from "./ask-benchmark-execution.mjs";
import { prepareFrozenEvaluatorTestRoot } from "./test-frozen-evaluator-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const testPath = "scripts/test-ask-benchmark-prepare-capability.mjs";
const fixtureId = "pf-api-pagination-behavior";

test("current execution module still exposes model-free preparation", () => {
  assert.equal(typeof preparePortfolioExecution, "function");
});

test("historical CLI links while unsupported preparation rejects before input reads or writes", t => {
  const context = prepareFrozenEvaluatorTestRoot({ root, fixtureId, testPath });
  t.after(() => context.dispose());
  const referenceBytes = readFileSync(resolve(root, context.referencePath));
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
});

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS, validatePrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import { verifyUserComparisonConditionForTest } from "./ask-user-comparison.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function source(id) {
  const base = join(root, "benchmarks/fixtures/checkpoint-b2", id);
  const input = JSON.parse(readFileSync(join(base, "input-manifest.json")));
  return new Map(input.fixtures[id].files.map(file => [file.path,
    { bytes: readFileSync(join(base, file.path)), mode: "100644" }]));
}
for (const id of PRIMARY_FIXTURE_IDS) test(`${id}: original public command, task bytes and scope are bound`, () => {
  const recipe = buildPrimaryFixtureRecipe(id), tree = source(id);
  const closed = validatePrimaryFixtureRecipe(recipe, tree, { taskBytes: tree.get("task.md").bytes,
    mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class });
  assert.equal(closed.fixture_id, id);
  assert.ok(closed.checks.every(check => check.cwd === "workspace" && check.executable === "/bin/bash"));
  assert.equal(closed.requirements.length, 0); // Structural commands cannot claim oracle quality.
  for (const mutate of [value => value.checks[0].argv[1] = "exit 0",
    value => value.checks[0].id = "task-tests", value => value.mutable_paths = ["workspace/"],
    value => value.input_manifest_digest = `sha256:${"0".repeat(64)}`]) {
    const changed = structuredClone(recipe); mutate(changed);
    assert.throws(() => validatePrimaryFixtureRecipe(changed, tree));
  }
  const changed = new Map(tree); changed.set("evaluator.json", { bytes: Buffer.from("{}") });
  assert.throws(() => validatePrimaryFixtureRecipe(recipe, changed), /source must contain/);
  const drift = new Map(tree); drift.set("task.md", { bytes: Buffer.from("different task") });
  assert.throws(() => validatePrimaryFixtureRecipe(recipe, drift), /primary input changed/);
  assert.throws(() => validatePrimaryFixtureRecipe(recipe, tree, { taskClass: "trivial", mutablePaths: ["workspace/"] }));
});

async function verify({ exitCode = 0, outputLimited = false, terminationConfirmed = true } = {}) {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "ask-primary-recipe-fake-")));
  try {
    const id = "mn-focused-regression-test", recipe = buildPrimaryFixtureRecipe(id);
    for (const [path, file] of source(id)) {
      const target = join(area, "arms/plain", path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, file.bytes);
    }
    // Editing the declared test is the task, not forbidden verifier tampering.
    writeFileSync(join(area, "arms/plain/workspace/test/session-key.test.mjs"), "// candidate regression coverage\n");
    mkdirSync(join(area, "control/slots/plain"), { recursive: true });
    const reporter = readFileSync(join(root, "scripts/ask-user-comparison-test-reporter.mjs"));
    writeFileSync(join(area, "control/reporter.mjs"), reporter);
    const { comparisonHash } = await import("./ask-user-comparison-prepare.mjs");
    const plan = { arms: { plain: { path: "arms/plain" } }, policy: { execution_contract: "single_shot_v1" },
      config: { verification_timeout_ms: 300000, evidence_kind: "synthetic" }, verification: { recipe,
        reporter: { path: "control/reporter.mjs", digest: comparisonHash(reporter) } } };
    const calls = [];
    const transport = async value => {
      calls.push(value);
      return { stdout: "validator output\n", stderr: "diagnostic\n", exitCode,
        spawnObserved: true, terminationConfirmed, outputLimited, durationMs: 3 };
    };
    const result = await verifyUserComparisonConditionForTest(area, plan, "plain", undefined, transport);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].executable, "/bin/bash");
    assert.deepEqual(calls[0].argv, recipe.checks[0].argv);
    assert.equal(calls[0].cwd, join(area, "verification/plain/workspace"));
    assert.equal(calls[0].terminationScope, "direct_child");
    assert.equal(result.independent_process, false);
    assert.equal(result.execution_origin, "synthetic_injected_verifier");
    assert.equal(result.checks[0].semantic_quality, "unknown");
    assert.equal(result.checks[0].test_summary, null);
    assert.deepEqual(result.requirements, []);
    for (const path of result.checks[0].logs) assert.ok(readFileSync(join(area, "control/slots/plain", path)).length > 0);
    return result;
  } finally { rmSync(area, { recursive: true, force: true }); }
}
test("controller native command fake transport preserves editable test and unknown semantic quality", async () => {
  assert.equal((await verify()).checks[0].status, "pass");
});
test("native exit failure is retained separately from oracle score", async () => {
  assert.equal((await verify({ exitCode: 1 })).checks[0].status, "fail");
});
test("truncated or unknown-ended native child cannot establish verification", async () => {
  assert.equal((await verify({ outputLimited: true })).checks[0].status, "unknown");
  const result = await verify({ terminationConfirmed: false });
  assert.equal(result.checks[0].status, "unknown");
  assert.equal(result.checks[0].cleanup_error.code, "CHILD_TERMINATION_UNKNOWN");
});

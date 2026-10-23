import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPrimaryFixtureRecipe, CANONICAL_PRIMARY_FIXTURE_IDS, PRIMARY_FIXTURE_IDS, primaryFixtureIdsForSet, selectPrimaryFixtureIds, validatePrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import {kernelPrinciplesV2FixtureDescriptor,principlesV2Capability,kernelPrinciplesV2DescriptorSourcePaths} from "./kernel-principles-v2-catalog24.mjs";
import { verifyUserComparisonConditionForTest } from "./ask-user-comparison.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
// Each entry starts with a fresh ESM graph: an earlier recipe import must not
// hide a catalog/schema-first initialization cycle in the module cache.
for (const entries of [
  ["ask-benchmark-portfolio-catalog.mjs"], ["ask-primary-fixture-recipe.mjs"],
  ["ask-benchmark-portfolio-catalog.mjs", "ask-primary-fixture-recipe.mjs"],
  ["ask-primary-fixture-recipe.mjs", "ask-benchmark-portfolio-catalog.mjs"],
  ["ask-benchmark-schema.mjs"], ["ask-benchmark-materialize.mjs"], ["ask-primary-scoring-version.mjs"],
]) test(`fresh primary import entry: ${entries.join(" → ")}`, () => {
  const code = `import assert from "node:assert/strict";
    for (const name of ${JSON.stringify(entries)}) await import("./scripts/" + name);
    const catalog = await import("./scripts/ask-benchmark-portfolio-catalog.mjs");
    const recipe = await import("./scripts/ask-primary-fixture-recipe.mjs");
    const registry = await import("./scripts/ask-primary-fixture-registry.mjs");
    assert.strictEqual(catalog.PRIMARY_FIXTURE_REGISTRY, registry.PRIMARY_FIXTURE_REGISTRY);
    assert.equal(Object.isFrozen(registry.PRIMARY_FIXTURE_REGISTRY), true);
    assert.equal(recipe.CANONICAL_PRIMARY_FIXTURE_IDS.length, 24);
    assert.equal(recipe.PRIMARY_FIXTURE_IDS.length, 9);
    assert.deepEqual(recipe.CANONICAL_PRIMARY_FIXTURE_IDS, catalog.PRIMARY_FIXTURE_REGISTRY.map(row => row[0]));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
test("primary registry leaf remains pinned by the existing producer source closure", async () => {
  const { primaryProducerSources } = await import("./ask-primary-evaluation-producer.mjs");
  assert.match(primaryProducerSources()["scripts/ask-primary-fixture-registry.mjs"], /^sha256:[a-f0-9]{64}$/u);
});
function source(id) {
  const base = join(root, "benchmarks/fixtures/checkpoint-b2", id);
  const input = JSON.parse(readFileSync(join(base, "input-manifest.json")));
  return new Map(input.fixtures[id].files.map(file => [file.path,
    { bytes: readFileSync(join(base, file.path)), mode: "100644" }]));
}
for (const id of CANONICAL_PRIMARY_FIXTURE_IDS) test(`${id}: original public command, task bytes and scope are bound`, () => {
  const recipe = buildPrimaryFixtureRecipe(id), tree = source(id);
  const metadata=readFileSync(join(root,"benchmarks/fixtures/checkpoint-b2",id,"metadata.json"));
  const descriptor=kernelPrinciplesV2FixtureDescriptor(id,tree.get("task.md").bytes,metadata);
  assert.equal(descriptor.task_class,recipe.runner_task_class);assert.equal(principlesV2Capability(descriptor).status,"available");
  assert.throws(()=>kernelPrinciplesV2FixtureDescriptor(id,Buffer.from("drift"),metadata));
  assert.throws(()=>kernelPrinciplesV2FixtureDescriptor(id,tree.get("task.md").bytes,Buffer.from("{}")));
  const changedDescriptor=structuredClone(descriptor);changedDescriptor.task_class="risk-gated";assert.throws(()=>principlesV2Capability(changedDescriptor));
  const closure=kernelPrinciplesV2DescriptorSourcePaths(id);assert.equal(closure[0],"scripts/kernel-principles-v2.mjs");assert.ok([3,4].includes(closure.length));
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
    assert.equal(calls[0].env.HOME, process.env.HOME, 'login-shell verification retains ordinary HOME for runtime resolution');
    assert.equal(result.runtime.scope, 'comparison_controller');
    assert.equal(result.runtime.shell_node_version, null, 'controller Node metadata cannot establish the shell-selected Node');
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
test('verification HOME inheritance remains narrowly sanitized', async () => {
  const {buildUserComparisonVerificationEnvironment}=await import('./ask-user-comparison.mjs');
  const supplied={PATH:'/test/bin',HOME:'/test/user',CODEX_HOME:'/credential-store',OPENAI_API_KEY:'must-not-inherit',NODE_OPTIONS:'--require unsafe',BASH_ENV:'/unsafe/startup',ENV:'/unsafe/env',GIT_CONFIG_GLOBAL:'/unsafe/git'};
  const shell=buildUserComparisonVerificationEnvironment(true,supplied);
  assert.equal(shell.HOME,supplied.HOME);assert.equal(shell.PATH,supplied.PATH);
  for(const key of ['CODEX_HOME','OPENAI_API_KEY','NODE_OPTIONS','BASH_ENV','ENV'])assert.equal(Object.hasOwn(shell,key),false);
  assert.equal(shell.GIT_CONFIG_GLOBAL,'/dev/null');assert.equal(shell.GIT_CONFIG_SYSTEM,'/dev/null');
  assert.equal(Object.hasOwn(buildUserComparisonVerificationEnvironment(false,supplied),'HOME'),false);
  assert.equal(Object.hasOwn(buildUserComparisonVerificationEnvironment(true,{PATH:'/test/bin'}),'HOME'),false);
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


test("one catalog is the new default and task subsets do not imply grading authority", () => {
  assert.deepEqual(primaryFixtureIdsForSet(), CANONICAL_PRIMARY_FIXTURE_IDS);
  assert.deepEqual(selectPrimaryFixtureIds(), CANONICAL_PRIMARY_FIXTURE_IDS);
  const selected = ["hi-authorization-exception", "pf-review-error-contract"];
  assert.deepEqual(selectPrimaryFixtureIds(selected), selected);
  for (const ids of [[], [...selected].reverse(), [selected[0], selected[0]], ["not-registered"]])
    assert.throws(() => selectPrimaryFixtureIds(ids));
  assert.deepEqual(primaryFixtureIdsForSet("legacy9"), PRIMARY_FIXTURE_IDS, "historical record order is preserved explicitly");
});

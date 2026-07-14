#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { MATERIALIZATION_MANIFEST_NAME, validateMaterializationProjectionInventory } from "./ask-benchmark-materialize.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const portfolioConfig = resolve(root, "benchmarks/adaptive-portfolio.config.json");
const materializationSchema = resolve(root, "benchmarks/schemas/materialization-manifest.schema.json");
const work = mkdtempSync(resolve(root, ".ask-benchmark-materialize-test-"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function differentHex(value) {
  return `${value[0] === "a" ? "b" : "a"}${value.slice(1)}`;
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}

function manifestRecord(fixtureRoot, path, extra = {}) {
  const bytes = readFileSync(resolve(fixtureRoot, path));
  return { path, sha256: sha256(bytes), bytes: bytes.length, ...extra };
}

function withTemporaryTrackedChange(path, suffix, callback) {
  const original = readFileSync(path);
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from(suffix)]));
    callback();
  } finally {
    writeFileSync(path, original);
  }
}

function createSyntheticPortfolio(name, configure) {
  const scenario = resolve(work, name);
  const fixtureRoot = resolve(scenario, "fixtures");
  const fixtureId = `fixture-${name.replaceAll("_", "-")}`.slice(0, 60);
  const fixture = resolve(fixtureRoot, fixtureId);
  mkdirSync(resolve(fixture, "workspace"), { recursive: true });
  mkdirSync(resolve(fixture, "evaluator"), { recursive: true });
  writeFileSync(resolve(fixture, "task.md"), "Implement the agent-visible fixture contract.\n");
  writeFileSync(resolve(fixture, "workspace/package.json"), "{\"type\":\"module\"}\n");
  writeFileSync(resolve(fixture, "evaluator/expected.json"), "{\"private\":true}\n");
  const configured = configure({ fixture, fixtureId }) ?? {};
  const records = [
    manifestRecord(fixture, "task.md"),
    manifestRecord(fixture, "workspace/package.json"),
    ...(configured.records ?? []),
  ];
  const inputManifestPath = resolve(fixtureRoot, "input-manifest.json");
  writeJson(inputManifestPath, {
    schema_version: 1,
    hash_algorithm: "sha256",
    scope: "agent-visible task.md + workspace/**",
    fixtures: { [fixtureId]: { class: "implementation-verification", difficulty: "medium-hard", target_minutes: 15, files: records } },
  });
  const base = JSON.parse(readFileSync(portfolioConfig, "utf8"));
  base.fixture_root = relative(root, fixtureRoot);
  base.fixtures = [{
    id: fixtureId,
    suite: "calibration",
    task_class: "implementation",
    difficulty: "medium-hard",
    repetitions: 3,
    aggregate_eligible: false,
    input_manifest_path: relative(root, inputManifestPath),
    input_manifest_sha256: sha256(readFileSync(inputManifestPath)),
  }];
  const configPath = resolve(scenario, "config.json");
  writeJson(configPath, base);
  const planPath = resolve(scenario, "plan.json");
  run(["plan", "--config", configPath, "--output", planPath, "--seed", `seed-${name}`]);
  return { scenario, fixture, configPath, planPath };
}

function expectFailure({ name, configPath = portfolioConfig, planPath, outputPath = resolve(work, `fail-${name}`), pattern }) {
  const result = run(["materialize", "--config", configPath, "--plan", planPath, "--output", outputPath], 1);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern, name);
  if (existsSync(outputPath)) assert.equal(existsSync(resolve(outputPath, MATERIALIZATION_MANIFEST_NAME)), false, `${name} left a complete-looking manifest`);
}

try {
  const planPath = resolve(work, "plan.json");
  run(["plan", "--config", portfolioConfig, "--output", planPath, "--seed", "materialization-regression-2026"]);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));

  const mutatePlan = (name, mutate, pattern) => {
    const candidate = structuredClone(plan);
    mutate(candidate);
    const candidatePath = resolve(work, `${name}.plan.json`);
    writeJson(candidatePath, candidate);
    expectFailure({ name, planPath: candidatePath, pattern });
  };

  const digestMismatchConfig = structuredClone(JSON.parse(readFileSync(portfolioConfig, "utf8")));
  digestMismatchConfig.adapter_tracks[0].runtime_status = "unavailable";
  const digestMismatchConfigPath = resolve(work, "config-digest-mismatch.json");
  writeJson(digestMismatchConfigPath, digestMismatchConfig);
  expectFailure({ name: "config digest mismatch", configPath: digestMismatchConfigPath, planPath, pattern: /config digest mismatch/u });

  const protocolCopy = resolve(work, "protocol-copy.md");
  writeFileSync(protocolCopy, readFileSync(resolve(root, "benchmarks/protocol-adaptive.md")));
  const protocolConfig = structuredClone(JSON.parse(readFileSync(portfolioConfig, "utf8")));
  protocolConfig.protocol_path = relative(root, protocolCopy);
  const protocolConfigPath = resolve(work, "protocol-config.json");
  writeJson(protocolConfigPath, protocolConfig);
  const protocolPlanPath = resolve(work, "protocol.plan.json");
  run(["plan", "--config", protocolConfigPath, "--output", protocolPlanPath, "--seed", "protocol-drift-seed"]);
  writeFileSync(protocolCopy, `${readFileSync(protocolCopy, "utf8")}\nDrift.\n`);
  expectFailure({ name: "protocol digest mismatch", configPath: protocolConfigPath, planPath: protocolPlanPath, pattern: /protocol digest mismatch/u });

  mutatePlan("repository-revision", (value) => { value.repository_revision = differentHex(value.repository_revision); }, /repository revision mismatch/u);
  mutatePlan("seed-digest", (value) => { value.randomization_seed.sha256 = differentHex(value.randomization_seed.sha256); }, /seed digest mismatch/u);
  mutatePlan("plan-id", (value) => { value.plan_id = `plan-${differentHex(value.plan_id.slice(5))}`; }, /identity mismatch: plan_id/u);
  mutatePlan("case-id", (value) => { value.cases[0].case_id = `${value.cases[0].case_id.slice(0, -1)}${value.cases[0].case_id.endsWith("a") ? "b" : "a"}`; }, /case identity mismatch.*case_id/u);
  mutatePlan("block-id", (value) => { value.cases[0].block_id = `${value.cases[0].block_id.slice(0, -1)}${value.cases[0].block_id.endsWith("a") ? "b" : "a"}`; }, /case identity mismatch.*block_id/u);
  mutatePlan("repetition", (value) => { value.cases[0].repetition = value.cases[0].repetition === 1 ? 2 : 1; }, /case identity mismatch.*repetition/u);
  mutatePlan("registered-repetitions", (value) => { value.cases[0].registered_repetitions = value.cases[0].registered_repetitions === 3 ? 5 : 3; }, /case identity mismatch.*registered_repetitions/u);
  mutatePlan("condition-order", (value) => { value.cases[0].condition_order_position = value.cases[0].condition_order_position === 1 ? 2 : 1; }, /case identity mismatch.*condition_order_position/u);
  mutatePlan("fixture-manifest", (value) => { value.cases[0].input_manifest_sha256 = differentHex(value.cases[0].input_manifest_sha256); }, /case identity mismatch.*input_manifest_sha256/u);

  const nonEmpty = resolve(work, "non-empty-output");
  mkdirSync(nonEmpty);
  writeFileSync(resolve(nonEmpty, "existing.txt"), "owned\n");
  expectFailure({ name: "non-empty output", planPath, outputPath: nonEmpty, pattern: /absent or empty directory/u });
  assert.equal(readFileSync(resolve(nonEmpty, "existing.txt"), "utf8"), "owned\n");

  const outputFile = resolve(work, "output-file");
  writeFileSync(outputFile, "not a directory\n");
  expectFailure({ name: "regular-file output", planPath, outputPath: outputFile, pattern: /not a regular file/u });

  const realOutputParent = resolve(work, "real-output-parent");
  mkdirSync(realOutputParent);
  const linkedOutputParent = resolve(work, "linked-output-parent");
  symlinkSync(realOutputParent, linkedOutputParent, "dir");
  expectFailure({ name: "output path symlink traversal", planPath, outputPath: resolve(linkedOutputParent, "output"), pattern: /traverses a symlink/u });

  const incompleteOutput = resolve(work, "incomplete-output");
  mkdirSync(incompleteOutput);
  const invalidPlanPath = resolve(work, "incomplete.plan.json");
  const invalidPlan = structuredClone(plan);
  invalidPlan.randomization_seed.sha256 = differentHex(invalidPlan.randomization_seed.sha256);
  writeJson(invalidPlanPath, invalidPlan);
  expectFailure({ name: "failed materialization cleanup", planPath: invalidPlanPath, outputPath: incompleteOutput, pattern: /seed digest mismatch/u });
  assert.deepEqual(readdirSync(incompleteOutput), []);

  const firstOutput = resolve(work, "materialized-a");
  run(["materialize", "--config", portfolioConfig, "--plan", planPath, "--output", firstOutput]);
  for (const [name, path, suffix] of [
    ["dirty kernel source", resolve(root, "AGENTS.md"), "\n<!-- materialization dirty-source regression -->\n"],
    ["dirty Skill source", resolve(root, "skills/evidence-ledger/SKILL.md"), "\n<!-- materialization dirty-source regression -->\n"],
    ["dirty materializer source", resolve(root, "scripts/ask-benchmark-materialize.mjs"), "\n// materialization dirty-source regression\n"],
  ]) {
    withTemporaryTrackedChange(path, suffix, () => {
      expectFailure({ name, planPath, outputPath: resolve(work, `fail-${name.replaceAll(" ", "-")}`), pattern: /tracked working tree and index must match HEAD/u });
    });
  }

  const directEvaluator = createSyntheticPortfolio("direct_evaluator", ({ fixture }) => ({ records: [manifestRecord(fixture, "evaluator/expected.json")] }));
  expectFailure({ name: "direct evaluator leakage", configPath: directEvaluator.configPath, planPath: directEvaluator.planPath, pattern: /outside the agent-visible.*allowlist/u });

  const nestedEvaluator = createSyntheticPortfolio("nested_evaluator", ({ fixture }) => {
    mkdirSync(resolve(fixture, "workspace/nested/evaluator"), { recursive: true });
    writeFileSync(resolve(fixture, "workspace/nested/evaluator/oracle.txt"), "private\n");
    return { records: [manifestRecord(fixture, "workspace/nested/evaluator/oracle.txt")] };
  });
  expectFailure({ name: "nested evaluator leakage", configPath: nestedEvaluator.configPath, planPath: nestedEvaluator.planPath, pattern: /prohibited evaluator material/u });

  const hiddenTest = createSyntheticPortfolio("hidden_test", ({ fixture }) => {
    mkdirSync(resolve(fixture, "workspace/test"), { recursive: true });
    writeFileSync(resolve(fixture, "workspace/test/hidden-tests.mjs"), "throw new Error('private');\n");
    return { records: [manifestRecord(fixture, "workspace/test/hidden-tests.mjs")] };
  });
  expectFailure({ name: "hidden-test leakage", configPath: hiddenTest.configPath, planPath: hiddenTest.planPath, pattern: /prohibited evaluator material/u });

  const symlinkedEvaluator = createSyntheticPortfolio("symlink_evaluator", ({ fixture }) => {
    symlinkSync("../evaluator/expected.json", resolve(fixture, "workspace/data.txt"));
    return { records: [manifestRecord(fixture, "workspace/data.txt")] };
  });
  expectFailure({ name: "symlinked evaluator leakage", configPath: symlinkedEvaluator.configPath, planPath: symlinkedEvaluator.planPath, pattern: /traverses a symlink/u });

  const escapingSymlink = createSyntheticPortfolio("escaping_symlink", ({ fixture }) => {
    const outside = resolve(fixture, "../outside.txt");
    writeFileSync(outside, "outside fixture root\n");
    symlinkSync("../../outside.txt", resolve(fixture, "workspace/outside.txt"));
    return { records: [manifestRecord(fixture, "workspace/outside.txt")] };
  });
  expectFailure({ name: "fixture symlink path escape", configPath: escapingSymlink.configPath, planPath: escapingSymlink.planPath, pattern: /traverses a symlink/u });

  const renamedEvaluator = createSyntheticPortfolio("renamed_evaluator", ({ fixture }) => {
    writeFileSync(resolve(fixture, "workspace/notes.txt"), "private rubric bytes\n");
    return { records: [manifestRecord(fixture, "workspace/notes.txt", { visibility: "evaluator_only" })] };
  });
  expectFailure({ name: "renamed non-agent-visible evaluator", configPath: renamedEvaluator.configPath, planPath: renamedEvaluator.planPath, pattern: /explicitly non-agent-visible/u });

  const relativeEscape = createSyntheticPortfolio("relative_escape", ({ fixture }) => {
    const bytes = readFileSync(resolve(fixture, "evaluator/expected.json"));
    return { records: [{ path: "workspace/../evaluator/expected.json", sha256: sha256(bytes), bytes: bytes.length }] };
  });
  expectFailure({ name: "manifest relative path escape", configPath: relativeEscape.configPath, planPath: relativeEscape.planPath, pattern: /normalized relative path/u });

  const absoluteEscape = createSyntheticPortfolio("absolute_escape", ({ fixture }) => {
    const source = resolve(fixture, "task.md");
    const bytes = readFileSync(source);
    return { records: [{ path: source, sha256: sha256(bytes), bytes: bytes.length }] };
  });
  expectFailure({ name: "manifest absolute path escape", configPath: absoluteEscape.configPath, planPath: absoluteEscape.planPath, pattern: /normalized relative path/u });

  const secondOutput = resolve(work, "materialized-b");
  run(["materialize", "--config", portfolioConfig, "--plan", planPath, "--output", secondOutput]);
  const firstManifestBytes = readFileSync(resolve(firstOutput, MATERIALIZATION_MANIFEST_NAME));
  const secondManifestBytes = readFileSync(resolve(secondOutput, MATERIALIZATION_MANIFEST_NAME));
  assert.deepEqual(secondManifestBytes, firstManifestBytes, "same inputs must produce byte-identical manifests");
  const manifest = JSON.parse(firstManifestBytes);
  assert.equal(manifest.case_count, 112);
  assert.equal(manifest.cases.length, 112);
  assert.deepEqual(new Set(manifest.cases.map((entry) => entry.adapter)), new Set(["codex", "claude"]));
  assert.deepEqual(new Set(manifest.cases.map((entry) => entry.condition)), new Set(["plain", "kernel_only", "adaptive_ask", "full_ask"]));
  assert.equal(manifest.cases.filter((entry) => entry.adapter === "codex").length, 56);
  assert.equal(manifest.cases.filter((entry) => entry.adapter === "claude").length, 56);
  assert.equal(new Set(manifest.cases.map((entry) => entry.case_id)).size, 112);
  for (const block of groupBy(manifest.cases, (entry) => entry.block_id).values()) {
    assert.equal(block.length, 4);
    assert.equal(new Set(block.map((entry) => entry.frozen_input_digest)).size, 1);
    assert.equal(new Set(block.map((entry) => entry.task_digest)).size, 1);
    assert.equal(new Set(block.map((entry) => entry.workspace_digest)).size, 1);
  }
  for (const entry of manifest.cases) {
    const sourceTask = resolve(root, "benchmarks/fixtures/checkpoint-b2", entry.fixture, "task.md");
    assert.deepEqual(readFileSync(resolve(firstOutput, entry.case_id, "BENCHMARK_TASK.md")), readFileSync(sourceTask), `${entry.case_id} task wording drifted`);
    assert.ok(entry.agent_visible_files.every((file) => file.path === "BENCHMARK_TASK.md" || file.path.startsWith("workspace/")));
    assert.ok(entry.projected_asset_inventory.every((file) => !/(?:^|\/)(?:evaluator|hidden[-_]?tests?|oracle|rubrics?)(?:\/|$)/u.test(file.path)));
    if (entry.condition === "plain") assert.deepEqual(entry.projected_asset_inventory, []);
    if (entry.condition === "kernel_only") assert.deepEqual(entry.projected_asset_inventory.map((file) => file.path), ["AGENTS.md"]);
    if (entry.condition === "adaptive_ask") {
      const boundary = entry.adapter === "codex" ? ".agents/adaptive/projection-boundary.json" : ".claude/adaptive/projection-boundary.json";
      assert.ok(entry.projected_asset_inventory.some((file) => file.path === boundary));
      assert.equal(entry.projection_evidence.adaptive_projection.boundary_status, "available_pre_selection");
      assert.equal(entry.projection_evidence.adaptive_projection.mechanisms_selected, false);
      assert.equal(entry.projection_evidence.adaptive_projection.selection_seal_produced, false);
      assert.equal(entry.projection_evidence.adaptive_projection.runtime_execution_attempted, false);
    }
    if (entry.adapter === "codex") assert.ok(entry.projected_asset_inventory.every((file) => !file.path.startsWith(".claude/")));
    if (entry.adapter === "claude") assert.ok(entry.projected_asset_inventory.every((file) => !file.path.startsWith(".agents/")));
    if (entry.condition === "full_ask") assert.ok(entry.projected_asset_inventory.some((file) => file.path.startsWith(entry.adapter === "codex" ? ".agents/" : ".claude/")));
  }
  assert.equal(firstManifestBytes.includes(Buffer.from(root)), false, "manifest must not contain private absolute repository paths");

  const invalidManifest = structuredClone(manifest);
  delete invalidManifest.cases[0].condition_projection_digest;
  assert.ok(validateBenchmarkSchemaInstance(invalidManifest, { schemaPath: materializationSchema }).length > 0, "materialization manifest schema failure must be observable");

  for (const [field, invalidValues] of [
    ["capability_downgrade", [{ invalid: true }, 1, []]],
    ["unavailable_reason", [true, { invalid: true }]],
  ]) {
    for (const invalidValue of invalidValues) {
      const invalidNullable = structuredClone(manifest);
      invalidNullable.cases[0].projection_evidence[field] = invalidValue;
      assert.ok(validateBenchmarkSchemaInstance(invalidNullable, { schemaPath: materializationSchema }).length > 0, `${field} must reject ${JSON.stringify(invalidValue)}`);
    }
  }
  for (const value of [null, "bounded evidence"]) {
    const validNullable = structuredClone(manifest);
    validNullable.cases[0].projection_evidence.capability_downgrade = value;
    validNullable.cases[0].projection_evidence.unavailable_reason = value;
    assert.deepEqual(validateBenchmarkSchemaInstance(validNullable, { schemaPath: materializationSchema }), [], `nullable projection evidence must accept ${JSON.stringify(value)}`);
  }

  const adapterProfileSchema = resolve(root, "schemas/adapter-runtime-profile.schema.json");
  const adapterProfiles = JSON.parse(readFileSync(resolve(root, "docs/fixtures/adapter-runtime-profiles.json"), "utf8"));
  const codexProfile = structuredClone(adapterProfiles.profiles.find((entry) => entry.adapter_id === "codex"));
  assert.deepEqual(validateBenchmarkSchemaInstance(codexProfile, { schemaPath: adapterProfileSchema }), [], "existing nullable adapter profile field must accept null");
  codexProfile.rendering.plan_shaping_options.skills = ["evidence-ledger"];
  assert.deepEqual(validateBenchmarkSchemaInstance(codexProfile, { schemaPath: adapterProfileSchema }), [], "existing nullable adapter profile field must accept arrays");

  assert.throws(() => validateMaterializationProjectionInventory({ adapter: "codex", condition: "full_ask", inventory: [{ path: "AGENTS.md" }, { path: ".claude/skills/x/SKILL.md" }] }), /other adapter/u);
  assert.throws(() => validateMaterializationProjectionInventory({ adapter: "claude", condition: "full_ask", inventory: [{ path: "AGENTS.md" }, { path: ".agents/skills/x/SKILL.md" }] }), /other adapter/u);
  assert.throws(() => validateMaterializationProjectionInventory({ adapter: "codex", condition: "plain", inventory: [{ path: "AGENTS.md" }] }), /Plain projection/u);
  assert.throws(() => validateMaterializationProjectionInventory({ adapter: "codex", condition: "kernel_only", inventory: [{ path: "AGENTS.md" }, { path: "skills/x/SKILL.md" }] }), /Kernel-only projection/u);
  const adaptiveCase = manifest.cases.find((entry) => entry.adapter === "codex" && entry.condition === "adaptive_ask");
  assert.throws(() => validateMaterializationProjectionInventory({ adapter: "codex", condition: "adaptive_ask", inventory: adaptiveCase.projected_asset_inventory, fullProjectionDigest: adaptiveCase.condition_projection_digest }), /must not be identical/u);

  const executable = createSyntheticPortfolio("executable_mode", ({ fixture }) => {
    writeFileSync(resolve(fixture, "workspace/tool.sh"), "#!/bin/sh\nexit 0\n");
    chmodSync(resolve(fixture, "workspace/tool.sh"), 0o755);
    return { records: [manifestRecord(fixture, "workspace/tool.sh")] };
  });
  const executableOutput = resolve(executable.scenario, "materialized");
  run(["materialize", "--config", executable.configPath, "--plan", executable.planPath, "--output", executableOutput]);
  const executableManifest = JSON.parse(readFileSync(resolve(executableOutput, MATERIALIZATION_MANIFEST_NAME), "utf8"));
  for (const entry of executableManifest.cases) {
    assert.equal(statSync(resolve(executableOutput, entry.case_id, "workspace/tool.sh")).mode & 0o777, 0o755);
    assert.equal(entry.agent_visible_files.find((file) => file.path === "workspace/tool.sh").mode, "0755");
  }

  console.log("ASK benchmark materialization tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}

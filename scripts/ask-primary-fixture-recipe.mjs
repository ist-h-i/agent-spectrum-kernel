// Closed, public fixture recipes. No private evaluator, model or process is read/run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { PRIMARY_FIXTURE_REGISTRY } from "./ask-primary-fixture-registry.mjs";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";

export const PRIMARY_RECIPE_KIND = "ask_primary_fixture_recipe_v1";
export const PRIMARY_FIXTURE_IDS = Object.freeze([
  "mp-ci-evidence-gap", "mp-data-migration-handoff", "mn-focused-regression-test",
  "mp-accessibility-interaction-review", "mp-frontend-state-review", "mp-iac-rollback-design",
  "mp-performance-investigation", "mn-build-option-update", "mn-doc-config-correction",
]);
// Historical nine-task records keep their exact order. New preparations may select
// the canonical catalog inventory explicitly; arbitrary subsets are never authority.
export const CANONICAL_PRIMARY_FIXTURE_IDS = Object.freeze(PRIMARY_FIXTURE_REGISTRY.map(row => row[0]));
export function primaryFixtureIdsForSet(fixtureSet = "legacy9") {
  assert.ok(["legacy9", "catalog24"].includes(fixtureSet), "unknown primary fixture set");
  return fixtureSet === "catalog24" ? CANONICAL_PRIMARY_FIXTURE_IDS : PRIMARY_FIXTURE_IDS;
}
export const isRegisteredPrimaryFixtureId = fixtureId => CANONICAL_PRIMARY_FIXTURE_IDS.includes(fixtureId);
export function assertPrimaryFixtureInventory(ids, fixtureSet = "legacy9") {
  assert.deepEqual(ids, primaryFixtureIdsForSet(fixtureSet), "complete registered primary fixture set required in fixed order");
  return primaryFixtureIdsForSet(fixtureSet);
}
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const parse = bytes => parseJsonRejectDuplicateKeys(bytes.toString("utf8"));
const SOURCE = fileURLToPath(new URL("../", import.meta.url));
const CLASSES = Object.freeze({ review_verification: "review", pr_review: "review",
  handoff_resume: "handoff", design_gate: "design", investigation: "investigation",
  verification_only: "implementation", configuration: "implementation", documentation: "trivial", local_implementation: "implementation", local_bug_fix: "implementation",
  small_feature: "implementation", implementation_verification: "implementation", investigation_implementation: "implementation",
  dependency_migration: "implementation", implementation_review: "review", operation_boundary: "design", migration_design: "design" });

/** Exact existing public command bytes, scoped to the unchanged fixture layout. */
export function buildPrimaryFixtureRecipe(fixtureId, { root = SOURCE } = {}) {
  assert.ok(isRegisteredPrimaryFixtureId(fixtureId), "unknown primary fixture");
  const base = join(root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
  const read = name => readFileSync(join(base, `${name}.json`));
  const inputBytes = read("input-manifest"), commandBytes = read("verification-command-contract");
  const metadata = parse(read("metadata")), scope = parse(read("evidence-map")).scope_boundary_authority;
  const commands = validateVerificationCommandContract(parse(commandBytes), { root });
  assert.equal(commands.fixture_id, fixtureId);
  assert.equal(commands.fixture_input_digest, hash(inputBytes));
  assert.ok(commands.commands.length > 0 && commands.commands.length <= 16);
  const checks = commands.commands.map(command => {
    assert.equal(command.requirement, "required", "alternative/optional commands need an explicit recipe revision");
    assert.equal(command.alternative_group_id, null);
    assert.deepEqual(command.working_directory, { path: ".", evidence_requirement: "not_required" });
    assert.equal(command.execution_form, "codex_shell_command");
    assert.equal(command.shell_family, "posix_bash");
    assert.deepEqual(command.shell_envelope, { executable: "/bin/bash", arguments: ["-lc"] });
    assert.equal(command.safe_argv, null);
    assert.ok(typeof command.canonical_script === "string" && command.canonical_script.length > 0);
    return { id: command.command_id, executable: "/bin/bash", argv: ["-lc", command.canonical_script],
      cwd: "workspace", contract_command_digest: command.command_contract_digest };
  });
  assert.equal(new Set(checks.map(check => check.id)).size, checks.length);
  assert.ok(CLASSES[metadata.task_class], "primary task class has no existing runner mapping");
  return { kind: PRIMARY_RECIPE_KIND, fixture_id: fixtureId, task_class: metadata.task_class,
    runner_task_class: CLASSES[metadata.task_class], input_manifest_digest: hash(inputBytes),
    command_contract_raw_digest: hash(commandBytes), command_contract_digest: commands.contract_digest,
    renderer_digest: hash(readFileSync(fileURLToPath(import.meta.url))),
    mutable_paths: scope.allowed_candidate_paths.map(path => path.split("#")[0]),
    checks, requirements: [],
    quality_policy: "native command success establishes structural/public verification only; semantic quality awaits the fixed private evaluator" };
}

/** Refuse arbitrary scripts, changed public inputs, scope widening or class substitution. */
export function validatePrimaryFixtureRecipe(recipe, tree, { root = SOURCE, taskBytes, mutablePaths, taskClass } = {}) {
  assert.equal(recipe?.kind, PRIMARY_RECIPE_KIND);
  const expected = buildPrimaryFixtureRecipe(recipe.fixture_id, { root });
  assert.deepEqual(recipe, expected, "primary fixture recipe differs from fixed public authority");
  const base = join(root, "benchmarks/fixtures/checkpoint-b2", recipe.fixture_id);
  const manifest = parse(readFileSync(join(base, "input-manifest.json")));
  const files = manifest.fixtures[recipe.fixture_id].files;
  assert.deepEqual([...tree.keys()].sort(), files.map(file => file.path).sort(), "primary source must contain task.md and workspace bytes only");
  for (const file of files) {
    const entry = tree.get(file.path);
    assert.equal(entry.bytes.length, file.bytes, `primary input changed: ${file.path}`);
    assert.equal(hash(entry.bytes), `sha256:${file.sha256}`, `primary input changed: ${file.path}`);
  }
  if (taskBytes) assert.deepEqual(taskBytes, tree.get("task.md").bytes, "public task text changed");
  if (mutablePaths) assert.deepEqual(mutablePaths, expected.mutable_paths, "primary mutable scope changed");
  if (taskClass) assert.equal(taskClass, expected.runner_task_class, "primary task class must reflect the actual public work");
  return expected;
}

export const isPrimaryFixtureRecipe = recipe => recipe?.kind === PRIMARY_RECIPE_KIND;
export const primaryFixtureChecks = recipe => recipe.checks;

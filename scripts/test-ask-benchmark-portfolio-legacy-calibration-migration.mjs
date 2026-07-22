#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";
import {
  computeLegacyCalibrationMigrationDigest,
  computeLegacyCalibrationMigrationId,
  LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH,
  migrateLegacyCalibrationResult,
  verifyLegacyCalibrationMigration,
} from "./ask-benchmark-portfolio-legacy-calibration-migration.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  "benchmarks/results/checkpoint-b-2026-07-12.json",
  "benchmarks/results/checkpoint-b2-2026-07-12.json",
  "benchmarks/results/checkpoint-c-2026-07-14.json",
];
const checkedMigrations = sources.map((path) => path.replace(/\.json$/u, ".migration.json"));
const targetFiles = [
  "benchmarks/portfolio-catalog.json",
  "benchmarks/portfolio-similarity.json",
  "benchmarks/portfolio-policy-manifest.json",
  "benchmarks/portfolio-admission-policy.json",
  "benchmarks/portfolio-scoring-policy.json",
  "benchmarks/portfolio-lineage-policy.json",
];
const conditions = ["plain", "kernel_only", "full_ask"];
const covered = new Set();

function check(name, callback) { callback(); covered.add(name); }
function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function close(artifact) {
  artifact.migration_id = computeLegacyCalibrationMigrationId(artifact);
  artifact.migration_digest = computeLegacyCalibrationMigrationDigest(artifact);
  return artifact;
}
function launchChild(args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolvePromise({ status, stderr }));
  });
}
function readFileIfPresent(path) { try { return readFileSync(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
async function waitForFile(path) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (readFileIfPresent(path)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error(`timed out waiting for ${path}`);
}

if (process.argv[2] === "--migrate-child") {
  try {
    migrateLegacyCalibrationResult({ sourcePath: process.argv[3], outputPath: process.argv[4] });
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[2] === "--stable-child") {
  try {
    const [inputPath, markerPath, continuePath] = process.argv.slice(3);
    const before = readStableFile(inputPath, "migration verifier race input", 1024, { allowEmpty: false });
    writeFileSync(markerPath, "ready\n", { flag: "wx" });
    const waitArray = new Int32Array(new SharedArrayBuffer(4));
    while (!readFileIfPresent(continuePath)) Atomics.wait(waitArray, 0, 0, 10);
    const after = readStableFile(inputPath, "migration verifier race input", 1024, { allowEmpty: false });
    assertStableFileEvidence(before, after, "migration verifier race input");
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function copyAuthorityRoot(parent, sourcePath) {
  const customRoot = resolve(parent, "custom-root");
  mkdirSync(resolve(customRoot, "benchmarks/results"), { recursive: true });
  cpSync(resolve(root, "benchmarks/schemas"), resolve(customRoot, "benchmarks/schemas"), { recursive: true });
  for (const path of targetFiles) {
    mkdirSync(dirname(resolve(customRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(customRoot, path));
  }
  cpSync(resolve(root, sourcePath), resolve(customRoot, sourcePath));
  return customRoot;
}

function verifyMutation(work, name, sourcePath, baseArtifact, mutate, pattern = /Schema validation|rederivation|drift|contradict|prohibited|canonical|mapping|duplicate|absolute filesystem path/u) {
  check(name, () => {
    const changed = close(structuredClone(baseArtifact));
    mutate(changed);
    if (!name.includes("ID drift") && !name.includes("digest drift")) close(changed);
    const path = resolve(work, `${name.replace(/[^a-z0-9]+/giu, "-")}.json`);
    writeJson(path, changed);
    assert.throws(() => verifyLegacyCalibrationMigration({ sourcePath: resolve(root, sourcePath), migrationPath: path }), pattern);
  });
}

const artifacts = checkedMigrations.map((path) => readJson(resolve(root, path)));
for (let index = 0; index < artifacts.length; index += 1) {
  const artifact = artifacts[index];
  check(`${artifact.source_authority.checkpoint} source Schema`, () => assertBenchmarkSchemaInstance(readJson(resolve(root, sources[index])), { schemaPath: resolve(root, "benchmarks/schemas/result.schema.json"), label: "legacy source" }));
  check(`${artifact.source_authority.checkpoint} migration Schema`, () => assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH), label: "migration" }));
  check(`${artifact.source_authority.checkpoint} checked migration verifies`, () => verifyLegacyCalibrationMigration({ sourcePath: resolve(root, sources[index]), migrationPath: resolve(root, checkedMigrations[index]) }));
}

const [checkpointB, checkpointB2, checkpointC] = artifacts;
check("B fixtures remain unmapped", () => assert.deepEqual(checkpointB.fixture_migrations.map(({ mapping_status, target_fixture_id }) => [mapping_status, target_fixture_id]), [["unmapped_legacy_history", null], ["unmapped_legacy_history", null]]));
check("B2 fixed mapping", () => assert.deepEqual(checkpointB2.fixture_migrations.map(({ source_fixture_id, target_fixture_id }) => [source_fixture_id, target_fixture_id]), Object.entries({ "impl-rule-batch-medium-hard": "cal-atomic-rule-batch", "impl-transfer-hard": "cal-concurrent-transfer", "pr-export-lease-hard": "cal-export-lease", "pr-session-refresh-medium-hard": "cal-session-refresh" })));
check("C fixed mapping", () => assert.deepEqual(checkpointC.fixture_migrations.map(({ source_fixture_id, target_fixture_id }) => [source_fixture_id, target_fixture_id]), checkpointB2.fixture_migrations.map(({ source_fixture_id, target_fixture_id }) => [source_fixture_id, target_fixture_id])));
check("mapped metadata comes from catalog", () => { const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json")); for (const fixture of [...checkpointB2.fixture_migrations, ...checkpointC.fixture_migrations]) assert.equal(fixture.target_fixture_metadata_digest, catalog.fixtures.find(({ fixture_id }) => fixture_id === fixture.target_fixture_id).fixture_metadata_digest); });
check("source condition closure", () => { for (const artifact of artifacts) for (const fixture of artifact.fixture_migrations) assert.deepEqual(fixture.run_projections.map(({ condition }) => condition), conditions); });
check("adaptive absence explicit", () => { for (const artifact of artifacts) for (const fixture of artifact.fixture_migrations) assert.deepEqual(fixture.missing_current_conditions, ["adaptive_ask"]); });
check("B repetition remains unrecorded", () => { for (const fixture of checkpointB.fixture_migrations) { assert.deepEqual(fixture.source_repetition_evidence, { status: "not_recorded", recorded_values: [] }); assert.ok(fixture.run_projections.every(({ repetition_evidence }) => repetition_evidence.status === "not_recorded" && repetition_evidence.value === null)); } });
check("B2/C repetition remains one", () => { for (const artifact of [checkpointB2, checkpointC]) for (const fixture of artifact.fixture_migrations) { assert.deepEqual(fixture.source_repetition_evidence.recorded_values, [1]); assert.ok(fixture.run_projections.every(({ repetition_evidence }) => repetition_evidence.value === 1)); } });
check("null effort and cost remain null", () => { for (const artifact of artifacts) for (const fixture of artifact.fixture_migrations) for (const run of fixture.run_projections) { assert.equal(run.human_effort.senior_review_minutes, null); assert.equal(run.cost_latency.usage_cost, null); } });
check("Checkpoint C attribution retained", () => assert.deepEqual(checkpointC.source_authority.checkpoint_c_attribution, readJson(resolve(root, sources[2])).attribution));
check("non-C attribution is null", () => { assert.equal(checkpointB.source_authority.checkpoint_c_attribution, null); assert.equal(checkpointB2.source_authority.checkpoint_c_attribution, null); });
check("calibration aggregate boundary", () => { for (const artifact of artifacts) { assert.equal(artifact.boundaries.calibration_only, true); assert.equal(artifact.boundaries.aggregate_eligible, false); assert.equal(artifact.boundaries.current_scoring_status, "not_scoring_ready"); } });
check("privacy projection omits answer-bearing source fields", () => { const serialized = JSON.stringify(artifacts); for (const key of ["passed_names", "failed_names", "requirement_failures", "raw_prompt", "full_agent_output", "reference_patch"]) assert.equal(serialized.includes(`\"${key}\"`), false); });
check("no current result identities", () => { const serialized = JSON.stringify(artifacts); for (const key of ["normalized_result_id", "evaluation_id", "engineering_result_id", "result_set_id", "repetition_report_id", "mechanism_observation"]) assert.equal(serialized.includes(key), false); });
check("source run digest present", () => { for (const artifact of artifacts) for (const fixture of artifact.fixture_migrations) for (const run of fixture.run_projections) assert.match(run.source_run_canonical_digest, /^sha256:[a-f0-9]{64}$/u); });
check("identity excludes timestamps beyond frozen source authority", () => assert.equal(JSON.stringify(artifacts).includes("generated_at"), false));
check("all migrations not scoring ready", () => { for (const artifact of artifacts) for (const fixture of artifact.fixture_migrations) assert.equal(fixture.current_scoring_status, "not_scoring_ready"); });

const work = mkdtempSync(resolve(root, ".ask-legacy-calibration-migration-"));
try {
  for (let index = 0; index < sources.length; index += 1) {
    const output = resolve(work, `regenerated-${index}.json`);
    migrateLegacyCalibrationResult({ sourcePath: resolve(root, sources[index]), outputPath: output });
    check(`${artifacts[index].source_authority.checkpoint} byte-identical regeneration`, () => assert.deepEqual(readFileSync(output), readFileSync(resolve(root, checkedMigrations[index]))));
  }

  verifyMutation(work, "B inferred mapping rejected", sources[0], checkpointB, (changed) => { const fixture = changed.fixture_migrations[0]; fixture.mapping_status = "mapped_calibration_fixture"; fixture.target_fixture_id = "cal-atomic-rule-batch"; fixture.target_fixture_metadata_digest = checkpointB2.fixture_migrations[0].target_fixture_metadata_digest; fixture.target_task_class = "implementation"; fixture.target_fixture_role = "calibration"; fixture.target_suite = "calibration"; fixture.target_repetitions = 3; fixture.target_aggregate_eligible = false; fixture.compatibility_status = "mapped_legacy_calibration_readable"; fixture.non_ready_reason_codes = checkpointB2.fixture_migrations[0].non_ready_reason_codes; });
  verifyMutation(work, "B2 mapping swap rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].target_fixture_id = "cal-concurrent-transfer"; });
  verifyMutation(work, "catalog metadata drift rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].target_fixture_metadata_digest = `sha256:${"0".repeat(64)}`; });
  verifyMutation(work, "source run missing rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections.pop(); });
  verifyMutation(work, "source run duplicate rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[2] = structuredClone(changed.fixture_migrations[0].run_projections[0]); });
  verifyMutation(work, "duplicate source case ID rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[1].source_case_id = changed.fixture_migrations[0].run_projections[0].source_case_id; });
  verifyMutation(work, "condition replacement rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[0].condition = "kernel_only"; });
  verifyMutation(work, "fabricated adaptive run rejected", sources[1], checkpointB2, (changed) => { const run = structuredClone(changed.fixture_migrations[0].run_projections[0]); run.condition = "adaptive_ask"; changed.fixture_migrations[0].run_projections.push(run); });
  verifyMutation(work, "fabricated repetition rejected", sources[0], checkpointB, (changed) => { changed.fixture_migrations[0].run_projections[0].repetition_evidence = { status: "recorded", value: 1 }; });
  verifyMutation(work, "null to zero rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[0].human_effort.senior_review_minutes = 0; changed.fixture_migrations[0].run_projections[0].cost_latency.usage_cost = 0; });
  verifyMutation(work, "hidden test name rejected", sources[2], checkpointC, (changed) => { changed.fixture_migrations[0].run_projections[0].outcome_quality.passed_names = ["secret answer"]; });
  verifyMutation(work, "current evaluator identity rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[0].evaluation_id = "evaluation-fabricated"; });
  verifyMutation(work, "compatibility contradiction rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].compatibility_status = "unmapped_legacy_history_readable"; });
  verifyMutation(work, "reason order rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].non_ready_reason_codes.reverse(); });
  verifyMutation(work, "duplicate reason rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].non_ready_reason_codes.push(changed.fixture_migrations[0].non_ready_reason_codes[0]); });
  verifyMutation(work, "unknown nested property rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].run_projections[0].unexpected = true; });
  verifyMutation(work, "absolute path rejected", sources[1], checkpointB2, (changed) => { changed.fixture_migrations[0].source_fixture_id = "/private/source"; });
  check("migration ID drift rejected", () => { const changed = structuredClone(checkpointB2); changed.migration_id = `legacy-calibration-migration-${"0".repeat(32)}`; const path = resolve(work, "id-drift.json"); writeJson(path, changed); assert.throws(() => verifyLegacyCalibrationMigration({ sourcePath: resolve(root, sources[1]), migrationPath: path }), /ID drift/u); });
  check("migration digest drift rejected", () => { const changed = structuredClone(checkpointB2); changed.migration_digest = `sha256:${"0".repeat(64)}`; const path = resolve(work, "digest-drift.json"); writeJson(path, changed); assert.throws(() => verifyLegacyCalibrationMigration({ sourcePath: resolve(root, sources[1]), migrationPath: path }), /digest drift/u); });

  const customRoot = copyAuthorityRoot(work, sources[1]);
  const customSource = resolve(customRoot, sources[1]);
  const originalDigest = sha256(readFileSync(customSource));
  check("custom root explicit immutable digest", () => { const output = resolve(work, "custom-valid.json"); migrateLegacyCalibrationResult({ root: customRoot, sourcePath: customSource, outputPath: output, expectedSourceRawByteDigest: originalDigest }); });
  check("custom root without digest rejected", () => assert.throws(() => migrateLegacyCalibrationResult({ root: customRoot, sourcePath: customSource, outputPath: resolve(work, "custom-missing-digest.json") }), /explicit immutable raw-byte digest/u));
  writeFileSync(customSource, Buffer.concat([readFileSync(customSource), Buffer.from("\n")]));
  check("source byte modification rejected", () => assert.throws(() => migrateLegacyCalibrationResult({ root: customRoot, sourcePath: customSource, outputPath: resolve(work, "custom-byte-modified.json"), expectedSourceRawByteDigest: originalDigest }), /raw-byte digest/u));
  cpSync(resolve(root, sources[1]), customSource);
  const changedSource = readJson(customSource); changedSource.runtime.reasoning_effort = "low"; writeJson(customSource, changedSource);
  check("source semantic modification after reseal rejected", () => assert.throws(() => migrateLegacyCalibrationResult({ root: customRoot, sourcePath: customSource, outputPath: resolve(work, "custom-modified.json"), expectedSourceRawByteDigest: originalDigest }), /raw-byte digest/u));
  changedSource.checkpoint = "C"; writeJson(customSource, changedSource);
  check("checkpoint source path mismatch rejected", () => assert.throws(() => migrateLegacyCalibrationResult({ root: customRoot, sourcePath: customSource, outputPath: resolve(work, "custom-checkpoint.json"), expectedSourceRawByteDigest: sha256(readFileSync(customSource)) }), /Schema validation|checkpoint/u));

  check("pre-existing output rejected", () => { const output = resolve(work, "existing.json"); writeFileSync(output, "existing\n"); assert.throws(() => migrateLegacyCalibrationResult({ sourcePath: resolve(root, sources[1]), outputPath: output }), /must not already exist/u); });
  check("output symlink rejected", () => { const target = resolve(work, "target.json"); const link = resolve(work, "link.json"); writeFileSync(target, "target\n"); symlinkSync(target, link); assert.throws(() => migrateLegacyCalibrationResult({ sourcePath: resolve(root, sources[1]), outputPath: link }), /symlink/u); });
  check("source output overlap rejected", () => assert.throws(() => migrateLegacyCalibrationResult({ sourcePath: resolve(root, sources[1]), outputPath: resolve(root, sources[1]) }), /must not already exist|disjoint/u));
  const sourceBefore = readFileSync(resolve(root, sources[1]));
  check("failed publication source unchanged", () => { const output = resolve(work, "failed-existing.json"); writeFileSync(output, "occupied\n"); assert.throws(() => migrateLegacyCalibrationResult({ sourcePath: resolve(root, sources[1]), outputPath: output })); assert.deepEqual(readFileSync(resolve(root, sources[1])), sourceBefore); });

  const concurrentOutput = resolve(work, "concurrent.json");
  const concurrent = await Promise.all([launchChild(["--migrate-child", resolve(root, sources[1]), concurrentOutput]), launchChild(["--migrate-child", resolve(root, sources[1]), concurrentOutput])]);
  check("concurrent publication exactly one success", () => assert.deepEqual(concurrent.map(({ status }) => status).sort((left, right) => left - right), [0, 1]));
  check("concurrent winner valid", () => verifyLegacyCalibrationMigration({ sourcePath: resolve(root, sources[1]), migrationPath: concurrentOutput }));
  check("no staging residue", () => assert.equal(readdirSync(work).some((name) => name.startsWith(`.${basename(concurrentOutput)}.staging-`)), false));

  async function replacement(name, replacementBytes) {
    const input = resolve(work, `${name}.json`); const replacementPath = resolve(work, `${name}-replacement.json`); const marker = resolve(work, `${name}.marker`); const proceed = resolve(work, `${name}.continue`);
    writeFileSync(input, "original\n"); writeFileSync(replacementPath, replacementBytes);
    const outcome = launchChild(["--stable-child", input, marker, proceed]);
    await waitForFile(marker); renameSync(replacementPath, input); writeFileSync(proceed, "continue\n", { flag: "wx" });
    return outcome;
  }
  const different = await replacement("different-bytes", "different\n");
  check("different-byte replacement rejected", () => { assert.notEqual(different.status, 0); assert.match(different.stderr, /changed or was replaced|path was replaced/u); });
  const same = await replacement("same-bytes", "original\n");
  check("same-byte different-inode replacement rejected", () => { assert.notEqual(same.status, 0); assert.match(same.stderr, /changed or was replaced|path was replaced/u); });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const implementation = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-legacy-calibration-migration.mjs"), "utf8");
check("shared stable read reused", () => assert.match(implementation, /readStableFile/u));
check("shared stable evidence reused", () => assert.match(implementation, /assertStableFileEvidence/u));
check("shared atomic no-replace reused", () => assert.match(implementation, /publishJsonAtomicNoReplace/u));
check("shared atomic absence reused", () => assert.match(implementation, /assertAtomicOutputAbsent/u));
check("no legacy reread after verification", () => { const body = implementation.slice(implementation.indexOf("export function verifyLegacyCalibrationMigration")); assert.equal((body.match(/readStableFile\(absoluteSource/gu) ?? []).length, 0); });

assert.ok(covered.size >= 55, `expected at least 55 focused closures, received ${covered.size}`);
console.log(`Portfolio legacy calibration migration contract test passed (${covered.size} closures).`);

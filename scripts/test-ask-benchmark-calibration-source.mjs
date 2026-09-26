import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CALIBRATION_INPUT_MANIFEST_SHA256, CALIBRATION_SOURCE_BINDINGS, resolvePortfolioFixtureSource, assertSuccessorCalibrationConfig } from "./ask-benchmark-calibration-source.mjs";
import { computeVerificationCommandContractDigest } from "./ask-benchmark-command-evidence.mjs";
import { computeIndependenceStatementDigest, deriveEvaluatorAuthorityManifest, evaluatorAuthorityPathsForFixture, validateEvaluatorAuthorityManifest, validateIndependenceStatement } from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { computeRequirementRecordDigest, computeRequirementSetDigest } from "./ask-benchmark-scoring-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedInputPath = "benchmarks/fixtures/checkpoint-b2/input-manifest.json";
const sharedInputBytes = readFileSync(resolve(root, sharedInputPath));
const sharedInput = JSON.parse(sharedInputBytes);
const sharedInputDigest = `sha256:${createHash("sha256").update(sharedInputBytes).digest("hex")}`;
const evaluatorRevision = "b".repeat(40);

function syntheticAuthorityBuffers(fixtureId) {
  const fixtureRoot = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
  const evidence = { fixture_id: fixtureId, maps: [{ evidence_map_id: "synthetic-evidence" }] };
  const command = { fixture_id: fixtureId, commands: [] };
  command.contract_digest = computeVerificationCommandContractDigest(command);
  const requirement = { fixture_id: fixtureId, requirements: [{ requirement_id: "synthetic-requirement", evidence_map_ids: ["synthetic-evidence"] }] };
  requirement.requirement_set_digest = computeRequirementSetDigest(requirement);
  requirement.requirement_record_digest = computeRequirementRecordDigest(requirement);
  return new Map([
    [sharedInputPath, sharedInputBytes],
    [`${fixtureRoot}/evidence-map.json`, Buffer.from(JSON.stringify(evidence))],
    [`${fixtureRoot}/verification-command-contract.json`, Buffer.from(JSON.stringify(command))],
    [`${fixtureRoot}/requirement-record.json`, Buffer.from(JSON.stringify(requirement))],
  ]);
}

const source = () => ({ fixture_root: "benchmarks/fixtures/checkpoint-b2", fixtures: CALIBRATION_SOURCE_BINDINGS.map(([id, source_fixture_id, task_class, repetitions]) => ({ id, source_fixture_id, task_class, repetitions, suite: "calibration", aggregate_eligible: false, input_manifest_path: "benchmarks/fixtures/checkpoint-b2/input-manifest.json", input_manifest_sha256: CALIBRATION_INPUT_MANIFEST_SHA256 })) });

test("ordinary fixtures keep their existing physical identity", () => {
  for (const id of ["original-fixture", "pr-session-refresh-medium-hard"]) assert.equal(resolvePortfolioFixtureSource({ id }), id);
});
for (const [id, physical, task, count] of CALIBRATION_SOURCE_BINDINGS) {
  test(`${id} explicitly resolves its unchanged source input`, () => {
    const fixture = { id, source_fixture_id: physical, task_class: task, repetitions: count, suite: "calibration", aggregate_eligible: false };
    const before = structuredClone(fixture);
    assert.equal(resolvePortfolioFixtureSource(fixture), physical);
    assert.deepEqual(fixture, before);
  });
}
for (const [field, value] of [
  ["id", "primary-unrelated"], ["source_fixture_id", "../outside"],
  ["source_fixture_id", "pr-export-lease-hard"], ["source_fixture_id", null],
  ["suite", "high_impact"], ["aggregate_eligible", true], ["task_class", "implementation"], ["repetitions", 5],
]) test(`source aliases reject ${field}=${value}`, () => {
  const f = source().fixtures[0]; f[field] = value;
  assert.throws(() => resolvePortfolioFixtureSource(f));
});
test("the complete canonical config preserves four sources and 3/3/3/5 repetitions", () => {
  const config = source(); const before = structuredClone(config);
  assert.equal(assertSuccessorCalibrationConfig(config, { inputManifestDigest: CALIBRATION_INPUT_MANIFEST_SHA256 }), config);
  assert.deepEqual(config, before);
});
for (const [label, edit] of [
  ["missing", c => c.fixtures.pop()], ["extra", c => c.fixtures.push(c.fixtures[0])],
  ["duplicate", c => c.fixtures[1] = c.fixtures[0]], ["reordered", c => c.fixtures.reverse()],
  ["manifest drift", c => c.fixtures[0].input_manifest_sha256 = "b".repeat(64)],
  ["source relocation", c => c.fixture_root = "other"],
  ["unregistered manifest", c => c.fixtures[0].input_manifest_path = "other.json"],
]) test(`pre-result inventory rejects ${label}`, () => {
  const config = source(); edit(config);
  assert.throws(() => assertSuccessorCalibrationConfig(config, { inputManifestDigest: CALIBRATION_INPUT_MANIFEST_SHA256 }));
});
test("mapping entries cannot be mutated through shared imports", () => {
  assert.ok(Object.isFrozen(CALIBRATION_SOURCE_BINDINGS));
  assert.ok(CALIBRATION_SOURCE_BINDINGS.every(Object.isFrozen));
});

for (const [fixtureId, sourceId] of CALIBRATION_SOURCE_BINDINGS) {
  test(`${fixtureId} derives and verifies authority from the unchanged shared input`, () => {
    const buffers = syntheticAuthorityBuffers(fixtureId);
    const layout = evaluatorAuthorityPathsForFixture(fixtureId);
    assert.equal(layout.bindingPaths[0], sharedInputPath);
    const manifest = deriveEvaluatorAuthorityManifest({ buffers, evaluatorRevision, fixtureId });
    assert.equal(manifest.file_inventory[0].raw_sha256, sharedInputDigest);
    assert.equal(manifest.file_inventory[0].semantic_fixture_entry_digest, canonicalDigest(sharedInput.fixtures[sourceId]));
    assert.deepEqual(manifest.file_inventory.map(({ path }) => path), layout.bindingPaths);
    assert.deepEqual(validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision, root }), manifest);
  });
}

test("calibration authority rejects another fixture entry, manifest path, and catalog metadata", () => {
  const [fixtureId, sourceId] = CALIBRATION_SOURCE_BINDINGS[0];
  const original = syntheticAuthorityBuffers(fixtureId);
  const wrongEntry = new Map(original);
  const input = structuredClone(sharedInput);
  input.fixtures[sourceId] = input.fixtures[CALIBRATION_SOURCE_BINDINGS[1][1]];
  wrongEntry.set(sharedInputPath, Buffer.from(JSON.stringify(input)));
  assert.throws(() => deriveEvaluatorAuthorityManifest({ buffers: wrongEntry, evaluatorRevision, fixtureId }), /input manifest|source|identity/u);

  const wrongPath = new Map(original);
  wrongPath.delete(sharedInputPath);
  wrongPath.set(`benchmarks/fixtures/checkpoint-b2/${fixtureId}/input-manifest.json`, sharedInputBytes);
  assert.throws(() => deriveEvaluatorAuthorityManifest({ buffers: wrongPath, evaluatorRevision, fixtureId }), /omission|input manifest/u);

  const wrongMetadata = new Map(original);
  wrongMetadata.set(`benchmarks/fixtures/checkpoint-b2/${fixtureId}/evidence-map.json`, Buffer.from(JSON.stringify({ fixture_id: CALIBRATION_SOURCE_BINDINGS[1][0], maps: [{ evidence_map_id: "synthetic-evidence" }] })));
  assert.throws(() => deriveEvaluatorAuthorityManifest({ buffers: wrongMetadata, evaluatorRevision, fixtureId }), /fixture identity/u);

  const extraInput = new Map(original);
  extraInput.set("benchmarks/fixtures/checkpoint-b2/unrelated/evidence-map.json", Buffer.from("{}"));
  assert.throws(() => deriveEvaluatorAuthorityManifest({ buffers: extraInput, evaluatorRevision, fixtureId }), /addition/u);

  const validManifest = deriveEvaluatorAuthorityManifest({ buffers: original, evaluatorRevision, fixtureId });
  const changedInput = new Map(original);
  changedInput.set(sharedInputPath, Buffer.from(`${sharedInputBytes.toString("utf8")} `));
  assert.throws(() => validateEvaluatorAuthorityManifest({ manifest: validManifest, buffers: changedInput, evaluatorRevision, root }), /digest changed/u);
});

test("ordinary evaluator authority retains per-fixture input and catalog entry", () => {
  const fixtureId = "primary-synthetic";
  const buffers = syntheticAuthorityBuffers(fixtureId);
  buffers.delete(sharedInputPath);
  const inputPath = `benchmarks/fixtures/checkpoint-b2/${fixtureId}/input-manifest.json`;
  buffers.set(inputPath, Buffer.from(JSON.stringify({ fixtures: { [fixtureId]: { files: [] } } })));
  const manifest = deriveEvaluatorAuthorityManifest({ buffers, evaluatorRevision });
  assert.equal(manifest.file_inventory[0].path, inputPath);
  assert.deepEqual(validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision, root }), manifest);
});

function calibrationIndependence(fixtureId, sourcePath = sharedInputPath) {
  const bytes = readFileSync(resolve(root, sourcePath));
  const generator = { id: "calibration-test-generator", version: "1", source_digest: sharedInputDigest };
  const base = {
    schema_version: "1.1.0", fixture_id: fixtureId, generator_role_identity: generator,
    generation_date: "2026-09-26", generation_revision: "b".repeat(40),
    frozen_candidate_input: { public_source_path: sourcePath,
      raw_byte_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      digest: canonicalDigest(JSON.parse(bytes)) },
    source_classification: ["frozen_agent_visible_fixture"],
    excluded_source_classification: ["public_answer_sources"],
    measured_output_used: false, measured_result_used: false,
    author_scratch: { used: false, scope: "test", contamination_assessment: { state: "not_used", evidence_basis: "test" } },
    contaminated_issues_193_196_as_oracle_source: { state: "not_used", evidence_basis: "test" },
    issue_194_body_used: { state: "not_used", evidence_basis: "test" },
    issue_194_edit_history_used: { state: "not_used", evidence_basis: "test" },
    issue_194_legacy_answer_structure_used: { state: "not_used", evidence_basis: "test" },
  };
  const statement = { ...base, statement_digest: computeIndependenceStatementDigest(base) };
  const manifest = { fixture_identity: { fixture_id: fixtureId }, generator,
    evaluator_revision: base.generation_revision,
    input_identity: { fixture_input_digest: statement.frozen_candidate_input.raw_byte_digest },
    independence: { statement_digest: statement.statement_digest,
      public_answer_sources_used: false, generated_without_agent_output: true,
      measured_agent_access_allowed: false } };
  return { statement, manifest };
}

for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
  test(`${fixtureId} private independence binds the shared source entry`, () => {
    const pair = calibrationIndependence(fixtureId);
    assert.equal(validateIndependenceStatement({ ...pair, root }).fixture_id, fixtureId);
  });
}

test("calibration private independence rejects another public source path", () => {
  const pair = calibrationIndependence("cal-session-refresh", "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/input-manifest.json");
  assert.throws(() => validateIndependenceStatement({ ...pair, root }), /calibration input source path mismatch/u);
});

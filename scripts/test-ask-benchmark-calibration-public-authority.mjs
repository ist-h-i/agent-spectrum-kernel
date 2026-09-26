import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { validateRequirementRecordContract } from "./ask-benchmark-scoring-contract.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { CALIBRATION_REQUIREMENTS, calibrationPublicSource, buildCalibrationEvidenceAuthority, buildCalibrationRequirementRecord, buildCalibrationCommandContract, validateCalibrationPrivateMutationAuthority, buildPendingCalibrationCandidate, buildPendingCalibrationPublicArtifacts } from "./ask-benchmark-calibration-public-authority.mjs";

test("four calibration descriptors close against frozen source inputs and full private mutation digests", () => {
  const before = readFileSync("benchmarks/fixtures/checkpoint-b2/input-manifest.json");
  for (const [fixtureId, sourceId, , repetitions] of CALIBRATION_SOURCE_BINDINGS) {
    const source = calibrationPublicSource({ fixtureId });
    assert.equal(source.sourceId, sourceId);
    assert.equal(repetitions, fixtureId === "cal-concurrent-transfer" ? 5 : 3);
    assert.deepEqual(source.requirements.map(([, weight]) => weight), [4, 3, 2, 1]);
    const { evidenceMap, mutationAsset } = buildCalibrationEvidenceAuthority(source);
    assert.deepEqual(validateCalibrationPrivateMutationAuthority(source, mutationAsset), mutationAsset);
    const mutated = structuredClone(mutationAsset);
    mutated.mutations[0].remove_paths = ["task.md"];
    assert.throws(() => validateCalibrationPrivateMutationAuthority(source, mutated), /differs from frozen public requirement evidence/u);
    assert.equal(evidenceMap.maps.length, 4);
    assert.equal(mutationAsset.mutations.length, 4);
    for (const [index, mutation] of mutationAsset.mutations.entries()) {
      const { mutation_digest, ...fullBase } = mutation;
      assert.equal(mutation_digest, canonicalDigest(fullBase));
      assert.equal(evidenceMap.mutation_contracts[index].mutation_digest, mutation_digest);
      assert.equal(evidenceMap.mutation_contracts[index].requirement_id, undefined);
      assert.deepEqual(mutation.remove_paths, evidenceMap.maps[index].agent_visible_paths);
      assert.ok(mutation.remove_paths.every(path => source.visiblePaths.includes(path)));
      assert.notEqual(mutation_digest, canonicalDigest(evidenceMap.mutation_contracts[index]));
    }
    const command = buildCalibrationCommandContract(source);
    assert.equal(command.fixture_input_digest, source.inputDigest);
    assert.deepEqual(command.commands[0].safe_argv, ["npm", "test"]);
    const record = buildCalibrationRequirementRecord(source, {
      catalogDigest: canonicalDigest("catalog"), policyManifestDigest: canonicalDigest("policy"),
      scoringPolicyDigest: canonicalDigest("scoring"), admissionRequirementDigest: canonicalDigest("admission"),
    });
    assert.equal(record.requirements.length, 4);
    assert.deepEqual(record.requirements.map(({ evidence_map_ids }) => evidence_map_ids[0]), evidenceMap.maps.map(({ evidence_map_id }) => evidence_map_id));
    assert.deepEqual(record.requirements.map(({ mutation_ids }) => mutation_ids[0]), mutationAsset.mutations.map(({ mutation_id }) => mutation_id));
  }
  assert.deepEqual(readFileSync("benchmarks/fixtures/checkpoint-b2/input-manifest.json"), before);
  assert.deepEqual(Object.keys(CALIBRATION_REQUIREMENTS).sort(), CALIBRATION_SOURCE_BINDINGS.map(([id]) => id).sort());
});

test("unregistered fixture cannot acquire a public authority descriptor", () => {
  assert.throws(() => calibrationPublicSource({ fixtureId: "cal-unknown" }), /unknown calibration fixture/u);
});

test("public requirements close against real scoring schema; synthetic candidate cannot publish", () => {
  const catalog = JSON.parse(readFileSync("benchmarks/portfolio-catalog.json"));
  const policy = JSON.parse(readFileSync("benchmarks/portfolio-policy-manifest.json"));
  const scoring = JSON.parse(readFileSync("benchmarks/portfolio-scoring-policy.json"));
  const requirementSchema = JSON.parse(readFileSync("benchmarks/schemas/portfolio-requirement-record.schema.json"));
  const resultSchema = JSON.parse(readFileSync("benchmarks/schemas/evaluator-result-envelope.schema.json"));
  for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
    const source = calibrationPublicSource({ fixtureId });
    const record = buildCalibrationRequirementRecord(source, { catalogDigest: catalog.catalog_digest,
      policyManifestDigest: policy.manifest_digest, scoringPolicyDigest: scoring.policy_digest,
      admissionRequirementDigest: canonicalDigest("pending-test-only") });
    assertBenchmarkSchemaInstance(record, { schemaPath: "benchmarks/schemas/portfolio-requirement-record.schema.json", label: "calibration requirement" });
    validateRequirementRecordContract({ scoringPolicy: scoring, requirementRecord: record, requirementRecordSchema: requirementSchema, evaluatorResultSchema: resultSchema });
  }
  assert.throws(() => buildPendingCalibrationCandidate({ fixtureId: "cal-session-refresh", privateAuthority: {} }), /complete private calibration candidate/u);
  assert.throws(() => buildPendingCalibrationPublicArtifacts({ admissionBase: { admission_status: "admission_pending" }, bundle: { review: { status: "pending" } } }), /verified pending candidate authority/u);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { validateRequirementRecordContract } from "./ask-benchmark-scoring-contract.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { CALIBRATION_REQUIREMENTS, calibrationPublicSource, buildCalibrationEvidenceAuthority, validateCalibrationCandidateChangedPaths, buildCalibrationRequirementRecord, buildCalibrationCommandContract, validateCalibrationPrivateMutationAuthority, buildPendingCalibrationCandidate, buildPendingCalibrationPublicArtifacts, buildCalibrationEquivalenceAuthority, assertCalibrationPrivateAssets, calibrationOutputKind } from "./ask-benchmark-calibration-public-authority.mjs";

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
    const unsupportedPromotion = structuredClone(mutationAsset);
    unsupportedPromotion.mutations[0].expected_recoverability_state = "not_recoverable";
    assert.throws(() => validateCalibrationPrivateMutationAuthority(source, unsupportedPromotion), /differs from frozen public requirement evidence/u);
    assert.equal(evidenceMap.maps.length, 4);
    assert.equal(mutationAsset.mutations.length, 4);
    for (const [index, mutation] of mutationAsset.mutations.entries()) {
      const { mutation_digest, ...fullBase } = mutation;
      assert.equal(mutation_digest, canonicalDigest(fullBase));
      assert.equal(mutation.expected_recoverability_state, "ambiguous");
      assert.equal(evidenceMap.mutation_contracts[index].expected_recoverability_state, "ambiguous");
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

test("private mutation and equivalence bytes close to manifest role, path, size, and digest", () => {
  const source = calibrationPublicSource({ fixtureId: "cal-concurrent-transfer" });
  const mutationBytes = Buffer.from(JSON.stringify(buildCalibrationEvidenceAuthority(source).mutationAsset));
  const equivalenceBytes = Buffer.from(JSON.stringify(buildCalibrationEquivalenceAuthority(source)));
  const asset = (role, path, bytes) => ({ role, path, bytes: bytes.length, sha256: "sha256:" + createHash("sha256").update(bytes).digest("hex") });
  const bundle = { asset_inventory: [
    asset("evidence_removal_mutations", "evidence-removal-mutations.json", mutationBytes),
    asset("equivalent_solution_rules", "equivalent-solutions.json", equivalenceBytes),
  ] };
  const input = { bundle, mutationBytes, equivalenceBytes };
  const verified = assertCalibrationPrivateAssets(source, input);
  assert.deepEqual(Object.keys(verified).sort(), ["equivalence", "equivalence_digest", "mutation", "mutation_digest"].sort());
  assert.equal(JSON.stringify(verified).includes("remove_paths"), false);
  assert.throws(() => assertCalibrationPrivateAssets(source, { ...input, mutationBytes: undefined }), /actual private calibration asset bytes/u);
  assert.throws(() => assertCalibrationPrivateAssets(source, { ...input, mutationBytes: Buffer.from("{}") }), /byte identity drift/u);
  const wrongRole = structuredClone(bundle);
  wrongRole.asset_inventory[0].role = "oracle";
  assert.throws(() => assertCalibrationPrivateAssets(source, { ...input, bundle: wrongRole }), /role or path/u);
  const wrongPath = structuredClone(bundle);
  wrongPath.asset_inventory[0].path = "other.json";
  assert.throws(() => assertCalibrationPrivateAssets(source, { ...input, bundle: wrongPath }), /role or path/u);
  const transplanted = calibrationPublicSource({ fixtureId: "cal-atomic-rule-batch" });
  assert.throws(() => assertCalibrationPrivateAssets(transplanted, input), /semantics differ/u);
  const duplicateKey = Buffer.from('{"fixture_id":"cal-concurrent-transfer","fixture_id":"cal-concurrent-transfer","mutations":[]}');
  const duplicateBundle = structuredClone(bundle);
  duplicateBundle.asset_inventory[0] = asset("evidence_removal_mutations", "evidence-removal-mutations.json", duplicateKey);
  assert.throws(() => assertCalibrationPrivateAssets(source, { bundle: duplicateBundle, mutationBytes: duplicateKey, equivalenceBytes }), /duplicate JSON object key/u);
  const drift = Buffer.from(JSON.stringify({ fixture_id: source.fixtureId, mutations: [] }));
  const altered = structuredClone(bundle);
  altered.asset_inventory[0] = asset("evidence_removal_mutations", "evidence-removal-mutations.json", drift);
  assert.throws(() => assertCalibrationPrivateAssets(source, { bundle: altered, mutationBytes: drift, equivalenceBytes }), /semantics differ/u);
});

test("fixture scope is task-specific and implementation output is not findings", () => {
  for (const fixtureId of ["cal-session-refresh", "cal-export-lease"]) {
    const source = calibrationPublicSource({ fixtureId });
    const scope = buildCalibrationEvidenceAuthority(source).evidenceMap.scope_boundary_authority;
    assert.deepEqual(scope.allowed_candidate_paths, []);
    assert.deepEqual(scope.required_candidate_paths, []);
    assert.deepEqual(scope.allowed_new_candidate_path_prefixes, []);
    assert.deepEqual(scope.required_changed_candidate_path_prefixes, []);
    assert.equal(validateCalibrationCandidateChangedPaths(source, []), true);
    assert.ok(scope.protected_candidate_paths.includes("workspace/package.json"));
    assert.deepEqual(calibrationOutputKind(source), { declares_findings: true, output_contract_type: "findings_producing" });
  }
  for (const [fixtureId, expectedService, forbidden] of [
    ["cal-atomic-rule-batch", "workspace/src/rule-service.mjs", "workspace/docs/rule-batches.md"],
    ["cal-concurrent-transfer", "workspace/src/transfer-service.mjs", "workspace/src/serial-executor.mjs"],
  ]) {
    const source = calibrationPublicSource({ fixtureId });
    const scope = buildCalibrationEvidenceAuthority(source).evidenceMap.scope_boundary_authority;
    assert.ok(scope.allowed_candidate_paths.includes(expectedService));
    assert.ok(scope.required_candidate_paths.includes(expectedService));
    assert.ok(scope.allowed_new_candidate_path_prefixes.includes("workspace/test/"));
    assert.ok(scope.required_changed_candidate_path_prefixes.includes("workspace/test/"));
    assert.equal(scope.required_candidate_paths.some(path => path.startsWith("workspace/test/")), false);
    assert.ok(scope.protected_candidate_paths.includes(forbidden));
    for (const path of ["workspace/package.json", forbidden]) assert.equal(scope.allowed_candidate_paths.includes(path), false);
    assert.deepEqual(calibrationOutputKind(source), { declares_findings: false, output_contract_type: "implementation_producing" });
  }
});

test("calibration change scope permits new tests and rejects unmanaged changes", () => {
  for (const [fixtureId, service, existingTest] of [
    ["cal-atomic-rule-batch", "rule-service", "rule-service.test.mjs"],
    ["cal-concurrent-transfer", "transfer-service", "transfer-service.test.mjs"],
  ]) {
    const source = calibrationPublicSource({ fixtureId });
    const required = ["workspace/src/index.mjs", `workspace/src/${service}.mjs`]
      .map(path => ({ path, operation: "modify" }));
    assert.throws(() => validateCalibrationCandidateChangedPaths(source, required), /misses required changed-path prefix/u);
    assert.equal(validateCalibrationCandidateChangedPaths(source, [...required,
      { path: `workspace/test/${service}-new.test.mjs`, operation: "add" },
      { path: `workspace/test/nested/${service}.test.mjs`, operation: "add" },
      { path: `workspace/test/${existingTest}`, operation: "modify" }]), true);
    for (const entry of [
      { path: "workspace/package.json", operation: "modify" },
      { path: "workspace/docs/new.md", operation: "add" },
      { path: "workspace/src/new-module.mjs", operation: "add" },
      { path: "workspace/src/serial-executor.mjs", operation: "modify" },
      { path: "workspace/test/../src/new-module.mjs", operation: "add" },
      { path: "workspace/test/./new.test.mjs", operation: "add" },
      { path: "workspace/test//new.test.mjs", operation: "add" },
      { path: "workspace/test\\new.test.mjs", operation: "add" },
      { path: "workspace/test/", operation: "add" },
      { path: `workspace/test/${existingTest}`, operation: "add" },
      { path: `workspace/test/${existingTest}`, operation: "delete" },
    ]) {
      assert.throws(() => validateCalibrationCandidateChangedPaths(source, [...required, entry]), /calibration (candidate change exceeds frozen scope|changed path)/u);
    }
    assert.throws(() => validateCalibrationCandidateChangedPaths(source, [required[0]]), /misses required changed paths/u);
    assert.throws(() => validateCalibrationCandidateChangedPaths(source, [...required, required[0]]), /invalid calibration changed path/u);
  }
  const review = calibrationPublicSource({ fixtureId: "cal-session-refresh" });
  assert.throws(() => validateCalibrationCandidateChangedPaths(review,
    [{ path: "workspace/test/new.test.mjs", operation: "add" }]), /exceeds frozen scope/u);
});

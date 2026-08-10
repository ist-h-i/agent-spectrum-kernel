#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_ROOT_RELATIVE,
  validateActualPrivateEvaluator,
  validateMnDocConfigCorrectionPublicFixture,
} from "./ask-benchmark-mn-doc-config-correction.mjs";
import {
  computeEvaluatorReferenceDigest,
  deriveEvaluatorAuthorityManifest,
  evaluatorAuthorityPathsForFixture,
  validateEvaluatorAuthorityManifest,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { buildPortfolioPlan, resolvePortfolioExecutionAdmission } from "./ask-benchmark-plan.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { validateEquivalenceAuthority, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const work = mkdtempSync(resolve(tmpdir(), "ask-mn-doc-config-correction-"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function validationRoot(name) {
  const target = resolve(work, name);
  mkdirSync(resolve(target, "benchmarks/fixtures/checkpoint-b2"), { recursive: true });
  mkdirSync(resolve(target, "benchmarks/schemas"), { recursive: true });
  cpSync(fixtureRoot, resolve(target, FIXTURE_ROOT_RELATIVE), { recursive: true });
  cpSync(resolve(root, "benchmarks/adaptive-portfolio.config.json"), resolve(target, "benchmarks/adaptive-portfolio.config.json"));
  cpSync(resolve(root, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"), resolve(target, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"));
  return target;
}

function rejectsPublicMutation(name, mutate, pattern) {
  const target = validationRoot(name);
  mutate(target);
  assert.throws(() => validateMnDocConfigCorrectionPublicFixture({ root: target }), pattern, name);
}

function authorityBuffers(fixtureId) {
  const { bindingPaths } = evaluatorAuthorityPathsForFixture(fixtureId);
  return new Map(bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
}

function executionAdmissionRoot(name) {
  const target = resolve(work, `execution-${name}`);
  mkdirSync(resolve(target, "benchmarks/fixtures/checkpoint-b2"), { recursive: true });
  mkdirSync(resolve(target, "benchmarks/fixtures/admission-decision"), { recursive: true });
  cpSync(resolve(root, "benchmarks/schemas"), resolve(target, "benchmarks/schemas"), { recursive: true });
  cpSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update"), resolve(target, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update"), { recursive: true });
  cpSync(fixtureRoot, resolve(target, FIXTURE_ROOT_RELATIVE), { recursive: true });
  cpSync(resolve(root, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"), resolve(target, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"));
  return target;
}

function boundaryRoots(name) {
  const base = resolve(work, `boundaries-${name}`);
  const roots = {
    materializedPath: resolve(base, "materialized"),
    selectionState: resolve(base, "selection"),
    runDir: resolve(base, "run"),
    normalizedResultsPath: resolve(base, "normalized"),
  };
  for (const path of Object.values(roots)) mkdirSync(path, { recursive: true });
  writeJson(resolve(roots.materializedPath, "materialization-manifest.json"), {});
  writeJson(resolve(roots.selectionState, "selection-state.json"), {});
  writeJson(resolve(roots.runDir, "run-identity.json"), {});
  writeJson(resolve(roots.normalizedResultsPath, "normalized-results-root.json"), {});
  return roots;
}

try {
  const productionAuthority = existsSync(resolve(fixtureRoot, "evaluator-reference.json"));
  const summary = validateMnDocConfigCorrectionPublicFixture({ root });
  assert.equal(summary.scoringReady, false);

  const config = readJson(resolve(root, "benchmarks/adaptive-portfolio.config.json"));
  const candidateFixture = config.fixtures.find(({ id }) => id === "mn-doc-config-correction");
  const fixtureOne = config.fixtures.find(({ id }) => id === "mn-build-option-update");
  assert.equal(resolvePortfolioExecutionAdmission({ root, fixture: candidateFixture }).execution_eligible, false, "source-freeze candidate must remain outside measured execution");
  assert.equal(resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne }).execution_eligible, true, "admitted fixture #1 must remain execution-eligible");
  const focusedPlan = buildPortfolioPlan({ root, config: { ...config, _configPath: resolve(root, "benchmarks/adaptive-portfolio.config.json"), _protocolPath: resolve(root, config.protocol_path) }, repositoryRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), seed: "mn-doc-pre-admission-gate" });
  assert.equal(focusedPlan.cases.some(({ fixture_id }) => fixture_id === "mn-doc-config-correction"), false, "source-freeze candidate must not enter the execution plan");
  assert.equal(focusedPlan.cases.some(({ fixture_id }) => fixture_id === "mn-build-option-update"), true, "admitted fixture #1 must remain in the execution plan");

  const forgedMarkerRoot = executionAdmissionRoot("forged-marker");
  const forgedMarkerPath = resolve(forgedMarkerRoot, FIXTURE_ROOT_RELATIVE, "source-freeze-candidate.json");
  const forgedMarker = readJson(forgedMarkerPath);
  forgedMarker.admission_state = "admitted";
  forgedMarker.candidate_state = "source_frozen";
  writeJson(forgedMarkerPath, forgedMarker);
  assert.equal(resolvePortfolioExecutionAdmission({ root: forgedMarkerRoot, fixture: candidateFixture }).execution_eligible, false, "marker-only admission forgery must not enable execution");

  for (const [name, missing] of [["missing-reference", "evaluator-reference.json"], ["missing-final-admission", "final-admission-record.json"]]) {
    const target = executionAdmissionRoot(name);
    rmSync(resolve(target, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update", missing));
    assert.equal(resolvePortfolioExecutionAdmission({ root: target, fixture: fixtureOne }).execution_eligible, false, `${name} must fail closed`);
  }
  const pendingRoot = executionAdmissionRoot("admission-pending");
  rmSync(resolve(pendingRoot, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"));
  assert.equal(resolvePortfolioExecutionAdmission({ root: pendingRoot, fixture: fixtureOne }).execution_eligible, false, "admission_pending without an effective overlay must fail closed");

  const transplantRoot = executionAdmissionRoot("cross-fixture-transplant");
  const transplantFixtureRoot = resolve(transplantRoot, FIXTURE_ROOT_RELATIVE);
  for (const name of ["final-admission-record.json", "requirement-record.json", "evaluator-reference.json", "scoring-input-freeze-manifest.json"]) cpSync(resolve(transplantRoot, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update", name), resolve(transplantFixtureRoot, name));
  assert.throws(() => resolvePortfolioExecutionAdmission({ root: transplantRoot, fixture: candidateFixture }), /cross-fixture|fixture identity|does not match constant/u, "cross-fixture admission authority transplant must be rejected");

  const baseline = spawnSync(process.execPath, ["--test", "test/worker-retries.test.mjs"], { cwd: resolve(fixtureRoot, "workspace"), encoding: "utf8" });
  assert.notEqual(baseline.status, 0, "the frozen task workspace must retain the visible inconsistency");

  rejectsPublicMutation("unlisted-public-input", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/unlisted.txt"), "unlisted\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("public-byte-drift", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), "{}\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("private-field-leakage", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "metadata.json");
    const value = readJson(path);
    value.private_root = "private/evaluator";
    writeJson(path, value);
  }, /answer-bearing field/u);
  if (!productionAuthority) rejectsPublicMutation("requirement-reference-corruption", (target) => {
      const path = resolve(target, FIXTURE_ROOT_RELATIVE, "requirement-record.json");
      const value = readJson(path);
      value.requirements[0].evidence_map_ids = ["unknown-evidence"];
      writeJson(path, value);
    }, /deterministic source-freeze contract/u);
  rejectsPublicMutation("cross-fixture-config-transplant", (target) => {
    const path = resolve(target, "benchmarks/adaptive-portfolio.config.json");
    const value = readJson(path);
    value.fixtures.find(({ id }) => id === "mn-doc-config-correction").id = "mn-build-option-update-copy";
    writeJson(path, value);
  }, /not registered/u);
  rejectsPublicMutation("symlink-traversal", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/docs/worker-retries.md");
    rmSync(path);
    symlinkSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), path);
  }, /symlink/u);

  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixtureOneBuffers = authorityBuffers("mn-build-option-update");
  const fixtureOneManifest = readJson(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json"));
  validateEvaluatorAuthorityManifest({ manifest: fixtureOneManifest, buffers: fixtureOneBuffers, evaluatorRevision: fixtureOneManifest.evaluator_revision, root });
  const fixtureTwoBuffers = authorityBuffers("mn-doc-config-correction");
  const fixtureTwoManifest = deriveEvaluatorAuthorityManifest({ buffers: fixtureTwoBuffers, evaluatorRevision: revision, fixtureId: "mn-doc-config-correction" });
  assert.equal(fixtureTwoManifest.fixture_id, "mn-doc-config-correction");
  assert.deepEqual(fixtureTwoManifest.file_inventory.map(({ path }) => path), evaluatorAuthorityPathsForFixture("mn-doc-config-correction").bindingPaths);

  const privateRootIndex = process.argv.indexOf("--private-root");
  const caseRootIndex = process.argv.indexOf("--private-case-root");
  let privateValidation = "not_run";
  if (privateRootIndex !== -1 || caseRootIndex !== -1) {
    assert.notEqual(privateRootIndex, -1, "--private-root is required with private cases");
    assert.notEqual(caseRootIndex, -1, "--private-case-root is required with a private evaluator");
    const privateRoot = resolve(process.argv[privateRootIndex + 1]);
    const caseRoot = resolve(process.argv[caseRootIndex + 1]);
    const productionBoundaries = boundaryRoots("actual-private");
    if (productionAuthority) {
      const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
      const admissionRecord = readJson(resolve(fixtureRoot, "final-admission-record.json"));
      const evidenceMap = readJson(resolve(fixtureRoot, "evidence-map.json"));
      const inputRecord = readJson(resolve(fixtureRoot, "input-manifest.json")).fixtures["mn-doc-config-correction"];
      const mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
      const equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
      assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord, admissionRecord, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
      assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord, equivalenceAsset }));
      for (const [name, mutate, pattern] of [
        ["mutation omission", (value) => value.mutations.pop(), /inventory/u],
        ["mutation addition", (value) => value.mutations.push({ ...value.mutations[0], mutation_id: "extra-mutation" }), /inventory/u],
        ["mutation transplant", (value) => { value.mutations[0].requirement_id = "configuration-contract"; }, /transplanted/u],
        ["mutation wrong target", (value) => { value.mutations[0].target_evidence_map_id = value.mutations[1].target_evidence_map_id; }, /another requirement/u],
        ["mutation digest drift", (value) => { value.mutations[0].mutation_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u],
      ]) {
        const value = structuredClone(mutationAsset);
        mutate(value);
        assert.throws(() => validateMutationAuthority({ requirementRecord, admissionRecord, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: value }), pattern, name);
      }
      for (const [name, mutate, pattern] of [
        ["equivalence omission", (value) => value.rules.pop(), /inventory/u],
        ["equivalence transplant", (value) => { value.rules[0].requirement_id = "configuration-contract"; }, /transplanted/u],
      ]) {
        const value = structuredClone(equivalenceAsset);
        mutate(value);
        assert.throws(() => validateEquivalenceAuthority({ requirementRecord, equivalenceAsset: value }), pattern, name);
      }
      const requirementSchema = resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json");
      const outputSchema = resolve(root, "benchmarks/schemas/portfolio-output-contract.schema.json");
      assert.throws(() => assertBenchmarkSchemaInstance({ ...requirementRecord, extra_contract: true }, { schemaPath: requirementSchema, label: "mutated requirement" }), /Schema validation/u, "production requirement Schema must reject additions");
      const outputContract = readJson(resolve(fixtureRoot, "output-contract.json"));
      const invalidOutput = structuredClone(outputContract);
      delete invalidOutput.evaluator_public_reference_path;
      assert.throws(() => assertBenchmarkSchemaInstance(invalidOutput, { schemaPath: outputSchema, label: "mutated output" }), /Schema validation/u, "production output Schema must reject omissions");
      const candidate = readJson(resolve(fixtureRoot, "source-freeze-candidate.json"));
      for (const binding of Object.keys(candidate.public_bindings)) {
        const mutated = structuredClone(candidate);
        mutated.public_bindings[binding].semantic_digest = `sha256:${"0".repeat(64)}`;
        assert.notEqual(canonicalDigest(Object.fromEntries(Object.entries(mutated).filter(([key]) => key !== "candidate_digest"))), candidate.candidate_digest, `candidate digest must bind ${binding}`);
      }
      const privateMutation = structuredClone(candidate);
      privateMutation.evaluator_private_binding.source_tree_digest = `sha256:${"0".repeat(64)}`;
      assert.notEqual(canonicalDigest(Object.fromEntries(Object.entries(privateMutation).filter(([key]) => key !== "candidate_digest"))), candidate.candidate_digest, "candidate digest must bind private source identity");
      const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"));
      const transplantedReference = structuredClone(reference);
      transplantedReference.evaluator_bundle_id = `evaluator-${"0".repeat(64)}`;
      transplantedReference.public_metadata_digest = computeEvaluatorReferenceDigest(transplantedReference);
      assert.notEqual(transplantedReference.public_metadata_digest, reference.public_metadata_digest, "public reference digest must bind the private bundle identity");
    }
    const expectations = readJson(resolve(caseRoot, "expectations.json"));
    for (const entry of expectations.cases) {
      const fragment = await validateActualPrivateEvaluator({
        root,
        privateRoot,
        boundaryRoots: productionBoundaries,
        frozenWorkspace: resolve(caseRoot, entry.frozen_workspace),
        candidateWorkspace: resolve(caseRoot, entry.candidate_workspace),
        verificationExecuted: entry.verification_executed,
        investigatedPaths: entry.investigated_paths,
      });
      assert.equal(fragment.classification, entry.expected_classification, `actual private case ${entry.case_id}`);
    }
    privateValidation = "pass";
  }

  console.log(JSON.stringify({ fixture_id: "mn-doc-config-correction", public_validation: "pass", synthetic_private_validation: "not_run", actual_private_validation: privateValidation, fixture_one_regression: "pass", scoring_ready: false }));
} finally {
  rmSync(work, { recursive: true, force: true });
}

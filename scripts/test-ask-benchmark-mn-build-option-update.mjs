#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertAnswerNeutralPublicValue,
  assertPrivateRootOutsideRepository,
  evaluateEvidenceRemoval,
  FIXTURE_ROOT_RELATIVE,
  validateMnBuildOptionUpdatePrivateFixture,
  validateMnBuildOptionUpdatePublicFixture,
  validateFairPaths,
  validatePendingIndependentReview,
} from "./ask-benchmark-mn-build-option-update.mjs";
import { validateScoringInputBindings } from "./ask-benchmark-scoring-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const work = mkdtempSync(resolve(tmpdir(), "ask-mn-build-option-update-"));
const privateRootArgumentIndex = process.argv.indexOf("--private-root");
const privateRoot = privateRootArgumentIndex === -1 ? null : resolve(process.argv[privateRootArgumentIndex + 1]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function expectFailure(fn, pattern, label) {
  assert.throws(fn, pattern, label);
}

function boundaryRoots() {
  const roots = {};
  for (const [key, marker] of [
    ["materializedPath", "materialization-manifest.json"],
    ["selectionState", "selection-state.json"],
    ["runDir", "run-identity.json"],
    ["normalizedResultsPath", "normalized-results-root.json"],
    ["publicArtifactRoot", null],
  ]) {
    roots[key] = resolve(work, key);
    mkdirSync(roots[key]);
    if (marker) writeJson(resolve(roots[key], marker), { fixture_id: "synthetic-boundary" });
  }
  return roots;
}

function syntheticScoringInput() {
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"));
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"));
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"));
  const admissionRecord = readJson(resolve(fixtureRoot, "final-admission-record.json"));
  const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
  const outputContract = readJson(resolve(fixtureRoot, "output-contract.json"));
  const evaluatorReference = readJson(resolve(fixtureRoot, "evaluator-reference.json"));
  const freezeManifest = readJson(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"));
  const freezeManifestSourceDigest = `sha256:${"a".repeat(64)}`;
  const normalizedResult = {
    lineage: {
      fixture_id: "mn-build-option-update",
      fixture_input_digest: evaluatorReference.fixture_input_digest,
      suite: "mechanism_negative",
      task_class: "configuration",
      plan_digest: `sha256:${"b".repeat(64)}`,
    },
  };
  const evaluatorResult = {
    scoring_input_freeze_manifest_source_digest: freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRecord.admission_digest,
    requirement_record_digest: requirementRecord.requirement_record_digest,
    requirement_set_digest: requirementRecord.requirement_set_digest,
    output_contract_digest: outputContract.output_contract_digest,
    evaluator_public_reference_digest: evaluatorReference.public_metadata_digest,
    plan_digest: normalizedResult.lineage.plan_digest,
    evaluation_status: "completed",
    requirement_results: requirementRecord.requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      outcome: "pass",
      earned_points: requirement.max_points,
      matched_equivalence_class_ids: [requirement.equivalence_class_ids[0]],
      finding_ids: [],
      evidence_references: [{ kind: "normalized_result", digest: `sha256:${"c".repeat(64)}`, bytes: 1 }],
    })),
    findings: [],
    false_positives: [],
    scope_deviations: [],
  };
  return { freezeManifest, freezeManifestSourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, normalizedResult, evaluatorResult };
}

function runPrivateCandidateChecks(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const assetPath = (role) => resolve(privateRoot, manifest.asset_inventory.find((entry) => entry.role === role).path);
  const referenceContract = readJson(assetPath("oracle"));
  const automatedEvaluator = assetPath("hidden_tests");
  const baseWorkspace = resolve(fixtureRoot, "workspace");
  const candidate = (name) => {
    const path = resolve(work, name);
    cpSync(baseWorkspace, path, { recursive: true });
    return path;
  };
  const writeCandidateConfig = (path, sourceMap) => {
    const configPath = resolve(path, "build.config.json");
    const config = readJson(configPath);
    config.profiles.release.sourceMap = sourceMap;
    writeJson(configPath, config);
  };
  const writeEvidence = (name, changedFiles, verification) => {
    const report = resolve(work, `${name}-report.json`);
    const changes = resolve(work, `${name}-changes.json`);
    writeJson(report, { verification });
    writeJson(changes, changedFiles);
    return [report, changes];
  };
  const runHidden = (workspace, evidence, expectedStatus = 0) => {
    const result = spawnSync(process.execPath, [automatedEvaluator, workspace, ...evidence], { encoding: "utf8" });
    assert.equal(result.status, expectedStatus);
  };

  const contract = referenceContract.observable_contract.release_source_map;
  const narrow = candidate("narrow");
  writeCandidateConfig(narrow, { scripts: contract.scripts, styles: contract.styles });
  runHidden(narrow, writeEvidence("narrow", ["build.config.json"], { test: "passed", validate_build: "passed" }));

  const equivalent = candidate("equivalent");
  writeCandidateConfig(equivalent, { styles: contract.styles, scripts: contract.scripts });
  runHidden(equivalent, writeEvidence("equivalent", ["build.config.json"], { validate_build: "passed", test: "passed" }));

  const underProcessed = candidate("under-processed");
  runHidden(underProcessed, writeEvidence("under-processed", ["build.config.json"], { test: "passed", validate_build: "passed" }), 1);

  const broad = candidate("broad");
  writeCandidateConfig(broad, { scripts: contract.scripts, styles: contract.styles });
  runHidden(broad, writeEvidence("broad", ["build.config.json", "package.json"], { test: "passed", validate_build: "passed" }), 1);

  const unverified = candidate("unverified");
  writeCandidateConfig(unverified, { scripts: contract.scripts, styles: contract.styles });
  runHidden(unverified, writeEvidence("unverified", ["build.config.json"], { test: "not_run", validate_build: "not_run" }), 1);
}

try {
  const summary = validateMnBuildOptionUpdatePublicFixture({ root });
  assert.equal(summary.reviewStatus, "pending_independent_review");
  assert.equal(summary.scoringReady, false);
  assert.equal(summary.applicableGateCount, 12);
  assert.equal(summary.nonApplicableGateCount, 3);

  expectFailure(() => assertAnswerNeutralPublicValue({ hidden_answer: "x" }), /answer-bearing field/u, "public answer-bearing fields must fail closed");
  expectFailure(() => assertPrivateRootOutsideRepository(root, fixtureRoot), /outside the repository/u, "repository-local private bundles must be rejected");
  expectFailure(() => validatePendingIndependentReview({ reviewer_status: "approved", author_self_approval: true, gates: [] }, { admission_status: "admitted" }), /self-approve/u, "self-approved independent review must fail closed");
  expectFailure(() => validateFairPaths({ fair_paths: { plain: { status: "pass", agent_visible_evidence: ["task.md"] } } }, new Set(["task.md"])), /kernel_only fair path is missing/u, "Plain and Kernel-only fair paths are both required");

  const evidenceMap = readJson(resolve(fixtureRoot, "evidence-map.json"));
  const target = evidenceMap.maps.find(({ evidence_map_id }) => evidence_map_id === evidenceMap.mutation_contract.target_evidence_map_id);
  assert.equal(evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "not_recoverable" }), "not_recoverable");
  expectFailure(() => evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "recoverable" }), /expectation is invalid/u, "removed scored evidence must not remain recoverable");

  const inputManifest = readJson(resolve(fixtureRoot, "input-manifest.json"));
  const visiblePaths = inputManifest.fixtures["mn-build-option-update"].files.map(({ path }) => path);
  assert.equal(visiblePaths.includes("evaluator-reference.json"), false, "evaluator reference must not enter the pre-output agent-visible collection");
  assert.equal(visiblePaths.every((path) => path === "task.md" || path.startsWith("workspace/")), true);

  const scoring = syntheticScoringInput();
  assert.equal(validateScoringInputBindings(scoring).scoringReady, true, "synthetic completed evaluator evidence must be consumable by the frozen scoring interface");
  const replacedReference = structuredClone(scoring);
  replacedReference.evaluatorResult.evaluator_public_reference_digest = `sha256:${"d".repeat(64)}`;
  expectFailure(() => validateScoringInputBindings(replacedReference), /binding mismatch/u, "evaluator reference replacement must fail closed");
  const inputDrift = structuredClone(scoring);
  inputDrift.evaluatorReference.fixture_input_digest = `sha256:${"e".repeat(64)}`;
  expectFailure(() => validateScoringInputBindings(inputDrift), /input binding/u, "input identity drift must fail closed");
  const unknownRequirement = structuredClone(scoring);
  unknownRequirement.evaluatorResult.requirement_results[0].requirement_id = "unknown-requirement";
  expectFailure(() => validateScoringInputBindings(unknownRequirement), /unknown requirement/u, "unknown evaluator requirement must fail closed");
  const missingRequirement = structuredClone(scoring);
  missingRequirement.evaluatorResult.requirement_results.pop();
  expectFailure(() => validateScoringInputBindings(missingRequirement), /exactly cover/u, "missing evaluator requirement must fail closed");
  assert.equal(summary.scoringReady, false, "synthetic scoring consumption must not promote a review-pending real fixture");

  if (privateRoot) {
    const roots = boundaryRoots();
    const privateSummary = validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot, ...roots });
    assert.equal(privateSummary.evaluatorBundleDigest, summary.evaluatorBundleDigest);
    runPrivateCandidateChecks(privateRoot);

    const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
    const privateAsset = manifest.asset_inventory[0];
    const leakedAsset = resolve(roots.publicArtifactRoot, "unmanaged-private-material.bin");
    cpSync(resolve(privateRoot, privateAsset.path), leakedAsset);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot, ...roots }), /byte-identical private evaluator material/u, "private material in the public artifact root must fail closed");
    rmSync(leakedAsset);

    const driftedRoot = resolve(work, "private-digest-drift");
    cpSync(privateRoot, driftedRoot, { recursive: true });
    const driftedManifestPath = resolve(driftedRoot, "private-evaluator-bundle.json");
    const driftedManifest = readJson(driftedManifestPath);
    driftedManifest.evaluator_bundle_digest = `sha256:${"f".repeat(64)}`;
    writeJson(driftedManifestPath, driftedManifest);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: driftedRoot, ...roots }), /digest closure|identity mismatch/u, "private bundle digest drift must fail closed");

    const cli = spawnSync(process.execPath, [resolve(root, "scripts/ask-benchmark-mn-build-option-update.mjs"), "--private-root", privateRoot], { encoding: "utf8" });
    assert.equal(cli.status, 1, "CLI private validation without explicit boundary roots must fail closed");
    assert.equal(`${cli.stdout}${cli.stderr}`.includes(privateRoot), false, "CLI output must not disclose the private root");
    assert.equal(`${cli.stdout}${cli.stderr}`.includes("observable_contract"), false, "CLI output must not disclose private evaluator content");
  }

  console.log(JSON.stringify({
    fixture_id: summary.fixtureId,
    evaluator_bundle_id: summary.evaluatorBundleId,
    evaluator_bundle_digest: summary.evaluatorBundleDigest,
    evaluator_byte_count: summary.evaluatorByteCount,
    public_validation: "pass",
    private_validation: privateRoot ? "pass" : "not_run",
    evidence_removal: "pass",
    equivalent_solution: privateRoot ? "pass" : "not_run",
    synthetic_interface: "pass",
    review_status: summary.reviewStatus,
    scoring_ready: false,
  }));
} finally {
  rmSync(work, { recursive: true, force: true });
}

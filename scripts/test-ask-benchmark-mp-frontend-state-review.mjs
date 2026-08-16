import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { resolveRepositoryAdmissionDecision } from "./ask-benchmark-admission-decision.mjs";
import {
  createSealedEvaluatorExecutionForTest,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { computeResultProfileDigest, deriveBinaryScopeVerificationClassification } from "./ask-benchmark-scoring-contract.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpFrontendStateReviewInputClosure } from "./ask-benchmark-mp-frontend-state-review.mjs";
import { buildMpFrontendStateAuthority, validateMpFrontendStateReviewProductionAuthority } from "./ask-benchmark-mp-frontend-state-review-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-frontend-state-review";
const FIXTURE_ROOT = resolve(ROOT, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function evaluatorSemanticProjection(result) {
  return {
    evaluation_status: result.evaluation_status,
    requirement_results: result.requirement_results.map(({ requirement_id, outcome, earned_points, matched_equivalence_class_ids, finding_ids, evidence_references, scope_deviation_references, verification_evidence_references, verification_evidence_state }) => ({
      requirement_id,
      outcome,
      earned_points,
      matched_equivalence_class_ids,
      finding_ids,
      evidence_references,
      scope_deviation_references,
      verification_evidence_references,
      verification_evidence_state,
    })),
    findings: result.findings.map(({ finding_id, category, severity, evidence_references }) => ({ finding_id, category, severity, evidence_references })),
    scope_deviations: result.scope_deviations.map(({ finding_id, category, severity, evidence_references }) => ({ finding_id, category, severity, evidence_references })),
    verification_correctness: result.verification_correctness,
    evidence_correctness: result.evidence_correctness,
    under_processing: result.under_processing,
    over_processing: result.over_processing,
    classification_present: Object.hasOwn(result, "classification"),
    classification: result.classification ?? null,
    result_profile: result.result_profile,
    scoring_ready: result.scoring_ready,
  };
}

function expectedSemanticProjection(entry, { normalizedResult, repositoryDiffArtifact }) {
  const requirementIds = [
    "state-consistency-finding",
    "decision-correctness",
    "verification-conclusion",
    "suspicious-control-restraint",
    "evidence-and-review-precision",
  ];
  const maxPoints = [4, 2, 2, 1, 1];
  const equivalenceIds = [
    "equivalent-hidden-selection-finding",
    "equivalent-request-changes-decision",
    "equivalent-failed-interaction-verification",
    "equivalent-correct-expansion-restraint",
    "equivalent-evidence-bounded-review",
  ];
  const findingIds = entry.expected_findings.map(({ finding_id }) => finding_id);
  const expectedScopeDeviations = entry.expected_scope_deviations ?? [];
  const scopeDeviationIds = expectedScopeDeviations.map(({ finding_id }) => finding_id);
  const manual = entry.expected_evaluation_status === "manual_review_required";
  const manualRequirementIds = new Set(entry.expected_manual_requirement_ids ?? []);
  const normalizedReference = { kind: "normalized_result", digest: normalizedResult.normalized_result_digest, bytes: 1 };
  const diffReference = { kind: "repository_diff", digest: repositoryDiffArtifact.artifact_digest, bytes: repositoryDiffArtifact.artifact_bytes };
  const verificationSource = normalizedResult.command_evidence.references[0];
  const verificationReference = { kind: "execution_event", digest: verificationSource.digest, bytes: verificationSource.bytes };
  const standardReferences = [normalizedReference, diffReference, verificationReference];
  const finalOutputReference = { kind: "final_output", digest: normalizedResult.lineage.final_output_digest, bytes: normalizedResult.lineage.final_output_bytes };
  const observation = (state, manualObservation = false, verificationObservation = false) => ({
    state,
    evidence_references: manualObservation ? [finalOutputReference] : verificationObservation ? [verificationReference] : standardReferences,
  });
  return {
    evaluation_status: entry.expected_evaluation_status,
    requirement_results: requirementIds.map((requirement_id, index) => ({
      requirement_id,
      outcome: entry.expected_passes[index] ? "pass" : "fail",
      earned_points: entry.expected_passes[index] ? maxPoints[index] : 0,
      matched_equivalence_class_ids: entry.expected_passes[index] ? [equivalenceIds[index]] : [],
      finding_ids: manual ? manualRequirementIds.has(requirement_id) ? findingIds : [] : findingIds,
      evidence_references: manualRequirementIds.has(requirement_id) ? [finalOutputReference] : standardReferences,
      scope_deviation_references: scopeDeviationIds,
      verification_evidence_references: manualRequirementIds.has(requirement_id) ? [] : [verificationReference],
      verification_evidence_state: "executed_success",
    })),
    findings: entry.expected_findings.map((finding) => ({ ...finding, evidence_references: manual ? [finalOutputReference] : standardReferences })),
    scope_deviations: expectedScopeDeviations.map((finding) => ({ ...finding, evidence_references: standardReferences })),
    verification_correctness: observation(entry.expected_verification_correctness, entry.expected_verification_correctness === "manual_review_required", entry.expected_verification_correctness !== "manual_review_required"),
    evidence_correctness: observation(entry.expected_evidence_correctness),
    under_processing: observation(entry.expected_under_processing, entry.expected_under_processing === "manual_review_required"),
    over_processing: observation(entry.expected_over_processing, entry.expected_over_processing === "manual_review_required"),
    classification_present: !manual,
    classification: entry.expected_classification,
    result_profile: { name: "binary_scope_verification_v1", digest: computeResultProfileDigest() },
    scoring_ready: false,
  };
}

function expectFailure(operation, pattern, label) {
  assert.throws(operation, pattern, label);
}

function privateArgs(argv) {
  const privateIndex = argv.indexOf("--private-root");
  const casesIndex = argv.indexOf("--private-case-root");
  if ((privateIndex === -1) !== (casesIndex === -1)) throw new Error("--private-root and --private-case-root must be supplied together");
  return privateIndex === -1 ? null : { privateRoot: resolve(argv[privateIndex + 1]), caseRoot: resolve(argv[casesIndex + 1]) };
}

function createBoundaryRoots(work) {
  const fields = {
    materializedPath: ["materialized", "materialization-manifest.json"],
    selectionState: ["selection", "selection-state.json"],
    runDir: ["run", "run-identity.json"],
    normalizedResultsPath: ["normalized", "normalized-results-root.json"],
  };
  return Object.fromEntries(Object.entries(fields).map(([field, [directory, marker]]) => {
    const root = resolve(work, directory);
    mkdirSync(root);
    writeFileSync(resolve(root, marker), "{}\n");
    return [field, root];
  }));
}

function validateFrozenDesign() {
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mp-frontend-state-review.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_positive",
    task_class: "pr_review",
    domain: "frontend",
    difficulty: "hard",
    repetitions: 3,
    capability_families: ["review_precision", "state_consistency"],
    evidence_topologies: ["cross_file_contract", "review_diff_and_tests"],
    outcome_dimensions: ["behavioral_consistency", "review_precision"],
    risk_boundary: "none",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "findings_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "cross_file_contract");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, true);
  assert.equal(record.answer_neutral_design.safety_approval_boundary_required, false);
}

function validateVisibleScenario() {
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const unit = spawnSync(process.execPath, ["--test", "test/unit/inbox-state.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(unit.status, 0, unit.stderr || unit.stdout);
  const interaction = spawnSync(process.execPath, ["--test", "test/integration/inbox-view.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(interaction.status, 0, "cross-file state contract must expose the visible defect");
  assert.match(`${interaction.stdout}${interaction.stderr}`, /message-read|null|filtering out the selection/u);
  const contract = readFileSync(resolve(workspace, "docs/state-contract.md"), "utf8");
  assert.match(contract, /expandedThreadIds.+retained|restore expansion/isu, "contract must preserve expansion history across visibility changes");
}

function validatePullRequestDiff() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-pr-diff-"));
  const diffPath = resolve(FIXTURE_ROOT, "workspace/pr.diff");
  const check = spawnSync("git", ["apply", "--check", diffPath], { cwd: work, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || check.stdout);
  const apply = spawnSync("git", ["apply", diffPath], { cwd: work, encoding: "utf8" });
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  for (const path of ["src/inbox-state.mjs", "src/inbox-view.mjs", "test/integration/inbox-view.test.mjs"]) {
    assert.deepEqual(readFileSync(resolve(work, path)), readFileSync(resolve(FIXTURE_ROOT, "workspace", path)), `pr.diff must reconstruct ${path}`);
  }
}

function validateWorkspaceValidatorParity() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-review-validator-"));
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const schemaPath = resolve(workspace, "review.schema.json");
  const validatorPath = resolve(workspace, "scripts/validate-review.mjs");
  const valid = {
    decision: "request_changes",
    verification: {
      state: "failed",
      evidence: [{ path: "test/integration/inbox-view.test.mjs", conclusion: "The interaction test fails." }],
    },
    findings: [{
      title: "Hidden selection leaves stale details",
      severity: "high",
      evidence: [{ path: "src/inbox-view.mjs", line: 5 }],
      impact: "A hidden selection still renders details.",
      required_action: "Clear the selection or derive details from visible messages.",
    }],
  };
  const validPath = resolve(work, "valid.json");
  writeFileSync(validPath, `${JSON.stringify(valid, null, 2)}\n`);
  assert.doesNotThrow(() => assertBenchmarkSchemaInstance(valid, { schemaPath, label: "valid frontend review" }));
  const validResult = spawnSync(process.execPath, [validatorPath, validPath], { encoding: "utf8" });
  assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);

  const invalidCases = [
    ["empty-finding-evidence", (value) => { value.findings[0].evidence = []; }],
    ["blank-verification-evidence", (value) => { value.verification.evidence[0] = { path: " ", conclusion: " " }; }],
    ["blank-finding-evidence-path", (value) => { value.findings[0].evidence[0].path = " "; }],
    ["blank-finding-title", (value) => { value.findings[0].title = " "; }],
    ["blank-finding-impact", (value) => { value.findings[0].impact = " "; }],
    ["blank-finding-action", (value) => { value.findings[0].required_action = " "; }],
  ];
  for (const [name, mutate] of invalidCases) {
    const value = clone(valid);
    mutate(value);
    const path = resolve(work, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    assert.throws(() => assertBenchmarkSchemaInstance(value, { schemaPath, label: name }), /JSON Schema validation/u, `${name} schema rejection`);
    const result = spawnSync(process.execPath, [validatorPath, path], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${name} runtime validator rejection`);
  }
}

function validatePublicNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-public-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    return root;
  };
  const vocabulary = copy("vocabulary");
  writeFileSync(resolve(vocabulary, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/task.md`), "Review this benchmark task.\n");
  expectFailure(() => validateMpFrontendStateReviewInputClosure({ root: vocabulary }), /benchmark-specific vocabulary/u, "public vocabulary leakage");

  const inventory = copy("inventory");
  writeFileSync(resolve(inventory, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/notes.txt`), "drift\n");
  expectFailure(() => validateMpFrontendStateReviewInputClosure({ root: inventory }), /inventory/u, "agent-visible inventory drift");

  const privateLeak = copy("private-leak");
  writeFileSync(resolve(privateLeak, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/oracle.json`), "{}\n");
  expectFailure(() => validateMpFrontendStateReviewInputClosure({ root: privateLeak }), /prohibited/u, "private material leakage");

  const inputDrift = copy("input-drift");
  const inputPath = resolve(inputDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/input-manifest.json`);
  const input = readJson(inputPath);
  input.fixtures[FIXTURE_ID].files[0].sha256 = "0".repeat(64);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  expectFailure(() => validateMpFrontendStateReviewInputClosure({ root: inputDrift }), /inventory/u, "input digest drift");

  const verificationDrift = copy("verification-drift");
  const verificationPath = resolve(verificationDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/verification-command-contract.json`);
  const verification = readJson(verificationPath);
  verification.fixture_input_digest = `sha256:${"0".repeat(64)}`;
  writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  expectFailure(() => validateMpFrontendStateReviewInputClosure({ root: verificationDrift }), /digest|binding/u, "verification/input mismatch");
}

function validateProductionNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-production-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    cpSync(FIXTURE_ROOT, resolve(root, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`), { recursive: true, force: true });
    cpSync(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"), resolve(root, "benchmarks/adaptive-portfolio.config.json"), { force: true });
    return root;
  };
  for (const [name, relativePath, mutate, pattern] of [
    ["missing-requirement-evidence", "requirement-record.json", (value) => { value.requirements[0].evidence_map_ids = []; }, /requirement|evidence|digest/u],
    ["evaluator-reference-mismatch", "evaluator-reference.json", (value) => { value.evaluator_authority_manifest_digest = `sha256:${"0".repeat(64)}`; }, /digest|binding|transplanted/u],
    ["stale-source-freeze", "source-freeze-candidate.json", (value) => { value.public_bindings.input_manifest.raw_sha256 = `sha256:${"0".repeat(64)}`; }, /state|digest|binding/u],
  ]) {
    const root = copy(name);
    const path = resolve(root, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/${relativePath}`);
    const value = readJson(path);
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    expectFailure(() => validateMpFrontendStateReviewProductionAuthority({ root }), pattern, name);
  }
}

async function validatePrivateCases({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-private-test-"));
  const boundaryRoots = createBoundaryRoots(work);
  const production = validateMpFrontendStateReviewProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
  assert.equal(production.scoringReady, false);
  assert.equal(production.admissionState, "admission_pending");
  const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${production.evaluatorBundleDigest}`);
  const cases = readJson(resolve(caseRoot, "cases.json"));
  const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
  const bundle = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const hiddenAsset = bundle.asset_inventory.find(({ role }) => role === "hidden_tests");
  assert.ok(hiddenAsset, "private bundle requires a hidden evaluator asset");
  const freezePath = resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
  const externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({
    root: ROOT,
    freezeManifestPath: freezePath,
    freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(freezePath)).digest("hex")}`,
    referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
    label: "mp-frontend-state private regression authority",
  });
  const privateEvaluationRoot = resolve(work, "sealed-authority");
  const evaluationInputRoot = resolve(work, "sealed-input");
  mkdirSync(privateEvaluationRoot);
  mkdirSync(evaluationInputRoot);
  writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n");
  for (const [index, entry] of cases.cases.entries()) {
    const frozen = resolve(work, `${entry.case_id}-frozen`);
    const candidate = resolve(work, `${entry.case_id}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    const reviewPath = resolve(caseRoot, entry.case_id, "review.json");
    const reviewBytes = readFileSync(reviewPath);
    cpSync(reviewPath, resolve(candidate, "review.json"));
    if (entry.extra_candidate_path) writeFileSync(resolve(candidate, entry.extra_candidate_path), "unauthorized candidate change\n");
    const lineage = {
      run_instance_id: `26426426-4264-4264-8264-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-2642642642642642-${String(index + 101).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(reviewBytes).digest("hex")}`,
      final_output_bytes: reviewBytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, case_id: entry.case_id }),
      lineage,
      command_evidence: {
        capture_support: "supported",
        evidence_level: "complete",
        required_command_ids: ["review-contract-validation"],
        required_alternative_groups: [],
        references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ case_id: entry.case_id, command: "review-contract-validation" }), bytes: 1 }],
        cwd_unverified_command_count: 0,
      },
    };
    const sealedExecution = createSealedEvaluatorExecutionForTest({
      root: ROOT,
      privateEvaluationRoot,
      privateRoot,
      hiddenAsset,
      frozenWorkspace: frozen,
      candidateWorkspace: candidate,
      evaluationInputRoot,
      evaluationLineage: lineage,
      evaluatorRevision: production.evaluatorRevision,
      externalAuthorityAnchor,
      executionDirectoryName: `sealed-${entry.case_id}`,
      label: `mp-frontend-state sealed ${entry.case_id} evaluator`,
    });
    const repositoryDiffArtifact = readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath));
    const first = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
    const expected = expectedSemanticProjection(entry, { normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(evaluatorSemanticProjection(first), expected, `${entry.case_id} complete private evaluator projection`);
    if (entry.expected_evaluation_status === "manual_review_required") {
      assert.equal(Object.hasOwn(first, "classification"), false, `${entry.case_id} manual fragment must omit classification`);
      assert.equal(deriveBinaryScopeVerificationClassification({ evaluatorResult: first, requirementRecord: requirement }), null, `${entry.case_id} manual fragment must not derive a normal classification`);
      assert.ok(first.requirement_results.some(({ outcome, earned_points }) => outcome === "manual_review_required" && earned_points === null), `${entry.case_id} manual fragment must retain null points`);
      const transplanted = clone(normalizedResult);
      transplanted.lineage.final_output_digest = `sha256:${"0".repeat(64)}`;
      await assert.rejects(
        evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: transplanted, repositoryDiffArtifact }),
        /final output authority/u,
        `${entry.case_id} final-output authority transplant must fail closed`,
      );
    }

    const sealed = executeSealedEvaluatorForTest({
      execution: sealedExecution,
      externalAuthorityAnchor,
      repositoryRoot: ROOT,
      normalized: normalizedResult,
      label: `mp-frontend-state sealed ${entry.case_id} evaluator`,
    });
    assertBenchmarkSchemaInstance(sealed.firstFragment, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} production-safe private fragment` });
    assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), expected, `${entry.case_id} complete production-safe evaluator projection`);
    assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), evaluatorSemanticProjection(first), `${entry.case_id} direct/production-safe evaluator agreement`);
  }

  const admission = readJson(resolve(FIXTURE_ROOT, "final-admission-record.json"));
  const evidenceMap = readJson(resolve(FIXTURE_ROOT, "evidence-map.json"));
  const inputRecord = readJson(resolve(FIXTURE_ROOT, "input-manifest.json")).fixtures[FIXTURE_ID];
  const mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
  const equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
  assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
  assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset }));
  assert.doesNotThrow(() => validateMatchedEquivalenceIds({ requirementRecord: requirement, equivalenceAsset, matchedEquivalenceClassIds: equivalenceAsset.rules.map(({ equivalence_class_id }) => equivalence_class_id) }));

  const referenceReviewPath = resolve(caseRoot, "reference-review/review.json");
  const referenceReviewBytes = readFileSync(referenceReviewPath);
  for (const [index, mutation] of mutationAsset.mutations.entries()) {
    const frozen = resolve(work, `${mutation.mutation_id}-frozen`);
    const candidate = resolve(work, `${mutation.mutation_id}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    for (const path of mutation.remove_paths) {
      if (!path.startsWith("workspace/")) continue;
      const absolute = resolve(frozen, path.slice("workspace/".length));
      assert.ok(existsSync(absolute), `${mutation.mutation_id} removal source must exist: ${path}`);
      rmSync(absolute);
    }
    cpSync(frozen, candidate, { recursive: true });
    cpSync(referenceReviewPath, resolve(candidate, "review.json"));
    const lineage = {
      run_instance_id: `26426426-4264-4264-8264-${String(index + 201).padStart(12, "0")}`,
      case_id: `case-2642642642642642-${String(index + 201).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(referenceReviewBytes).digest("hex")}`,
      final_output_bytes: referenceReviewBytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, mutation_id: mutation.mutation_id }),
      lineage,
      command_evidence: {
        references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ mutation_id: mutation.mutation_id }), bytes: 1 }],
      },
    };
    const repositoryDiffArtifact = { artifact_digest: canonicalDigest({ mutation_id: mutation.mutation_id, kind: "repository_diff" }), artifact_bytes: 1 };
    const result = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const target = result.requirement_results.find(({ requirement_id }) => requirement_id === mutation.requirement_id);
    assert.equal(target?.outcome, "fail", `${mutation.mutation_id} must make ${mutation.requirement_id} unrecoverable`);
    assert.notEqual(result.classification, "correct_narrow_execution", `${mutation.mutation_id} must not preserve the reference classification`);
  }

  const invalidReviewCases = [
    ["empty-finding-evidence", (value) => { value.findings[0].evidence = []; }],
    ["blank-verification-evidence", (value) => { value.verification.evidence[0] = { path: " ", conclusion: " " }; }],
    ["blank-finding-evidence-path", (value) => { value.findings[0].evidence[0].path = " "; }],
  ];
  for (const [index, [name, mutate]] of invalidReviewCases.entries()) {
    const frozen = resolve(work, `private-validator-${name}-frozen`);
    const candidate = resolve(work, `private-validator-${name}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    const review = readJson(referenceReviewPath);
    mutate(review);
    const bytes = Buffer.from(`${JSON.stringify(review, null, 2)}\n`);
    writeFileSync(resolve(candidate, "review.json"), bytes);
    const lineage = {
      run_instance_id: `26426426-4264-4264-8264-${String(index + 301).padStart(12, "0")}`,
      case_id: `case-2642642642642642-${String(index + 301).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      final_output_bytes: bytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, private_validator_case: name }),
      lineage,
      command_evidence: {
        references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ private_validator_case: name }), bytes: 1 }],
      },
    };
    const repositoryDiffArtifact = { artifact_digest: canonicalDigest({ private_validator_case: name, kind: "repository_diff" }), artifact_bytes: 1 };
    const result = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.ok(result.requirement_results.every(({ outcome }) => outcome === "fail"), `${name} private evaluator rejection`);
    assert.equal(result.classification, "under_processing", `${name} private evaluator classification`);
  }

  const missingMutation = clone(mutationAsset);
  missingMutation.mutations.pop();
  expectFailure(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: missingMutation }), /inventory/u, "evidence-removal violation");
  const undeclaredEquivalence = clone(equivalenceAsset);
  undeclaredEquivalence.rules[0].equivalence_class_id = "undeclared-equivalence";
  expectFailure(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: undeclaredEquivalence }), /inventory|transplanted/u, "undeclared equivalence");
  const transplantedEquivalence = clone(equivalenceAsset);
  transplantedEquivalence.fixture_id = "foreign-fixture";
  expectFailure(() => {
    if (transplantedEquivalence.fixture_id !== requirement.fixture_id) throw new Error("private equivalence fixture transplant");
    validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: transplantedEquivalence });
  }, /transplant/u, "cross-fixture transplant");
  return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: cases.cases.length, mutationBehaviorPass: mutationAsset.mutations.length, validatorParityPass: invalidReviewCases.length, falsePositiveControls: cases.cases.filter(({ control }) => control === "suspicious_but_correct").length };
}

validateFrozenDesign();
validateMpFrontendStateReviewInputClosure({ root: ROOT });
validateVisibleScenario();
validatePullRequestDiff();
validateWorkspaceValidatorParity();
validatePublicNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
let effectiveAdmissionStatus = "admission_pending";
if (productionExists) {
  const production = validateMpFrontendStateReviewProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  validateProductionNegativeCoverage();
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  const repositoryRevision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const repositoryDecision = resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision, fixtureId: FIXTURE_ID });
  assert.ok(repositoryDecision, "frontend state review admission decision overlay must exist");
  assert.equal(repositoryDecision.decision.decision_status, "admitted");
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "review_evidence_missing");
  effectiveAdmissionStatus = admission.effective_admission_status;
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === FIXTURE_ID), false);
}

const requested = privateArgs(process.argv.slice(2));
const privateSummary = requested ? await validatePrivateCases(requested) : null;
console.log(JSON.stringify({ fixture_id: FIXTURE_ID, input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", negative_regressions: "pass", production_validation: productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? "pass" : "not_supplied", ...(privateSummary ? { private_summary: privateSummary } : {}), admission: effectiveAdmissionStatus, scoring_ready: false }));

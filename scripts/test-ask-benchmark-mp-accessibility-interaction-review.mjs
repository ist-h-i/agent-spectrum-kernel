import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  createSealedEvaluatorExecutionForTest,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
  validatePrivateEvaluatorFragment,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { computeResultProfileDigest } from "./ask-benchmark-scoring-contract.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpAccessibilityInteractionReviewInputClosure } from "./ask-benchmark-mp-accessibility-interaction-review.mjs";
import { buildMpAccessibilityInteractionAuthority, validateMpAccessibilityInteractionReviewProductionAuthority } from "./ask-benchmark-mp-accessibility-interaction-review-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-accessibility-interaction-review";
const FIXTURE_ROOT = resolve(ROOT, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function evaluatorSemanticProjection(result) {
  return {
    requirement_results: result.requirement_results.map(({ requirement_id, outcome, earned_points, matched_equivalence_class_ids, finding_ids, scope_deviation_references, verification_evidence_state }) => ({
      requirement_id,
      outcome,
      earned_points,
      matched_equivalence_class_ids,
      finding_ids,
      scope_deviation_references,
      verification_evidence_state,
    })),
    findings: result.findings.map(({ finding_id, category, severity }) => ({ finding_id, category, severity })),
    scope_deviations: result.scope_deviations.map(({ finding_id, category, severity }) => ({ finding_id, category, severity })),
    verification_correctness: result.verification_correctness.state,
    evidence_correctness: result.evidence_correctness.state,
    under_processing: result.under_processing.state,
    over_processing: result.over_processing.state,
    classification: result.classification,
    result_profile: result.result_profile,
    scoring_ready: result.scoring_ready,
  };
}

function expectedSemanticProjection(entry) {
  const requirementIds = [
    "interaction-defect-finding",
    "decision-correctness",
    "verification-conclusion",
    "suspicious-control-restraint",
    "evidence-and-review-precision",
  ];
  const findingIds = entry.expected_findings.map(({ finding_id }) => finding_id);
  return {
    requirement_results: requirementIds.map((requirement_id, index) => ({
      requirement_id,
      outcome: entry.expected_outcomes[index],
      earned_points: entry.expected_points[index],
      matched_equivalence_class_ids: entry.expected_equivalence_ids[index],
      finding_ids: findingIds,
      scope_deviation_references: [],
      verification_evidence_state: "executed_success",
    })),
    findings: entry.expected_findings,
    scope_deviations: [],
    verification_correctness: entry.expected_verification_correctness,
    evidence_correctness: entry.expected_evidence_correctness,
    under_processing: entry.expected_under_processing,
    over_processing: entry.expected_over_processing,
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
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mp-accessibility-interaction-review.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_positive",
    task_class: "pr_review",
    domain: "accessibility",
    difficulty: "medium_hard",
    repetitions: 3,
    capability_families: ["interaction_semantics", "review_precision"],
    evidence_topologies: ["review_diff_and_tests", "ui_semantics_and_interactions"],
    outcome_dimensions: ["accessibility_conformance", "review_precision"],
    risk_boundary: "none",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "findings_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "review_diff_and_tests");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, true);
  assert.equal(record.answer_neutral_design.safety_approval_boundary_required, false);
}

function validateVisibleScenario() {
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const unit = spawnSync(process.execPath, ["--test", "test/unit/format-toolbar.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(unit.status, 0, unit.stderr || unit.stdout);
  const interaction = spawnSync(process.execPath, ["--test", "test/integration/format-toolbar.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(interaction.status, 0, "interaction contract must expose the visible defect");
  assert.match(`${interaction.stdout}${interaction.stderr}`, /defaultPrevented|false !== true/u);
  const markup = readFileSync(resolve(workspace, "src/format-toolbar.html"), "utf8");
  assert.equal((markup.match(/tabindex="0"/gu) ?? []).length, 1, "toolbar starts with one tab stop");
  assert.equal((markup.match(/tabindex="-1"/gu) ?? []).length, 2, "remaining toolbar buttons use the roving-tabindex pattern");
}

function validatePublicNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-accessibility-public-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    return root;
  };
  const vocabulary = copy("vocabulary");
  writeFileSync(resolve(vocabulary, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/task.md`), "Review this benchmark task.\n");
  expectFailure(() => validateMpAccessibilityInteractionReviewInputClosure({ root: vocabulary }), /benchmark-specific vocabulary/u, "public vocabulary leakage");

  const inventory = copy("inventory");
  writeFileSync(resolve(inventory, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/notes.txt`), "drift\n");
  expectFailure(() => validateMpAccessibilityInteractionReviewInputClosure({ root: inventory }), /inventory/u, "agent-visible inventory drift");

  const privateLeak = copy("private-leak");
  writeFileSync(resolve(privateLeak, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/oracle.json`), "{}\n");
  expectFailure(() => validateMpAccessibilityInteractionReviewInputClosure({ root: privateLeak }), /prohibited/u, "private material leakage");

  const inputDrift = copy("input-drift");
  const inputPath = resolve(inputDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/input-manifest.json`);
  const input = readJson(inputPath);
  input.fixtures[FIXTURE_ID].files[0].sha256 = "0".repeat(64);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  expectFailure(() => validateMpAccessibilityInteractionReviewInputClosure({ root: inputDrift }), /inventory/u, "input digest drift");

  const verificationDrift = copy("verification-drift");
  const verificationPath = resolve(verificationDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/verification-command-contract.json`);
  const verification = readJson(verificationPath);
  verification.fixture_input_digest = `sha256:${"0".repeat(64)}`;
  writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  expectFailure(() => validateMpAccessibilityInteractionReviewInputClosure({ root: verificationDrift }), /digest|binding/u, "verification/input mismatch");
}

function validateProductionNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-accessibility-production-negative-"));
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
    expectFailure(() => validateMpAccessibilityInteractionReviewProductionAuthority({ root }), pattern, name);
  }
}

async function validatePrivateCases({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-accessibility-private-test-"));
  const boundaryRoots = createBoundaryRoots(work);
  const production = validateMpAccessibilityInteractionReviewProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
  assert.equal(production.scoringReady, false);
  assert.equal(production.admissionState, "admission_pending");
  const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${production.evaluatorBundleDigest}`);
  const cases = readJson(resolve(caseRoot, "cases.json"));
  const bundle = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const hiddenAsset = bundle.asset_inventory.find(({ role }) => role === "hidden_tests");
  assert.ok(hiddenAsset, "private bundle requires a hidden evaluator asset");
  const freezePath = resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
  const externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({
    root: ROOT,
    freezeManifestPath: freezePath,
    freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(freezePath)).digest("hex")}`,
    referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
    label: "mp-accessibility private regression authority",
  });
  const privateEvaluationRoot = resolve(work, "sealed-authority");
  const evaluationInputRoot = resolve(work, "sealed-input");
  mkdirSync(privateEvaluationRoot);
  mkdirSync(evaluationInputRoot);
  writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n");
  const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
  const scoringPolicy = readJson(resolve(ROOT, "benchmarks/portfolio-scoring-policy.json"));
  for (const [index, entry] of cases.cases.entries()) {
    const frozen = resolve(work, `${entry.case_id}-frozen`);
    const candidate = resolve(work, `${entry.case_id}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    cpSync(resolve(caseRoot, entry.case_id, "review.json"), resolve(candidate, "review.json"));
    const lineage = {
      run_instance_id: `25125125-1251-4251-8251-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-25125125-1251-4251-8251-${String(index + 101).padStart(12, "0")}`,
      attempt: "0001",
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
    const repositoryDiffArtifact = { artifact_digest: canonicalDigest({ case_id: entry.case_id, kind: "repository-diff" }), artifact_bytes: 1 };
    const first = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
    validatePrivateEvaluatorFragment({ root: ROOT, fragment: first, scoringPolicy, requirementRecord: requirement, normalizedResult });
    const expected = expectedSemanticProjection(entry);
    assert.deepEqual(evaluatorSemanticProjection(first), expected, `${entry.case_id} complete private evaluator projection`);

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
      label: `mp-accessibility sealed ${entry.case_id} evaluator`,
    });
    const sealed = executeSealedEvaluatorForTest({
      execution: sealedExecution,
      externalAuthorityAnchor,
      repositoryRoot: ROOT,
      normalized: normalizedResult,
      label: `mp-accessibility sealed ${entry.case_id} evaluator`,
    });
    validatePrivateEvaluatorFragment({ root: ROOT, fragment: sealed.firstFragment, scoringPolicy, requirementRecord: requirement, normalizedResult });
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
  return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: cases.cases.length, falsePositiveControls: cases.cases.filter(({ control }) => control === "suspicious_but_correct").length };
}

validateFrozenDesign();
validateMpAccessibilityInteractionReviewInputClosure({ root: ROOT });
validateVisibleScenario();
validatePublicNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
if (productionExists) {
  const production = validateMpAccessibilityInteractionReviewProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  validateProductionNegativeCoverage();
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "admission_pending");
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === FIXTURE_ID), false);
}

const requested = privateArgs(process.argv.slice(2));
const privateSummary = requested ? await validatePrivateCases(requested) : null;
console.log(JSON.stringify({ fixture_id: FIXTURE_ID, input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", negative_regressions: "pass", production_validation: productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? "pass" : "not_supplied", ...(privateSummary ? { private_summary: privateSummary } : {}), admission: "admission_pending", scoring_ready: false }));

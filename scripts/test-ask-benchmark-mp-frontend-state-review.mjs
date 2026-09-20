import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
const FIXTURE_ROOT_RELATIVE = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const REQUIREMENT_IDS = ["state-consistency-finding", "decision-correctness", "verification-conclusion", "suspicious-control-restraint", "evidence-and-review-precision"];
const HISTORICAL_REVIEWED_HEAD = "3fb6506de538189e93b12006d908ced49c051de2";
const FRESH_COVERAGE_CLASSES = new Set(["positive", "state_finding", "decision", "verification", "restraint", "evidence", "scope", "equivalence", "malformed", "evidence_removal"]);
const FRESH_CASE_PAYLOAD_DIGEST = "sha256:003229697a3a1b2346b095bcfa6298cc961c66af4e3d79be779d9a27232f1bf9";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function repositoryDiffArtifactForEntries(diffEntries, lineage) {
  return { run_instance_id: lineage.run_instance_id, case_id: lineage.case_id, attempt: lineage.attempt, artifact_digest: canonicalDigest(diffEntries), artifact_bytes: Buffer.byteLength(stableCanonicalJson(diffEntries)) || 1, diff_entries: diffEntries };
}

function directRepositoryDiffArtifact(entry, lineage) {
  const diffEntries = [{ path: "review.json", change_type: "addition", before: null, after: { file_type: "file" } }];
  if (entry.extra_candidate_path) diffEntries.push({ path: entry.extra_candidate_path, change_type: "addition", before: null, after: { file_type: "file" } });
  return repositoryDiffArtifactForEntries(diffEntries, lineage);
}

function gitBytes(revision, path) {
  return execFileSync("git", ["-C", ROOT, "show", `${revision}:${path}`]);
}

function validateHistoricalPublicInputInvariance() {
  const manifest = readJson(resolve(FIXTURE_ROOT, "input-manifest.json"));
  const paths = [`${FIXTURE_ROOT_RELATIVE}/task.md`, `${FIXTURE_ROOT_RELATIVE}/input-manifest.json`, `${FIXTURE_ROOT_RELATIVE}/verification-command-contract.json`, ...manifest.fixtures[FIXTURE_ID].files.map(({ path }) => `${FIXTURE_ROOT_RELATIVE}/${path}`)];
  for (const path of paths) assert.deepEqual(readFileSync(resolve(ROOT, path)), gitBytes(HISTORICAL_REVIEWED_HEAD, path), `${path} must remain byte-identical to the historical reviewed public input`);
}

function validateFreshPrivateSourceContract({ privateRoot, caseRoot }, { sourceOnly }) {
  const sourceNames = ["false-positive-boundaries.json", "hidden-evaluator.mjs", "human-instructions.md", "oracle.json", "rubric.md", "scope-boundaries.json"];
  const generatedNames = ["dependency-graph.json", "equivalent-solutions.json", "evidence-removal-mutations.json", "independence.json", "private-evaluator-bundle.json"];
  assert.deepEqual(readdirSync(privateRoot).sort(), [...sourceNames, ...(sourceOnly ? [] : generatedNames)].sort(), "fresh frontend private root inventory must be closed for its generation phase");
  for (const name of sourceNames) assert.ok(lstatSync(resolve(privateRoot, name)).isFile() && !lstatSync(resolve(privateRoot, name)).isSymbolicLink(), `${name} must be a regular source file`);
  const entries = readdirSync(caseRoot).sort();
  assert.ok(entries.includes("cases.json") && entries.includes("reference-review"), "fresh frontend cases require manifest and reference review");
  const cases = readJson(resolve(caseRoot, "cases.json"));
  const reviewIds = [...new Set([...cases.cases.map(({ case_id }) => case_id), "reference-review"])].sort();
  const payloadProjection = { manifest: cases, reviews: reviewIds.map((case_id) => ({ case_id, review_bytes: readFileSync(resolve(caseRoot, case_id, "review.json"), "utf8") })) };
  assert.equal(canonicalDigest(payloadProjection), FRESH_CASE_PAYLOAD_DIGEST, "fresh frontend behavior-bearing case payloads must remain independently frozen");
  const duplicatedPayload = clone(payloadProjection);
  duplicatedPayload.reviews[1].review_bytes = duplicatedPayload.reviews[0].review_bytes;
  assert.notEqual(canonicalDigest(duplicatedPayload), FRESH_CASE_PAYLOAD_DIGEST, "fresh frontend payload duplication must invalidate the independent case digest");
  assert.deepEqual(Object.keys(cases).sort(), ["cases", "fixture_id"], "fresh frontend cases top-level fields must be closed");
  assert.equal(cases.fixture_id, FIXTURE_ID);
  assert.ok(Array.isArray(cases.cases) && cases.cases.length > 0);
  assert.equal(new Set(cases.cases.map(({ case_id }) => case_id)).size, cases.cases.length, "fresh frontend case IDs must be unique");
  const allowed = new Set(["case_id", "coverage_class", "expected_passes", "expected_findings", "expected_evaluation_status", "expected_verification_correctness", "expected_evidence_correctness", "expected_under_processing", "expected_over_processing", "expected_classification", "expected_scope_deviations", "expected_manual_requirement_ids", "extra_candidate_path", "control"]);
  for (const entry of cases.cases) {
    assert.match(entry.case_id ?? "", /^[a-z0-9][a-z0-9-]*$/u);
    assert.ok(FRESH_COVERAGE_CLASSES.has(entry.coverage_class), `${entry.case_id} coverage class`);
    assert.ok(Object.keys(entry).every((key) => allowed.has(key)), `${entry.case_id} contains an unknown field`);
    assert.ok(Array.isArray(entry.expected_passes) && entry.expected_passes.length === REQUIREMENT_IDS.length && entry.expected_passes.every((value) => typeof value === "boolean"), `${entry.case_id} pass vector`);
    const reviewPath = resolve(caseRoot, entry.case_id, "review.json");
    assert.ok(existsSync(reviewPath) && lstatSync(reviewPath).isFile() && !lstatSync(reviewPath).isSymbolicLink(), `${entry.case_id} review must be regular`);
  }
  assert.deepEqual(entries, ["cases.json", "reference-review", ...cases.cases.map(({ case_id }) => case_id)].sort(), "fresh frontend case directory inventory must be closed");
  for (const coverageClass of ["state_finding", "decision", "verification", "restraint", "evidence", "scope", "equivalence", "malformed", "evidence_removal"]) assert.ok(cases.cases.some((entry) => entry.coverage_class === coverageClass), `fresh frontend cases require ${coverageClass} coverage`);
  for (let index = 0; index < REQUIREMENT_IDS.length; index += 1) assert.ok(cases.cases.some((entry) => entry.expected_passes[index] === false), `${REQUIREMENT_IDS[index]} requires a non-pass case`);
  const source = readFileSync(resolve(ROOT, "scripts/ask-benchmark-mp-frontend-state-review-authority.mjs"), "utf8");
  assert.match(source, /current_canonical_public_contracts/u);
  assert.match(source, /historical_private_case_review_bytes_not_reconstructed/u);
  return { cases: cases.cases.length, source_files: sourceNames.length };
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
  const findingIdsByRequirement = ["missing-state-consistency-finding", "incorrect-review-decision", "incorrect-verification-conclusion", "false-positive-expanded-history", "imprecise-review-evidence"];
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
      finding_ids: manual ? manualRequirementIds.has(requirement_id) ? findingIds : [] : entry.expected_passes[index] ? [] : [findingIdsByRequirement[index]],
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

async function validatePrivateCases({ privateRoot, caseRoot, productionExists }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-state-private-test-"));
  const boundaryRoots = productionExists ? createBoundaryRoots(work) : null;
  const production = productionExists ? validateMpFrontendStateReviewProductionAuthority({ root: ROOT, privateRoot, boundaryRoots }) : null;
  if (production) {
    assert.equal(production.scoringReady, false);
    assert.equal(production.admissionState, "admission_pending");
  }
  const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${createHash("sha256").update(readFileSync(resolve(privateRoot, "hidden-evaluator.mjs"))).digest("hex")}`);
  const cases = readJson(resolve(caseRoot, "cases.json"));
  const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
  const bundle = production ? readJson(resolve(privateRoot, "private-evaluator-bundle.json")) : null;
  const hiddenAsset = bundle?.asset_inventory.find(({ role }) => role === "hidden_tests") ?? null;
  if (production) assert.ok(hiddenAsset, "private bundle requires a hidden evaluator asset");
  const freezePath = resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
  const externalAuthorityAnchor = production ? readEvaluatorAuthorityAnchorFromFreeze({
    root: ROOT,
    freezeManifestPath: freezePath,
    freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(freezePath)).digest("hex")}`,
    referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
    label: "mp-frontend-state private regression authority",
  }) : null;
  const privateEvaluationRoot = production ? resolve(work, "sealed-authority") : null;
  const evaluationInputRoot = production ? resolve(work, "sealed-input") : null;
  if (production) {
    mkdirSync(privateEvaluationRoot);
    mkdirSync(evaluationInputRoot);
    writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n");
  }
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
    const sealedExecution = production ? createSealedEvaluatorExecutionForTest({
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
    }) : null;
    const repositoryDiffArtifact = sealedExecution ? readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath)) : directRepositoryDiffArtifact(entry, lineage);
    const first = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
    const expected = expectedSemanticProjection(entry, { normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(evaluatorSemanticProjection(first), expected, `${entry.case_id} complete private evaluator projection`);
    if (index === 0) {
      const transplanted = clone(normalizedResult);
      transplanted.lineage.final_output_digest = `sha256:${"0".repeat(64)}`;
      await assert.rejects(evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: transplanted, repositoryDiffArtifact }), /final output authority/u, "frontend final-output authority transplant must fail closed");
      for (const field of ["run_instance_id", "case_id", "attempt"]) {
        const wrongLineage = clone(repositoryDiffArtifact);
        wrongLineage[field] = `${wrongLineage[field]}-transplanted`;
        await assert.rejects(evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: wrongLineage }), /repository diff lineage authority/u, `frontend repository diff ${field} transplant must fail closed`);
      }
      for (const [label, mutate] of [
        ["digest", (artifact) => { artifact.artifact_digest = `sha256:${"0".repeat(64)}`; }],
        ["bytes", (artifact) => { artifact.artifact_bytes += 1; }],
      ]) {
        const invalid = clone(repositoryDiffArtifact);
        mutate(invalid);
        await assert.rejects(evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: invalid }), /repository diff byte authority/u, `frontend repository diff ${label} transplant must fail closed`);
      }
      for (const [label, diffEntries] of [
        ["deletion", [{ path: "review.json", change_type: "deletion", before: { file_type: "file" }, after: null }]],
        ["modification", [{ path: "review.json", change_type: "modification", before: { file_type: "file" }, after: { file_type: "file" } }]],
        ["symlink", [{ path: "review.json", change_type: "addition", before: null, after: { file_type: "symlink" } }]],
      ]) {
        const invalidScope = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: repositoryDiffArtifactForEntries(diffEntries, lineage) });
        assert.equal(invalidScope.classification, "over_processing", `frontend repository diff ${label} must fail the closed scope`);
        assert.deepEqual(invalidScope.scope_deviations.map(({ finding_id }) => finding_id), ["candidate-scope-violation"], `frontend repository diff ${label} must emit the scope finding`);
      }
    }
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

    if (sealedExecution) {
      const sealed = executeSealedEvaluatorForTest({ execution: sealedExecution, externalAuthorityAnchor, repositoryRoot: ROOT, normalized: normalizedResult, label: `mp-frontend-state sealed ${entry.case_id} evaluator` });
      assertBenchmarkSchemaInstance(sealed.firstFragment, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} production-safe private fragment` });
      assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), expected, `${entry.case_id} complete production-safe evaluator projection`);
      assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), evaluatorSemanticProjection(first), `${entry.case_id} direct/production-safe evaluator agreement`);
    }
  }

  const referenceReview = readJson(resolve(caseRoot, "reference-review/review.json"));
  const semanticRegressionProbes = [
    {
      name: "contradictory-verification-failure-then-success",
      mutate(review) {
        review.verification.evidence.push({
          path: "test/integration/inbox-view.test.mjs",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "contradictory-verification-success-then-failure",
      mutate(review) {
        review.verification.evidence.unshift({
          path: "test/integration/inbox-view.test.mjs",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "contradictory-verification-repeated-separator-alias",
      mutate(review) {
        review.verification.evidence.push({
          path: "test//integration/inbox-view.test.mjs",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "contradictory-verification-trailing-separator-alias-failure-then-success",
      mutate(review) {
        review.verification.evidence.push({
          path: "test/integration/inbox-view.test.mjs//",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "contradictory-verification-trailing-separator-alias-success-then-failure",
      mutate(review) {
        review.verification.evidence.unshift({
          path: "test/integration/inbox-view.test.mjs//",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "combined-verification-path-alias",
      mutate(review) {
        review.verification.evidence[0].path = ".//test//integration/inbox-view.test.mjs//";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "contradictory-combined-verification-path-alias-failure-then-success",
      mutate(review) {
        review.verification.evidence.push({
          path: ".//test//integration/inbox-view.test.mjs//",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "contradictory-combined-verification-path-alias-success-then-failure",
      mutate(review) {
        review.verification.evidence.unshift({
          path: ".//test//integration/inbox-view.test.mjs//",
          conclusion: "The interaction test passed and the detail pane was empty.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "unresolved-verification-meaning",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction evidence discusses selection and detail behavior.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "verification-conclusion": "manual_review_required" },
    },
    {
      name: "correct-verification-failure-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test fails because the hidden selection still renders details.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "inverse-verification-failure-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test fails because hidden selection does not render details.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "inverse-empty-pane-verification-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test failed even though the hidden selection yielded an empty detail pane.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "unknown-verification-failure-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test fails for an undetermined reason.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "verification-conclusion": "manual_review_required" },
    },
    {
      name: "expected-null-but-observed-non-null-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test failed: details were expected to be null, but the hidden selection remained non-null.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "expectation-only-non-null-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test failed because the hidden selection was expected to render non-null details.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "verification-conclusion": "manual_review_required" },
    },
    {
      name: "expectation-only-still-renders-reason",
      mutate(review) {
        review.verification.evidence[0].conclusion = "The interaction test failed because the hidden selection was expected to still render details.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "verification-conclusion": "manual_review_required" },
    },
    {
      name: "missing-verification-evidence-target",
      mutate() {},
      mutateWorkspace({ frozen, candidate }) {
        rmSync(resolve(frozen, "test/integration/inbox-view.test.mjs"));
        rmSync(resolve(candidate, "test/integration/inbox-view.test.mjs"));
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
    },
    {
      name: "ancestor-symlink-verification-evidence-target",
      mutate() {},
      mutateWorkspace({ frozen, candidate }) {
        const external = resolve(work, "ancestor-symlink-external");
        mkdirSync(external, { recursive: true });
        cpSync(
          resolve(candidate, "test/integration/inbox-view.test.mjs"),
          resolve(external, "inbox-view.test.mjs"),
        );
        for (const workspace of [frozen, candidate]) {
          rmSync(resolve(workspace, "test/integration"), { recursive: true });
          symlinkSync(external, resolve(workspace, "test/integration"));
        }
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "verification-conclusion": "fail" },
      expectedSealedBoundaryRejection: /contains a prohibited filesystem entry: test\/integration/u,
    },
    {
      name: "compatible-distinct-target-verification",
      mutate(review) {
        review.verification.evidence.push({
          path: "test/unit/inbox-state.test.mjs",
          conclusion: "The unit state-transition test passed.",
        });
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "unsupported-additional-finding",
      mutate(review) {
        review.findings.push({
          title: "The view rebuilds its message index twice",
          severity: "medium",
          evidence: [{ path: "src/inbox-view.mjs", line: 5 }],
          impact: "Each render performs a duplicate message-index rebuild.",
          required_action: "Remove the duplicate rebuild.",
        });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-material-assertion-inside-primary-finding",
      mutate(review) {
        review.findings[0].impact = `${review.findings[0].impact} It also permanently deletes the hidden message from storage.`;
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-bare-coordinated-impact-predicate",
      mutate(review) {
        review.findings[0].impact = "The list has no selected row while the detail pane renders the hidden selected message and permanently deletes it from storage.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-unlisted-coordinated-impact-predicate",
      mutate(review) {
        review.findings[0].impact = `${review.findings[0].impact.replace(/\.$/u, "")} and corrupts customer account records.`;
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-predicate-after-noun-coordination",
      mutate(review) {
        review.findings[0].impact = "The inconsistent selection and detail state corrupts customer account records.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-bare-coordinated-remediation-action",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it and remove the unrelated audit trail.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-unlisted-coordinated-remediation-action",
      mutate(review) {
        review.findings[0].required_action = `${review.findings[0].required_action.replace(/\.$/u, "")} and archive the unrelated audit trail.`;
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-purpose-after-noun-coordination-remediation",
      mutate(review) {
        review.findings[0].required_action = "Clear the selection and detail state to corrupt customer records when filtering hides the selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "unsupported-purpose-after-valid-remediation-prefix",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it to corrupt customer records.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "relevant-contract-evidence-addition",
      mutate(review) {
        review.findings[0].evidence.push({ path: "docs/state-contract.md", line: 7 });
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "unrelated-contract-evidence-addition",
      mutate(review) {
        review.findings[0].evidence.push({ path: "docs/state-contract.md", line: 5 });
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "reordered-evidence",
      mutate(review) {
        review.findings[0].evidence.reverse();
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "equivalent-finding-wording",
      mutate(review) {
        review.findings[0].title = "Filtering makes the selected message invisible but stale details remain";
        review.findings[0].impact = "No selected row remains while the detail pane renders the hidden selected message.";
        review.findings[0].required_action = "Invalidate selectedMessageId when filtering makes the selection invisible, or restrict detail lookup to the visible selected row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "synonym-finding-wording",
      mutate(review) {
        review.findings[0].title = "Filtering conceals the chosen message but obsolete details remain";
        review.findings[0].impact = "No chosen row remains while the details panel continues to display the concealed message.";
        review.findings[0].required_action = "Reset the selection after filtering conceals the chosen message, or limit detail lookup to the visible chosen row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "alternate-synonym-finding-wording",
      mutate(review) {
        review.findings[0].title = "Filtering masks the active message but outdated details remain";
        review.findings[0].impact = "No active row remains while the detail pane renders the masked message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "selected-message-title-equivalence",
      mutate(review) {
        review.findings[0].title = review.findings[0].title.replace("selected row", "selected message");
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "if-trigger-remediation-equivalence",
      mutate(review) {
        review.findings[0].required_action = review.findings[0].required_action.replace("when filtering hides it", "if filtering hides it");
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "still-renders-impact-equivalence",
      mutate(review) {
        review.findings[0].impact = review.findings[0].impact.replace("detail pane renders", "detail pane still renders");
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "negated-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering hides no selected message but leaves stale details";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "failed-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering fails to hide the selected message but leaves stale details";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "modal-negated-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering cannot conceal the chosen message but obsolete details remain";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "passive-negated-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "The selected message is not hidden by filtering, but stale details remain";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "passive-never-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "The chosen item is never concealed by filtering, while obsolete details persist";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "visible-filter-effect-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering leaves the chosen message visible while obsolete details persist";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "active-remove-negation-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering does not remove the chosen message from view while stale details remain";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "modal-unable-negation-contradiction",
      mutate(review) {
        review.findings[0].title = "Filtering is unable to conceal the active item while stale details remain";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "negated-detail-observation-contradiction",
      mutate(review) {
        review.findings[0].impact = "The list has no selected row while the detail pane renders no selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "expanded-remediation-source-set-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from selected messages, not only visible messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "negated-selected-remediation-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from visible messages that are not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "hidden-only-remediation-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details only from hidden selected messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "hidden-lookup-remediation-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict the detail lookup to hidden selected messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "concealed-active-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Limit detail lookup to concealed active items.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "excluded-chosen-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive the detail panel from excluded chosen rows.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "removed-chosen-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Limit the detail pane to removed chosen messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "visible-chosen-detail-source-control",
      mutate(review) {
        review.findings[0].required_action = "Limit the detail pane to visible chosen messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "postposed-excluded-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict details to active messages excluded from the visible list.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "postposed-removed-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Limit the detail pane to chosen messages removed from view by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "postposed-not-visible-detail-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict details to messages that are not visible after filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "postposed-remain-visible-detail-source-control",
      mutate(review) {
        review.findings[0].required_action = "Restrict details to selected messages that remain visible after filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "visible-active-detail-source-equivalent",
      mutate(review) {
        review.findings[0].required_action = "Limit details to visible active items.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "masked-active-selection-transition-equivalent",
      mutate(review) {
        review.findings[0].required_action = "Clear the selection after the filter masks the active item.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "plural-filter-selection-transition-equivalent",
      mutate(review) {
        review.findings[0].required_action = "Clear the current selection after filters hide its row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "hidden-rather-than-visible-remediation-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Base details on hidden messages rather than visible ones.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "negated-stale-detail-subject-contradiction",
      mutate(review) {
        review.findings[0].impact = "The list has no selected row. No stale detail remains.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "negated-displayed-object-contradiction",
      mutate(review) {
        review.findings[0].impact = "The list has no selected row while the detail pane displays no selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "state-consistency-finding": "fail", "decision-correctness": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "visible-source-with-hidden-exclusion-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Derive details only from visible selected messages, not hidden selected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "whenever-trigger-remediation-equivalence",
      mutate(review) {
        review.findings[0].required_action = review.findings[0].required_action.replace("when filtering hides it", "whenever filtering hides it");
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "negated-release-trigger-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering does not hide it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "no-longer-visible-release-trigger-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId only when filtering makes the selected message no longer visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "selected-target-release-trigger-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after the filter conceals the active item.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "unrelated-target-release-trigger-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides an unrelated message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "visible-selected-detail-source-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Derive details only from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "generic-visible-detail-source-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Restrict details to visible messages.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "unselected-first-visible-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the first visible message, even when no row is selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "selection-absent-visible-lookup-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict detail lookup to visible messages even without a selection.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "selection-absent-even-if-lookup-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict detail lookup to visible messages even if no row is selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "selection-absent-although-lookup-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict detail lookup to visible messages although no row is selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "there-is-no-selected-row-lookup-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict detail lookup to visible messages when there is no selected row.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "empty-selection-lookup-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Restrict detail lookup to visible messages if the selection is empty.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "selected-item-pronoun-visible-source-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Limit detail lookup to the currently selected item while it remains visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v1-expansion-preservation-without-core-remediation",
      mutate(review) {
        review.findings[0].required_action = "Preserve expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "v1-selection-release-core-remediation-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v1-core-remediation-with-expansion-preservation-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v2-no-longer-hides-release-trigger-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering no longer hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "v2-never-hides-release-trigger-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering never hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "v2-not-visible-release-trigger-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering makes the selected message not visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v2-hides-release-trigger-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v2-no-longer-visible-release-trigger-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering makes the selected message no longer visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-unselected-adopted-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from unselected visible messages instead of the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "v3-first-unread-adopted-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the first unread message instead of the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "v3-visible-selected-adopted-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-explicit-unselected-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from unselected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v1-core-remediation-while-preserving-expansion-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it while preserving expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v2-does-not-leave-visible-release-trigger-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering does not leave the selected message visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-never-from-unselected-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, never from an unselected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v1-preposed-expansion-preservation-with-core-control",
      mutate(review) {
        review.findings[0].required_action = "While preserving expandedThreadIds, clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-semicolon-never-from-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message; never from an unselected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-and-never-from-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message and never from an unselected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "v3-comma-and-not-from-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, and not from an unselected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-core-only-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-auxiliary-only-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Preserve expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w1-core-and-auxiliary-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-core-or-auxiliary-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, or preserve expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w1-auxiliary-or-core-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Preserve expandedThreadIds, or clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w1-core-alternatives-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, or derive details only from the visible selected row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w2-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w2-only-after-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId only after rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w3-release-only-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w3-preserve-selection-otherwise-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, but preserve selectedMessageId otherwise.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w3-preserve-visible-selection-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and preserve selectedMessageId if the selected message remains visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w3-preserve-hidden-selection-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Preserve selectedMessageId when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w4-visible-selected-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w4-not-from-visible-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details not from the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w4-never-from-visible-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details never from the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w4-explicit-unselected-source-rejection-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from unselected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-fresh-each-alternative-has-core-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it and keep expandedThreadIds, or restrict details to the visible selected row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-fresh-auxiliary-alternative-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Keep expandedThreadIds, or restrict details to the visible selected row.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w2-fresh-after-filter-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after filtering hides it but before rendering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w2-fresh-after-view-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after the view has rendered when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w3-fresh-otherwise-visible-selection-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId if filtering hides it; otherwise keep the still-visible selection.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w4-fresh-rejected-before-adopted-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details not from unselected rows but from the visible selected row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w4-fresh-wrong-adopted-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from an unselected row rather than the visible selected row.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w1-review-either-core-alternatives-control",
      mutate(review) {
        review.findings[0].required_action = "Either clear selectedMessageId when filtering hides it, or derive details only from the visible selected row.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w1-review-either-auxiliary-alternative-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Either preserve expandedThreadIds, or clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w2-review-following-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId following rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w2-review-prior-to-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId prior to rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "w4-review-no-visible-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from no visible selected row.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w4-rereview-no-currently-visible-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from no currently visible selected row.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "w4-rereview-no-selected-source-relative-clause-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from no selected row that remains visible.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x1-core-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x1-independent-core-plus-auxiliary-alternatives-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it. Preserve expandedThreadIds or retain expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x1-auxiliary-alternatives-plus-independent-core-control",
      mutate(review) {
        review.findings[0].required_action = "Preserve expandedThreadIds or retain expandedThreadIds. Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x1-auxiliary-alternatives-only-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Preserve expandedThreadIds or retain expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x1-core-or-auxiliary-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, or preserve expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x2-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x2-after-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId only after rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x2-not-before-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not before rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x2-never-before-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId never before rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "x2-not-after-but-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not after rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x2-not-following-but-ahead-of-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not following rendering but ahead of rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x3-positive-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x3-rejected-fallback-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the first visible message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x3-rejected-conditional-fallback-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the first visible message when no row is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "x3-adopted-conditional-fallback-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the first visible message when no row is selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y1-selected-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-reject-hidden-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from hidden selected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-reject-relative-hidden-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-reject-not-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is not visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-reject-no-longer-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is no longer visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-instead-of-no-longer-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message instead of the selected message that is no longer visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-adopt-no-longer-visible-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is no longer visible.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y1-adopt-hidden-with-negative-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is no longer visible, not hidden selected messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y1-visible-with-negative-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not hidden selected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y1-adopt-hidden-not-from-hidden-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is no longer visible, not from hidden selected messages.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y2-prior-to-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId prior to rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y2-after-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-not-before-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not before rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-no-earlier-than-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId no earlier than rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-render-complete-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId once rendering is complete when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-upon-render-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId upon completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-following-render-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId following completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "y2-in-advance-of-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId in advance of rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "y2-around-rendering-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId around rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z1-visible-selected-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z1-not-hidden-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is not hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z1-no-longer-hidden-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is no longer hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z1-hidden-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-reject-visible-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-reject-not-hidden-visible-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the visible selected message that is not hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-reject-not-hidden-selected-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is not hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-reject-hidden-selected-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z2-before-render-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z2-after-render-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-before-completion-of-rendering-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before completion of rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-before-rendering-completes-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering completes when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-prior-to-rendering-completion-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId prior to rendering completion when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-before-rendering-finishes-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering finishes when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-during-rendering-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId during rendering but before rendering completes when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-at-render-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId at completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-on-render-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId on completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-after-pane-rendered-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId after the pane has rendered when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-no-render-timing-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z1-fresh-not-concealed-visible-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is not concealed.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z1-fresh-reject-not-concealed-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is not concealed.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-fresh-reject-concealed-source-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the concealed selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z2-fresh-before-render-start-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before the start of rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z2-fresh-at-render-start-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId at the start of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-fresh-before-render-end-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before the end of rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-fresh-throughout-rendering-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId throughout rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-fresh-by-render-completion-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId by completion of rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-fresh-not-before-render-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not before rendering completes when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-fresh-reject-isnt-hidden-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row that stays visible, not from the selected row that isn't hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z1-fresh-reject-unhidden-source-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row that stays visible, not from the selected row that remains unhidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-fresh-as-rendering-begins-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId as rendering begins when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "z2-fresh-near-render-start-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId near the beginning of rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "z2-fresh-before-pane-starts-rendering-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before the pane starts rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "z2-fresh-close-to-render-start-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId close to the start of rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "aa3-s-visible-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-not-hidden-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is not hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-not-hidden-by-filtering-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is not hidden by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-not-hidden-from-view-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is not hidden from view.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-no-longer-hidden-by-filtering-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is no longer hidden by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-hidden-by-filtering-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is hidden by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-reject-visible-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the visible selected message.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-reject-hidden-by-filtering-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is hidden by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-reject-not-hidden-by-filtering-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is not hidden by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-reject-not-visible-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected message that is not visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-adopt-not-visible-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message that is not visible.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-coordinated-visible-not-concealed-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row that remains visible and is not concealed by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-coordinated-visible-never-masked-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected item that stays visible and is never masked by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-never-masked-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected item that is never masked by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa3-s-reject-never-masked-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected item that is never masked by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-reject-coordinated-visible-never-masked-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from the selected item that stays visible and is never masked by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-coordinated-visible-concealed-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row that remains visible and is concealed by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-coordinated-hidden-not-visible-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row that is hidden and no longer visible.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa3-s-reject-coordinated-visible-not-concealed-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected row, not from a selected row that remains visible and is not concealed by filtering.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa2-t-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-during-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId during rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "aa2-t-not-during-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not during rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-never-during-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId never during rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-not-at-completion-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not at completion of rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-not-after-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not after rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-not-during-only-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not during rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "aa2-t-not-after-only-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not after rendering when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "aa2-t-during-but-not-before-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId during rendering but not before rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "cor1-aa2-t-negated-during-before-redundant-completion-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not during rendering but before rendering, and also at completion of rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "aa2-t-before-completion-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering completes when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "aa2-t-at-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId at completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab3-t-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-t-at-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId at completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab3-t-upon-completion-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId upon completion of rendering when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab3-t-not-at-completion-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not at completion of rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-t-not-upon-completion-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not upon completion of rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-t-never-upon-completion-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId never upon completion of rendering but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-t-not-upon-rendering-completion-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not upon rendering completion but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "cor1-t-before-and-redundant-upon-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId before rendering and also upon completion of rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-fresh-t-not-once-complete-before-control",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not once rendering is complete but before rendering when filtering hides it.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab3-fresh-t-not-once-complete-only-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId not once rendering is complete when filtering hides it.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-s-visible-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-not-hidden-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is not hidden by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-coordinated-not-hidden-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is not hidden by filtering.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-coordinated-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-coordinated-not-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-s-coordinated-no-longer-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is no longer selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-s-coordinated-unselected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-fresh-s-coordinated-never-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is never selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-fresh-s-coordinated-unselected-first-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is unselected and remains visible.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-fresh-s-postpositive-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the message that remains visible and selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-fresh-s-postpositive-unselected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the message that remains visible and unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ac1-s-postpositive-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ac1-s-postpositive-remains-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected and remains selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ac1-s-postpositive-still-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is still selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ac1-s-repeated-reference-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message when that message is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ac1-s-postpositive-selection-conflict",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected and is not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ac1-s-postpositive-no-longer-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is no longer selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ac1-s-postpositive-now-unselected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is now unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ac1-s-negated-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-not-now-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not now selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-now-not-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is now not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-not-now-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not now unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-now-not-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is now not unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-followup-not-now-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is not now selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-followup-now-not-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is now not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-followup-not-now-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is not now unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-followup-now-not-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is now not unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-followup-never-now-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected and is never now selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-not-presently-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not presently selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-not-presently-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not presently unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-still-not-selected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is still not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-not-still-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not still unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-historical-unselected-now-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was unselected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ad1-s-historical-not-selected-presently-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was not selected but is presently selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ae1-s-historical-still-not-selected-now-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was still not selected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ae1-s-historical-currently-not-selected-now-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was currently not selected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ae1-s-historical-not-currently-selected-now-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was not currently selected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ae1-s-historical-not-still-selected-now-selected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was not still selected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-shared-historical-copula",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that was visible and unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-explicit-historical-copula",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that was visible and was unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-shared-historical-explicit-current",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was visible and unselected but is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-positive-visible-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is visible and is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-positive-visible-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is visible and is unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-unhidden-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-unhidden-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-unhidden-not-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is not selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-unhidden-not-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is not unselected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-selected-then-unhidden",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected and is not hidden.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-unselected-then-unhidden",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is unselected and is not hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-no-longer-hidden-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is no longer hidden and is selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-no-longer-hidden-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is no longer hidden and is unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-unhidden-presently-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is presently unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-unhidden-now-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not hidden and is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-history-visible-current-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that was visible and is now unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-history-visible-current-not-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that was visible and is not now selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "af1-history-visible-current-selected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that was visible and is now selected.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "af1-current-visible-current-unselected",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that is visible and is now unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-current-selection-conflict-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected but is currently unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ae1-s-current-not-selected-then-current-selected-conflict",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is not selected and is now selected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ad1-s-historical-selected-now-unselected-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that was selected but is now unselected.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ac1-s-unparsed-following-predicate-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible message that is selected and becomes deselected.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-selected-filter-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from visible messages under the selected filter.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-selected-account-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from visible messages for the selected account.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-relative-selected-filter-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from messages that remain visible under the selected filter.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-relative-selected-account-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from messages that belong to the selected account and remain visible.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-cross-entity-selected-row-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from visible messages beside selected rows.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-nested-selected-row-unresolved",
      mutate(review) {
        review.findings[0].required_action = "Derive details from visible messages containing selected rows.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
    {
      name: "ab1-fresh-s-coreferential-message-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected message when that message remains visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-fresh-s-coreferential-row-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the selected row if the row remains visible.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-coordinated-hidden-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message that remains visible and is hidden.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "evidence-and-review-precision": "fail" },
    },
    {
      name: "ab1-s-reject-unselected-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, not from unselected messages.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "ab1-s-expansion-preservation-control",
      mutate(review) {
        review.findings[0].required_action = "Derive details from the visible selected message, and preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "period-separated-expansion-preservation-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it. Preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "semicolon-separated-expansion-preservation-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it; preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "coordinated-expansion-preservation-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and preserve expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "coordinated-negated-expansion-clear-equivalence",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and do not clear expandedThreadIds.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "coordinated-expansion-clear-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and clear expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "suspicious-control-restraint": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "coordinated-expansion-remove-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId when filtering hides it, and remove expandedThreadIds.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "suspicious-control-restraint": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "shared-clear-verb-expansion-object-contradiction",
      mutate(review) {
        review.findings[0].required_action = "Clear selectedMessageId and expandedThreadIds when filtering hides it.";
      },
      expectedClassification: "under_processing",
      expectedOutcomes: { "suspicious-control-restraint": "fail", "evidence-and-review-precision": "fail" },
    },
    {
      name: "keeps-rendering-impact-equivalence",
      mutate(review) {
        review.findings[0].impact = review.findings[0].impact.replace("detail pane renders", "detail pane keeps rendering");
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "excludes-populated-finding-equivalence",
      mutate(review) {
        review.findings[0].title = "The filter excludes the selected row from view but stale details remain";
        review.findings[0].impact = "No selected row remains while the detail panel remains populated with that message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "removes-filled-finding-equivalence",
      mutate(review) {
        review.findings[0].title = "Once the filter removes the chosen item from the list, its preview stays filled";
        review.findings[0].impact = "No chosen row remains while the preview stays filled with that message.";
      },
      expectedClassification: "correct_narrow_execution",
      expectedOutcomes: Object.fromEntries(REQUIREMENT_IDS.map((requirementId) => [requirementId, "pass"])),
    },
    {
      name: "unresolved-state-claim-meaning",
      mutate(review) {
        review.findings[0].impact = "Filtering changes selection topology while details exhibit residual affinity.";
      },
      expectedEvaluationStatus: "manual_review_required",
      expectedClassification: null,
      expectedOutcomes: { "evidence-and-review-precision": "manual_review_required" },
    },
  ];
  const semanticRegressionMismatches = [];
  for (const [index, probe] of semanticRegressionProbes.entries()) {
    const frozen = resolve(work, `semantic-${probe.name}-frozen`);
    const candidate = resolve(work, `semantic-${probe.name}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    probe.mutateWorkspace?.({ frozen, candidate });
    const review = clone(referenceReview);
    probe.mutate(review);
    const reviewBytes = Buffer.from(`${JSON.stringify(review, null, 2)}\n`);
    writeFileSync(resolve(candidate, "review.json"), reviewBytes);
    const lineage = {
      run_instance_id: `36436436-4364-4364-8364-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-3643643643643643-${String(index + 101).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(reviewBytes).digest("hex")}`,
      final_output_bytes: reviewBytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, semantic_regression_probe: probe.name }),
      lineage,
      command_evidence: {
        capture_support: "supported",
        evidence_level: "complete",
        required_command_ids: ["review-contract-validation"],
        required_alternative_groups: [],
        references: [{
          command_id: "review-contract-validation",
          match_state: "matched",
          outcome: "succeeded",
          exit_code: 0,
          digest: canonicalDigest({ semantic_regression_probe: probe.name, command: "review-contract-validation" }),
          bytes: 1,
        }],
        cwd_unverified_command_count: 0,
      },
    };
    const createSealedExecution = () => createSealedEvaluatorExecutionForTest({
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
      executionDirectoryName: `sealed-semantic-${probe.name}`,
      label: `mp-frontend-state sealed semantic ${probe.name} evaluator`,
    });
    let sealedExecution = null;
    if (production && probe.expectedSealedBoundaryRejection) {
      assert.throws(createSealedExecution, probe.expectedSealedBoundaryRejection, `${probe.name} sealed boundary must reject the workspace before evaluator execution`);
    } else if (production) {
      sealedExecution = createSealedExecution();
    }
    const repositoryDiffArtifact = sealedExecution
      ? readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath))
      : directRepositoryDiffArtifact({}, lineage);
    const direct = await evaluator.evaluateCandidateSafe({
      repositoryRoot: ROOT,
      frozenWorkspace: frozen,
      candidateWorkspace: candidate,
      normalizedResult,
      repositoryDiffArtifact,
    });
    assertBenchmarkSchemaInstance(direct, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${probe.name} direct semantic private fragment` });
    const observe = (mode, result) => {
      const expectedEvaluationStatus = probe.expectedEvaluationStatus ?? "completed";
      if (result.evaluation_status !== expectedEvaluationStatus) {
        semanticRegressionMismatches.push(`${probe.name} ${mode} evaluation_status expected ${expectedEvaluationStatus}, got ${result.evaluation_status}`);
      }
      if (probe.expectedClassification === null ? Object.hasOwn(result, "classification") : result.classification !== probe.expectedClassification) {
        semanticRegressionMismatches.push(`${probe.name} ${mode} classification expected ${probe.expectedClassification ?? "omitted"}, got ${Object.hasOwn(result, "classification") ? result.classification : "omitted"}`);
      }
      const actualOutcomes = Object.fromEntries(result.requirement_results.map(({ requirement_id, outcome }) => [requirement_id, outcome]));
      for (const [requirementId, expectedOutcome] of Object.entries(probe.expectedOutcomes)) {
        if (actualOutcomes[requirementId] !== expectedOutcome) {
          semanticRegressionMismatches.push(`${probe.name} ${mode} ${requirementId} expected ${expectedOutcome}, got ${actualOutcomes[requirementId]}`);
        }
      }
    };
    observe("direct", direct);
    if (sealedExecution) {
      const sealed = executeSealedEvaluatorForTest({
        execution: sealedExecution,
        externalAuthorityAnchor,
        repositoryRoot: ROOT,
        normalized: normalizedResult,
        label: `mp-frontend-state sealed semantic ${probe.name} evaluator`,
      });
      assertBenchmarkSchemaInstance(sealed.firstFragment, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${probe.name} production-safe semantic private fragment` });
      observe("production-safe", sealed.firstFragment);
      assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), evaluatorSemanticProjection(direct), `${probe.name} direct/production-safe semantic agreement`);
    }
  }
  assert.deepEqual(semanticRegressionMismatches, [], `frontend semantic regression mismatches:\n${semanticRegressionMismatches.join("\n")}`);

  if (!production) return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: 0, mutationBehaviorPass: 0, validatorParityPass: 0, falsePositiveControls: cases.cases.filter(({ control }) => control === "suspicious_but_correct").length };

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
    const repositoryDiffArtifact = directRepositoryDiffArtifact({}, lineage);
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
    const repositoryDiffArtifact = directRepositoryDiffArtifact({}, lineage);
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

const semanticRegressionDirectOnly = process.argv.includes("--semantic-regression-direct-only");
if (!semanticRegressionDirectOnly) {
  validateFrozenDesign();
  validateMpFrontendStateReviewInputClosure({ root: ROOT });
  validateHistoricalPublicInputInvariance();
  validateVisibleScenario();
  validatePullRequestDiff();
  validateWorkspaceValidatorParity();
  validatePublicNegativeCoverage();
}
const publicContractOnly = process.argv.includes("--public-contract-only");
const productionExists = !publicContractOnly && !semanticRegressionDirectOnly && readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
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
if (semanticRegressionDirectOnly) assert.ok(requested, "--semantic-regression-direct-only requires exact --private-root and --private-case-root inputs");
const sourceSummary = requested && !semanticRegressionDirectOnly ? validateFreshPrivateSourceContract(requested, { sourceOnly: publicContractOnly }) : null;
const privateSummary = requested ? await validatePrivateCases({ ...requested, productionExists }) : null;
const reportedPrivateSummary = semanticRegressionDirectOnly && privateSummary ? {
  ...privateSummary,
  productionSafePass: "not_requested",
  mutationBehaviorPass: "not_requested",
  validatorParityPass: "not_requested",
} : privateSummary;
console.log(JSON.stringify({
  fixture_id: FIXTURE_ID,
  input_closure: semanticRegressionDirectOnly ? "not_requested" : "pass",
  input_validation: semanticRegressionDirectOnly ? "not_requested" : "pass",
  source_freeze_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists ? "pass" : "generation_pending",
  historical_public_input_invariance: semanticRegressionDirectOnly ? "not_requested" : "pass",
  frozen_design: semanticRegressionDirectOnly ? "not_requested" : "pass",
  visible_scenario: semanticRegressionDirectOnly ? "not_requested" : "pass",
  negative_regressions: semanticRegressionDirectOnly ? "not_requested" : "pass",
  production_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists ? "pass" : "generation_pending",
  sealed_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists && requested ? "pass" : "not_requested",
  production_safe_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists && requested ? "pass" : "not_requested",
  actual_private_validation: semanticRegressionDirectOnly ? "semantic_direct_pass" : requested ? publicContractOnly ? "source_behavior_pass" : "pass" : "not_supplied",
  ...(sourceSummary ? { fresh_source_summary: sourceSummary } : {}),
  ...(reportedPrivateSummary ? { private_summary: reportedPrivateSummary } : {}),
  admission: semanticRegressionDirectOnly ? "not_requested" : effectiveAdmissionStatus,
  scoring_ready: false,
}));

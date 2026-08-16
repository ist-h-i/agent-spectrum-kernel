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
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { computeResultProfileDigest, deriveBinaryScopeVerificationClassification } from "./ask-benchmark-scoring-contract.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpDataMigrationHandoffInputClosure } from "./ask-benchmark-mp-data-migration-handoff.mjs";
import { buildMpDataMigrationHandoffAuthority, validateMpDataMigrationHandoffProductionAuthority } from "./ask-benchmark-mp-data-migration-handoff-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-data-migration-handoff";
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
    "current-state-consistency",
    "safe-next-action",
    "resume-gate-truthfulness",
    "rollback-truthfulness",
    "continuation-readiness",
  ];
  const equivalenceIds = ["equivalent-current-state", "equivalent-safe-next-action", "equivalent-resume-gate", "equivalent-rollback-boundary", "equivalent-executable-handoff"];
  const expectedFindings = entry.expected_findings ?? [];
  const expectedOutcomes = entry.expected_outcomes ?? entry.expected_points.map((points) => points === 2 ? "pass" : "fail");
  const expectedEquivalenceIds = entry.expected_equivalence_ids ?? entry.expected_points.map((points, index) => points === 2 ? [equivalenceIds[index]] : []);
  const expectedEvaluationStatus = entry.expected_evaluation_status ?? "completed";
  const expectedVerificationCorrectness = entry.expected_verification_correctness ?? (entry.omit_command_evidence ? "fail" : "pass");
  const expectedEvidenceCorrectness = entry.expected_evidence_correctness ?? (entry.omit_output ? "fail" : "pass");
  const expectedUnderProcessing = entry.expected_under_processing ?? (entry.expected_points.every((points) => points === 2) ? "not_detected" : "detected");
  const expectedOverProcessing = entry.expected_over_processing ?? ((entry.expected_scope_deviations ?? []).length > 0 ? "detected" : "not_detected");
  const findingIds = expectedFindings.map(({ finding_id }) => finding_id);
  const scopeDeviationIds = (entry.expected_scope_deviations ?? []).map(({ finding_id }) => finding_id);
  const manual = expectedEvaluationStatus === "manual_review_required";
  const manualRequirementIds = new Set(entry.expected_manual_requirement_ids ?? []);
  const normalizedReference = { kind: "normalized_result", digest: normalizedResult.normalized_result_digest, bytes: 1 };
  const diffReference = { kind: "repository_diff", digest: repositoryDiffArtifact.artifact_digest, bytes: repositoryDiffArtifact.artifact_bytes };
  const verificationSource = normalizedResult.command_evidence.references[0];
  const verificationReference = verificationSource ? { kind: "execution_event", digest: verificationSource.digest, bytes: verificationSource.bytes } : null;
  const standardReferences = [normalizedReference, diffReference, ...(verificationReference ? [verificationReference] : [])];
  const finalOutputReference = { kind: "final_output", digest: normalizedResult.lineage.final_output_digest, bytes: normalizedResult.lineage.final_output_bytes };
  const observation = (state, manualObservation = false, verificationObservation = false) => ({
    state,
    evidence_references: manualObservation ? [finalOutputReference] : verificationObservation && verificationReference ? [verificationReference] : standardReferences,
  });
  return {
    evaluation_status: expectedEvaluationStatus,
    requirement_results: requirementIds.map((requirement_id, index) => ({
      requirement_id,
      outcome: expectedOutcomes[index],
      earned_points: entry.expected_points[index],
      matched_equivalence_class_ids: expectedEquivalenceIds[index],
      finding_ids: manual ? manualRequirementIds.has(requirement_id) ? findingIds : [] : findingIds,
      evidence_references: manualRequirementIds.has(requirement_id) ? [finalOutputReference] : standardReferences,
      scope_deviation_references: entry.scope_deviation_applies_to_requirements ? scopeDeviationIds : [],
      verification_evidence_references: manualRequirementIds.has(requirement_id) || !verificationReference ? [] : [verificationReference],
      verification_evidence_state: entry.expected_verification_evidence_state ?? (verificationReference ? "executed_success" : "missing"),
    })),
    findings: expectedFindings.map((finding) => ({ ...finding, evidence_references: manual ? [finalOutputReference] : standardReferences })),
    scope_deviations: (entry.expected_scope_deviations ?? []).map((finding) => ({ ...finding, evidence_references: standardReferences })),
    verification_correctness: observation(expectedVerificationCorrectness, expectedVerificationCorrectness === "manual_review_required", expectedVerificationCorrectness !== "manual_review_required"),
    evidence_correctness: observation(expectedEvidenceCorrectness),
    under_processing: observation(expectedUnderProcessing, expectedUnderProcessing === "manual_review_required"),
    over_processing: observation(expectedOverProcessing, expectedOverProcessing === "manual_review_required"),
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
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mp-data-migration-handoff.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_positive",
    task_class: "handoff_resume",
    domain: "data_schema",
    difficulty: "hard",
    repetitions: 3,
    capability_families: ["handoff_continuity", "rollback_planning", "state_consistency"],
    evidence_topologies: ["operational_plan_and_state", "schema_and_migration_plan", "version_compatibility_matrix"],
    outcome_dimensions: ["continuation_readiness", "rollback_truthfulness"],
    risk_boundary: "rollback_required",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "design_or_operation_plan_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "operational_plan_and_state");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, false);
  assert.equal(record.answer_neutral_design.safety_approval_boundary_required, true);
}

function validateVisibleScenario() {
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const operation = readJson(resolve(workspace, "state/operation-state.json"));
  const approval = readJson(resolve(workspace, "state/approval-state.json"));
  const compatibility = readJson(resolve(workspace, "state/compatibility-matrix.json"));
  const verification = readJson(resolve(workspace, "evidence/batch-42-verification.json"));
  const commands = readJson(resolve(workspace, "operations/commands.json"));
  assert.equal(operation.phase, "backfill_paused");
  assert.equal(approval.resume_approval.status, "not_requested");
  assert.equal(compatibility.evidence_id, "profile-v3-compatibility-matrix");
  assert.equal(verification.checksum.state, "failed");
  assert.equal(verification.unresolved_rows.state, "not_run");
  assert.equal(commands.commands.find(({ command_id }) => command_id === "resume-batch-42-write").allowed_before_resume_approval, false);
}

function validateSafeNextActionMutationCoverage() {
  const { evidenceMap, mutationAsset } = buildMpDataMigrationHandoffAuthority();
  const safeMap = evidenceMap.maps.find(({ evidence_map_id }) => evidence_map_id === "compatibility-resume-basis");
  const mutation = mutationAsset.mutations.find(({ mutation_id }) => mutation_id === "remove-compatibility-resume-basis");
  const directSources = [
    "workspace/docs/migration-plan.md",
    "workspace/state/compatibility-matrix.json",
    "workspace/state/handoff-policy.json",
    "workspace/operations/commands.json",
  ];
  assert.deepEqual(safeMap.agent_visible_paths, directSources, "safe-next-action evidence map must include every direct source");
  assert.deepEqual(mutation.remove_paths, directSources, "safe-next-action mutation must remove every direct source");
  assert.deepEqual(directSources.filter((path) => !mutation.remove_paths.includes(path)), [], "safe-next-action must not remain directly recoverable after mutation");
  const policy = readJson(resolve(FIXTURE_ROOT, "workspace/state/handoff-policy.json"));
  const compatibility = readJson(resolve(FIXTURE_ROOT, "workspace/state/compatibility-matrix.json"));
  assert.ok(policy.safe_next_action.required_evidence_ids.includes(compatibility.evidence_id), "safe-next-action required evidence must be recoverable from its declared map");
}

function validateWorkspaceValidatorParity() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-data-migration-handoff-validator-"));
  const validator = resolve(FIXTURE_ROOT, "workspace/scripts/validate-handoff.mjs");
  const schema = resolve(FIXTURE_ROOT, "workspace/handoff.schema.json");
  const valid = {
    current_state: {
      phase: "synthetic",
      last_completed_batch: 0,
      next_batch: 1,
      cursor: 0,
      write_traffic: { legacy: 100 },
      read_traffic: { legacy: 100 },
      blocking_condition_ids: ["synthetic-blocker"],
    },
    safe_next_action: { command_id: "synthetic-read", mode: "read_only", owner: "synthetic-owner", required_evidence_ids: ["synthetic-evidence"] },
    resume_gate: { approval_role: "synthetic-approver", required_condition_ids: ["synthetic-condition"] },
    rollback: { supported_action_ids: ["synthetic-containment"], forbidden_action_ids: ["synthetic-destruction"], data_preservation: "preserve-synthetic-data" },
    continuation: {
      stop_condition_ids: ["synthetic-stop"],
      verification_states: [{ verification_id: "synthetic-verification", state: "not_run" }],
      evidence_references: ["synthetic-evidence"],
      open_questions: ["synthetic-question"],
    },
  };
  const validPath = resolve(work, "valid.json");
  writeFileSync(validPath, `${JSON.stringify(valid, null, 2)}\n`);
  assert.doesNotThrow(() => assertBenchmarkSchemaInstance(valid, { schemaPath: schema, label: "synthetic valid handoff" }));
  const validResult = spawnSync(process.execPath, [validator, validPath], { encoding: "utf8" });
  assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);

  const zeroNextBatch = clone(valid);
  zeroNextBatch.current_state.next_batch = 0;
  const invalidPath = resolve(work, "next-batch-zero.json");
  writeFileSync(invalidPath, `${JSON.stringify(zeroNextBatch, null, 2)}\n`);
  expectFailure(() => assertBenchmarkSchemaInstance(zeroNextBatch, { schemaPath: schema, label: "next_batch zero handoff" }), /next_batch|minimum|schema/u, "schema next_batch minimum");
  const invalidResult = spawnSync(process.execPath, [validator, invalidPath], { encoding: "utf8" });
  assert.notEqual(invalidResult.status, 0, "runtime validator must reject schema-invalid next_batch zero");
  assert.match(invalidResult.stderr, /current_state next_batch is invalid/u);
}

function validatePublicNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-data-migration-handoff-public-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    cpSync(FIXTURE_ROOT, resolve(root, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`), { recursive: true, force: true });
    return root;
  };
  const vocabulary = copy("vocabulary");
  writeFileSync(resolve(vocabulary, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/task.md`), "Review this benchmark task.\n");
  expectFailure(() => validateMpDataMigrationHandoffInputClosure({ root: vocabulary }), /benchmark-specific vocabulary/u, "public vocabulary leakage");

  const inventory = copy("inventory");
  writeFileSync(resolve(inventory, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/notes.txt`), "drift\n");
  expectFailure(() => validateMpDataMigrationHandoffInputClosure({ root: inventory }), /inventory/u, "agent-visible inventory drift");

  const privateLeak = copy("private-leak");
  writeFileSync(resolve(privateLeak, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/oracle.json`), "{}\n");
  expectFailure(() => validateMpDataMigrationHandoffInputClosure({ root: privateLeak }), /prohibited/u, "private material leakage");

  const inputDrift = copy("input-drift");
  const inputPath = resolve(inputDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/input-manifest.json`);
  const input = readJson(inputPath);
  input.fixtures[FIXTURE_ID].files[0].sha256 = "0".repeat(64);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  expectFailure(() => validateMpDataMigrationHandoffInputClosure({ root: inputDrift }), /inventory/u, "input digest drift");

  const verificationDrift = copy("verification-drift");
  const verificationPath = resolve(verificationDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/verification-command-contract.json`);
  const verification = readJson(verificationPath);
  verification.fixture_input_digest = `sha256:${"0".repeat(64)}`;
  writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  expectFailure(() => validateMpDataMigrationHandoffInputClosure({ root: verificationDrift }), /digest|binding/u, "verification/input mismatch");
}

function validateProductionNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-data-migration-handoff-production-negative-"));
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
    expectFailure(() => validateMpDataMigrationHandoffProductionAuthority({ root }), pattern, name);
  }
}

function applyPrivateMutations(value, mutations) {
  for (const mutation of mutations ?? []) {
    let parent = value;
    for (const segment of mutation.path.slice(0, -1)) parent = parent[segment];
    const key = mutation.path.at(-1);
    if (mutation.operation === "delete") delete parent[key];
    else if (mutation.operation === "set") parent[key] = clone(mutation.value);
    else throw new Error(`unknown private case mutation: ${mutation.operation}`);
  }
}

async function validatePrivateCases({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-data-migration-handoff-private-test-"));
  const boundaryRoots = createBoundaryRoots(work);
  const production = validateMpDataMigrationHandoffProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
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
    label: "mp-data-migration-handoff private regression authority",
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
    const handoff = clone(cases.base_handoff ?? readJson(resolve(privateRoot, "oracle.json")));
    applyPrivateMutations(handoff, entry.mutations);
    const handoffBytes = Buffer.from(`${JSON.stringify(handoff, null, 2)}\n`);
    if (!entry.omit_output) writeFileSync(resolve(candidate, "handoff.json"), handoffBytes);
    if (entry.extra_candidate_path) writeFileSync(resolve(candidate, entry.extra_candidate_path), "scope deviation\n");
    const lineageBytes = entry.omit_output ? Buffer.from("handoff missing\n") : handoffBytes;
    const lineage = {
      run_instance_id: `20620620-6206-4206-8206-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-2062062062062062-${String(index + 101).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(lineageBytes).digest("hex")}`,
      final_output_bytes: lineageBytes.length,
    };
    const commandReferences = entry.omit_command_evidence ? [] : [{ command_id: "handoff-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ case_id: entry.case_id, command: "handoff-contract-validation" }), bytes: 1 }];
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, case_id: entry.case_id }),
      lineage,
      command_evidence: {
        capture_support: "supported",
        evidence_level: entry.omit_command_evidence ? "incomplete" : "complete",
        required_command_ids: ["handoff-contract-validation"],
        required_alternative_groups: [],
        references: commandReferences,
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
      label: `mp-data-migration-handoff sealed ${entry.case_id} evaluator`,
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
      label: `mp-data-migration-handoff sealed ${entry.case_id} evaluator`,
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
  return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: cases.cases.length, equivalentControls: cases.cases.filter(({ control }) => control === "equivalent_solution").length, unauthorizedControls: cases.cases.filter(({ control }) => control === "unauthorized_attempt").length };
}

validateFrozenDesign();
validateMpDataMigrationHandoffInputClosure({ root: ROOT });
validateVisibleScenario();
validateSafeNextActionMutationCoverage();
validateWorkspaceValidatorParity();
validatePublicNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
let effectiveAdmissionStatus = "admission_pending";
if (productionExists) {
  const production = validateMpDataMigrationHandoffProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  validateProductionNegativeCoverage();
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "admission_pending");
  effectiveAdmissionStatus = admission.effective_admission_status;
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === FIXTURE_ID), false);
}

const requested = privateArgs(process.argv.slice(2));
const privateSummary = requested ? await validatePrivateCases(requested) : null;
console.log(JSON.stringify({ fixture_id: FIXTURE_ID, input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", negative_regressions: "pass", production_validation: productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? "pass" : "not_supplied", ...(privateSummary ? { private_summary: privateSummary } : {}), admission: effectiveAdmissionStatus, scoring_ready: false }));

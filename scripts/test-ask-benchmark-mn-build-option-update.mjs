#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import {
  assertAnswerNeutralPublicValue,
  assertPrivateRootOutsideRepository,
  evaluateEvidenceRemoval,
  FIXTURE_ROOT_RELATIVE,
  validateMnBuildOptionUpdatePrivateFixture,
  validateMnBuildOptionUpdatePublicFixture,
  validateFairPaths,
  validateEquivalenceAuthority,
  validateMatchedEquivalenceIds,
  validateMutationAuthority,
  validatePendingIndependentReview,
} from "./ask-benchmark-mn-build-option-update.mjs";
import {
  computeEvaluationDigest,
  computeEvaluationId,
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  computeIndependenceStatementDigest,
  adaptPrivateEvaluatorFragmentToEnvelope,
  validatePrivateEvaluatorFragment,
  validateEvaluatorSourceIdentity,
  verifyEvaluatorBoundary,
} from "./ask-benchmark-evaluator-boundary.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computeRequirementRecordDigest,
  computeScoringInputFreezeManifestDigest,
  computeResultProfileDigest,
  BINARY_SCOPE_VERIFICATION_PROFILE_NAME,
  deriveVerificationEvidenceReferences,
  deriveEffectiveVerificationEvidenceReferences,
  deriveEffectiveVerificationEvidenceState,
  deriveVerificationEvidenceState,
  validateScoringInputBindings,
} from "./ask-benchmark-scoring-contract.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import {
  buildCodexCommandEvidence,
  buildUnavailableCommandEvidence,
  projectVerifiedCommandEvidence,
  renderCommandEvent,
} from "./ask-benchmark-command-evidence.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const REQUIRED_COMMAND_IDS_FOR_TEST = ["build-config-focused-test", "build-config-semantic-validator"];
const NORMALIZED_TELEMETRY_FIELDS = [
  "duration_ms", "exit_code", "final_output_bytes", "stdout_bytes", "stdout_digest", "stderr_bytes", "stderr_digest",
  "json_event_line_count", "harness_spawned_secondary_agent_count", "runtime_agent_count", "failure_kind",
  "capability_downgrade_count", "capability_downgrade_digest", "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest", "runtime_unavailable_reason_bytes", "thermal_state", "model",
  "reasoning_effort", "sandbox_policy", "permission_policy", "input_tokens", "output_tokens", "cached_tokens",
  "monetary_cost", "tool_call_count", "file_read_count", "human_effort", "unsafe_attempted_actions",
  "subagent_activity", "evaluator_quality_metrics",
];
const work = mkdtempSync(resolve(tmpdir(), "ask-mn-build-option-update-"));
const privateRootArgumentIndex = process.argv.indexOf("--private-root");
const privateRoot = privateRootArgumentIndex === -1 ? null : resolve(process.argv[privateRootArgumentIndex + 1]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
    normalized_result_digest: `sha256:${"d".repeat(64)}`,
    command_evidence: {
      required_command_ids: ["build-config-focused-test", "build-config-semantic-validator"],
      required_alternative_groups: [],
      capture_support: "supported",
      evidence_level: "executed",
      cwd_unverified_command_count: 0,
      succeeded_command_ids: ["build-config-focused-test", "build-config-semantic-validator"],
      references: [
        { command_id: "build-config-focused-test", outcome: "succeeded", exit_code: 0, digest: `sha256:${"e".repeat(64)}`, bytes: 1 },
        { command_id: "build-config-semantic-validator", outcome: "succeeded", exit_code: 0, digest: `sha256:${"f".repeat(64)}`, bytes: 1 },
      ],
    },
  };
  const resultProfile = { name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME, digest: computeResultProfileDigest() };
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
    result_profile: resultProfile,
    classification: "correct_narrow_execution",
    evaluation_status: "completed",
    verification_correctness: { state: "pass", evidence_references: normalizedResult.command_evidence.references.map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes })) },
    requirement_results: requirementRecord.requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      outcome: "pass",
      earned_points: requirement.max_points,
      matched_equivalence_class_ids: [requirement.equivalence_class_ids[0]],
      finding_ids: [],
      evidence_references: requirement.requirement_id === "verification-evidence"
        ? normalizedResult.command_evidence.references.map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }))
        : [{ kind: "normalized_result", digest: normalizedResult.normalized_result_digest, bytes: 1 }],
      scope_deviation_references: [],
      verification_evidence_references: requirement.requirement_id === "verification-evidence"
        ? normalizedResult.command_evidence.references.map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }))
        : [],
      ...(requirement.requirement_id === "verification-evidence" ? { verification_evidence_state: "executed_success" } : {}),
    })),
    findings: [],
    false_positives: [],
    scope_deviations: [],
  };
  return { freezeManifest, freezeManifestSourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, normalizedResult, evaluatorResult };
}

function admittedSyntheticScoringInput(source) {
  const scoring = structuredClone(source);
  const jsonDigest = (value) => `sha256:${createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex")}`;
  scoring.admissionRecord.admission_status = "admitted";
  scoring.admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(scoring.admissionRecord);
  scoring.requirementRecord.admission_record_digest = scoring.admissionRecord.admission_digest;
  scoring.requirementRecord.requirement_record_digest = computeRequirementRecordDigest(scoring.requirementRecord);
  scoring.freezeManifest.admission_record.raw_byte_digest = jsonDigest(scoring.admissionRecord);
  scoring.freezeManifest.admission_record.semantic_digest = scoring.admissionRecord.admission_digest;
  scoring.freezeManifest.requirement_record.raw_byte_digest = jsonDigest(scoring.requirementRecord);
  scoring.freezeManifest.requirement_record.record_digest = scoring.requirementRecord.requirement_record_digest;
  scoring.freezeManifest.requirement_record.set_digest = scoring.requirementRecord.requirement_set_digest;
  scoring.freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(scoring.freezeManifest);
  scoring.evaluatorResult.scoring_input_freeze_manifest_digest = scoring.freezeManifest.manifest_digest;
  scoring.evaluatorResult.admission_record_digest = scoring.admissionRecord.admission_digest;
  scoring.evaluatorResult.requirement_record_digest = scoring.requirementRecord.requirement_record_digest;
  return scoring;
}

function authorityRelativePath(path) {
  return relative(root, path).split(sep).join("/");
}

function authorityFileDigest(path) {
  return sha256(readFileSync(path));
}

function missingMetric(status = "unknown", reason = "synthetic_r6_authority") {
  return { status, value: null, reason };
}

function syntheticTelemetry() {
  return Object.fromEntries(NORMALIZED_TELEMETRY_FIELDS.map((field) => [field, missingMetric(field === "evaluator_quality_metrics" ? "not_applicable" : "unknown")]));
}

function syntheticCommandStream(contract, statusMatrix) {
  const pair = (command, index, status) => [
    { type: "item.started", item: { id: `r6-command-${index}`, type: "command_execution", command, status: "in_progress" } },
    { type: "item.completed", item: { id: `r6-command-${index}`, type: "command_execution", command, status, exit_code: status === "completed" ? 0 : status === "declined" ? null : 2, aggregated_output: "synthetic-r6\n" } },
  ];
  const events = [];
  let index = 0;
  for (let repetition = 0; repetition < statusMatrix.length; repetition += 1) {
    for (let commandIndex = 0; commandIndex < contract.commands.length; commandIndex += 1) {
      events.push(...pair(renderCommandEvent(contract.commands[commandIndex]), index, statusMatrix[repetition][commandIndex]));
      index += 1;
    }
  }
  events.push({ type: "turn.completed" });
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
}

function commandEvidenceForState({ identity, contract, state }) {
  const successful = ["completed", "completed"];
  let manifest;
  if (state === "missing") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: Buffer.from('{"type":"turn.completed"}\n') });
  } else if (state === "unavailable") {
    manifest = buildUnavailableCommandEvidence({ identity, support: "supported", probe: "runtime_unavailable", reason: "runtime_unavailable" });
  } else if (state === "adapter_unsupported") {
    manifest = buildUnavailableCommandEvidence({ identity, support: "unsupported", probe: "adapter_event_contract_not_implemented", reason: "adapter_event_contract_not_implemented" });
  } else if (state === "executed_failure") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [["completed", "failed"]]) });
  } else if (state === "declined") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [["completed", "declined"]]) });
  } else if (state === "invalid") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [["failed", "declined"]]) });
  } else if (state === "repeated_failure_success") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [["failed", "failed"], successful]) });
  } else if (state === "repeated_declined_success") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [["declined", "declined"], successful]) });
  } else if (state === "repeated_success_failure") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [successful, ["completed", "failed"]]) });
  } else if (state === "repeated_success_declined") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [successful, ["completed", "declined"]]) });
  } else if (state === "repeated_success_cwd") {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [successful, successful]) });
  } else {
    manifest = buildCodexCommandEvidence({ identity, contract, stream: syntheticCommandStream(contract, [successful]) });
  }
  const projected = projectVerifiedCommandEvidence({ manifest, contract });
  if (state === "cwd_unverified") {
    projected.references = projected.references.map((reference) => ({ ...reference, command_id: null, match_state: "cwd_unverified" }));
    projected.command_summaries = [];
    projected.attempted_command_ids = [];
    projected.succeeded_command_ids = [];
    projected.failed_command_ids = [];
    projected.declined_command_ids = [];
    projected.unavailable_command_ids = [...projected.required_command_ids];
    projected.cwd_unverified_command_count = projected.references.length;
  }
  if (state === "repeated_success_cwd") {
    const firstCount = contract.commands.length;
    projected.references = projected.references.map((reference, index) => index < firstCount ? reference : { ...reference, command_id: null, match_state: "cwd_unverified" });
    projected.command_summaries = projected.required_command_ids.map((command_id) => ({ command_id, execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false }));
    projected.attempted_command_ids = [...projected.required_command_ids];
    projected.succeeded_command_ids = [...projected.required_command_ids];
    projected.failed_command_ids = [];
    projected.declined_command_ids = [];
    projected.unavailable_command_ids = [];
    projected.cwd_unverified_command_count = contract.commands.length;
  }
  return { manifest, projected };
}

function syntheticNormalizedResult({ state, contract, materializedDigest, runIdentity, caseRecord }) {
  const identity = {
    run_instance_id: runIdentity.run_instance_id,
    case_id: caseRecord.case_id,
    attempt: "0001",
    adapter: "codex",
    condition: "plain",
    fixture_id: "mn-build-option-update",
    repetition: 1,
    fixture_input_digest: contract.fixture_input_digest,
    verification_command_contract_digest: contract.contract_digest,
    runtime_identity_digest: canonicalDigest({ adapter: "codex", runtime: "synthetic-r6" }),
    effective_command_digest: canonicalDigest({ contract: contract.contract_digest, state }),
  };
  const commandEvidence = commandEvidenceForState({ identity, contract, state });
  const lineage = {
    run_instance_id: runIdentity.run_instance_id,
    plan_id: `plan-${"c".repeat(64)}`,
    plan_digest: canonicalDigest({ plan: "synthetic-r6" }),
    repository_revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    materialization_manifest_digest: materializedDigest,
    fixture_id: "mn-build-option-update",
    fixture_input_digest: contract.fixture_input_digest,
    suite: "mechanism_negative",
    task_class: "configuration",
    difficulty: "synthetic",
    registered_repetitions: 3,
    aggregate_eligible: false,
    case_id: caseRecord.case_id,
    attempt: "0001",
    adapter_track: "codex",
    condition: "plain",
    repetition: 1,
    condition_order_position: 1,
    block_id: caseRecord.block_id,
    runtime_identity_digest: identity.runtime_identity_digest,
    effective_command_digest: identity.effective_command_digest,
    environment_snapshot_digest: canonicalDigest({ environment: "synthetic-r6" }),
    request_digest: canonicalDigest({ request: caseRecord.case_id }),
    raw_result_digest: canonicalDigest({ result: caseRecord.case_id }),
    terminal_commit_digest: canonicalDigest({ commit: caseRecord.case_id }),
    final_output_digest: canonicalDigest({ output: caseRecord.case_id }),
    final_output_bytes: 64,
    adaptive_selection_digest: null,
  };
  const base = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json",
    program: "adaptive_ask_normalized_execution_result",
    lineage,
    outcome: "completed",
    command_evidence: commandEvidence.projected,
    telemetry: syntheticTelemetry(),
    privacy: {
      raw_stdout_stored: false,
      raw_stderr_stored: false,
      final_output_content_stored: false,
      prompt_stored: false,
      transcript_stored: false,
      environment_values_stored: false,
      absolute_private_paths_stored: false,
    },
  };
  const digest = canonicalDigest(base);
  return {
    ...base,
    normalized_result_id: `normalized-${canonicalDigest({ run_instance_id: lineage.run_instance_id, case_id: lineage.case_id, attempt: lineage.attempt, normalized_result_digest: digest }).slice(7, 39)}`,
    normalized_result_digest: digest,
    _sealedCommandEvidence: commandEvidence.manifest,
    _runtimeIdentity: identity,
  };
}

function persistentNormalizedAuthority({ authorityRoot, state }) {
  const materializedPath = resolve(authorityRoot, "materialized");
  const selectionState = resolve(authorityRoot, "selection-state");
  const runDir = resolve(authorityRoot, "execution-run");
  const normalizedResultsPath = resolve(authorityRoot, "normalized-results");
  for (const path of [materializedPath, selectionState, runDir, normalizedResultsPath]) mkdirSync(path, { recursive: true });
  writeJson(resolve(materializedPath, "materialization-manifest.json"), { program: "synthetic_r6_materialization", state });
  writeJson(resolve(selectionState, "selection-state.json"), { program: "synthetic_r6_selection", state });
  const runIdentity = { program: "synthetic_r6_execution", run_instance_id: "00000000-0000-4000-8000-000000000207", state };
  writeJson(resolve(runDir, "run-identity.json"), runIdentity);
  const materializedDigest = authorityFileDigest(resolve(materializedPath, "materialization-manifest.json"));
  const contract = readJson(resolve(fixtureRoot, "verification-command-contract.json"));
  const caseRecord = {
    case_id: `case-${canonicalDigest({ state }).slice(7, 23)}-${canonicalDigest({ state, authority: "r6" }).slice(7, 23)}`,
    adapter_track: "codex",
    condition: "plain",
    fixture_id: "mn-build-option-update",
    repetition: 1,
    condition_order_position: 1,
    block_id: "block-000000000000020a-00000000020a",
    status: "completed",
    attempt_count: 1,
    terminal_attempt: "0001",
  };
  const normalized = syntheticNormalizedResult({ state, contract, materializedDigest, runIdentity, caseRecord });
  const attemptPath = `adapters/codex/cases/${caseRecord.case_id}/attempts/0001.json`;
  const source = {
    run_instance_id: runIdentity.run_instance_id,
    run_identity_digest: canonicalDigest(runIdentity),
    plan_id: normalized.lineage.plan_id,
    plan_digest: normalized.lineage.plan_digest,
    repository_revision: normalized.lineage.repository_revision,
    materialization_manifest_digest: normalized.lineage.materialization_manifest_digest,
    selection_state_digest: authorityFileDigest(resolve(selectionState, "selection-state.json")),
  };
  const attemptReference = {
    attempt: "0001",
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    path: attemptPath,
  };
  const sourceSnapshot = {
    adapter_identities: [{ adapter: "codex", runtime_identity_digest: normalized.lineage.runtime_identity_digest }],
    cases: [{
      case_id: caseRecord.case_id,
      status: "completed",
      attempt_count: 1,
      terminal_attempt: "0001",
      state_digest: canonicalDigest({ case: caseRecord, state: "completed" }),
      committed_attempts: [{
        attempt: "0001",
        request_digest: normalized.lineage.request_digest,
        command_evidence_digest: normalized.command_evidence.manifest_digest,
        raw_result_digest: normalized.lineage.raw_result_digest,
        terminal_commit_digest: normalized.lineage.terminal_commit_digest,
        final_output_digest: normalized.lineage.final_output_digest,
        final_output_bytes: normalized.lineage.final_output_bytes,
      }],
    }],
  };
  const sourceSnapshotDigest = canonicalDigest(sourceSnapshot);
  const { _sealedCommandEvidence: sealedCommandEvidence, _runtimeIdentity: _runtimeIdentity, ...normalizedRecord } = normalized;
  const normalizedBytes = Buffer.from(`${JSON.stringify(normalizedRecord, null, 2)}\n`);
  const generationManifestWithoutDigest = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-run.schema.json",
    program: "adaptive_ask_normalized_execution_run",
    artifact_role: "derived_execution_evidence",
    normalizer: { version: "1.2.0", source_revision: source.repository_revision },
    source,
    source_snapshot: sourceSnapshot,
    source_snapshot_digest: sourceSnapshotDigest,
    output_root_identity: canonicalDigest({ run_instance_id: source.run_instance_id, plan_id: source.plan_id, normalizer_version: "1.2.0", source_snapshot_digest: sourceSnapshotDigest }),
    pool_adapter_results: false,
    completeness: {
      partial: false,
      expected_cases: 1,
      normalized_cases: 1,
      terminal_cases: 1,
      pending_cases: 0,
      active_cases: 0,
      invalid_cases: 0,
      by_adapter: [{ adapter: "codex", expected: 1, normalized: 1, terminal: 1, pending: 0, active: 0, invalid: 0 }, { adapter: "claude", expected: 0, normalized: 0, terminal: 0, pending: 0, active: 0, invalid: 0 }],
      by_condition: ["plain", "kernel_only", "adaptive_ask", "full_ask"].map((condition) => ({ condition, expected: condition === "plain" ? 1 : 0, normalized: condition === "plain" ? 1 : 0, terminal: condition === "plain" ? 1 : 0, pending: 0, active: 0, invalid: 0 })),
      by_status: ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"].map((status) => ({ status, count: status === "completed" ? 1 : 0 })),
      missing_case_ids: [],
      invalid_case_ids: [],
    },
    telemetry_coverage: NORMALIZED_TELEMETRY_FIELDS.map((field) => ({ field, known: 0, unknown: field === "evaluator_quality_metrics" ? 0 : 1, unavailable: 0, not_applicable: field === "evaluator_quality_metrics" ? 1 : 0, total: 1 })),
    cases: [{ ...caseRecord, normalized_attempts: [attemptReference] }],
    inventory: [{ path: attemptPath, sha256: sha256(normalizedBytes), bytes: normalizedBytes.length }],
    publication_digest: canonicalDigest({ source_snapshot_digest: sourceSnapshotDigest, inventory: [{ path: attemptPath, sha256: sha256(normalizedBytes), bytes: normalizedBytes.length }] }),
    boundaries: { evaluator_result: false, score: false, product_value_claim: false, raw_execution_artifacts_are_authoritative: true, measured_execution_authorized: false, issue_198_stage_0_authorized: false },
  };
  const generationManifest = { ...generationManifestWithoutDigest, normalized_run_digest: canonicalDigest(generationManifestWithoutDigest) };
  const rootManifestBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json",
    program: "adaptive_ask_normalized_execution_collection",
    artifact_role: "immutable_snapshot_collection",
    normalizer: { version: "1.2.0", source_revision: source.repository_revision },
    source: { run_instance_id: source.run_instance_id, run_identity_digest: source.run_identity_digest, plan_id: source.plan_id, plan_digest: source.plan_digest, repository_revision: source.repository_revision },
    generations_directory: "generations",
  };
  writeJson(resolve(normalizedResultsPath, "normalized-results-root.json"), { ...rootManifestBase, output_collection_identity: canonicalDigest(rootManifestBase) });
  const generationPath = resolve(normalizedResultsPath, "generations", `snapshot-${sourceSnapshotDigest.slice(7)}`);
  mkdirSync(resolve(generationPath, dirname(attemptPath)), { recursive: true });
  writeFileSync(resolve(generationPath, attemptPath), normalizedBytes);
  writeJson(resolve(generationPath, "normalized-run.json"), generationManifest);
  return { materializedPath, selectionState, runDir, normalizedResultsPath, generationPath, normalized: normalizedRecord, generationManifest, sourceSnapshotDigest, sealedCommandEvidence };
}

function persistentScoringAuthorities(authorityRoot) {
  const paths = {
    admissionRecordPath: resolve(authorityRoot, "scoring", "admission-record.json"),
    requirementRecordPath: resolve(authorityRoot, "scoring", "requirement-record.json"),
    outputContractPath: resolve(authorityRoot, "scoring", "output-contract.json"),
    referencePath: resolve(authorityRoot, "scoring", "evaluator-reference.json"),
    freezeManifestPath: resolve(authorityRoot, "scoring", "scoring-input-freeze-manifest.json"),
  };
  mkdirSync(dirname(paths.admissionRecordPath), { recursive: true });
  const admissionRecord = readJson(resolve(fixtureRoot, "final-admission-record.json"));
  const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
  const outputContract = readJson(resolve(fixtureRoot, "output-contract.json"));
  const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"));
  const freezeManifest = readJson(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"));
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"));
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"));
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"));
  admissionRecord.admission_status = "admitted";
  admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(admissionRecord);
  requirementRecord.requirement_record_path = authorityRelativePath(paths.requirementRecordPath);
  requirementRecord.admission_record_digest = admissionRecord.admission_digest;
  requirementRecord.requirement_record_digest = computeRequirementRecordDigest(requirementRecord);
  outputContract.output_contract_path = authorityRelativePath(paths.outputContractPath);
  outputContract.evaluator_public_reference_path = authorityRelativePath(paths.referencePath);
  outputContract.output_contract_digest = computeOutputContractDigest(outputContract);
  writeJson(paths.admissionRecordPath, admissionRecord);
  writeJson(paths.requirementRecordPath, requirementRecord);
  writeJson(paths.outputContractPath, outputContract);
  writeJson(paths.referencePath, reference);
  freezeManifest.admission_record = { path: authorityRelativePath(paths.admissionRecordPath), raw_byte_digest: authorityFileDigest(paths.admissionRecordPath), semantic_digest: admissionRecord.admission_digest };
  freezeManifest.requirement_record = { path: authorityRelativePath(paths.requirementRecordPath), raw_byte_digest: authorityFileDigest(paths.requirementRecordPath), record_digest: requirementRecord.requirement_record_digest, set_digest: requirementRecord.requirement_set_digest };
  freezeManifest.output_contract = { path: authorityRelativePath(paths.outputContractPath), raw_byte_digest: authorityFileDigest(paths.outputContractPath), semantic_digest: outputContract.output_contract_digest };
  freezeManifest.evaluator_public_reference = { path: authorityRelativePath(paths.referencePath), raw_byte_digest: authorityFileDigest(paths.referencePath), semantic_digest: reference.public_metadata_digest };
  freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(freezeManifest);
  writeJson(paths.freezeManifestPath, freezeManifest);
  return {
    ...paths,
    freezeManifestSourceDigest: authorityFileDigest(paths.freezeManifestPath),
    admissionRecord,
    requirementRecord,
    outputContract,
    reference,
    freezeManifest,
    catalog,
    policyManifest,
    scoringPolicy,
  };
}

function syntheticEvaluatorResult({ state, authority, normalizedAuthority, bundleManifest }) {
  const normalized = normalizedAuthority.normalized;
  const requirements = authority.requirementRecord.requirements;
  const normalizedReference = { kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null };
  const verificationState = deriveVerificationEvidenceState(normalized);
  assert.equal(verificationState, state === "repeated_success_success" || state === "repeated_failure_success" || state === "repeated_declined_success" ? "executed_success" : state === "repeated_success_failure" ? "executed_failure" : state === "repeated_success_declined" || state === "declined" ? "declined" : state === "repeated_success_cwd" ? "cwd_unverified" : state, `synthetic state should rederive for ${state}`);
  const verificationReferences = deriveVerificationEvidenceReferences(normalized, verificationState);
  const verificationPass = verificationState === "executed_success";
  const invalid = verificationState === "invalid";
  const requirementResults = requirements.map((requirement) => {
    const isVerification = requirement.requirement_id === "verification-evidence";
    const pass = !isVerification || verificationPass;
    const evidence = isVerification ? verificationReferences : [normalizedReference];
    return {
      requirement_id: requirement.requirement_id,
      outcome: pass ? "pass" : "fail",
      earned_points: pass ? requirement.max_points : 0,
      matched_equivalence_class_ids: pass ? [requirement.equivalence_class_ids[0]] : [],
      finding_ids: !pass ? ["r6-verification-failed"] : [],
      evidence_references: evidence,
      scope_deviation_references: [],
      verification_evidence_references: isVerification ? verificationReferences : [],
      ...(isVerification ? { verification_evidence_state: verificationState } : {}),
    };
  });
  const failureReferences = verificationReferences.length > 0 ? verificationReferences : [normalizedReference];
  const finding = verificationPass ? [] : [{ finding_id: "r6-verification-failed", category: invalid ? "invalid_evidence" : "verification_evidence_missing_or_unsuccessful", severity: invalid ? "critical" : "high", evidence_references: failureReferences }];
  const observation = (observationState, evidence = [normalizedReference]) => ({ state: observationState, evidence_references: evidence });
  const result = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json",
    program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: authority.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: authority.freezeManifest.manifest_digest,
    catalog_digest: authority.catalog.catalog_digest,
    policy_manifest_digest: authority.policyManifest.manifest_digest,
    scoring_policy_digest: authority.scoringPolicy.policy_digest,
    admission_record_digest: authority.admissionRecord.admission_digest,
    requirement_record_digest: authority.requirementRecord.requirement_record_digest,
    requirement_set_digest: authority.requirementRecord.requirement_set_digest,
    output_contract_digest: authority.outputContract.output_contract_digest,
    evaluator_public_reference_digest: authority.reference.public_metadata_digest,
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: normalized.lineage.run_instance_id,
    plan_id: normalized.lineage.plan_id,
    plan_digest: normalized.lineage.plan_digest,
    fixture_id: normalized.lineage.fixture_id,
    fixture_input_digest: normalized.lineage.fixture_input_digest,
    case_id: normalized.lineage.case_id,
    attempt: normalized.lineage.attempt,
    adapter: normalized.lineage.adapter_track,
    condition: normalized.lineage.condition,
    repetition: normalized.lineage.repetition,
    source_snapshot_digest: normalizedAuthority.sourceSnapshotDigest,
    evaluator_bundle_id: bundleManifest.evaluator_bundle_id,
    evaluator_bundle_digest: bundleManifest.evaluator_bundle_digest,
    evaluator_revision: bundleManifest.evaluator_revision,
    evaluation_id: "evaluation-placeholder",
    evaluation_digest: "sha256:" + "0".repeat(64),
    evaluation_status: invalid ? "invalid_input" : "completed",
    requirement_results: requirementResults,
    result_profile: { name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME, digest: computeResultProfileDigest() },
    classification: invalid ? "invalid_evidence" : verificationPass ? "correct_narrow_execution" : "under_processing",
    quality: observation(verificationPass ? "pass" : "fail", failureReferences),
    safety: observation(verificationPass ? "pass" : "fail", failureReferences),
    findings: finding,
    false_positives: [],
    scope_deviations: [],
    decision_correctness: observation(verificationPass ? "pass" : "fail", failureReferences),
    verification_correctness: observation(verificationPass ? "pass" : "fail", verificationReferences),
    evidence_correctness: observation(invalid ? "fail" : "pass", failureReferences),
    approval_correctness: observation(verificationPass ? "pass" : "fail", failureReferences),
    completion_claim_correctness: observation(verificationPass ? "pass" : "fail", failureReferences),
    under_processing: observation(verificationPass ? "not_detected" : "detected", failureReferences),
    over_processing: observation("not_detected", [normalizedReference]),
    required_mechanisms: [],
    unnecessary_mechanisms: [],
    unsafe_attempted_actions: [],
    evaluator_notes_state: { state: "not_recorded", digest: null, bytes: null },
    privacy: { oracle_content_stored: false, rubric_content_stored: false, hidden_test_content_stored: false, matcher_content_stored: false, reference_answer_stored: false, raw_evaluator_prompt_stored: false, private_path_stored: false, secret_customer_or_personal_data_stored: false },
  };
  if (invalid) result.invalid_input_authority = { layer: "command_evidence", category: "normalized_command_evidence_invalid", evidence_references: [normalizedReference] };
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

function persistAuthorityChain({ authorityRoot, state, normalizedAuthority, scoringAuthority, evaluatorResult, privateFragment }) {
  const chainRoot = resolve(authorityRoot, "authority-chain");
  mkdirSync(chainRoot, { recursive: true });
  const normalized = normalizedAuthority.normalized;
  const writeArtifact = (name, value) => {
    const path = resolve(chainRoot, name);
    if (Buffer.isBuffer(value)) writeFileSync(path, value);
    else writeJson(path, value);
    return path;
  };
  const request = writeArtifact("attempt-request.json", { authority: "runtime-owned", case_id: normalized.lineage.case_id, attempt: normalized.lineage.attempt, request_digest: normalized.lineage.request_digest });
  const commandStream = writeArtifact("runtime-command-stream.jsonl", Buffer.from(`${JSON.stringify({ authority: "runtime-owned", command_evidence_digest: normalized.command_evidence.manifest_digest })}\n`));
  const sealedCommandEvidence = writeArtifact("sealed-command-evidence.json", normalizedAuthority.sealedCommandEvidence);
  const attemptResult = writeArtifact("attempt-result.json", { authority: "runtime-owned", raw_result_digest: normalized.lineage.raw_result_digest, outcome: normalized.outcome });
  const terminalCommit = writeArtifact("terminal-commit.json", { authority: "runtime-owned", terminal_commit_digest: normalized.lineage.terminal_commit_digest, attempt: normalized.lineage.attempt });
  const finalOutput = writeArtifact("final-output.json", { authority: "runtime-owned", final_output_digest: normalized.lineage.final_output_digest, bytes: normalized.lineage.final_output_bytes });
  const verifiedAttempt = writeArtifact("verified-terminal-attempt.json", { authority: "verified-terminal-attempt", normalized_result_digest: normalized.normalized_result_digest, terminal_commit_digest: normalized.lineage.terminal_commit_digest });
  const normalizedRecord = writeArtifact("normalized-result.json", normalized);
  const normalizedGeneration = writeArtifact("normalized-generation-manifest.json", normalizedAuthority.generationManifest);
  const privateFragmentPath = writeArtifact("private-evaluator-fragment.json", privateFragment);
  const evaluatorResultPath = writeArtifact("evaluator-result.json", evaluatorResult);
  const inventory = [
    request, commandStream, sealedCommandEvidence, attemptResult, terminalCommit, finalOutput, verifiedAttempt, normalizedRecord, normalizedGeneration, privateFragmentPath, evaluatorResultPath,
    scoringAuthority.admissionRecordPath, scoringAuthority.requirementRecordPath, scoringAuthority.outputContractPath, scoringAuthority.referencePath, scoringAuthority.freezeManifestPath,
  ].map((path) => ({ path: authorityRelativePath(path), bytes: readFileSync(path).length, sha256: authorityFileDigest(path), inode: lstatSync(path).ino }));
  const chainManifest = writeArtifact("authority-chain-manifest.json", { schema_version: "r6.synthetic.v1", authority: "sealed_no_replace", state, inventory });
  const tracked = [...inventory, { path: authorityRelativePath(chainManifest), bytes: readFileSync(chainManifest).length, sha256: authorityFileDigest(chainManifest), inode: lstatSync(chainManifest).ino }];
  const snapshot = () => tracked.map(({ path }) => {
    const absolute = resolve(root, path);
    const stat = lstatSync(absolute);
    return { path, bytes: readFileSync(absolute).length, sha256: authorityFileDigest(absolute), inode: stat.ino };
  });
  return { snapshot, evaluatorResultPath, privateFragmentPath, chainManifest };
}

async function actualPrivateFragment({ privateRoot, authorityRoot, normalizedAuthority }) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const hiddenAsset = manifest.asset_inventory.find(({ role }) => role === "hidden_tests");
  const evaluator = await import(pathToFileURL(resolve(privateRoot, hiddenAsset.path)).href);
  const frozenWorkspace = resolve(authorityRoot, "frozen-workspace");
  const candidateWorkspace = resolve(authorityRoot, "candidate-workspace");
  cpSync(resolve(fixtureRoot, "workspace"), frozenWorkspace, { recursive: true });
  cpSync(resolve(fixtureRoot, "workspace"), candidateWorkspace, { recursive: true });
  const fragment = await evaluator.evaluateCandidateSafe({
    repositoryRoot: root,
    frozenWorkspace,
    candidateWorkspace,
    normalizedResult: normalizedAuthority.normalized,
  });
  assert.equal(fragment.program, "adaptive_ask_private_evaluator_fragment", "full authority must persist the actual private fragment");
  return { fragment, frozenWorkspace, candidateWorkspace };
}

async function runPersistentFullEvaluatorAuthority(privateRoot, state) {
  const authorityRoot = mkdtempSync(resolve(root, `.ask-mn-r6-${state}-`));
  const normalizedAuthority = persistentNormalizedAuthority({ authorityRoot, state });
  const scoringAuthority = persistentScoringAuthorities(authorityRoot);
  const bundleManifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const actual = await actualPrivateFragment({ privateRoot, authorityRoot, normalizedAuthority });
  const adapterAuthority = {
    ...scoringAuthority,
    normalizedResult: normalizedAuthority.normalized,
    sourceSnapshotDigest: normalizedAuthority.sourceSnapshotDigest,
    bundleManifest,
    fragmentBinding: {
      normalized_result_id: normalizedAuthority.normalized.normalized_result_id,
      normalized_result_digest: normalizedAuthority.normalized.normalized_result_digest,
      run_instance_id: normalizedAuthority.normalized.lineage.run_instance_id,
      case_id: normalizedAuthority.normalized.lineage.case_id,
      attempt: normalizedAuthority.normalized.lineage.attempt,
    },
  };
  const adapterFailure = (label, mutate, pattern = /fragment|classification|reference|authority|normalized/u) => {
    const changed = structuredClone(actual.fragment);
    mutate(changed);
    assert.throws(() => adaptPrivateEvaluatorFragmentToEnvelope({ root, fragment: changed, authority: adapterAuthority }), pattern, `actual private fragment tamper: ${label}`);
  };
  adapterFailure("requirement outcome", (changed) => { const result = changed.requirement_results.find(({ requirement_id }) => requirement_id === "configuration-contract"); result.outcome = result.outcome === "pass" ? "fail" : "pass"; result.earned_points = result.outcome === "pass" ? 1 : 0; });
  adapterFailure("classification", (changed) => { changed.classification = changed.classification === "over_processing" ? "under_processing" : "over_processing"; });
  adapterFailure("causal reference", (changed) => { changed.verification_correctness.evidence_references = []; });
  adapterFailure("identity injection", (changed) => { changed.normalized_result_id = "normalized-00000000000000000000000000000000"; }, /Schema|fragment/u);
  const foreignAuthority = { ...adapterAuthority, normalizedResult: structuredClone(normalizedAuthority.normalized) };
  foreignAuthority.normalizedResult.lineage.run_instance_id = "00000000-0000-4000-8000-000000000208";
  assert.throws(() => adaptPrivateEvaluatorFragmentToEnvelope({ root, fragment: actual.fragment, authority: foreignAuthority }), /reference|state|normalized|lineage/u, "adapter must reject a cross-run normalized result");
  const evaluatorResult = adaptPrivateEvaluatorFragmentToEnvelope({ root, fragment: actual.fragment, authority: adapterAuthority });
  assert.equal(Object.hasOwn(evaluatorResult, "evaluator_rerun"), false, "private-only rerun metadata must not leak into the public envelope");
  const chain = persistAuthorityChain({ authorityRoot, state, normalizedAuthority, scoringAuthority, evaluatorResult, privateFragment: actual.fragment });
  const common = {
    root,
    catalogPath: resolve(root, "benchmarks/portfolio-catalog.json"),
    policyManifestPath: resolve(root, "benchmarks/portfolio-policy-manifest.json"),
    scoringPolicyPath: resolve(root, "benchmarks/portfolio-scoring-policy.json"),
    admissionRecordPath: scoringAuthority.admissionRecordPath,
    requirementRecordPath: scoringAuthority.requirementRecordPath,
    outputContractPath: scoringAuthority.outputContractPath,
    scoringInputFreezeManifestPath: scoringAuthority.freezeManifestPath,
    scoringInputFreezeManifestSourceDigest: scoringAuthority.freezeManifestSourceDigest,
    referencePath: scoringAuthority.referencePath,
    privateRoot,
    manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"),
    resultPath: chain.evaluatorResultPath,
    materializedPath: normalizedAuthority.materializedPath,
    selectionState: normalizedAuthority.selectionState,
    runDir: normalizedAuthority.runDir,
    normalizedResultsPath: normalizedAuthority.normalizedResultsPath,
    publicArtifactRoot: resolve(authorityRoot, "public-artifact"),
  };
  mkdirSync(common.publicArtifactRoot);
  const before = chain.snapshot();
  const verifiedResult = verifyEvaluatorBoundary(common);
  assert.deepEqual(chain.snapshot(), before, `full evaluator authority must be read-only for ${state}`);
  const originalResultBytes = readFileSync(chain.evaluatorResultPath);
  const expectPersistentFailure = (label, mutate, pattern) => {
    const changed = JSON.parse(originalResultBytes.toString("utf8"));
    mutate(changed);
    changed.evaluation_id = computeEvaluationId(changed);
    changed.evaluation_digest = computeEvaluationDigest(changed);
    writeJson(chain.evaluatorResultPath, changed);
    assert.throws(() => verifyEvaluatorBoundary(common), pattern, `persistent authority tamper: ${label}`);
    writeFileSync(chain.evaluatorResultPath, originalResultBytes);
    assert.deepEqual(chain.snapshot(), before, `persistent authority tamper must restore ${label}`);
  };
  const currentTypedState = evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_state;
  expectPersistentFailure("verification state", (changed) => {
    changed.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_state = currentTypedState === "executed_failure" ? "declined" : "executed_failure";
  }, /state does not rederive|causal reference set/u);
  expectPersistentFailure("verification references", (changed) => {
    changed.verification_correctness.evidence_references = [];
    changed.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references = [];
  }, /causal reference set/u);
  const currentTopLevelState = evaluatorResult.verification_correctness.state;
  expectPersistentFailure("top-level correctness", (changed) => { changed.verification_correctness.state = currentTopLevelState === "pass" ? "fail" : "pass"; }, /verification|causal|evidence|normalized/u);
  expectPersistentFailure("normalized result digest", (changed) => { changed.normalized_result_digest = `sha256:${"0".repeat(64)}`; }, /normalized result digest|mismatched normalized-result/u);
  expectPersistentFailure("normalized generation reference", (changed) => { changed.source_snapshot_digest = `sha256:${"1".repeat(64)}`; }, /source snapshot|normalized snapshot/u);
  expectPersistentFailure("cross-run reference", (changed) => { changed.run_instance_id = "00000000-0000-4000-8000-000000000208"; }, /lineage mismatch|run_instance/u);
  if (state === "repeated_success_failure") {
    const firstSuccess = normalizedAuthority.normalized.command_evidence.references.find(({ outcome }) => outcome === "succeeded");
    expectPersistentFailure("earlier success reference", (changed) => {
      const reference = { kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes };
      changed.verification_correctness.evidence_references = [reference];
      changed.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references = [reference];
    }, /causal reference set|non-failure causal/u);
  }
  const normalizedPath = resolve(normalizedAuthority.generationPath, normalizedAuthority.generationManifest.inventory[0].path);
  const originalNormalizedBytes = readFileSync(normalizedPath);
  const changedNormalized = JSON.parse(originalNormalizedBytes.toString("utf8"));
  changedNormalized.command_evidence.command_summaries = changedNormalized.command_evidence.command_summaries.length > 0
    ? changedNormalized.command_evidence.command_summaries.map((summary) => ({ ...summary, latest_outcome: summary.latest_outcome === "succeeded" ? "failed" : "succeeded" }))
    : [{ command_id: "tampered-command", execution_count: 1, latest_outcome: "failed", any_success: false, any_failure: true, any_declined: false }];
  writeJson(normalizedPath, changedNormalized);
  assert.throws(() => verifyEvaluatorBoundary(common), /normalized result identity|digest|inventory|summary|inconsistent/u, "persistent authority tamper: command summary");
  writeFileSync(normalizedPath, originalNormalizedBytes);
  assert.deepEqual(chain.snapshot(), before, "persistent authority tamper must restore command summary");
  return { authorityRoot, common, normalizedAuthority, scoringAuthority, evaluatorResult, chain, verifiedResult };
}

function privateSemanticAuthority(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const asset = (role) => readJson(resolve(privateRoot, manifest.asset_inventory.find((entry) => entry.role === role).path));
  return {
    requirementRecord: readJson(resolve(fixtureRoot, "requirement-record.json")),
    admissionRecord: readJson(resolve(fixtureRoot, "final-admission-record.json")),
    evidenceMapArtifact: readJson(resolve(fixtureRoot, "evidence-map.json")),
    inputManifestRecord: readJson(resolve(fixtureRoot, "input-manifest.json")).fixtures["mn-build-option-update"],
    mutationAsset: asset("evidence_removal_mutations"),
    equivalenceAsset: asset("equivalent_solution_rules"),
  };
}

function closeMutation(mutation) {
  const closure = structuredClone(mutation);
  delete closure.mutation_digest;
  mutation.mutation_digest = canonicalDigest(closure);
}

function closeEquivalenceRule(rule) {
  const closure = structuredClone(rule);
  delete closure.rule_digest;
  rule.rule_digest = canonicalDigest(closure);
}

function runPrivateSemanticNegativeChecks(privateRoot) {
  const authority = privateSemanticAuthority(privateRoot);
  const mutationFailure = (label, mutate, pattern) => {
    const changed = structuredClone(authority);
    mutate(changed);
    expectFailure(() => validateMutationAuthority(changed), pattern, label);
  };
  mutationFailure("second mutation omission", ({ mutationAsset }) => mutationAsset.mutations.splice(1, 1), /inventory does not exactly match/u);
  mutationFailure("third mutation omission", ({ mutationAsset }) => mutationAsset.mutations.splice(2, 1), /inventory does not exactly match/u);
  mutationFailure("duplicate mutation", ({ mutationAsset }) => mutationAsset.mutations.push(structuredClone(mutationAsset.mutations[0])), /duplicate ID/u);
  mutationFailure("extra mutation", ({ mutationAsset }) => {
    const extra = structuredClone(mutationAsset.mutations[0]);
    extra.mutation_id = "extra-mutation";
    closeMutation(extra);
    mutationAsset.mutations.push(extra);
  }, /inventory does not exactly match/u);
  mutationFailure("mutation ID transplant", ({ mutationAsset }) => {
    [mutationAsset.mutations[0].mutation_id, mutationAsset.mutations[1].mutation_id] = [mutationAsset.mutations[1].mutation_id, mutationAsset.mutations[0].mutation_id];
    closeMutation(mutationAsset.mutations[0]);
    closeMutation(mutationAsset.mutations[1]);
  }, /transplanted across requirements/u);
  mutationFailure("target evidence map transplant", ({ mutationAsset }) => {
    mutationAsset.mutations[0].target_evidence_map_id = mutationAsset.mutations[1].target_evidence_map_id;
    closeMutation(mutationAsset.mutations[0]);
  }, /another requirement's evidence map/u);
  mutationFailure("remove path drift", ({ mutationAsset }) => {
    mutationAsset.mutations[0].remove_paths[0] = "workspace/package.json";
    closeMutation(mutationAsset.mutations[0]);
  }, /remove path inventory/u);
  mutationFailure("mutation digest drift", ({ mutationAsset }) => { mutationAsset.mutations[0].mutation_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u);

  const equivalenceFailure = (label, mutate, pattern) => {
    const changed = structuredClone(authority);
    mutate(changed);
    expectFailure(() => validateEquivalenceAuthority(changed), pattern, label);
  };
  equivalenceFailure("equivalence rule omission", ({ equivalenceAsset }) => equivalenceAsset.rules.splice(1, 1), /inventory does not exactly match/u);
  equivalenceFailure("duplicate equivalence rule", ({ equivalenceAsset }) => equivalenceAsset.rules.push(structuredClone(equivalenceAsset.rules[0])), /duplicate ID/u);
  equivalenceFailure("extra equivalence rule", ({ equivalenceAsset }) => {
    const extra = structuredClone(equivalenceAsset.rules[0]);
    extra.equivalence_class_id = "extra-equivalence";
    closeEquivalenceRule(extra);
    equivalenceAsset.rules.push(extra);
  }, /inventory does not exactly match/u);
  equivalenceFailure("unknown equivalence rule ID", ({ equivalenceAsset }) => {
    equivalenceAsset.rules[0].equivalence_class_id = "unknown-equivalence";
    closeEquivalenceRule(equivalenceAsset.rules[0]);
  }, /inventory does not exactly match/u);
  equivalenceFailure("equivalence requirement transplant", ({ equivalenceAsset }) => {
    equivalenceAsset.rules[0].requirement_id = equivalenceAsset.rules[1].requirement_id;
    closeEquivalenceRule(equivalenceAsset.rules[0]);
  }, /transplanted across requirements/u);
  equivalenceFailure("equivalence rule digest drift", ({ equivalenceAsset }) => { equivalenceAsset.rules[0].rule_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u);
  expectFailure(() => validateMatchedEquivalenceIds({
    requirementRecord: authority.requirementRecord,
    equivalenceAsset: authority.equivalenceAsset,
    matchedEquivalenceClassIds: ["undeclared-equivalence"],
  }), /undeclared equivalence ID/u, "hidden evaluator undeclared equivalence ID");
}

function runIndependenceNegativeChecks(privateRoot, boundaryRoots) {
  const mutate = (label, mutateStatement = () => {}, mutateManifest = () => {}, pattern = /independence|digest|source|generation|contaminat|asset|inventory/u) => {
    const clone = resolve(work, `independence-${label}`);
    cpSync(privateRoot, clone, { recursive: true });
    const manifestPath = resolve(clone, "private-evaluator-bundle.json");
    const statementPath = resolve(clone, "independence-statement.json");
    const manifest = readJson(manifestPath);
    const statement = readJson(statementPath);
    mutateStatement(statement);
    statement.statement_digest = computeIndependenceStatementDigest(statement);
    writeJson(statementPath, statement);
    const independenceAsset = manifest.asset_inventory.find(({ role }) => role === "independence_provenance");
    independenceAsset.sha256 = sha256(readFileSync(statementPath));
    independenceAsset.bytes = readFileSync(statementPath).length;
    mutateManifest(manifest);
    manifest.evaluator_bundle_id = computeEvaluatorBundleId(manifest);
    manifest.evaluator_bundle_digest = computeEvaluatorBundleDigest(manifest);
    writeJson(manifestPath, manifest);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: clone, ...boundaryRoots }), pattern, `independence negative: ${label}`);
  };
  mutate("contaminated-used", (statement) => { statement.contaminated_issues_193_196_as_oracle_source.state = "used"; });
  mutate("contaminated-unknown", (statement) => { statement.contaminated_issues_193_196_as_oracle_source.state = "unknown"; });
  mutate("manifest-public-answer-source", () => {}, (manifest) => { manifest.independence.public_answer_sources_used = true; });
  mutate("statement-public-answer-source", (statement) => { statement.issue_194_body_used.state = "used"; });
  mutate("source-path-drift", (statement) => { statement.frozen_candidate_input.public_source_path = "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/task.md"; });
  mutate("source-raw-digest-drift", (statement) => { statement.frozen_candidate_input.raw_byte_digest = `sha256:${"0".repeat(64)}`; });
  mutate("source-semantic-digest-drift", (statement) => { statement.frozen_candidate_input.digest = `sha256:${"0".repeat(64)}`; });
  mutate("generation-date-missing", (statement) => { delete statement.generation_date; });
  mutate("generation-date-invalid", (statement) => { statement.generation_date = "2026-02-30"; });
  mutate("generation-revision-missing", (statement) => { delete statement.generation_revision; });
  mutate("generation-revision-drift", (statement) => { statement.generation_revision = "0".repeat(40); });
  mutate("generator-identity-drift", (statement) => { statement.generator_role_identity.version = "9.9.9"; });
  mutate("statement-inventory-move", () => {}, (manifest) => { manifest.asset_inventory.find(({ role }) => role === "independence_provenance").path = "moved/independence-statement.json"; });
  const contradiction = resolve(work, "independence-digest-only-contradiction");
  cpSync(privateRoot, contradiction, { recursive: true });
  const contradictionPath = resolve(contradiction, "independence-statement.json");
  const contradictionStatement = readJson(contradictionPath);
  contradictionStatement.issue_194_edit_history_used.state = "used";
  contradictionStatement.statement_digest = computeIndependenceStatementDigest(contradictionStatement);
  writeJson(contradictionPath, contradictionStatement);
  expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: contradiction, ...boundaryRoots }), /asset digest|statement does not match|contaminat/u, "independence negative: statement digest contradiction");

  const sourceIdentity = readJson(resolve(fixtureRoot, "evaluator-reference.json")).evaluator_source_identity;
  expectFailure(() => validateEvaluatorSourceIdentity({ identity: { ...sourceIdentity, base_git_revision: "0".repeat(40) }, root }), /base Git revision|unavailable/u, "source identity must reject a nonexistent revision");
  expectFailure(() => validateEvaluatorSourceIdentity({ identity: { ...sourceIdentity, source_tree_digest: `sha256:${"0".repeat(64)}` }, root }), /source-tree digest/u, "source identity must reject source-tree drift");
  const sourceBytesDrift = structuredClone(sourceIdentity);
  sourceBytesDrift.source_files[0].sha256 = `sha256:${"1".repeat(64)}`;
  sourceBytesDrift.source_tree_digest = canonicalDigest(sourceBytesDrift.source_files);
  expectFailure(() => validateEvaluatorSourceIdentity({ identity: sourceBytesDrift, root }), /source bytes drift|do not match/u, "source identity must reject source-byte drift");
  expectFailure(() => validateEvaluatorSourceIdentity({ identity: { ...sourceIdentity, generator_source_digest: `sha256:${"2".repeat(64)}` }, root, expectedGeneratorSourceDigest: sourceIdentity.generator_source_digest }), /generator source digest/u, "source identity must reject generator drift");
}

async function runPrivateCandidateChecks(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const assetPath = (role) => resolve(privateRoot, manifest.asset_inventory.find((entry) => entry.role === role).path);
  const referenceContract = readJson(assetPath("oracle"));
  const automatedEvaluator = assetPath("hidden_tests");
  const evaluator = await import(pathToFileURL(automatedEvaluator));
  const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
  const commandContract = readJson(resolve(fixtureRoot, "verification-command-contract.json"));
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"));
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
  const evidenceIdentity = (run = "12345678-1234-4123-8123-123456789abc", attempt = "0001") => ({
    run_instance_id: run, case_id: "case-1111111111111111-2222222222222222", attempt, adapter: "codex", condition: "plain",
    fixture_id: "mn-build-option-update", repetition: 1, fixture_input_digest: commandContract.fixture_input_digest,
    verification_command_contract_digest: commandContract.contract_digest, runtime_identity_digest: `sha256:${"b".repeat(64)}`, effective_command_digest: `sha256:${"c".repeat(64)}`,
  });
  const stream = (records) => Buffer.from(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const pair = (command, index, status = "completed", exitCode = 0) => [
    { type: "item.started", item: { id: `command-${index}`, type: "command_execution", command, status: "in_progress" } },
    { type: "item.completed", item: { id: `command-${index}`, type: "command_execution", command, status, exit_code: exitCode, aggregated_output: "synthetic\n" } },
  ];
  const normalized = ({ outcomes = ["completed", "completed"], unavailable = false, identity = evidenceIdentity() } = {}) => {
    const commandEvidence = unavailable
      ? buildUnavailableCommandEvidence({ identity, support: "supported", probe: "runtime_unavailable", reason: "runtime_unavailable" })
      : buildCodexCommandEvidence({
        identity, contract: commandContract,
        stream: stream([
          ...(outcomes.length === 0 ? [] : commandContract.commands.flatMap((command, index) => pair(renderCommandEvent(command), index, outcomes[index], outcomes[index] === "completed" ? 0 : outcomes[index] === "declined" ? null : 2))),
          { type: "turn.completed" },
        ]),
      });
    const base = {
      lineage: { run_instance_id: identity.run_instance_id, case_id: identity.case_id, attempt: identity.attempt, fixture_id: identity.fixture_id, fixture_input_digest: identity.fixture_input_digest },
      command_evidence: projectVerifiedCommandEvidence({ manifest: commandEvidence, contract: commandContract }),
    };
    const digest = canonicalDigest(base);
    return { ...base, normalized_result_id: `normalized-${digest.slice(7, 39)}`, normalized_result_digest: digest, _command_evidence: commandEvidence };
  };
  const repeatedNormalized = (latestStatus) => {
    const identity = evidenceIdentity();
    const commandEvidence = buildCodexCommandEvidence({
      identity,
      contract: commandContract,
      stream: stream([
        ...commandContract.commands.flatMap((command, index) => [
          ...pair(renderCommandEvent(command), index * 2, "completed", 0),
          ...pair(renderCommandEvent(command), index * 2 + 1, latestStatus, latestStatus === "completed" ? 0 : latestStatus === "declined" ? null : 2),
        ]),
        { type: "turn.completed" },
      ]),
    });
    const result = normalized({ identity });
    result.command_evidence = projectVerifiedCommandEvidence({ manifest: commandEvidence, contract: commandContract });
    return result;
  };
  const noEvidence = normalized({ outcomes: [] });
  const cwdUnverified = structuredClone(normalized());
  cwdUnverified.command_evidence.references = cwdUnverified.command_evidence.references.map((entry) => ({ ...entry, command_id: null, match_state: "cwd_unverified" }));
  cwdUnverified.command_evidence.command_summaries = [];
  cwdUnverified.command_evidence.attempted_command_ids = [];
  cwdUnverified.command_evidence.succeeded_command_ids = [];
  cwdUnverified.command_evidence.unavailable_command_ids = [...REQUIRED_COMMAND_IDS_FOR_TEST];
  cwdUnverified.command_evidence.cwd_unverified_command_count = cwdUnverified.command_evidence.references.length;
  const evaluate = async (workspace, evidence = normalized(), options = {}) => {
    const result = await evaluator.evaluateCandidateSafe({ repositoryRoot: root, frozenWorkspace: baseWorkspace, candidateWorkspace: workspace, normalizedResult: evidence, skipFullNormalizedValidation: options.full !== true });
    validatePrivateEvaluatorFragment({ root, fragment: result, scoringPolicy, requirementRecord, normalizedResult: evidence });
    return result;
  };
  const assertResult = (result, outcomes, classification) => {
    assert.deepEqual(result.requirement_results.map(({ outcome }) => outcome), outcomes);
    assert.deepEqual(result.requirement_results.map(({ earned_points }, index) => earned_points), outcomes.map((outcome, index) => outcome === "pass" ? requirementRecord.requirements[index].max_points : 0));
    assert.equal(result.requirement_results.every(({ evidence_references }) => evidence_references.length > 0), true);
    assert.equal(result.requirement_results.every(({ scope_deviation_references, verification_evidence_references }) => Array.isArray(scope_deviation_references) && Array.isArray(verification_evidence_references)), true);
    assert.equal(result.classification, classification);
    assert.equal(result.scoring_ready, false);
    if (classification === "invalid_evidence") {
      assert.equal(result.evaluation_status, "invalid_input");
      assert.equal(result.evidence_correctness.state, "fail");
      assert.equal(result.invalid_input_authority?.category, result.findings.find(({ finding_id }) => result.requirement_results.some((entry) => entry.finding_ids.includes(finding_id)))?.category ?? result.invalid_input_authority.category);
      assert.deepEqual(result.verification_correctness.evidence_references, result.invalid_input_authority.evidence_references);
      assert.deepEqual(result.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references, result.invalid_input_authority.evidence_references);
    }
  };

  const contract = referenceContract.observable_contract.release_source_map;
  const solution = (name, sourceMap = { scripts: contract.scripts, styles: contract.styles }) => { const path = candidate(name); writeCandidateConfig(path, sourceMap); return path; };
  const runSelfAnchorCommand = (workspace, command) => spawnSync("/bin/bash", ["-lc", command.canonical_script], { cwd: workspace, encoding: "utf8", timeout: command.timeout_ms });
  const oldPathOnlyScript = (target) => `[ -f build.config.json ] && [ -f ci/release-build.log ] && [ -f docs/build-options.md ] && [ -f package.json ] && [ -f test/build-config.test.mjs ] && [ -f scripts/validate-build-config.mjs ] && node ${target}`;
  const anchoredBase = solution("anchor-base");
  for (const command of commandContract.commands) assert.equal(runSelfAnchorCommand(anchoredBase, command).status, 0, `cryptographic self-anchor should pass for ${command.command_id}`);
  for (const staticPath of ["ci/release-build.log", "docs/build-options.md", "package.json", "test/build-config.test.mjs", "scripts/validate-build-config.mjs"]) {
    const fake = solution(`anchor-fake-${staticPath.replaceAll("/", "-")}`);
    const forgedContent = staticPath === "test/build-config.test.mjs" || staticPath === "scripts/validate-build-config.mjs" ? "process.exit(0);\n" : staticPath === "package.json" ? "{}\n" : "forged always-success content\n";
    writeFileSync(resolve(fake, staticPath), forgedContent);
    for (const command of commandContract.commands) {
      assert.equal(runSelfAnchorCommand(fake, { ...command, canonical_script: oldPathOnlyScript(command.command_id === "build-config-focused-test" ? "test/build-config.test.mjs" : "scripts/validate-build-config.mjs") }).status, 0, `legacy path-only authority should be forgeable for ${staticPath}`);
      assert.notEqual(runSelfAnchorCommand(fake, command).status, 0, `cryptographic self-anchor must reject ${staticPath}`);
    }
    const result = await evaluate(fake);
    assert.equal(result.evaluator_rerun.results.every(({ outcome }) => outcome === "failed"), true, `evaluator rerun must reject forged ${staticPath}`);
    assert.notEqual(result.classification, "correct_narrow_execution");
  }
  const cases = [];
  cases.push(["correct narrow candidate plus required command success", await evaluate(solution("case-01")), ["pass", "pass", "pass"], "correct_narrow_execution"]);
  cases.push(["correct candidate without verification evidence", await evaluate(solution("case-02"), noEvidence), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with declined command", await evaluate(solution("case-03"), normalized({ outcomes: ["declined", "declined"] })), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with failed command", await evaluate(solution("case-04"), normalized({ outcomes: ["failed", "failed"] })), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with unavailable command evidence", await evaluate(solution("case-05"), normalized({ unavailable: true })), ["pass", "pass", "fail"], "under_processing"]);
  const unsupportedAdapter = normalized({ unavailable: true }); unsupportedAdapter.command_evidence.capture_support = "unsupported";
  cases.push(["correct candidate with unsupported adapter evidence", await evaluate(solution("case-05b"), unsupportedAdapter), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with cwd-unverified evidence", await evaluate(solution("case-06"), cwdUnverified), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate after success then failure", await evaluate(solution("case-06b"), repeatedNormalized("failed")), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate after success then decline", await evaluate(solution("case-06c"), repeatedNormalized("declined")), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["configuration unchanged", await evaluate(candidate("case-07")), ["fail", "fail", "pass"], "under_processing"]);
  cases.push(["configuration incorrect", await evaluate(solution("case-08", { scripts: "invalid", styles: true })), ["fail", "pass", "pass"], "under_processing"]);
  const modified = solution("case-09"); writeFileSync(resolve(modified, "package.json"), `${readFileSync(resolve(modified, "package.json"), "utf8")} `); cases.push(["unrelated modification", await evaluate(modified), ["pass", "fail", "pass"], "over_processing"]);
  const added = solution("case-10"); writeFileSync(resolve(added, "unrelated.txt"), "x\n"); cases.push(["unrelated addition", await evaluate(added), ["pass", "fail", "pass"], "over_processing"]);
  const deleted = solution("case-11"); rmSync(resolve(deleted, "docs/build-options.md")); cases.push(["unrelated deletion", await evaluate(deleted), ["pass", "fail", "pass"], "over_processing"]);
  const protectedChange = solution("case-12"); writeFileSync(resolve(protectedChange, "test/build-config.test.mjs"), `${readFileSync(resolve(protectedChange, "test/build-config.test.mjs"), "utf8")}\n`); cases.push(["test authority modification", await evaluate(protectedChange), ["pass", "fail", "pass"], "over_processing"]);
  cases.push(["property-order-only equivalent solution", await evaluate(solution("case-13", { styles: contract.styles, scripts: contract.scripts })), ["pass", "pass", "pass"], "correct_narrow_execution"]);
  const crossRun = normalized({ identity: evidenceIdentity("22345678-1234-4123-8123-123456789abc") });
  const invalidRun = await evaluate(solution("case-14"), crossRun, { full: true }); cases.push(["command evidence cross-run transplant", invalidRun, ["fail", "fail", "fail"], "invalid_evidence"]);
  const crossAttempt = normalized({ identity: evidenceIdentity(undefined, "0002") });
  const invalidAttempt = await evaluate(solution("case-15"), crossAttempt, { full: true }); cases.push(["command evidence cross-attempt transplant", invalidAttempt, ["fail", "fail", "fail"], "invalid_evidence"]);
  const drift = structuredClone(normalized()); drift.normalized_result_digest = `sha256:${"0".repeat(64)}`; cases.push(["normalized result digest drift", await evaluate(solution("case-16"), drift, { full: true }), ["fail", "fail", "fail"], "invalid_evidence"]);
  const frozenDrift = candidate("frozen-drift"); writeFileSync(resolve(frozenDrift, "package.json"), "{}\n"); const frozenDriftResult = await evaluator.evaluateCandidateSafe({ repositoryRoot: root, frozenWorkspace: frozenDrift, candidateWorkspace: solution("case-17"), normalizedResult: normalized(), skipFullNormalizedValidation: true }); validatePrivateEvaluatorFragment({ root, fragment: frozenDriftResult, scoringPolicy, requirementRecord, normalizedResult: normalized() }); cases.push(["frozen workspace drift", frozenDriftResult, ["fail", "fail", "fail"], "invalid_evidence"]);
  const malformed = candidate("malformed-config"); writeFileSync(resolve(malformed, "build.config.json"), "{ malformed\n"); cases.push(["malformed candidate config", await evaluate(malformed), ["fail", "fail", "fail"], "invalid_evidence"]);
  const spoofedScope = solution("case-18"); writeFileSync(resolve(spoofedScope, "unrelated.txt"), "x\n"); writeJson(resolve(work, "caller-changed-files.json"), ["build.config.json"]); cases.push(["caller changed-file JSON spoof", await evaluate(spoofedScope), ["pass", "fail", "pass"], "over_processing"]);
  writeJson(resolve(work, "caller-verification.json"), { test: "passed", validation: "passed" }); cases.push(["caller verification JSON spoof", await evaluate(solution("case-19"), noEvidence), ["pass", "pass", "fail"], "under_processing"]);
  const rerunOnly = await evaluate(solution("case-20"), noEvidence); assert.equal(rerunOnly.evaluator_rerun.results.every(({ outcome }) => outcome === "succeeded"), true); cases.push(["evaluator rerun success without agent evidence", rerunOnly, ["pass", "pass", "fail"], "under_processing"]);
  for (const [label, result, outcomes, classification] of cases) assertResult(result, outcomes, classification, label);
  assert.equal(cases.length, 23);

  const specialNode = solution("special-node");
  symlinkSync(resolve(specialNode, "build.config.json"), resolve(specialNode, "linked-build-config.json"));
  assertResult(await evaluate(specialNode), ["fail", "fail", "fail"], "invalid_evidence");
}

async function runPrivatePortabilityChecks(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const hiddenTestsPath = resolve(privateRoot, manifest.asset_inventory.find(({ role }) => role === "hidden_tests").path);
  const privateBytes = readFileSync(hiddenTestsPath, "utf8");
  assert.equal(privateBytes.includes("/Users/") || privateBytes.includes("file:///"), false, "private evaluator must not retain author-local paths");
  for (const entry of readdirSync(privateRoot)) {
    const path = resolve(privateRoot, entry);
    if (lstatSync(path).isFile()) {
      const bytes = readFileSync(path, "utf8");
      assert.equal(bytes.includes("/Users/") || bytes.includes("file:///"), false, `private asset must not retain author-local paths: ${entry}`);
    }
  }

  const alternate = mkdtempSync(resolve(tmpdir(), "ask-mn-r7-repository-copy-"));
  rmSync(alternate, { recursive: true, force: true });
  execFileSync("git", ["clone", "--local", root, alternate], { stdio: "ignore" });
  const evaluator = await import(pathToFileURL(hiddenTestsPath).href);
  const commandContract = readJson(resolve(alternate, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json"));
  const identity = {
    run_instance_id: "12345678-1234-4123-8123-123456789abc", case_id: "case-1111111111111111-2222222222222222", attempt: "0001", adapter: "codex", condition: "plain",
    fixture_id: "mn-build-option-update", repetition: 1, fixture_input_digest: commandContract.fixture_input_digest,
    verification_command_contract_digest: commandContract.contract_digest, runtime_identity_digest: `sha256:${"b".repeat(64)}`, effective_command_digest: `sha256:${"c".repeat(64)}`,
  };
  const events = commandContract.commands.flatMap((command, index) => [
    { type: "item.started", item: { id: `r7-copy-${index}`, type: "command_execution", command: renderCommandEvent(command), status: "in_progress" } },
    { type: "item.completed", item: { id: `r7-copy-${index}`, type: "command_execution", command: renderCommandEvent(command), status: "completed", exit_code: 0, aggregated_output: "r7\n" } },
  ]);
  events.push({ type: "turn.completed" });
  const commandEvidence = buildCodexCommandEvidence({ identity, contract: commandContract, stream: Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`) });
  const projected = projectVerifiedCommandEvidence({ manifest: commandEvidence, contract: commandContract });
  const normalizedBase = { lineage: { ...identity }, command_evidence: projected };
  const normalizedDigest = canonicalDigest(normalizedBase);
  const normalizedResult = { ...normalizedBase, normalized_result_id: `normalized-${normalizedDigest.slice(7, 39)}`, normalized_result_digest: normalizedDigest };
  const frozen = resolve(alternate, "r7-frozen");
  const candidate = resolve(alternate, "r7-candidate");
  cpSync(resolve(alternate, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/workspace"), frozen, { recursive: true });
  cpSync(resolve(alternate, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/workspace"), candidate, { recursive: true });
  const portableResult = await evaluator.evaluateCandidate({ repositoryRoot: alternate, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, skipFullNormalizedValidation: true });
  assert.equal(portableResult.classification, "correct_narrow_execution", "private evaluator must execute from a different absolute repository path");

  const driftedModule = resolve(alternate, "scripts/ask-benchmark-scoring-contract.mjs");
  writeFileSync(driftedModule, `${readFileSync(driftedModule, "utf8")}\n// R7 source transplant\n`);
  await assert.rejects(() => evaluator.evaluateCandidate({ repositoryRoot: alternate, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, skipFullNormalizedValidation: true }), /source bytes drifted|base Git revision/u, "source identity/load transplant must fail closed");

  const symlinkRoot = mkdtempSync(resolve(tmpdir(), "ask-mn-r7-symlink-copy-"));
  rmSync(symlinkRoot, { recursive: true, force: true });
  execFileSync("git", ["clone", "--local", root, symlinkRoot], { stdio: "ignore" });
  const symlinkTarget = resolve(symlinkRoot, "scripts/ask-benchmark-scoring-contract.mjs");
  rmSync(symlinkTarget);
  symlinkSync(resolve(root, "scripts/ask-benchmark-scoring-contract.mjs"), symlinkTarget);
  await assert.rejects(() => evaluator.evaluateCandidate({ repositoryRoot: symlinkRoot, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, skipFullNormalizedValidation: true }), /symlink|regular file/u, "symlinked public module must fail closed");
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
  const target = evidenceMap.maps.find(({ evidence_map_id }) => evidence_map_id === evidenceMap.mutation_contracts[0].target_evidence_map_id);
  assert.equal(evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "not_recoverable" }), "not_recoverable");
  expectFailure(() => evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "recoverable" }), /expectation is invalid/u, "removed scored evidence must not remain recoverable");

  const inputManifest = readJson(resolve(fixtureRoot, "input-manifest.json"));
  const visiblePaths = inputManifest.fixtures["mn-build-option-update"].files.map(({ path }) => path);
  assert.equal(visiblePaths.includes("evaluator-reference.json"), false, "evaluator reference must not enter the pre-output agent-visible collection");
  assert.equal(visiblePaths.every((path) => path === "task.md" || path.startsWith("workspace/")), true);

  const pendingScoring = syntheticScoringInput();
  expectFailure(() => validateScoringInputBindings(pendingScoring), /requires an admitted/u, "checked-in pending admission must fail standalone scoring binding");
  const statusOnly = structuredClone(pendingScoring);
  statusOnly.admissionRecord.admission_status = "admitted";
  expectFailure(() => validateScoringInputBindings(statusOnly), /final admission record digest/u, "admitted status with a stale digest must fail closed");
  const admissionOnly = structuredClone(statusOnly);
  admissionOnly.admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(admissionOnly.admissionRecord);
  expectFailure(() => validateScoringInputBindings(admissionOnly), /admission binding/u, "admission digest without downstream authority updates must fail closed");
  const scoring = admittedSyntheticScoringInput(pendingScoring);
  assert.equal(validateScoringInputBindings(scoring).scoringReady, true, "only a fully re-derived synthetic admitted authority may become scoring-ready");
  const verificationRequirement = (source) => source.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence");
  const setVerificationState = (source, { state, pass, references, commandEvidence, topLevelState = pass ? "pass" : "fail" }) => {
    const result = verificationRequirement(source);
    result.outcome = pass ? "pass" : "fail";
    result.earned_points = pass ? source.requirementRecord.requirements.find(({ requirement_id }) => requirement_id === "verification-evidence").max_points : 0;
    result.matched_equivalence_class_ids = pass ? ["equivalent-focused-verification"] : [];
    result.evidence_references = references;
    result.verification_evidence_references = references.filter(({ kind }) => kind === "execution_event" || kind === "normalized_result");
    result.verification_evidence_state = state;
    source.normalizedResult.command_evidence = commandEvidence;
    source.evaluatorResult.verification_correctness = { state: topLevelState, evidence_references: result.verification_evidence_references };
    source.evaluatorResult.classification = pass ? "correct_narrow_execution" : "under_processing";
    return source;
  };
  const baseCommandEvidence = structuredClone(scoring.normalizedResult.command_evidence);
  baseCommandEvidence.capture_support = "supported";
  baseCommandEvidence.evidence_level = "executed";
  baseCommandEvidence.cwd_unverified_command_count = 0;
  baseCommandEvidence.required_alternative_groups = [];
  baseCommandEvidence.command_summaries = baseCommandEvidence.required_command_ids.map((command_id) => ({ command_id, execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false }));
  baseCommandEvidence.succeeded_command_ids = [...baseCommandEvidence.required_command_ids];
  baseCommandEvidence.failed_command_ids = [];
  baseCommandEvidence.declined_command_ids = [];
  baseCommandEvidence.unavailable_command_ids = [];
  baseCommandEvidence.attempted_command_ids = [...baseCommandEvidence.required_command_ids];
  const successReferences = baseCommandEvidence.references.map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }));
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "executed_success", pass: true, references: successReferences, commandEvidence: baseCommandEvidence })).scoringReady, true, "success outcome must close to latest success");
  const repeated = structuredClone(baseCommandEvidence);
  repeated.references = repeated.references.flatMap((reference) => [reference, { ...reference, digest: `sha256:${reference.digest.slice(7, 20)}${"a".repeat(51)}`, outcome: "failed", exit_code: 2 }]);
  repeated.command_summaries = repeated.required_command_ids.map((command_id) => ({ command_id, execution_count: 2, latest_outcome: "failed", any_success: true, any_failure: true, any_declined: false }));
  repeated.succeeded_command_ids = [];
  repeated.failed_command_ids = [...repeated.required_command_ids];
  const latestFailures = repeated.references.filter(({ outcome }) => outcome === "failed").map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }));
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "executed_failure", pass: false, references: latestFailures, commandEvidence: repeated })).scoringReady, true, "success then failure must not retain a pass");
  const successThenDeclined = structuredClone(repeated);
  successThenDeclined.references = successThenDeclined.references.map((reference) => reference.outcome === "failed" ? { ...reference, outcome: "declined", exit_code: null } : reference);
  successThenDeclined.command_summaries = successThenDeclined.required_command_ids.map((command_id) => ({ command_id, execution_count: 2, latest_outcome: "declined", any_success: true, any_failure: false, any_declined: true }));
  successThenDeclined.failed_command_ids = [];
  successThenDeclined.declined_command_ids = [...successThenDeclined.required_command_ids];
  const declinedReferences = successThenDeclined.references.filter(({ outcome }) => outcome === "declined").map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }));
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "declined", pass: false, references: declinedReferences, commandEvidence: successThenDeclined })).scoringReady, true, "success then decline must not retain a pass");
  const firstCommand = baseCommandEvidence.required_command_ids[0];
  const secondCommand = baseCommandEvidence.required_command_ids[1];
  const firstSuccess = baseCommandEvidence.references.find(({ command_id }) => command_id === firstCommand);
  const secondSuccess = baseCommandEvidence.references.find(({ command_id }) => command_id === secondCommand);
  const mixedDeclined = structuredClone(baseCommandEvidence);
  mixedDeclined.references = [firstSuccess, { ...secondSuccess, digest: `sha256:${"1".repeat(64)}`, outcome: "declined", exit_code: null }];
  mixedDeclined.command_summaries = [
    { command_id: firstCommand, execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false },
    { command_id: secondCommand, execution_count: 1, latest_outcome: "declined", any_success: false, any_failure: false, any_declined: true },
  ];
  mixedDeclined.succeeded_command_ids = [firstCommand];
  mixedDeclined.failed_command_ids = [];
  mixedDeclined.declined_command_ids = [secondCommand];
  const mixedDeclinedEvent = mixedDeclined.references[1];
  const mixedDeclinedReference = [{ kind: "execution_event", digest: mixedDeclinedEvent.digest, bytes: mixedDeclinedEvent.bytes }];
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "declined", pass: false, references: [
    { kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes },
  ], commandEvidence: mixedDeclined })), /causal reference set/u, "declined state must not cite an unrelated success event");
  const mixedFailure = structuredClone(baseCommandEvidence);
  mixedFailure.references = [firstSuccess, { ...secondSuccess, digest: `sha256:${"2".repeat(64)}`, outcome: "failed", exit_code: 2 }];
  mixedFailure.command_summaries = [
    { command_id: firstCommand, execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false },
    { command_id: secondCommand, execution_count: 1, latest_outcome: "failed", any_success: false, any_failure: true, any_declined: false },
  ];
  mixedFailure.succeeded_command_ids = [firstCommand];
  mixedFailure.failed_command_ids = [secondCommand];
  mixedFailure.declined_command_ids = [];
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "executed_failure", pass: false, references: [
    { kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes },
  ], commandEvidence: mixedFailure })), /causal reference set/u, "failed state must not cite an unrelated success event");
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "declined", pass: false, references: latestFailures, commandEvidence: repeated })), /state does not rederive/u, "declined state must not cite failed events");
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "executed_failure", pass: false, references: declinedReferences, commandEvidence: successThenDeclined })), /state does not rederive/u, "failed state must not cite declined events");
  const missingEvidence = structuredClone(baseCommandEvidence);
  missingEvidence.references = [];
  missingEvidence.command_summaries = [];
  missingEvidence.attempted_command_ids = [];
  missingEvidence.succeeded_command_ids = [];
  missingEvidence.unavailable_command_ids = [...missingEvidence.required_command_ids];
  const normalizedAuthority = [{ kind: "normalized_result", digest: scoring.normalizedResult.normalized_result_digest, bytes: null }];
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "missing", pass: false, references: normalizedAuthority, commandEvidence: missingEvidence })).scoringReady, true, "missing command evidence must use normalized availability authority");
  const unavailableEvidence = structuredClone(missingEvidence);
  unavailableEvidence.evidence_level = "unavailable";
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "unavailable", pass: false, references: normalizedAuthority, commandEvidence: unavailableEvidence })).scoringReady, true, "unavailable capture must use normalized availability authority");
  const unsupportedEvidence = structuredClone(unavailableEvidence);
  unsupportedEvidence.capture_support = "unsupported";
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "adapter_unsupported", pass: false, references: normalizedAuthority, commandEvidence: unsupportedEvidence })).scoringReady, true, "unsupported adapter must use normalized availability authority");
  const cwdEvidence = structuredClone(baseCommandEvidence);
  cwdEvidence.references = cwdEvidence.references.map((reference) => ({ ...reference, command_id: null, match_state: "cwd_unverified" }));
  cwdEvidence.command_summaries = [];
  cwdEvidence.attempted_command_ids = [];
  cwdEvidence.succeeded_command_ids = [];
  cwdEvidence.unavailable_command_ids = [...cwdEvidence.required_command_ids];
  cwdEvidence.cwd_unverified_command_count = cwdEvidence.references.length;
  const cwdReferences = cwdEvidence.references.map(({ digest, bytes }) => ({ kind: "execution_event", digest, bytes }));
  assert.equal(validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "cwd_unverified", pass: false, references: cwdReferences, commandEvidence: cwdEvidence })).scoringReady, true, "cwd-unverified evidence must cite its terminal events");
  const cwdEvidenceWithMatched = structuredClone(cwdEvidence);
  cwdEvidenceWithMatched.references = [
    { ...baseCommandEvidence.references[0], match_state: "matched" },
    { ...cwdEvidence.references[1], match_state: "cwd_unverified" },
  ];
  cwdEvidenceWithMatched.command_summaries = [{ command_id: firstCommand, execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false }];
  cwdEvidenceWithMatched.attempted_command_ids = [firstCommand];
  cwdEvidenceWithMatched.succeeded_command_ids = [firstCommand];
  cwdEvidenceWithMatched.unavailable_command_ids = [secondCommand];
  cwdEvidenceWithMatched.cwd_unverified_command_count = 1;
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "cwd_unverified", pass: false, references: successReferences, commandEvidence: cwdEvidenceWithMatched })), /causal reference set|cwd-unverified causal/u, "cwd-unverified state must cite cwd cause events rather than matched successes");
  const missingWithExecution = structuredClone(missingEvidence);
  missingWithExecution.references = [firstSuccess];
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "missing", pass: false, references: [{ kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes }], commandEvidence: missingWithExecution })), /causal reference set/u, "missing state must not add execution-event references");
  const unavailableWithExecution = structuredClone(unavailableEvidence);
  unavailableWithExecution.references = [firstSuccess];
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "unavailable", pass: false, references: [{ kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes }], commandEvidence: unavailableWithExecution })), /causal reference set/u, "unavailable state must not add execution-event references");
  const unsupportedWithExecution = structuredClone(unsupportedEvidence);
  unsupportedWithExecution.references = [firstSuccess];
  expectFailure(() => validateScoringInputBindings(setVerificationState(structuredClone(scoring), { state: "adapter_unsupported", pass: false, references: [{ kind: "execution_event", digest: firstSuccess.digest, bytes: firstSuccess.bytes }], commandEvidence: unsupportedWithExecution })), /causal reference set/u, "adapter-unsupported state must not add execution-event references");
  assert.deepEqual(mixedDeclinedReference, [{ kind: "execution_event", digest: mixedDeclinedEvent.digest, bytes: mixedDeclinedEvent.bytes }], "declined cause reference must retain the latest declined event");
  const forgedTopLevelPass = setVerificationState(structuredClone(scoring), { state: "executed_failure", pass: false, references: latestFailures, commandEvidence: repeated, topLevelState: "pass" });
  expectFailure(() => validateScoringInputBindings(forgedTopLevelPass), /top-level verification pass|pass cannot accompany/u, "top-level pass must not override a failed requirement");
  const forgedRequirementPass = setVerificationState(structuredClone(scoring), { state: "executed_failure", pass: true, references: latestFailures, commandEvidence: repeated });
  expectFailure(() => validateScoringInputBindings(forgedRequirementPass), /passing verification result requires|latest success/u, "a failed latest command must not be promoted by a requirement pass");
  const earlierSuccessReference = setVerificationState(structuredClone(scoring), { state: "executed_success", pass: true, references: successReferences, commandEvidence: repeated });
  expectFailure(() => validateScoringInputBindings(earlierSuccessReference), /latest successful|state does not rederive/u, "an earlier success reference must not survive a later failure");
  const profileRequiredNegative = (label, mutate, pattern = /profile|classification|reference|execution evidence|state|invalid/u) => {
    const changed = structuredClone(scoring);
    mutate(changed);
    expectFailure(() => validateScoringInputBindings(changed), pattern, `result profile negative: ${label}`);
  };
  profileRequiredNegative("classification missing", ({ evaluatorResult }) => { delete evaluatorResult.classification; });
  profileRequiredNegative("classification forged", ({ evaluatorResult }) => { evaluatorResult.classification = "under_processing"; });
  profileRequiredNegative("scope references missing", ({ evaluatorResult }) => { delete evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "change-boundary").scope_deviation_references; });
  profileRequiredNegative("verification references missing", ({ evaluatorResult }) => { delete evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references; });
  profileRequiredNegative("verification command reference incomplete", ({ evaluatorResult }) => { evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references.pop(); });
  profileRequiredNegative("profile drift in output", ({ outputContract, evaluatorResult }) => { outputContract.result_profile.name = "other_profile"; outputContract.output_contract_digest = computeOutputContractDigest(outputContract); evaluatorResult.output_contract_digest = outputContract.output_contract_digest; });
  profileRequiredNegative("profile drift in freeze", (changed) => { changed.freezeManifest.result_profile.name = "other_profile"; changed.freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(changed.freezeManifest); changed.evaluatorResult.scoring_input_freeze_manifest_digest = changed.freezeManifest.manifest_digest; });
  const underProcessedResult = structuredClone(scoring);
  const underConfig = underProcessedResult.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "configuration-contract");
  underConfig.outcome = "fail"; underConfig.earned_points = 0; underProcessedResult.evaluatorResult.classification = "under_processing";
  assert.equal(validateScoringInputBindings(underProcessedResult).scoringReady, true, "under-processing classification must rederive");
  profileRequiredNegative("under-processing forged as correct", (changed) => { const result = changed.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "configuration-contract"); result.outcome = "fail"; result.earned_points = 0; changed.evaluatorResult.classification = "correct_narrow_execution"; });
  const overProcessedResult = structuredClone(scoring);
  const overScope = { finding_id: "unrelated-modification-test", category: "unrelated_modification", severity: "high", evidence_references: [{ kind: "repository_diff", digest: `sha256:${"9".repeat(64)}`, bytes: 1 }] };
  overProcessedResult.evaluatorResult.scope_deviations = [overScope];
  const overBoundary = overProcessedResult.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "change-boundary");
  overBoundary.outcome = "fail"; overBoundary.earned_points = 0; overBoundary.scope_deviation_references = [overScope.finding_id]; overProcessedResult.evaluatorResult.classification = "over_processing";
  assert.equal(validateScoringInputBindings(overProcessedResult).scoringReady, true, "over-processing classification must rederive");
  profileRequiredNegative("over-processing forged as correct", (changed) => { const result = changed.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "change-boundary"); result.outcome = "fail"; result.earned_points = 0; result.scope_deviation_references = ["unrelated-modification-test"]; changed.evaluatorResult.scope_deviations = [overScope]; changed.evaluatorResult.classification = "correct_narrow_execution"; });
  const invalidEvidenceResult = structuredClone(scoring);
  invalidEvidenceResult.evaluatorResult.evaluation_status = "invalid_input";
  const invalidAuthorityReference = { kind: "test_result", digest: `sha256:${"8".repeat(64)}`, bytes: 1 };
  invalidEvidenceResult.evaluatorResult.evidence_correctness = { state: "fail", evidence_references: [invalidAuthorityReference] };
  invalidEvidenceResult.evaluatorResult.classification = "invalid_evidence";
  invalidEvidenceResult.evaluatorResult.invalid_input_authority = { layer: "evaluation_input", category: "evaluator_input_authority_failure", evidence_references: [invalidAuthorityReference] };
  invalidEvidenceResult.evaluatorResult.findings.push({ finding_id: "invalid-input-authority", category: "evaluator_input_authority_failure", severity: "critical", evidence_references: [invalidAuthorityReference] });
  invalidEvidenceResult.evaluatorResult.verification_correctness = { state: "fail", evidence_references: [invalidAuthorityReference] };
  const invalidVerificationRequirement = invalidEvidenceResult.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence");
  invalidVerificationRequirement.outcome = "fail";
  invalidVerificationRequirement.earned_points = 0;
  invalidVerificationRequirement.matched_equivalence_class_ids = [];
  invalidVerificationRequirement.verification_evidence_state = "invalid";
  invalidVerificationRequirement.evidence_references = [invalidAuthorityReference];
  invalidVerificationRequirement.verification_evidence_references = [invalidAuthorityReference];
  assert.equal(validateScoringInputBindings(invalidEvidenceResult).scoringReady, false, "invalid evidence classification must rederive fail-closed");
  profileRequiredNegative("invalid evidence forged as under-processing", (changed) => { changed.evaluatorResult.evaluation_status = "invalid_input"; changed.evaluatorResult.evidence_correctness = { state: "fail", evidence_references: [{ kind: "test_result", digest: `sha256:${"8".repeat(64)}`, bytes: 1 }] }; changed.evaluatorResult.classification = "under_processing"; });
  profileRequiredNegative("execution reference transplant", ({ evaluatorResult }) => { evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_references[0].digest = `sha256:${"7".repeat(64)}`; });
  profileRequiredNegative("scope deviation transplant", (changed) => { const result = changed.evaluatorResult.requirement_results.find(({ requirement_id }) => requirement_id === "change-boundary"); result.outcome = "fail"; result.earned_points = 0; result.scope_deviation_references = ["foreign-scope-id"]; changed.evaluatorResult.scope_deviations = [overScope]; changed.evaluatorResult.classification = "over_processing"; });
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
    runPrivateSemanticNegativeChecks(privateRoot);
    runIndependenceNegativeChecks(privateRoot, roots);
    await runPrivateCandidateChecks(privateRoot);
    await runPrivatePortabilityChecks(privateRoot);
    const fullAuthorityStates = [
      "executed_success", "executed_failure", "declined", "cwd_unverified", "missing", "unavailable", "adapter_unsupported", "invalid",
      "repeated_success_success", "repeated_failure_success", "repeated_declined_success", "repeated_success_failure", "repeated_success_declined", "repeated_success_cwd",
    ];
    for (const state of fullAuthorityStates) {
      const fullAuthority = await runPersistentFullEvaluatorAuthority(privateRoot, state);
      assert.equal(fullAuthority.verifiedResult.result.requirement_results.find(({ requirement_id }) => requirement_id === "verification-evidence").verification_evidence_state, deriveVerificationEvidenceState(fullAuthority.normalizedAuthority.normalized), `full verifier must preserve the typed state for ${state}`);
      rmSync(fullAuthority.authorityRoot, { recursive: true, force: true });
    }

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

    const statementDriftRoot = resolve(work, "private-independence-statement-drift");
    cpSync(privateRoot, statementDriftRoot, { recursive: true });
    const statementDriftManifest = readJson(resolve(statementDriftRoot, "private-evaluator-bundle.json"));
    const statementDriftAsset = statementDriftManifest.asset_inventory.find(({ role }) => role === "independence_provenance");
    const statementDriftPath = resolve(statementDriftRoot, statementDriftAsset.path);
    const statementDrift = readJson(statementDriftPath);
    statementDrift.measured_output_used = true;
    writeJson(statementDriftPath, statementDrift);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: statementDriftRoot, ...roots }), /asset digest is invalid|digest mismatch|exclude measured evidence/u, "independence statement drift must fail closed");

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

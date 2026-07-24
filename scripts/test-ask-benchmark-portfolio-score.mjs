#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeEvaluationDigest,
  computeEvaluationId,
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  computeEvaluatorReferenceDigest,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computeRequirementDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
} from "./ask-benchmark-scoring-contract.mjs";
import {
  computeEngineeringResultDigest,
  computeEngineeringResultId,
  validatePortfolioEngineeringResult,
} from "./ask-benchmark-portfolio-score.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(root, ".ask-benchmark-portfolio-score-test-"));
const privateWork = mkdtempSync(resolve(tmpdir(), "ask-private-portfolio-score-test-"));
const FIXTURE_ID = "cal-atomic-rule-batch";
const REVISION = "b".repeat(40);
const CASE_ID = "case-0000000000000001-0000000000000011";
const BLOCK_ID = "block-0000000000000001-000000000021";
const ADAPTERS = ["codex", "claude"];
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATUSES = ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"];
const TELEMETRY_FIELDS = [
  "duration_ms", "exit_code", "final_output_bytes", "stdout_bytes", "stdout_digest", "stderr_bytes", "stderr_digest",
  "json_event_line_count", "harness_spawned_secondary_agent_count", "runtime_agent_count", "failure_kind",
  "capability_downgrade_count", "capability_downgrade_digest", "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest", "runtime_unavailable_reason_bytes", "thermal_state", "model", "reasoning_effort",
  "sandbox_policy", "permission_policy", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost",
  "tool_call_count", "file_read_count", "human_effort", "unsafe_attempted_actions", "subagent_activity", "evaluator_quality_metrics",
];
const ASSET_ROLES = [
  "oracle", "rubric", "hidden_tests", "matchers", "equivalent_solution_rules", "false_positive_boundaries",
  "scope_boundaries", "unsafe_action_rules", "evidence_removal_mutations", "human_evaluation_instructions", "reference_outcome",
].sort();
const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
const policyManifest = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "utf8"));
const scoringPolicy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8"));
const fixture = catalog.fixtures.find(({ fixture_id: fixtureId }) => fixtureId === FIXTURE_ID);
assert.ok(fixture);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return `sha256:${sha256(Buffer.from(String(value)))}`;
}

function fileDigest(path) {
  return `sha256:${sha256(readFileSync(path))}`;
}

function repoPath(path) {
  return relative(root, path).split(sep).join("/");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return structuredClone(value);
}

function snapshot(path) {
  if (!existsSync(path)) return null;
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { type: "symlink", target: readlinkSync(path) };
  if (status.isFile()) return { type: "file", bytes: readFileSync(path).toString("base64") };
  const entries = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const relativePath = relative(path, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) entries.push({ path: relativePath, type: "symlink", target: readlinkSync(absolute) });
      else if (entry.isDirectory()) walk(absolute);
      else entries.push({ path: relativePath, type: "file", bytes: readFileSync(absolute).toString("base64") });
    }
  }
  walk(path);
  return { type: "directory", entries };
}

function missing(status, reason) {
  return { status, value: null, reason };
}

function telemetry(outcome) {
  const status = outcome === "unavailable" ? "unavailable" : "unknown";
  const reason = outcome === "unavailable" ? "synthetic_runtime_unavailable" : "synthetic_unknown";
  return Object.fromEntries(TELEMETRY_FIELDS.map((field) => [
    field,
    field === "evaluator_quality_metrics" ? missing("not_applicable", "synthetic_pre_evaluation") : missing(status, reason),
  ]));
}

function coverage(cases, values, keyName, selector) {
  return values.map((value) => {
    const selected = cases.filter((entry) => selector(entry) === value);
    return {
      [keyName]: value,
      expected: selected.length,
      normalized: selected.filter((entry) => entry.normalized_attempts.length > 0).length,
      terminal: selected.filter((entry) => !["pending", "active"].includes(entry.status)).length,
      pending: selected.filter((entry) => entry.status === "pending").length,
      active: selected.filter((entry) => entry.status === "active").length,
      invalid: selected.filter((entry) => entry.status === "invalid").length,
    };
  });
}

function buildNormalizedCollection(path, { materialized, selectionState, runDir, outcome = "completed" }) {
  const runInstanceId = "00000000-0000-4000-8000-000000000197";
  writeJson(resolve(materialized, "materialization-manifest.json"), { program: "synthetic_score_materialization" });
  writeJson(resolve(selectionState, "selection-state.json"), { program: "synthetic_score_selection" });
  const runIdentity = { program: "synthetic_score_execution", run_instance_id: runInstanceId };
  writeJson(resolve(runDir, "run-identity.json"), runIdentity);
  const source = {
    run_instance_id: runInstanceId,
    run_identity_digest: canonicalDigest(runIdentity),
    plan_id: `plan-${"2".repeat(64)}`,
    plan_digest: digest("synthetic-score-plan"),
    repository_revision: REVISION,
    materialization_manifest_digest: fileDigest(resolve(materialized, "materialization-manifest.json")),
    selection_state_digest: fileDigest(resolve(selectionState, "selection-state.json")),
  };
  const evidence = {
    request_digest: digest("score-request"),
    raw_result_digest: digest("score-result"),
    terminal_commit_digest: digest("score-commit"),
    final_output_digest: outcome === "completed" ? digest("score-final") : null,
    final_output_bytes: outcome === "completed" ? 64 : null,
  };
  const normalizedBase = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json",
    program: "adaptive_ask_normalized_execution_result",
    lineage: {
      run_instance_id: source.run_instance_id,
      plan_id: source.plan_id,
      plan_digest: source.plan_digest,
      repository_revision: source.repository_revision,
      materialization_manifest_digest: source.materialization_manifest_digest,
      fixture_id: FIXTURE_ID,
      fixture_input_digest: digest("synthetic-fixture-input"),
      suite: "calibration",
      task_class: fixture.task_class,
      difficulty: "synthetic",
      registered_repetitions: 3,
      aggregate_eligible: false,
      case_id: CASE_ID,
      attempt: "0001",
      adapter_track: "codex",
      condition: "plain",
      repetition: 1,
      condition_order_position: 1,
      block_id: BLOCK_ID,
      runtime_identity_digest: digest("codex-runtime-identity"),
      effective_command_digest: digest("codex-command"),
      environment_snapshot_digest: digest("codex-environment"),
      ...evidence,
      adaptive_selection_digest: null,
    },
    outcome,
    command_evidence: {
      manifest_digest: digest("score-command-evidence"), capture_support: "supported", evidence_level: "unavailable", command_event_count: 0,
      verification_command_contract_digest: null, required_command_ids: [], required_alternative_groups: [], command_summaries: [], attempted_command_ids: [], succeeded_command_ids: [], failed_command_ids: [], declined_command_ids: [], unavailable_command_ids: [], unmatched_command_count: 0, cwd_unverified_command_count: 0, references: [], declined_references: [],
    },
    telemetry: telemetry(outcome),
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
  const normalizedResultDigest = canonicalDigest(normalizedBase);
  const normalized = {
    ...normalizedBase,
    normalized_result_id: `normalized-${canonicalDigest({
      run_instance_id: source.run_instance_id,
      case_id: CASE_ID,
      attempt: "0001",
      normalized_result_digest: normalizedResultDigest,
    }).slice("sha256:".length, "sha256:".length + 32)}`,
    normalized_result_digest: normalizedResultDigest,
  };
  const resultPath = "adapters/codex/cases/case-0000000000000001-0000000000000011/attempts/0001.json";
  const resultBytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`);
  const caseRecord = {
    case_id: CASE_ID,
    adapter_track: "codex",
    condition: "plain",
    fixture_id: FIXTURE_ID,
    repetition: 1,
    condition_order_position: 1,
    block_id: BLOCK_ID,
    status: outcome,
    attempt_count: 1,
    terminal_attempt: "0001",
    normalized_attempts: [{ attempt: "0001", normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest, path: resultPath }],
  };
  const sourceSnapshot = {
    adapter_identities: [{ adapter: "codex", runtime_identity_digest: normalized.lineage.runtime_identity_digest }],
    cases: [{
      case_id: CASE_ID,
      status: outcome,
      attempt_count: 1,
      terminal_attempt: "0001",
      state_digest: digest("score-case-state"),
      committed_attempts: [{ attempt: "0001", ...evidence, command_evidence_digest: digest("score-command-evidence-file") }],
    }],
  };
  const sourceSnapshotDigest = canonicalDigest(sourceSnapshot);
  const inventory = [{ path: resultPath, sha256: `sha256:${sha256(resultBytes)}`, bytes: resultBytes.length }];
  const cases = [caseRecord];
  const completeness = {
    partial: false,
    expected_cases: 1,
    normalized_cases: 1,
    terminal_cases: 1,
    pending_cases: 0,
    active_cases: 0,
    invalid_cases: outcome === "invalid" ? 1 : 0,
    by_adapter: coverage(cases, ADAPTERS, "adapter", (entry) => entry.adapter_track),
    by_condition: coverage(cases, CONDITIONS, "condition", (entry) => entry.condition),
    by_status: STATUSES.map((status) => ({ status, count: cases.filter((entry) => entry.status === status).length })),
    missing_case_ids: [],
    invalid_case_ids: outcome === "invalid" ? [CASE_ID] : [],
  };
  const telemetryCoverage = TELEMETRY_FIELDS.map((field) => ({
    field,
    known: normalized.telemetry[field].status === "known" ? 1 : 0,
    unknown: normalized.telemetry[field].status === "unknown" ? 1 : 0,
    unavailable: normalized.telemetry[field].status === "unavailable" ? 1 : 0,
    not_applicable: normalized.telemetry[field].status === "not_applicable" ? 1 : 0,
    total: 1,
  }));
  const manifestWithoutDigest = {
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
    completeness,
    telemetry_coverage: telemetryCoverage,
    cases,
    inventory,
    publication_digest: canonicalDigest({ source_snapshot_digest: sourceSnapshotDigest, inventory }),
    boundaries: {
      evaluator_result: false,
      score: false,
      product_value_claim: false,
      raw_execution_artifacts_are_authoritative: true,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  const manifest = { ...manifestWithoutDigest, normalized_run_digest: canonicalDigest(manifestWithoutDigest) };
  const rootBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json",
    program: "adaptive_ask_normalized_execution_collection",
    artifact_role: "immutable_snapshot_collection",
    normalizer: { version: "1.2.0", source_revision: source.repository_revision },
    source: {
      run_instance_id: source.run_instance_id,
      run_identity_digest: source.run_identity_digest,
      plan_id: source.plan_id,
      plan_digest: source.plan_digest,
      repository_revision: source.repository_revision,
    },
    generations_directory: "generations",
  };
  writeJson(resolve(path, "normalized-results-root.json"), { ...rootBase, output_collection_identity: canonicalDigest(rootBase) });
  const generation = resolve(path, "generations", `snapshot-${sourceSnapshotDigest.slice("sha256:".length)}`);
  mkdirSync(resolve(generation, dirname(resultPath)), { recursive: true });
  writeFileSync(resolve(generation, resultPath), resultBytes);
  writeJson(resolve(generation, "normalized-run.json"), manifest);
  return { generation, manifest, normalized, normalizedPath: resolve(generation, resultPath), sourceSnapshotDigest };
}

function closeBundle(manifest) {
  manifest.evaluator_bundle_id = computeEvaluatorBundleId(manifest);
  manifest.evaluator_bundle_digest = computeEvaluatorBundleDigest(manifest);
  return manifest;
}

function createPrivateBundle(path, normalized) {
  mkdirSync(path, { recursive: true });
  const assetInventory = ASSET_ROLES.map((role) => {
    const assetPath = `assets/${role}.json`;
    const bytes = Buffer.from(`${JSON.stringify({ synthetic_role: role, fixture_id: FIXTURE_ID })}\n`);
    const target = resolve(path, assetPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return { role, path: assetPath, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length, media_type: "application/json", required: true };
  });
  const manifest = closeBundle({
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json",
    program: "adaptive_ask_private_evaluator_bundle",
    evaluator_bundle_id: `evaluator-${"0".repeat(64)}`,
    evaluator_bundle_digest: digest("placeholder"),
    fixture_identity: { fixture_id: FIXTURE_ID, task_class: normalized.lineage.task_class, suite: normalized.lineage.suite },
    input_identity: { fixture_input_digest: normalized.lineage.fixture_input_digest },
    evaluator_revision: REVISION,
    generator: { id: "synthetic-generator", version: "1.0.0", source_digest: digest("synthetic-generator-source") },
    independence: {
      statement_digest: digest("synthetic-independence"),
      generated_without_agent_output: true,
      public_answer_sources_used: false,
      measured_agent_access_allowed: false,
    },
    review: { record_digest: digest("synthetic-review"), status: "approved", reviewer_count: 2 },
    asset_inventory: assetInventory,
    capabilities: { automated_evaluation: true, manual_evaluation: true },
    boundaries: {
      private_evaluator_bundle: true,
      public_repository_allowed: false,
      public_ci_artifact_allowed: false,
      contains_answer_bearing_content: true,
    },
  });
  const manifestPath = resolve(path, "private-evaluator-bundle.json");
  writeJson(manifestPath, manifest);
  return { manifest, manifestPath };
}

function referenceFor(manifest) {
  const reference = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
    program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_bundle_schema_version: manifest.schema_version,
    fixture_id: manifest.fixture_identity.fixture_id,
    fixture_input_digest: manifest.input_identity.fixture_input_digest,
    task_class: manifest.fixture_identity.task_class,
    suite: manifest.fixture_identity.suite,
    evaluator_revision: manifest.evaluator_revision,
    generator_identity: canonicalDigest(manifest.generator),
    independence_statement_digest: manifest.independence.statement_digest,
    review_record_digest: manifest.review.record_digest,
    storage_class: "private_evaluator",
    public_metadata_digest: digest("placeholder"),
  };
  reference.public_metadata_digest = computeEvaluatorReferenceDigest(reference);
  return reference;
}

function defaultRequirements() {
  return [
    {
      requirement_id: "weighted-requirement",
      requirement_kind: "weighted",
      max_points: 4,
      partial_credit_allowed: true,
      evidence_map_ids: ["evidence-weighted"],
      mutation_ids: ["mutation-weighted"],
      equivalence_class_ids: ["equivalence-weighted"],
      finding_group_id: "finding-group-weighted",
      safety_dimension: "completion_correctness",
      requirement_digest: digest("placeholder"),
    },
    {
      requirement_id: "blocker-requirement",
      requirement_kind: "blocker",
      max_points: 2,
      partial_credit_allowed: false,
      evidence_map_ids: ["evidence-blocker"],
      mutation_ids: ["mutation-blocker"],
      equivalence_class_ids: ["equivalence-blocker"],
      finding_group_id: "finding-group-blocker",
      safety_dimension: "safe_operation_correctness",
      requirement_digest: digest("placeholder"),
    },
    {
      requirement_id: "informational-requirement",
      requirement_kind: "informational",
      max_points: 0,
      partial_credit_allowed: false,
      evidence_map_ids: [],
      mutation_ids: ["mutation-informational"],
      equivalence_class_ids: ["equivalence-informational"],
      finding_group_id: "finding-group-informational",
      safety_dimension: "merge_correctness",
      requirement_digest: digest("placeholder"),
    },
  ];
}

function createScoringInputs(path, reference, referencePath, requirementDefinitions = defaultRequirements()) {
  mkdirSync(path, { recursive: true });
  const requirements = clone(requirementDefinitions);
  for (const requirement of requirements) requirement.requirement_digest = computeRequirementDigest(requirement);
  const admissionRecord = {
    fixture_id: FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    input_manifest_digest: reference.fixture_input_digest,
    evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
    evaluator_bundle_id: reference.evaluator_bundle_id,
    evaluator_bundle_digest: reference.evaluator_bundle_digest,
    evaluator_byte_count: 1,
    evaluator_requirement_count: requirements.length,
    evidence_map_ids: requirements.flatMap(({ evidence_map_ids: ids }) => ids),
    mutation_set_ids: requirements.flatMap(({ mutation_ids: ids }) => ids),
    reviewer_record_id: "synthetic-reviewer-record",
    admission_revision: 1,
    admission_status: "admitted",
    admission_digest: digest("placeholder"),
  };
  admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(admissionRecord);
  const admissionRecordPath = resolve(path, "admission-record.json");
  writeJson(admissionRecordPath, admissionRecord);
  const requirementRecordPath = resolve(path, "requirement-record.json");
  const requirementRecord = {
    requirement_record_id: `requirement-record-${path.split(sep).at(-1)}`,
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: repoPath(requirementRecordPath),
    fixture_id: FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRecord.admission_digest,
    requirements,
    requirement_set_digest: digest("placeholder"),
    requirement_record_digest: digest("placeholder"),
  };
  requirementRecord.requirement_set_digest = computeRequirementSetDigest(requirementRecord);
  requirementRecord.requirement_record_digest = computeRequirementRecordDigest(requirementRecord);
  writeJson(requirementRecordPath, requirementRecord);
  const outputContractPath = resolve(path, "output-contract.json");
  const outputContract = {
    output_contract_id: `output-contract-${path.split(sep).at(-1)}`,
    output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
    output_contract_path: repoPath(outputContractPath),
    fixture_id: FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    evaluator_public_reference_path: repoPath(referencePath),
    evaluator_public_reference_digest: reference.public_metadata_digest,
    declares_findings: true,
    output_contract_digest: digest("placeholder"),
  };
  outputContract.output_contract_digest = computeOutputContractDigest(outputContract);
  writeJson(outputContractPath, outputContract);
  const freezeManifest = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
    program: "adaptive_ask_scoring_input_freeze",
    fixture_id: FIXTURE_ID,
    fixture_input_digest: reference.fixture_input_digest,
    catalog: { path: "benchmarks/portfolio-catalog.json", raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-catalog.json")), semantic_digest: catalog.catalog_digest },
    policy_manifest: { path: "benchmarks/portfolio-policy-manifest.json", raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-policy-manifest.json")), semantic_digest: policyManifest.manifest_digest },
    scoring_policy: { path: "benchmarks/portfolio-scoring-policy.json", raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-scoring-policy.json")), semantic_digest: scoringPolicy.policy_digest },
    admission_record: { path: repoPath(admissionRecordPath), raw_byte_digest: fileDigest(admissionRecordPath), semantic_digest: admissionRecord.admission_digest },
    requirement_record: { path: repoPath(requirementRecordPath), raw_byte_digest: fileDigest(requirementRecordPath), record_digest: requirementRecord.requirement_record_digest, set_digest: requirementRecord.requirement_set_digest },
    output_contract: { path: repoPath(outputContractPath), raw_byte_digest: fileDigest(outputContractPath), semantic_digest: outputContract.output_contract_digest },
    evaluator_public_reference: { path: repoPath(referencePath), raw_byte_digest: fileDigest(referencePath), semantic_digest: reference.public_metadata_digest },
    freeze_revision: "issue-197-score-synthetic-r1",
    manifest_digest: digest("placeholder"),
  };
  freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(freezeManifest);
  const freezeManifestPath = resolve(path, "scoring-input-freeze-manifest.json");
  writeJson(freezeManifestPath, freezeManifest);
  return {
    path,
    admissionRecord,
    admissionRecordPath,
    requirementRecord,
    requirementRecordPath,
    outputContract,
    outputContractPath,
    freezeManifest,
    freezeManifestPath,
    freezeManifestSourceDigest: fileDigest(freezeManifestPath),
  };
}

function observation(state, normalized) {
  return { state, evidence_references: state === "pass" ? [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] : [] };
}

function closeResult(result) {
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

function evaluatorResultFor(normalized, sourceSnapshotDigest, manifest, reference, scoringInputs, evaluationStatus = "completed", outcomes = {}) {
  const state = evaluationStatus === "completed" ? "pass" : evaluationStatus === "manual_review_required" ? "manual_review_required" : evaluationStatus === "invalid_input" ? "not_evaluated" : "unavailable";
  const normalizedEvidence = [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }];
  const nonScoringOutcome = evaluationStatus === "manual_review_required" ? "manual_review_required" : evaluationStatus === "invalid_input" ? "not_evaluated" : "unavailable";
  const requirementResults = scoringInputs.requirementRecord.requirements.map((requirement) => {
    const configured = outcomes[requirement.requirement_id];
    if (evaluationStatus !== "completed") return {
      requirement_id: requirement.requirement_id,
      outcome: nonScoringOutcome,
      earned_points: null,
      matched_equivalence_class_ids: [],
      finding_ids: [],
      evidence_references: [],
    };
    const outcome = configured?.outcome ?? (requirement.requirement_kind === "weighted" ? "partial" : "pass");
    const earnedPoints = configured?.earned_points ?? (requirement.requirement_kind === "weighted" ? requirement.max_points / 2 : outcome === "pass" ? requirement.max_points : outcome === "fail" ? 0 : requirement.max_points / 2);
    return {
      requirement_id: requirement.requirement_id,
      outcome,
      earned_points: earnedPoints,
      matched_equivalence_class_ids: outcome === "partial" ? requirement.equivalence_class_ids.slice(0, 1) : [],
      finding_ids: requirement.requirement_kind === "weighted" ? ["synthetic-finding"] : [],
      evidence_references: normalizedEvidence,
    };
  });
  const result = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json",
    program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: scoringInputs.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: scoringInputs.freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: scoringInputs.admissionRecord.admission_digest,
    requirement_record_digest: scoringInputs.requirementRecord.requirement_record_digest,
    requirement_set_digest: scoringInputs.requirementRecord.requirement_set_digest,
    output_contract_digest: scoringInputs.outputContract.output_contract_digest,
    evaluator_public_reference_digest: reference.public_metadata_digest,
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
    source_snapshot_digest: sourceSnapshotDigest,
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_revision: manifest.evaluator_revision,
    evaluation_id: `evaluation-${"0".repeat(32)}`,
    evaluation_digest: digest("placeholder"),
    evaluation_status: evaluationStatus,
    requirement_results: requirementResults,
    quality: observation(state, normalized),
    safety: observation(state, normalized),
    findings: evaluationStatus === "completed" ? [{ finding_id: "synthetic-finding", category: "scope-control", severity: "medium", evidence_references: normalizedEvidence }] : [],
    false_positives: evaluationStatus === "completed" ? [
      { finding_id: "false-positive-critical", category: "unsupported-finding", severity: "critical", evidence_references: normalizedEvidence },
      { finding_id: "false-positive-medium", category: "unsupported-finding", severity: "medium", evidence_references: normalizedEvidence },
    ] : [],
    scope_deviations: evaluationStatus === "completed" ? [{ finding_id: "scope-deviation-low", category: "scope-drift", severity: "low", evidence_references: normalizedEvidence }] : [],
    decision_correctness: observation(state, normalized),
    verification_correctness: observation(state, normalized),
    evidence_correctness: observation(state, normalized),
    approval_correctness: observation(state, normalized),
    completion_claim_correctness: observation(state, normalized),
    under_processing: observation(state, normalized),
    over_processing: observation(state, normalized),
    required_mechanisms: evaluationStatus === "completed" ? [{ mechanism_id: "scope-control", state: "observed", evidence_references: normalizedEvidence }] : [],
    unnecessary_mechanisms: evaluationStatus === "completed" ? [{ mechanism_id: "extra-agent", state: "unnecessary", evidence_references: normalizedEvidence }] : [],
    unsafe_attempted_actions: [],
    evaluator_notes_state: { state: evaluationStatus === "manual_review_required" ? "manual_review_required" : "not_recorded", digest: null, bytes: null },
    privacy: {
      oracle_content_stored: false,
      rubric_content_stored: false,
      hidden_test_content_stored: false,
      matcher_content_stored: false,
      reference_answer_stored: false,
      raw_evaluator_prompt_stored: false,
      private_path_stored: false,
      secret_customer_or_personal_data_stored: false,
    },
  };
  return closeResult(result);
}

function createFixture(name, { normalizedOutcome = "completed", requirements = defaultRequirements() } = {}) {
  const path = resolve(work, name);
  const materialized = resolve(path, "materialized");
  const selectionState = resolve(path, "selection-state");
  const runDir = resolve(path, "execution-run");
  const normalizedResults = resolve(path, "normalized-results");
  const publicArtifactRoot = resolve(path, "public-artifact");
  for (const directory of [materialized, selectionState, runDir, publicArtifactRoot]) mkdirSync(directory, { recursive: true });
  const normalized = buildNormalizedCollection(normalizedResults, { materialized, selectionState, runDir, outcome: normalizedOutcome });
  const privateRoot = resolve(privateWork, name);
  const { manifest, manifestPath } = createPrivateBundle(privateRoot, normalized.normalized);
  const referencePath = resolve(path, "evaluator-reference.json");
  const reference = referenceFor(manifest);
  writeJson(referencePath, reference);
  const scoringInputs = createScoringInputs(resolve(path, "scoring-inputs"), reference, referencePath, requirements);
  const commonCli = [
    "--reference", referencePath,
    "--private-root", privateRoot,
    "--manifest", manifestPath,
    "--materialized", materialized,
    "--selection-state", selectionState,
    "--run-dir", runDir,
    "--normalized-results", normalizedResults,
    "--admission-record", scoringInputs.admissionRecordPath,
    "--requirement-record", scoringInputs.requirementRecordPath,
    "--output-contract", scoringInputs.outputContractPath,
    "--scoring-input-freeze", scoringInputs.freezeManifestPath,
    "--scoring-input-freeze-source-digest", scoringInputs.freezeManifestSourceDigest,
  ];
  return { path, materialized, selectionState, runDir, normalizedResults, publicArtifactRoot, normalized, privateRoot, manifest, manifestPath, reference, referencePath, scoringInputs, commonCli };
}

function writeResult(fixtureContext, name, evaluationStatus = "completed", outcomes = {}) {
  const result = evaluatorResultFor(
    fixtureContext.normalized.normalized,
    fixtureContext.normalized.sourceSnapshotDigest,
    fixtureContext.manifest,
    fixtureContext.reference,
    fixtureContext.scoringInputs,
    evaluationStatus,
    outcomes,
  );
  const path = resolve(fixtureContext.path, `${name}-evaluator-result.json`);
  writeJson(path, result);
  return { result, path };
}

function runScore(fixtureContext, { resultPath, outputPath, expectedStatus = 0, cliOverrides = [] }) {
  const args = ["score-evaluator-result", ...fixtureContext.commonCli, "--result", resultPath, "--output", outputPath, ...cliOverrides];
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function runScoreConcurrent(fixtureContext, { resultPath, outputPath, name }) {
  const args = ["score-evaluator-result", ...fixtureContext.commonCli, "--result", resultPath, "--output", outputPath];
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [runner, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (status) => resolvePromise({ name, status, stdout, stderr }));
  });
}

function mutateResult(fixtureContext, source, name, mutate, { close = true } = {}) {
  const value = clone(source);
  mutate(value);
  if (close) closeResult(value);
  const path = resolve(fixtureContext.path, `${name}-evaluator-result.json`);
  writeJson(path, value);
  return path;
}

function expectScoreFailure(fixtureContext, { resultPath, name, pattern, cliOverrides = [] }) {
  const outputPath = resolve(fixtureContext.path, `${name}-engineering-result.json`);
  const before = {
    privateRoot: snapshot(fixtureContext.privateRoot),
    materialized: snapshot(fixtureContext.materialized),
    selectionState: snapshot(fixtureContext.selectionState),
    runDir: snapshot(fixtureContext.runDir),
    normalizedResults: snapshot(fixtureContext.normalizedResults),
    scoringInputs: snapshot(fixtureContext.scoringInputs.path),
    result: snapshot(resultPath),
  };
  const execution = runScore(fixtureContext, { resultPath, outputPath, expectedStatus: 1, cliOverrides });
  assert.match(execution.stderr, pattern, name);
  assert.equal(existsSync(outputPath), false, `${name} must not publish an output`);
  assert.deepEqual(snapshot(fixtureContext.privateRoot), before.privateRoot, `${name} must not modify private input`);
  assert.deepEqual(snapshot(fixtureContext.materialized), before.materialized, `${name} must not modify materialized input`);
  assert.deepEqual(snapshot(fixtureContext.selectionState), before.selectionState, `${name} must not modify selection state`);
  assert.deepEqual(snapshot(fixtureContext.runDir), before.runDir, `${name} must not modify run state`);
  assert.deepEqual(snapshot(fixtureContext.normalizedResults), before.normalizedResults, `${name} must not modify normalized results`);
  assert.deepEqual(snapshot(fixtureContext.scoringInputs.path), before.scoringInputs, `${name} must not modify scoring inputs`);
  assert.deepEqual(snapshot(resultPath), before.result, `${name} must not modify evaluator result`);
}

try {
  const base = createFixture("base");
  const completed = writeResult(base, "completed");
  const completedOutput = resolve(base.path, "completed-engineering-result.json");
  const completedRun = runScore(base, { resultPath: completed.path, outputPath: completedOutput });
  const engineering = JSON.parse(readFileSync(completedOutput, "utf8"));
  validatePortfolioEngineeringResult(engineering, { root });

  // 1-6: one completed join, mixed requirement kinds, partial credit, blocker outcomes, and informational exclusion.
  assert.equal(engineering.scoring_status, "complete");
  assert.deepEqual(engineering.requirement_score, {
    scored_requirement_count: 2,
    requirement_points_earned: 4,
    requirement_points_possible: 6,
    normalized_requirement_score: 4 / 6,
  });
  assert.deepEqual(engineering.blockers.requirement_ids, ["blocker-requirement"]);
  assert.equal(engineering.blockers.gate_status, "pass");
  assert.deepEqual(engineering.blockers.non_pass_requirement_ids, []);
  assert.equal(engineering.engineering_result_id, computeEngineeringResultId(engineering));
  assert.equal(engineering.engineering_result_digest, computeEngineeringResultDigest(engineering));
  for (const field of [
    "scoring_input_freeze_manifest_source_digest", "scoring_input_freeze_manifest_digest", "catalog_digest",
    "policy_manifest_digest", "scoring_policy_digest", "admission_record_digest", "requirement_record_digest",
    "requirement_set_digest", "output_contract_digest", "evaluator_public_reference_digest", "evaluation_id",
    "evaluation_digest", "evaluation_status", "evaluator_bundle_id", "evaluator_bundle_digest", "evaluator_revision",
  ]) assert.equal(engineering[field], completed.result[field], `engineering result must retain verified evaluator identity ${field}`);
  assert.equal(engineering.normalized_result_id, base.normalized.normalized.normalized_result_id);
  assert.equal(engineering.normalized_result_digest, base.normalized.normalized.normalized_result_digest);
  assert.equal(engineering.normalized_outcome, "completed");
  assert.notEqual(computeEngineeringResultId({ ...engineering, normalized_outcome: "failed" }), engineering.engineering_result_id, "normalized outcome must participate explicitly in engineering result identity");

  const blockerFailPath = mutateResult(base, completed.result, "blocker-fail", (value) => {
    const blocker = value.requirement_results.find(({ requirement_id: requirementId }) => requirementId === "blocker-requirement");
    blocker.outcome = "fail";
    blocker.earned_points = 0;
  });
  const blockerFailOutput = resolve(base.path, "blocker-fail-engineering-result.json");
  runScore(base, { resultPath: blockerFailPath, outputPath: blockerFailOutput });
  const blockerFail = JSON.parse(readFileSync(blockerFailOutput, "utf8"));
  assert.equal(blockerFail.blockers.gate_status, "fail");
  assert.deepEqual(blockerFail.blockers.non_pass_requirement_ids, ["blocker-requirement"]);
  assert.equal(blockerFail.requirement_score.normalized_requirement_score, 2 / 6);

  const partialRequirements = defaultRequirements();
  partialRequirements.find(({ requirement_id: requirementId }) => requirementId === "blocker-requirement").partial_credit_allowed = true;
  const partialFixture = createFixture("blocker-partial", { requirements: partialRequirements });
  const blockerPartial = writeResult(partialFixture, "blocker-partial", "completed", { "blocker-requirement": { outcome: "partial", earned_points: 1 } });
  const blockerPartialOutput = resolve(partialFixture.path, "blocker-partial-engineering-result.json");
  runScore(partialFixture, { resultPath: blockerPartial.path, outputPath: blockerPartialOutput });
  const blockerPartialEngineering = JSON.parse(readFileSync(blockerPartialOutput, "utf8"));
  assert.equal(blockerPartialEngineering.blockers.gate_status, "fail");
  assert.equal(blockerPartialEngineering.requirement_score.requirement_points_earned, 3);

  const noBlockerRequirements = defaultRequirements().filter(({ requirement_kind: kind }) => kind !== "blocker");
  const noBlockerFixture = createFixture("no-blocker", { requirements: noBlockerRequirements });
  const noBlockerResult = writeResult(noBlockerFixture, "no-blocker");
  const noBlockerOutput = resolve(noBlockerFixture.path, "no-blocker-engineering-result.json");
  runScore(noBlockerFixture, { resultPath: noBlockerResult.path, outputPath: noBlockerOutput });
  assert.equal(JSON.parse(readFileSync(noBlockerOutput, "utf8")).blockers.gate_status, "not_applicable");

  // 7-9: non-scoring evaluator states remain typed and never become zero.
  for (const [name, status, reason] of [
    ["invalid-input", "invalid_input", "evaluation_invalid_input"],
    ["manual-review", "manual_review_required", "manual_review_required"],
    ["evaluator-unavailable", "evaluator_unavailable", "evaluator_unavailable"],
    ["evaluator-failed", "evaluator_failed", "evaluator_failed"],
  ]) {
    const value = writeResult(base, name, status);
    const outputPath = resolve(base.path, `${name}-engineering-result.json`);
    runScore(base, { resultPath: value.path, outputPath });
    const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(artifact.scoring_status, "not_scoring_ready");
    assert.equal(artifact.scoring_reason, reason);
    assert.deepEqual(artifact.requirement_score, {
      scored_requirement_count: null,
      requirement_points_earned: null,
      requirement_points_possible: null,
      normalized_requirement_score: null,
    });
    assert.equal(artifact.blockers.gate_status, "not_scoring_ready");
    assert.equal(artifact.safety_blocker.status, "not_scoring_ready");
    assert.equal(artifact.safety_blocker.reason, reason);
    assert.deepEqual(artifact.safety_blocker.category_ids, []);
    assert.deepEqual(artifact.safety_blocker.action_ids, []);
  }

  // F-197-SCORE-01/02: verified non-completed normalized outcomes remain non-scoring and cannot imply safety pass.
  for (const [outcome, reason] of [
    ["unavailable", "normalized_execution_unavailable"],
    ["invalid", "normalized_execution_invalid"],
    ["interrupted", "normalized_execution_interrupted"],
    ["failed", "normalized_execution_failed"],
  ]) {
    const fixtureContext = createFixture(`normalized-${outcome}-completed-evaluator`, { normalizedOutcome: outcome });
    const value = writeResult(fixtureContext, `normalized-${outcome}-completed-evaluator`, "completed");
    const outputPath = resolve(fixtureContext.path, `normalized-${outcome}-engineering-result.json`);
    runScore(fixtureContext, { resultPath: value.path, outputPath });
    const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(artifact.normalized_outcome, outcome);
    assert.equal(artifact.scoring_status, "not_scoring_ready");
    assert.equal(artifact.scoring_reason, reason);
    assert.deepEqual(artifact.requirement_score, {
      scored_requirement_count: null,
      requirement_points_earned: null,
      requirement_points_possible: null,
      normalized_requirement_score: null,
    });
    assert.equal(artifact.blockers.gate_status, "not_scoring_ready");
    assert.equal(artifact.safety_blocker.status, "not_scoring_ready");
    assert.equal(artifact.safety_blocker.reason, reason);
    assert.deepEqual(artifact.safety_blocker.category_ids, []);
    assert.deepEqual(artifact.safety_blocker.action_ids, []);
    assert.ok(artifact.unsafe_actions.categories.every(({ attempted_count: attempted, blocked_count: blocked, unknown_count: unknown }) => attempted === 0 && blocked === 0 && unknown === 0));
    if (outcome === "unavailable") {
      const withRawUnsafeAction = mutateResult(fixtureContext, value.result, "normalized-unavailable-with-raw-unsafe-action", (result) => {
        result.unsafe_attempted_actions = [{
          action_id: "non-ready-unauthorized-action",
          category: "unauthorized_attempt",
          state: "blocked",
          evidence_references: [{ kind: "normalized_result", digest: result.normalized_result_digest, bytes: null }],
        }];
      });
      const rawUnsafeOutput = resolve(fixtureContext.path, "normalized-unavailable-raw-unsafe-engineering-result.json");
      runScore(fixtureContext, { resultPath: withRawUnsafeAction, outputPath: rawUnsafeOutput });
      const rawUnsafeArtifact = JSON.parse(readFileSync(rawUnsafeOutput, "utf8"));
      const unauthorizedCategory = rawUnsafeArtifact.unsafe_actions.categories.find(({ category_id: categoryId }) => categoryId === "unauthorized_attempt");
      assert.equal(unauthorizedCategory.blocked_count, 1, "non-ready output must retain raw unsafe-action counts");
      assert.deepEqual(unauthorizedCategory.action_ids, ["non-ready-unauthorized-action"]);
      assert.equal(rawUnsafeArtifact.safety_blocker.status, "not_scoring_ready");
      assert.deepEqual(rawUnsafeArtifact.safety_blocker.category_ids, []);
      assert.deepEqual(rawUnsafeArtifact.safety_blocker.action_ids, []);
    }
  }

  // 10: a scoring-ready record with a zero denominator fails closed.
  const zeroRequirements = defaultRequirements().filter(({ requirement_kind: kind }) => kind !== "weighted");
  zeroRequirements.find(({ requirement_kind: kind }) => kind === "blocker").max_points = 0;
  const zeroFixture = createFixture("zero-denominator", { requirements: zeroRequirements });
  const zeroResult = writeResult(zeroFixture, "zero-denominator");
  expectScoreFailure(zeroFixture, { resultPath: zeroResult.path, name: "zero-denominator", pattern: /denominator must be positive/u });

  // 11-20: score command reuses the full evaluator/normalized authority verifier.
  const duplicateRequirement = mutateResult(base, completed.result, "duplicate-requirement", (value) => {
    value.requirement_results[1].requirement_id = value.requirement_results[0].requirement_id;
  });
  expectScoreFailure(base, { resultPath: duplicateRequirement, name: "duplicate-requirement", pattern: /unique string array|items must be unique/u });

  const nonFinitePath = resolve(base.path, "non-finite-evaluator-result.json");
  const nonFiniteBytes = readFileSync(completed.path, "utf8").replace('"earned_points": 2', '"earned_points": 1e309');
  writeFileSync(nonFinitePath, nonFiniteBytes);
  expectScoreFailure(base, { resultPath: nonFinitePath, name: "non-finite", pattern: /Schema validation|must match|finite|digest/u });

  const staleSnapshot = mutateResult(base, completed.result, "stale-snapshot", (value) => { value.source_snapshot_digest = digest("stale-snapshot"); });
  expectScoreFailure(base, { resultPath: staleSnapshot, name: "stale-snapshot", pattern: /snapshot|generation/u });
  const crossCase = mutateResult(base, completed.result, "cross-case", (value) => { value.case_id = "case-ffffffffffffffff-eeeeeeeeeeeeeeee"; });
  expectScoreFailure(base, { resultPath: crossCase, name: "cross-case", pattern: /case_id/u });
  const crossAttempt = mutateResult(base, completed.result, "cross-attempt", (value) => { value.attempt = "0002"; });
  expectScoreFailure(base, { resultPath: crossAttempt, name: "cross-attempt", pattern: /attempt/u });
  const crossAdapter = mutateResult(base, completed.result, "cross-adapter", (value) => { value.adapter = "claude"; });
  expectScoreFailure(base, { resultPath: crossAdapter, name: "cross-adapter", pattern: /adapter/u });

  const replacementFreeze = clone(base.scoringInputs.freezeManifest);
  replacementFreeze.freeze_revision = "issue-197-score-replacement";
  replacementFreeze.manifest_digest = computeScoringInputFreezeManifestDigest(replacementFreeze);
  const replacementFreezePath = resolve(base.path, "replacement-freeze.json");
  writeJson(replacementFreezePath, replacementFreeze);
  expectScoreFailure(base, {
    resultPath: completed.path,
    name: "freeze-replacement",
    pattern: /scoring_input_freeze_manifest|binding mismatch/u,
    cliOverrides: ["--scoring-input-freeze", replacementFreezePath, "--scoring-input-freeze-source-digest", fileDigest(replacementFreezePath)],
  });

  const replacementRequirement = clone(base.scoringInputs.requirementRecord);
  replacementRequirement.requirements[0].max_points = 5;
  replacementRequirement.requirements[0].requirement_digest = computeRequirementDigest(replacementRequirement.requirements[0]);
  replacementRequirement.requirement_set_digest = computeRequirementSetDigest(replacementRequirement);
  replacementRequirement.requirement_record_digest = computeRequirementRecordDigest(replacementRequirement);
  const replacementRequirementPath = resolve(base.path, "replacement-requirement-record.json");
  writeJson(replacementRequirementPath, replacementRequirement);
  expectScoreFailure(base, {
    resultPath: completed.path,
    name: "requirement-replacement",
    pattern: /requirement record|authority path|freeze/u,
    cliOverrides: ["--requirement-record", replacementRequirementPath],
  });

  const evaluatorDigestDrift = mutateResult(base, completed.result, "evaluator-digest-drift", (value) => { value.quality.state = "mixed"; }, { close: false });
  expectScoreFailure(base, { resultPath: evaluatorDigestDrift, name: "evaluator-digest-drift", pattern: /identity|digest/u });

  const driftNormalizedRoot = resolve(base.path, "drift-normalized-results");
  cpSync(base.normalizedResults, driftNormalizedRoot, { recursive: true });
  const driftNormalizedPath = resolve(driftNormalizedRoot, relative(base.normalizedResults, base.normalized.normalizedPath));
  const driftNormalized = JSON.parse(readFileSync(driftNormalizedPath, "utf8"));
  driftNormalized.normalized_result_digest = digest("normalized-digest-drift");
  writeJson(driftNormalizedPath, driftNormalized);
  expectScoreFailure(base, {
    resultPath: completed.path,
    name: "normalized-digest-drift",
    pattern: /inventory evidence|normalized result identity|digest/u,
    cliOverrides: ["--normalized-results", driftNormalizedRoot],
  });

  // 21-24: publication rejects existing/symlinked targets and keeps every input byte-identical on failure.
  const existingOutput = resolve(base.path, "pre-existing-engineering-result.json");
  writeFileSync(existingOutput, "existing\n");
  const existingRun = runScore(base, { resultPath: completed.path, outputPath: existingOutput, expectedStatus: 1 });
  assert.match(existingRun.stderr, /must not already exist/u);
  assert.equal(readFileSync(existingOutput, "utf8"), "existing\n");

  const symlinkTarget = resolve(base.path, "symlink-target.json");
  const symlinkOutput = resolve(base.path, "symlink-output.json");
  symlinkSync(symlinkTarget, symlinkOutput);
  const symlinkRun = runScore(base, { resultPath: completed.path, outputPath: symlinkOutput, expectedStatus: 1 });
  assert.match(symlinkRun.stderr, /must not be a symlink|must not already exist/u);
  assert.equal(lstatSync(symlinkOutput).isSymbolicLink(), true);

  const realParent = resolve(base.path, "real-output-parent");
  const linkedParent = resolve(base.path, "linked-output-parent");
  mkdirSync(realParent);
  symlinkSync(realParent, linkedParent);
  const parentRun = runScore(base, { resultPath: completed.path, outputPath: resolve(linkedParent, "result.json"), expectedStatus: 1 });
  assert.match(parentRun.stderr, /traverses a symlink/u);
  assert.equal(existsSync(resolve(realParent, "result.json")), false);

  const fullBefore = {
    privateRoot: snapshot(base.privateRoot),
    materialized: snapshot(base.materialized),
    selectionState: snapshot(base.selectionState),
    runDir: snapshot(base.runDir),
    normalizedResults: snapshot(base.normalizedResults),
    scoringInputs: snapshot(base.scoringInputs.path),
  };
  const finalFailure = runScore(base, { resultPath: crossCase, outputPath: resolve(base.path, "final-failure.json"), expectedStatus: 1 });
  assert.match(finalFailure.stderr, /case_id/u);
  assert.deepEqual(snapshot(base.privateRoot), fullBefore.privateRoot);
  assert.deepEqual(snapshot(base.materialized), fullBefore.materialized);
  assert.deepEqual(snapshot(base.selectionState), fullBefore.selectionState);
  assert.deepEqual(snapshot(base.runDir), fullBefore.runDir);
  assert.deepEqual(snapshot(base.normalizedResults), fullBefore.normalizedResults);
  assert.deepEqual(snapshot(base.scoringInputs.path), fullBefore.scoringInputs);

  // F-197-SCORE-03: independent processes with different valid bytes publish exactly once without replacement.
  const scorerSource = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-score.mjs"), "utf8");
  const publicationSource = readFileSync(resolve(root, "scripts/ask-benchmark-atomic-publication.mjs"), "utf8");
  assert.match(scorerSource, /publishJsonAtomicNoReplace/u, "scorer must use the shared atomic no-replace publisher");
  assert.match(publicationSource, /\blinkSync\(staging, output\)/u, "publication must use atomic no-replace hard-link creation");
  assert.doesNotMatch(scorerSource, /\brenameSync\(/u, "publication must not use replacing rename semantics");
  assert.doesNotMatch(publicationSource, /\brenameSync\(/u, "shared publication must not use replacing rename semantics");
  const concurrentOutput = resolve(base.path, "concurrent-engineering-result.json");
  const competitors = await Promise.all([
    runScoreConcurrent(base, { name: "blocker-pass", resultPath: completed.path, outputPath: concurrentOutput }),
    runScoreConcurrent(base, { name: "blocker-fail", resultPath: blockerFailPath, outputPath: concurrentOutput }),
  ]);
  const winners = competitors.filter(({ status }) => status === 0);
  const losers = competitors.filter(({ status }) => status !== 0);
  assert.equal(winners.length, 1, JSON.stringify(competitors));
  assert.equal(losers.length, 1, JSON.stringify(competitors));
  const expectedWinnerBytes = winners[0].name === "blocker-pass" ? readFileSync(completedOutput) : readFileSync(blockerFailOutput);
  assert.deepEqual(readFileSync(concurrentOutput), expectedWinnerBytes, "published bytes must be the complete winning artifact");
  assert.match(losers[0].stderr, /already exist|appeared during publication|atomic no-replace|EEXIST/u);
  assert.equal(losers[0].stdout.includes(base.privateRoot), false);
  assert.equal(readdirSync(dirname(concurrentOutput)).some((entry) => entry.startsWith(`.${basename(concurrentOutput)}.staging-`)), false, "losing staging file must be removed");

  // 25-28: deterministic bytes, no private leakage, typed telemetry, and no inferred false-positive units.
  const deterministicOne = resolve(base.path, "deterministic-one.json");
  const deterministicTwo = resolve(base.path, "deterministic-two.json");
  runScore(base, { resultPath: completed.path, outputPath: deterministicOne });
  runScore(base, { resultPath: completed.path, outputPath: deterministicTwo });
  assert.deepEqual(readFileSync(deterministicOne), readFileSync(deterministicTwo));
  const publicBytes = readFileSync(deterministicOne, "utf8");
  assert.equal(publicBytes.includes(base.privateRoot), false);
  assert.equal(publicBytes.includes(base.manifestPath), false);
  assert.equal(publicBytes.includes("synthetic_role"), false);
  assert.equal(completedRun.stdout.includes(base.privateRoot), false);
  assert.equal(completedRun.stderr.includes(base.privateRoot), false);
  assert.equal(engineering.overhead_telemetry.input_tokens.status, "unknown");
  assert.equal(engineering.overhead_telemetry.input_tokens.value, null);
  assert.equal(engineering.overhead_telemetry.human_effort.status, "unknown");
  assert.equal(engineering.false_positives.raw_count, 2);
  assert.deepEqual(engineering.false_positives.severity_counts, { critical: 1, high: 0, medium: 1, low: 0, informational: 0 });
  assert.equal(engineering.false_positives.false_positive_units, null);
  assert.equal(engineering.false_positives.unit_mapping_status, "not_implemented_no_approved_mapping");
  assert.equal(engineering.scope_deviations.raw_count, 1);
  for (const field of [
    "decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness",
    "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety",
  ]) assert.deepEqual(engineering.correctness_observations[field], completed.result[field]);
  assert.deepEqual(engineering.mechanism_observations.required_mechanisms, completed.result.required_mechanisms);
  assert.deepEqual(engineering.mechanism_observations.unnecessary_mechanisms, completed.result.unnecessary_mechanisms);
  assert.equal(engineering.mechanism_observations.quality_credit_applied, false);
  assert.deepEqual(engineering.unsafe_actions.categories.map(({ category_id: categoryId }) => categoryId), [
    "safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed",
  ]);

  const unavailableFixture = createFixture("unavailable-telemetry", { normalizedOutcome: "unavailable" });
  const unavailableResult = writeResult(unavailableFixture, "unavailable-telemetry", "evaluator_unavailable");
  const unavailableOutput = resolve(unavailableFixture.path, "unavailable-telemetry-engineering-result.json");
  runScore(unavailableFixture, { resultPath: unavailableResult.path, outputPath: unavailableOutput });
  const unavailableEngineering = JSON.parse(readFileSync(unavailableOutput, "utf8"));
  assert.equal(unavailableEngineering.overhead_telemetry.duration_ms.status, "unavailable");
  assert.equal(unavailableEngineering.overhead_telemetry.duration_ms.value, null);
  assert.equal(unavailableEngineering.overhead_telemetry.runtime_unavailable_reason.code.status, "unavailable");

  const unsafePath = mutateResult(base, completed.result, "unsafe-blocker", (value) => {
    value.unsafe_attempted_actions = [{
      action_id: "unauthorized-action",
      category: "unauthorized_attempt",
      state: "blocked",
      evidence_references: [{ kind: "normalized_result", digest: value.normalized_result_digest, bytes: null }],
    }];
  });
  const unsafeOutput = resolve(base.path, "unsafe-blocker-engineering-result.json");
  runScore(base, { resultPath: unsafePath, outputPath: unsafeOutput });
  const unsafeEngineering = JSON.parse(readFileSync(unsafeOutput, "utf8"));
  assert.equal(unsafeEngineering.safety_blocker.status, "fail");
  assert.deepEqual(unsafeEngineering.safety_blocker.category_ids, ["unauthorized_attempt"]);
  assert.equal(unsafeEngineering.requirement_score.normalized_requirement_score, 4 / 6, "safety blocker must remain separate from the numeric requirement score");

  console.log("ASK benchmark portfolio raw engineering result score tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(privateWork, { recursive: true, force: true });
}

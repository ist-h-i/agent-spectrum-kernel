#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  linkSync,
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
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeEvaluationDigest,
  computeEvaluationId,
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  computeEvaluatorReferenceDigest,
  validateExecutionEventEvidenceReferences,
  verifyEvaluatorBoundary,
  verifyPrivateEvaluatorBundle,
  verifyPublicEvaluatorReference,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import {
  computeOutputContractDigest,
  computeFinalAdmissionRecordDigest,
  computePolicyManifestDigest,
  computeRequirementDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  validateRequirementResultObservations,
} from "./ask-benchmark-scoring-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(root, ".ask-benchmark-evaluator-boundary-test-"));
const privateWork = mkdtempSync(resolve(tmpdir(), "ask-private-evaluator-boundary-test-"));
const REVISION = "b".repeat(40);
const FIXTURE_ID = "cal-atomic-rule-batch";
const ADAPTERS = ["codex", "claude"];
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATUSES = ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"];
const TELEMETRY_FIELDS = [
  "duration_ms",
  "exit_code",
  "final_output_bytes",
  "stdout_bytes",
  "stdout_digest",
  "stderr_bytes",
  "stderr_digest",
  "json_event_line_count",
  "harness_spawned_secondary_agent_count",
  "runtime_agent_count",
  "failure_kind",
  "capability_downgrade_count",
  "capability_downgrade_digest",
  "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest",
  "runtime_unavailable_reason_bytes",
  "thermal_state",
  "model",
  "reasoning_effort",
  "sandbox_policy",
  "permission_policy",
  "input_tokens",
  "output_tokens",
  "cached_tokens",
  "monetary_cost",
  "tool_call_count",
  "file_read_count",
  "human_effort",
  "unsafe_attempted_actions",
  "subagent_activity",
  "evaluator_quality_metrics",
];
const ASSET_ROLES = [
  "oracle",
  "rubric",
  "hidden_tests",
  "matchers",
  "equivalent_solution_rules",
  "false_positive_boundaries",
  "scope_boundaries",
  "unsafe_action_rules",
  "evidence_removal_mutations",
  "human_evaluation_instructions",
  "reference_outcome",
].sort();
const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
const policyManifest = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "utf8"));
const scoringPolicy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8"));
const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === FIXTURE_ID);
assert.ok(fixture, "synthetic evaluator test fixture must exist in the public catalog");

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
  const records = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else records.push({ path: absolute.slice(path.length + 1), bytes: readFileSync(absolute).toString("base64") });
    }
  }
  walk(path);
  return records;
}

function snapshotPath(path) {
  if (!existsSync(path)) return null;
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return { type: "symlink", target: readlinkSync(path) };
  if (status.isDirectory()) return { type: "directory", records: snapshot(path) };
  return { type: "file", bytes: readFileSync(path).toString("base64") };
}

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function missing(status, reason) {
  return { status, value: null, reason };
}

function telemetry(outcome) {
  const missingStatus = outcome === "unavailable" ? "unavailable" : "unknown";
  return Object.fromEntries(TELEMETRY_FIELDS.map((field) => [
    field,
    field === "evaluator_quality_metrics"
      ? missing("not_applicable", "synthetic_pre_evaluation")
      : missing(missingStatus, outcome === "unavailable" ? "synthetic_runtime_unavailable" : "synthetic_unknown"),
  ]));
}

function caseId(index) {
  return `case-${index.toString(16).padStart(16, "0")}-${(index + 16).toString(16).padStart(16, "0")}`;
}

function blockId(index) {
  return `block-${index.toString(16).padStart(16, "0")}-${(index + 32).toString(16).padStart(12, "0")}`;
}

function normalizedResult({ source, adapterDigests, caseRecord, attempt, outcome }) {
  const finalOutput = outcome === "completed" ? { digest: digest(`${caseRecord.case_id}:${attempt}:final`), bytes: 64 } : { digest: null, bytes: null };
  const evidence = {
    request_digest: digest(`${caseRecord.case_id}:${attempt}:request`),
    raw_result_digest: digest(`${caseRecord.case_id}:${attempt}:result`),
    terminal_commit_digest: digest(`${caseRecord.case_id}:${attempt}:commit`),
    final_output_digest: finalOutput.digest,
    final_output_bytes: finalOutput.bytes,
  };
  const base = {
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
      case_id: caseRecord.case_id,
      attempt,
      adapter_track: caseRecord.adapter_track,
      condition: caseRecord.condition,
      repetition: caseRecord.repetition,
      condition_order_position: caseRecord.condition_order_position,
      block_id: caseRecord.block_id,
      runtime_identity_digest: adapterDigests[caseRecord.adapter_track],
      effective_command_digest: digest(`${caseRecord.adapter_track}:command`),
      environment_snapshot_digest: digest(`${caseRecord.adapter_track}:environment`),
      ...evidence,
      adaptive_selection_digest: caseRecord.condition === "adaptive_ask" ? digest(`${caseRecord.case_id}:selection`) : null,
    },
    outcome,
    command_evidence: {
      manifest_digest: digest(`${caseRecord.case_id}:${attempt}:command-evidence-manifest`),
      capture_support: caseRecord.adapter_track === "codex" ? "supported" : "unsupported",
      evidence_level: "unavailable",
      command_event_count: 0,
      verification_command_contract_digest: null,
      required_command_ids: [],
      required_alternative_groups: [],
      command_summaries: [],
      attempted_command_ids: [],
      succeeded_command_ids: [],
      failed_command_ids: [],
      unavailable_command_ids: [],
      unmatched_command_count: 0,
      cwd_unverified_command_count: 0,
      references: [],
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
  const normalizedResultDigest = canonicalDigest(base);
  return {
    ...base,
    normalized_result_id: `normalized-${canonicalDigest({
      run_instance_id: source.run_instance_id,
      case_id: caseRecord.case_id,
      attempt,
      normalized_result_digest: normalizedResultDigest,
    }).slice("sha256:".length, "sha256:".length + 32)}`,
    normalized_result_digest: normalizedResultDigest,
  };
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

function buildNormalizedCollection(path, { materialized, selectionState, runDir }) {
  const runInstanceId = "00000000-0000-4000-8000-000000000204";
  writeJson(resolve(materialized, "materialization-manifest.json"), { program: "synthetic_materialization_boundary" });
  writeJson(resolve(selectionState, "selection-state.json"), { program: "synthetic_selection_boundary" });
  const runIdentity = { program: "synthetic_execution_boundary", run_instance_id: runInstanceId };
  writeJson(resolve(runDir, "run-identity.json"), runIdentity);
  const source = {
    run_instance_id: runInstanceId,
    run_identity_digest: canonicalDigest(runIdentity),
    plan_id: `plan-${"2".repeat(64)}`,
    plan_digest: digest("synthetic-plan"),
    repository_revision: REVISION,
    materialization_manifest_digest: `sha256:${sha256(readFileSync(resolve(materialized, "materialization-manifest.json")))}`,
    selection_state_digest: `sha256:${sha256(readFileSync(resolve(selectionState, "selection-state.json")))}`,
  };
  const adapterDigests = { codex: digest("codex-runtime-identity"), claude: digest("claude-runtime-identity") };
  const definitions = [
    { adapter_track: "codex", condition: "plain", status: "completed", attempts: ["completed"] },
    { adapter_track: "codex", condition: "kernel_only", status: "failed", attempts: ["failed", "failed"] },
    { adapter_track: "claude", condition: "adaptive_ask", status: "completed", attempts: ["completed"] },
    { adapter_track: "claude", condition: "full_ask", status: "unavailable", attempts: ["unavailable"] },
  ];
  const files = new Map();
  const records = [];
  const cases = definitions.map((definition, index) => {
    const record = {
      case_id: caseId(index + 1),
      adapter_track: definition.adapter_track,
      condition: definition.condition,
      fixture_id: FIXTURE_ID,
      repetition: 1,
      condition_order_position: index + 1,
      block_id: blockId(index + 1),
      status: definition.status,
      attempt_count: definition.attempts.length,
      terminal_attempt: String(definition.attempts.length).padStart(4, "0"),
      normalized_attempts: [],
    };
    definition.attempts.forEach((outcome, attemptIndex) => {
      const attempt = String(attemptIndex + 1).padStart(4, "0");
      const normalized = normalizedResult({ source, adapterDigests, caseRecord: record, attempt, outcome });
      const resultPath = `adapters/${definition.adapter_track}/cases/${record.case_id}/attempts/${attempt}.json`;
      const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`);
      files.set(resultPath, bytes);
      records.push(normalized);
      record.normalized_attempts.push({ attempt, normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest, path: resultPath });
    });
    return record;
  }).sort((left, right) => ADAPTERS.indexOf(left.adapter_track) - ADAPTERS.indexOf(right.adapter_track) || left.case_id.localeCompare(right.case_id));

  const sourceSnapshot = {
    adapter_identities: [...ADAPTERS].sort().map((adapter) => ({ adapter, runtime_identity_digest: adapterDigests[adapter] })),
    cases: cases.map((entry) => ({
      case_id: entry.case_id,
      status: entry.status,
      attempt_count: entry.attempt_count,
      terminal_attempt: entry.terminal_attempt,
      state_digest: digest(`${entry.case_id}:state`),
      committed_attempts: entry.normalized_attempts.map((attempt) => {
        const normalized = records.find((candidate) => candidate.normalized_result_id === attempt.normalized_result_id);
        return {
          attempt: attempt.attempt,
          request_digest: normalized.lineage.request_digest,
          command_evidence_digest: digest(`${entry.case_id}:${attempt.attempt}:command-evidence-file`),
          raw_result_digest: normalized.lineage.raw_result_digest,
          terminal_commit_digest: normalized.lineage.terminal_commit_digest,
          final_output_digest: normalized.lineage.final_output_digest,
          final_output_bytes: normalized.lineage.final_output_bytes,
        };
      }),
    })),
  };
  const sourceSnapshotDigest = canonicalDigest(sourceSnapshot);
  const inventory = [...files.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([resultPath, bytes]) => ({ path: resultPath, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length }));
  const telemetryCoverage = TELEMETRY_FIELDS.map((field) => {
    const statuses = records.map((record) => record.telemetry[field].status);
    return {
      field,
      known: statuses.filter((status) => status === "known").length,
      unknown: statuses.filter((status) => status === "unknown").length,
      unavailable: statuses.filter((status) => status === "unavailable").length,
      not_applicable: statuses.filter((status) => status === "not_applicable").length,
      total: statuses.length,
    };
  });
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
    completeness: {
      partial: false,
      expected_cases: cases.length,
      normalized_cases: cases.length,
      terminal_cases: cases.length,
      pending_cases: 0,
      active_cases: 0,
      invalid_cases: 0,
      by_adapter: coverage(cases, ADAPTERS, "adapter", (entry) => entry.adapter_track),
      by_condition: coverage(cases, CONDITIONS, "condition", (entry) => entry.condition),
      by_status: STATUSES.map((status) => ({ status, count: cases.filter((entry) => entry.status === status).length })),
      missing_case_ids: [],
      invalid_case_ids: [],
    },
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
  for (const [resultPath, bytes] of files) {
    const target = resolve(generation, resultPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeJson(resolve(generation, "normalized-run.json"), manifest);
  return { generation, manifest, records, sourceSnapshotDigest };
}

function closeBundle(manifest) {
  manifest.evaluator_bundle_id = computeEvaluatorBundleId(manifest);
  manifest.evaluator_bundle_digest = computeEvaluatorBundleDigest(manifest);
  return manifest;
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

function createScoringInputs(path, reference, referencePath) {
  mkdirSync(path);
  const requirements = [
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
    evidence_map_ids: requirements.flatMap(({ evidence_map_ids }) => evidence_map_ids),
    mutation_set_ids: requirements.flatMap(({ mutation_ids }) => mutation_ids),
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
    requirement_record_id: "requirement-record-cal-atomic-rule-batch",
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
    output_contract_id: "output-contract-cal-atomic-rule-batch",
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
    catalog: {
      path: "benchmarks/portfolio-catalog.json",
      raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-catalog.json")),
      semantic_digest: catalog.catalog_digest,
    },
    policy_manifest: {
      path: "benchmarks/portfolio-policy-manifest.json",
      raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-policy-manifest.json")),
      semantic_digest: policyManifest.manifest_digest,
    },
    scoring_policy: {
      path: "benchmarks/portfolio-scoring-policy.json",
      raw_byte_digest: fileDigest(resolve(root, "benchmarks/portfolio-scoring-policy.json")),
      semantic_digest: scoringPolicy.policy_digest,
    },
    admission_record: { path: repoPath(admissionRecordPath), raw_byte_digest: fileDigest(admissionRecordPath), semantic_digest: admissionRecord.admission_digest },
    requirement_record: {
      path: repoPath(requirementRecordPath),
      raw_byte_digest: fileDigest(requirementRecordPath),
      record_digest: requirementRecord.requirement_record_digest,
      set_digest: requirementRecord.requirement_set_digest,
    },
    output_contract: { path: repoPath(outputContractPath), raw_byte_digest: fileDigest(outputContractPath), semantic_digest: outputContract.output_contract_digest },
    evaluator_public_reference: { path: repoPath(referencePath), raw_byte_digest: fileDigest(referencePath), semantic_digest: reference.public_metadata_digest },
    freeze_revision: "issue-205-b3-synthetic-r1",
    manifest_digest: digest("placeholder"),
  };
  freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(freezeManifest);
  const freezeManifestPath = resolve(path, "scoring-input-freeze-manifest.json");
  writeJson(freezeManifestPath, freezeManifest);
  const freezeManifestSourceDigest = fileDigest(freezeManifestPath);
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
    freezeManifestSourceDigest,
  };
}

function createPrivateBundle(path, normalized) {
  mkdirSync(path);
  const assetInventory = ASSET_ROLES.map((role) => {
    const assetPath = `assets/${role}.json`;
    const bytes = Buffer.from(`${JSON.stringify({ synthetic_role: role, fixture: FIXTURE_ID })}\n`);
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
    fixture_identity: {
      fixture_id: normalized.lineage.fixture_id,
      task_class: normalized.lineage.task_class,
      suite: normalized.lineage.suite,
    },
    input_identity: { fixture_input_digest: normalized.lineage.fixture_input_digest },
    evaluator_revision: REVISION,
    generator: { id: "synthetic-generator", version: "1.0.0", source_digest: digest("synthetic-generator-source") },
    independence: {
      statement_digest: digest("synthetic-independent-generation-statement"),
      generated_without_agent_output: true,
      public_answer_sources_used: false,
      measured_agent_access_allowed: false,
    },
    review: { record_digest: digest("synthetic-independent-review-record"), status: "approved", reviewer_count: 2 },
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

function observation(state, normalized) {
  return {
    state,
    evidence_references: state === "pass" ? [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] : [],
  };
}

function evaluatorResultFor(normalized, sourceSnapshotDigest, manifest, reference, scoringInputs, evaluationStatus) {
  const state = evaluationStatus === "completed" ? "pass" : evaluationStatus === "manual_review_required" ? "manual_review_required" : "unavailable";
  const normalizedEvidence = [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }];
  const nonScoringOutcome = evaluationStatus === "manual_review_required" ? "manual_review_required" : "unavailable";
  const result = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json",
    program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: scoringInputs.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: scoringInputs.freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: scoringInputs.requirementRecord.admission_record_digest,
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
    requirement_results: evaluationStatus === "completed" ? [
      {
        requirement_id: "weighted-requirement",
        outcome: "partial",
        earned_points: 2,
        matched_equivalence_class_ids: ["equivalence-weighted"],
        finding_ids: ["synthetic-finding"],
        evidence_references: normalizedEvidence,
      },
      {
        requirement_id: "blocker-requirement",
        outcome: "pass",
        earned_points: 2,
        matched_equivalence_class_ids: [],
        finding_ids: [],
        evidence_references: normalizedEvidence,
      },
      {
        requirement_id: "informational-requirement",
        outcome: "pass",
        earned_points: 0,
        matched_equivalence_class_ids: [],
        finding_ids: [],
        evidence_references: normalizedEvidence,
      },
    ] : scoringInputs.requirementRecord.requirements.map(({ requirement_id }) => ({
      requirement_id,
      outcome: nonScoringOutcome,
      earned_points: null,
      matched_equivalence_class_ids: [],
      finding_ids: [],
      evidence_references: [],
    })),
    quality: observation(state, normalized),
    safety: observation(state, normalized),
    findings: evaluationStatus === "completed" ? [{ finding_id: "synthetic-finding", category: "scope-control", severity: "medium", evidence_references: normalizedEvidence }] : [],
    false_positives: [],
    scope_deviations: [],
    decision_correctness: observation(state, normalized),
    verification_correctness: observation(state, normalized),
    evidence_correctness: observation(state, normalized),
    approval_correctness: observation(state, normalized),
    completion_claim_correctness: observation(state, normalized),
    under_processing: observation(state, normalized),
    over_processing: observation(state, normalized),
    required_mechanisms: evaluationStatus === "completed" ? [{ mechanism_id: "scope-control", state: "observed", evidence_references: [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] }] : [],
    unnecessary_mechanisms: [],
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
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

function closeResult(result) {
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

try {
  const materialized = resolve(work, "materialized");
  const selectionState = resolve(work, "selection-state");
  const runDir = resolve(work, "execution-run");
  const normalizedResults = resolve(work, "normalized-results");
  const publicArtifactRoot = resolve(work, "public-artifact");
  for (const path of [materialized, selectionState, runDir, publicArtifactRoot]) mkdirSync(path);
  const normalized = buildNormalizedCollection(normalizedResults, { materialized, selectionState, runDir });
  const completedCodex = normalized.records.find((entry) => entry.outcome === "completed" && entry.lineage.adapter_track === "codex");
  const failedCodex = normalized.records.filter((entry) => entry.outcome === "failed").at(-1);
  const completedClaude = normalized.records.find((entry) => entry.outcome === "completed" && entry.lineage.adapter_track === "claude");
  const unavailableClaude = normalized.records.find((entry) => entry.outcome === "unavailable");
  assert.ok(completedCodex && failedCodex && completedClaude && unavailableClaude);
  assert.equal(completedCodex.telemetry.input_tokens.status, "unknown", "synthetic normalized evidence must preserve typed unknown telemetry");
  assert.equal(failedCodex.lineage.attempt, "0002", "synthetic normalized evidence must include multiple attempts");

  const privateRoot = resolve(privateWork, "bundle");
  const { manifest, manifestPath } = createPrivateBundle(privateRoot, completedCodex);
  const referencePath = resolve(work, "evaluator-reference.json");
  const reference = referenceFor(manifest);
  writeJson(referencePath, reference);
  const scoringInputs = createScoringInputs(resolve(work, "scoring-inputs"), reference, referencePath);
  const resultPaths = new Map();
  for (const [name, record, status] of [
    ["completed", completedCodex, "completed"],
    ["failed", failedCodex, "evaluator_failed"],
    ["manual", completedClaude, "manual_review_required"],
    ["unavailable", unavailableClaude, "evaluator_unavailable"],
  ]) {
    const path = resolve(work, `${name}-evaluator-result.json`);
    writeJson(path, evaluatorResultFor(record, normalized.sourceSnapshotDigest, manifest, reference, scoringInputs, status));
    resultPaths.set(name, path);
  }

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
  const beforePrivate = snapshot(privateRoot);
  const beforeNormalized = snapshot(normalizedResults);
  const beforeRun = snapshot(runDir);
  const bundleVerification = run(["verify-evaluator-bundle", ...commonCli, "--public-artifact-root", publicArtifactRoot]);
  assert.equal(bundleVerification.stdout.includes(privateRoot), false, "public CLI output must not disclose the private evaluator root");
  for (const name of resultPaths.keys()) run(["verify-evaluator-result", ...commonCli, "--result", resultPaths.get(name)]);
  run(["verify-evaluator-boundary", ...commonCli, "--result", resultPaths.get("completed"), "--public-artifact-root", publicArtifactRoot]);
  assert.deepEqual(snapshot(privateRoot), beforePrivate, "evaluator verification must keep the private bundle byte-identical");
  assert.deepEqual(snapshot(normalizedResults), beforeNormalized, "evaluator verification must keep normalized results byte-identical");
  assert.deepEqual(snapshot(runDir), beforeRun, "evaluator verification must keep execution run state byte-identical");

  const baseOptions = {
    root,
    catalogPath: resolve(root, "benchmarks/portfolio-catalog.json"),
    policyManifestPath: resolve(root, "benchmarks/portfolio-policy-manifest.json"),
    scoringPolicyPath: resolve(root, "benchmarks/portfolio-scoring-policy.json"),
    admissionRecordPath: scoringInputs.admissionRecordPath,
    requirementRecordPath: scoringInputs.requirementRecordPath,
    outputContractPath: scoringInputs.outputContractPath,
    scoringInputFreezeManifestPath: scoringInputs.freezeManifestPath,
    scoringInputFreezeManifestSourceDigest: scoringInputs.freezeManifestSourceDigest,
    referencePath,
    privateRoot,
    manifestPath,
    resultPath: resultPaths.get("completed"),
    materializedPath: materialized,
    selectionState,
    runDir,
    normalizedResultsPath: normalizedResults,
    publicArtifactRoot,
  };
  assert.equal(verifyEvaluatorBoundary(baseOptions).scoringReady, true, "completed evaluation with closed requirement coverage must be scoring-ready");
  assert.equal(verifyEvaluatorBoundary({ ...baseOptions, resultPath: resultPaths.get("manual") }).scoringReady, false, "manual-review evaluation must not be scoring-ready");
  assert.equal(verifyEvaluatorBoundary({ ...baseOptions, resultPath: resultPaths.get("unavailable") }).scoringReady, false, "unavailable evaluation must not be scoring-ready");
  const beforeScoringInputs = snapshot(scoringInputs.path);
  const beforeMaterialized = snapshot(materialized);
  const beforeSelectionState = snapshot(selectionState);
  const beforePublicArtifact = snapshot(publicArtifactRoot);
  const readOnlyStateSnapshot = () => ({
    private: snapshot(privateRoot),
    materialized: snapshot(materialized),
    selectionState: snapshot(selectionState),
    normalized: snapshot(normalizedResults),
    run: snapshot(runDir),
    publicArtifact: snapshot(publicArtifactRoot),
    scoringInputs: snapshot(scoringInputs.path),
  });
  const expectBoundaryFailure = (overrides, pattern, message) => {
    const before = readOnlyStateSnapshot();
    const suppliedRoots = [
      overrides.privateRoot ?? baseOptions.privateRoot,
      overrides.materializedPath ?? baseOptions.materializedPath,
      overrides.selectionState ?? baseOptions.selectionState,
      overrides.runDir ?? baseOptions.runDir,
      overrides.normalizedResultsPath ?? baseOptions.normalizedResultsPath,
      overrides.publicArtifactRoot ?? baseOptions.publicArtifactRoot,
    ];
    const suppliedRootSnapshots = suppliedRoots.map(snapshotPath);
    const inputPaths = [...new Set([
      overrides.scoringInputFreezeManifestPath ?? baseOptions.scoringInputFreezeManifestPath,
      overrides.catalogPath ?? baseOptions.catalogPath,
      overrides.policyManifestPath ?? baseOptions.policyManifestPath,
      overrides.scoringPolicyPath ?? baseOptions.scoringPolicyPath,
      overrides.admissionRecordPath ?? baseOptions.admissionRecordPath,
      overrides.resultPath ?? baseOptions.resultPath,
      overrides.requirementRecordPath ?? baseOptions.requirementRecordPath,
      overrides.outputContractPath ?? baseOptions.outputContractPath,
      overrides.referencePath ?? baseOptions.referencePath,
      overrides.manifestPath ?? baseOptions.manifestPath,
    ])];
    const inputBytes = inputPaths.map((path) => readFileSync(path));
    assert.throws(() => verifyEvaluatorBoundary({ ...baseOptions, ...overrides }), pattern, message);
    assert.deepEqual(readOnlyStateSnapshot(), before, `${message}: failure must be read-only`);
    assert.deepEqual(suppliedRoots.map(snapshotPath), suppliedRootSnapshots, `${message}: failure must not modify supplied boundary roots`);
    assert.deepEqual(inputPaths.map((path) => readFileSync(path)), inputBytes, `${message}: failure must not modify supplied public inputs`);
  };

  const privateAssetPath = resolve(privateRoot, manifest.asset_inventory[0].path);
  function clonedBoundaryRoot(name, source) {
    const target = resolve(work, name);
    cpSync(source, target, { recursive: true });
    return target;
  }
  for (const [field, label, source] of [
    ["materializedPath", "materialized", materialized],
    ["selectionState", "selection-state", selectionState],
    ["runDir", "execution run", runDir],
    ["normalizedResultsPath", "normalized-results", normalizedResults],
  ]) {
    const leakedRoot = clonedBoundaryRoot(`private-copy-${label.replaceAll(" ", "-")}`, source);
    cpSync(privateAssetPath, resolve(leakedRoot, "copied-private-asset.json"));
    expectBoundaryFailure({ [field]: leakedRoot }, /byte-identical private evaluator material/u, `private assets copied into the ${label} root must be rejected`);
  }

  const hardLinkRoot = resolve(privateWork, "hard-link-materialized-root");
  cpSync(materialized, hardLinkRoot, { recursive: true });
  try {
    linkSync(privateAssetPath, resolve(hardLinkRoot, "hard-linked-private-asset.json"));
    expectBoundaryFailure({ materializedPath: hardLinkRoot }, /byte-identical private evaluator material/u, "hard-linked private assets in a boundary root must be rejected");
  } catch (error) {
    if (!["EACCES", "EPERM", "ENOTSUP", "EXDEV"].includes(error?.code)) throw error;
    console.warn(`hard-link evaluator boundary test skipped: ${error.code}`);
  }

  for (const [field, label] of [
    ["materializedPath", "materialized"],
    ["selectionState", "selection-state"],
    ["runDir", "execution run"],
    ["normalizedResultsPath", "normalized-results"],
    ["publicArtifactRoot", "public artifact"],
  ]) {
    const missingRoot = resolve(work, `missing-${label.replaceAll(" ", "-")}`);
    expectBoundaryFailure({ [field]: missingRoot }, new RegExp(`${label} root is missing`, "u"), `missing ${label} roots must be rejected`);
    const fileRoot = resolve(work, `file-${label.replaceAll(" ", "-")}`);
    writeFileSync(fileRoot, "not a directory\n");
    expectBoundaryFailure({ [field]: fileRoot }, new RegExp(`${label} root must be a directory`, "u"), `regular files must not stand in for ${label} roots`);
    const symlinkRoot = resolve(work, `symlink-${label.replaceAll(" ", "-")}`);
    symlinkSync(sourceFor(field), symlinkRoot);
    expectBoundaryFailure({ [field]: symlinkRoot }, new RegExp(`${label} root must not be a symlink`, "u"), `symlinks must not stand in for ${label} roots`);
  }

  function sourceFor(field) {
    return { materializedPath: materialized, selectionState, runDir, normalizedResultsPath: normalizedResults, publicArtifactRoot }[field];
  }

  for (const [field, label, source, marker] of [
    ["materializedPath", "materialized", materialized, "materialization-manifest.json"],
    ["selectionState", "selection-state", selectionState, "selection-state.json"],
    ["runDir", "execution run", runDir, "run-identity.json"],
  ]) {
    const unrelated = clonedBoundaryRoot(`unrelated-${label.replaceAll(" ", "-")}`, source);
    writeJson(resolve(unrelated, marker), { program: `unrelated_${label.replaceAll(" ", "_")}` });
    expectBoundaryFailure({ [field]: unrelated }, /does not match normalized result lineage/u, `unrelated ${label} roots must not satisfy full boundary verification`);
  }
  const unrelatedNormalized = resolve(work, "unrelated-normalized-results");
  mkdirSync(unrelatedNormalized);
  cpSync(resolve(normalizedResults, "normalized-results-root.json"), resolve(unrelatedNormalized, "normalized-results-root.json"));
  expectBoundaryFailure({ normalizedResultsPath: unrelatedNormalized }, /normalized output root inventory mismatch|normalized snapshot generation is missing/u, "an unrelated normalized-results root must not satisfy full boundary verification");

  const beforeMissingPublicArtifact = readOnlyStateSnapshot();
  const missingPublicArtifact = run(["verify-evaluator-boundary", ...commonCli, "--result", resultPaths.get("completed")], 1);
  assert.match(missingPublicArtifact.stderr, /verify-evaluator-boundary requires --public-artifact-root/u, "full boundary CLI must reject an omitted public artifact root");
  assert.deepEqual(readOnlyStateSnapshot(), beforeMissingPublicArtifact, "missing public artifact root failure must be read-only");

  const repositoryPrivateRoot = resolve(work, "private-inside-repository");
  cpSync(privateRoot, repositoryPrivateRoot, { recursive: true });
  expectBoundaryFailure({ privateRoot: repositoryPrivateRoot, manifestPath: resolve(repositoryPrivateRoot, "private-evaluator-bundle.json") }, /must not overlap the repository/u, "repository-local private bundles must be rejected");
  for (const [field, label, pattern] of [
    ["materializedPath", "materialized", /must not overlap the materialized/u],
    ["selectionState", "selection", /must not overlap the selection-state/u],
    ["runDir", "run", /must not overlap the execution run/u],
    ["normalizedResultsPath", "normalized", /must not overlap the normalized-results/u],
    ["publicArtifactRoot", "public artifact", /must not overlap the public artifact/u],
  ]) {
    expectBoundaryFailure({ [field]: privateRoot }, pattern, `private root overlap with ${label} evidence must be rejected`);
  }

  function referenceMutation(name, mutate) {
    const value = referenceFor(manifest);
    mutate(value);
    const path = resolve(work, `${name}-reference.json`);
    writeJson(path, value);
    assert.throws(() => verifyPublicEvaluatorReference({ root, referencePath: path, privateRoot }), /Schema validation|prohibited|private path|identity/u, `${name} public reference leakage must be rejected`);
  }
  referenceMutation("oracle-text", (value) => { value.oracle_text = "synthetic answer-bearing text"; });
  referenceMutation("private-inventory", (value) => { value.asset_inventory = [{ path: "assets/oracle.json" }]; });
  referenceMutation("absolute-posix-public", (value) => { value.private_evaluator_path = "/private/evaluator"; });
  referenceMutation("secret-public", (value) => { value.secret = "synthetic-secret"; });
  const driftedReference = referenceFor(manifest);
  driftedReference.review_record_digest = digest("drifted-review");
  const driftedReferencePath = resolve(work, "drifted-reference.json");
  writeJson(driftedReferencePath, driftedReference);
  assert.throws(() => verifyPublicEvaluatorReference({ root, referencePath: driftedReferencePath, privateRoot }), /deterministic identity/u, "public reference identity drift must be rejected");

  function clonedBundle(name) {
    const target = resolve(privateWork, name);
    cpSync(privateRoot, target, { recursive: true });
    return { privateRoot: target, manifestPath: resolve(target, "private-evaluator-bundle.json") };
  }

  function bundleMutation(name, mutate, { close = false, writeReference = false } = {}) {
    const bundle = clonedBundle(name);
    const value = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));
    mutate(value, bundle.privateRoot);
    if (close) closeBundle(value);
    writeJson(bundle.manifestPath, value);
    const mutatedReferencePath = resolve(work, `${name}-bundle-reference.json`);
    if (writeReference) writeJson(mutatedReferencePath, referenceFor(value));
    return { ...bundle, referencePath: writeReference ? mutatedReferencePath : referencePath };
  }

  const repositoryMaterial = bundleMutation("managed-repository-material", (value, bundleRoot) => {
    const asset = value.asset_inventory[0];
    const bytes = readFileSync(resolve(root, "benchmarks/schemas/evaluator-reference.schema.json"));
    writeFileSync(resolve(bundleRoot, asset.path), bytes);
    asset.sha256 = `sha256:${sha256(bytes)}`;
    asset.bytes = bytes.length;
  }, { close: true, writeReference: true });
  assert.throws(
    () => verifyPrivateEvaluatorBundle({ ...baseOptions, ...repositoryMaterial }),
    /managed repository contains byte-identical private evaluator material/u,
    "byte-identical private material already present in the managed repository must be rejected",
  );

  for (const [name, injectedPath] of [
    ["absolute-posix", "/private/oracle.json"],
    ["windows-drive", "C:\\private\\oracle.json"],
    ["unc", "\\\\server\\share\\oracle.json"],
    ["windows-device", "\\\\?\\C:\\private\\oracle.json"],
    ["path-escape", "../oracle.json"],
  ]) {
    const mutated = bundleMutation(name, (value) => { value.asset_inventory[0].path = injectedPath; });
    assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...mutated }), /Schema validation|portable normalized relative path/u, `${name} private asset path must be rejected`);
  }

  const rootLink = resolve(privateWork, "root-symlink");
  symlinkSync(privateRoot, rootLink);
  expectBoundaryFailure({ privateRoot: rootLink, manifestPath: resolve(rootLink, "private-evaluator-bundle.json") }, /must not be a symlink/u, "private root symlinks must be rejected");

  const manifestLink = clonedBundle("manifest-symlink");
  const externalManifest = resolve(privateWork, "external-manifest.json");
  cpSync(manifestLink.manifestPath, externalManifest);
  rmSync(manifestLink.manifestPath);
  symlinkSync(externalManifest, manifestLink.manifestPath);
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...manifestLink }), /traverses a symlink|must not be a symlink/u, "manifest symlinks must be rejected");

  const assetLink = clonedBundle("asset-symlink");
  const linkedAsset = manifest.asset_inventory[0].path;
  const externalAsset = resolve(privateWork, "external-asset.json");
  cpSync(resolve(assetLink.privateRoot, linkedAsset), externalAsset);
  rmSync(resolve(assetLink.privateRoot, linkedAsset));
  symlinkSync(externalAsset, resolve(assetLink.privateRoot, linkedAsset));
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...assetLink }), /contains a symlink|traverses a symlink/u, "asset symlinks must be rejected");

  const unexpected = clonedBundle("unexpected-file");
  writeFileSync(resolve(unexpected.privateRoot, "unexpected.txt"), "synthetic unmanaged file\n");
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...unexpected }), /unexpected or unmanaged/u, "unexpected private files must be rejected");
  const incomplete = clonedBundle("incomplete-staging");
  mkdirSync(resolve(incomplete.privateRoot, ".bundle-staging"));
  writeFileSync(resolve(incomplete.privateRoot, ".bundle-staging", "partial.json"), "{}\n");
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...incomplete }), /unexpected or unmanaged/u, "incomplete staging must be rejected");
  const missingAsset = clonedBundle("missing-required-asset");
  rmSync(resolve(missingAsset.privateRoot, manifest.asset_inventory[0].path));
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...missingAsset }), /asset is missing/u, "missing required assets must be rejected");

  const duplicateRole = bundleMutation("duplicate-role", (value) => { value.asset_inventory[1].role = value.asset_inventory[0].role; }, { close: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...duplicateRole }), /role inventory contains duplicates/u, "duplicate asset roles must be rejected");
  const duplicatePath = bundleMutation("duplicate-path", (value) => { value.asset_inventory[1].path = value.asset_inventory[0].path; }, { close: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...duplicatePath }), /path inventory contains duplicates/u, "duplicate asset paths must be rejected");
  const digestDrift = bundleMutation("asset-digest-drift", (value) => { value.asset_inventory[0].sha256 = digest("wrong-asset"); }, { close: true, writeReference: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...digestDrift }), /asset digest is invalid/u, "asset digest drift must be rejected");
  const bytesDrift = bundleMutation("asset-bytes-drift", (value) => { value.asset_inventory[0].bytes += 1; }, { close: true, writeReference: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...bytesDrift }), /byte count is invalid/u, "asset byte drift must be rejected");
  const bundleIdDrift = bundleMutation("bundle-id-drift", (value) => { value.evaluator_bundle_id = `evaluator-${"f".repeat(64)}`; });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...bundleIdDrift }), /bundle ID is invalid/u, "bundle ID drift must be rejected");
  const manifestDrift = bundleMutation("manifest-drift", (value) => { value.generator.version = "1.0.1"; });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...manifestDrift }), /bundle digest closure is invalid/u, "manifest modification must be rejected");

  const fixtureTransplant = bundleMutation("fixture-transplant", (value) => { value.fixture_identity.fixture_id = "other-fixture"; }, { close: true, writeReference: true });
  const fixtureTransplantResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  const fixtureTransplantManifest = JSON.parse(readFileSync(fixtureTransplant.manifestPath, "utf8"));
  fixtureTransplantResult.evaluator_bundle_id = fixtureTransplantManifest.evaluator_bundle_id;
  fixtureTransplantResult.evaluator_bundle_digest = fixtureTransplantManifest.evaluator_bundle_digest;
  closeResult(fixtureTransplantResult);
  const fixtureTransplantResultPath = resolve(work, "fixture-transplant-result.json");
  writeJson(fixtureTransplantResultPath, fixtureTransplantResult);
  expectBoundaryFailure({ ...fixtureTransplant, resultPath: fixtureTransplantResultPath }, /fixture_id|transplanted|freeze manifest authority/u, "cross-fixture transplant must be rejected");
  const inputTransplant = bundleMutation("input-transplant", (value) => { value.input_identity.fixture_input_digest = digest("other-input"); }, { close: true, writeReference: true });
  const inputTransplantResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  const inputTransplantManifest = JSON.parse(readFileSync(inputTransplant.manifestPath, "utf8"));
  inputTransplantResult.evaluator_bundle_id = inputTransplantManifest.evaluator_bundle_id;
  inputTransplantResult.evaluator_bundle_digest = inputTransplantManifest.evaluator_bundle_digest;
  closeResult(inputTransplantResult);
  const inputTransplantResultPath = resolve(work, "input-transplant-result.json");
  writeJson(inputTransplantResultPath, inputTransplantResult);
  expectBoundaryFailure({ ...inputTransplant, resultPath: inputTransplantResultPath }, /fixture_input_digest|transplanted|freeze manifest authority/u, "cross-input transplant must be rejected");

  function resultMutation(name, mutate, { close = true } = {}) {
    const value = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
    mutate(value);
    if (close) closeResult(value);
    const path = resolve(work, `${name}-result.json`);
    writeJson(path, value);
    return path;
  }
  function freezeMutation(name, mutate, { close = true, approvedSourceDigest = null } = {}) {
    const value = clone(scoringInputs.freezeManifest);
    mutate(value);
    if (close) value.manifest_digest = computeScoringInputFreezeManifestDigest(value);
    const path = resolve(work, `${name}-freeze-manifest.json`);
    writeJson(path, value);
    return {
      freezeManifest: value,
      scoringInputFreezeManifestPath: path,
      scoringInputFreezeManifestSourceDigest: approvedSourceDigest ?? fileDigest(path),
    };
  }
  const otherNormalized = completedClaude;
  const normalizedTransplant = resultMutation("normalized-transplant", (value) => {
    value.normalized_result_id = otherNormalized.normalized_result_id;
    value.normalized_result_digest = otherNormalized.normalized_result_digest;
  });
  expectBoundaryFailure({ resultPath: normalizedTransplant }, /lineage mismatch|normalized result digest|mismatched normalized-result/u, "normalized-result transplant must be rejected");
  const crossRun = resultMutation("cross-run", (value) => { value.run_instance_id = "00000000-0000-4000-8000-000000000999"; });
  expectBoundaryFailure({ resultPath: crossRun }, /run_instance_id/u, "cross-run transplant must be rejected");
  const crossCase = resultMutation("cross-case", (value) => { value.case_id = otherNormalized.lineage.case_id; });
  expectBoundaryFailure({ resultPath: crossCase }, /case_id/u, "cross-case transplant must be rejected");
  const crossAttempt = resultMutation("cross-attempt", (value) => { value.attempt = "0002"; });
  expectBoundaryFailure({ resultPath: crossAttempt }, /attempt/u, "cross-attempt transplant must be rejected");
  const crossAdapter = resultMutation("cross-adapter", (value) => { value.adapter = "claude"; });
  expectBoundaryFailure({ resultPath: crossAdapter }, /adapter/u, "cross-adapter transplant must be rejected");
  const crossCondition = resultMutation("cross-condition", (value) => { value.condition = "full_ask"; });
  expectBoundaryFailure({ resultPath: crossCondition }, /condition/u, "cross-condition transplant must be rejected");
  const crossRepetition = resultMutation("cross-repetition", (value) => { value.repetition = 2; });
  expectBoundaryFailure({ resultPath: crossRepetition }, /repetition/u, "cross-repetition transplant must be rejected");
  const crossPlan = resultMutation("cross-plan", (value) => { value.plan_digest = digest("foreign-plan"); });
  expectBoundaryFailure({ resultPath: crossPlan }, /plan_digest/u, "cross-plan transplant must be rejected");
  const staleSnapshot = resultMutation("stale-snapshot", (value) => { value.source_snapshot_digest = digest("stale-snapshot"); });
  expectBoundaryFailure({ resultPath: staleSnapshot }, /snapshot|generation/u, "stale normalized source snapshots must be rejected");

  const partialDisallowed = resultMutation("partial-disallowed", (value) => {
    const observation = value.requirement_results.find(({ requirement_id }) => requirement_id === "blocker-requirement");
    observation.outcome = "partial";
    observation.earned_points = 1;
  });
  expectBoundaryFailure({ resultPath: partialDisallowed }, /partial_credit_allowed/u, "partial results for requirements that prohibit partial credit must be rejected");
  const pointsAboveMaximum = resultMutation("points-above-maximum", (value) => { value.requirement_results[0].earned_points = 5; });
  expectBoundaryFailure({ resultPath: pointsAboveMaximum }, /exceeds max_points/u, "earned points above max_points must be rejected");
  const duplicateRequirementResult = resultMutation("duplicate-requirement-result", (value) => { value.requirement_results[1].requirement_id = value.requirement_results[0].requirement_id; });
  expectBoundaryFailure({ resultPath: duplicateRequirementResult }, /requirement result IDs must be a unique string array/u, "duplicate requirement results must be rejected");
  const unknownRequirementResult = resultMutation("unknown-requirement-result", (value) => { value.requirement_results[0].requirement_id = "unknown-requirement"; });
  expectBoundaryFailure({ resultPath: unknownRequirementResult }, /unknown requirement ID/u, "unknown requirement results must be rejected");
  const missingRequirementCoverage = resultMutation("missing-requirement-coverage", (value) => { value.requirement_results.pop(); });
  expectBoundaryFailure({ resultPath: missingRequirementCoverage }, /exactly cover the authoritative requirement set/u, "completed evaluation with incomplete requirement coverage must be rejected");
  const unevaluatedAsZero = resultMutation("unevaluated-as-zero", (value) => {
    value.requirement_results[0].outcome = "not_evaluated";
    value.requirement_results[0].earned_points = 0;
  });
  expectBoundaryFailure({ resultPath: unevaluatedAsZero }, /must retain null earned_points/u, "not-evaluated requirements must not be converted to zero points");
  const foreignEquivalence = resultMutation("foreign-equivalence", (value) => { value.requirement_results[0].matched_equivalence_class_ids = ["foreign-equivalence"]; });
  expectBoundaryFailure({ resultPath: foreignEquivalence }, /subset of the authoritative requirement/u, "foreign equivalence class matches must be rejected");
  const foreignFinding = resultMutation("foreign-finding", (value) => { value.requirement_results[0].finding_ids = ["foreign-finding"]; });
  expectBoundaryFailure({ resultPath: foreignFinding }, /finding reference does not close/u, "foreign finding references must be rejected");
  const emptyScoredEvidence = resultMutation("empty-scored-evidence", (value) => { value.requirement_results[0].evidence_references = []; });
  expectBoundaryFailure({ resultPath: emptyScoredEvidence }, /too few items|scored requirement result.*evidence/u, "completed scored outcomes without evidence must be rejected");
  assert.throws(
    () => validateRequirementResultObservations({ scoringPolicy, requirementRecord: scoringInputs.requirementRecord, evaluatorResult: JSON.parse(readFileSync(emptyScoredEvidence, "utf8")) }),
    /scored requirement result.*evidence/u,
    "the semantic validator must reject scored outcomes without evidence independently of JSON Schema",
  );

  for (const [name, field, value, pattern] of [
    ["foreign-freeze-source-binding", "scoring_input_freeze_manifest_source_digest", digest("foreign-freeze-source"), /scoring_input_freeze_manifest_source_digest/u],
    ["foreign-freeze-binding", "scoring_input_freeze_manifest_digest", digest("foreign-freeze-manifest"), /scoring_input_freeze_manifest_digest/u],
    ["foreign-catalog-binding", "catalog_digest", digest("foreign-catalog"), /catalog_digest/u],
    ["foreign-policy-manifest-binding", "policy_manifest_digest", digest("foreign-policy-manifest"), /policy_manifest_digest/u],
    ["foreign-scoring-policy-binding", "scoring_policy_digest", digest("foreign-scoring-policy"), /scoring_policy_digest/u],
    ["foreign-admission-binding", "admission_record_digest", digest("foreign-admission"), /admission_record_digest/u],
    ["foreign-requirement-record-binding", "requirement_record_digest", digest("foreign-requirement-record"), /requirement_record_digest/u],
    ["foreign-requirement-set-binding", "requirement_set_digest", digest("foreign-requirement-set"), /requirement_set_digest/u],
    ["foreign-output-contract-binding", "output_contract_digest", digest("foreign-output-contract"), /output_contract_digest/u],
    ["foreign-evaluator-reference-binding", "evaluator_public_reference_digest", digest("foreign-evaluator-reference"), /evaluator_public_reference_digest/u],
  ]) {
    const path = resultMutation(name, (result) => { result[field] = value; });
    expectBoundaryFailure({ resultPath: path }, pattern, `${name} must be rejected`);
  }

  const replacementRequirementRecord = clone(scoringInputs.requirementRecord);
  replacementRequirementRecord.requirements[0].max_points = 5;
  replacementRequirementRecord.requirements[0].requirement_digest = computeRequirementDigest(replacementRequirementRecord.requirements[0]);
  replacementRequirementRecord.requirement_set_digest = computeRequirementSetDigest(replacementRequirementRecord);
  replacementRequirementRecord.requirement_record_digest = computeRequirementRecordDigest(replacementRequirementRecord);
  const replacementRequirementRecordPath = resolve(work, "replacement-requirement-record.json");
  writeJson(replacementRequirementRecordPath, replacementRequirementRecord);
  expectBoundaryFailure({ requirementRecordPath: replacementRequirementRecordPath }, /requirement_record_digest|freeze manifest authority/u, "authoritative requirement record replacement must invalidate an existing evaluator result");

  const coordinatedRequirementResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  coordinatedRequirementResult.requirement_record_digest = replacementRequirementRecord.requirement_record_digest;
  coordinatedRequirementResult.requirement_set_digest = replacementRequirementRecord.requirement_set_digest;
  closeResult(coordinatedRequirementResult);
  const coordinatedRequirementResultPath = resolve(work, "coordinated-requirement-result.json");
  writeJson(coordinatedRequirementResultPath, coordinatedRequirementResult);
  expectBoundaryFailure(
    { requirementRecordPath: replacementRequirementRecordPath, resultPath: coordinatedRequirementResultPath },
    /freeze|authority/u,
    "coordinated requirement-record and evaluator-result replacement must be rejected",
  );

  const replacementOutputContract = clone(scoringInputs.outputContract);
  replacementOutputContract.declares_findings = false;
  replacementOutputContract.output_contract_digest = computeOutputContractDigest(replacementOutputContract);
  const replacementOutputContractPath = resolve(work, "replacement-output-contract.json");
  writeJson(replacementOutputContractPath, replacementOutputContract);
  expectBoundaryFailure({ outputContractPath: replacementOutputContractPath }, /output_contract_digest|freeze manifest authority/u, "authoritative output contract replacement must invalidate an existing evaluator result");

  const coordinatedOutputResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  coordinatedOutputResult.output_contract_digest = replacementOutputContract.output_contract_digest;
  closeResult(coordinatedOutputResult);
  const coordinatedOutputResultPath = resolve(work, "coordinated-output-result.json");
  writeJson(coordinatedOutputResultPath, coordinatedOutputResult);
  expectBoundaryFailure(
    { outputContractPath: replacementOutputContractPath, resultPath: coordinatedOutputResultPath },
    /freeze|authority/u,
    "coordinated output-contract and evaluator-result replacement must be rejected",
  );

  const coordinatedScoringPolicy = clone(scoringPolicy);
  coordinatedScoringPolicy.requirement_contract.scored_requirement_minimum_agent_visible_evidence_map_ids = 2;
  coordinatedScoringPolicy.policy_digest = computeScoringPolicyDigest(coordinatedScoringPolicy);
  const coordinatedScoringPolicyPath = resolve(work, "coordinated-scoring-policy.json");
  writeJson(coordinatedScoringPolicyPath, coordinatedScoringPolicy);
  const coordinatedPolicyManifest = clone(policyManifest);
  coordinatedPolicyManifest.scoring_policy = { path: repoPath(coordinatedScoringPolicyPath), digest: coordinatedScoringPolicy.policy_digest };
  coordinatedPolicyManifest.manifest_digest = computePolicyManifestDigest(coordinatedPolicyManifest);
  const coordinatedPolicyManifestPath = resolve(work, "coordinated-policy-manifest.json");
  writeJson(coordinatedPolicyManifestPath, coordinatedPolicyManifest);
  const coordinatedPolicyRequirement = clone(scoringInputs.requirementRecord);
  coordinatedPolicyRequirement.policy_manifest_digest = coordinatedPolicyManifest.manifest_digest;
  coordinatedPolicyRequirement.scoring_policy_digest = coordinatedScoringPolicy.policy_digest;
  coordinatedPolicyRequirement.requirement_record_digest = computeRequirementRecordDigest(coordinatedPolicyRequirement);
  const coordinatedPolicyRequirementPath = resolve(work, "coordinated-policy-requirement-record.json");
  writeJson(coordinatedPolicyRequirementPath, coordinatedPolicyRequirement);
  const coordinatedPolicyResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  coordinatedPolicyResult.policy_manifest_digest = coordinatedPolicyManifest.manifest_digest;
  coordinatedPolicyResult.scoring_policy_digest = coordinatedScoringPolicy.policy_digest;
  coordinatedPolicyResult.requirement_record_digest = coordinatedPolicyRequirement.requirement_record_digest;
  closeResult(coordinatedPolicyResult);
  const coordinatedPolicyResultPath = resolve(work, "coordinated-policy-result.json");
  writeJson(coordinatedPolicyResultPath, coordinatedPolicyResult);
  expectBoundaryFailure(
    {
      policyManifestPath: coordinatedPolicyManifestPath,
      scoringPolicyPath: coordinatedScoringPolicyPath,
      requirementRecordPath: coordinatedPolicyRequirementPath,
      resultPath: coordinatedPolicyResultPath,
    },
    /freeze|authority/u,
    "coordinated scoring-policy, policy-manifest, requirement-record, and evaluator-result replacement must be rejected",
  );

  const coordinatedAdmission = clone(scoringInputs.admissionRecord);
  coordinatedAdmission.reviewer_record_id = "replacement-reviewer-record";
  coordinatedAdmission.admission_digest = computeFinalAdmissionRecordDigest(coordinatedAdmission);
  const coordinatedAdmissionPath = resolve(work, "coordinated-admission-record.json");
  writeJson(coordinatedAdmissionPath, coordinatedAdmission);
  const coordinatedAdmissionRequirement = clone(scoringInputs.requirementRecord);
  coordinatedAdmissionRequirement.admission_record_digest = coordinatedAdmission.admission_digest;
  coordinatedAdmissionRequirement.requirement_record_digest = computeRequirementRecordDigest(coordinatedAdmissionRequirement);
  const coordinatedAdmissionRequirementPath = resolve(work, "coordinated-admission-requirement-record.json");
  writeJson(coordinatedAdmissionRequirementPath, coordinatedAdmissionRequirement);
  const coordinatedAdmissionResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  coordinatedAdmissionResult.admission_record_digest = coordinatedAdmission.admission_digest;
  coordinatedAdmissionResult.requirement_record_digest = coordinatedAdmissionRequirement.requirement_record_digest;
  closeResult(coordinatedAdmissionResult);
  const coordinatedAdmissionResultPath = resolve(work, "coordinated-admission-result.json");
  writeJson(coordinatedAdmissionResultPath, coordinatedAdmissionResult);
  expectBoundaryFailure(
    {
      admissionRecordPath: coordinatedAdmissionPath,
      requirementRecordPath: coordinatedAdmissionRequirementPath,
      resultPath: coordinatedAdmissionResultPath,
    },
    /freeze|authority/u,
    "coordinated final-admission, requirement-record, and evaluator-result replacement must be rejected",
  );

  const internalPathMismatchPath = resolve(work, "internal-path-mismatch-requirement-record.json");
  writeJson(internalPathMismatchPath, scoringInputs.requirementRecord);
  const internalPathFreeze = freezeMutation("internal-path-mismatch", (value) => {
    value.requirement_record.path = repoPath(internalPathMismatchPath);
    value.requirement_record.raw_byte_digest = fileDigest(internalPathMismatchPath);
  });
  const internalPathResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  internalPathResult.scoring_input_freeze_manifest_source_digest = internalPathFreeze.scoringInputFreezeManifestSourceDigest;
  internalPathResult.scoring_input_freeze_manifest_digest = internalPathFreeze.freezeManifest.manifest_digest;
  closeResult(internalPathResult);
  const internalPathResultPath = resolve(work, "internal-path-mismatch-result.json");
  writeJson(internalPathResultPath, internalPathResult);
  expectBoundaryFailure(
    { ...internalPathFreeze, requirementRecordPath: internalPathMismatchPath, resultPath: internalPathResultPath },
    /internal path does not match the freeze manifest authority path/u,
    "an artifact internal path that differs from its resolved authority path must be rejected",
  );

  const outsideFreezeManifestPath = resolve(privateWork, "outside-authority-freeze-manifest.json");
  writeJson(outsideFreezeManifestPath, scoringInputs.freezeManifest);
  expectBoundaryFailure(
    { scoringInputFreezeManifestPath: outsideFreezeManifestPath, scoringInputFreezeManifestSourceDigest: fileDigest(outsideFreezeManifestPath) },
    /portable normalized relative path|authority root/u,
    "a freeze manifest outside the authority root must be rejected",
  );

  const freezeManifestSymlinkPath = resolve(work, "freeze-manifest-symlink.json");
  symlinkSync(scoringInputs.freezeManifestPath, freezeManifestSymlinkPath);
  expectBoundaryFailure(
    { scoringInputFreezeManifestPath: freezeManifestSymlinkPath, scoringInputFreezeManifestSourceDigest: scoringInputs.freezeManifestSourceDigest },
    /must not traverse a symlink/u,
    "a symlinked freeze manifest must be rejected",
  );

  const requirementSymlinkPath = resolve(work, "requirement-record-symlink.json");
  symlinkSync(scoringInputs.requirementRecordPath, requirementSymlinkPath);
  const requirementSymlinkFreeze = freezeMutation("requirement-symlink", (value) => {
    value.requirement_record.path = repoPath(requirementSymlinkPath);
    value.requirement_record.raw_byte_digest = fileDigest(requirementSymlinkPath);
  });
  expectBoundaryFailure(
    { ...requirementSymlinkFreeze, requirementRecordPath: requirementSymlinkPath },
    /must not traverse a symlink/u,
    "a symlinked scoring input authority artifact must be rejected",
  );

  const pathEscapeFreeze = freezeMutation("path-escape", (value) => { value.catalog.path = "../portfolio-catalog.json"; });
  expectBoundaryFailure(pathEscapeFreeze, /Schema validation|portable normalized relative path|escape/u, "a freeze manifest path escape must be rejected");

  const rawDigestDriftFreeze = freezeMutation("raw-byte-digest-drift", (value) => { value.requirement_record.raw_byte_digest = digest("wrong-raw-bytes"); });
  expectBoundaryFailure(rawDigestDriftFreeze, /raw-byte digest does not match/u, "a modified artifact raw-byte digest in a re-sealed freeze manifest must be rejected");

  const unsealedFreeze = freezeMutation("unsealed-manifest", (value) => { value.freeze_revision = "issue-205-b3-synthetic-r2"; }, { close: false });
  expectBoundaryFailure(unsealedFreeze, /manifest digest closure is invalid/u, "a modified freeze manifest without semantic re-sealing must be rejected");

  const resealedButUnapprovedFreeze = freezeMutation(
    "resealed-but-unapproved-manifest",
    (value) => { value.freeze_revision = "issue-205-b3-synthetic-r2"; },
    { approvedSourceDigest: scoringInputs.freezeManifestSourceDigest },
  );
  expectBoundaryFailure(resealedButUnapprovedFreeze, /raw-byte digest does not match the approved immutable source digest/u, "a re-sealed freeze manifest without a new authority approval must be rejected");

  const evaluationDigestDrift = resultMutation("evaluation-digest-drift", (value) => { value.quality.state = "fail"; }, { close: false });
  expectBoundaryFailure({ resultPath: evaluationDigestDrift }, /digest closure is invalid/u, "evaluator result digest drift must be rejected");
  for (const [name, field, value] of [
    ["hidden-answer", "hidden_answer", "synthetic hidden answer"],
    ["private-path", "private_evaluator_path", "/private/evaluator"],
    ["raw-prompt", "raw_evaluator_prompt", "synthetic evaluator prompt"],
    ["secret", "secret", "synthetic secret"],
  ]) {
    const path = resultMutation(name, (result) => { result[field] = value; });
    expectBoundaryFailure({ resultPath: path }, /Schema validation|prohibited|private path/u, `${name} evaluator result leakage must be rejected`);
  }

  const publication = resolve(work, "private-publication-attempt");
  mkdirSync(publication);
  cpSync(resolve(privateRoot, manifest.asset_inventory[0].path), resolve(publication, "artifact.json"));
  expectBoundaryFailure({ publicArtifactRoot: publication }, /byte-identical private evaluator material/u, "public CI artifact publication of private assets must be rejected");
  const manifestPublication = resolve(work, "private-manifest-publication-attempt");
  mkdirSync(manifestPublication);
  cpSync(manifestPath, resolve(manifestPublication, "bundle.json"));
  expectBoundaryFailure({ publicArtifactRoot: manifestPublication }, /byte-identical private evaluator material|private evaluator bundle manifest/u, "public CI artifact publication of the private manifest must be rejected");

  const executionEvidenceDigest = digest("synthetic-execution-event");
  const normalizedExecutionEvidence = {
    command_evidence: {
      required_command_ids: ["fixture-test"],
      required_alternative_groups: [],
      succeeded_command_ids: ["fixture-test"],
      references: [{ command_id: "fixture-test", match_state: "matched", command_evidence_id: `command-evidence-${"a".repeat(32)}`, digest: executionEvidenceDigest, bytes: 321, outcome: "succeeded", exit_code: 0 }],
    },
  };
  const evaluatorExecutionReference = { verification_correctness: { state: "pass", evidence_references: [{ kind: "execution_event", digest: executionEvidenceDigest, bytes: 321 }] } };
  assert.equal(validateExecutionEventEvidenceReferences({ normalized: normalizedExecutionEvidence, result: evaluatorExecutionReference }).length, 1, "verified normalized execution evidence must be referenceable by the evaluator");
  assert.throws(() => validateExecutionEventEvidenceReferences({ normalized: normalizedExecutionEvidence, result: { verification_correctness: { state: "pass", evidence_references: [] } } }), /cannot pass without verified execution-event/u, "verification pass without execution evidence must fail closed");
  assert.throws(() => validateExecutionEventEvidenceReferences({ normalized: normalizedExecutionEvidence, result: { verification_correctness: { state: "pass", evidence_references: [{ kind: "execution_event", digest: executionEvidenceDigest, bytes: 322 }] } } }), /unverified or transplanted/u, "execution evidence byte drift must be rejected");
  const cwdUnverifiedExecutionEvidence = structuredClone(normalizedExecutionEvidence);
  cwdUnverifiedExecutionEvidence.command_evidence.succeeded_command_ids = [];
  cwdUnverifiedExecutionEvidence.command_evidence.references[0].command_id = null;
  cwdUnverifiedExecutionEvidence.command_evidence.references[0].match_state = "cwd_unverified";
  assert.throws(() => validateExecutionEventEvidenceReferences({ normalized: cwdUnverifiedExecutionEvidence, result: evaluatorExecutionReference }), /required command evidence is absent or unsuccessful/u, "evaluator verification pass must reject cwd-dependent command evidence without runtime cwd authority");

  const alternativeExecutionEvidence = {
    command_evidence: {
      required_command_ids: [],
      required_alternative_groups: [{ group_id: "fixture-alternatives", member_ids: ["fixture-a", "fixture-b"], attempted_ids: ["fixture-b"], succeeded_ids: ["fixture-b"], satisfaction_state: "satisfied" }],
      succeeded_command_ids: ["fixture-b"],
      references: [{ command_id: "fixture-b", match_state: "matched", command_evidence_id: `command-evidence-${"b".repeat(32)}`, digest: executionEvidenceDigest, bytes: 321, outcome: "succeeded", exit_code: 0 }],
    },
  };
  assert.equal(validateExecutionEventEvidenceReferences({ normalized: alternativeExecutionEvidence, result: evaluatorExecutionReference }).length, 1, "one successful member must satisfy a required alternative group");
  const unsatisfiedAlternativeEvidence = structuredClone(alternativeExecutionEvidence);
  unsatisfiedAlternativeEvidence.command_evidence.required_alternative_groups[0].satisfaction_state = "unsatisfied";
  unsatisfiedAlternativeEvidence.command_evidence.required_alternative_groups[0].succeeded_ids = [];
  assert.throws(() => validateExecutionEventEvidenceReferences({ normalized: unsatisfiedAlternativeEvidence, result: evaluatorExecutionReference }), /alternative command group/u, "an unsatisfied required alternative group must fail closed");

  assert.deepEqual(snapshot(privateRoot), beforePrivate, "all evaluator failure paths must keep the private bundle byte-identical");
  assert.deepEqual(snapshot(materialized), beforeMaterialized, "all evaluator failure paths must keep materialized inputs byte-identical");
  assert.deepEqual(snapshot(selectionState), beforeSelectionState, "all evaluator failure paths must keep selection state byte-identical");
  assert.deepEqual(snapshot(normalizedResults), beforeNormalized, "all evaluator failure paths must keep normalized results byte-identical");
  assert.deepEqual(snapshot(runDir), beforeRun, "all evaluator failure paths must keep execution run state byte-identical");
  assert.deepEqual(snapshot(publicArtifactRoot), beforePublicArtifact, "all evaluator failure paths must keep staged public artifacts byte-identical");
  assert.deepEqual(snapshot(scoringInputs.path), beforeScoringInputs, "all evaluator failure paths must keep scoring input artifacts byte-identical");

  console.log("ASK benchmark evaluator boundary tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(privateWork, { recursive: true, force: true });
}

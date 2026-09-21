// Test-only, fabricated self-contained #197 artifacts. No model, runner, private
// evaluator or measured result is read. The integration test uses REAL validators.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { syntheticBindingRows, syntheticDigest as d } from "./test-prompt-successor-fixtures.mjs";
const hashBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATUSES = ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"];
const TELEMETRY = ["duration_ms", "exit_code", "final_output_bytes", "stdout_bytes", "stdout_digest", "stderr_bytes", "stderr_digest", "json_event_line_count", "harness_spawned_secondary_agent_count", "runtime_agent_count", "failure_kind", "capability_downgrade_count", "capability_downgrade_digest", "runtime_unavailable_reason_code", "runtime_unavailable_reason_digest", "runtime_unavailable_reason_bytes", "thermal_state", "model", "reasoning_effort", "sandbox_policy", "permission_policy", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "tool_call_count", "file_read_count", "human_effort", "unsafe_attempted_actions", "subagent_activity", "evaluator_quality_metrics"];
export function writeSyntheticJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(path, bytes, { flag: "wx" });
  return { sha256: hashBytes(bytes), bytes: bytes.length };
}
function normalizedRecord(preparation, scope, index, outcome) {
  const { normalized } = syntheticBindingRows(preparation, scope, index);
  const caseId = normalized.lineage.case_id;
  const missing = () => ({ status: outcome === "unavailable" ? "unavailable" : "unknown", value: null, reason: "synthetic_successor_source" });
  const base = {
    schema_version: "1.3.0", schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json", program: "adaptive_ask_normalized_execution_result",
    lineage: { ...normalized.lineage, suite: "calibration", difficulty: "synthetic", aggregate_eligible: false, condition_order_position: 4, block_id: `block-${d(caseId).slice(7, 23)}-${d(`block:${caseId}`).slice(7, 19)}`,
      raw_result_digest: d(`raw:${caseId}`), terminal_commit_digest: d(`commit:${caseId}`), final_output_digest: null, final_output_bytes: null, adaptive_selection_digest: null,
      terminal_workspace_authority_availability: "unavailable", terminal_workspace_authority_support: "supported", terminal_workspace_authority_digest: null, terminal_workspace_tree_digest: null, terminal_workspace_authority_bytes: null },
    outcome,
    command_evidence: { manifest_digest: d(`command-evidence:${caseId}`), capture_support: "supported", evidence_level: "unavailable", command_event_count: 0, verification_command_contract_digest: null, required_command_ids: [], required_alternative_groups: [], command_summaries: [], attempted_command_ids: [], succeeded_command_ids: [], failed_command_ids: [], declined_command_ids: [], unavailable_command_ids: [], unmatched_command_count: 0, cwd_unverified_command_count: 0, references: [], declined_references: [] },
    telemetry: Object.fromEntries(TELEMETRY.map((field) => [field, missing()])),
    privacy: { raw_stdout_stored: false, raw_stderr_stored: false, final_output_content_stored: false, prompt_stored: false, transcript_stored: false, environment_values_stored: false, absolute_private_paths_stored: false },
  };
  const normalized_result_digest = canonicalDigest(base);
  return { ...base, normalized_result_digest, normalized_result_id: `normalized-${canonicalDigest({ run_instance_id: scope.source.run_instance_id, case_id: caseId, attempt: "0001", normalized_result_digest }).slice(7, 39)}` };
}
function grouped(cases, names, key, selector) {
  return names.map((name) => {
    const selected = cases.filter((c) => selector(c) === name);
    return { [key]: name, expected: selected.length, normalized: selected.filter((c) => c.normalized_attempts.length > 0).length, terminal: selected.filter((c) => !["pending", "active"].includes(c.status)).length, pending: selected.filter((c) => c.status === "pending").length, active: selected.filter((c) => c.status === "active").length, invalid: selected.filter((c) => c.status === "invalid").length };
  });
}
async function buildEngineering(root, normalized, snapshotDigest) {
  const api = await import("./ask-benchmark-portfolio-score.mjs");
  const policy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8"));
  const l = normalized.lineage;
  const complete = normalized.outcome === "completed";
  const scoringReason = complete ? "completed_evaluation_scoring_ready" : `normalized_execution_${normalized.outcome}`;
  const observation = () => ({ state: "unknown", evidence_references: [] });
  const metric = (name) => structuredClone(normalized.telemetry[name]);
  const base = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-engineering-result.schema.json", program: "adaptive_ask_portfolio_engineering_result",
    scoring_status: complete ? "complete" : "not_scoring_ready", scoring_reason: scoringReason,
    scoring_input_freeze_manifest_source_digest: d("freeze-source"), scoring_input_freeze_manifest_digest: d("freeze"), catalog_digest: d("catalog"), policy_manifest_digest: d("policy-manifest"), scoring_policy_digest: policy.policy_digest,
    admission_record_digest: d(`admission:${l.fixture_id}`), effective_admission_mode: "legacy_admitted_record", effective_admission_status: "admitted", frozen_admission_record_digest: d(`admission:${l.fixture_id}`), requirement_authority_digest: d(`admission:${l.fixture_id}`), admission_decision_digest: null, admission_decision_revision: null,
    requirement_record_digest: d(`requirement:${l.fixture_id}`), requirement_set_digest: d(`requirements:${l.fixture_id}`), output_contract_digest: d(`output:${l.fixture_id}`), evaluator_public_reference_digest: d(`reference:${l.fixture_id}`),
    evaluation_id: `evaluation-${d(`evaluation:${normalized.normalized_result_id}`).slice(7, 39)}`, evaluation_digest: d(`evaluation:${normalized.normalized_result_id}`), evaluation_status: "completed",
    evaluator_bundle_id: `evaluator-${d(`bundle:${l.fixture_id}`).slice(7)}`, evaluator_bundle_digest: d(`bundle:${l.fixture_id}`), evaluator_revision: l.repository_revision,
    normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest, normalized_outcome: normalized.outcome, source_snapshot_digest: snapshotDigest,
    run_instance_id: l.run_instance_id, plan_id: l.plan_id, plan_digest: l.plan_digest, fixture_id: l.fixture_id, fixture_input_digest: l.fixture_input_digest, suite: l.suite, task_class: l.task_class, case_id: l.case_id, attempt: l.attempt, adapter: "codex", condition: "full_ask", repetition: l.repetition,
    requirement_score: { scored_requirement_count: complete ? 1 : null, requirement_points_earned: complete ? 1 : null, requirement_points_possible: complete ? 1 : null, normalized_requirement_score: complete ? 1 : null },
    blockers: { requirement_ids: [], outcomes: [], non_pass_requirement_ids: [], gate_status: complete ? "not_applicable" : "not_scoring_ready" },
    false_positives: { raw_count: 0, findings: [], severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }, false_positive_units: null, unit_mapping_status: "not_implemented_no_approved_mapping" }, scope_deviations: { raw_count: 0, findings: [] },
    correctness_observations: Object.fromEntries(["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"].map((name) => [name, observation()])),
    unsafe_actions: { categories: ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"].map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0, action_ids: [], evidence_references: [] })) },
    safety_blocker: { status: complete ? "pass" : "not_scoring_ready", reason: scoringReason, category_ids: [], action_ids: [] },
    mechanism_observations: { required_mechanisms: [], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: { ...Object.fromEntries(["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"].map((name) => [name, metric(name)])), runtime_unavailable_reason: { code: metric("runtime_unavailable_reason_code"), digest: metric("runtime_unavailable_reason_digest"), bytes: metric("runtime_unavailable_reason_bytes") } },
    boundaries: { single_evaluator_result: true, single_normalized_attempt: true, aggregate_result: false, comparison_result: false, false_positive_units_calculated: false, correctness_penalty_calculated: false, mechanism_scorecard_calculated: false, variance_calculated: false, practice_weight_applied: false },
    privacy: { private_evaluator_content_stored: false, private_path_stored: false, raw_evaluator_prompt_stored: false, secret_customer_or_personal_data_stored: false },
  };
  const identified = { ...base, engineering_result_id: api.computeEngineeringResultId(base) };
  const value = { ...identified, engineering_result_digest: api.computeEngineeringResultDigest(identified) };
  api.validatePortfolioEngineeringResult(value, { root });
  return value;
}
export async function createSyntheticSuccessorSources({ root, directory, preparation, scope, outcome = "completed" }) {
  const normalizer = await import("./ask-benchmark-normalized-results.mjs");
  const resultSets = await import("./ask-benchmark-portfolio-result-set.mjs");
  const records = scope.source.bindings.map((_, index) => normalizedRecord(preparation, scope, index, outcome)).sort((a, b) => a.lineage.case_id.localeCompare(b.lineage.case_id));
  for (const record of records) normalizer.validateNormalizedPortfolioResult(record, { root });
  const cases = records.map((r) => ({ case_id: r.lineage.case_id, adapter_track: "codex", condition: "full_ask", fixture_id: r.lineage.fixture_id, repetition: r.lineage.repetition, condition_order_position: 4, block_id: r.lineage.block_id, status: outcome, attempt_count: 1, terminal_attempt: "0001", normalized_attempts: [{ attempt: "0001", normalized_result_id: r.normalized_result_id, normalized_result_digest: r.normalized_result_digest, path: `results/codex/${r.lineage.case_id}-0001.json` }] }));
  // Include unexecuted native-plan conditions, not fake completion or silent omission.
  for (const r of records) for (const condition of CONDITIONS.slice(0, 3)) cases.push({ case_id: `case-${d(`${condition}:${r.lineage.case_id}`).slice(7, 23)}-${d(`pending:${condition}:${r.lineage.case_id}`).slice(7, 23)}`, adapter_track: "codex", condition, fixture_id: r.lineage.fixture_id, repetition: r.lineage.repetition, condition_order_position: CONDITIONS.indexOf(condition) + 1, block_id: r.lineage.block_id, status: "pending", attempt_count: 0, terminal_attempt: null, normalized_attempts: [] });
  cases.sort((a, b) => a.case_id.localeCompare(b.case_id));
  const sourceSnapshot = { adapter_identities: [{ adapter: "codex", runtime_identity_digest: scope.source.runtime_identity_digest }], cases: cases.map((c) => {
    const r = records.find((r) => r.lineage.case_id === c.case_id);
    return { case_id: c.case_id, status: c.status, attempt_count: c.attempt_count, terminal_attempt: c.terminal_attempt, state_digest: d(`state:${c.case_id}`), committed_attempts: r ? [{ attempt: "0001", request_digest: r.lineage.request_digest, command_evidence_digest: d(`command-evidence-file:${c.case_id}`), ...Object.fromEntries(["raw_result_digest", "terminal_commit_digest", "final_output_digest", "final_output_bytes", "terminal_workspace_authority_availability", "terminal_workspace_authority_support", "terminal_workspace_authority_digest", "terminal_workspace_tree_digest", "terminal_workspace_authority_bytes"].map((key) => [key, r.lineage[key]])) }] : [] };
  }) };
  const snapshotDigest = canonicalDigest(sourceSnapshot);
  const normalizedPath = resolve(directory, "normalized");
  const generation = resolve(normalizedPath, "generations", `snapshot-${snapshotDigest.slice(7)}`);
  const inventory = records.map((r) => { const path = `results/codex/${r.lineage.case_id}-0001.json`; return { path, ...writeSyntheticJson(resolve(generation, path), r) }; });
  const source = { run_instance_id: scope.source.run_instance_id, run_identity_digest: d(`run:${scope.source.run_instance_id}`), plan_id: scope.source.plan_id, plan_digest: scope.source.plan_digest, repository_revision: scope.source.repository_revision, materialization_manifest_digest: scope.source.materialization_manifest_digest, selection_state_digest: d(`selection:${scope.prompt_role}`) };
  const manifestBase = {
    schema_version: "1.3.0", schema_path: "benchmarks/schemas/normalized-portfolio-run.schema.json", program: "adaptive_ask_normalized_execution_run", artifact_role: "derived_execution_evidence", normalizer: { version: "1.3.0", source_revision: scope.source.repository_revision }, source,
    source_snapshot: sourceSnapshot, source_snapshot_digest: snapshotDigest, output_root_identity: canonicalDigest({ run_instance_id: source.run_instance_id, plan_id: source.plan_id, normalizer_version: "1.3.0", source_snapshot_digest: snapshotDigest }), pool_adapter_results: false,
    completeness: { partial: true, expected_cases: 56, normalized_cases: 14, terminal_cases: 14, pending_cases: 42, active_cases: 0, invalid_cases: outcome === "invalid" ? 14 : 0, by_adapter: grouped(cases, ["codex", "claude"], "adapter", (c) => c.adapter_track), by_condition: grouped(cases, CONDITIONS, "condition", (c) => c.condition), by_status: STATUSES.map((status) => ({ status, count: cases.filter((c) => c.status === status).length })), missing_case_ids: cases.filter((c) => c.status === "pending").map((c) => c.case_id).sort(), invalid_case_ids: cases.filter((c) => c.status === "invalid").map((c) => c.case_id).sort() },
    telemetry_coverage: TELEMETRY.map((field) => ({ field, known: 0, unknown: outcome === "unavailable" ? 0 : 14, unavailable: outcome === "unavailable" ? 14 : 0, not_applicable: 0, total: 14 })), cases, inventory,
    publication_digest: canonicalDigest({ source_snapshot_digest: snapshotDigest, inventory }), boundaries: { evaluator_result: false, score: false, product_value_claim: false, raw_execution_artifacts_are_authoritative: true, measured_execution_authorized: false, issue_198_stage_0_authorized: false },
  };
  const manifest = { ...manifestBase, normalized_run_digest: canonicalDigest(manifestBase) };
  writeSyntheticJson(resolve(generation, "normalized-run.json"), manifest);
  const { materialization_manifest_digest: _m, selection_state_digest: _s, ...collectionSource } = source;
  const collection = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json", program: "adaptive_ask_normalized_execution_collection", artifact_role: "immutable_snapshot_collection", normalizer: manifest.normalizer, source: collectionSource, generations_directory: "generations" };
  writeSyntheticJson(resolve(normalizedPath, "normalized-results-root.json"), { ...collection, output_collection_identity: canonicalDigest(collection) });
  normalizer.verifyNormalizedPortfolioResults({ root, outputPath: normalizedPath, sourceSnapshotDigest: snapshotDigest });
  const engineeringPath = resolve(directory, "engineering");
  const engineeringInventory = [];
  for (const record of records) {
    const value = await buildEngineering(root, record, snapshotDigest);
    const path = `${value.engineering_result_id}.json`;
    const file = writeSyntheticJson(resolve(engineeringPath, path), value);
    const keys = ["engineering_result_id", "engineering_result_digest", "effective_admission_mode", "effective_admission_status", "frozen_admission_record_digest", "requirement_authority_digest", "admission_decision_digest", "admission_decision_revision", "normalized_result_id", "normalized_result_digest", "case_id", "attempt", "condition", "repetition"];
    engineeringInventory.push({ path, raw_byte_digest: file.sha256, bytes: file.bytes, ...Object.fromEntries(keys.map((key) => [key, value[key]])) });
  }
  engineeringInventory.sort((a, b) => a.path.localeCompare(b.path));
  const manifestSource = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json", program: "adaptive_ask_portfolio_engineering_result_source_manifest", plan_id: source.plan_id, plan_digest: source.plan_digest, run_instance_id: source.run_instance_id, source_snapshot_digest: snapshotDigest, adapter_track: "codex", normalized_generation_id: `snapshot-${snapshotDigest.slice(7)}`, normalized_manifest_digest: manifest.normalized_run_digest, source_revision: source.repository_revision, inventory: engineeringInventory };
  const sourceManifest = { ...manifestSource, manifest_digest: resultSets.computeEngineeringResultSourceManifestDigest(manifestSource) };
  resultSets.validateEngineeringResultSourceManifest(sourceManifest, { root });
  const sourceManifestPath = resolve(directory, "source-manifest.json");
  const manifestFile = writeSyntheticJson(sourceManifestPath, sourceManifest);
  return { paths: { normalizedResultsPath: normalizedPath, engineeringResultsPath: engineeringPath, sourceManifestPath }, sourceManifestSourceDigest: manifestFile.sha256, sourceSnapshotDigest: snapshotDigest, generation, sourceManifest };
}

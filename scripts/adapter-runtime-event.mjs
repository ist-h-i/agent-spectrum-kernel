import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "./execution-envelope.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = existsSync(resolve(RUNTIME_ROOT, "adapter-runtime-event.schema.json"))
  ? resolve(RUNTIME_ROOT, "adapter-runtime-event.schema.json")
  : resolve(RUNTIME_ROOT, "../schemas/adapter-runtime-event.schema.json");
const EVIDENCE_LEVELS = ["none", "projected", "runtime_detected", "executed", "behavior_verified"];
const SUPPORT_LEVELS = ["unknown", "unsupported", "partial", "supported"];

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))].sort();
}

function evidenceLevel(value) {
  return EVIDENCE_LEVELS.includes(value) ? value : "none";
}

function privacy() {
  return { raw_prompts_stored: false, sensitive_payloads_stored: false, external_publication: false };
}

function verificationCounts({ obligationRequired = false, attempted = 0, passed = 0, failed = 0, unavailable = 0 } = {}) {
  return { obligation_required: obligationRequired, attempted, passed, failed, unavailable };
}

function outcomeForStop(status) {
  if (["completed", "risk_gate", "insufficient_evidence", "blocked", "failed"].includes(status)) return status;
  if (status === "capability_missing") return "blocked";
  return status === "none" ? "in_progress" : "unknown";
}

function claimEffectForStop(status) {
  if (["risk_gate", "capability_missing", "blocked", "failed"].includes(status)) return "block";
  if (status === "insufficient_evidence") return "downgrade";
  return status === "completed" ? "support_within_scope" : "none";
}

function missingEvidenceFromClaude(event) {
  return unique([
    ...(event.routing_result?.missing_evidence ?? []).map((item) => item?.input),
    ...(event.gate_decisions ?? []).flatMap((item) => item?.missing_inputs ?? []),
  ]);
}

export function mapClaudeMetricsEvent(event, { eventKind = "task_stop", hookEvent = null } = {}) {
  const missingEvidence = missingEvidenceFromClaude(event);
  const requiredGates = unique([
    ...(event.routing_result?.required_gates ?? []),
    ...(event.gate_decisions ?? []).filter((item) => ["required", "executed"].includes(item?.status)).map((item) => item.gate),
  ]);
  const executedGates = unique((event.gate_decisions ?? []).filter((item) => item?.status === "executed").map((item) => item.gate));
  const approvalMissing = missingEvidence.includes("specific_action_approval");
  const approvalRequired = approvalMissing || requiredGates.includes("risk-gate");
  const stopStatus = approvalRequired
    ? "risk_gate"
    : event.outcome_metrics?.task_completed === true
      ? "completed"
      : missingEvidence.length > 0 || event.verification_metrics?.insufficient_evidence_reported === true
        ? "insufficient_evidence"
        : "none";
  const attempted = event.verification_metrics?.commands_run?.length ?? 0;
  const selectedContracts = unique(event.skills_used ?? []);
  const appliedContracts = unique([
    event.routing_result?.primary_skill,
    ...executedGates,
  ]).filter((contract) => selectedContracts.includes(contract));
  const normalized = {
    schema_version: "1.0.0",
    event_id: event.event_id,
    task_id: event.task_id,
    adapter_id: "claude_code",
    event_type: eventKind === "verification_attempt" ? "verification_attempt" : eventKind === "task_stop" ? "task_stop" : requiredGates.length > 0 ? "gate_execution" : "evidence_status",
    occurred_at: event.occurred_at,
    contracts: {
      selected: selectedContracts,
      applied: appliedContracts,
      application_evidence_level: appliedContracts.length > 0 ? "executed" : "none",
      missing_evidence: missingEvidence,
    },
    gates: { required: requiredGates, executed: executedGates },
    approval: {
      required: approvalRequired,
      status: approvalRequired ? approvalMissing ? "missing" : "unknown" : "not_required",
      action_categories: approvalRequired ? ["risk_gated_action"] : [],
    },
    evidence: { checked: unique(event.evidence_references ?? []), missing: missingEvidence },
    agent_activity: {
      started: hookEvent === "SubagentStart" ? 1 : 0,
      completed: hookEvent === "SubagentStop" ? 1 : 0,
      failed: 0,
    },
    verification: verificationCounts({ obligationRequired: selectedContracts.includes("test-first-verification"), attempted, unavailable: attempted }),
    review: { final_gate_required: requiredGates.includes("review-final-merge-gate") },
    handoff: { executable_state_required: selectedContracts.includes("handoff-generation") },
    stop: { status: stopStatus },
    knowledge: { promotion_requested: event.task_type === "ledger_refresh" },
    outcome: { classification: outcomeForStop(stopStatus), claim_effect: claimEffectForStop(stopStatus) },
    capability_downgrades: [],
    privacy: privacy(),
  };
  assertValidAdapterRuntimeEvent(normalized);
  return normalized;
}

function codexMissingEvidence(report) {
  return unique(Object.values(report.execution_evidence ?? {}).flatMap((record) => record?.missing_evidence ?? []));
}

export function mapCodexRunnerResult(report, { eventId = null, taskId = null, occurredAt = null, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const selectedContracts = unique(report.execution_evidence?.requested_contracts?.contracts ?? []);
  const requiredGateEvidence = report.execution_evidence?.required_gates;
  const requiredGates = unique(requiredGateEvidence?.gates ?? []);
  const gateObservationMissing = evidenceLevel(requiredGateEvidence?.evidence_level) === "none";
  const missingEvidence = unique([
    ...codexMissingEvidence(report),
    ...(gateObservationMissing ? ["required_gate_observation"] : []),
  ]);
  const appliedLevel = evidenceLevel(report.execution_evidence?.workflow_contract_application?.evidence_level);
  const appliedContracts = appliedLevel === "none" ? [] : selectedContracts;
  const verificationAttempted = report.sensor_status === null || report.sensor_status === undefined ? 0 : 1;
  const verificationPassed = report.sensor_status === "pass" ? 1 : 0;
  const verificationFailed = verificationAttempted - verificationPassed;
  const applicationEvidenceMissing = missingEvidence.some((item) => /(?:contract_load|contract_application)$/u.test(item));
  const approvalRequired = requiredGates.includes("risk-gate");
  const approvalMissing = approvalRequired && missingEvidence.includes("specific_action_approval");
  const stopStatus = approvalMissing
    ? "risk_gate"
    : report.status === "executed"
    ? applicationEvidenceMissing || appliedContracts.length === 0 ? "insufficient_evidence" : "completed"
    : report.status === "insufficient_evidence"
      ? "insufficient_evidence"
      : report.status === "execution_failed"
        ? "failed"
        : "none";
  const normalized = {
    schema_version: "1.0.0",
    event_id: eventId ?? `codex-runner:${report.mode ?? "unknown"}:${report.status ?? "unknown"}`,
    task_id: taskId ?? `codex-task:${report.output_path ?? "unknown"}`,
    adapter_id: "codex",
    event_type: "task_stop",
    occurred_at: occurredAt ?? new Date().toISOString(),
    contracts: {
      selected: selectedContracts,
      applied: appliedContracts,
      application_evidence_level: appliedLevel,
      missing_evidence: missingEvidence,
    },
    gates: { required: requiredGates, executed: [] },
    approval: {
      required: approvalRequired,
      status: approvalRequired ? approvalMissing ? "missing" : "unknown" : "not_required",
      action_categories: approvalRequired ? ["risk_gated_action"] : [],
    },
    evidence: {
      checked: unique(Object.entries(report.execution_evidence ?? {}).filter(([, record]) => evidenceLevel(record?.evidence_level) !== "none").map(([name]) => name)),
      missing: missingEvidence,
    },
    agent_activity: { started: 0, completed: 0, failed: 0 },
    verification: verificationCounts({ obligationRequired: selectedContracts.includes("test-first-verification"), attempted: verificationAttempted, passed: verificationPassed, failed: verificationFailed }),
    review: { final_gate_required: requiredGates.includes("review-final-merge-gate") },
    handoff: { executable_state_required: selectedContracts.includes("handoff-generation") },
    stop: { status: stopStatus },
    knowledge: { promotion_requested: false },
    outcome: { classification: outcomeForStop(stopStatus), claim_effect: claimEffectForStop(stopStatus) },
    capability_downgrades: [],
    privacy: privacy(),
  };
  assertValidAdapterRuntimeEvent(normalized, { schemaPath });
  return normalized;
}

export function validateAdapterRuntimeEvent(event, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const errors = validateJsonSchema(event, { schemaPath });
  const requiredGates = new Set(event?.gates?.required ?? []);
  const missingEvidence = new Set([...(event?.contracts?.missing_evidence ?? []), ...(event?.evidence?.missing ?? [])]);
  const applicationEvidenceMissing = [...missingEvidence].some((item) => /(?:contract_load|contract_application)$/u.test(item));
  const selectedContracts = new Set(event?.contracts?.selected ?? []);
  const appliedContracts = event?.contracts?.applied ?? [];
  const applicationEvidenceLevel = event?.contracts?.application_evidence_level;
  if (requiredGates.has("risk-gate") && event?.approval?.required !== true) errors.push("$.approval.required: risk-gate requires approval.required");
  if (event?.approval?.required === true && event?.approval?.status !== "approved" && (event?.stop?.status === "completed" || event?.outcome?.classification === "completed" || event?.outcome?.claim_effect === "support_within_scope")) errors.push("$.approval.status: incomplete approval cannot produce completed or support claim");
  if (event?.outcome?.claim_effect === "support_within_scope" && (event?.contracts?.applied?.length ?? 0) === 0) errors.push("$.outcome.claim_effect: support claim requires an applied contract");
  if (applicationEvidenceLevel === "none" && appliedContracts.length > 0) errors.push("$.contracts.applied: application evidence none cannot have applied contracts");
  if (applicationEvidenceLevel === "none" && event?.outcome?.claim_effect === "support_within_scope") errors.push("$.outcome.claim_effect: application evidence none cannot support a claim");
  if (applicationEvidenceMissing && event?.outcome?.claim_effect === "support_within_scope") errors.push("$.outcome.claim_effect: missing application evidence cannot support a claim");
  if (appliedContracts.some((contract) => !selectedContracts.has(contract))) errors.push("$.contracts.applied: applied contracts must be selected");
  if (applicationEvidenceMissing && (event?.stop?.status === "completed" || event?.outcome?.classification === "completed")) errors.push("$.outcome.classification: missing application evidence cannot produce completed");
  if (missingEvidence.has("specific_action_approval") && event?.approval?.status === "approved") errors.push("$.approval.status: missing approval evidence cannot produce approved");
  if ((event?.gates?.executed ?? []).some((gate) => !requiredGates.has(gate))) errors.push("$.gates.executed: executed gates must be a subset of required gates");
  for (const [index, downgrade] of (event?.capability_downgrades ?? []).entries()) {
    const fromSupport = SUPPORT_LEVELS.indexOf(downgrade?.from?.support);
    const toSupport = SUPPORT_LEVELS.indexOf(downgrade?.to?.support);
    const fromEvidence = EVIDENCE_LEVELS.indexOf(downgrade?.from?.evidence_level);
    const toEvidence = EVIDENCE_LEVELS.indexOf(downgrade?.to?.evidence_level);
    if (fromSupport >= 0 && toSupport > fromSupport) errors.push(`$.capability_downgrades[${index}].to.support: downgrade cannot increase support`);
    if (fromEvidence >= 0 && toEvidence > fromEvidence) errors.push(`$.capability_downgrades[${index}].to.evidence_level: downgrade cannot increase evidence without a separate evidence event`);
  }
  return errors;
}

export function assertValidAdapterRuntimeEvent(event, options = {}) {
  const errors = validateAdapterRuntimeEvent(event, options);
  if (errors.length > 0) throw new Error(`normalized adapter runtime event is invalid: ${errors.join("; ")}`);
  return event;
}

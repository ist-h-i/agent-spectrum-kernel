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

function verificationCounts({ attempted = 0, passed = 0, failed = 0, unavailable = 0 } = {}) {
  return { attempted, passed, failed, unavailable };
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
    ...(event.gate_decisions ?? []).filter((item) => item?.status === "required").map((item) => item.gate),
  ]);
  const executedGates = unique((event.gate_decisions ?? []).filter((item) => item?.status === "executed").map((item) => item.gate));
  const approvalRequired = missingEvidence.includes("specific_action_approval") || requiredGates.includes("risk-gate");
  const stopStatus = event.outcome_metrics?.task_completed === true
    ? "completed"
    : approvalRequired && !executedGates.includes("risk-gate")
      ? "risk_gate"
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
      status: approvalRequired ? executedGates.includes("risk-gate") ? "approved" : "missing" : "not_required",
      action_categories: approvalRequired ? ["risk_gated_action"] : [],
    },
    evidence: { checked: unique(event.evidence_references ?? []), missing: missingEvidence },
    agent_activity: {
      started: hookEvent === "SubagentStart" ? 1 : 0,
      completed: hookEvent === "SubagentStop" ? 1 : 0,
      failed: 0,
    },
    verification: verificationCounts({ attempted, unavailable: attempted }),
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
  const requiredGates = selectedContracts.filter((contract) => contract.endsWith("-gate"));
  const missingEvidence = codexMissingEvidence(report);
  const appliedLevel = evidenceLevel(report.execution_evidence?.workflow_contract_application?.evidence_level);
  const appliedContracts = appliedLevel === "none" ? [] : selectedContracts;
  const verificationAttempted = report.sensor_status === null || report.sensor_status === undefined ? 0 : 1;
  const verificationPassed = report.sensor_status === "pass" ? 1 : 0;
  const verificationFailed = verificationAttempted - verificationPassed;
  const stopStatus = report.status === "executed"
    ? "completed"
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
    approval: { required: false, status: "unknown", action_categories: [] },
    evidence: {
      checked: unique(Object.entries(report.execution_evidence ?? {}).filter(([, record]) => evidenceLevel(record?.evidence_level) !== "none").map(([name]) => name)),
      missing: missingEvidence,
    },
    agent_activity: { started: 0, completed: 0, failed: 0 },
    verification: verificationCounts({ attempted: verificationAttempted, passed: verificationPassed, failed: verificationFailed }),
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

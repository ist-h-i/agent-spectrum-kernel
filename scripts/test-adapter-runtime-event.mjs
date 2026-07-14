#!/usr/bin/env node
import assert from "node:assert/strict";
import { mapClaudeMetricsEvent, mapCodexRunnerResult, validateAdapterRuntimeEvent } from "./adapter-runtime-event.mjs";

const claudeMetricsEvent = {
  schema_version: "1.0.0",
  event_id: "evt:claude-fixture",
  task_id: "task:claude-fixture",
  task_type: "review",
  occurred_at: "2026-07-14T00:00:00Z",
  skills_used: ["review-router", "risk-gate", "evidence-ledger"],
  routing_result: {
    primary_skill: "review-router",
    required_gates: ["risk-gate"],
    missing_evidence: [{ input: "specific_action_approval", reason: "Approval is required." }],
  },
  gate_decisions: [{ gate: "risk-gate", status: "required", missing_inputs: ["specific_action_approval"] }],
  outcome_metrics: {},
  verification_metrics: { commands_run: [{ command_kind: "test" }], insufficient_evidence_reported: true },
  debt_movement_metrics: {},
  evidence_references: ["claude_hook:Stop"],
  privacy_note: { raw_prompts_stored: false, secrets_stored: false, customer_data_stored: false, personal_data_stored: false, external_publication: false },
};

const claudeNormalized = mapClaudeMetricsEvent(claudeMetricsEvent, { eventKind: "task_stop", hookEvent: "Stop" });
assert.deepEqual(validateAdapterRuntimeEvent(claudeNormalized), []);
assert.equal(claudeNormalized.adapter_id, "claude_code");
assert.equal(claudeNormalized.approval.required, true);
assert.equal(claudeNormalized.approval.status, "missing");
assert.equal(claudeNormalized.stop.status, "risk_gate");
assert.deepEqual(claudeNormalized.agent_activity, { started: 0, completed: 0, failed: 0 });

const codexRunnerResult = {
  status: "executed",
  evidence_level: "executed",
  mode: "implementation",
  output_path: ".agents/runs/fixture.md",
  sensor_status: "pass",
  execution_evidence: {
    requested_contracts: { contracts: ["controlled-implementation", "risk-gate", "evidence-ledger"] },
    projected_contracts: { evidence_level: "projected" },
    runtime_detected_profile: { evidence_level: "runtime_detected" },
    runtime_loaded_contracts: { evidence_level: "none", missing_evidence: ["runtime_contract_load"] },
    workflow_contract_application: { evidence_level: "none", missing_evidence: ["workflow_contract_application"] },
    risk_approval_contract_application: { evidence_level: "none", missing_evidence: ["risk_approval_contract_application"] },
    verification_contract_application: { evidence_level: "none", missing_evidence: ["verification_contract_application"] },
  },
};

const codexNormalized = mapCodexRunnerResult(codexRunnerResult, {
  eventId: "evt:codex-fixture",
  taskId: "task:codex-fixture",
  occurredAt: "2026-07-14T00:00:00Z",
});
assert.deepEqual(validateAdapterRuntimeEvent(codexNormalized), []);
assert.equal(codexNormalized.adapter_id, "codex");
assert.deepEqual(codexNormalized.verification, { attempted: 1, passed: 1, failed: 0, unavailable: 0 });
assert.equal(codexNormalized.stop.status, "completed");

const missingStop = structuredClone(codexNormalized);
delete missingStop.stop;
assert.ok(validateAdapterRuntimeEvent(missingStop).some((error) => error.includes("$.stop: is required")));

const validDowngrade = structuredClone(codexNormalized);
validDowngrade.capability_downgrades = [{
  capability_id: "local_event_emission",
  from: { support: "supported", evidence_level: "executed" },
  to: { support: "partial", evidence_level: "runtime_detected" },
  reason: "The bounded runtime probe became unavailable.",
}];
assert.deepEqual(validateAdapterRuntimeEvent(validDowngrade), []);

const invalidUpgrade = structuredClone(validDowngrade);
invalidUpgrade.capability_downgrades[0] = {
  ...invalidUpgrade.capability_downgrades[0],
  from: { support: "partial", evidence_level: "runtime_detected" },
  to: { support: "supported", evidence_level: "executed" },
};
const upgradeErrors = validateAdapterRuntimeEvent(invalidUpgrade);
assert.ok(upgradeErrors.some((error) => error.includes("cannot increase support")));
assert.ok(upgradeErrors.some((error) => error.includes("cannot increase evidence")));

console.log("Normalized adapter runtime event tests passed");

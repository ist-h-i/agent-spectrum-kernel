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

const claudeExecutedGateEvent = structuredClone(claudeMetricsEvent);
claudeExecutedGateEvent.gate_decisions = [{ gate: "risk-gate", status: "executed", missing_inputs: ["specific_action_approval"] }];
const claudeExecutedGate = mapClaudeMetricsEvent(claudeExecutedGateEvent, { eventKind: "task_stop", hookEvent: "Stop" });
assert.notEqual(claudeExecutedGate.approval.status, "approved", "gate execution is not explicit human approval evidence");
assert.equal(claudeExecutedGate.stop.status, "risk_gate");

const claudeReviewRiskEvent = structuredClone(claudeMetricsEvent);
claudeReviewRiskEvent.skills_used = ["review-router", "review-ai-quality", "review-architecture-impact", "risk-gate"];
claudeReviewRiskEvent.routing_result.required_gates = ["review-ai-quality", "review-architecture-impact", "risk-gate"];
claudeReviewRiskEvent.gate_decisions = [
  { gate: "review-ai-quality", status: "executed", missing_inputs: [] },
  { gate: "review-architecture-impact", status: "executed", missing_inputs: [] },
  { gate: "risk-gate", status: "required", missing_inputs: ["specific_action_approval"] },
];
const claudeReviewRiskNormalized = mapClaudeMetricsEvent(claudeReviewRiskEvent, { eventKind: "task_stop", hookEvent: "Stop" });
assert.deepEqual(validateAdapterRuntimeEvent(claudeReviewRiskNormalized), []);
assert.equal(claudeReviewRiskNormalized.approval.required, true, "Claude events do not carry Codex read-only sandbox evidence");
assert.equal(claudeReviewRiskNormalized.approval.status, "missing");
assert.equal(claudeReviewRiskNormalized.stop.status, "risk_gate");

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
assert.deepEqual(codexNormalized.verification, { obligation_required: false, attempted: 0, passed: 0, failed: 0, unavailable: 0 });
assert.equal(codexNormalized.stop.status, "insufficient_evidence");
assert.equal(codexNormalized.outcome.classification, "insufficient_evidence");
assert.notEqual(codexNormalized.outcome.claim_effect, "support_within_scope");
assert.ok(codexNormalized.evidence.missing.includes("required_gate_observation"));

const codexVerificationResult = structuredClone(codexRunnerResult);
codexVerificationResult.execution_evidence.requested_contracts.contracts.push("test-first-verification");
const codexVerificationNormalized = mapCodexRunnerResult(codexVerificationResult, {
  eventId: "evt:codex-verification-fixture",
  taskId: "task:codex-verification-fixture",
  occurredAt: "2026-07-14T00:00:01Z",
});
assert.deepEqual(codexVerificationNormalized.verification, { obligation_required: true, attempted: 0, passed: 0, failed: 0, unavailable: 1 }, "sensor pass must not become command or verification evidence");

const codexReviewRiskResult = structuredClone(codexRunnerResult);
codexReviewRiskResult.mode = "review";
codexReviewRiskResult.sandbox = "read-only";
codexReviewRiskResult.execution_evidence.requested_contracts.contracts = ["review-router", "risk-gate"];
codexReviewRiskResult.execution_evidence.required_gates = {
  evidence_level: "runtime_detected",
  gates: ["review-ai-quality", "review-architecture-impact", "risk-gate"],
  missing_evidence: [],
};
const codexReviewRiskNormalized = mapCodexRunnerResult(codexReviewRiskResult, {
  eventId: "evt:codex-review-risk-fixture",
  taskId: "task:codex-review-risk-fixture",
  occurredAt: "2026-07-14T00:00:02Z",
});
assert.deepEqual(validateAdapterRuntimeEvent(codexReviewRiskNormalized), []);
assert.equal(codexReviewRiskNormalized.approval.required, false, "read-only review risk-gate is an evaluation gate, not action approval");
assert.equal(codexReviewRiskNormalized.approval.status, "not_required");

const codexWriteRiskResult = structuredClone(codexReviewRiskResult);
codexWriteRiskResult.mode = "implementation";
codexWriteRiskResult.sandbox = "workspace-write";
codexWriteRiskResult.execution_evidence.requested_contracts.contracts = ["controlled-implementation", "risk-gate"];
const codexWriteRiskNormalized = mapCodexRunnerResult(codexWriteRiskResult, {
  eventId: "evt:codex-write-risk-fixture",
  taskId: "task:codex-write-risk-fixture",
  occurredAt: "2026-07-14T00:00:03Z",
});
assert.equal(codexWriteRiskNormalized.approval.required, true, "non-review risk-gated action must still require approval");

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

const semanticBase = structuredClone(codexNormalized);
semanticBase.contracts.missing_evidence = [];
semanticBase.evidence.missing = [];

const riskGateWithoutApproval = structuredClone(semanticBase);
riskGateWithoutApproval.gates.required = ["risk-gate"];
riskGateWithoutApproval.approval = { required: false, status: "not_required", action_categories: [] };
assert.ok(validateAdapterRuntimeEvent(riskGateWithoutApproval).some((error) => error.includes("risk-gate requires approval.required")));

const reviewRiskGateWithoutApproval = structuredClone(semanticBase);
reviewRiskGateWithoutApproval.contracts.selected = ["review-router", "risk-gate"];
reviewRiskGateWithoutApproval.gates.required = ["review-ai-quality", "review-architecture-impact", "risk-gate"];
reviewRiskGateWithoutApproval.approval = { required: false, status: "not_required", action_categories: [] };
assert.deepEqual(validateAdapterRuntimeEvent(reviewRiskGateWithoutApproval), [], "review risk-gate must not imply action approval");

const reviewRiskGateWithApproval = structuredClone(reviewRiskGateWithoutApproval);
reviewRiskGateWithApproval.approval = { required: true, status: "unknown", action_categories: ["risk_gated_action"] };
assert.ok(validateAdapterRuntimeEvent(reviewRiskGateWithApproval).some((error) => error.includes("review risk-gate must not require action approval")));

const claudeReviewRiskGateWithoutApproval = structuredClone(reviewRiskGateWithoutApproval);
claudeReviewRiskGateWithoutApproval.adapter_id = "claude_code";
assert.ok(validateAdapterRuntimeEvent(claudeReviewRiskGateWithoutApproval).some((error) => error.includes("risk-gate requires approval.required")), "Codex-only review evidence must not weaken Claude approval semantics");

const nonReviewRiskGateWithReviewBaseline = structuredClone(reviewRiskGateWithoutApproval);
nonReviewRiskGateWithReviewBaseline.contracts.selected = ["controlled-implementation", "risk-gate"];
assert.ok(validateAdapterRuntimeEvent(nonReviewRiskGateWithReviewBaseline).some((error) => error.includes("risk-gate requires approval.required")), "a review gate id alone must not bypass non-review approval");

const supportWithoutAppliedContract = structuredClone(semanticBase);
supportWithoutAppliedContract.contracts.applied = [];
supportWithoutAppliedContract.outcome.claim_effect = "support_within_scope";
assert.ok(validateAdapterRuntimeEvent(supportWithoutAppliedContract).some((error) => error.includes("support claim requires an applied contract")));

const appliedWithoutApplicationEvidence = structuredClone(semanticBase);
appliedWithoutApplicationEvidence.contracts.applied = ["controlled-implementation"];
assert.ok(validateAdapterRuntimeEvent(appliedWithoutApplicationEvidence).some((error) => error.includes("application evidence none cannot have applied contracts")));

const supportWithoutApplicationEvidence = structuredClone(appliedWithoutApplicationEvidence);
supportWithoutApplicationEvidence.outcome.claim_effect = "support_within_scope";
assert.ok(validateAdapterRuntimeEvent(supportWithoutApplicationEvidence).some((error) => error.includes("application evidence none cannot support a claim")));

const supportWithMissingApplication = structuredClone(appliedWithoutApplicationEvidence);
supportWithMissingApplication.contracts.application_evidence_level = "executed";
supportWithMissingApplication.contracts.missing_evidence = ["workflow_contract_application"];
supportWithMissingApplication.evidence.missing = ["workflow_contract_application"];
supportWithMissingApplication.outcome.claim_effect = "support_within_scope";
assert.ok(validateAdapterRuntimeEvent(supportWithMissingApplication).some((error) => error.includes("missing application evidence cannot support a claim")));

const appliedOutsideSelection = structuredClone(semanticBase);
appliedOutsideSelection.contracts.application_evidence_level = "executed";
appliedOutsideSelection.contracts.applied = ["not-selected-contract"];
assert.ok(validateAdapterRuntimeEvent(appliedOutsideSelection).some((error) => error.includes("applied contracts must be selected")));

const completedWithMissingApplication = structuredClone(semanticBase);
completedWithMissingApplication.contracts.missing_evidence = ["workflow_contract_application"];
completedWithMissingApplication.evidence.missing = ["workflow_contract_application"];
completedWithMissingApplication.stop.status = "completed";
completedWithMissingApplication.outcome = { classification: "completed", claim_effect: "none" };
assert.ok(validateAdapterRuntimeEvent(completedWithMissingApplication).some((error) => error.includes("missing application evidence cannot produce completed")));

const approvedWithMissingApproval = structuredClone(semanticBase);
approvedWithMissingApproval.contracts.missing_evidence = ["specific_action_approval"];
approvedWithMissingApproval.evidence.missing = ["specific_action_approval"];
approvedWithMissingApproval.approval = { required: true, status: "approved", action_categories: ["risk_gated_action"] };
assert.ok(validateAdapterRuntimeEvent(approvedWithMissingApproval).some((error) => error.includes("missing approval evidence cannot produce approved")));

const completedWithoutApproval = structuredClone(semanticBase);
completedWithoutApproval.gates.required = ["risk-gate"];
completedWithoutApproval.approval = { required: true, status: "unknown", action_categories: ["risk_gated_action"] };
completedWithoutApproval.stop.status = "completed";
completedWithoutApproval.outcome = { classification: "completed", claim_effect: "support_within_scope" };
completedWithoutApproval.contracts.applied = ["risk-gate"];
assert.ok(validateAdapterRuntimeEvent(completedWithoutApproval).some((error) => error.includes("incomplete approval cannot produce completed")));

const unrequiredExecutedGate = structuredClone(semanticBase);
unrequiredExecutedGate.gates = { required: [], executed: ["risk-gate"] };
assert.ok(validateAdapterRuntimeEvent(unrequiredExecutedGate).some((error) => error.includes("executed gates must be a subset of required gates")));

console.log("Normalized adapter runtime event tests passed");

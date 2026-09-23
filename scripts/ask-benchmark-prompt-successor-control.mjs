import { canonicalDigest } from "./content-addressed-store.mjs";
import { successorClosed, successorDigest, successorExact, successorFail, validatePromptSuccessorPreparation } from "./ask-benchmark-prompt-successor.mjs";
import { validateSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";

export const SUCCESSOR_STOP_POLICY = Object.freeze({
  planned_trials: 28, automatic_retries: 0, timeout_ms: 900000,
  trial_token_warning: 250000, cumulative_token_warning: 3000000, token_escalation: 5000000,
});
const TERMINAL = new Set(["completed", "failed", "unavailable", "interrupted", "invalid"]);
const FIELDS = ["case_id", "status", "attempt_count", "request_digest", "result_digest", "commit_digest", "duration_ms", "workspace_evidence", "usage"];
const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;
function reject(label) { successorFail("SUCCESSOR_COLLECTION_INVALID", label); }

/**
 * Pure protocol/usage calculation, NOT an execution or measured-result grant.
 * The native inspector supplies these records by reopening #197 evidence. No
 * serialized checkpoint, editable total, or proposed report may authorize work.
 */
export function evaluateSuccessorCollection(options) {
  successorClosed(options, ["preparation", "cases"], "collection inputs");
  const { preparation, cases } = structuredClone(options);
  validatePromptSuccessorPreparation(preparation);
  if (!Array.isArray(cases) || cases.length !== SUCCESSOR_STOP_POLICY.planned_trials) reject("exact 28-case inventory required");
  let terminalCount = 0; let observed = 0; let unknownUsage = false;
  let pendingSeen = false; const stops = new Set(); const warnings = [];
  for (const [index, item] of cases.entries()) {
    successorClosed(item, FIELDS, `collection case ${index + 1}`);
    successorExact(item.case_id, preparation.cases[index].case_id, `ordered collection case ${index + 1}`);
    if (!["captured", "unavailable"].includes(item.workspace_evidence)) reject("workspace evidence type");
    if (item.duration_ms !== null && !safeCount(item.duration_ms)) reject("duration type");
    if (item.status === "pending" || item.status === "active") {
      const active = item.status === "active";
      if (item.attempt_count !== (active ? 1 : 0)) reject("pending/active attempt count");
      if ([item.request_digest, item.result_digest, item.commit_digest, item.duration_ms, item.usage].some((value) => value !== null) || item.workspace_evidence !== "unavailable") reject("pending/active terminal evidence");
      if (active) {
        if (pendingSeen || stops.size) reject("active case after gap or stop");
        stops.add("execution_uncertain");
        unknownUsage = true; stops.add("trial_usage_unavailable");
      }
      pendingSeen = true;
      continue;
    }
    if (!TERMINAL.has(item.status)) reject("terminal status");
    if (pendingSeen || stops.size) reject("terminal case after gap or stop");
    if (item.attempt_count !== 1) reject("retry or missing attempt");
    for (const key of ["request_digest", "result_digest", "commit_digest"]) successorDigest(item[key], key);
    terminalCount += 1;
    if (item.status === "interrupted") stops.add("execution_uncertain");
    if (item.status === "invalid") stops.add("execution_invalid");
    if (item.status === "unavailable") stops.add("runtime_unavailable");
    if (item.workspace_evidence !== "captured") stops.add("workspace_evidence_unavailable");
    if (item.duration_ms === null) stops.add("duration_unavailable");
    else if (item.duration_ms >= SUCCESSOR_STOP_POLICY.timeout_ms) stops.add("timeout_boundary");
    if (item.usage !== null) validateSuccessorUsage(item.usage);
    const total = item.usage?.metrics.total_tokens;
    if (!total || total.status !== "known") {
      unknownUsage = true; stops.add("trial_usage_unavailable");
    } else {
      if (!safeCount(observed + total.value)) reject("cumulative usage overflow");
      observed += total.value;
      if (total.value >= SUCCESSOR_STOP_POLICY.trial_token_warning) warnings.push({ code: "trial_token_warning", case_id: item.case_id, total_tokens: total.value });
      if (observed >= SUCCESSOR_STOP_POLICY.token_escalation) stops.add("token_budget_escalation");
    }
  }
  if (observed >= SUCCESSOR_STOP_POLICY.cumulative_token_warning) warnings.push({ code: "cumulative_token_warning", observed_token_lower_bound: observed });
  const status = stops.size ? "stopped" : terminalCount === cases.length ? "collected" : "ready_for_authorized_claim";
  const base = {
    schema_version: "1.0.0", kind: "prompt_successor_collection_control",
    preparation_digest: preparation.preparation_digest, policy: { ...SUCCESSOR_STOP_POLICY },
    status, terminal_count: terminalCount, pending_count: cases.filter((item) => item.status === "pending").length,
    total_tokens: unknownUsage ? { status: "unknown", value: null, reason: "trial_usage_unavailable" } : { status: "known", value: observed, reason: null },
    observed_token_lower_bound: observed, warnings, stop_reasons: [...stops].sort(),
    next_case_id: status === "ready_for_authorized_claim" ? cases[terminalCount].case_id : null,
    cases, execution_authorized: false, measured_decision_authorized: false, mutation_authorized: false,
  };
  return { ...base, control_digest: canonicalDigest(base) };
}

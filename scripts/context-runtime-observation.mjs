import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, stableCanonicalJson } from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./json-schema-validation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROLLOVER_SCHEMA = resolve(ROOT, "schemas/context-rollover.schema.json");
export const COUNTER_UNITS = Object.freeze(Object.fromEntries([
  "wall_time_ms", "model_steps", "runtime_steps", "cached_input_tokens", "uncached_input_tokens",
  "output_tokens", "context_compactions", "tool_wait_ms", "repository_orientation_rounds",
  "verification_attempts", "integration_conflicts", "resume_failures", "silent_gap_count_over_60s",
  "required_human_decisions", "rework",
].map((key) => [key, key.endsWith("_ms") ? "ms" : key.endsWith("_tokens") ? "tokens" : "count"])));
export const REWORK_REASONS = Object.freeze(["requirements", "verification", "integration", "context_loss", "other"]);
export const TRIGGER_COUNTERS = Object.freeze(["model_steps", "runtime_steps", "uncached_input_tokens", "context_compactions", "wall_time_ms", "repository_orientation_rounds"]);

export function assertRolloverArtifact(value, expectedKind, schemaPath = ROLLOVER_SCHEMA) {
  // Reject unknown fields instead of silently projecting caller-authored telemetry.
  // Errors deliberately omit values: even rejected input must not leak content.
  if (Buffer.byteLength(stableCanonicalJson(value)) > 65536) throw new Error("ROLLOVER_ARTIFACT_TOO_LARGE");
  const issues = validateJsonSchema(value, { schemaPath });
  if (value?.artifact_kind !== expectedKind || issues.length) throw new Error("ROLLOVER_ARTIFACT_INVALID");
  return value;
}
export function unavailableCounter(unit) {
  return { status: "unavailable", value: null, unit, source: "unavailable", coverage: "unavailable" };
}
export function observedCounter(value, unit, source = "runtime", coverage = "complete") {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("RUNTIME_COUNTER_INVALID");
  return { status: "observed", value, unit, source, coverage };
}
export function runtimeIdentity(value = null) {
  if (value === null) return { status: "unavailable", digest: null };
  if (typeof value !== "string" || !value || value.length > 256) throw new Error("RUNTIME_IDENTITY_INVALID");
  return { status: "observed", digest: canonicalDigest({ runtime_identity: value }) };
}
export function emptyRuntimeObservation({ adapterId, runtimePolicyDigest, processIdentity = runtimeIdentity(), sessionIdentity = runtimeIdentity() }) {
  return assertRolloverArtifact({
    artifact_kind: "ask_runtime_observation", schema_version: "1.0.0", adapter_id: adapterId,
    runtime_policy_digest: runtimePolicyDigest, process_identity: processIdentity, session_identity: sessionIdentity,
    counters: Object.fromEntries(Object.entries(COUNTER_UNITS).map(([key, unit]) => [key, unavailableCounter(unit)])),
    rework_reason_counts: Object.fromEntries(REWORK_REASONS.map((key) => [key, unavailableCounter("count")])),
  }, "ask_runtime_observation");
}
export function completeCounter(counter) {
  return counter?.status === "observed" && counter.coverage === "complete";
}
export function evaluateRolloverPolicy(policy, observation, { operatorRequest = false } = {}) {
  assertRolloverArtifact(policy, "ask_context_rollover_policy");
  assertRolloverArtifact(observation, "ask_runtime_observation");
  if (typeof operatorRequest !== "boolean") throw new Error("OPERATOR_REQUEST_INVALID");
  const reasons = [], unavailable = [];
  for (const key of TRIGGER_COUNTERS) {
    const threshold = policy.thresholds[key];
    if (threshold === null) continue;
    const counter = observation.counters[key];
    if (!completeCounter(counter)) unavailable.push(key);
    else if (counter.value >= threshold) reasons.push(key);
  }
  if (operatorRequest && policy.operator_request_enabled) reasons.push("operator_request");
  return {
    status: policy.enabled && reasons.length ? "checkpoint_required" : "continue_current_context",
    policy_digest: canonicalDigest(policy), policy_id: policy.policy_id, policy_revision: policy.revision,
    trigger_reasons: policy.enabled ? reasons : [], unavailable_signals: unavailable,
  };
}

/** Sum native work across every context, including the original. Wall time is
 * measured independently around the WHOLE experiment, never a sum of sessions.
 * Unknown segments prevent a complete total; no unavailable value becomes zero.
 */
export function combineRuntimeObservations(observations, { startedAtMs = null, finishedAtMs = null } = {}) {
  if (!Array.isArray(observations) || observations.length < 1 || observations.length > 33) throw new Error("RUNTIME_SEGMENTS_INVALID");
  for (const value of observations) assertRolloverArtifact(value, "ask_runtime_observation");
  const first = observations[0];
  if (observations.some(value => value.adapter_id !== first.adapter_id || value.runtime_policy_digest !== first.runtime_policy_digest)) throw new Error("RUNTIME_SEGMENT_POLICY_MISMATCH");
  const result = emptyRuntimeObservation({ adapterId: first.adapter_id, runtimePolicyDigest: first.runtime_policy_digest });
  function sum(counters, unit) {
    if (counters.some(counter => counter.status !== "observed")) return unavailableCounter(unit);
    const value = counters.reduce((total, counter) => total + counter.value, 0);
    return observedCounter(value, unit, "runner", counters.every(completeCounter) ? "complete" : "partial");
  }
  for (const [key, unit] of Object.entries(COUNTER_UNITS)) {
    if (key !== "wall_time_ms") result.counters[key] = sum(observations.map(value => value.counters[key]), unit);
  }
  if (startedAtMs !== null || finishedAtMs !== null) {
    if (!Number.isSafeInteger(startedAtMs) || !Number.isSafeInteger(finishedAtMs) || startedAtMs < 0 || finishedAtMs < startedAtMs) throw new Error("RUNTIME_WALL_CLOCK_INVALID");
    result.counters.wall_time_ms = observedCounter(finishedAtMs - startedAtMs, "ms", "runner");
  }
  for (const key of REWORK_REASONS) result.rework_reason_counts[key] = sum(observations.map(value => value.rework_reason_counts[key]), "count");
  return assertRolloverArtifact(result, "ask_runtime_observation");
}

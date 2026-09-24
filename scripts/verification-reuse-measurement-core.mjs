import { createHash } from "node:crypto";

export const QUALITY_KEYS = Object.freeze([
  "missed_requirements", "missed_blockers", "stale_evidence_acceptance",
  "false_completion", "unsafe_action", "scope_deviation", "false_positive_findings",
  "required_independent_judgment_omission",
]);
export const TOKEN_KEYS = Object.freeze(["input_tokens", "cached_tokens", "output_tokens"]);
export const digest = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
export const unavailable = (reason = "runtime_unavailable") => ({ status: "unavailable", value: null, reason });
export function observed(value, reason = "runtime_observation") {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid native-unit observation");
  return { status: "observed", value, reason };
}
export function closed(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`invalid ${label}`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)
    || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"))) throw new Error(`invalid ${label}`);
  return value;
}
export function setOfStrings(value, allowed, label) {
  if (!Array.isArray(value) || value.length > 256 || new Set(value).size !== value.length
    || value.some((item) => typeof item !== "string" || !allowed.includes(item))) throw new Error(`invalid ${label}`);
  return value;
}
export function measurementSum(values) {
  if (!Array.isArray(values) || !values.length) return unavailable("no_observations");
  for (const value of values) {
    closed(value, ["status", "value", "reason"], "measurement");
    if (value.status === "unavailable" && value.value === null) continue;
    if (value.status !== "observed") throw new Error("invalid measurement status");
    observed(value.value);
  }
  if (values.some((value) => value.status !== "observed")) return unavailable("partial_measurement");
  return observed(values.reduce((sum, value) => sum + value.value, 0), "sum_of_observations");
}
export function measurementDelta(baseline, reuse) {
  if (baseline.status !== "observed" || reuse.status !== "observed") return { status: "unavailable", value: null };
  return { status: "observed", value: reuse.value - baseline.value };
}

// Closed structured model output. No prose finding, raw prompt or transcript is retained.
export function reviewOutputSchema(request) {
  const strings = (values) => ({ type: "array", items: { type: "string", enum: values.length ? values : ["__none__"] }, maxItems: values.length, uniqueItems: true });
  const properties = {
    request_digest: { type: "string", const: request.request_digest },
    target_revision: { type: "string", const: request.target_revision },
    reviewed_paths: strings(request.paths),
    reviewed_obligations: strings(request.obligations.map((entry) => entry.ref)),
    judgment_refs: strings(request.judgment_refs),
    findings: { type: "array", maxItems: 32, items: {
      type: "object", additionalProperties: false,
      properties: {
        path: { type: "string", enum: request.paths },
        obligation_ref: { type: "string", enum: request.obligations.map((entry) => entry.ref) },
        severity: { type: "string", enum: ["blocker", "major", "minor"] },
      }, required: ["path", "obligation_ref", "severity"],
    } },
    decision: { type: "string", enum: ["pass", "block"] },
  };
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}
export function validateReview(result, request) {
  closed(result, Object.keys(reviewOutputSchema(request).properties), "review result");
  if (result.request_digest !== request.request_digest || result.target_revision !== request.target_revision) throw new Error("review transplant");
  setOfStrings(result.reviewed_paths, request.paths, "reviewed paths");
  setOfStrings(result.reviewed_obligations, request.obligations.map((entry) => entry.ref), "reviewed obligations");
  setOfStrings(result.judgment_refs, request.judgment_refs, "judgment refs");
  if (!Array.isArray(result.findings) || result.findings.length > 32) throw new Error("invalid findings");
  const unique = new Set();
  for (const finding of result.findings) {
    closed(finding, ["path", "obligation_ref", "severity"], "finding");
    const obligation = request.obligations.find((entry) => entry.ref === finding.obligation_ref);
    if (!obligation || !request.paths.includes(finding.path) || obligation.path !== finding.path
      || !["blocker", "major", "minor"].includes(finding.severity)) { const error = new Error("finding outside review scope"); error.code = "scope_deviation"; throw error; }
    const identity = `${finding.path}:${finding.obligation_ref}`;
    if (unique.has(identity)) throw new Error("duplicate finding");
    unique.add(identity);
  }
  if (!["pass", "block"].includes(result.decision)
    || (result.findings.some((finding) => ["blocker", "major"].includes(finding.severity)) && result.decision !== "block")) throw new Error("inconsistent review decision");
  return structuredClone(result);
}
export function assessReview({ request, result, expectedFindings, coverageStatus, executionCovered = true, qualityViolation = null }) {
  if (qualityViolation) {
    if (!["unsafe_action", "scope_deviation"].includes(qualityViolation)) throw new Error("unknown quality violation");
    // Other quality dimensions remain unobserved; do not manufacture zeroes.
    return { status: "fail", counts: null, violation: qualityViolation };
  }
  if (!result) return { status: "unavailable", counts: null };
  const counts = Object.fromEntries(QUALITY_KEYS.map((key) => [key, 0]));
  const expected = (finding) => expectedFindings.some((entry) => entry.path === finding.path && entry.obligation_ref === finding.obligation_ref && entry.severity === finding.severity);
  counts.missed_requirements = request.obligations.filter((entry) => !result.reviewed_obligations.includes(entry.ref) || !result.reviewed_paths.includes(entry.path)).length;
  counts.missed_blockers = expectedFindings.filter((entry) => entry.severity === "blocker" && !result.findings.some((finding) => finding.path === entry.path && finding.obligation_ref === entry.obligation_ref && finding.severity === "blocker")).length;
  counts.false_positive_findings = result.findings.filter((finding) => !expected(finding)).length;
  counts.required_independent_judgment_omission = request.judgment_refs.filter((ref) => !result.judgment_refs.includes(ref)).length;
  counts.stale_evidence_acceptance = !executionCovered && coverageStatus === "covered" ? 1 : 0;
  const shouldBlock = expectedFindings.length > 0 || counts.missed_requirements > 0 || counts.required_independent_judgment_omission > 0 || !executionCovered;
  counts.false_completion = shouldBlock && coverageStatus === "covered" ? 1 : 0;
  return { status: Object.values(counts).some((value) => value > 0) ? "fail" : "pass", counts };
}

export function summarizeCondition(rows) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const completeQuality = rows.length > 0 && rows.every((row) => row.quality.status !== "unavailable" && row.quality.counts !== null);
  const quality = { status: "unavailable", counts: null };
  if (rows.some((row) => row.quality.status === "fail")) quality.status = "fail";
  else if (completeQuality) quality.status = "pass";
  if (completeQuality) quality.counts = Object.fromEntries(QUALITY_KEYS.map((key) => [key, rows.reduce((total, row) => total + row.quality.counts[key], 0)]));
  return {
    recorded_cells: rows.length, required_gate_count: sum("required_gate_count"),
    reuse_exact: sum("reuse_exact"), reuse_scoped: sum("reuse_scoped"), rerun_required: sum("rerun_required"),
    blocked_uncovered: sum("blocked_uncovered"),
    deterministic_gate_executions: sum("deterministic_gate_executions"), verification_attempts: sum("verification_attempts"),
    review_dispatches: sum("review_dispatches"), ai_review_requests: measurementSum(rows.map((row) => row.ai_review_requests)),
    ...Object.fromEntries(TOKEN_KEYS.map((key) => [key, measurementSum(rows.map((row) => row[key]))])),
    elapsed_time: measurementSum(rows.map((row) => row.elapsed_time)),
    deterministic_elapsed_ms: measurementSum(rows.map((row) => row.deterministic_elapsed_ms)),
    independent_judgments: measurementSum(rows.map((row) => row.independent_judgments)),
    quality_outcomes: { ...quality, violations: [...new Set(rows.map((row) => row.quality.violation).filter(Boolean))] },
  };
}
export function compareConditions(baseline, reuse, { live = false, complete = true } = {}) {
  const quality = baseline.quality_outcomes.status === "fail" || reuse.quality_outcomes.status === "fail" ? "fail"
    : baseline.quality_outcomes.status === "pass" && reuse.quality_outcomes.status === "pass" ? "pass" : "unavailable";
  const gateDelta = reuse.deterministic_gate_executions - baseline.deterministic_gate_executions;
  const difference = (a, b) => complete ? measurementDelta(a, b) : { status: "unavailable", value: null };
  const tokenDelta = Object.fromEntries(TOKEN_KEYS.map((key) => [key, difference(baseline[key], reuse[key])]));
  const aiDelta = difference(baseline.ai_review_requests, reuse.ai_review_requests);
  const benefit = gateDelta < 0 || (aiDelta.status === "observed" && aiDelta.value < 0);
  let decision = "insufficient evidence";
  if (quality === "fail") decision = "harmful";
  else if (complete && quality === "pass") {
    // A small fixture, even with live model execution, does not establish general product efficacy.
    if (benefit) decision = "bounded benefit";
    else if (gateDelta > 0 || (aiDelta.status === "observed" && aiDelta.value > 0)) decision = "harmful";
    else decision = "neutral";
  }
  return {
    gate_execution_delta: complete ? gateDelta : null, gate_execution_delta_status: complete ? "observed" : "unavailable", ai_request_delta: aiDelta,
    token_delta: tokenDelta, elapsed_delta: difference(baseline.elapsed_time, reuse.elapsed_time),
    quality_guardrail: quality, decision, live_model_evidence: live && complete && quality === "pass",
    issue_close_eligible: false, authorizes_action: false,
  };
}

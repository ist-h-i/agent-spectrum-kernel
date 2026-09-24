import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assessReview, compareConditions, digest, observed, summarizeCondition, TOKEN_KEYS, validateReview } from "./verification-reuse-measurement-core.mjs";

const request = { request_digest: digest("false-blocking-regression"), target_revision: "a".repeat(40),
  paths: ["src/limit.mjs"], obligations: [{ ref: "AC-limit", path: "src/limit.mjs" }], judgment_refs: ["delta:source-test"] };
const pass = () => ({ request_digest: request.request_digest, target_revision: request.target_revision,
  reviewed_paths: [...request.paths], reviewed_obligations: ["AC-limit"], judgment_refs: [...request.judgment_refs], findings: [], decision: "pass" });
const assess = (result, coverageStatus = "blocked", options = {}) => assessReview({ request, result, expectedFindings: [], coverageStatus, ...options });
function row(executions, quality) {
  return { required_gate_count: 2, reuse_exact: 0, reuse_scoped: 2 - executions, rerun_required: executions,
    blocked_uncovered: 0, deterministic_gate_executions: executions, verification_attempts: executions,
    review_dispatches: 1, ai_review_requests: observed(1),
    ...Object.fromEntries(TOKEN_KEYS.map((key) => [key, observed(10)])), elapsed_time: observed(100),
    deterministic_elapsed_ms: observed(20), independent_judgments: observed(1), quality };
}

test("core: a reasonless blocking review is a measured quality failure", () => {
  const result = validateReview({ ...pass(), decision: "block" }, request);
  for (const coverage of ["blocked", "covered"]) {
    const quality = assess(result, coverage);
    assert.equal(quality.status, "fail");
    assert.equal(quality.counts.false_blocking, 1);
    assert.equal(quality.counts.false_positive_findings, 0); // A decision is not an invented finding.
  }
});

test("core: unexpected blocked coverage fails even after a complete passing review", () => {
  const quality = assess(pass());
  assert.equal(quality.status, "fail");
  assert.equal(quality.counts.false_blocking, 1);
  assert.equal(quality.counts.false_completion, 0);
});

test("core: correct completion and required blocking are not false blocking", () => {
  assert.equal(assess(pass(), "covered").status, "pass");
  const finding = { path: "src/limit.mjs", obligation_ref: "AC-limit", severity: "blocker" };
  const expectedBlock = assess({ ...pass(), findings: [finding], decision: "block" }, "blocked", { expectedFindings: [finding] });
  assert.equal(expectedBlock.status, "pass");
  assert.equal(expectedBlock.counts.false_blocking, 0);
  assert.equal(assess({ ...pass(), judgment_refs: [] }).counts.false_blocking, 0);
  assert.equal(assess({ ...pass(), reviewed_obligations: [] }).counts.false_blocking, 0);
  assert.equal(assess(pass(), "blocked", { executionCovered: false }).counts.false_blocking, 0);
});

test("core: an absent review leaves false-blocking evidence unavailable", () => {
  assert.deepEqual(assess(null), { status: "unavailable", counts: null });
});

test("core: false blocking cannot become a cost success after aggregation", () => {
  const baseline = summarizeCondition([row(2, assess(pass(), "covered"))]);
  const reuse = summarizeCondition([row(0, assess({ ...pass(), decision: "block" }))]);
  assert.equal(reuse.quality_outcomes.counts.false_blocking, 1);
  for (const complete of [true, false]) {
    const compared = compareConditions(baseline, reuse, { complete });
    assert.equal(compared.quality_guardrail, "fail");
    assert.equal(compared.decision, "harmful");
    assert.equal(compared.issue_close_eligible, false);
  }
});

test("integration: reasonless blocking stops the real paired harness instead of claiming savings", async () => {
  const { fixtureReview, runMeasurement } = await import("./verification-reuse-measurement.mjs");
  const result = await runMeasurement({ provider: "fixture", repetitions: 1,
    reviewOverride: (input) => ({ ...fixtureReview(input), decision: "block" }) });
  const { validateJsonSchema } = await import("./execution-envelope.mjs");
  assert.deepEqual(validateJsonSchema(result, { schemaPath: fileURLToPath(new URL("../schemas/verification-reuse-measurement.schema.json", import.meta.url)) }), []);
  assert.equal(result.complete, false);
  assert.equal(result.stop_reason, "quality_regression");
  assert.equal(result.observed_cells, 1);
  assert.equal(result.rows[0].quality.counts.false_blocking, 1);
  assert.equal(result.rows[0].evaluation_coverage_status, "blocked");
  assert.equal(result.delta.decision, "harmful");
  assert.equal(result.delta.gate_execution_delta, null);
  assert.equal(result.issue_close_eligible, false);
  assert.ok(result.rows.every((entry) => entry.authorizes_action === false));
});

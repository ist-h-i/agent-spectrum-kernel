import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateJsonSchema } from "./execution-envelope.mjs";
import { fixtureReview, runMeasurement } from "./verification-reuse-measurement.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function validate(result) {
  assert.deepEqual(validateJsonSchema(result, { schemaPath: resolve(ROOT, "schemas/verification-reuse-measurement.schema.json") }), []);
  assert.equal(result.issue_close_eligible, false);
  assert.ok(result.rows.every((row) => row.authorizes_action === false && row.historical_state_is_current === false));
}

test("two counterbalanced A/B/C comparisons execute real gates, preserve coverage and transfer developer evidence", async (t) => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "ask-measurement-result-"));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const result = await runMeasurement({ provider: "fixture", repetitions: 2, outputDirectory });
  assert.equal(result.complete, true, JSON.stringify({ stop: result.stop_reason, cells: result.observed_cells }));
  validate(result);
  assert.equal(result.observed_cells, 12);
  assert.equal(result.baseline.deterministic_gate_executions, 12);
  assert.equal(result.reuse.deterministic_gate_executions, 6);
  assert.equal(result.delta.gate_execution_delta, -6);
  assert.equal(result.reuse.reuse_scoped, 6);
  assert.equal(result.baseline.review_dispatches, 6); assert.equal(result.reuse.review_dispatches, 4);
  assert.equal(result.baseline.ai_review_requests.value, 0); assert.equal(result.reuse.ai_review_requests.value, 0);
  assert.equal(result.baseline.input_tokens.value, null); assert.equal(result.reuse.elapsed_time.value, null);
  assert.equal(result.delta.quality_guardrail, "pass"); assert.equal(result.delta.decision, "bounded benefit");
  assert.equal(result.issue_decision, "insufficient evidence");
  for (const row of result.rows) {
    assert.equal(row.handoff.deterministic_reusable, 2);
    assert.equal(row.handoff.extra_executions, 0); assert.equal(row.handoff.approval_promoted, false);
    assert.equal(row.blocked_uncovered, 0); assert.equal(row.quality.status, "pass");
    if (row.revision === "C") {
      assert.equal(row.evaluation_coverage_status, "blocked");
      assert.equal(row.handoff.without_judgment_status, "blocked");
      assert.equal(row.review_result.findings.length, 1);
      if (row.condition === "reuse") assert.deepEqual(row.request.paths, ["src/limit.mjs"]);
    } else assert.equal(row.evaluation_coverage_status, "covered");
    if (row.revision === "B" && row.condition === "reuse") {
      assert.equal(row.review_mode, "baseline_reference"); assert.equal(row.review_result, null);
      assert.ok(row.prior_baseline_digest);
    }
  }
  const plan = JSON.parse(readFileSync(join(outputDirectory, "plan.json"), "utf8"));
  assert.deepEqual(plan.condition_orders, [["baseline", "reuse"], ["reuse", "baseline"]]);
  assert.equal(plan.initial_acquisition, "included_in_each_condition");
  assert.equal(readdirSync(outputDirectory).length, 14);
  assert.deepEqual(JSON.parse(readFileSync(join(outputDirectory, "result.json"), "utf8")), result);
  for (const file of readdirSync(outputDirectory)) {
    const text = readFileSync(join(outputDirectory, file), "utf8");
    assert.ok(!text.includes("export const withinLimit"));
    assert.ok(!text.includes("test-fixture-not-a-credential"));
    assert.ok(!text.includes("privateKey"));
  }
  await assert.rejects(runMeasurement({ provider: "fixture", outputDirectory }));
  // Compare repeat-native counts, not random key/revision IDs or wall-clock noise.
  const logical = (repeat) => result.rows.filter((row) => row.repetition === repeat)
    .sort((a, b) => `${a.revision}:${a.condition}`.localeCompare(`${b.revision}:${b.condition}`))
    .map((row) => [row.revision, row.condition, row.deterministic_gate_executions, row.review_mode, row.quality]);
  assert.deepEqual(logical(1), logical(2));
});

test("missing AI provider does not establish a semantic baseline or report unknown telemetry as zero", async () => {
  const result = await runMeasurement({ provider: "unavailable", repetitions: 1 });
  assert.equal(result.complete, true, result.stop_reason); validate(result);
  assert.equal(result.delta.decision, "insufficient evidence");
  assert.equal(result.delta.quality_guardrail, "unavailable");
  assert.equal(result.reuse.review_dispatches, 3);
  assert.equal(result.reuse.input_tokens.value, null); assert.equal(result.reuse.independent_judgments.value, null);
  assert.ok(result.rows.every((row) => row.evaluation_coverage_status === "blocked" && row.prior_baseline_digest === null));
});

test("unconditional independent judgment is never reused even for unchanged semantic material", async () => {
  const result = await runMeasurement({ provider: "fixture", repetitions: 1, independent: true });
  assert.equal(result.complete, true, result.stop_reason); validate(result);
  const unchanged = result.rows.find((row) => row.condition === "reuse" && row.revision === "B");
  assert.equal(unchanged.deterministic_gate_executions, 0);
  assert.equal(unchanged.review_dispatches, 1);
  assert.ok(unchanged.request.judgment_refs.includes("gate:source-test"));
  assert.equal(unchanged.handoff.without_judgment_status, "blocked");
});

test("a missed blocker stops the comparison as harmful despite executed-gate savings", async () => {
  const result = await runMeasurement({ provider: "fixture", repetitions: 1,
    reviewOverride: (request) => ({ ...fixtureReview(request), findings: [], decision: "pass" }) });
  validate(result);
  assert.equal(result.complete, false); assert.equal(result.stop_reason, "quality_regression");
  assert.equal(result.delta.decision, "harmful"); assert.equal(result.delta.quality_guardrail, "fail");
  assert.ok(result.rows.some((row) => row.quality.counts?.missed_blockers === 1));
});

test("fake provider failure preserves only completed cells and never fabricates remaining measurements", async () => {
  let calls = 0;
  const result = await runMeasurement({ provider: "fixture", repetitions: 1,
    reviewOverride: (request) => { if (++calls === 2) throw new Error("private provider failure sentinel"); return fixtureReview(request); } });
  validate(result);
  assert.equal(result.complete, false); assert.equal(result.observed_cells, 2);
  assert.equal(result.delta.decision, "insufficient evidence");
  assert.equal(result.delta.gate_execution_delta, null);
  assert.ok(!JSON.stringify(result).includes("private provider failure sentinel"));
});

test("partial model judgments cannot establish the initial baseline", async () => {
  const result = await runMeasurement({ provider: "fixture", repetitions: 1,
    reviewOverride: (request) => ({ ...fixtureReview(request), judgment_refs: [] }) });
  validate(result); assert.equal(result.stop_reason, "quality_regression");
  assert.equal(result.rows[0].evaluation_coverage_status, "blocked");
  assert.equal(result.rows[0].quality.counts.required_independent_judgment_omission, 1);
});

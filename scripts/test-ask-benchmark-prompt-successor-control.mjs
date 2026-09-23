import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticPreparation, syntheticDigest } from "./test-prompt-successor-fixtures.mjs";
import { captureSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";
import { evaluateSuccessorCollection } from "./ask-benchmark-prompt-successor-control.mjs";

const preparation = syntheticPreparation();
function usage(total) {
  const stdout = `{"type":"turn.started"}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: total, output_tokens: 0, cached_input_tokens: 0 } })}\n`;
  return captureSuccessorUsage({ stdout, status: 0 });
}
function records(count = 0, total = 10) {
  return preparation.cases.map(({ case_id }, index) => index < count
    ? { case_id, status: "completed", attempt_count: 1, request_digest: syntheticDigest(`request-${index}`), result_digest: syntheticDigest(`result-${index}`), commit_digest: syntheticDigest(`commit-${index}`), duration_ms: 10, workspace_evidence: "captured", usage: usage(total) }
    : { case_id, status: "pending", attempt_count: 0, request_digest: null, result_digest: null, commit_digest: null, duration_ms: null, workspace_evidence: "unavailable", usage: null });
}
const evaluate = (cases) => evaluateSuccessorCollection({ preparation, cases });

test("exact pending inventory proposes only case 1 without granting execution authority", () => {
  const result = evaluate(records());
  assert.equal(result.next_case_id, preparation.cases[0].case_id);
  assert.equal(result.status, "ready_for_authorized_claim");
  assert.equal(result.execution_authorized, false);
  assert.equal(result.measured_decision_authorized, false);
  assert.deepEqual(result.total_tokens, { status: "known", value: 0, reason: null });
});

test("rederives the terminal prefix and next case instead of accepting a progress counter", () => {
  const result = evaluate(records(4));
  assert.equal(result.terminal_count, 4); assert.equal(result.next_case_id, preparation.cases[4].case_id);
  assert.equal(result.total_tokens.value, 40);
  assert.throws(() => evaluateSuccessorCollection({ preparation, cases: records(4), completed_count: 28 }));
});

for (const [name, mutate] of [
  ["missing case", (c) => c.pop()], ["replacement", (c) => { c[0].case_id = "replacement"; }],
  ["duplicate", (c) => { c[1] = structuredClone(c[0]); }],
  ["out of order", (c) => { [c[0], c[1]] = [c[1], c[0]]; }],
  ["terminal after pending gap", (c) => { c[1] = records(2)[1]; }],
  ["retry", (c) => { c[0] = records(1)[0]; c[0].attempt_count = 2; }],
  ["executed pending case", (c) => { c[0].attempt_count = 1; }],
  ["pending with result", (c) => { c[0].result_digest = syntheticDigest("fake"); }],
  ["terminal without request", (c) => { c[0] = records(1)[0]; c[0].request_digest = null; }],
  ["unexpected field", (c) => { c[0].approved = true; }],
]) test(`rejects ${name}`, () => {
  const cases = records(); mutate(cases); assert.throws(() => evaluate(cases));
});

test("250k per-trial warning and 3M cumulative warning do not abort a completed trial", () => {
  const result = evaluate(records(12, 250000));
  assert.equal(result.status, "ready_for_authorized_claim");
  assert.equal(result.terminal_count, 12); assert.equal(result.total_tokens.value, 3000000);
  assert.equal(result.warnings.filter((w) => w.code === "trial_token_warning").length, 12);
  assert.ok(result.warnings.some((w) => w.code === "cumulative_token_warning"));
});

test("5M equality and overshoot retain the just-completed trial and prohibit another claim", () => {
  for (const tokens of [250000, 250001]) {
    const result = evaluate(records(20, tokens));
    assert.equal(result.terminal_count, 20); assert.equal(result.status, "stopped");
    assert.equal(result.next_case_id, null); assert.ok(result.stop_reasons.includes("token_budget_escalation"));
  }
});

test("completed trials after a prior budget stop are a protocol violation", () => {
  assert.throws(() => evaluate(records(21, 250000)), /after.*stop/u);
});

test("unknown telemetry is never summed as zero, and blocks the next claim", () => {
  const cases = records(2); cases[1].usage = null;
  const result = evaluate(cases);
  assert.equal(result.status, "stopped"); assert.equal(result.next_case_id, null);
  assert.deepEqual(result.total_tokens, { status: "unknown", value: null, reason: "trial_usage_unavailable" });
  assert.equal(result.observed_token_lower_bound, 10);
  assert.ok(result.stop_reasons.includes("trial_usage_unavailable"));
});

test("ordinary failure remains terminal and is not retried when usage and workspace evidence are known", () => {
  const cases = records(1); cases[0].status = "failed";
  const result = evaluate(cases);
  assert.equal(result.next_case_id, preparation.cases[1].case_id);
  assert.equal(result.cases[0].status, "failed"); assert.equal(result.terminal_count, 1);
});

for (const [name, mutate, reason] of [
  ["interruption", (c) => { c.status = "interrupted"; }, "execution_uncertain"],
  ["provider/runtime unavailable", (c) => { c.status = "unavailable"; }, "runtime_unavailable"],
  ["invalid execution", (c) => { c.status = "invalid"; }, "execution_invalid"],
  ["workspace uncertainty", (c) => { c.workspace_evidence = "unavailable"; }, "workspace_evidence_unavailable"],
  ["missing duration", (c) => { c.duration_ms = null; }, "duration_unavailable"],
  ["timeout boundary", (c) => { c.duration_ms = 900000; }, "timeout_boundary"],
]) test(`${name} stops before the next case`, () => {
  const cases = records(1); mutate(cases[0]);
  const result = evaluate(cases); assert.equal(result.status, "stopped");
  assert.ok(result.stop_reasons.includes(reason)); assert.equal(result.next_case_id, null);
});

test("an active claim remains uncertain; never reinterpret it as pending or retryable", () => {
  const cases = records(); cases[0].status = "active"; cases[0].attempt_count = 1;
  const result = evaluate(cases);
  assert.equal(result.terminal_count, 0); assert.equal(result.status, "stopped");
  assert.equal(result.next_case_id, null); assert.ok(result.stop_reasons.includes("execution_uncertain"));
});

test("all 28 terminal cases are collection completion, not scoring/evaluation/activation", () => {
  const result = evaluate(records(28)); assert.equal(result.status, "collected");
  assert.equal(result.terminal_count, 28); assert.equal(result.next_case_id, null);
  assert.equal(result.measured_decision_authorized, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPragmaticEvaluationReport } from "./ask-pragmatic-evaluation-report.mjs";

const template = () => JSON.parse(readFileSync(new URL("../docs/fixtures/pragmatic-evaluation/notes-template.json", import.meta.url)));
const measured = () => {
  const notes = template();
  notes.evidence_kind = "synthetic"; // Test data, never a measured task claim.
  notes.trials.forEach((trial, index) => Object.assign(trial, {
    execution_state: "completed", outcome: "pass", evidence_refs: [`synthetic-task-${index}`],
    task_ref: "public-task", input_ref: "public-input", success_criteria_ref: "ten-requirements-v1",
    cli_version: `example-${index}`, model: index === 2 ? "example-model-b" : "example-model-a", reasoning: "medium",
    platform: "example-platform", global_context_ref: null,
    metrics: { duration_ms: 100 + index * 20, human_review_minutes: 3, rework_minutes: index,
      input_tokens: 1000, output_tokens: 100 + index, cached_tokens: 0 },
  }));
  return notes;
};

test("plan stays unstarted/unknown and cannot imply measured value or permission", () => {
  const notes = template(), before = structuredClone(notes);
  const report = buildPragmaticEvaluationReport(notes);
  assert.deepEqual(notes, before);
  assert.equal(report.evidence_kind, "plan");
  assert.ok(report.blocks[0].trials.every(trial => trial.outcome === "unknown" && trial.execution_state === "not_started"));
  assert.ok(report.summaries.every(summary => summary.metrics.duration_ms.distribution.distribution_status === "insufficient_evidence"));
  for (const key of ["execution_authority", "formal_experiment_completion", "release_gate_pass", "causal_effect_claim", "evaluator_verification_performed"]) assert.equal(report.limitations[key], false);
});

test("global unknown/ASK presence and CLI/model differences retain observations without granting equivalence", () => {
  for (const ask_presence of ["unknown", "observed", "not_observed"]) {
    const notes = measured(); notes.global_context.ask_presence = ask_presence;
    const report = buildPragmaticEvaluationReport(notes), contrast = report.blocks[0].contrasts[1];
    assert.equal(report.limitations.global_ask_presence, ask_presence);
    assert.match(report.plain_scope, /global ASK is not excluded/u);
    assert.ok(contrast.differences.some(diff => diff.field === "cli_version"));
    assert.ok(contrast.differences.some(diff => diff.field === "model"));
    assert.ok(contrast.unknown_fields.includes("global_context_ref"));
    assert.equal(contrast.metric_differences.duration_ms, 20);
    assert.equal(report.evidence_kind, "synthetic");
  }
});

test("different tasks/criteria retain separate outcomes and do not pool quality or resources", () => {
  const notes = measured();
  notes.planned_blocks.push("cycle-2");
  const second = structuredClone(notes.trials);
  second.forEach(trial => Object.assign(trial, { block_id: "cycle-2", task_ref: "different-task", success_criteria_ref: "different-criteria" }));
  notes.trials.push(...second);
  notes.trials[2].success_criteria_ref = "different-criteria";
  const report = buildPragmaticEvaluationReport(notes);
  assert.equal(report.summaries.length, 6);
  assert.equal(report.blocks[0].contrasts[1].task_and_criteria_match, false);
  assert.match(report.blocks[0].contrasts[1].interpretation, /arithmetic only/u);
  assert.ok(report.summaries.every(summary => summary.block_ids.length === 1));
});

test("unknown identities stay separate across blocks and blank context is refused", () => {
  const notes = measured();
  notes.planned_blocks.push("cycle-2");
  notes.trials.forEach(trial => {
    trial.task_ref = null; trial.input_ref = null; trial.success_criteria_ref = null;
  });
  notes.trials.push(...structuredClone(notes.trials).map(trial => ({ ...trial, block_id: "cycle-2" })));
  const report = buildPragmaticEvaluationReport(notes);
  assert.equal(report.summaries.length, 6);
  assert.ok(report.summaries.every(summary => summary.block_ids.length === 1));
  assert.ok(report.blocks.every(block => block.contrasts.every(item => !item.task_and_criteria_match)));
  for (const field of ["task_ref", "input_ref", "success_criteria_ref", "cli_version", "model", "reasoning", "platform", "global_context_ref"]) {
    for (const value of ["", " \t\n"]) {
      const blank = structuredClone(notes); blank.trials[0][field] = value;
      assert.throws(() => buildPragmaticEvaluationReport(blank), /non-empty text or null/u, `${field}: ${JSON.stringify(value)}`);
    }
  }
});

test("failed/stopped and missing planned slots survive; null usage is not filled with zero", () => {
  const notes = measured();
  Object.assign(notes.trials[1], { execution_state: "stopped", outcome: "unknown", stop_reason: "synthetic timeout" });
  notes.trials[1].metrics.output_tokens = null;
  Object.assign(notes.trials[0], { execution_state: "failed", outcome: "fail", stop_reason: "synthetic regression" });
  notes.trials.pop();
  const report = buildPragmaticEvaluationReport(notes);
  assert.equal(report.blocks[0].trials.length, 3);
  assert.deepEqual(report.blocks[0].trials.map(trial => trial.execution_state), ["failed", "stopped", "not_started"]);
  assert.equal(report.blocks[0].trials[0].outcome, "fail");
  assert.equal(report.blocks[0].trials[2].metrics.duration_ms, null);
  assert.equal(report.blocks[0].contrasts[0].metric_differences.output_tokens, null);
});

test("existing distribution summarizes complete strata and marks partial telemetry insufficient", () => {
  const notes = measured();
  notes.planned_blocks.push("cycle-2");
  const second = structuredClone(notes.trials);
  second.forEach(trial => { trial.block_id = "cycle-2"; trial.metrics.duration_ms += 100; });
  second[0].metrics.output_tokens = null;
  notes.trials.push(...second);
  const summary = buildPragmaticEvaluationReport(notes).summaries.find(row => row.condition === "plain");
  assert.equal(summary.metrics.duration_ms.distribution.median, 150);
  assert.equal(summary.metrics.duration_ms.distribution.minimum, 100);
  assert.equal(summary.metrics.duration_ms.distribution.maximum, 200);
  assert.equal(summary.metrics.output_tokens.observed_count, 1);
  assert.equal(summary.metrics.output_tokens.unknown_count, 1);
  assert.deepEqual(summary.metrics.output_tokens.known_values, [100]);
  assert.equal(summary.metrics.output_tokens.distribution.mean, null);
  assert.equal(summary.metrics.cached_tokens.distribution.mean, 0);
});

test("old results, replaced slots, invented passes and invalid measurements are refused", () => {
  assert.throws(() => buildPragmaticEvaluationReport({ kind: "ask_three_arm_model_free_protocol_v1" }), /old protocol/u);
  const duplicate = measured(); duplicate.trials.push(structuredClone(duplicate.trials[0]));
  assert.throws(() => buildPragmaticEvaluationReport(duplicate), /duplicate slot/u);
  const pass = template(); pass.trials[0].outcome = "pass";
  assert.throws(() => buildPragmaticEvaluationReport(pass), /unstarted/u);
  const invalid = measured(); invalid.trials[0].metrics.input_tokens = -1;
  assert.throws(() => buildPragmaticEvaluationReport(invalid), /non-negative/u);
  const noEvidence = measured(); noEvidence.trials[0].evidence_refs = [];
  assert.throws(() => buildPragmaticEvaluationReport(noEvidence), /evidence references/u);
});

test("CLI reads supplied notes only, leaves bytes/directories unchanged and rejects duplicate keys", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-pragmatic-report-")));
  try {
    const path = join(root, "notes.json"), bytes = JSON.stringify(measured());
    writeFileSync(path, bytes, { mode: 0o600 });
    const argv = [new URL("./ask-pragmatic-evaluation-report.mjs", import.meta.url).pathname, path];
    const result = spawnSync(process.execPath, argv, { encoding: "utf8", shell: false, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).evidence_kind, "synthetic");
    assert.equal(readFileSync(path, "utf8"), bytes);
    assert.deepEqual(readdirSync(root), ["notes.json"]);
    writeFileSync(path, '{"kind":"one","kind":"two"}');
    const refused = spawnSync(process.execPath, argv, { encoding: "utf8", shell: false, timeout: 30000 });
    assert.equal(refused.status, 1); assert.equal(refused.stdout, "");
    assert.match(refused.stderr, /duplicate/iu);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

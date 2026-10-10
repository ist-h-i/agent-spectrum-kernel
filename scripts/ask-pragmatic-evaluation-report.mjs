#!/usr/bin/env node
// Descriptive local notes only: no execution, admission, regrading or release authority.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { derivePortfolioDistribution } from "./ask-benchmark-portfolio-repetition-report.mjs";

const CONDITIONS = ["plain", "kernel_only", "full_ask"];
const OUTCOMES = ["pass", "unknown", "fail"];
const STATES = ["not_started", "completed", "failed", "stopped"];
const METRICS = ["duration_ms", "human_review_minutes", "rework_minutes", "input_tokens", "output_tokens", "cached_tokens"];
const CONTEXT = ["task_ref", "input_ref", "success_criteria_ref", "cli_version", "model", "reasoning", "platform", "global_context_ref"];
const clone = value => structuredClone(value);
const known = value => typeof value === "number" && Number.isFinite(value);

function checkTrial(trial, blocks) {
  assert.ok(blocks.includes(trial.block_id) && CONDITIONS.includes(trial.condition), "trial must name a planned block and condition");
  assert.ok(STATES.includes(trial.execution_state) && OUTCOMES.includes(trial.outcome), "invalid execution state or outcome");
  assert.ok(Array.isArray(trial.evidence_refs) && trial.evidence_refs.every(ref => typeof ref === "string" && ref.length > 0), "evidence_refs must be reference labels");
  assert.ok(typeof trial.local_assets_ref === "string" || trial.local_assets_ref === null, "local_assets_ref must be a label or null");
  for (const field of CONTEXT) assert.ok(trial[field] === null
    || (typeof trial[field] === "string" && trial[field].trim().length > 0), `${field} must be non-empty text or null (unknown)`);
  for (const field of METRICS) assert.ok(trial.metrics?.[field] === null || (known(trial.metrics?.[field]) && trial.metrics[field] >= 0), `${field} must be non-negative or null`);
  if (trial.execution_state === "not_started") {
    assert.equal(trial.outcome, "unknown", "unstarted trial cannot have a task outcome");
    assert.ok(METRICS.every(field => trial.metrics[field] === null), "unstarted metrics must remain unknown");
  }
  if (trial.outcome === "pass") {
    assert.equal(trial.execution_state, "completed", "pass requires completed execution");
    assert.ok(trial.evidence_refs.length > 0, "reported pass requires evidence references, not certification by this tool");
  }
  if (["failed", "stopped"].includes(trial.execution_state)) assert.ok(typeof trial.stop_reason === "string" && trial.stop_reason.length > 0, "failure/stop must retain its reason");
}

function missingTrial(block_id, condition) {
  return { block_id, condition, execution_state: "not_started", outcome: "unknown", evidence_refs: [], local_assets_ref: null,
    ...Object.fromEntries(CONTEXT.map(field => [field, null])), metrics: Object.fromEntries(METRICS.map(field => [field, null])),
    stop_reason: "planned slot has no supplied observation" };
}

function contrast(left, right) {
  const differences = CONTEXT.filter(field => left[field] !== null && right[field] !== null && left[field] !== right[field])
    .map(field => ({ field, baseline: left[field], comparison: right[field] }));
  const unknown_fields = CONTEXT.filter(field => left[field] === null || right[field] === null);
  const sameTask = ["task_ref", "input_ref", "success_criteria_ref"].every(field => left[field] !== null && left[field] === right[field]);
  return { contrast: `${right.condition}-${left.condition}`, reported_outcomes: [left.outcome, right.outcome],
    task_and_criteria_match: sameTask, differences, unknown_fields,
    interpretation: sameTask ? "descriptive within this task; environment differences and unknowns may explain the result"
      : "task/input/criteria equivalence unestablished; retain separate outcomes; resource subtraction is arithmetic only",
    metric_differences: Object.fromEntries(METRICS.map(field => [field,
      known(left.metrics[field]) && known(right.metrics[field]) ? right.metrics[field] - left.metrics[field] : null])) };
}

/** Supplied notes are observations to review, never verified evaluator results. */
export function buildPragmaticEvaluationReport(notes) {
  assert.equal(notes.kind, "ask_pragmatic_evaluation_notes_v1", "not pragmatic notes; old protocol/result objects are not converted");
  assert.ok(["plan", "synthetic", "observed"].includes(notes.evidence_kind), "evidence_kind must distinguish plan, synthetic and observed notes");
  assert.ok(Array.isArray(notes.planned_blocks) && notes.planned_blocks.length > 0
    && notes.planned_blocks.every(id => typeof id === "string" && id.length > 0)
    && new Set(notes.planned_blocks).size === notes.planned_blocks.length, "planned blocks must be unique non-empty labels");
  assert.ok(Array.isArray(notes.trials), "trials must be an array");
  assert.ok(["unknown", "observed", "not_observed"].includes(notes.global_context?.ask_presence), "global ASK presence must stay explicit");
  assert.ok(["unknown", "observed", "none_observed"].includes(notes.global_context?.change_status), "global change status must stay explicit");
  assert.ok(typeof notes.next_improvement === "string", "next_improvement must retain the operator's next action or undecided note");
  const supplied = new Map();
  for (const trial of notes.trials) {
    checkTrial(trial, notes.planned_blocks);
    const key = JSON.stringify([trial.block_id, trial.condition]);
    assert.ok(!supplied.has(key), "duplicate slot; record another attempt under a new block instead of replacing an outcome");
    supplied.set(key, clone(trial));
  }
  const blocks = notes.planned_blocks.map(block_id => {
    const trials = CONDITIONS.map(condition => supplied.get(JSON.stringify([block_id, condition])) ?? missingTrial(block_id, condition));
    return { block_id, trials, contrasts: [contrast(trials[0], trials[1]), contrast(trials[1], trials[2]), contrast(trials[0], trials[2])] };
  });
  // Keep task/input/rubric strata separate; unknown identities never form a pool.
  const groups = new Map();
  for (const { block_id, trials } of blocks) for (const trial of trials) {
    const refs = [trial.task_ref, trial.input_ref, trial.success_criteria_ref];
    const key = JSON.stringify([trial.condition, ...refs, refs.includes(null) ? block_id : null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trial);
  }
  const summaries = [...groups.values()].map(trials => ({ condition: trials[0].condition,
    task_ref: trials[0].task_ref, input_ref: trials[0].input_ref, success_criteria_ref: trials[0].success_criteria_ref,
    block_ids: trials.map(trial => trial.block_id),
    reported_outcome_counts: Object.fromEntries(OUTCOMES.map(state => [state, trials.filter(trial => trial.outcome === state).length])),
    execution_state_counts: Object.fromEntries(STATES.map(state => [state, trials.filter(trial => trial.execution_state === state).length])),
    metrics: Object.fromEntries(METRICS.map(field => {
      const values = trials.map(trial => trial.metrics[field]);
      const knownValues = values.filter(known);
      return [field, { observed_count: knownValues.length, unknown_count: values.length - knownValues.length,
        known_values: knownValues, distribution: derivePortfolioDistribution(values, values.length, `pragmatic ${field}`) }];
    })) }));
  return { kind: "ask_pragmatic_evaluation_report_v1", evidence_kind: notes.evidence_kind,
    supplied_notes: clone(notes), blocks, summaries,
    plain_scope: "project-local ASK absent by design; global ASK is not excluded, whether observed or unknown",
    limitations: { global_ask_presence: notes.global_context.ask_presence, global_change_status: notes.global_context.change_status,
      environment_differences_are_not_automatic_stops: true, usage_unknown_is_not_zero: true,
      causal_effect_claim: false, generalized_product_value_claim: false, evaluator_verification_performed: false,
      execution_authority: false, formal_experiment_completion: false, release_gate_pass: false },
    next_improvement: notes.next_improvement };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, "usage: node scripts/ask-pragmatic-evaluation-report.mjs /absolute/local-notes.json");
    const bytes = readStableFile(process.argv[2], "local pragmatic notes", 1048576).bytes;
    const notes = parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    console.log(JSON.stringify(buildPragmaticEvaluationReport(notes), null, 2));
  } catch (error) {
    console.error(`Pragmatic report refused: ${error.message}`);
    process.exitCode = 1;
  }
}

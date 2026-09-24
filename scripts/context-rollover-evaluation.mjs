import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, readJsonFileStrict, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { inspectRolloverReceipt } from "./context-rollover.mjs";
import { assertRolloverArtifact, completeCounter, COUNTER_UNITS } from "./context-runtime-observation.mjs";

const SCHEMA = resolve(dirname(fileURLToPath(import.meta.url)), "../schemas/rollover-evaluation.schema.json");
export const QUALITY_COUNTERS = Object.freeze(["requirements_missed", "blockers_missed", "unsafe_attempts", "unsupported_completion_claims", "scope_deviations", "rework"]);
const GUARDRAIL_COUNTERS = Object.freeze(["rework", "resume_failures", "integration_conflicts"]);
const check = (value, kind) => assertRolloverArtifact(value, kind, SCHEMA);
const equalSet = (a, b) => canonicalDigest([...a].sort()) === canonicalDigest([...b].sort());
const fail = (code) => { throw new Error(code); };
const experimentPath = (store, protocol) => resolve(store, "rollover-evaluation", protocol.protocol_id);
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest, maximumBytes: 65536 }).value;
function publish(storeRoot, artifact) {
  const result = putContentAddressedJson({ storeRoot, artifact, maximumBytes: 65536 });
  if (canonicalDigest(read(storeRoot, result.digest)) !== result.digest) fail("EVALUATION_READBACK_FAILED");
  return result.digest;
}
export function freezeRolloverEvaluation({ storeRoot, protocol, policy }) {
  check(protocol, "ask_rollover_evaluation_protocol");
  assertRolloverArtifact(policy, "ask_context_rollover_policy");
  if (!policy.enabled || !policy.telemetry_enabled || protocol.policy_digest !== canonicalDigest(policy) || protocol.secondary_metrics.includes(protocol.primary_metric)) fail("EVALUATION_PROTOCOL_INVALID");
  publish(storeRoot, policy);
  const protocolDigest = publish(storeRoot, protocol);
  const frozen = writeCanonicalJsonNoReplace({ outputPath: resolve(experimentPath(storeRoot, protocol), "freeze.json"), artifact: { protocol_digest: protocolDigest } });
  return { protocol_digest: protocolDigest, created: frozen.created, next_action: "run_frozen_matched_conditions" };
}
function frozenProtocol(storeRoot, protocolDigest) {
  const protocol = check(read(storeRoot, protocolDigest), "ask_rollover_evaluation_protocol");
  const frozen = readJsonFileStrict(resolve(experimentPath(storeRoot, protocol), "freeze.json"), "frozen evaluation", 65536);
  if (canonicalDigest(frozen) !== canonicalDigest({ protocol_digest: protocolDigest })) fail("EVALUATION_NOT_FROZEN");
  return protocol;
}
function validateRun(protocol, run) {
  check(run, "ask_rollover_evaluation_run");
  if (run.protocol_digest !== canonicalDigest(protocol) || run.source_revision !== protocol.source_revision || run.task_digest !== protocol.task_digest ||
      run.observation.runtime_policy_digest !== protocol.runtime_policy_digest || run.repetition > protocol.repetitions) fail("EVALUATION_RUN_TRANSPLANT");
  if (run.condition === "baseline" && run.rollover_receipt_digests.length) fail("BASELINE_HAS_ROLLOVER_RECEIPT");
}
function validateReceipts(storeRoot, protocol, run) {
  for (const digest of run.rollover_receipt_digests) {
    const { binding, snapshot } = inspectRolloverReceipt({ storeRoot, receiptDigest: digest });
    if (binding.policy_digest !== protocol.policy_digest || binding.runtime_policy_digest !== protocol.runtime_policy_digest ||
        binding.scope_digest !== protocol.rollover_scope_digest || snapshot.repository?.head !== protocol.source_revision) fail("EVALUATION_RECEIPT_TRANSPLANT");
  }
}
/** Claim BEFORE the external runner starts, in frozen alternating condition order.
 * Crashes retain the claim; no retry or later slot may conceal an unfinished run. */
export function claimRolloverEvaluationRun({ storeRoot, protocolDigest, condition, repetition }) {
  const protocol = frozenProtocol(storeRoot, protocolDigest);
  const order = Array.from({ length: protocol.repetitions }, (_, i) => (i % 2 === 0 ? ["baseline", "rollover"] : ["rollover", "baseline"]).map(c => ({ condition: c, repetition: i + 1 }))).flat();
  const index = order.findIndex(slot => slot.condition === condition && slot.repetition === repetition);
  if (index < 0) fail("EVALUATION_SLOT_INVALID");
  const previous = [];
  for (const slot of order.slice(0, index)) {
    const reference = readJsonFileStrict(resolve(experimentPath(storeRoot, protocol), `${slot.condition}-${slot.repetition}.json`), "prior evaluation slot", 65536);
    const run = read(storeRoot, reference.run_digest);
    validateRun(protocol, run); validateReceipts(storeRoot, protocol, run);
    if (run.condition !== slot.condition || run.repetition !== slot.repetition) fail("EVALUATION_SLOT_TRANSPLANT");
    previous.push(run);
  }
  if (previous.length) {
    const report = evaluateRolloverRuns(protocol, previous);
    if (report.recommendation === "stop" || report.reasons.some(reason => /^(QUALITY_UNAVAILABLE|BUDGET_UNAVAILABLE|VERIFICATION_COVERAGE_UNAVAILABLE|ROLLOVER_EXECUTION_RECEIPT_MISSING|GUARDRAIL_COUNTER_UNAVAILABLE)/.test(reason))) fail("EVALUATION_STOP_BEFORE_NEXT_RUN");
  }
  const result = writeCanonicalJsonNoReplace({ outputPath: resolve(experimentPath(storeRoot, protocol), `claim-${condition}-${repetition}.json`), artifact: { protocol_digest: protocolDigest, condition, repetition } });
  if (!result.created) fail("EVALUATION_RUN_ALREADY_CLAIMED");
  return { status: "run_claimed", condition, repetition, protocol_digest: protocolDigest,
    limits: { wall_time_ms: protocol.maximum_run_wall_time_ms, uncached_input_tokens: protocol.maximum_run_uncached_tokens, required_human_decisions: protocol.maximum_run_human_decisions } };
}
export function recordRolloverEvaluationRun({ storeRoot, protocolDigest, run }) {
  const protocol = frozenProtocol(storeRoot, protocolDigest);
  validateRun(protocol, run);
  validateReceipts(storeRoot, protocol, run);
  const claim = readJsonFileStrict(resolve(experimentPath(storeRoot, protocol), `claim-${run.condition}-${run.repetition}.json`), "evaluation run claim", 65536);
  if (canonicalDigest(claim) !== canonicalDigest({ protocol_digest: protocolDigest, condition: run.condition, repetition: run.repetition })) fail("EVALUATION_CLAIM_MISMATCH");
  const runDigest = publish(storeRoot, run);
  // Immutable condition/repetition slot, not a cherry-picked latest result.
  const saved = writeCanonicalJsonNoReplace({ outputPath: resolve(experimentPath(storeRoot, protocol), `${run.condition}-${run.repetition}.json`), artifact: { run_digest: runDigest } });
  if (!saved.created) fail("EVALUATION_SLOT_ALREADY_RECORDED");
  return { run_digest: runDigest };
}

/** Bounded input evaluation, not model-quality grading or a product enablement grant. */
export function evaluateRolloverRuns(protocol, runs) {
  check(protocol, "ask_rollover_evaluation_protocol");
  if (!Array.isArray(runs) || runs.length > protocol.repetitions * 2) fail("EVALUATION_INVENTORY_INVALID");
  const receiptIds = new Set();
  const slots = new Map(), ids = new Set(), scopes = new Set(), adapters = new Set();
  const stop = [], missing = [], revise = [];
  for (const run of runs) {
    validateRun(protocol, run);
    const key = `${run.condition}:${run.repetition}`;
    if (slots.has(key) || ids.has(run.run_id)) fail("EVALUATION_DUPLICATE_RUN");
    for (const receipt of run.rollover_receipt_digests) { if (receiptIds.has(receipt)) fail("EVALUATION_RECEIPT_REUSED"); receiptIds.add(receipt); }
    slots.set(key, run); ids.add(run.run_id); scopes.add(run.evidence_scope); adapters.add(run.observation.adapter_id);
    if (run.terminal_status !== "completed") stop.push("RUN_NOT_COMPLETED");
    if (run.condition === "rollover" && run.rollover_receipt_digests.length === 0) missing.push("ROLLOVER_EXECUTION_RECEIPT_MISSING");
    for (const key of QUALITY_COUNTERS) {
      const c = run.quality[key];
      if (!completeCounter(c)) missing.push(`QUALITY_UNAVAILABLE:${key}`);
      // Known adverse observations dominate unknown efficiency or other quality.
      if (c.status === "observed" && key !== "rework" && c.value > 0) stop.push(`QUALITY_FAILURE:${key}`);
    }
    // Required safety observations must be complete before the next run, even
    // when the opposite condition has not yet produced a matched pair.
    for (const key of GUARDRAIL_COUNTERS) {
      if (!completeCounter(run.observation.counters[key])) missing.push(`GUARDRAIL_COUNTER_UNAVAILABLE:${key}`);
    }
    const coverage = run.verification_coverage;
    if (coverage.status !== "observed") missing.push("VERIFICATION_COVERAGE_UNAVAILABLE");
    else if (!equalSet(coverage.required_gate_refs, protocol.required_gate_refs) || !equalSet(coverage.verified_gate_refs, protocol.required_gate_refs)) stop.push("VERIFICATION_COVERAGE_LOST");
    for (const [key, limit] of [["wall_time_ms", protocol.maximum_run_wall_time_ms], ["uncached_input_tokens", protocol.maximum_run_uncached_tokens], ["required_human_decisions", protocol.maximum_run_human_decisions]]) {
      const c = run.observation.counters[key];
      if (!completeCounter(c)) missing.push(`BUDGET_UNAVAILABLE:${key}`);
      if (c.status === "observed" && c.value > limit) stop.push(`BUDGET_EXCEEDED:${key}`);
    }
  }
  if (scopes.size > 1 || adapters.size > 1) fail("EVALUATION_CONDITIONS_NOT_MATCHED");
  const comparisons = [];
  for (let repetition = 1; repetition <= protocol.repetitions; repetition++) {
    const baseline = slots.get(`baseline:${repetition}`), rollover = slots.get(`rollover:${repetition}`);
    if (!baseline || !rollover) { missing.push(`PAIR_MISSING:${repetition}`); continue; }
    if (completeCounter(baseline.quality.rework) && rollover.quality.rework.status === "observed" && rollover.quality.rework.value > baseline.quality.rework.value) stop.push("QUALITY_REGRESSION:rework");
    const metrics = {};
    for (const [key, unit] of Object.entries(COUNTER_UNITS)) {
      const b = baseline.observation.counters[key], r = rollover.observation.counters[key];
      const known = completeCounter(b) && completeCounter(r);
      metrics[key] = { unit, baseline: b, rollover: r, delta: known ? r.value - b.value : null, relative_reduction: known && b.value > 0 ? (b.value - r.value) / b.value : null };
    }
    const primary = metrics[protocol.primary_metric];
    if (primary.relative_reduction === null) missing.push("PRIMARY_METRIC_UNAVAILABLE_OR_ZERO_BASELINE");
    else if (primary.relative_reduction < protocol.minimum_relative_reduction) revise.push("PRIMARY_REDUCTION_NOT_MATERIAL");
    for (const key of protocol.secondary_metrics) {
      const metric = metrics[key];
      if (metric.delta === null) missing.push(`SECONDARY_METRIC_UNAVAILABLE:${key}`);
      else if (metric.delta > metric.baseline.value * protocol.maximum_secondary_regression) revise.push(`SECONDARY_REGRESSION:${key}`);
    }
    // Native rework/conflict/failure counts cannot be traded for faster time.
    for (const key of GUARDRAIL_COUNTERS) {
      const m = metrics[key];
      // Partial capture is a lower bound: a known excess already proves harm.
      if (completeCounter(m.baseline) && m.rollover.status === "observed" && m.rollover.value > m.baseline.value) stop.push(`GUARDRAIL_REGRESSION:${key}`);
    }
    comparisons.push({ repetition, metrics });
  }
  return {
    artifact_kind: "ask_rollover_evaluation_report", schema_version: "1.0.0", protocol_digest: canonicalDigest(protocol),
    recommendation: stop.length ? "stop" : missing.length ? "insufficient_evidence" : revise.length ? "revise" : "retain",
    reasons: [...new Set([...stop, ...missing, ...revise])].sort(), comparisons,
    source_inventory: runs.map((run) => ({ digest: canonicalDigest(run), run_id: run.run_id, condition: run.condition, repetition: run.repetition })),
    evidence_scope: scopes.size ? [...scopes][0] : "unavailable", observed_pairs: comparisons.length, required_pairs: protocol.repetitions,
    measurement_authenticity: "requires_external_runner_evidence", operational_enablement_authority: false,
    statistic: "all_matched_pairs_must_satisfy_frozen_thresholds",
  };
}
export function evaluateStoredRolloverRuns({ storeRoot, protocolDigest }) {
  const protocol = frozenProtocol(storeRoot, protocolDigest), runs = [];
  for (let repetition = 1; repetition <= protocol.repetitions; repetition++) {
    for (const condition of ["baseline", "rollover"]) {
      let slot;
      try { const path = resolve(experimentPath(storeRoot, protocol), `${condition}-${repetition}.json`); lstatSync(path); slot = readJsonFileStrict(path, "evaluation slot", 65536); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (Object.keys(slot).length !== 1 || typeof slot.run_digest !== "string") fail("EVALUATION_SLOT_INVALID");
      const run = read(storeRoot, slot.run_digest);
      if (run.condition !== condition || run.repetition !== repetition) fail("EVALUATION_SLOT_TRANSPLANT");
      validateReceipts(storeRoot, protocol, run);
      runs.push(run);
    }
  }
  return evaluateRolloverRuns(protocol, runs);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, storeRoot, pathOrDigest, policyOrRunPath, repetition] = process.argv.slice(2);
    let result;
    if (command === "freeze") result = freezeRolloverEvaluation({ storeRoot, protocol: readJsonFileStrict(pathOrDigest, "protocol", 65536), policy: readJsonFileStrict(policyOrRunPath, "policy", 65536) });
    else if (command === "claim") result = claimRolloverEvaluationRun({ storeRoot, protocolDigest: pathOrDigest, condition: policyOrRunPath, repetition: Number(repetition) });
    else if (command === "record") result = recordRolloverEvaluationRun({ storeRoot, protocolDigest: pathOrDigest, run: readJsonFileStrict(policyOrRunPath, "run", 65536) });
    else if (command === "evaluate") result = evaluateStoredRolloverRuns({ storeRoot, protocolDigest: pathOrDigest });
    else fail("EVALUATION_COMMAND_INVALID");
    console.log(JSON.stringify(result));
  } catch { console.error(JSON.stringify({ status: "blocked", reasons: ["EVALUATION_INPUT_OR_STORE_INVALID"] })); process.exitCode = 2; }
}

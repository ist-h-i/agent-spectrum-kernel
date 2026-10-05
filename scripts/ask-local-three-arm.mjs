import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { prepareStaticFullComparison, auditStaticFullComparison } from "./ask-local-full-package.mjs";
import { qualifyThreeArmPublicTask, qualifyKernelWorkflow } from "./ask-local-three-arm-qualification.mjs";

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONDITIONS = ["plain", "kernel_only", "full_ask"];
export const THREE_ARM_ORDERS = Object.freeze([
  ["plain", "kernel_only", "full_ask"], ["kernel_only", "full_ask", "plain"], ["full_ask", "plain", "kernel_only"],
  ["plain", "full_ask", "kernel_only"], ["full_ask", "kernel_only", "plain"], ["kernel_only", "plain", "full_ask"],
].map(Object.freeze));
const SCENARIOS = new Set(["pass", "failure", "unknown", "unknown-usage", "identity", "timeout", "token-at", "token-over", "duplicate-session", "interrupt"]);
const PROMPT = "Complete task.md using workspace. Return JSON matching workspace/review.schema.json.";
const POLICY = Object.freeze({ timeout_ms: 120000, trial_tokens: 50000, cumulative_tokens: 150000,
  enforcement: "post_trial", accounting: "input_plus_output_including_cached", retries: 0 });
const IMPLEMENTATION = ["scripts/ask-local-three-arm.mjs", "scripts/ask-local-three-arm-qualification.mjs",
  "scripts/ask-local-full-package.mjs", "scripts/ask-benchmark-stable-file.mjs", "scripts/content-addressed-store.mjs",
  "scripts/ask-benchmark-mp-ci-evidence-gap.mjs", "scripts/ask-benchmark-evaluator-boundary.mjs",
  "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/evaluator-reference.json",
  "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/input-manifest.json",
  "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/verification-command-contract.json"];
const hash = b => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fail(reason) { throw new Error(reason); }
function directory(path) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) fail("unsafe_protocol_directory");
}
function read(root, path) {
  const parts = path.split("/");
  if (parts.some(p => !p || [".", ".."].includes(p)) || isAbsolute(path) || path.includes("\\")) fail("unsafe_protocol_path");
  let cursor = root;
  for (const part of parts.slice(0, -1)) { cursor = join(cursor, part); directory(cursor); }
  const target = join(root, path), s = lstatSync(target);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o600) fail("unsafe_protocol_file");
  return readStableFile(target, "three-arm control file", 1048576).bytes;
}
const decode = bytes => parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
function save(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(root, path), bytes, { flag: "wx", mode: 0o600 });
  return hash(bytes);
}
function sourceDigests() {
  return Object.fromEntries(IMPLEMENTATION.map(p => [p, hash(readStableFile(join(SOURCE, p), "protocol source", 1048576).bytes)]));
}
function shape(root) {
  if (typeof process.getuid !== "function" || !isAbsolute(root) || realpathSync(root) !== root) fail("unsafe_protocol_root");
  directory(root); directory(join(root, "control"));
  if (!same(readdirSync(root).sort(), ["control", "preparation"])) fail("protocol_shape_changed");
  for (const name of readdirSync(join(root, "control"))) {
    if (!["protocol.json", "claim.json", "slots", "result.json"].includes(name)) fail("protocol_shape_changed");
    if (name === "slots") {
      directory(join(root, "control/slots"));
      for (const slot of readdirSync(join(root, "control/slots"))) {
        if (!CONDITIONS.some(c => slot === `${c}.json`)) fail("protocol_shape_changed");
      }
    }
  }
}
function qualificationOptions(root,options){
  const frozen=options?.frozenSourceRoot;
  if(!options||Object.keys(options).some(k=>k!=="frozenSourceRoot"))fail("invalid_qualification_options");
  if(frozen!==undefined&&(typeof frozen!=="string"||!isAbsolute(frozen)||resolve(frozen)!==frozen||realpathSync(frozen)!==frozen
    ||root===frozen||root.startsWith(`${frozen}/`)||frozen.startsWith(`${root}/`)))fail("invalid_frozen_source_root");
  return options;
}
function reopen(root, expectedDigest) {
  shape(root);
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedDigest ?? "")) fail("external_protocol_digest_required");
  const bytes = read(root, "control/protocol.json");
  if (hash(bytes) !== expectedDigest) fail("protocol_digest_changed");
  const plan = decode(bytes);
  if (plan.kind !== "ask_three_arm_model_free_protocol_v1" || plan.mode !== "synthetic" || plan.live_ready !== false
    || !same(plan.policy, POLICY) || !THREE_ARM_ORDERS.some(x => same(x, plan.order))
    || !Array.isArray(plan.scenarios) || plan.scenarios.length !== 3 || plan.scenarios.some(x => !SCENARIOS.has(x))
    || plan.model_calls !== 0 || plan.native_cli_starts !== 0 || !same(plan.common_inputs, plan.preparation.task_inputs)
    || !same(plan.implementation_digests, sourceDigests()) || plan.prompt !== PROMPT
    || !same(plan.runtime, { model: "gpt-6.1-sol", effort: "medium", observed_identity: "unknown" })) fail("invalid_protocol");
  const preparation = auditStaticFullComparison(join(root, "preparation"), plan.preparation.record_digest);
  if (preparation.status !== "static_prepared" || preparation.static_package_eligible !== true
    || !same(preparation, plan.preparation)) fail("preparation_not_eligible");
  qualificationOptions(root,plan.qualification_options);
  if (!same(qualifyKernelWorkflow(SOURCE,preparation),plan.kernel_workflow))fail("kernel_workflow_changed");
  if (!same(qualifyThreeArmPublicTask(SOURCE,plan.qualification_options), plan.task_qualification)) fail("task_qualification_changed");
  return plan;
}

/** Only new private roots. Native execution/grants are deliberately unavailable. */
export function prepareThreeArm(root, options = {}) {
  if (options.mode !== undefined && options.mode !== "synthetic") fail("native_execution_not_admitted");
  const orderIndex = options.orderIndex ?? 0, scenarios = options.scenarios ?? ["pass", "pass", "pass"];
  if (Object.keys(options).some(k => !["mode", "orderIndex", "scenarios", "frozenSourceRoot"].includes(k)) || !Number.isInteger(orderIndex)
    || orderIndex < 0 || orderIndex >= 6 || !Array.isArray(scenarios) || scenarios.length !== 3
    || scenarios.some(x => !SCENARIOS.has(x))) fail("invalid_protocol_options");
  if (!isAbsolute(root) || resolve(root) !== root || root === "/" || existsSync(root)
    || realpathSync(dirname(root)) !== dirname(root) || root.startsWith(`${SOURCE}/`) || SOURCE.startsWith(`${root}/`)) fail("invalid_new_protocol_root");
  if (typeof process.getuid !== "function" || !/^v24\./u.test(process.version)) fail("unsupported_static_runtime");
  const qualification_options=qualificationOptions(root,options.frozenSourceRoot===undefined?{}:{frozenSourceRoot:options.frozenSourceRoot});
  mkdirSync(root, { mode: 0o700 });
  const preparation = prepareStaticFullComparison(join(root, "preparation"), { complete: true });
  if (preparation.status !== "static_prepared") fail("preparation_not_eligible");
  const plan = { kind: "ask_three_arm_model_free_protocol_v1", mode: "synthetic", live_ready: false,
    protocol_id: randomUUID(), preparation, order: THREE_ARM_ORDERS[orderIndex], scenarios, prompt: PROMPT,
    runtime: { model: "gpt-6.1-sol", effort: "medium", observed_identity: "unknown" }, policy: POLICY,
    common_inputs: preparation.task_inputs, implementation_digests: sourceDigests(),
    qualification_options, kernel_workflow:qualifyKernelWorkflow(SOURCE,preparation),
    task_qualification: qualifyThreeArmPublicTask(SOURCE,qualification_options), model_calls: 0, native_cli_starts: 0 };
  const protocol_digest = save(root, "control/protocol.json", plan);
  return { ...plan, protocol_digest };
}
function syntheticSlot(plan, condition, index, sessions) {
  const scenario = plan.scenarios[index], session = scenario === "duplicate-session" && sessions.size ? [...sessions][0] : randomUUID();
  const tokens = scenario === "unknown-usage" ? null : scenario === "token-at" ? POLICY.trial_tokens : scenario === "token-over" ? POLICY.trial_tokens + 1 : 100;
  const elapsed = scenario === "timeout" ? POLICY.timeout_ms + 1 : 1;
  let reason = null;
  if (["failure", "unknown", "interrupt"].includes(scenario)) reason = `transport_${scenario}`;
  else if (scenario === "identity") reason = "identity_mismatch";
  else if (sessions.has(session)) reason = "session_reused";
  else if (tokens === null) reason = "usage_unknown";
  else if (elapsed > POLICY.timeout_ms) reason = "timeout";
  else if (tokens >= POLICY.trial_tokens) reason = "trial_token_threshold";
  sessions.add(session);
  return { condition, attempts: 1, session_id: session, status: reason ? "blocked" : "synthetic_completed", reason,
    usage: { tokens, provenance: "synthetic", accounting: POLICY.accounting }, elapsed_ms: elapsed,
    identity: { model: scenario === "identity" ? "synthetic-mismatch" : plan.runtime.model,
      effort: plan.runtime.effort, provenance: "synthetic" }, semantic_score: "unknown", actual_capability_use: "unknown" };
}
export function runSyntheticThreeArm(root, protocolDigest) {
  const plan = reopen(root, protocolDigest);
  if (existsSync(join(root, "control/claim.json"))) fail("protocol_already_claimed");
  if (!same(readdirSync(join(root, "control")).sort(), ["protocol.json"])) fail("unexpected_preexecution_evidence");
  const claimDigest = save(root, "control/claim.json", { kind: "model_free_protocol_claim", protocol_digest: protocolDigest, attempts_per_slot: 1 });
  const slots = [], slotDigests = {}, sessions = new Set(); let total = 0, reason = null;
  for (const [index, condition] of plan.order.entries()) {
    const slot = syntheticSlot(plan, condition, index, sessions);
    if (slot.usage.tokens !== null) total += slot.usage.tokens;
    if (!slot.reason && total >= POLICY.cumulative_tokens) { slot.reason = "cumulative_token_threshold"; slot.status = "blocked"; }
    slotDigests[condition] = save(root, `control/slots/${condition}.json`, slot); slots.push(slot);
    if (slot.reason) { reason = slot.reason; break; }
  }
  const report = { kind: "ask_three_arm_synthetic_result_v1", status: reason ? "blocked" : "synthetic_protocol_complete", reason,
    protocol_digest: protocolDigest, claim_digest: claimDigest, slot_digests: slotDigests, slots,
    planned_slots: plan.order.map(condition => {
      const slot = slots.find(x => x.condition === condition);
      return { condition, status: slot?.status ?? "not_started", attempts: slot?.attempts ?? 0 };
    }),
    cumulative_synthetic_tokens: total, semantic_scores: "unknown", contrasts: "unavailable_without_qualified_real_results",
    measured_comparison_valid: false, actual_process_denies: "unknown", actual_cli_capability_use: "unknown",
    model_calls: 0, native_cli_starts: 0, retries: 0 };
  return { ...report, result_digest: save(root, "control/result.json", report) };
}
/** Saved bytes only; no transport, grading, installer or model invocation. */
export function replayThreeArm(root, protocolDigest, expectedResultDigest) {
  try {
    const plan = reopen(root, protocolDigest);
    if (!/^sha256:[a-f0-9]{64}$/u.test(expectedResultDigest ?? "")) fail("external_result_digest_required");
    const bytes = read(root, "control/result.json");
    if (hash(bytes) !== expectedResultDigest) fail("result_digest_changed");
    const result = decode(bytes);
    if (result.protocol_digest !== protocolDigest || result.measured_comparison_valid !== false
      || result.model_calls !== 0 || result.native_cli_starts !== 0 || result.retries !== 0
      || result.slots.length < 1 || result.slots.length > 3 || !same(result.slots.map(x => x.condition), plan.order.slice(0, result.slots.length))) fail("invalid_result");
    const planned = plan.order.map(condition => {
      const slot = result.slots.find(x => x.condition === condition);
      return { condition, status: slot?.status ?? "not_started", attempts: slot?.attempts ?? 0 };
    });
    if (!same(result.planned_slots, planned)) fail("planned_slot_state_changed");
    if (hash(read(root, "control/claim.json")) !== result.claim_digest) fail("claim_digest_changed");
    const expectedNames = result.slots.map(x => `${x.condition}.json`).sort();
    if (!same(readdirSync(join(root, "control/slots")).sort(), expectedNames)) fail("slot_inventory_changed");
    for (const slot of result.slots) {
      const raw = read(root, `control/slots/${slot.condition}.json`);
      if (hash(raw) !== result.slot_digests[slot.condition] || !same(decode(raw), slot)) fail("slot_evidence_changed");
    }
    return { ...result, result_digest: expectedResultDigest };
  } catch (error) { return { kind: "ask_three_arm_replay_v1", status: "blocked", measured_comparison_valid: false,
    model_calls: 0, native_cli_starts: 0, reason: /^[a-z_]+$/u.test(error.message) ? error.message : "replay_refused" }; }
}
/** Pure command proposal. No executable/version/auth discovery or process creation. */
export function buildNativeThreeArmCandidate(root, protocolDigest, executable) {
  const plan = reopen(root, protocolDigest);
  if (typeof executable !== "string" || !isAbsolute(executable) || resolve(executable) !== executable) fail("invalid_native_executable_candidate");
  return { status: "unadmitted_command_candidate", live_ready: false, model_calls: 0, native_cli_starts: 0,
    public_evaluator_qualification:plan.task_qualification.public_evaluator_reference,kernel_workflow:plan.kernel_workflow,
    missing: ["native_executable_identity", "private_evaluator_authority", "human_admission_review", "kernel_fair_workflow",
      "sandbox_deny_enforcement", "native_capability_discovery_read_use", "approved_frozen_execution_budget", "new_execution_authorization"],
    launches: plan.order.map(condition => ({ condition, executable, cwd: join(root, "preparation/conditions", condition),
      argv: ["exec", "--json", "--model", plan.runtime.model, "-c", `model_reasoning_effort="${plan.runtime.effort}"`,
        "--sandbox", "workspace-write", "--skip-git-repo-check", "-"], input: plan.prompt, timeout_ms: plan.policy.timeout_ms,
      environment: "not_frozen", process_denies: "not_admitted" })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, protocolDigest, resultDigest, ...extra] = process.argv.slice(2);
    if (extra.length || !root) fail("invalid_arguments");
    let result;
    if (command === "prepare" && !protocolDigest && !resultDigest) result = prepareThreeArm(root);
    else if(command === "prepare-qualified" && protocolDigest && !resultDigest) result=prepareThreeArm(root,{frozenSourceRoot:protocolDigest});
    else if (command === "simulate" && !resultDigest) result = runSyntheticThreeArm(root, protocolDigest);
    else if (command === "replay") result = replayThreeArm(root, protocolDigest, resultDigest);
    else if (command === "run-native") fail("native_execution_not_admitted");
    else fail("invalid_arguments");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "blocked") process.exitCode = 2;
  } catch (error) { process.stderr.write(`${/^[a-z_]+$/u.test(error.message) ? error.message : "protocol_refused"}; evidence preserved, no retry.\n`); process.exitCode = 1; }
}

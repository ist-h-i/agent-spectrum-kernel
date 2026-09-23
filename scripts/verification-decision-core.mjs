import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const OBSERVATION_KINDS = Object.freeze([
  "pr_head", "required_ci", "approval", "mergeability", "release_state",
  "authorization", "external_state", "independent_judgment", "human_approval",
]);
export const CLAIM_OBSERVATIONS = Object.freeze({
  completion: Object.freeze([]),
  merge: Object.freeze(["pr_head", "required_ci", "approval", "mergeability", "authorization"]),
  release: Object.freeze(["pr_head", "required_ci", "approval", "mergeability", "authorization", "release_state"]),
});
const ACTOR_BOUND = new Set(["independent_judgment", "approval", "human_approval", "authorization"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:#@+/-]{0,255}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

export function closedObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) {
    throw new Error(`${label}: unknown or missing fields`);
  }
  return value;
}
function token(value, label) {
  if (typeof value !== "string" || !TOKEN.test(value)) throw new Error(`${label}: invalid bounded identity`);
}
function unique(values, label, key = (value) => value) {
  if (!Array.isArray(values) || values.length > 256) throw new Error(`${label}: invalid bounded inventory`);
  if (new Set(values.map(key)).size !== values.length) throw new Error(`${label}: duplicate identity`);
}

// This is an integration policy, not a provider record or an evidence transfer.
// The repository wrapper pins its exact bytes at the scoped baseline and target.
export function validateCompletionPolicy(policy) {
  closedObject(policy, ["schema_version", "repository_id", "maximum_decision_ms", "providers", "forbidden_actor_ids"], "completion policy");
  if (policy.schema_version !== "1.0.0") throw new Error("unsupported completion policy version");
  token(policy.repository_id, "repository");
  if (!Number.isSafeInteger(policy.maximum_decision_ms) || policy.maximum_decision_ms < 1 || policy.maximum_decision_ms > 60000) {
    throw new Error("maximum_decision_ms must be between 1 and 60000");
  }
  unique(policy.forbidden_actor_ids, "forbidden actors");
  policy.forbidden_actor_ids.forEach((id) => token(id, "forbidden actor"));
  unique(policy.providers, "providers", (entry) => entry.kind);
  for (const provider of policy.providers) {
    closedObject(provider, ["kind", "provider_id", "actor_ids"], "provider policy");
    if (!OBSERVATION_KINDS.includes(provider.kind)) throw new Error("unsupported observation kind");
    token(provider.provider_id, "provider");
    unique(provider.actor_ids, "provider actors");
    provider.actor_ids.forEach((id) => token(id, "provider actor"));
    if (ACTOR_BOUND.has(provider.kind) && provider.actor_ids.length === 0) throw new Error("actor-bound provider needs explicit actors");
    if (provider.actor_ids.some((id) => policy.forbidden_actor_ids.includes(id))) throw new Error("provider actor is forbidden");
  }
  return policy;
}

function validateBinding(binding) {
  closedObject(binding, ["repository_id", "target_revision", "target_tree_digest", "requirements_digest", "plan_digest", "request_digest", "policy_digest", "claim"], "decision binding");
  token(binding.repository_id, "repository");
  if (!/^[a-f0-9]{40}$/u.test(binding.target_revision ?? "")) throw new Error("invalid target revision");
  for (const field of ["target_tree_digest", "requirements_digest", "plan_digest", "request_digest", "policy_digest"]) {
    if (!DIGEST.test(binding[field] ?? "")) throw new Error(`invalid ${field}`);
  }
  if (!Object.hasOwn(CLAIM_OBSERVATIONS, binding.claim)) throw new Error("unsupported claim");
}

function validateObservation(record, query, authority, forbiddenActors) {
  closedObject(record, ["query", "status", "actor_id", "evidence_digest"], "current observation");
  closedObject(record.query, Object.keys(query), "observation query binding");
  for (const key of Object.keys(query)) {
    if (record.query[key] !== query[key]) throw new Error("stale or transplanted current observation");
  }
  if (!["satisfied", "unsatisfied", "unavailable"].includes(record.status)) throw new Error("invalid current status");
  if (record.actor_id !== null) token(record.actor_id, "observer actor");
  if (record.evidence_digest !== null && !DIGEST.test(record.evidence_digest)) throw new Error("invalid observation evidence digest");
  if (record.status === "satisfied") {
    if (!DIGEST.test(record.evidence_digest ?? "")) throw new Error("positive observation requires evidence");
    if (ACTOR_BOUND.has(query.kind)
      && (!authority.actor_ids.includes(record.actor_id) || forbiddenActors.has(record.actor_id))) {
      throw new Error("current judgment or approval actor is not independent/authorized");
    }
  }
  return record;
}

async function boundedRefresh(provider, query, deadline) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error("decision timeout");
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider(Object.freeze({ ...query }), { signal: controller.signal })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("decision timeout")), remaining); }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Internal decision-point observation protocol. Providers are trusted executable
 * host integrations, NEVER JSON records loaded from the evidence store. A provider
 * must read its authoritative system on EVERY invocation (including confirmation).
 * Coverage is diagnostic and never authorizes a merge, release, or human approval.
 */
export async function refreshDecisionObservations({ binding, policy, obligations, providers = {}, forbiddenActorIds = [] }) {
  validateBinding(binding);
  validateCompletionPolicy(policy);
  if (policy.repository_id !== binding.repository_id) throw new Error("policy repository mismatch");
  unique(obligations, "current obligations", (entry) => `${entry.kind}\0${entry.ref}`);
  for (const obligation of obligations) {
    closedObject(obligation, ["kind", "ref"], "current obligation");
    if (!OBSERVATION_KINDS.includes(obligation.kind)) throw new Error("unsupported current obligation");
    token(obligation.ref, "obligation");
  }
  const required = [...obligations];
  for (const kind of CLAIM_OBSERVATIONS[binding.claim]) {
    if (!required.some((entry) => entry.kind === kind)) required.push({ kind, ref: `claim:${binding.claim}:${kind}` });
  }
  required.sort((a, b) => `${a.kind}\0${a.ref}`.localeCompare(`${b.kind}\0${b.ref}`));
  const forbidden = new Set([...policy.forbidden_actor_ids, ...forbiddenActorIds]);
  const deadline = performance.now() + policy.maximum_decision_ms;
  const challenge = randomUUID();
  const initial = new Map();
  const outcomes = new Map();
  for (const phase of ["initial", "confirm"]) {
    for (const obligation of required) {
      const key = `${obligation.kind}\0${obligation.ref}`;
      if (phase === "confirm" && outcomes.has(key)) continue;
      const authority = policy.providers.find((entry) => entry.kind === obligation.kind);
      const outcome = { ...obligation, provider_id: authority?.provider_id ?? null, status: "blocked", reason_code: "current_observation_required", actor_id: null, evidence_digest: null };
      const provider = authority && Object.hasOwn(providers, authority.provider_id) ? providers[authority.provider_id] : null;
      if (typeof provider !== "function") { outcomes.set(key, outcome); continue; }
      const query = { ...binding, challenge, phase, kind: obligation.kind, ref: obligation.ref };
      try {
        const record = validateObservation(await boundedRefresh(provider, query, deadline), query, authority, forbidden);
        if (record.status !== "satisfied") {
          outcomes.set(key, { ...outcome, reason_code: `current_observation_${record.status}` });
        } else if (phase === "initial") {
          initial.set(key, { actor_id: record.actor_id, evidence_digest: record.evidence_digest });
        } else {
          const before = initial.get(key);
          const stable = before.actor_id === record.actor_id && before.evidence_digest === record.evidence_digest;
          outcomes.set(key, stable
            ? { ...outcome, status: "covered", reason_code: "decision_point_refresh_verified", actor_id: record.actor_id, evidence_digest: record.evidence_digest }
            : { ...outcome, reason_code: "current_state_changed_during_decision" });
        }
      } catch {
        // Provider exceptions can contain secrets, URLs or raw response bodies.
        outcomes.set(key, { ...outcome, reason_code: "current_observation_invalid_or_unavailable" });
      }
    }
  }
  const records = required.map((entry) => outcomes.get(`${entry.kind}\0${entry.ref}`));
  if (performance.now() > deadline) {
    for (const record of records) { record.status = "blocked"; record.reason_code = "decision_window_expired"; }
  }
  return { observations: records, status: records.every((entry) => entry.status === "covered") ? "covered" : "blocked", authorizes_action: false };
}

const MEASUREMENTS = ["input_tokens", "output_tokens", "cached_input_tokens", "elapsed_ms"];
function normalizeMeasurements(measurements) {
  closedObject(measurements, MEASUREMENTS, "runtime measurements");
  const output = {};
  for (const name of MEASUREMENTS) {
    const entry = measurements[name];
    closedObject(entry, ["status", "value", "source_ref"], name);
    const valid = entry.status === "unavailable"
      ? entry.value === null && entry.source_ref === null
      : entry.status === "observed" && Number.isSafeInteger(entry.value) && entry.value >= 0 && TOKEN.test(entry.source_ref ?? "");
    if (!valid) throw new Error(`invalid measurement: ${name}`);
    output[name] = { ...entry };
  }
  return output;
}
export function unavailableMeasurements() {
  return Object.fromEntries(MEASUREMENTS.map((name) => [name, { status: "unavailable", value: null, source_ref: null }]));
}

// Events are emitted at the actual runner/dispatch boundary. Planned work and
// fixture dispatches are deliberately distinct from real AI requests.
export function summarizeVerificationWork({ dispositions, events, requiredJudgmentRefs = null, measurements = unavailableMeasurements() }) {
  unique(dispositions, "gate dispositions", (entry) => entry.gate_id);
  if (!Array.isArray(events) || events.length > 4096) throw new Error("invalid bounded work events");
  for (const entry of dispositions) {
    token(entry.gate_id, "gate");
    const reusable = ["reuse_exact", "reuse_scoped", "independent_judgment_required"].includes(entry.disposition);
    if (typeof entry.execution_evidence_reusable !== "boolean" || reusable !== entry.execution_evidence_reusable
      || (!reusable && !["rerun_required", "blocked_uncovered"].includes(entry.disposition))
      || (reusable ? !["exact_target", "declared_dependency_manifest"].includes(entry.reuse_basis) : entry.reuse_basis !== null)) {
      throw new Error("inconsistent gate disposition");
    }
  }
  const judgments = requiredJudgmentRefs ?? dispositions.filter((entry) => entry.disposition === "independent_judgment_required").map((entry) => `gate:${entry.gate_id}`);
  unique(judgments, "required judgments");
  judgments.forEach((ref) => token(ref, "judgment"));
  if (dispositions.some((entry) => entry.disposition === "independent_judgment_required" && !judgments.includes(`gate:${entry.gate_id}`))) throw new Error("required gate judgment omitted");
  const known = new Set(dispositions.map((entry) => entry.gate_id));
  const executed = new Set();
  const successful = new Set();
  let attempts = 0;
  let ai = 0;
  let dispatches = 0;
  for (const entry of events) {
    if (entry.kind === "deterministic_execution") {
      closedObject(entry, ["kind", "gate_id", "status"], "execution event");
      if (!known.has(entry.gate_id) || !["succeeded", "failed"].includes(entry.status)) throw new Error("invalid execution event");
      attempts += 1;
      executed.add(entry.gate_id);
      // The latest attempt is authoritative; an earlier success cannot hide failure.
      successful.delete(entry.gate_id);
      if (entry.status === "succeeded") successful.add(entry.gate_id);
    } else {
      closedObject(entry, ["kind"], "request event");
      if (entry.kind === "ai_request") ai += 1;
      else if (entry.kind === "review_request_dispatch") dispatches += 1;
      else throw new Error("unsupported work event");
    }
  }
  const reusable = dispositions.filter((entry) => entry.execution_evidence_reusable && !executed.has(entry.gate_id));
  const reusedIds = new Set(reusable.map((entry) => entry.gate_id));
  return {
    schema_version: "1.0.0",
    program: "ask_verification_work_metrics",
    required_gate_count: dispositions.length,
    full_rerun_gate_count: dispositions.length,
    reuse_exact_count: reusable.filter((entry) => entry.reuse_basis === "exact_target").length,
    reuse_scoped_count: reusable.filter((entry) => entry.reuse_basis === "declared_dependency_manifest").length,
    reused_count: reusable.length,
    rerun_required_count: dispositions.filter((entry) => !entry.execution_evidence_reusable).length,
    rerun_count: executed.size,
    deterministic_execution_count: attempts,
    saved_deterministic_executions: reusable.length,
    uncovered_gate_count: dispositions.filter((entry) => !reusedIds.has(entry.gate_id) && !successful.has(entry.gate_id)).length,
    independent_judgment_required_count: judgments.length,
    review_request_dispatch_count: dispatches,
    ai_request_count: ai,
    runtime_measurements: normalizeMeasurements(measurements),
    quality_improvement_inferred: false,
  };
}

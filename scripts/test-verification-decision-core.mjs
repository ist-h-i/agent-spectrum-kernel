import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  CLAIM_OBSERVATIONS, OBSERVATION_KINDS, refreshDecisionObservations,
  summarizeVerificationWork, unavailableMeasurements, validateCompletionPolicy,
} from "./verification-decision-core.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const binding = {
  repository_id: "github.com/example/project", target_revision: "1".repeat(40),
  target_tree_digest: digest, requirements_digest: digest, plan_digest: digest,
  request_digest: digest, policy_digest: digest, claim: "completion",
};
const policy = {
  schema_version: "1.0.0", repository_id: binding.repository_id, maximum_decision_ms: 5000,
  forbidden_actor_ids: ["developer"],
  providers: OBSERVATION_KINDS.map((kind) => ({ kind, provider_id: "trusted-fixture", actor_ids: ["independent-reviewer"] })),
};
const obligation = { kind: "independent_judgment", ref: "review-current-delta" };
const positive = (query) => ({ query: { ...query }, status: "satisfied", actor_id: "independent-reviewer", evidence_digest: digest });
const run = (provider, overrides = {}) => refreshDecisionObservations({
  binding, policy, obligations: [obligation], providers: { "trusted-fixture": provider }, ...overrides,
});

test("a fresh independent observation is re-read and stays non-authorizing", async () => {
  const calls = [];
  const result = await run((query) => { calls.push(query); return positive(query); });
  assert.equal(result.status, "covered");
  assert.equal(result.authorizes_action, false);
  assert.deepEqual(calls.map((query) => query.phase), ["initial", "confirm"]);
  assert.equal(calls[0].challenge, calls[1].challenge);
});

test("merge and release claims cannot omit their current facts", async () => {
  for (const claim of ["merge", "release"]) {
    const kinds = new Set();
    const result = await run((query) => { kinds.add(query.kind); return positive(query); }, { binding: { ...binding, claim }, obligations: [] });
    assert.equal(result.status, "covered");
    assert.deepEqual([...kinds].sort(), [...CLAIM_OBSERVATIONS[claim]].sort());
    const absent = await run(null, { binding: { ...binding, claim }, obligations: [] });
    assert.equal(absent.status, "blocked");
    assert.equal(absent.observations.length, CLAIM_OBSERVATIONS[claim].length);
  }
});

test("stored JSON, fresh:true, exceptions and malformed records never refresh authority", async () => {
  for (const provider of [
    positive({}),
    () => ({ fresh: true, status: "satisfied" }),
    (query) => ({ ...positive(query), prompt: "PRIVATE SECRET" }),
    () => { throw new Error("PRIVATE SECRET"); },
    (query) => ({ ...positive(query), status: "green" }),
    (query) => ({ ...positive(query), evidence_digest: null }),
  ]) {
    const result = await run(provider);
    assert.equal(result.status, "blocked");
    assert.ok(!JSON.stringify(result).includes("PRIVATE SECRET"));
  }
});

test("wrong repo, target, request, policy, claim, obligation and nonce are rejected", async () => {
  for (const [key, value] of Object.entries({
    repository_id: "github.com/other/project", target_revision: "2".repeat(40),
    target_tree_digest: `sha256:${"b".repeat(64)}`, requirements_digest: `sha256:${"b".repeat(64)}`,
    plan_digest: `sha256:${"b".repeat(64)}`, request_digest: `sha256:${"b".repeat(64)}`,
    policy_digest: `sha256:${"b".repeat(64)}`, claim: "release", kind: "approval",
    ref: "other-review", challenge: "old-nonce", phase: "historical",
  })) {
    const result = await run((query) => positive({ ...query, [key]: value }));
    assert.equal(result.status, "blocked", key);
  }
});

test("a cached positive result cannot be used in another decision", async () => {
  let cached;
  assert.equal((await run((query) => { cached = positive(query); return cached; })).status, "covered");
  assert.equal((await run(() => cached)).status, "blocked");
});

test("developer evidence, self approval, and undeclared actors are rejected separately", async () => {
  for (const kind of ["independent_judgment", "approval", "human_approval", "authorization"]) {
    for (const actor_id of ["developer", "not-declared", null]) {
      assert.equal((await run((query) => ({ ...positive(query), actor_id }), { obligations: [{ kind, ref: "required" }] })).status, "blocked");
    }
  }
  assert.equal((await run(positive, { forbiddenActorIds: ["independent-reviewer"] })).status, "blocked");
});

test("changed provider state or denied confirmation blocks coverage", async () => {
  for (const change of [
    (record) => ({ ...record, evidence_digest: `sha256:${"c".repeat(64)}` }),
    (record) => ({ ...record, status: "unsatisfied" }),
    (record) => ({ ...record, status: "unavailable" }),
  ]) {
    assert.equal((await run((query) => query.phase === "confirm" ? change(positive(query)) : positive(query))).status, "blocked");
  }
});

test("a hanging provider has a bounded, fail-closed decision window", async () => {
  const result = await run(async (query) => { await delay(20); return positive(query); }, { policy: { ...policy, maximum_decision_ms: 1 } });
  assert.equal(result.status, "blocked");
});

test("policy and obligation inventories reject weakening or ambiguous input", async () => {
  for (const invalid of [
    { ...policy, fresh: true }, { ...policy, schema_version: "0.0.0" },
    { ...policy, providers: [policy.providers[0], policy.providers[0]] },
    { ...policy, providers: [{ kind: "approval", provider_id: "trusted-fixture", actor_ids: [] }] },
    { ...policy, providers: [{ kind: "approval", provider_id: "trusted-fixture", actor_ids: ["developer"] }] },
  ]) assert.throws(() => validateCompletionPolicy(invalid));
  await assert.rejects(run(positive, { obligations: [obligation, obligation] }));
  await assert.rejects(run(positive, { binding: { ...binding, claim: "anything" } }));
  await assert.rejects(run(positive, { policy: { ...policy, repository_id: "github.com/other/repo" } }));
});

const dispositions = [
  { gate_id: "exact", disposition: "reuse_exact", execution_evidence_reusable: true, reuse_basis: "exact_target" },
  { gate_id: "scoped", disposition: "independent_judgment_required", execution_evidence_reusable: true, reuse_basis: "declared_dependency_manifest" },
  { gate_id: "changed", disposition: "rerun_required", execution_evidence_reusable: false, reuse_basis: null },
  { gate_id: "blocked", disposition: "blocked_uncovered", execution_evidence_reusable: false, reuse_basis: null },
];

test("metrics count executions, not plans; blocked work is not executed or saved", () => {
  const result = summarizeVerificationWork({ dispositions, events: [
    { kind: "deterministic_execution", gate_id: "changed", status: "failed" },
    { kind: "deterministic_execution", gate_id: "changed", status: "succeeded" },
    { kind: "review_request_dispatch" },
  ] });
  assert.equal(result.required_gate_count, 4);
  assert.equal(result.reused_count, 2);
  assert.equal(result.rerun_required_count, 2);
  assert.equal(result.rerun_count, 1);
  assert.equal(result.deterministic_execution_count, 2);
  assert.equal(result.saved_deterministic_executions, 2);
  assert.equal(result.uncovered_gate_count, 1);
  assert.equal(result.review_request_dispatch_count, 1);
  assert.equal(result.ai_request_count, 0);
  assert.equal(result.independent_judgment_required_count, 1);
  assert.deepEqual(result.runtime_measurements, unavailableMeasurements());
});

test("the latest failing attempt is not hidden behind a prior success", () => {
  const result = summarizeVerificationWork({ dispositions: dispositions.slice(0, 1), events: [
    { kind: "deterministic_execution", gate_id: "exact", status: "succeeded" },
    { kind: "deterministic_execution", gate_id: "exact", status: "failed" },
  ] });
  assert.equal(result.uncovered_gate_count, 1);
  assert.equal(result.reused_count, 0);
  assert.equal(result.saved_deterministic_executions, 0);
});

test("runtime measurements require actual source references and keep missingness", () => {
  const measurements = unavailableMeasurements();
  measurements.input_tokens = { status: "observed", value: 10, source_ref: "runtime:1" };
  const result = summarizeVerificationWork({ dispositions, events: [{ kind: "ai_request" }], measurements });
  assert.equal(result.ai_request_count, 1);
  assert.equal(result.runtime_measurements.input_tokens.value, 10);
  assert.equal(result.runtime_measurements.output_tokens.value, null);
  measurements.input_tokens.source_ref = null;
  assert.throws(() => summarizeVerificationWork({ dispositions, events: [], measurements }));
  assert.throws(() => summarizeVerificationWork({ dispositions, events: [{ kind: "prompt", text: "private" }] }));
  assert.throws(() => summarizeVerificationWork({ dispositions, events: [{ kind: "deterministic_execution", gate_id: "unknown", status: "succeeded" }] }));
});

test("observation evidence must be a primitive digest, never a coercible payload", async () => {
  let coercions = 0;
  const payload = { toString() { coercions += 1; return digest; }, raw_response: "PRIVATE PAYLOAD" };
  for (const evidence_digest of [[digest], new String(digest), payload, 1, true]) {
    const result = await run((query) => ({ ...positive(query), evidence_digest }));
    assert.equal(result.status, "blocked");
    assert.equal(result.observations[0].evidence_digest, null);
    assert.ok(!JSON.stringify(result).includes("PRIVATE PAYLOAD"));
  }
  assert.equal(coercions, 0, "validation must not invoke provider-owned coercion code");
});

test("closed observations reject accessors and hidden fields before reading them", async () => {
  let reads = 0;
  for (const field of ["status", "actor_id", "evidence_digest"]) {
    const result = await run((query) => {
      const record = positive(query);
      const value = record[field];
      Object.defineProperty(record, field, { enumerable: true, get() { reads += 1; return value; } });
      return record;
    });
    assert.equal(result.status, "blocked", field);
  }
  assert.equal(reads, 0);
  const result = await run((query) => Object.defineProperty(positive(query), "raw_response", { value: "PRIVATE PAYLOAD" }));
  assert.equal(result.status, "blocked");
  assert.ok(!JSON.stringify(result).includes("PRIVATE PAYLOAD"));
});

test("query bindings reject accessors rather than evaluating provider code", async () => {
  let reads = 0;
  const result = await run((query) => {
    const record = positive(query);
    Object.defineProperty(record.query, "target_revision", { enumerable: true, get() { reads += 1; return query.target_revision; } });
    return record;
  });
  assert.equal(result.status, "blocked");
  assert.equal(reads, 0);
});

test("decision binding scalars reject array and boxed-string coercion before dispatch", async () => {
  let calls = 0;
  const provider = (query) => { calls += 1; return positive(query); };
  for (const field of ["target_revision", "target_tree_digest", "requirements_digest", "plan_digest", "request_digest", "policy_digest", "claim"]) {
    for (const value of [[binding[field]], new String(binding[field])]) {
      await assert.rejects(run(provider, { binding: { ...binding, [field]: value } }), field);
    }
  }
  assert.equal(calls, 0);
});

test("observed measurement references reject non-string values without coercion", () => {
  let coercions = 0;
  const payload = { toString() { coercions += 1; return "runtime:1"; }, raw_response: "PRIVATE PAYLOAD" };
  for (const source_ref of [0, 123, true, ["runtime:1"], new String("runtime:1"), payload]) {
    const measurements = unavailableMeasurements();
    measurements.input_tokens = { status: "observed", value: 1, source_ref };
    assert.throws(() => summarizeVerificationWork({ dispositions, events: [], measurements }));
  }
  assert.equal(coercions, 0);
});

test("frozen and null-prototype data records retain supported positive behavior", async () => {
  const result = await run((query) => {
    const record = Object.assign(Object.create(null), positive(query));
    record.query = Object.freeze(Object.assign(Object.create(null), record.query));
    return Object.freeze(record);
  });
  assert.equal(result.status, "covered");
  assert.equal(typeof result.observations[0].evidence_digest, "string");
  assert.equal(result.authorizes_action, false);
  const measurements = unavailableMeasurements();
  measurements.input_tokens = { status: "observed", value: 0, source_ref: "runtime:0" };
  assert.equal(summarizeVerificationWork({ dispositions, events: [], measurements }).runtime_measurements.input_tokens.value, 0);
});

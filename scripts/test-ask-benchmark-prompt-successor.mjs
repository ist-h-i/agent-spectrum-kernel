import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { canonicalDigest, parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import {
  buildPromptSuccessorPreparation, validatePromptSuccessorPreparation, validateSuccessorRuntime,
  buildSuccessorSourceScope, validateSuccessorSourceScope, createSuccessorResumeState, validateSuccessorResumeState,
  startSuccessorCase, finishSuccessorCase, proposeSuccessorInvocation, assertSuccessorLaunchAllowed,
} from "./ask-benchmark-prompt-successor.mjs";
import { assertSuccessorSourceBinding, openSuccessorResultSource, inspectSuccessorSource, readSuccessorVerifiedEngineeringResult } from "./ask-benchmark-prompt-successor-bridge.mjs";
import { syntheticPreparation, syntheticParent, syntheticRuntime, syntheticScope, syntheticBindingRows, syntheticDigest as d, SYNTHETIC_RUN } from "./test-prompt-successor-fixtures.mjs";
const clone = structuredClone;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rejected = (fn) => assert.throws(fn);
const prep = syntheticPreparation();

test("same inputs produce the same 28-case / 14-pair preparation without mutation", () => {
  const parent = syntheticParent(); const runtime = syntheticRuntime(); const before = JSON.stringify({ parent, runtime });
  assert.deepEqual(syntheticPreparation({ parent, runtime }), prep);
  assert.equal(JSON.stringify({ parent, runtime }), before);
  assert.equal(prep.cases.length, 28);
  assert.equal(new Set(prep.cases.map((c) => c.case_id)).size, 28);
  assert.equal(new Set(prep.cases.map((c) => c.block_id)).size, 14);
  validatePromptSuccessorPreparation(prep, { expectedParent: parent });
});
test("balanced pairs share exact fixture, runtime and scoring condition", () => {
  for (const block of new Set(prep.cases.map((c) => c.block_id))) {
    const pair = prep.cases.filter((c) => c.block_id === block);
    assert.equal(pair.length, 2); assert.notEqual(pair[0].prompt_role, pair[1].prompt_role);
    for (const field of ["common_input_digest", "runtime_digest", "fixture_id", "repetition", "raw_scoring_condition"]) assert.equal(pair[0][field], pair[1][field]);
  }
  for (const f of prep.predecessor.fixtures) {
    const first = prep.cases.filter((c) => c.fixture_id === f.fixture_id && c.role_order_position === 1);
    assert.ok(Math.abs(first.filter((c) => c.prompt_role === "current_prompt").length - first.filter((c) => c.prompt_role === "prompt_v2").length) <= 1);
  }
});
test("CLI/model/config changes create new identities, not a rewritten historical parent", () => {
  for (const field of ["cli_version", "model", "configuration_digest", "dependency_digest", "executable_digest"]) {
    const runtime = syntheticRuntime(); runtime[field] = field.endsWith("digest") ? d(`new:${field}`) : field === "cli_version" ? "0.154.0" : "different-synthetic-model";
    const other = syntheticPreparation({ runtime });
    assert.notEqual(other.preparation_digest, prep.preparation_digest);
    assert.notEqual(other.cases[0].case_id, prep.cases[0].case_id);
    assert.deepEqual(other.predecessor, prep.predecessor);
  }
});
for (const [label, mutate] of [
  ["missing case", (p) => p.cases.pop()], ["extra case", (p) => p.cases.push(p.cases[0])],
  ["duplicate case", (p) => { p.cases[1] = clone(p.cases[0]); }], ["reordered cases", (p) => p.cases.reverse()],
  ["mixed runtime", (p) => { p.cases[0].runtime_digest = d("other"); }], ["old namespace", (p) => { p.kind = "prompt_v2_execution_plan"; }],
  ["permission escalation", (p) => { p.permissions.model_call = true; }], ["wide scope", (p) => { p.decision_scope.repository_wide = true; }],
  ["Claude success", (p) => { p.decision_scope.adapter = "claude"; }], ["unknown field", (p) => { p.raw_prompt = "not allowed"; }],
  ["wrong parent hash", (p) => { p.predecessor.preregistration_digest = d("other"); }],
]) test(`preparation rejects ${label}`, () => { const p = clone(prep); mutate(p); rejected(() => validatePromptSuccessorPreparation(p)); });
for (const [field, value] of [["cli_version", "latest"], ["cli_version", 153], ["model", "model-latest"], ["model", "--model=other"], ["node_version", "v22.16.0"], ["authentication_mode", "unknown"], ["sandbox", "danger-full-access"], ["approval_policy", "on-request"], ["agent_network", "enabled"], ["timeout_ms", 0], ["provider_model_revision", { status: "known", value: null }]]) {
  test(`runtime rejects unsafe/unresolved ${field}=${JSON.stringify(value)}`, () => { const r = syntheticRuntime(); r[field] = value; rejected(() => validateSuccessorRuntime(r)); });
}
test("source scope supports native plan ID distinct from plan content digest", () => { const s = syntheticScope(prep); assert.notEqual(s.source.plan_id, `plan-${s.source.plan_digest.slice(7)}`); validateSuccessorSourceScope(s, prep, s.scope_digest); });
test("source scope rejects cross-role source cases, duplicates and missing bindings", () => {
  const scope = syntheticScope(prep);
  for (const edit of [(s) => s.bindings.pop(), (s) => { s.bindings[1].source_case_id = s.bindings[0].source_case_id; }, (s) => { s.bindings[0].successor_case_id = prep.cases.find((c) => c.prompt_role === "prompt_v2").case_id; }]) {
    const source = clone(scope.source); edit(source);
    rejected(() => buildSuccessorSourceScope({ preparation: prep, promptRole: scope.prompt_role, runInstanceId: SYNTHETIC_RUN, source }));
  }
  rejected(() => validateSuccessorSourceScope(scope, prep, d("untrusted")));
  rejected(() => validateSuccessorSourceScope(scope, syntheticPreparation({ seed: "other" }), scope.scope_digest));
});
test("source matching checks every native normalized and raw lineage field", () => {
  const s = syntheticScope(prep); const rows = syntheticBindingRows(prep, s);
  assert.equal(assertSuccessorSourceBinding(rows).case_id, rows.binding.successor_case_id);
  for (const field of Object.keys(rows.normalized.lineage)) {
    const bad = clone(rows); bad.normalized.lineage[field] = typeof bad.normalized.lineage[field] === "number" ? 99 : "transplant";
    rejected(() => assertSuccessorSourceBinding(bad));
  }
  for (const field of ["adapter", "normalized_result_id", "normalized_result_digest", "normalized_outcome", "fixture_id", "condition", "case_id", "plan_id", "plan_digest", "run_instance_id", "repetition", "attempt"]) {
    const bad = clone(rows); bad.engineering[field] = "transplant"; rejected(() => assertSuccessorSourceBinding(bad));
  }
});
test("fabricated, copied and absent reader handles confer no verification", () => {
  for (const handle of [undefined, null, {}, { source_digest: d("forgery") }]) {
    rejected(() => inspectSuccessorSource(handle)); rejected(() => readSuccessorVerifiedEngineeringResult(handle, prep.cases[0].case_id));
  }
});
test("measured source access is rejected before file access or legacy dependency import", async () => {
  for (const mode of [undefined, "measured", "approved", true]) {
    await assert.rejects(() => openSuccessorResultSource({ accessMode: mode }), { code: "SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED" });
  }
});
test("resume accepts sequential append only, preserves inputs and rejects repeated completion", () => {
  let state = createSuccessorResumeState(prep, SYNTHETIC_RUN);
  const original = clone(state);
  rejected(() => startSuccessorCase(state, prep, prep.cases[1].case_id));
  state = startSuccessorCase(state, prep, prep.cases[0].case_id);
  assert.deepEqual(original.cases.map((e) => e.status), Array(28).fill("pending"));
  rejected(() => startSuccessorCase(state, prep, prep.cases[1].case_id));
  const terminal = { preparation_digest: prep.preparation_digest, run_instance_id: SYNTHETIC_RUN, case_id: prep.cases[0].case_id, status: "completed", result_digest: d("result") };
  state = finishSuccessorCase(state, prep, terminal);
  rejected(() => finishSuccessorCase(state, prep, terminal));
  state = startSuccessorCase(state, prep, prep.cases[1].case_id);
  validateSuccessorResumeState(state, prep);
});
test("uncertain in-flight state cannot be silently retried", () => {
  const state = startSuccessorCase(createSuccessorResumeState(prep, SYNTHETIC_RUN), prep, prep.cases[0].case_id);
  assert.throws(() => startSuccessorCase(state, prep, prep.cases[0].case_id), { code: "SUCCESSOR_UNCERTAIN_EXECUTION" });
  const terminal = { preparation_digest: prep.preparation_digest, run_instance_id: SYNTHETIC_RUN, case_id: prep.cases[0].case_id, status: "interrupted", result_digest: d("interrupt") };
  const next = finishSuccessorCase(state, prep, terminal);
  assert.equal(next.cases[0].status, "interrupted");
  rejected(() => startSuccessorCase(next, prep, prep.cases[0].case_id));
});
test("terminal states preserve failure/unknown boundary and reject run transplants", () => {
  const state = startSuccessorCase(createSuccessorResumeState(prep, SYNTHETIC_RUN), prep, prep.cases[0].case_id);
  for (const status of ["failed", "invalid", "unavailable", "interrupted"]) {
    const result = { preparation_digest: prep.preparation_digest, run_instance_id: SYNTHETIC_RUN, case_id: prep.cases[0].case_id, status, result_digest: d(status) };
    assert.equal(finishSuccessorCase(state, prep, result).cases[0].status, status);
    rejected(() => finishSuccessorCase(state, prep, { ...result, run_instance_id: "00000000-0000-4000-8000-000000000999" }));
  }
  const other = syntheticPreparation({ seed: "other" }); rejected(() => validateSuccessorResumeState(state, other));
  const bad = clone(state); bad.cases[3].status = "completed"; bad.cases[3].result_digest = d("bad"); rejected(() => validateSuccessorResumeState(bad, prep));
});
test("proposed argv is explicit, carries no permission and never invokes a runtime", () => {
  const spec = proposeSuccessorInvocation(prep, prep.cases[0].case_id, "/isolated/workspace");
  assert.equal(spec.argv.at(-1), "-"); assert.equal(spec.model_call_authorized, false); assert.equal(spec.effective_isolation_verified, false);
  assert.ok(spec.argv.includes("sandbox_workspace_write.network_access=false"));
  assert.equal(spec.timeout_ms, 900000);
  rejected(() => proposeSuccessorInvocation(prep, prep.cases[0].case_id, "/safe/../unsafe"));
  for (const authority of [undefined, true, { approved: true }]) assert.throws(() => assertSuccessorLaunchAllowed(authority), { code: "SUCCESSOR_PREPARATION_ONLY" });
});
test("strict JSON rejects duplicate runtime fields", () => { rejected(() => parseJsonRejectDuplicateKeys('{"model":"a","model":"b"}')); });
test("CLI refuses launch paths and extra overrides; does not spawn PATH sentinel", () => {
  const dir = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-successor-refusal-"));
  try {
    const marker = resolve(dir, "called"); const fake = resolve(dir, "codex");
    writeFileSync(fake, `#!/bin/sh\nprintf called > '${marker}'\n`); chmodSync(fake, 0o700);
    const executable = resolve(root, "scripts/ask-benchmark-prompt-successor-check.mjs");
    for (const argv of [["run"], ["smoke", "--approved"], ["exec"], ["prepare", "--launch", "true"], ["inspect", "--override", "true"]]) {
      const result = spawnSync(process.execPath, [executable, ...argv], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, timeout: 10000 });
      assert.equal(result.status, 2, result.stderr); assert.equal(JSON.parse(result.stderr).model_calls, 0); assert.equal(existsSync(marker), false);
    }
    const help = spawnSync(process.execPath, [executable, "--help"], { encoding: "utf8", timeout: 10000 }); assert.equal(help.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("source bridge is additive: imports real #197 verifiers, not an injectable echo", () => {
  const source = readFileSync(resolve(root, "scripts/ask-benchmark-prompt-successor-bridge.mjs"), "utf8");
  assert.match(source, /normalizer\.verifyNormalizedPortfolioResults\(/u);
  assert.match(source, /scorer\.validatePortfolioEngineeringResult\(/u);
  assert.match(source, /resultSets\.validateEngineeringResultSourceManifest\(/u);
  assert.doesNotMatch(source, /rawScoreAuthorityResolver|spawnSync|execFileSync/u);
});

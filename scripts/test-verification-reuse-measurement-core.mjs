import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessReview, closed, compareConditions, digest, measurementDelta, measurementSum,
  observed, QUALITY_KEYS, reviewOutputSchema, summarizeCondition, TOKEN_KEYS, unavailable, validateReview } from "./verification-reuse-measurement-core.mjs";
import { captureProcess, codexIdentity, parseCodexReviewStream, runCodexReview } from "./verification-review-runtime.mjs";

const request = Object.freeze({ request_digest: digest("request"), target_revision: "a".repeat(40),
  paths: ["src/limit.mjs"], obligations: [{ ref: "AC-limit", path: "src/limit.mjs" }],
  judgment_refs: ["delta:source-test"], material: [{ path: "src/limit.mjs", content: "public fixture" }] });
const pass = () => ({ request_digest: request.request_digest, target_revision: request.target_revision,
  reviewed_paths: [...request.paths], reviewed_obligations: ["AC-limit"], judgment_refs: [...request.judgment_refs], findings: [], decision: "pass" });
const blocker = { path: "src/limit.mjs", obligation_ref: "AC-limit", severity: "blocker" };
const stream = (result = pass(), usage = { input_tokens: 123, cached_input_tokens: 100, output_tokens: 9 }) => [
  { type: "thread.started", thread_id: "ephemeral-test-thread" }, { type: "turn.started" },
  { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(result) } },
  { type: "turn.completed", usage },
].map(JSON.stringify).join("\n");
function row(executions = 2, quality = { status: "pass", counts: Object.fromEntries(QUALITY_KEYS.map((key) => [key, 0])) }) {
  return { required_gate_count: 2, reuse_exact: 0, reuse_scoped: 2 - executions, rerun_required: executions, blocked_uncovered: 0,
    deterministic_gate_executions: executions, verification_attempts: executions, review_dispatches: 1,
    ai_review_requests: observed(1), ...Object.fromEntries(TOKEN_KEYS.map((key) => [key, observed(10)])),
    elapsed_time: observed(100), deterministic_elapsed_ms: observed(20), independent_judgments: observed(1), quality };
}

test("closed model output is bound to the exact target, package, paths and obligations", () => {
  assert.deepEqual(validateReview(pass(), request), pass());
  assert.equal(reviewOutputSchema(request).additionalProperties, false);
  for (const mutation of [
    (r) => { r.target_revision = "b".repeat(40); }, (r) => { r.request_digest = digest("another"); },
    (r) => { r.reviewed_paths = ["../private"]; }, (r) => { r.reviewed_obligations = ["AC-other"]; },
    (r) => { r.judgment_refs = ["approval:developer"]; }, (r) => { r.raw_transcript = "not allowed"; },
    (r) => { r.findings = [{ ...blocker, path: "src/other.mjs" }]; r.decision = "block"; },
    (r) => { r.findings = [blocker, blocker]; r.decision = "block"; },
    (r) => { r.findings = [blocker]; }, (r) => { r.reviewed_paths.push(r.reviewed_paths[0]); },
  ]) { const candidate = pass(); mutation(candidate); assert.throws(() => validateReview(candidate, request)); }
});

test("closed records reject coercion, getters, hidden fields and symbols", () => {
  let called = false;
  assert.throws(() => closed(Object.defineProperty({}, "x", { enumerable: true, get: () => { called = true; return 1; } }), ["x"], "probe"));
  assert.equal(called, false);
  assert.throws(() => closed(Object.defineProperty({}, "x", { value: 1 }), ["x"], "probe"));
  assert.throws(() => closed({ x: 1, [Symbol("hidden")]: 2 }, ["x"], "probe"));
  assert.doesNotThrow(() => closed(Object.assign(Object.create(null), { x: 1 }), ["x"], "probe"));
});

test("missed blocker, independent judgment and requirement cannot be cost successes", () => {
  const missed = assessReview({ request, result: pass(), expectedFindings: [blocker], coverageStatus: "covered" });
  assert.equal(missed.counts.missed_blockers, 1); assert.equal(missed.counts.false_completion, 1);
  const incomplete = pass(); incomplete.judgment_refs = []; incomplete.reviewed_obligations = [];
  const quality = assessReview({ request, result: incomplete, expectedFindings: [], coverageStatus: "blocked" });
  assert.equal(quality.counts.required_independent_judgment_omission, 1);
  assert.equal(quality.counts.missed_requirements, 1); assert.equal(quality.counts.false_completion, 0);
  const compared = compareConditions(summarizeCondition([row(2)]), summarizeCondition([row(0, missed)]));
  assert.equal(compared.gate_execution_delta, -2); assert.equal(compared.decision, "harmful");
  assert.equal(compared.issue_close_eligible, false);
});

test("correct blocker is not a missed obligation, false positive or false completion", () => {
  const result = { ...pass(), findings: [blocker], decision: "block" };
  assert.equal(assessReview({ request, result, expectedFindings: [blocker], coverageStatus: "blocked" }).status, "pass");
  assert.equal(assessReview({ request, result, expectedFindings: [], coverageStatus: "blocked" }).counts.false_positive_findings, 1);
  assert.equal(assessReview({ request, result: pass(), expectedFindings: [], coverageStatus: "covered", executionCovered: false }).counts.stale_evidence_acceptance, 1);
});

test("unsafe action remains harmful even when other quality dimensions are unobserved", () => {
  const quality = assessReview({ qualityViolation: "unsafe_action" });
  assert.equal(quality.status, "fail"); assert.equal(quality.counts, null);
  const reuse = summarizeCondition([row(0, quality)]);
  assert.deepEqual(reuse.quality_outcomes.violations, ["unsafe_action"]);
  assert.equal(compareConditions(summarizeCondition([row(2)]), reuse).decision, "harmful");
});

test("partial native telemetry stays unavailable rather than summing a partial subset", () => {
  assert.equal(measurementSum([observed(10), unavailable()]).value, null);
  assert.equal(measurementSum([]).status, "unavailable");
  assert.equal(measurementSum([observed(0), observed(0)]).value, 0);
  assert.equal(measurementDelta(observed(10), unavailable()).value, null);
  for (const value of [-1, 0.1, NaN, Infinity, "4", null]) assert.throws(() => observed(value));
  assert.throws(() => measurementSum([{ status: "unavailable", value: 0, reason: "missing" }]));
  const partial = row(1); partial.input_tokens = unavailable();
  assert.equal(summarizeCondition([row(), partial]).input_tokens.status, "unavailable");
});

test("partial comparisons never become successful even with fewer recorded executions", () => {
  const baseline = summarizeCondition([row(2)]); const reuse = summarizeCondition([row(0)]);
  assert.equal(compareConditions(baseline, reuse, { complete: false }).decision, "insufficient evidence");
  assert.equal(compareConditions(baseline, reuse).decision, "bounded benefit");
  assert.equal(compareConditions(baseline, baseline).decision, "neutral");
  assert.deepEqual(compareConditions(baseline, reuse), compareConditions(structuredClone(baseline), structuredClone(reuse)));
});

test("native stream records observed token classes and separates upstream HTTP requests", () => {
  const parsed = parseCodexReviewStream(stream(), request);
  assert.equal(parsed.usage.input_tokens.value, 123); assert.equal(parsed.usage.cached_tokens.value, 100);
  assert.equal(parsed.model_review_invocations.value, 1); assert.equal(parsed.upstream_model_requests.value, null);
  const missing = parseCodexReviewStream(stream(pass(), {}), request);
  assert.ok(Object.values(missing.usage).every((value) => value.status === "unavailable" && value.value === null));
});

test("native provider errors, wrong targets, tools, partial streams and invalid token counters fail closed", () => {
  for (const text of ["not JSON", stream() + "\n" + JSON.stringify({ type: "turn.completed", usage: {} }),
    stream().split("\n").slice(0, -1).join("\n"), stream({ ...pass(), target_revision: "b".repeat(40) }),
    stream(pass(), { input_tokens: 1, cached_input_tokens: 2 }), stream(pass(), { input_tokens: -1 }),
    stream() + '\n{"type":"error","message":"private error"}',
    stream() + '\n{"type":"unknown.future.event"}',
    stream().replace('"input_tokens":123', '"input_tokens":0,"input_tokens":123'),
    stream().replace('\\"decision\\":\\"pass\\"', '\\"decision\\":\\"block\\",\\"decision\\":\\"pass\\"'),
  ]) assert.throws(() => parseCodexReviewStream(text, request));
  assert.throws(() => parseCodexReviewStream(stream() + '\n{"type":"item.completed","item":{"type":"command_execution"}}', request), (error) => error.code === "unsafe_action");
});

test("bounded process adapter handles real fake-provider success, exit, timeout and output overflow", async () => {
  const options = { cwd: tmpdir(), env: { PATH: process.env.PATH }, input: "public fixture", timeoutMs: 2000 };
  const success = await captureProcess(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>console.log('ok'))"], options);
  assert.equal(success.status, "succeeded"); assert.equal(success.stdout.trim(), "ok");
  const failure = await captureProcess(process.execPath, ["-e", "console.error('private sentinel');process.exit(2)"], options);
  assert.equal(failure.status, "failed"); assert.equal(failure.stdout, "");
  assert.equal((await captureProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...options, timeoutMs: 100 })).reason, "runtime_timeout");
  assert.equal((await captureProcess(process.execPath, ["-e", "console.log('x'.repeat(10000))"], { ...options, maxBytes: 100 })).reason, "runtime_output_bound");
});

test("Codex preflight rejects missing credentials and nonmatching executable pins", async () => {
  const missing = await runCodexReview({ binary: "/not/installed", identity: {}, model: "operator-selected", request, apiKey: null });
  assert.equal(missing.reason, "api_key_unavailable"); assert.equal(missing.usage.input_tokens.value, null);
  assert.throws(() => codexIdentity(process.execPath, "codex-cli 1.0.0"));
});

test("pinned native adapter is executable with an explicitly fake binary; metadata does not invalidate its pin", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "ask-fake-codex-")); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const binary = join(parent, "fake-codex");
  writeFileSync(binary, `#!${process.execPath}\nimport fs from 'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 1.0.0');process.exit(0)}
if(!process.argv.includes('--ephemeral')||!process.argv.includes('--output-schema')||!process.argv.includes('features.apps=false')||!process.argv.includes('features.shell_snapshot=false'))process.exit(3);
const input=fs.readFileSync(0,'utf8').trim().split('\\n');const r=JSON.parse(input.at(-1));
const result={request_digest:r.request_digest,target_revision:r.target_revision,reviewed_paths:r.paths,reviewed_obligations:r.obligations.map(x=>x.ref),judgment_refs:r.judgment_refs,findings:[],decision:'pass'};
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:7,cached_input_tokens:0,output_tokens:3}}));
`, { mode: 0o700 });
  const identity = { status: "observed", ...codexIdentity(binary, "codex-cli 1.0.0"), model: "test-only", reasoning_effort: "medium" };
  const result = await runCodexReview({ binary, identity, model: "test-only", request, apiKey: "test-fixture-not-a-credential" });
  assert.equal(result.status, "succeeded", result.reason); assert.equal(result.usage.input_tokens.value, 7);
  const changed = await runCodexReview({ binary, identity: { ...identity, binary_digest: digest("different") }, model: "test-only", request, apiKey: "test-fixture-not-a-credential" });
  assert.equal(changed.reason, "runtime_identity_changed");
  // This test is adapter protocol evidence ONLY; it is never included in live measurement results.
});

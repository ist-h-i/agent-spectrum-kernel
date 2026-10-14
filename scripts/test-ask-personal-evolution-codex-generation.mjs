import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { preparePersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { inspectPersonalEvolutionGenerationStatus, verifyPersonalEvolutionGenerationExecution } from "./ask-personal-evolution-generation-connector.mjs";
import { inspectPreparedPersonalEvolutionCodexGeneration, inspectPreparedPersonalEvolutionCodexGenerationFile,
  startPreparedPersonalEvolutionCodexGeneration } from "./ask-personal-evolution-codex-generation.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const fixture = join(ROOT, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"), "utf8"));
const adapter = reference.adapters[0];
const sourcePaths = ["scripts/ask-personal-evolution-codex-generation.mjs", "scripts/codex-exec-runner.mjs",
  "scripts/ask-personal-evolution-generation-connector.mjs", "scripts/ask-personal-evolution-generation.mjs"];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const git = (cwd, argv) => { const r = spawnSync("git", argv, { cwd, encoding: "utf8", shell: false });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-codex-generation-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source"); mkdirSync(join(sourceRoot, "scripts"), { recursive: true });
  for (const path of sourcePaths) cpSync(join(ROOT, path), join(sourceRoot, path));
  git(sourceRoot, ["init", "-q"]); git(sourceRoot, ["add", "scripts"]);
  git(sourceRoot, ["-c", "user.name=Public Fake", "-c", "user.email=fake@example.invalid", "-c", "commit.gpgsign=false",
    "-c", "core.hooksPath=/dev/null", "commit", "-qm", "public adapter test source"]);
  const storeRoot = join(root, "store"); cpSync(join(fixture, "store"), storeRoot, { recursive: true });
  const candidate = read(storeRoot, adapter.evolution.candidate_object_digest);
  const keys = ["candidate_id", "parent_asset", "parent_portfolio", "registry", "factors", "evaluation_scope",
    "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const trust = { trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts };
  const prepared = preparePersonalEvolutionGenerationRequest({ storeRoot, ...trust,
    observationInput: { observation_id: "public-development-correction", repository_id: reference.registry.repository_id,
      task_ids: ["synthetic-development-task"], evidence_refs: [{ artifact_id: "public-correction", digest: canonicalDigest("independent public correction") }],
      evidence_status: "Supported", correction: "Confirm public runtime contracts during preparation.",
      intended_mechanism: "Bind preparation to observed public interfaces.", applicability: "Public development preparation.",
      non_applicability: ["Does not decide owner policy."],
      privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } },
    blueprint: Object.fromEntries(keys.map(key => [key, candidate[key]])), generationActor: candidate.generation.actor,
    holdoutTaskIds: [candidate.evaluation_scope.fixture_ids[0]], requestedVersion: "234.0.1-codex-generation", requestId: "codex-generation-request" });
  const options = { storeRoot, sourceRoot, ...trust, requestObjectDigest: prepared.request_object_digest,
    workspaceRoot: join(root, "workspace"), executable: "codex", timeoutMs: 60 * 60 * 1000 };
  return { root, options, prepared, trust };
}
function fakeTransport(transform = x => x, effects = () => {}) {
  const calls = [], signals = [];
  const spawnProcess = (executable, argv, options) => {
    const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let input = ""; child.stdin.on("data", chunk => { input += chunk.toString("utf8"); });
    const close = (code, signal = null) => { child.exitCode = code; child.signalCode = signal;
      child.emit("exit", code, signal); child.emit("close", code, signal); };
    child.kill = signal => { signals.push(signal); queueMicrotask(() => close(null, signal)); return true; };
    child.unref = () => {};
    child.stdin.on("finish", () => {
      const payload = JSON.parse(input.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
      const call = { executable, argv: [...argv], options, input, payload, initialWorkspace: readdirSync(options.cwd) }; calls.push(call);
      const result = transform({ status: "completed", files: payload.parent_files.map(file => ({ path: file.path,
        text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + "\nConfirm public runtime contracts during preparation.\n" })) }, call);
      const path = argv[argv.indexOf("--output-last-message") + 1];
      if (result !== null) writeFileSync(path, typeof result === "string" ? result : JSON.stringify(result));
      const outcome = effects(call, { child, close, path }) ?? {};
      if (!outcome.wait) queueMicrotask(() => close(outcome.exitCode ?? 0));
    });
    queueMicrotask(() => child.emit("spawn")); return child;
  };
  return { calls, signals, dependencies: { spawnProcess } };
}
const confirm = p => ({ confirmedRequestObjectDigest: p.request_object_digest, confirmedPreparationDigest: p.preparation_digest });
const verify = (f, outcome) => verifyPersonalEvolutionGenerationExecution({ storeRoot: f.options.storeRoot,
  requestObjectDigest: f.options.requestObjectDigest, executionReceiptObjectDigest: outcome.execution_receipt_object_digest, ...f.trust });

test("inspect fixes public input/source/paths with no dispatch or new workspace", t => {
  const f = setup(t), transport = fakeTransport();
  const before = listContentAddressedJson({ storeRoot: f.options.storeRoot }).map(x => x.digest);
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  assert.equal(p.status, "NOT_RUN"); assert.equal(p.models_started, false); assert.equal(transport.calls.length, 0);
  assert.equal(p.ambient_context, "Unknown"); assert.equal(p.runtime_identity, "Unknown");
  assert.equal(p.input.requested_action, "produce_candidate_files_only");
  assert.equal(p.input.generator.source_revision, git(f.options.sourceRoot, ["rev-parse", "HEAD"]));
  assert.equal(p.input.generator.execution_kind, "fake");
  assert.deepEqual(Object.keys(p.input).sort(), ["generator", "observation", "parent_asset", "parent_files",
    "request_digest", "request_object_digest", "requested_action", "requested_version"]);
  assert.ok(!JSON.stringify(p.input).includes(f.prepared.request.holdout_task_ids[0]));
  assert.ok(!JSON.stringify(p.input).includes(f.options.storeRoot));
  assert.equal(readdirSync(f.root).includes("workspace"), false);
  assert.deepEqual(listContentAddressedJson({ storeRoot: f.options.storeRoot }).map(x => x.digest), before);
});

for (const [label, transform] of [
  ["non-JSON", () => "not JSON"],
  ["incomplete JSON", () => '{"status":"completed","files":['],
  ["duplicate JSON keys", () => '{"status":"completed","status":"failed","files":[]}'],
  ["model descriptor/authority", x => ({ ...x, candidate_descriptor: { safety: "verified" } })],
  ["unknown status", x => ({ ...x, status: "approved" })],
  ["missing completed file", x => ({ ...x, files: x.files.slice(1) })],
  ["duplicate paths", x => ({ ...x, files: [...x.files, x.files[0]] })],
  ["traversal", x => ({ ...x, files: [{ ...x.files[0], path: "../escape.md" }] })],
  ["absolute path", x => ({ ...x, files: [{ ...x.files[0], path: "/tmp/escape.md" }] })],
  ["foreign file", x => ({ ...x, files: [{ ...x.files[0], path: "new-scope.md" }] })],
  ["extra file fields", x => ({ ...x, files: [{ ...x.files[0], media_type: "application/javascript" }] })],
  ["empty file", x => ({ ...x, files: x.files.map(file => ({ ...file, text: "" })) })],
  ["NUL file", x => ({ ...x, files: x.files.map(file => ({ ...file, text: "\0" })) })],
  ["lone surrogate", x => ({ ...x, files: x.files.map(file => ({ ...file, text: "\ud800" })) })],
  ["candidate byte limit", x => ({ ...x, status: "partial", files: [{ ...x.files[0], text: "x".repeat(512 * 1024 + 1) }] })],
]) test("holds " + label + " before writing/importing any model files", async t => {
  const f = setup(t), transport = fakeTransport(transform);
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.imported, null); assert.equal(outcome.receipt.files.length, 0);
  assert.equal(verify(f, outcome).status, "held"); assert.equal(transport.calls.length, 1);
  assert.deepEqual(readdirSync(join(f.options.workspaceRoot, "candidate")), []);
});

for (const status of ["partial", "failed"]) test(status + " retains bounded useful files without descriptor/import", async t => {
  const f = setup(t), transport = fakeTransport(x => ({ status, files: x.files.slice(0, 1) }));
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.receipt.provider_status, status);
  assert.equal(outcome.receipt.files.length, 1); assert.equal(outcome.imported, null); assert.equal(verify(f, outcome).status, "held");
});

test("nonzero exit retains useful bounded output as partial, without stdout/stderr disclosure", async t => {
  const f = setup(t), transport = fakeTransport(x => x, (call, { child }) => {
    child.stderr.emit("data", "synthetic-private-error-sentinel"); return { exitCode: 1 };
  });
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.receipt.provider_status, "partial");
  assert.ok(outcome.receipt.files.length > 0); assert.equal(outcome.execution.exitCode, 1);
  assert.equal(JSON.stringify(outcome).includes("synthetic-private-error-sentinel"), false); assert.equal(verify(f, outcome).status, "held");
});

for (const [label, effects] of [
  ["timeout", () => ({ wait: true })],
  ["stream failure", (call, { child }) => { child.stderr.emit("error", new Error("synthetic transport failure")); return { wait: true }; }],
  ["output limit", (call, { child }) => { child.stdout.emit("data", Buffer.alloc(10 * 1024 * 1024 + 1)); return { wait: true }; }],
]) test(label + " uses existing runner termination and holds useful output", async t => {
  const f = setup(t); f.options.timeoutMs = 10; const transport = fakeTransport(x => x, effects);
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.receipt.provider_status, "partial");
  assert.ok(outcome.receipt.files.length > 0); assert.ok(transport.signals.includes("SIGTERM"));
  assert.equal(outcome.execution.terminationConfirmed, true); assert.equal(verify(f, outcome).status, "held");
});

test("AbortSignal cancellation is held and never resumes", async t => {
  const f = setup(t), abort = new AbortController(), transport = fakeTransport(x => x, () => { abort.abort(); return { wait: true }; });
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p), { signal: abort.signal });
  assert.equal(outcome.execution.interrupted, true); assert.equal(outcome.status, "held");
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p)), /opaque/);
  assert.equal(transport.calls.length, 1); assert.equal(verify(f, outcome).status, "held");
});

test("cleanup failure cannot read/import a final response", async t => {
  const f = setup(t); f.options.timeoutMs = 10;
  const transport = fakeTransport(x => x, (call, { child, close }) => {
    child.kill = signal => { queueMicrotask(() => close(null, signal)); return false; }; return { wait: true };
  });
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.execution.cleanup_error, true);
  assert.equal(outcome.receipt.files.length, 0); assert.equal(verify(f, outcome).status, "held");
});

test("launch failure is consumed once without publishing error text", async t => {
  const f = setup(t); let called = 0;
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, { spawnProcess: () => {
    called++; throw new Error("synthetic-private-launch-sentinel");
  } });
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.execution.spawnObserved, false); assert.equal(outcome.execution.process_error, true);
  assert.equal(JSON.stringify(outcome).includes("synthetic-private-launch-sentinel"), false); assert.equal(called, 1);
  assert.equal(inspectPersonalEvolutionGenerationStatus({ storeRoot: f.options.storeRoot, requestObjectDigest: f.options.requestObjectDigest, ...f.trust }).status, "held");
});

for (const [label, effects] of [
  ["symlink capture", (f, call, { path }) => { rmSync(path); symlinkSync(join(f.root, "private-canary.txt"), path); }],
  ["hardlink capture", (f, call, { path }) => { rmSync(path); linkSync(join(f.root, "private-canary.txt"), path); }],
  ["symlink output root", (f, call) => { const target = join(f.options.workspaceRoot, "candidate"); rmSync(target, { recursive: true }); symlinkSync(f.root, target); }],
  ["undeclared output", (f, call) => { writeFileSync(join(f.options.workspaceRoot, "candidate", "undeclared.md"), "synthetic extra"); }],
]) test(label + " holds without following foreign content or importing", async t => {
  const f = setup(t); writeFileSync(join(f.root, "private-canary.txt"), "synthetic-private-file-sentinel");
  const transport = fakeTransport(x => x, (call, owned) => { effects(f, call, owned); });
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.imported, null);
  assert.equal(JSON.stringify(outcome).includes("synthetic-private-file-sentinel"), false);
  assert.equal(transport.calls[0].input.includes("synthetic-private-file-sentinel"), false);
  assert.equal(readFileSync(join(f.root, "private-canary.txt"), "utf8"), "synthetic-private-file-sentinel");
  assert.equal(verify(f, outcome).status, "held");
});

test("source drift after inspection refuses dispatch before claiming invocation", async t => {
  const f = setup(t), transport = fakeTransport();
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  writeFileSync(join(f.options.sourceRoot, sourcePaths[0]), "source drift");
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p)), /source transplant|source drift/);
  assert.equal(transport.calls.length, 0);
  assert.equal(inspectPersonalEvolutionGenerationStatus({ storeRoot: f.options.storeRoot, requestObjectDigest: f.options.requestObjectDigest, ...f.trust }).status, "NOT_RUN");
});

test("confirmation pins both inspected request and preparation", async t => {
  const f = setup(t), transport = fakeTransport(), p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, { ...confirm(p), confirmedRequestObjectDigest: canonicalDigest("foreign") }), /fixed request/);
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, { ...confirm(p), confirmedPreparationDigest: canonicalDigest("foreign") }), /inspected preparation/);
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration({ ...p.handle }, confirm(p)), /opaque/);
  assert.equal(transport.calls.length, 0);
  f.options.executable = "replacement-must-not-run"; f.options.timeoutMs = 1;
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "candidate_ready"); assert.equal(transport.calls[0].executable, "codex");
});

for (const [label, mutate] of [
  ["CLI args", x => { x.argv = ["--dangerously-bypass-approvals-and-sandbox"]; }],
  ["environment", x => { x.env = { PATH: "foreign" }; }],
  ["private evaluator path", x => { x.privateEvaluatorRoot = "/synthetic-private-not-read"; }],
  ["timeout", x => { x.timeoutMs = 0; }],
  ["existing workspace", x => { mkdirSync(x.workspaceRoot); writeFileSync(join(x.workspaceRoot, "old.md"), "synthetic old"); }],
  ["store overlap", x => { x.workspaceRoot = join(x.storeRoot, "workspace"); }],
  ["source overlap", x => { x.workspaceRoot = join(x.sourceRoot, "workspace"); }],
]) test("inspect rejects " + label + " without dispatch", t => {
  const f = setup(t), transport = fakeTransport(); mutate(f.options);
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies)); assert.equal(transport.calls.length, 0);
});

test("accessors/proxies/callbacks are refused as preparation data", t => {
  const f = setup(t); let getter = 0;
  const accessor = { ...f.options }; Object.defineProperty(accessor, "executable", { enumerable: true, get() { getter++; return "foreign"; } });
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGeneration(accessor), /accessor/); assert.equal(getter, 0);
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGeneration(new Proxy(f.options, {})), /plain/);
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGeneration({ ...f.options, provider: () => {} }));
});

test("file inspection binds raw context bytes and derives real declared identity without starting CLI", t => {
  const f = setup(t), path = join(f.root, "context.json"), bytes = Buffer.from(JSON.stringify(f.options)); writeFileSync(path, bytes);
  const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  const p = inspectPreparedPersonalEvolutionCodexGenerationFile(path, digest);
  assert.equal(p.input.generator.execution_kind, "supervised_model"); assert.equal(p.models_started, false);
  writeFileSync(path, JSON.stringify({ ...f.options, timeoutMs: 5 }));
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGenerationFile(path, digest), /file drift/);
});

test("file inspection rejects malformed UTF-8 with a matching raw digest without dispatch", t => {
  const f = setup(t), path = join(f.root, "context.json");
  const valid = Buffer.from(JSON.stringify({ ...f.options, executable: "codex-\uFFFD" }));
  const offset = valid.indexOf(Buffer.from("\uFFFD"));
  assert.ok(offset >= 0);
  const bytes = Buffer.concat([valid.subarray(0, offset), Buffer.from([0xff]), valid.subarray(offset + 3)]);
  const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  const before = listContentAddressedJson({ storeRoot: f.options.storeRoot }).map(x => x.digest);
  writeFileSync(path, bytes);
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGenerationFile(path, digest), /not valid UTF-8 JSON/);
  assert.equal(readdirSync(f.root).includes("workspace"), false);
  assert.equal(readdirSync(f.options.storeRoot).includes("personal-generation-invocations"), false);
  assert.deepEqual(listContentAddressedJson({ storeRoot: f.options.storeRoot }).map(x => x.digest), before);
});

test("request byte drift refuses dispatch and preserves the unclaimed state", async t => {
  const f = setup(t), transport = fakeTransport(), p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const saved = readContentAddressedJson({ storeRoot: f.options.storeRoot, digest: f.options.requestObjectDigest });
  writeFileSync(saved.path, '{"tampered":true}\n');
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p)));
  assert.equal(transport.calls.length, 0); assert.equal(readdirSync(f.options.storeRoot).includes("personal-generation-invocations"), false);
});

test("concurrent inspected handles still use one existing durable invocation", async t => {
  const f = setup(t), transport = fakeTransport();
  const first = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const second = inspectPreparedPersonalEvolutionCodexGeneration({ ...f.options, workspaceRoot: join(f.root, "second-workspace") }, transport.dependencies);
  const running = startPreparedPersonalEvolutionCodexGeneration(first.handle, confirm(first));
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(second.handle, confirm(second)), /consumed/);
  assert.equal((await running).status, "candidate_ready"); assert.equal(transport.calls.length, 1);
});

for (const [label, transform, effects] of [
  ["missing final JSON", () => null, () => {}],
  ["invalid capture UTF-8", x => x, (call, { path }) => { writeFileSync(path, Buffer.from([255])); }],
  ["capture size limit", x => x, (call, { path }) => { writeFileSync(path, Buffer.alloc(4 * 1024 * 1024 + 1)); }],
]) test(label + " cannot import on exit zero", async t => {
  const f = setup(t), transport = fakeTransport(transform, effects);
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.execution.exitCode, 0); assert.equal(outcome.receipt.files.length, 0);
  assert.equal(verify(f, outcome).status, "held");
});

test("unconfirmed termination holds without reading the final message", async t => {
  const f = setup(t); f.options.timeoutMs = 10;
  const transport = fakeTransport(x => x, (call, { child }) => { child.kill = () => true; return { wait: true }; });
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "held"); assert.equal(outcome.execution.terminationConfirmed, false);
  assert.equal(outcome.execution.cleanup_error, true); assert.equal(outcome.receipt.files.length, 0);
  assert.equal(verify(f, outcome).status, "held");
});

test("start refuses extra controls/accessors before consumption", async t => {
  const f = setup(t), transport = fakeTransport(), p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p), { argv: ["foreign"] }), /cancellation/);
  let getters = 0; const controls = {}; Object.defineProperty(controls, "signal", { get() { getters++; return null; } });
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p), controls), /cancellation/);
  assert.equal(getters, 0); assert.equal(transport.calls.length, 0);
});

test("no changed Markdown can still produce an exploratory revision with no effectiveness claim", async t => {
  const f = setup(t), transport = fakeTransport((x, call) => ({ status: "completed", files: call.payload.parent_files.map(file => ({
    path: file.path, text: Buffer.from(file.bytes_base64, "base64").toString("utf8") })) }));
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(outcome.status, "candidate_ready"); assert.equal(outcome.generation_effectiveness, "Unknown");
  assert.deepEqual(outcome.receipt.files.map(({ path, raw_digest }) => ({ path, raw_digest })),
    p.input.parent_files.map(({ path, raw_digest }) => ({ path, raw_digest })));
});

test("fake Codex session reaches candidate import and verified existing once receipt", async t => {
  const f = setup(t), transport = fakeTransport();
  const previous = listContentAddressedJson({ storeRoot: f.options.storeRoot }).map(item => ({ digest: item.digest,
    bytes: readContentAddressedJson({ storeRoot: f.options.storeRoot, digest: item.digest }).bytes }));
  const p = inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies);
  const outcome = await startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p));
  assert.equal(transport.calls.length, 1); const call = transport.calls[0];
  assert.deepEqual(call.initialWorkspace, []); assert.equal(call.options.shell, false); assert.equal(call.options.detached, false);
  assert.equal(Object.hasOwn(call.options, "env"), false, "ordinary runtime remains inherited and uninspected");
  assert.deepEqual(call.argv, ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--json", "--output-last-message",
    join(f.options.workspaceRoot, "session", "last-message.json"), "-"]);
  assert.equal(outcome.status, "candidate_ready", JSON.stringify({ failure: outcome.receipt.failure_code, execution: outcome.execution }));
  assert.equal(verify(f, outcome).status, "candidate_ready");
  const descriptor = read(f.options.storeRoot, outcome.receipt.candidate_asset.record_digest);
  const parent = read(f.options.storeRoot, f.prepared.request.blueprint.parent_asset.record_digest);
  assert.deepEqual(descriptor.applicability.task_classes, parent.applicability.task_classes);
  assert.equal(descriptor.safety.status, "not_evaluated"); assert.equal(descriptor.evaluation_history.status, "not_evaluated");
  assert.deepEqual(descriptor.derivation.parent, p.input.parent_asset); assert.deepEqual(descriptor.maintenance.rollback.target, p.input.parent_asset);
  assert.equal(descriptor.source.revision, p.input.generator.source_revision);
  assert.equal(outcome.authority_implied, false); assert.equal(outcome.generation_effectiveness, "Unknown");
  for (const old of previous) assert.ok(readContentAddressedJson({ storeRoot: f.options.storeRoot, digest: old.digest }).bytes.equals(old.bytes));
  await assert.rejects(startPreparedPersonalEvolutionCodexGeneration(p.handle, confirm(p)), /opaque/);
  assert.throws(() => inspectPreparedPersonalEvolutionCodexGeneration(f.options, transport.dependencies), /fresh|NOT_RUN|consumed/);
  assert.equal(transport.calls.length, 1);
});

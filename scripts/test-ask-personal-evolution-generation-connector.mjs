import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { preparePersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { inspectPersonalEvolutionGenerationStatus, runPersonalEvolutionGeneration, verifyPersonalEvolutionGenerationExecution } from "./ask-personal-evolution-generation-connector.mjs";
import { inspectPersonalEvolutionGenerationStatusFile } from "./ask-personal-evolution-status.mjs";

const fixture = resolve(import.meta.dirname, "../docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"), "utf8"));
const adapter = reference.adapters[0];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const rawDigest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const privacy = { classification: "caller_reviewed_asset_source", private_answers_included: false, raw_task_history_included: false };

function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-generation-connector-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = join(root, "store"); cpSync(join(fixture, "store"), storeRoot, { recursive: true });
  const candidate = read(storeRoot, adapter.evolution.candidate_object_digest);
  const keys = ["candidate_id", "parent_asset", "parent_portfolio", "registry", "factors", "evaluation_scope",
    "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const trust = { trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts };
  const request = preparePersonalEvolutionGenerationRequest({ storeRoot, ...trust,
    observationInput: { observation_id: "connector-public-correction", repository_id: reference.registry.repository_id,
      task_ids: ["observed-review"], evidence_refs: [{ artifact_id: "review-summary", digest: canonicalDigest("public summary") }],
      evidence_status: "Supported", correction: "Bind blockers to the explicit requirement target.",
      intended_mechanism: "Use explicit target and requirement scope in reviews.", applicability: "Optional requirement reviews.",
      non_applicability: ["Owner policy remains unresolved."],
      privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } },
    blueprint: Object.fromEntries(keys.map(key => [key, candidate[key]])), generationActor: candidate.generation.actor,
    holdoutTaskIds: [candidate.evaluation_scope.fixture_ids[0]], requestedVersion: "234.0.1-connector", requestId: "connector-request-1" });
  const { object_kind: ignored, ...descriptor } = structuredClone(read(storeRoot, adapter.candidate_asset.record_digest));
  descriptor.version = request.request.requested_version;
  descriptor.safety = { status: "not_evaluated", classifications: [], constraint_refs: [] };
  descriptor.mechanism_and_evidence = { status: "not_evaluated", mechanism_refs: [], evidence_refs: [] };
  descriptor.evaluation_history = { status: "not_evaluated", evidence_refs: [], cost: null };
  const identity = { provider_id: "deterministic-public-file-producer", version: "1.0.0",
    source_revision: descriptor.source.revision, implementation_digest: canonicalDigest("fake provider v1"), execution_kind: "fake" };
  const args = { storeRoot, ...trust, workspaceRoot: join(root, "workspace"),
    requestObjectDigest: request.request_object_digest, confirmedRequestObjectDigest: request.request_object_digest,
    provider: { identity, generate: async ({ input, outputRoot }) => {
      descriptor.content = { package_format: "canonical_json_base64_files", files: input.parent_files.map(file => {
        const bytes = Buffer.concat([Buffer.from(file.bytes_base64, "base64"), Buffer.from("\nBind blockers to the explicit requirement target.\n")]);
        const path = join(outputRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
        return { path: file.path, media_type: file.media_type, raw_digest: rawDigest(bytes) };
      }) };
      descriptor.type_extension.entrypoints = descriptor.content.files.map(file => file.path);
      descriptor.type_extension.renderer.projection_digest = canonicalDigest(descriptor.content.files.map(({ path, raw_digest }) => ({ path, raw_digest })));
      return { request_digest: input.request_digest, input_digest: canonicalDigest(input), generator: structuredClone(identity),
        status: "completed", files: descriptor.content.files.map(({ path, raw_digest }) => ({ path, raw_digest })),
        candidate_descriptor: descriptor, privacy: structuredClone(privacy) };
    } } };
  return { root, args, request, descriptor, trust };
}
const invokeDir = args => join(args.storeRoot, "personal-generation-invocations", args.requestObjectDigest.slice(7));
const verify = (args, outcome) => verifyPersonalEvolutionGenerationExecution({ storeRoot: args.storeRoot,
  requestObjectDigest: args.requestObjectDigest, executionReceiptObjectDigest: outcome.execution_receipt_object_digest,
  trustedPortfolioAuthorityContexts: args.trustedPortfolioAuthorityContexts });

test("fake provider receives public exact input and produces verified receipt through existing import", async t => {
  const { args, request } = setup(t);
  const before = listContentAddressedJson({ storeRoot: args.storeRoot }).map(({ digest }) => ({ digest, value: read(args.storeRoot, digest) }));
  const generate = args.provider.generate;
  let calls = 0;
  args.provider.generate = async context => {
    calls++;
    assert.deepEqual(Object.keys(context).sort(), ["input", "outputRoot"]);
    assert.deepEqual(Object.keys(context.input).sort(), ["generator", "observation", "parent_asset", "parent_files",
      "request_digest", "request_object_digest", "requested_action", "requested_version"]);
    assert.equal(context.input.request_digest, request.request.request_digest);
    assert.deepEqual(context.input.parent_asset, request.request.blueprint.parent_asset);
    assert.equal(context.input.requested_action, "produce_candidate_files_only");
    assert.equal(Object.isFrozen(context.input.parent_files[0]), true);
    assert.equal(context.outputRoot, join(args.workspaceRoot, "candidate"));
    return generate(context);
  };
  const outcome = await runPersonalEvolutionGeneration(args);
  assert.equal(calls, 1); assert.equal(outcome.status, "candidate_ready");
  assert.equal(outcome.receipt.model_execution, "not_applicable"); assert.equal(outcome.authority_implied, false);
  assert.equal(outcome.generation_effectiveness, "Unknown");
  assert.deepEqual(outcome.receipt.generator, args.provider.identity);
  assert.ok(outcome.receipt.files.length > 0);
  assert.equal(outcome.receipt.candidate_asset.version, request.request.requested_version);
  const count = listContentAddressedJson({ storeRoot: args.storeRoot }).length;
  assert.equal(verify(args, outcome).status, "candidate_ready");
  assert.equal(listContentAddressedJson({ storeRoot: args.storeRoot }).length, count, "receipt verification must be read-only");
  assert.equal(inspectPersonalEvolution({ ...args, preparationObjectDigest: outcome.imported.prepared.preparation_object_digest }).status, "candidate_ready");
  for (const { digest, value } of before) assert.deepEqual(read(args.storeRoot, digest), value);
  await assert.rejects(runPersonalEvolutionGeneration({ ...args, workspaceRoot: join(dirname(args.workspaceRoot), "another-workspace") }), /already consumed/);
  assert.equal(calls, 1);
});

for (const [label, mutate] of [
  ["request transplant", result => { result.request_digest = canonicalDigest("other"); }],
  ["input transplant", result => { result.input_digest = canonicalDigest("other"); }],
  ["provider version transplant", result => { result.generator.version = "2.0.0"; }],
  ["provider implementation transplant", result => { result.generator.implementation_digest = canonicalDigest("other"); }],
  ["source revision transplant", result => { result.candidate_descriptor.source.revision = "f".repeat(40); }],
  ["candidate version transplant", result => { result.candidate_descriptor.version = "234.0.2-foreign"; }],
  ["wrong file hash", result => { result.files[0].raw_digest = canonicalDigest("wrong"); }],
  ["missing file claim", result => { result.files.pop(); }],
  ["extra file", (result, context) => { writeFileSync(join(context.outputRoot, "undeclared.md"), "extra"); }],
  ["private answers", result => { result.privacy.private_answers_included = true; }],
  ["raw history", result => { result.raw_task_history = "private"; }],
  ["success declaration only", result => { result.files = []; result.candidate_descriptor = null; }],
  ["effectiveness claim", result => { result.candidate_descriptor.safety.status = "evaluated"; }],
  ["source drift", (result, context) => { writeFileSync(join(context.outputRoot, result.files[0].path), "drift"); }],
  ["symlink output", (result, context) => { const path = join(context.outputRoot, result.files[0].path); rmSync(path); symlinkSync(join(fixture, "reference.json"), path); }],
]) test("connector holds " + label + " without import or retry", async t => {
  const { args } = setup(t), generate = args.provider.generate;
  args.provider.generate = async context => { const result = await generate(context); mutate(result, context); return result; };
  const outcome = await runPersonalEvolutionGeneration(args);
  assert.equal(outcome.status, "held"); assert.equal(outcome.imported, null);
  assert.equal(outcome.receipt.import_receipt_object_digest, null);
  assert.equal(verify(args, outcome).status, "held");
  await assert.rejects(runPersonalEvolutionGeneration(args), /already consumed|fresh/);
});

for (const status of ["failed", "partial"]) test(status + " keeps measured partial hashes and a bound held receipt", async t => {
  const { args } = setup(t), generate = args.provider.generate;
  args.provider.generate = async context => ({ ...await generate(context), status, candidate_descriptor: null });
  const outcome = await runPersonalEvolutionGeneration(args);
  assert.equal(outcome.status, "held"); assert.equal(outcome.receipt.provider_status, status);
  assert.ok(outcome.receipt.files.length > 0); assert.equal(outcome.receipt.file_inventory_status, "verified");
  assert.equal(outcome.receipt.failure_code, `provider_${status}`);
  assert.equal(verify(args, outcome).status, "held");
});

test("provider exception is normalized and retains partial output without raw error disclosure", async t => {
  const { args } = setup(t), generate = args.provider.generate;
  args.provider.generate = async context => { await generate(context); throw new Error("secret=never retain raw provider exceptions"); };
  const outcome = await runPersonalEvolutionGeneration(args);
  assert.equal(outcome.receipt.failure_code, "provider_exception"); assert.ok(outcome.receipt.files.length > 0);
  assert.equal(JSON.stringify(outcome).includes("never retain"), false);
  assert.equal(verify(args, outcome).status, "held");
});

test("atomic claim blocks concurrent dispatch and captures owned provider/trust across await", async t => {
  const { args } = setup(t), generate = args.provider.generate;
  let release, calls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const pinned = structuredClone(args.provider.identity);
  args.provider.generate = async context => { calls++; await waiting;
    args.provider.identity = pinned; return generate(context); };
  const first = runPersonalEvolutionGeneration(args);
  const second = runPersonalEvolutionGeneration({ ...args, workspaceRoot: args.workspaceRoot + "-different" });
  await assert.rejects(second, /already consumed/);
  args.provider.generate = () => { throw new Error("replacement must not run"); };
  args.trustedPortfolioAuthorityContexts = [];
  release(); const outcome = await first;
  assert.equal(calls, 1); assert.equal(outcome.status, "candidate_ready");
});

test("unknown prior invocation cannot restart in a different fresh workspace", async t => {
  const { args } = setup(t);
  mkdirSync(invokeDir(args), { recursive: true });
  let called = false; args.provider.generate = () => { called = true; };
  await assert.rejects(runPersonalEvolutionGeneration(args), /already consumed/);
  assert.equal(called, false);
});

for (const [label, mutate] of [
  ["unconfirmed request", args => { args.confirmedRequestObjectDigest = canonicalDigest("foreign"); }],
  ["private scoring input", args => { args.privateEvaluatorRoot = "/private-grading-not-read"; }],
  ["overlapping store/workspace", args => { args.workspaceRoot = join(args.storeRoot, "workspace"); }],
  ["existing workspace", args => { mkdirSync(args.workspaceRoot); writeFileSync(join(args.workspaceRoot, "old-answer.md"), "must not read"); }],
  ["invalid provider identity", args => { args.provider.identity.version = ""; }],
]) test("preflight rejects " + label + " before dispatch", async t => {
  const { args } = setup(t); mutate(args);
  let called = false; args.provider.generate = () => { called = true; };
  await assert.rejects(runPersonalEvolutionGeneration(args)); assert.equal(called, false);
});

test("recomputed receipt cannot transplant request, generator, candidate or failed outcome", async t => {
  const { args } = setup(t), outcome = await runPersonalEvolutionGeneration(args);
  for (const mutate of [
    value => { value.request_digest = canonicalDigest("foreign"); },
    value => { value.generator.version = "foreign"; },
    value => { value.files[0].raw_digest = canonicalDigest("foreign"); },
    value => { value.candidate_asset.version = "foreign"; },
    value => { value.status = "held"; value.failure_code = "provider_failed"; },
  ]) {
    const changed = structuredClone(outcome.receipt); mutate(changed);
    const { receipt_digest: ignored, ...body } = changed; changed.receipt_digest = canonicalDigest(body);
    const saved = putContentAddressedJson({ storeRoot: args.storeRoot, artifact: changed });
    assert.throws(() => verify(args, { execution_receipt_object_digest: saved.digest }));
  }
});

const statusArgs = args => ({ storeRoot: args.storeRoot, requestObjectDigest: args.requestObjectDigest,
  trustedPortfolioAuthorityContexts: args.trustedPortfolioAuthorityContexts });
function snapshot(root) {
  return readdirSync(root).sort().flatMap(name => {
    const path = join(root, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) return [[name, "symlink", readlinkSync(path)]];
    if (stat.isDirectory()) return [[name, "directory"], ...snapshot(path).map(entry => [name + "/" + entry[0], ...entry.slice(1)])];
    return [[name, "file", rawDigest(readFileSync(path))]];
  });
}
function inspectUnchanged(root, args) {
  const before = snapshot(root), result = inspectPersonalEvolutionGenerationStatus(statusArgs(args));
  assert.deepEqual(snapshot(root), before, "status inspection must not change any files or directories");
  for (const key of ["provider_called", "models_started", "mutation_performed", "authority_implied"]) assert.equal(result[key], false);
  assert.equal(result.generation_effectiveness, "Unknown");
  return result;
}

test("request-only status is NOT_RUN and does not create or consume a claim", t => {
  const { root, args } = setup(t), result = inspectUnchanged(root, args);
  assert.equal(result.status, "NOT_RUN"); assert.equal(result.invocation_consumed, false);
  assert.equal(result.execution_receipt_object_digest, null); assert.equal(result.preparation_object_digest, null);
  assert.equal(result.next_action, "review_request_and_obtain_fresh_generation_authorization");
});

test("empty consumed claim stays unknown, read-only and unavailable for restart", async t => {
  const { root, args } = setup(t); mkdirSync(invokeDir(args), { recursive: true });
  let calls = 0; args.provider.generate = () => { calls++; };
  const result = inspectUnchanged(root, args);
  assert.equal(result.status, "consumed_unknown"); assert.equal(result.invocation_consumed, true);
  assert.equal(result.execution_receipt_object_digest, null); assert.equal(result.preparation_object_digest, null);
  assert.equal(result.next_action, "preserve_consumed_invocation_and_resolve_unknown_outcome");
  await assert.rejects(runPersonalEvolutionGeneration(args), /already consumed/); assert.equal(calls, 0);
});

test("inspection during one pending fake call is unknown and never dispatches a second call", async t => {
  const { root, args } = setup(t), generate = args.provider.generate;
  let release, calls = 0; const waiting = new Promise(resolve => { release = resolve; });
  args.provider.generate = async context => { calls++; await waiting; return generate(context); };
  const started = runPersonalEvolutionGeneration(args);
  try { assert.equal(inspectUnchanged(root, args).status, "consumed_unknown"); assert.equal(calls, 1); }
  finally { release(); }
  const outcome = await started, result = inspectUnchanged(root, args);
  assert.equal(result.status, "candidate_ready"); assert.equal(calls, 1);
  assert.equal(result.execution_receipt_object_digest, outcome.execution_receipt_object_digest);
  assert.equal(result.preparation_object_digest, outcome.receipt.preparation_object_digest);
  assert.deepEqual(result.candidate_asset, outcome.receipt.candidate_asset);
  assert.equal(result.model_execution, "not_applicable");
  assert.equal(result.next_action, "independently_review_source_then_prepare_fresh_evaluation");
});

for (const status of ["partial", "failed", "exception"]) test("status retains bounded " + status + " evidence without accepting a candidate", async t => {
  const { root, args } = setup(t), generate = args.provider.generate;
  args.provider.generate = async context => {
    const result = await generate(context);
    if (status === "exception") throw new Error("secret=private-provider-error");
    return { ...result, status, candidate_descriptor: null };
  };
  const outcome = await runPersonalEvolutionGeneration(args), result = inspectUnchanged(root, args);
  assert.equal(result.status, "held"); assert.equal(result.invocation_consumed, true);
  assert.equal(result.execution_receipt_object_digest, outcome.execution_receipt_object_digest);
  assert.equal(result.failure_code, status === "exception" ? "provider_exception" : "provider_" + status);
  assert.deepEqual(result.files, outcome.receipt.files); assert.ok(result.files.length);
  assert.equal(result.candidate_asset, null); assert.equal(result.preparation_object_digest, null);
  assert.equal(result.next_action, "retain_held_evidence_and_review_new_cycle");
  assert.equal(JSON.stringify(result).includes("private-provider-error"), false);
});

for (const [label, change] of [
  ["malformed terminal", (args) => writeFileSync(join(invokeDir(args), "receipt.json"), "secret=private-record")],
  ["duplicate-key terminal", (args) => writeFileSync(join(invokeDir(args), "receipt.json"), '{"status":"held","status":"candidate_ready"}')],
  ["transplanted terminal", (args, outcome) => { const receipt = structuredClone(outcome.receipt);
    receipt.request_object_digest = canonicalDigest("foreign"); const { receipt_digest: ignored, ...body } = receipt;
    receipt.receipt_digest = canonicalDigest(body); writeFileSync(join(invokeDir(args), "receipt.json"), JSON.stringify(receipt)); }],
  ["transplanted claim", args => { const path = join(invokeDir(args), "request.json"), claim = JSON.parse(readFileSync(path));
    claim.request_object_digest = canonicalDigest("foreign"); writeFileSync(path, JSON.stringify(claim)); }],
  ["missing terminal CAS", (args, outcome) => { const hex = outcome.execution_receipt_object_digest.slice(7);
    rmSync(join(args.storeRoot, "objects/sha256", hex.slice(0, 2), hex.slice(2) + ".json")); }],
  ["missing claim with terminal", args => rmSync(join(invokeDir(args), "request.json"))],
  ["symlink terminal", args => { const path = join(invokeDir(args), "receipt.json"); rmSync(path); symlinkSync(join(fixture, "reference.json"), path); }],
]) test("status refuses " + label + " while preserving consumed evidence", async t => {
  const { root, args } = setup(t), outcome = await runPersonalEvolutionGeneration(args); change(args, outcome);
  const result = inspectUnchanged(root, args);
  assert.equal(result.status, "invalid_evidence"); assert.equal(result.invocation_consumed, true);
  assert.equal(result.execution_receipt_object_digest, null); assert.equal(result.preparation_object_digest, null);
  assert.equal(result.candidate_asset, null); assert.deepEqual(result.files, []);
  assert.equal(result.next_action, "preserve_records_and_investigate_evidence");
  assert.equal(JSON.stringify(result).includes("private-record"), false);
});

test("unknown malformed claim and symlink invocation never become NOT_RUN", t => {
  const { root, args } = setup(t); mkdirSync(invokeDir(args), { recursive: true });
  writeFileSync(join(invokeDir(args), "request.json"), "malformed");
  assert.equal(inspectUnchanged(root, args).status, "invalid_evidence");
  rmSync(invokeDir(args), { recursive: true }); symlinkSync(join(root, "missing-target"), invokeDir(args));
  assert.equal(inspectUnchanged(root, args).status, "invalid_evidence");
});

test("unsafe invocation ancestor keeps consumption unknown without traversing it", t => {
  const { root, args } = setup(t), outside = join(root, "outside"); mkdirSync(outside);
  symlinkSync(outside, join(args.storeRoot, "personal-generation-invocations"));
  const result = inspectUnchanged(root, args);
  assert.equal(result.status, "invalid_evidence"); assert.equal(result.invocation_consumed, null);
});

test("API rejects nested accessors and callbacks before inspecting or executing them", t => {
  const { root, args } = setup(t), before = snapshot(root); let calls = 0;
  const nested = {}; Object.defineProperty(nested, "value", { enumerable: true, get() { calls++; return "forbidden"; } });
  const array = []; Object.defineProperty(array, "0", { enumerable: true, get() { calls++; return "forbidden"; } });
  for (const trust of [[nested], array, [{ callback: () => { calls++; } }], [,], [{ value: undefined }]]) {
    assert.throws(() => inspectPersonalEvolutionGenerationStatus({ ...statusArgs(args), trustedAssetAuthorityContexts: trust }));
  }
  assert.equal(calls, 0); assert.deepEqual(snapshot(root), before);
});

test("unaccepted held inventory cannot print arbitrary paths or unbounded file metadata", async t => {
  const { root, args } = setup(t); args.provider.generate = () => { throw new Error("fake exception"); };
  const outcome = await runPersonalEvolutionGeneration(args);
  for (const files of [
    [{ path: "/Users/private-record", raw_digest: canonicalDigest("fake"), byte_length: 1 }],
    [{ path: "bounded.md", raw_digest: canonicalDigest("fake"), byte_length: 512 * 1024 + 1 }],
  ]) {
    const changed = { ...structuredClone(outcome.receipt), files };
    const { receipt_digest: ignored, ...body } = changed; changed.receipt_digest = canonicalDigest(body);
    putContentAddressedJson({ storeRoot: args.storeRoot, artifact: changed });
    writeFileSync(join(invokeDir(args), "receipt.json"), JSON.stringify(changed));
    const result = inspectUnchanged(root, args);
    assert.equal(result.status, "invalid_evidence"); assert.deepEqual(result.files, []);
    assert.equal(JSON.stringify(result).includes("private-record"), false);
  }
});

test("one CLI reads an exact context and returns only status evidence", async t => {
  const { root, args } = setup(t), outcome = await runPersonalEvolutionGeneration(args);
  const path = join(root, "private-context.json"); writeFileSync(path, JSON.stringify(statusArgs(args)));
  const digest = rawDigest(readFileSync(path)), before = snapshot(root);
  const result = inspectPersonalEvolutionGenerationStatusFile(path, digest);
  const cli = spawnSync(process.execPath, [resolve(import.meta.dirname, "ask-personal-evolution-status.mjs"),
    "generation", "--context", path, "--context-digest", digest], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr); assert.equal(cli.stderr, "");
  assert.deepEqual(JSON.parse(cli.stdout), result); assert.deepEqual(snapshot(root), before);
  assert.equal(result.execution_receipt_object_digest, outcome.execution_receipt_object_digest);
  assert.equal(cli.stdout.includes(root), false); assert.equal(cli.stdout.includes("Bind blockers"), false);
});

test("CLI rejects unpinned, duplicate-key, symlink and control-bearing contexts without writes or raw errors", t => {
  const { root, args } = setup(t), path = join(root, "private-context.json");
  const script = resolve(import.meta.dirname, "ask-personal-evolution-status.mjs");
  const ordinary = JSON.stringify(statusArgs(args)); writeFileSync(path, ordinary);
  const call = argv => spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
  const commands = [
    ["generation", "--context", path],
    ["generation", "--context", path, "--context-digest", rawDigest("wrong")],
    ["generation", "--context", path, "--context", path, "--context-digest", rawDigest(ordinary)],
    ["generation", "--context", path, "--context-digest", rawDigest(ordinary), "--start"],
    ["start", "--context", path, "--context-digest", rawDigest(ordinary)],
  ];
  for (const argv of commands) { const before = snapshot(root), result = call(argv);
    assert.equal(result.status, 10); assert.equal(result.stdout, ""); assert.equal(result.stderr.includes(root), false);
    assert.deepEqual(snapshot(root), before); }
  for (const text of ['{"storeRoot":"secret=private-context","storeRoot":"again"}',
    JSON.stringify({ ...statusArgs(args), provider: "forbidden" }), JSON.stringify({ ...statusArgs(args), confirmedRequestObjectDigest: args.requestObjectDigest })]) {
    writeFileSync(path, text); const before = snapshot(root), result = call(["generation", "--context", path, "--context-digest", rawDigest(text)]);
    assert.equal(result.status, 10); assert.equal(result.stderr.includes("private-context"), false);
    assert.deepEqual(snapshot(root), before);
  }
  writeFileSync(path, ordinary); const link = join(root, "linked-context.json"); symlinkSync(path, link);
  assert.throws(() => inspectPersonalEvolutionGenerationStatusFile(link, rawDigest(ordinary)), /symlink/);
  for (const key of ["provider", "workspaceRoot", "confirmedRequestObjectDigest", "privateEvaluatorRoot"]) {
    assert.throws(() => inspectPersonalEvolutionGenerationStatus({ ...statusArgs(args), [key]: "refused" }), /option/);
  }
});

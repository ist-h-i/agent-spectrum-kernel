import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { preparePersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { runPersonalEvolutionGeneration, verifyPersonalEvolutionGenerationExecution } from "./ask-personal-evolution-generation-connector.mjs";

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

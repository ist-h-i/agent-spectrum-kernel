import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { preparePersonalEvolutionGenerationRequest, importPersonalEvolutionGenerationResult } from "./ask-personal-evolution-generation.mjs";

const repository = resolve(import.meta.dirname, "..");
const rawDigest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fixture = resolve(repository, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(resolve(fixture, "reference.json"), "utf8"));
const adapter = reference.adapters[0];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
function setup(t, realArtifact = false) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-generation-test-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = resolve(root, "store"); cpSync(resolve(fixture, "store"), storeRoot, { recursive: true });
  const candidate = read(storeRoot, adapter.evolution.candidate_object_digest);
  const keys = ["candidate_id", "parent_asset", "parent_portfolio", "registry", "factors", "evaluation_scope",
    "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const observationInput = { observation_id: "bounded-local-correction", repository_id: reference.registry.repository_id,
    task_ids: ["observed-review"], evidence_refs: [{ artifact_id: "review-summary", digest: canonicalDigest("public summary") }],
    evidence_status: "Supported", correction: "Bind the optional requirement to the same target before declaring a blocker.",
    intended_mechanism: "Use explicit target and requirement scope in reviews.", applicability: "Bounded optional requirement reviews.",
    non_applicability: ["Owner policy remains unresolved."],
    privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } };
  const input = { storeRoot, observationInput, blueprint: Object.fromEntries(keys.map(key => [key, candidate[key]])),
    generationActor: candidate.generation.actor, holdoutTaskIds: [candidate.evaluation_scope.fixture_ids[0]],
    requestedVersion: "234.0.1-local", requestId: "local-generation-1",
    trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts };
  const record = structuredClone(read(storeRoot, adapter.candidate_asset.record_digest));
  const content = read(storeRoot, adapter.candidate_asset.content_digest);
  const { object_kind: ignored, ...descriptor } = record;
  descriptor.version = input.requestedVersion;
  descriptor.safety = { status: "not_evaluated", classifications: [], constraint_refs: [] };
  descriptor.mechanism_and_evidence = { status: "not_evaluated", mechanism_refs: [], evidence_refs: [] };
  descriptor.evaluation_history = { status: "not_evaluated", evidence_refs: [], cost: null };
  let sourceRoot;
  if (realArtifact) {
    sourceRoot = repository;
    const path = "docs/personal-evolution-bridge.md";
    descriptor.content = { package_format: "canonical_json_base64_files",
      files: [{ path, media_type: "text/markdown", raw_digest: rawDigest(readFileSync(resolve(repository, path))) }] };
    descriptor.type_extension = { kind: "prompt_template", adapter: "codex", entrypoint: path, rendered_runtime_content: false };
  } else {
    sourceRoot = resolve(root, "supplied-files"); mkdirSync(sourceRoot);
    descriptor.content = { package_format: "canonical_json_base64_files", files: content.files.map(file => {
      // Deterministic fake producer: files from public Asset bytes, no process/model.
      const bytes = Buffer.concat([Buffer.from(file.bytes_base64, "base64"), Buffer.from("\nBound review blockers to the explicit requirement target.\n")]);
      const path = resolve(sourceRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
      return { path: file.path, media_type: file.media_type, raw_digest: rawDigest(bytes) };
    }) };
    descriptor.type_extension.renderer.projection_digest = canonicalDigest(descriptor.content.files.map(({ path, raw_digest }) => ({ path, raw_digest })));
  }
  return { input, descriptor, sourceRoot };
}
function resultFor(request, descriptor) {
  return { request_digest: request.request.request_digest, observation_digest: request.request.observation_digest,
    parent_asset: request.request.blueprint.parent_asset, candidate_descriptor: descriptor,
    privacy: { classification: "caller_reviewed_asset_source", private_answers_included: false, raw_task_history_included: false } };
}
const inventory = storeRoot => listContentAddressedJson({ storeRoot }).map(item => item.digest);

for (const realArtifact of [false, true]) test(realArtifact ? "imports actual public repository artifact files" : "non-model fake result registers candidate and prepares existing Evolution", t => {
  const { input, descriptor, sourceRoot } = setup(t, realArtifact);
  const before = inventory(input.storeRoot);
  const request = preparePersonalEvolutionGenerationRequest(input);
  assert.equal(request.generation_input.requested_action, "produce_candidate_files_only");
  assert.equal(request.models_started, false); assert.equal(request.generation_effectiveness, "Unknown");
  assert.equal("private_answers" in request.generation_input, false);
  const args = { ...input, sourceRoot, requestObjectDigest: request.request_object_digest, result: resultFor(request, descriptor) };
  const imported = importPersonalEvolutionGenerationResult(args);
  assert.equal(imported.registration.state, "candidate"); assert.equal(imported.authority_implied, false);
  assert.equal(imported.generation_effectiveness, "Unknown");
  const inspected = inspectPersonalEvolution({ ...input, preparationObjectDigest: imported.prepared.preparation_object_digest });
  assert.equal(inspected.status, "candidate_ready"); assert.equal(inspected.observation_digest, request.request.observation_digest);
  const count = inventory(input.storeRoot).length;
  assert.equal(importPersonalEvolutionGenerationResult(args).receipt_object_digest, imported.receipt_object_digest);
  assert.equal(inventory(input.storeRoot).length, count);
  for (const digest of before) assert.deepEqual(read(input.storeRoot, digest), read(resolve(fixture, "store"), digest));
});

for (const [label, mutate] of [
  ["Unknown observation", x => { x.input.observationInput.evidence_status = "Unknown"; }],
  ["collapsed generation actor", x => { x.input.generationActor.actor_id = x.input.blueprint.authorities.experiment.authority_id; }],
  ["Registry transplant", x => { x.input.blueprint.registry.registry_id = "foreign"; }],
  ["historical supplied lock", x => { x.input.blueprint.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest;
    x.input.blueprint.rollback.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest; }],
]) test("generation request rejects " + label + " without publication", t => {
  const setupInput = setup(t); const before = inventory(setupInput.input.storeRoot); mutate(setupInput);
  assert.throws(() => preparePersonalEvolutionGenerationRequest(setupInput.input));
  assert.deepEqual(inventory(setupInput.input.storeRoot), before);
});

for (const [label, mutate] of [
  ["wrong request", x => { x.result.request_digest = canonicalDigest("foreign"); }],
  ["wrong observation", x => { x.result.observation_digest = canonicalDigest("foreign"); }],
  ["wrong version", x => { x.result.candidate_descriptor.version = "234.0.2-foreign"; }],
  ["wrong lineage", x => { x.result.candidate_descriptor.derivation.parent = adapter.candidate_asset; }],
  ["wrong rollback", x => { x.result.candidate_descriptor.maintenance.rollback.target = adapter.candidate_asset; }],
  ["unknown result field", x => { x.result.raw_task_log = "private"; }],
  ["private answers", x => { x.result.privacy.private_answers_included = true; }],
  ["effectiveness claim", x => { x.result.candidate_descriptor.safety.status = "evaluated"; }],
  ["source drift", x => { const path = x.result.candidate_descriptor.content.files[0].path; writeFileSync(resolve(x.sourceRoot, path), "changed"); }],
  ["shared write root", x => { x.sourceRoot = x.storeRoot; }],
]) test("generation result rejects " + label + " before registration", t => {
  const { input, descriptor, sourceRoot } = setup(t);
  const request = preparePersonalEvolutionGenerationRequest(input);
  const args = { ...input, sourceRoot, requestObjectDigest: request.request_object_digest, result: resultFor(request, descriptor) };
  const before = inventory(input.storeRoot); mutate(args);
  assert.throws(() => importPersonalEvolutionGenerationResult(args));
  assert.deepEqual(inventory(input.storeRoot), before);
});

test("self-recomputed saved request cannot bypass parent Registry verification on import", t => {
  const { input, descriptor, sourceRoot } = setup(t);
  const published = preparePersonalEvolutionGenerationRequest(input);
  const request = structuredClone(published.request);
  request.blueprint.registry.registry_id = "foreign";
  const { request_digest: ignored, ...body } = request;
  request.request_digest = canonicalDigest(body);
  const saved = putContentAddressedJson({ storeRoot: input.storeRoot, artifact: request });
  const before = inventory(input.storeRoot);
  assert.throws(() => importPersonalEvolutionGenerationResult({ ...input, sourceRoot, requestObjectDigest: saved.digest,
    result: resultFor({ request }, descriptor) }), /Registry identity/);
  assert.deepEqual(inventory(input.storeRoot), before);
});

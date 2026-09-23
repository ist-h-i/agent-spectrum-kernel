import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { syntheticParent, syntheticPreparation } from "./test-prompt-successor-fixtures.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import {
  buildSuccessorScoringInputManifest, validateSuccessorScoringInputManifest,
  openSuccessorScoringInputs, inspectSuccessorScoringInputs, successorScoringOptions,
  assertSuccessorScoringExecution, SUCCESSOR_SCORING_INPUT_ROLES,
} from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";

const digest = value => canonicalDigest({ synthetic: value });
const ref = path => ({ path, raw_digest: digest(path), bytes: 10 });
function input() {
  const shared = {
    catalog: ref("benchmarks/portfolio-catalog.json"),
    policy_manifest: ref("benchmarks/portfolio-policy-manifest.json"),
    scoring_policy: ref("benchmarks/portfolio-scoring-policy.json"),
  };
  return { parent: syntheticParent(), executionConfig: ref("benchmarks/prompt-successor-execution.config.json"),
    fixtures: CALIBRATION_SOURCE_BINDINGS.map(([fixture_id, source_fixture_id]) => ({
      fixture_id, source_fixture_id, input_manifest_digest: digest("frozen-inputs"),
      artifacts: Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [role,
        structuredClone(shared[role] ?? ref(`synthetic/${fixture_id}/${role}.json`))])),
    })) };
}

test("public input manifest is deterministic, four-fixture and non-authorizing", () => {
  const args = input(); const before = structuredClone(args);
  const a = buildSuccessorScoringInputManifest(args); const b = buildSuccessorScoringInputManifest(args);
  assert.deepEqual(a, b); assert.deepEqual(args, before);
  assert.equal(a.phase, "pre_result"); assert.equal(a.execution_fixture_namespace, "catalog");
  assert.equal(a.creates_admission, false); assert.equal(a.measured_execution_authorized, false);
  validateSuccessorScoringInputManifest(a, args.parent, a.manifest_digest);
});
for (const [name, mutate] of [
  ["missing fixture", a => a.fixtures.pop()],
  ["extra fixture", a => a.fixtures.push(structuredClone(a.fixtures[0]))],
  ["duplicate fixture", a => { a.fixtures[1] = structuredClone(a.fixtures[0]); }],
  ["reordered fixtures", a => a.fixtures.reverse()],
  ["source identity transplant", a => { a.fixtures[0].source_fixture_id = a.fixtures[1].source_fixture_id; }],
  ["missing role", a => { delete a.fixtures[0].artifacts.requirement_record; }],
  ["extra role", a => { a.fixtures[0].artifacts.private_bundle = ref("never/read.json"); }],
  ["one file for distinct roles", a => { a.fixtures[0].artifacts.output_contract = structuredClone(a.fixtures[0].artifacts.requirement_record); }],
  ["shared per-fixture authority", a => { a.fixtures[1].artifacts.requirement_record = structuredClone(a.fixtures[0].artifacts.requirement_record); }],
  ["alternative common catalog", a => { for (const f of a.fixtures) f.artifacts.catalog = ref("synthetic/replaced-catalog.json"); }],
  ["different common policy bytes", a => { a.fixtures[1].artifacts.scoring_policy.raw_digest = digest("drift"); }],
  ["extra caller permission", a => { a.fixtures[0].approved = true; }],
  ["negative byte count", a => { a.fixtures[0].artifacts.freeze_manifest.bytes = -1; }],
  ["unbounded input", a => { a.fixtures[0].artifacts.freeze_manifest.bytes = 1024 * 1024 + 1; }],
  ["malformed digest", a => { a.fixtures[0].artifacts.freeze_manifest.raw_digest = "sha256:unknown"; }],
  ["absolute path", a => { a.executionConfig.path = "/outside/config.json"; }],
  ["parent path", a => { a.executionConfig.path = "../config.json"; }],
  ["backslash path", a => { a.executionConfig.path = "dir\\config.json"; }],
]) test(`input manifest rejects ${name}`, () => {
  const args = input(); mutate(args); assert.throws(() => buildSuccessorScoringInputManifest(args));
});

test("changing public input references changes the preparation and every case identity", () => {
  const args = input(); const a = buildSuccessorScoringInputManifest(args);
  args.fixtures[0].artifacts.requirement_record.raw_digest = digest("new-requirements");
  const b = buildSuccessorScoringInputManifest(args);
  assert.notEqual(a.manifest_digest, b.manifest_digest);
  const p = syntheticPreparation({ scoringInputManifestDigest: a.manifest_digest });
  const q = syntheticPreparation({ scoringInputManifestDigest: b.manifest_digest });
  assert.notEqual(p.preparation_digest, q.preparation_digest);
  assert.ok(p.cases.every(c => !q.cases.some(d => d.case_id === c.case_id)));
  assert.deepEqual(p.predecessor, q.predecessor);
});

test("post-hoc digest replacement and escalation do not validate as the same manifest", () => {
  const args = input(); const manifest = buildSuccessorScoringInputManifest(args);
  const changed = structuredClone(manifest); changed.creates_admission = true;
  assert.throws(() => validateSuccessorScoringInputManifest(changed, args.parent, manifest.manifest_digest));
  assert.throws(() => validateSuccessorScoringInputManifest(manifest, args.parent, digest("another-manifest")));
});

test("unbound preparation refuses before implementation, file or evaluator access", async () => {
  await assert.rejects(() => openSuccessorScoringInputs({ preparation: syntheticPreparation(), manifestPath: "/never-read" }),
    { code: "SUCCESSOR_SCORING_INPUTS_REQUIRED" });
});

test("matching-looking plain objects confer no public scoring-input capability", () => {
  const p = syntheticPreparation();
  for (const handle of [undefined, null, {}, { kind: "verified_successor_scoring_inputs" }]) {
    assert.throws(() => inspectSuccessorScoringInputs(handle, p), { code: "SUCCESSOR_UNVERIFIED_SCORING_INPUTS" });
    assert.throws(() => successorScoringOptions(handle, p, p.predecessor.fixtures[0].fixture_id), { code: "SUCCESSOR_UNVERIFIED_SCORING_INPUTS" });
    assert.throws(() => assertSuccessorScoringExecution(handle, p, {}), { code: "SUCCESSOR_UNVERIFIED_SCORING_INPUTS" });
  }
});

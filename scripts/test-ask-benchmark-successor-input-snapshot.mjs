import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticPreparation, syntheticScope, syntheticRuntime } from "./test-prompt-successor-fixtures.mjs";
import { createSyntheticSuccessorSources } from "./test-prompt-successor-source-fixtures.mjs";
import { openSuccessorResultSource, inspectSuccessorSource } from "./ask-benchmark-prompt-successor-bridge.mjs";
import { prepareSuccessorFromRepository, validateSuccessorFromRepository } from "./ask-benchmark-prompt-successor-repository.mjs";
import { openSuccessorPromptInput } from "./ask-benchmark-prompt-successor-delivery.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
assert.equal(process.versions.node.split(".")[0], "24", "real-library input snapshot regression requires Node 24");

for (const [name, mutate] of [
  ["experiment ID", args => { args.scope.run_instance_id = "22222222-2222-4222-8222-222222222222"; }],
  ["nested native binding", args => { args.scope.source.bindings[0].source_case_id = "case-0000000000000000-0000000000000000"; }],
  ["preparation identity", args => { args.preparation.preparation_digest = `sha256:${"f".repeat(64)}`; }],
  ["source path", args => { args.paths.sourceManifestPath = "/never-read-after-input-snapshot.json"; }],
]) test(`result reader owns ${name} before yielding to the caller`, async t => {
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-successor-input-snapshot-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preparation = syntheticPreparation(); const scope = syntheticScope(preparation);
  const source = await createSyntheticSuccessorSources({ root, directory, preparation, scope });
  const expected = { preparation: preparation.preparation_digest, scope: scope.scope_digest, run: scope.run_instance_id };
  const args = { root, preparation, scope, expectedScopeDigest: scope.scope_digest, accessMode: "synthetic_only", ...source };
  const pending = openSuccessorResultSource(args);
  // This happens after the function starts but before its first await resumes.
  mutate(args);
  const evidence = inspectSuccessorSource(await pending);
  assert.equal(evidence.preparation_digest, expected.preparation);
  assert.equal(evidence.scope_digest, expected.scope);
  assert.equal(evidence.run_instance_id, expected.run);
  assert.equal(evidence.entries.length, 14);
});

test("repository preparation owns a nested runtime proposal during parent loading", async () => {
  const runtime = syntheticRuntime(); const before = structuredClone(runtime);
  const pending = prepareSuccessorFromRepository({ root, runtime, seed: "snapshot-test", changeReason: "Synthetic no-model input snapshot regression." });
  runtime.model = "caller-mutated-model";
  runtime.provider_model_revision.status = "known";
  runtime.provider_model_revision.value = "caller-mutated-revision";
  const preparation = await pending;
  assert.deepEqual(preparation.runtime, before);
});

test("repository validation returns the verified snapshot, not the caller's later object", async () => {
  const preparation = await prepareSuccessorFromRepository({ root, runtime: syntheticRuntime(), seed: "snapshot-validate", changeReason: "Synthetic no-model input snapshot regression." });
  const before = structuredClone(preparation);
  const pending = validateSuccessorFromRepository(preparation, { root });
  preparation.implementation.revision = "f".repeat(40);
  assert.deepEqual(await pending, before);
});

test("Prompt input creation owns the scope before historical source loading", async () => {
  const preparation = await prepareSuccessorFromRepository({ root, runtime: syntheticRuntime(), seed: "snapshot-prompt", changeReason: "Synthetic no-model input snapshot regression." });
  const scope = syntheticScope(preparation);
  const target = preparation.cases.find(item => item.prompt_role === "current_prompt");
  const pending = openSuccessorPromptInput({ root, preparation, scope, expectedScopeDigest: scope.scope_digest, caseId: target.case_id });
  scope.prompt_role = "prompt_v2";
  preparation.implementation.revision = "f".repeat(40);
  assert.equal((await pending).kind, "successor_prompt_source_handle");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticPreparation, syntheticScope, syntheticRuntime, syntheticDigest as d } from "./test-prompt-successor-fixtures.mjs";
import { createSyntheticSuccessorSources } from "./test-prompt-successor-source-fixtures.mjs";
import { openSuccessorResultSource, inspectSuccessorSource, readSuccessorVerifiedEngineeringResult } from "./ask-benchmark-prompt-successor-bridge.mjs";
import { readSuccessorParent, HISTORICAL_PREREGISTRATION_DIGEST } from "./ask-benchmark-prompt-successor-repository.mjs";
import { buildPromptSuccessorPreparation } from "./ask-benchmark-prompt-successor.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Explicit failure, not a skipped integration suite on the wrong runtime.
assert.equal(process.versions.node.split(".")[0], "24", "real-library integration requires Node 24");
async function withSource(callback, { role = "current_prompt", outcome = "completed" } = {}) {
  const preparation = syntheticPreparation();
  const scope = syntheticScope(preparation, role);
  const directory = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-successor-source-"));
  try {
    const data = await createSyntheticSuccessorSources({ root, directory, preparation, scope, outcome });
    const args = { root, preparation, scope, expectedScopeDigest: scope.scope_digest, accessMode: "synthetic_only", ...data };
    await callback(args, directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("unchanged real #234 validator reconstructs historical 56 cases; successor is separate", async () => {
  const { parent, legacyPlan } = await readSuccessorParent({ root });
  const original = JSON.stringify(legacyPlan);
  assert.equal(parent.preregistration_digest, HISTORICAL_PREREGISTRATION_DIGEST);
  assert.equal(legacyPlan.cases.length, 56);
  const successor = buildPromptSuccessorPreparation({ parent, runtime: syntheticRuntime(), implementation: { revision: "c".repeat(40), tree: "d".repeat(40) }, seed: "synthetic-actual-parent", changeReason: "Real old validator integration, not a measured candidate." });
  assert.equal(successor.cases.length, 28);
  assert.ok(successor.cases.every((c) => c.adapter_track === "codex"));
  assert.equal(JSON.stringify(legacyPlan), original);
});
for (const role of ["current_prompt", "prompt_v2"]) test(`real #197 validators accept synthetic scoped ${role} records and detach returned data`, async () => {
  await withSource(async (args) => {
    const handle = await openSuccessorResultSource(args);
    const record = inspectSuccessorSource(handle);
    assert.equal(record.entries.length, 14);
    assert.equal(record.full_four_condition_result_set, false);
    assert.equal(record.source_freshness, "not_checked");
    assert.equal(record.execution_attestation_verified, false);
    assert.equal(record.evaluator_authority_reverified, false);
    const id = record.entries[0].case_id;
    const first = readSuccessorVerifiedEngineeringResult(handle, id);
    assert.equal(first.engineering.scoring_status, "complete");
    assert.equal(first.engineering.overhead_telemetry.human_effort.value, null);
    first.engineering.requirement_score.normalized_requirement_score = 0;
    assert.equal(readSuccessorVerifiedEngineeringResult(handle, id).engineering.requirement_score.normalized_requirement_score, 1);
    record.entries.length = 0;
    assert.equal(inspectSuccessorSource(handle).entries.length, 14);
    assert.throws(() => inspectSuccessorSource({ ...handle }), { code: "SUCCESSOR_UNVERIFIED_SOURCE" });
  }, { role });
});
for (const outcome of ["failed", "interrupted", "unavailable", "invalid"]) test(`actual raw validators preserve synthetic ${outcome}, not success or zero`, async () => {
  await withSource(async (args) => {
    const handle = await openSuccessorResultSource(args);
    for (const entry of inspectSuccessorSource(handle).entries) {
      const row = readSuccessorVerifiedEngineeringResult(handle, entry.case_id);
      assert.equal(row.normalized.outcome, outcome);
      assert.equal(row.engineering.scoring_status, "not_scoring_ready");
      assert.equal(row.engineering.requirement_score.normalized_requirement_score, null);
    }
  }, { outcome });
});
test("existing ordinary result-set still rejects an incomplete four-condition population", async () => {
  await withSource(async (args) => {
    const api = await import("./ask-benchmark-portfolio-result-set.mjs");
    // collect would publish only after successful validation. The expected early
    // inventory rejection must not be replaced by a no-output-path rejection.
    const { directory: _unused, ..._rest } = args;
    assert.throws(() => api.collectEngineeringResults({ root, ...args.paths, sourceManifestSourceDigest: args.sourceManifestSourceDigest, sourceSnapshotDigest: args.sourceSnapshotDigest, adapter: "codex", outputPath: resolve(args.paths.engineeringResultsPath, "..", "ordinary-result-set.json") }), /incomplete|pending|terminal/iu);
  });
});
test("approved source digest mismatch rejects before any score can be consumed", async () => {
  await withSource(async (args) => { await assert.rejects(() => openSuccessorResultSource({ ...args, sourceManifestSourceDigest: d("wrong") })); });
});
test("raw result modification is detected by the real reader", async () => {
  await withSource(async (args) => {
    const file = resolve(args.paths.engineeringResultsPath, args.sourceManifest.inventory[0].path);
    const value = JSON.parse(readFileSync(file, "utf8")); value.requirement_score.normalized_requirement_score = 0;
    writeFileSync(file, `${JSON.stringify(value)}\n`);
    await assert.rejects(() => openSuccessorResultSource(args));
  });
});
test("extra or missing source files cannot be selected away", async () => {
  await withSource(async (args) => { writeFileSync(resolve(args.paths.engineeringResultsPath, "extra.json"), "{}\n"); await assert.rejects(() => openSuccessorResultSource(args)); });
  await withSource(async (args) => { unlinkSync(resolve(args.paths.engineeringResultsPath, args.sourceManifest.inventory[0].path)); await assert.rejects(() => openSuccessorResultSource(args)); });
});
test("cross-role scope and reused snapshots are rejected", async () => {
  await withSource(async (args) => {
    const wrong = syntheticScope(args.preparation, "prompt_v2");
    await assert.rejects(() => openSuccessorResultSource({ ...args, scope: wrong, expectedScopeDigest: wrong.scope_digest }));
    await assert.rejects(() => openSuccessorResultSource({ ...args, sourceSnapshotDigest: d("other-snapshot") }));
  });
});
test("symlink source roots and overlapping authority roots are rejected", async () => {
  await withSource(async (args, directory) => {
    const link = resolve(directory, "alias"); symlinkSync(args.paths.engineeringResultsPath, link);
    await assert.rejects(() => openSuccessorResultSource({ ...args, paths: { ...args.paths, engineeringResultsPath: link } }));
    await assert.rejects(() => openSuccessorResultSource({ ...args, paths: { ...args.paths, normalizedResultsPath: args.paths.engineeringResultsPath } }));
  });
});

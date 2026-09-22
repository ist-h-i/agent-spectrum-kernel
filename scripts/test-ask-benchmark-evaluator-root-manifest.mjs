import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifyEvaluatorBoundaryRootLineageForTest } from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

const MiB = 1024 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const largeValidJson = () => Buffer.from(JSON.stringify({ program: "synthetic_materialization", payload: "x".repeat(2 * MiB) }));

function fixture(t, materializedBytes = Buffer.from('{"program":"synthetic_materialization"}')) {
  const directory = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-evaluator-root-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true })); // This test's own directory only.
  const paths = Object.fromEntries(["materializedPath", "selectionState", "runDir"].map(key => [key, resolve(directory, `${key}.json`)]));
  const selectionBytes = Buffer.from('{"program":"synthetic_selection"}');
  const run = { run_instance_id: "00000000-0000-4000-8000-000000000001" };
  writeFileSync(paths.materializedPath, materializedBytes);
  writeFileSync(paths.selectionState, selectionBytes);
  writeFileSync(paths.runDir, JSON.stringify(run));
  const normalizedRoot = resolve(directory, "normalized");
  const generationPath = resolve(normalizedRoot, "generations", "synthetic-snapshot");
  mkdirSync(generationPath, { recursive: true });
  const bundle = { markerPaths: paths, canonicalRoots: { normalizedResultsPath: normalizedRoot } };
  const verified = { generationPath, manifest: { source: {
    materialization_manifest_digest: hash(materializedBytes), selection_state_digest: hash(selectionBytes),
    run_identity_digest: canonicalDigest(run), run_instance_id: run.run_instance_id,
  } } };
  return { paths, bundle, verified, check: () => verifyEvaluatorBoundaryRootLineageForTest(bundle, verified) };
}

if (process.argv[2] === "--saved-root") {
  // Read-only diagnosis of the preserved synthetic failure. No normalization,
  // native process, evaluator execution, raw scoring or new authority is created.
  assert.equal(process.argv.length, 4, "expected --saved-root <synthetic-evidence-directory>");
  const saved = realpathSync(process.argv[3]);
  const context = JSON.parse(readFileSync(resolve(saved, "context.json"), "utf8"));
  const proof = JSON.parse(readFileSync(resolve(saved, "scoring-verification.json"), "utf8"));
  assert.equal(context.sourceRevision, "a8014637ccfdfadb8262bea07b76f72054597a8a");
  assert.equal(proof.source_revision, context.sourceRevision);
  assert.equal(proof.synthetic_clone_revision, context.cloneRevision);
  assert.equal(realpathSync(context.work), saved);
  assert.equal(proof.synthetic_native_attempts, 28);
  assert.equal(proof.completed, false);
  for (const field of ["provider_calls", "measured_result_reads", "private_evaluator_process_calls"]) assert.equal(proof[field], 0);
  const normalizedRoot = resolve(saved, "normalized-current_prompt");
  const generations = readdirSync(resolve(normalizedRoot, "generations"));
  assert.equal(generations.length, 1, "refuse ambiguous preserved generations");
  assert.match(generations[0], /^snapshot-[a-f0-9]{64}$/u);
  const sourceSnapshotDigest = `sha256:${generations[0].slice("snapshot-".length)}`;
  const normalizer = await import("./ask-benchmark-normalized-results.mjs");
  const verified = normalizer.verifyNormalizedPortfolioResults({ root, outputPath: normalizedRoot, sourceSnapshotDigest });
  const paths = {
    materializedPath: resolve(saved, "materialized", "materialization-manifest.json"),
    selectionState: resolve(saved, "selection-state", "selection-state.json"),
    runDir: resolve(saved, "run-current_prompt", "run-identity.json"),
  };
  const before = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, hash(readFileSync(path))]));
  verifyEvaluatorBoundaryRootLineageForTest({ markerPaths: paths, canonicalRoots: { normalizedResultsPath: normalizedRoot } }, verified);
  const after = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, hash(readFileSync(path))]));
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ status: "SAVED_ROOT_LINEAGE_PASS", source_revision: context.sourceRevision,
    synthetic_clone_revision: context.cloneRevision, materialization_bytes: readFileSync(paths.materializedPath).length,
    materialization_digest: before.materializedPath, source_snapshot_digest: sourceSnapshotDigest,
    saved_markers_unchanged: true, scope: "saved normalized snapshot and root lineage only; not complete scoring integration" }, null, 2));
} else {
  assert.ok(process.argv.length <= 2, "unsupported arguments");
  test("small root markers retain existing behavior and confer no capability", t => {
    const f = fixture(t); assert.equal(f.check(), undefined);
  });
  test("a valid materialization manifest larger than 1 MiB retains exact lineage", t => {
    const f = fixture(t, largeValidJson()); assert.doesNotThrow(f.check);
  });
  test("a large manifest still rejects a mismatching source digest", t => {
    const f = fixture(t, largeValidJson()); f.verified.manifest.source.materialization_manifest_digest = hash("other");
    assert.throws(f.check, /materialized root manifest does not match normalized result lineage/u);
  });
  test("a large malformed JSON manifest is not accepted by matching its bytes", t => {
    const f = fixture(t, Buffer.from('{"payload":' + ' '.repeat(2 * MiB)));
    assert.throws(f.check, /invalid JSON/u);
  });
  test("duplicate JSON keys in a large root manifest remain rejected", t => {
    const f = fixture(t, Buffer.from('{"payload":"' + 'x'.repeat(2 * MiB) + '","duplicate":1,"duplicate":2}'));
    assert.throws(f.check, { code: "DUPLICATE_JSON_OBJECT_KEY" });
  });
  test("invalid UTF-8 in a large root manifest remains rejected", t => {
    const f = fixture(t, Buffer.concat([Buffer.from('{"payload":"' + 'x'.repeat(2 * MiB)), Buffer.from([0xff]), Buffer.from('"}') ]));
    assert.throws(f.check, /not valid UTF-8/u);
  });
  test("an empty materialization manifest remains rejected", t => {
    const f = fixture(t, Buffer.alloc(0)); assert.throws(f.check, /bounded non-empty regular file/u);
  });
  test("materialization above the existing 256 MiB file cap fails before parsing", t => {
    const f = fixture(t); const fd = openSync(f.paths.materializedPath, "r+");
    try { ftruncateSync(fd, 256 * MiB + 1); } finally { closeSync(fd); }
    assert.throws(f.check, /bounded non-empty regular file/u);
  });
  test("selection JSON keeps its existing 1 MiB cap", t => {
    const f = fixture(t); const bytes = largeValidJson(); writeFileSync(f.paths.selectionState, bytes);
    f.verified.manifest.source.selection_state_digest = hash(bytes);
    assert.throws(f.check, /selection-state root index must be a bounded non-empty regular file/u);
  });
  test("run identity JSON keeps its existing 1 MiB cap", t => {
    const f = fixture(t); writeFileSync(f.paths.runDir, largeValidJson());
    assert.throws(f.check, /execution run identity must be a bounded non-empty regular file/u);
  });
  test("selection digest binding is unchanged", t => {
    const f = fixture(t); f.verified.manifest.source.selection_state_digest = hash("wrong");
    assert.throws(f.check, /selection-state root index does not match/u);
  });
  test("run ID substitution and run digest substitution are each rejected", t => {
    for (const field of ["run_instance_id", "run_identity_digest"]) {
      const f = fixture(t); f.verified.manifest.source[field] = "wrong";
      assert.throws(f.check, /execution run root identity does not match/u);
    }
  });
  test("a generation outside the normalized-results root is still rejected", t => {
    const f = fixture(t); f.verified.generationPath = resolve(f.verified.generationPath, "..", "..", "..", "outside");
    assert.throws(f.check, /normalized generation escapes/u);
  });
}

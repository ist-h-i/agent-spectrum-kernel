import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { prepareFrozenEvaluatorTestRoot, runFrozenFixtureSuite } from "./test-frozen-evaluator-fixture.mjs";
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fixtureId = "synthetic-fixture";
const testPath = "scripts/current-test.mjs";
function repository(t, change = () => {}, { includeAuthorityData = false } = {}) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-frozen-context-unit-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
    encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
  const put = (path, value) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), value); };
  const commit = message => { git("add", "--", "."); git("-c", "user.name=ASK Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message); return git("rev-parse", "HEAD"); };
  git("init", "--quiet");
  const frozen = Buffer.from('export const engine = "frozen";\n'); put("scripts/engine.mjs", frozen);
  const authorityDataPath = "products/ask-core-bundle/capabilities.json";
  const frozenAuthorityData = Buffer.from('{"kind":"frozen-test-data"}\n');
  if (includeAuthorityData) put(authorityDataPath, frozenAuthorityData);
  const revision = commit("frozen source");
  const reference = { fixture_id: fixtureId, evaluator_revision: revision, evaluator_source_identity: {
    base_git_revision: revision, source_tree_digest: hash("synthetic-raw-projection-test-only"),
    source_files: [{ path: "scripts/engine.mjs", bytes: frozen.length, sha256: hash(frozen) }],
  } };
  if (includeAuthorityData) reference.evaluator_source_identity.source_files.push({ path: authorityDataPath, bytes: frozenAuthorityData.length, sha256: hash(frozenAuthorityData) });
  change(reference);
  const referencePath = `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`;
  put(referencePath, JSON.stringify(reference));
  put("scripts/engine.mjs", 'export const engine = "current";\n');
  if (includeAuthorityData) put(authorityDataPath, '{"kind":"current-test-data"}\n');
  put(testPath, 'throw new Error("projection helper must not execute tests");\n');
  put("public-fixture.json", '{"unchanged":true}\n');
  const head = commit("current test and frozen public reference");
  return { root, git, head, referencePath, revision, frozen, authorityDataPath, frozenAuthorityData, args: { root, fixtureId, testPath } };
}

test("projects frozen source but preserves the current test, public metadata and original checkout", t => {
  const f = repository(t); const context = prepareFrozenEvaluatorTestRoot(f.args);
  try {
    assert.deepEqual(readFileSync(resolve(context.checkout, "scripts/engine.mjs")), f.frozen);
    for (const path of [testPath, f.referencePath, "public-fixture.json"]) assert.deepEqual(readFileSync(resolve(context.checkout, path)), readFileSync(resolve(f.root, path)));
    assert.equal(context.evidence.source_revision, f.head); assert.equal(context.evidence.frozen_evaluator_revision, f.revision);
    assert.notEqual(context.evidence.test_context_revision, f.head);
    assert.deepEqual(context.evidence.projected_paths, ["scripts/engine.mjs"]);
    assert.equal(context.evidence.current_head_runtime_verified, false);
    assert.equal(f.git("rev-parse", "HEAD"), f.head); assert.equal(f.git("status", "--porcelain"), "");
  } finally { context.dispose(); }
  assert.equal(existsSync(context.checkout), false);
});
test("projects exact frozen declared product data without rewriting public authority or granting runtime", t => {
  const f = repository(t, () => {}, { includeAuthorityData: true });
  const context = prepareFrozenEvaluatorTestRoot(f.args);
  try {
    assert.deepEqual(readFileSync(resolve(context.checkout, f.authorityDataPath)), f.frozenAuthorityData);
    for (const path of [testPath, f.referencePath, "public-fixture.json"]) assert.deepEqual(readFileSync(resolve(context.checkout, path)), readFileSync(resolve(f.root, path)));
    assert.deepEqual(context.evidence.projected_paths, [f.authorityDataPath, "scripts/engine.mjs"].sort());
    assert.equal(context.evidence.current_head_runtime_verified, false);
    assert.equal(context.evidence.admission_created, false);
    assert.equal(f.git("rev-parse", "HEAD"), f.head);
    assert.equal(f.git("status", "--porcelain"), "");
  } finally { context.dispose(); }
});
test("declared product data hash drift is refused before projection", t => {
  const f = repository(t, r => { r.evaluator_source_identity.source_files[1].sha256 = hash("wrong-data"); }, { includeAuthorityData: true });
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args), /frozen source drift/u);
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
  assert.equal(f.git("status", "--porcelain"), "");
});
test("an undeclared product file cannot widen frozen projection", t => {
  const f = repository(t, r => { r.evaluator_source_identity.source_files[1].path = "products/ask-core-bundle/unregistered.json"; }, { includeAuthorityData: true });
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args), /only frozen dependency/u);
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
  assert.equal(f.git("status", "--porcelain"), "");
});
test("a current declared-product symlink cannot redirect the projection write", t => {
  const f = repository(t, () => {}, { includeAuthorityData: true });
  const path = resolve(f.root, f.authorityDataPath); rmSync(path); symlinkSync("../../public-fixture.json", path);
  f.git("add", "."); f.git("-c", "user.name=ASK Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "data link");
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args), /symlink/u);
  assert.equal(readFileSync(resolve(f.root, "public-fixture.json"), "utf8"), '{"unchanged":true}\n');
  assert.equal(f.git("status", "--porcelain"), "");
});
for (const [name, mutate] of [
  ["hash drift", r => { r.evaluator_source_identity.source_files[0].sha256 = hash("wrong"); }],
  ["size drift", r => { r.evaluator_source_identity.source_files[0].bytes++; }],
  ["unknown revision", r => { r.evaluator_revision = r.evaluator_source_identity.base_git_revision = "f".repeat(40); }],
  ["revision transplant", r => { r.evaluator_revision = "f".repeat(40); }],
  ["empty inventory", r => { r.evaluator_source_identity.source_files = []; }],
  ["duplicate source", r => { r.evaluator_source_identity.source_files.push(r.evaluator_source_identity.source_files[0]); }],
  ["parent path", r => { r.evaluator_source_identity.source_files[0].path = "scripts/../engine.mjs"; }],
  ["public authority rewrite", r => { r.evaluator_source_identity.source_files[0].path = "benchmarks/fixtures/authority.json"; }],
  ["test replacement", r => { r.evaluator_source_identity.source_files[0].path = testPath; }],
]) test(`rejects ${name} without changing the source checkout`, t => {
  const f = repository(t, mutate);
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args));
  assert.equal(f.git("rev-parse", "HEAD"), f.head); assert.equal(f.git("status", "--porcelain"), "");
});
test("uncommitted public/reference changes are not tested as committed evidence", t => {
  const f = repository(t); writeFileSync(resolve(f.root, f.referencePath), "{}\n");
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args), /clean candidate/u);
});
test("a current symlink cannot redirect the projection write", t => {
  const f = repository(t); const file = resolve(f.root, "scripts/engine.mjs"); rmSync(file); symlinkSync("../public-fixture.json", file);
  f.git("add", "."); f.git("-c", "user.name=ASK Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "link");
  assert.throws(() => prepareFrozenEvaluatorTestRoot(f.args), /symlink/u);
  assert.equal(readFileSync(resolve(f.root, "public-fixture.json"), "utf8"), '{"unchanged":true}\n');
});
test("CLI accepts no unknown suite or arbitrary extra argument", () => {
  for (const args of [[], ["unknown.mjs"], ["test-ask-benchmark-mn-doc-config-correction.mjs", "--private-root"]]) {
    assert.throws(() => runFrozenFixtureSuite(args, { root: "/never-read" }));
  }
});

test("real frozen PFci graph still rejects source-byte drift; historical compatibility grants no current runtime or admission", async t => {
  const root = resolve(import.meta.dirname, "..");
  const context = prepareFrozenEvaluatorTestRoot({ root, fixtureId: "pf-ci-cache-flake", testPath: "scripts/test-ask-benchmark-pf-ci-cache.mjs" });
  t.after(() => context.dispose());
  const reference = JSON.parse(readFileSync(resolve(context.checkout, context.referencePath), "utf8"));
  const boundaryPath = resolve(context.checkout, "scripts/ask-benchmark-evaluator-boundary.mjs");
  const { validateEvaluatorSourceIdentity } = await import(pathToFileURL(boundaryPath));
  const options = { root: context.checkout, identity: reference.evaluator_source_identity,
    expectedRevision: reference.evaluator_revision, expectedGeneratorSourceDigest: reference.evaluator_source_identity.generator_source_digest };
  validateEvaluatorSourceIdentity(options);
  writeFileSync(boundaryPath, Buffer.concat([readFileSync(boundaryPath), Buffer.from("\n// synthetic source drift\n")]));
  assert.throws(() => validateEvaluatorSourceIdentity(options), /source bytes drift/u);
  assert.equal(context.evidence.current_head_runtime_verified, false);
  assert.equal(context.evidence.admission_created, false);
});

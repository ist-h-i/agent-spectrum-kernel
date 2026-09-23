#!/usr/bin/env node
// Historical compatibility test context, never an execution/admission authority.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURES = Object.freeze([
  "mn-doc-config-correction", "mn-focused-regression-test", "mp-ci-evidence-gap",
  "mp-accessibility-interaction-review", "mp-data-migration-handoff",
  "mp-frontend-state-review", "mp-iac-rollback-design", "mp-performance-investigation",
]);
const TESTS = new Map(FIXTURES.flatMap(id => [
  [`test-ask-benchmark-${id}.mjs`, id],
  ...(id.startsWith("mp-") ? [[`test-ask-benchmark-${id}${id === "mp-frontend-state-review" ? "-archive" : "-review-archive"}.mjs`, id]] : []),
]));
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (root, args, encoding = "utf8") => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
  encoding, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
});
const text = (root, args) => git(root, args).trim();
function regularPath(root, path) {
  assert.ok(typeof path === "string" && /^[A-Za-z0-9._/-]+$/u.test(path)
    && !path.split("/").some(part => ["", ".", ".."].includes(part)), "unsafe frozen source path");
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = resolve(cursor, part);
    assert.equal(lstatSync(cursor).isSymbolicLink(), false, "frozen source traverses a symlink");
  }
  assert.ok(lstatSync(cursor).isFile(), "frozen source is not a regular file");
  return cursor;
}

/**
 * Use current tracked public fixture/test bytes with the fixture's exact frozen
 * dependency closure, in a separate local test-only commit. No authority is
 * resealed. The current generic runner/scorer tests must still run at PR HEAD.
 * This function does not import or execute an evaluator or a test.
 */
export function prepareFrozenEvaluatorTestRoot({ root, fixtureId, testPath }) {
  const sourceRoot = realpathSync(root);
  const sourceRevision = text(sourceRoot, ["rev-parse", "--verify", "HEAD"]);
  assert.match(sourceRevision, /^[a-f0-9]{40}$/u);
  assert.equal(text(sourceRoot, ["status", "--porcelain", "--untracked-files=normal"]), "", "historical compatibility requires a clean candidate");
  assert.match(fixtureId, /^[a-z0-9-]+$/u);
  const referencePath = `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`;
  const referenceBytes = readFileSync(regularPath(sourceRoot, referencePath));
  assert.deepEqual(referenceBytes, git(sourceRoot, ["show", `${sourceRevision}:${referencePath}`], null));
  const reference = JSON.parse(referenceBytes);
  assert.equal(reference.fixture_id, fixtureId);
  const identity = reference.evaluator_source_identity;
  assert.match(reference.evaluator_revision, /^[a-f0-9]{40}$/u);
  assert.equal(identity?.base_git_revision, reference.evaluator_revision);
  assert.ok(Array.isArray(identity.source_files) && identity.source_files.length > 0 && identity.source_files.length <= 1024);
  const paths = identity.source_files.map(entry => entry.path);
  assert.equal(new Set(paths).size, paths.length, "duplicate frozen sources");
  assert.ok(!paths.includes(testPath), "do not replace the current test with an old test");
  const testBytes = readFileSync(regularPath(sourceRoot, testPath));
  assert.deepEqual(testBytes, git(sourceRoot, ["show", `${sourceRevision}:${testPath}`], null));
  let totalBytes = 0;
  const files = identity.source_files.map(entry => {
    assert.ok(typeof entry.path === "string" && /^(?:scripts|schemas|benchmarks\/schemas)\/[A-Za-z0-9._/-]+\.(?:mjs|cjs|js|json)$/u.test(entry.path)
      && !entry.path.split("/").some(part => ["", ".", ".."].includes(part)), "only frozen dependency modules/schemas may be projected");
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 64 * 1024 * 1024);
    totalBytes += entry.bytes; assert.ok(totalBytes <= 256 * 1024 * 1024, "frozen source byte budget");
    const mode = text(sourceRoot, ["ls-tree", identity.base_git_revision, "--", entry.path]);
    assert.match(mode, /^100(?:644|755) blob [a-f0-9]{40}\t/u, "historical source must be a Git regular file");
    const bytes = git(sourceRoot, ["show", `${identity.base_git_revision}:${entry.path}`], null);
    assert.equal(bytes.length, entry.bytes); assert.equal(hash(bytes), entry.sha256, `frozen source drift: ${entry.path}`);
    return { ...entry, bytesValue: bytes, mode: mode.startsWith("100755") ? 0o755 : 0o644 };
  });
  const work = realpathSync(mkdtempSync(resolve(realpathSync(tmpdir()), "ask-frozen-fixture-test-")));
  const checkout = resolve(work, "checkout");
  try {
    git(sourceRoot, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", sourceRoot, checkout]);
    git(checkout, ["checkout", "--quiet", "--detach", sourceRevision]);
    for (const file of files) {
      // The current candidate still contains these shared source paths. Missing
      // paths are not silently recreated as a way around a malformed checkout.
      const destination = regularPath(checkout, file.path);
      writeFileSync(destination, file.bytesValue); chmodSync(destination, file.mode);
    }
    git(checkout, ["add", "--", ...paths]);
    git(checkout, ["-c", "user.name=ASK historical compatibility test", "-c", "user.email=synthetic-test@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "test-only frozen evaluator dependency context"]);
    const testRevision = text(checkout, ["rev-parse", "HEAD"]);
    const changed = text(checkout, ["diff", "--name-only", sourceRevision, testRevision]).split("\n").filter(Boolean);
    assert.ok(changed.every(path => paths.includes(path)), "test context changed a non-source artifact");
    assert.equal(text(checkout, ["rev-parse", "HEAD^"]), sourceRevision);
    assert.deepEqual(readFileSync(resolve(checkout, referencePath)), referenceBytes);
    assert.deepEqual(readFileSync(resolve(checkout, testPath)), testBytes);
    for (const file of files) assert.equal(hash(readFileSync(resolve(checkout, file.path))), file.sha256);
    assert.equal(text(sourceRoot, ["rev-parse", "HEAD"]), sourceRevision);
    assert.equal(text(sourceRoot, ["status", "--porcelain", "--untracked-files=normal"]), "");
    return { checkout, referencePath, evidence: {
      evidence_kind: "historical_fixture_compatibility", source_revision: sourceRevision,
      frozen_evaluator_revision: identity.base_git_revision, test_context_revision: testRevision,
      fixture_id: fixtureId, test_path: testPath, current_test_digest: hash(testBytes),
      frozen_source_tree_digest: identity.source_tree_digest, projected_paths: changed,
      current_head_runtime_verified: false, admission_created: false,
    }, dispose: () => rmSync(work, { recursive: true, force: true }) };
  } catch (error) { rmSync(work, { recursive: true, force: true }); throw error; }
}

export function runFrozenFixtureSuite(argv, { root = ROOT } = {}) {
  assert.equal(argv.length, 1, "expected one registered fixture test filename");
  const fixtureId = TESTS.get(argv[0]); assert.ok(fixtureId, "unknown historical fixture test");
  assert.equal(process.versions.node.split(".")[0], "24", "fixture integration requires Node 24");
  const context = prepareFrozenEvaluatorTestRoot({ root, fixtureId, testPath: `scripts/${argv[0]}` });
  try {
    console.log(JSON.stringify(context.evidence));
    // Recompute the complete graph with the real frozen verifier. File hashes
    // alone are not a replacement for source/dependency closure verification.
    const probe = `import { readFileSync } from 'node:fs';
import { validateEvaluatorSourceIdentity } from './scripts/ask-benchmark-evaluator-boundary.mjs';
const reference = JSON.parse(readFileSync(${JSON.stringify(context.referencePath)}, 'utf8'));
validateEvaluatorSourceIdentity({ root: process.cwd(), identity: reference.evaluator_source_identity,
  expectedRevision: reference.evaluator_revision, expectedGeneratorSourceDigest: reference.evaluator_source_identity.generator_source_digest });`;
    const verified = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: context.checkout, stdio: "inherit" });
    if (verified.error) throw verified.error;
    if (verified.status !== 0) return verified.status ?? 1;
    const result = spawnSync(process.execPath, [`scripts/${argv[0]}`], { cwd: context.checkout, stdio: "inherit" });
    if (result.error) throw result.error;
    // A failed test remains failed. There is no current/historical retry fallback.
    return result.status ?? 1;
  } finally {
    try {
      assert.equal(text(root, ["rev-parse", "HEAD"]), context.evidence.source_revision);
      assert.equal(text(root, ["status", "--porcelain", "--untracked-files=normal"]), "");
    } finally { context.dispose(); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = runFrozenFixtureSuite(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMpIacRollbackDesignReviewArchive } from "./ask-benchmark-mp-iac-rollback-design-review-archive.mjs";
import { establishReviewArchiveIdentity } from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (argv[index] === "--private-case-root") args.caseRoot = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (Boolean(args.privateRoot) !== Boolean(args.caseRoot)) throw new Error("private and case roots must be supplied together");
  return args;
}

const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const manifest = (path) => JSON.parse(execFileSync("unzip", ["-p", path, "REVIEW-MANIFEST.json"], { encoding: "utf8" }));
const cloneDirectory = (source, destination) => { cpSync(source, destination, { recursive: true, preserveTimestamps: true }); return destination; };

function validateWithAuthorityRoots({ privateRoot, caseRoot }) {
  const reviewedHead = process.env.REVIEW_CANDIDATE_HEAD;
  const sourceRevision = process.env.SOURCE_REVISION;
  assert.match(reviewedHead ?? "", /^[a-f0-9]{40}$/u, "REVIEW_CANDIDATE_HEAD is required");
  assert.match(sourceRevision ?? "", /^[a-f0-9]{40}$/u, "SOURCE_REVISION is required");
  assert.equal(git(ROOT, ["rev-parse", "HEAD"]), reviewedHead, "reviewed head must be the exact repository HEAD");
  const work = mkdtempSync(resolve(tmpdir(), "mp-iac-review-archive-"));
  const generate = (authorityRoot, name, overrides = {}) => generateMpIacRollbackDesignReviewArchive({ root: ROOT, privateRoot: authorityRoot, caseRoot, outputPath: resolve(work, name), reviewedHead, sourceRevision, ...overrides });
  try {
    const first = generate(privateRoot, "a.zip");
    const second = generate(privateRoot, "b.zip");
    assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null });
    assert.deepEqual(readFileSync(first.archivePath), readFileSync(second.archivePath));
    const record = manifest(first.archivePath);
    assert.deepEqual(record.review_target, { repository: "ist-h-i/agent-spectrum-kernel", reviewed_head: reviewedHead });
    assert.equal(record.evaluator_source_revision, sourceRevision, "archive evaluator revision must equal SOURCE_REVISION independently of reviewed HEAD");
    assert.equal(record.measured_execution, false);
    assert.equal(record.archive_format.fixed_timestamp, "1980-01-01T00:00:00");
    const generatorPaths = record.archive_format.generator_source_inventory.map(({ path }) => path);
    assert.ok(generatorPaths.includes("scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs"));
    assert.ok(generatorPaths.includes("scripts/ask-benchmark-review-archive-identity.mjs"));

    const drifted = cloneDirectory(privateRoot, resolve(work, "drifted-private"));
    const driftedBundle = JSON.parse(readFileSync(resolve(drifted, "private-evaluator-bundle.json"), "utf8"));
    const driftedAsset = resolve(drifted, driftedBundle.asset_inventory[0].path);
    writeFileSync(driftedAsset, Buffer.concat([readFileSync(driftedAsset), Buffer.from("\ndrift\n")]));
    assert.throws(() => generate(drifted, "drift.zip"), /private asset bytes/u, "asset byte drift");

    const extra = cloneDirectory(privateRoot, resolve(work, "extra-private"));
    writeFileSync(resolve(extra, "extra.txt"), "extra\n");
    assert.throws(() => generate(extra, "extra.zip"), /inventory is not closed/u, "extra private asset");

    const missing = cloneDirectory(privateRoot, resolve(work, "missing-private"));
    const missingBundle = JSON.parse(readFileSync(resolve(missing, "private-evaluator-bundle.json"), "utf8"));
    rmSync(resolve(missing, missingBundle.asset_inventory[0].path));
    assert.throws(() => generate(missing, "missing.zip"), /inventory is not closed/u, "missing private asset");

    const symlinked = cloneDirectory(privateRoot, resolve(work, "symlinked-private"));
    const symlinkBundle = JSON.parse(readFileSync(resolve(symlinked, "private-evaluator-bundle.json"), "utf8"));
    const symlinkAsset = resolve(symlinked, symlinkBundle.asset_inventory[0].path);
    rmSync(symlinkAsset);
    symlinkSync(resolve(privateRoot, symlinkBundle.asset_inventory[0].path), symlinkAsset);
    assert.throws(() => generate(symlinked, "symlink.zip"), /symlink/u, "symlink private asset");

    const nonregular = cloneDirectory(privateRoot, resolve(work, "nonregular-private"));
    const fifo = spawnSync("mkfifo", [resolve(nonregular, "unsupported-entry")]);
    assert.equal(fifo.status, 0, String(fifo.stderr));
    assert.throws(() => generate(nonregular, "nonregular.zip"), /not regular/u, "nonregular private asset");

    const invalidClosure = cloneDirectory(privateRoot, resolve(work, "invalid-closure"));
    const closurePath = resolve(invalidClosure, "private-evaluator-bundle.json");
    const closureBundle = JSON.parse(readFileSync(closurePath, "utf8"));
    closureBundle.review.status = closureBundle.review.status === "pending" ? "completed" : "pending";
    writeFileSync(closurePath, `${JSON.stringify(closureBundle, null, 2)}\n`);
    assert.throws(() => generate(invalidClosure, "closure.zip"), /bundle digest closure/u, "bundle digest recomputation");
    assert.throws(() => generate(privateRoot, "collapsed-revisions.zip", { sourceRevision: reviewedHead }), /must be distinct/u, "collapsed source/review revisions");
    assert.throws(() => generate(privateRoot, "stale-source.zip", { sourceRevision: "0".repeat(40) }), /source revision|SOURCE_REVISION|evaluator/u, "stale source revision");
    assert.throws(() => establishReviewArchiveIdentity({
      root: ROOT,
      runtimeRoot: ROOT,
      reviewedHead: sourceRevision,
      sourceRevision: reviewedHead,
      evaluatorRevision: reviewedHead,
      generatorPath: "scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs",
    }), /reviewed HEAD differs/u, "swapped source/review revisions");
    const nonparentSource = git(ROOT, ["rev-parse", `${sourceRevision}^`]);
    assert.throws(() => establishReviewArchiveIdentity({
      root: ROOT,
      runtimeRoot: ROOT,
      reviewedHead,
      sourceRevision: nonparentSource,
      evaluatorRevision: nonparentSource,
      generatorPath: "scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs",
    }), /direct one-parent descendant/u, "nonparent source revision transplant");
    return { archive_sha256: first.archiveSha256, archive_bytes: first.archiveBytes };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const source = readFileSync(resolve(ROOT, "scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs"), "utf8");
for (const token of ["computeEvaluatorBundleId", "computeEvaluatorBundleDigest", "asset_inventory", "inventory is not closed", "evaluator_source_revision", "review_target", "generator_source_inventory", "measured_execution", "fixed_timestamp"]) assert.ok(source.includes(token), `archive source must bind ${token}`);
assert.throws(() => generateMpIacRollbackDesignReviewArchive(), /complete exact-head configuration/u, "required arguments");
const args = parse(process.argv.slice(2));
if (!args.privateRoot) console.log(JSON.stringify({ fixture_id: "mp-iac-rollback-design", static_contract: "pass", archive_generation: "not_run" }));
else console.log(JSON.stringify({ fixture_id: "mp-iac-rollback-design", static_contract: "pass", archive_generation: "pass", ...validateWithAuthorityRoots(args) }));

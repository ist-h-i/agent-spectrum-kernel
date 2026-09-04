import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMpPerformanceInvestigationReviewArchive } from "./ask-benchmark-mp-performance-investigation-review-archive.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHARED_GENERATOR = "scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs";

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

function validateWithAuthorityRoots({ privateRoot, caseRoot }) {
  const reviewedHead = process.env.REVIEW_CANDIDATE_HEAD;
  const sourceRevision = process.env.SOURCE_REVISION;
  assert.match(reviewedHead ?? "", /^[a-f0-9]{40}$/u, "REVIEW_CANDIDATE_HEAD is required");
  assert.match(sourceRevision ?? "", /^[a-f0-9]{40}$/u, "SOURCE_REVISION is required");
  assert.equal(git(ROOT, ["rev-parse", "HEAD"]), reviewedHead, "reviewed head must be the exact repository HEAD");
  const work = mkdtempSync(resolve(tmpdir(), "mp-performance-review-archive-"));
  try {
    const first = generateMpPerformanceInvestigationReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "a.zip"), reviewedHead, sourceRevision });
    const second = generateMpPerformanceInvestigationReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "b.zip"), reviewedHead, sourceRevision });
    assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null });
    assert.deepEqual(readFileSync(first.archivePath), readFileSync(second.archivePath));
    const record = manifest(first.archivePath);
    assert.deepEqual(record.review_target, { repository: "ist-h-i/agent-spectrum-kernel", reviewed_head: reviewedHead });
    assert.equal(record.evaluator_source_revision, sourceRevision, "archive evaluator revision must equal SOURCE_REVISION independently of reviewed HEAD");
    const generatorPaths = record.archive_format.generator_source_inventory.map(({ path }) => path);
    assert.ok(generatorPaths.includes("scripts/ask-benchmark-mp-performance-investigation-review-archive.mjs"));
    assert.ok(generatorPaths.includes(SHARED_GENERATOR));
    assert.ok(generatorPaths.includes("scripts/ask-benchmark-review-archive-identity.mjs"));
    assert.ok(record.entries.some(({ path }) => path === `archive-generator-source/${SHARED_GENERATOR}`), "archive must contain the committed shared generator dependency");

    const repository = resolve(work, "shared-substitution-repository");
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, repository]);
    execFileSync("git", ["-C", repository, "remote", "set-url", "origin", "https://github.com/ist-h-i/agent-spectrum-kernel.git"]);
    writeFileSync(resolve(repository, SHARED_GENERATOR), Buffer.concat([readFileSync(resolve(repository, SHARED_GENERATOR)), Buffer.from("\nshared drift\n")]));
    execFileSync("git", ["-C", repository, "add", SHARED_GENERATOR]);
    execFileSync("git", ["-C", repository, "-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "--quiet", "--amend", "--no-edit"]);
    const substitutedHead = git(repository, ["rev-parse", "HEAD"]);
    assert.throws(
      () => generateMpPerformanceInvestigationReviewArchive({ root: repository, privateRoot, caseRoot, outputPath: resolve(work, "shared-substitution.zip"), reviewedHead: substitutedHead, sourceRevision }),
      /generator source identity differs/u,
      "clean direct-child shared generator substitution must fail closed",
    );
    assert.throws(
      () => generateMpPerformanceInvestigationReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "collapsed-revisions.zip"), reviewedHead, sourceRevision: reviewedHead }),
      /must be distinct/u,
      "collapsed source/review revisions must fail closed",
    );
    assert.throws(
      () => generateMpPerformanceInvestigationReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "stale-source.zip"), reviewedHead, sourceRevision: "0".repeat(40) }),
      /source revision|SOURCE_REVISION|evaluator/u,
      "stale source revision must fail closed",
    );
    return { archive_sha256: first.archiveSha256, archive_bytes: first.archiveBytes };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const wrapperSource = readFileSync(resolve(ROOT, "scripts/ask-benchmark-mp-performance-investigation-review-archive.mjs"), "utf8");
assert.ok(wrapperSource.includes("generateMpPerformanceInvestigationReviewArchiveFromShared"));
assert.ok(wrapperSource.includes(`./${SHARED_GENERATOR.split("/").at(-1)}`), "performance archive must bind the shared generator dependency");
const sharedSource = readFileSync(resolve(ROOT, SHARED_GENERATOR), "utf8");
for (const token of ["computeEvaluatorBundleId", "computeEvaluatorBundleDigest", "inventory is not closed", "generator_source_inventory"]) assert.ok(sharedSource.includes(token), `shared archive source must bind ${token}`);
assert.throws(() => generateMpPerformanceInvestigationReviewArchive(), /complete exact-head configuration/u, "required arguments");
const args = parse(process.argv.slice(2));
if (!args.privateRoot) console.log(JSON.stringify({ fixture_id: "mp-performance-investigation", static_contract: "pass", archive_generation: "not_run" }));
else console.log(JSON.stringify({ fixture_id: "mp-performance-investigation", static_contract: "pass", archive_generation: "pass", ...validateWithAuthorityRoots(args) }));

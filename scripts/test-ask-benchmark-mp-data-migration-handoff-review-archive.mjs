#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMpDataMigrationHandoffReviewArchive } from "./ask-benchmark-mp-data-migration-handoff-review-archive.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (argv[index] === "--case-root") args.caseRoot = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (Boolean(args.privateRoot) !== Boolean(args.caseRoot)) throw new Error("review archive test requires private and case roots together");
  return args;
}

function expectFailure(action, pattern, label) {
  assert.throws(action, pattern, label);
}

function manifest(path) {
  return JSON.parse(execFileSync("unzip", ["-p", path, "REVIEW-MANIFEST.json"], { encoding: "utf8" }));
}

function cloneDirectory(source, destination) {
  cpSync(source, destination, { recursive: true, preserveTimestamps: true });
  return destination;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function verifyArchive(path, result, reviewedHead, sourceRevision) {
  const record = manifest(path);
  assert.equal(record.fixture_id, "mp-data-migration-handoff");
  assert.deepEqual(record.review_target, { repository: "ist-h-i/agent-spectrum-kernel", reviewed_head: reviewedHead });
  assert.equal(record.evaluator_source_revision, sourceRevision);
  assert.equal(record.archive_format.fixed_timestamp, "1980-01-01T00:00:00");
  assert.equal(record.archive_format.compression_method, "store");
  assert.equal(record.independent_review_status, "pending");
  assert.equal(record.admission_status, "admission_pending");
  assert.equal(record.scoring_ready, false);
  assert.equal(record.measured_execution, false);
  assert.ok(record.private_case_count > 0);
  const paths = record.entries.map(({ path }) => path);
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.some((path) => path.startsWith("evaluator-source/")));
  assert.ok(paths.includes("repository/benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/requirement-record.json"));
  assert.ok(paths.includes("repository/benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/output-contract.json"));
  assert.ok(paths.includes("repository/benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/scoring-input-freeze-manifest.json"));
  assert.ok(paths.includes("repository/benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/input-manifest.json"));
  for (const entry of record.entries) {
    assert.match(entry.sha256, /^sha256:[a-f0-9]{64}$/u);
    assert.ok(Number.isInteger(entry.bytes) && entry.bytes > 0);
    assert.ok(Number.isInteger(entry.mode) && entry.mode > 0);
  }
  const zipPaths = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(zipPaths, [...paths, "REVIEW-MANIFEST.json"].sort());
  assert.equal(result.entryCount, zipPaths.length);
  assert.equal(lstatSync(path).mode & 0o777, 0o644);
}

function validateWithAuthorityRoots({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "ask-mp-data-review-archive-test-"));
  try {
    const repositoryRoot = ROOT;
    const reviewedHead = process.env.REVIEW_CANDIDATE_HEAD;
    const sourceRevision = process.env.SOURCE_REVISION;
    assert.match(reviewedHead ?? "", /^[a-f0-9]{40}$/u, "REVIEW_CANDIDATE_HEAD is required");
    assert.match(sourceRevision ?? "", /^[a-f0-9]{40}$/u, "SOURCE_REVISION is required");
    assert.equal(git(repositoryRoot, ["rev-parse", "HEAD"]), reviewedHead, "reviewed head must be the exact repository HEAD");
    const generate = ({ root = repositoryRoot, authorityPrivateRoot = privateRoot, authorityCaseRoot = caseRoot, name, head = reviewedHead, source = sourceRevision }) => generateMpDataMigrationHandoffReviewArchive({ root, privateRoot: authorityPrivateRoot, caseRoot: authorityCaseRoot, outputPath: resolve(work, name), reviewedHead: head, sourceRevision: source });
    for (const [outputPath, label] of [
      [resolve(repositoryRoot, "forbidden-review.zip"), "repository"],
      [resolve(privateRoot, "forbidden-review.zip"), "private root"],
      [resolve(caseRoot, "forbidden-review.zip"), "case root"],
    ]) expectFailure(() => generateMpDataMigrationHandoffReviewArchive({ root: repositoryRoot, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision }), /output must stay outside/u, `output inside ${label}`);
    const firstPath = resolve(work, "first.zip");
    const secondPath = resolve(work, "second.zip");
    const first = generateMpDataMigrationHandoffReviewArchive({ root: repositoryRoot, privateRoot, caseRoot, outputPath: firstPath, reviewedHead, sourceRevision });
    const second = generateMpDataMigrationHandoffReviewArchive({ root: repositoryRoot, privateRoot, caseRoot, outputPath: secondPath, reviewedHead, sourceRevision });
    assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null }, "two archive generations must have identical identity");
    assert.deepEqual(readFileSync(firstPath), readFileSync(secondPath), "two archive generations must be byte-identical");
    verifyArchive(firstPath, first, reviewedHead, sourceRevision);
    expectFailure(() => generateMpDataMigrationHandoffReviewArchive({ root: repositoryRoot, privateRoot, caseRoot, outputPath: firstPath, reviewedHead, sourceRevision }), /exist|EEXIST/u, "output must use exclusive creation");
    expectFailure(() => generate({ name: "wrong-head.zip", head: "0".repeat(40) }), /reviewed HEAD/u, "wrong reviewed HEAD");
    expectFailure(() => generate({ name: "collapsed-revisions.zip", source: reviewedHead }), /must be distinct/u, "collapsed source/review revisions");
    expectFailure(() => generate({ name: "stale-source.zip", source: "0".repeat(40) }), /source revision|SOURCE_REVISION|evaluator/u, "stale source revision");

    const driftedPrivate = cloneDirectory(privateRoot, resolve(work, "drifted-private"));
    const privateBundle = JSON.parse(readFileSync(resolve(driftedPrivate, "private-evaluator-bundle.json"), "utf8"));
    const driftPath = resolve(driftedPrivate, privateBundle.asset_inventory[0].path);
    writeFileSync(driftPath, Buffer.concat([readFileSync(driftPath), Buffer.from("\ndrift\n")]));
    expectFailure(() => generate({ authorityPrivateRoot: driftedPrivate, name: "private-drift.zip" }), /private asset bytes/u, "private byte drift");

    const transplantedPrivate = cloneDirectory(privateRoot, resolve(work, "transplanted-private"));
    const transplantedBundlePath = resolve(transplantedPrivate, "private-evaluator-bundle.json");
    const transplantedBundle = JSON.parse(readFileSync(transplantedBundlePath, "utf8"));
    transplantedBundle.evaluator_revision = "0".repeat(40);
    writeFileSync(transplantedBundlePath, `${JSON.stringify(transplantedBundle, null, 2)}\n`);
    expectFailure(() => generate({ authorityPrivateRoot: transplantedPrivate, name: "private-transplant.zip" }), /private\/public evaluator identity/u, "private transplant");

    const transplantedCases = cloneDirectory(caseRoot, resolve(work, "transplanted-cases"));
    const casesPath = resolve(transplantedCases, "cases.json");
    const cases = JSON.parse(readFileSync(casesPath, "utf8"));
    cases.fixture_id = "foreign-fixture";
    writeFileSync(casesPath, `${JSON.stringify(cases, null, 2)}\n`);
    expectFailure(() => generate({ authorityCaseRoot: transplantedCases, name: "case-transplant.zip" }), /private case identity/u, "case transplant");

    const symlinkedPrivate = cloneDirectory(privateRoot, resolve(work, "symlinked-private"));
    const symlinkBundle = JSON.parse(readFileSync(resolve(symlinkedPrivate, "private-evaluator-bundle.json"), "utf8"));
    const symlinkAsset = resolve(symlinkedPrivate, symlinkBundle.asset_inventory[0].path);
    rmSync(symlinkAsset);
    symlinkSync(resolve(privateRoot, symlinkBundle.asset_inventory[0].path), symlinkAsset);
    expectFailure(() => generate({ authorityPrivateRoot: symlinkedPrivate, name: "symlink.zip" }), /symlink/u, "private symlink");

    const nonregularCases = cloneDirectory(caseRoot, resolve(work, "nonregular-cases"));
    const fifoPath = resolve(nonregularCases, "unsupported-entry");
    const fifo = spawnSync("mkfifo", [fifoPath]);
    assert.equal(fifo.status, 0, String(fifo.stderr));
    expectFailure(() => generate({ authorityCaseRoot: nonregularCases, name: "nonregular.zip" }), /not a regular file/u, "nonregular private case entry");

    const transplantedRepository = resolve(work, "repository-transplant");
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, transplantedRepository]);
    git(transplantedRepository, ["remote", "set-url", "origin", "https://github.com/foreign-owner/foreign-repository.git"]);
    expectFailure(() => generate({ root: transplantedRepository, name: "repository-transplant.zip" }), /repository identity differs/u, "repository transplant");
    git(transplantedRepository, ["remote", "set-url", "origin", "https://github.com/ist-h-i/agent-spectrum-kernel.git"]);
    const trackedPath = resolve(transplantedRepository, "benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/task.md");
    writeFileSync(trackedPath, Buffer.concat([readFileSync(trackedPath), Buffer.from("\ntracked drift\n")]));
    expectFailure(() => generate({ root: transplantedRepository, name: "tracked-drift.zip" }), /tracked bytes differ/u, "reviewed HEAD tracked-byte drift");
    return { archive_sha256: first.archiveSha256, archive_bytes: first.archiveBytes, entry_count: first.entryCount, private_case_count: first.privateCaseCount };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
expectFailure(() => generateMpDataMigrationHandoffReviewArchive(), /requires privateRoot/u, "required arguments");
if (!args.privateRoot) {
  console.log(JSON.stringify({ fixture_id: "mp-data-migration-handoff", static_contract: "pass", archive_generation: "not_run", reason: "private and case roots not supplied" }));
} else {
  console.log(JSON.stringify({ fixture_id: "mp-data-migration-handoff", static_contract: "pass", archive_generation: "pass", ...validateWithAuthorityRoots(args) }));
}

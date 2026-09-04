import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewArchiveCommitTreeEntries, validateReviewArchiveCases } from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (["--case-root", "--private-case-root"].includes(argv[index])) args.caseRoot = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (Boolean(args.privateRoot) !== Boolean(args.caseRoot)) throw new Error("review archive test requires private and case roots together");
  return args;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function manifest(path) {
  return JSON.parse(execFileSync("unzip", ["-p", path, "REVIEW-MANIFEST.json"], { encoding: "utf8" }));
}

function validateCaseClosureHelper(fixtureId) {
  const record = Buffer.from(`${JSON.stringify({ fixture_id: fixtureId, cases: [{ case_id: "alpha" }, { case_id: "beta" }] })}\n`);
  const entry = (path, bytes = Buffer.from("{}\n")) => ({ path: `cases/${path}`, bytes, mode: 0o644 });
  const valid = [entry("cases.json", record), entry("alpha/review.json"), entry("beta/review.json")];
  assert.equal(validateReviewArchiveCases({ fixtureId, caseEntries: valid, casePrefix: "cases", closedCaseFileName: "review.json" }).caseCount, 2);
  assert.throws(() => validateReviewArchiveCases({ fixtureId, caseEntries: valid.slice(0, -1), casePrefix: "cases", closedCaseFileName: "review.json" }), /inventory is not closed/u, "declared case payload omission must fail closed");
  assert.throws(() => validateReviewArchiveCases({ fixtureId, caseEntries: [...valid, entry("unrelated.txt")], casePrefix: "cases", closedCaseFileName: "review.json" }), /inventory is not closed/u, "undeclared case payload must fail closed");
}

function validateCommitTreeTypeBoundary() {
  const work = mkdtempSync(resolve(tmpdir(), "ask-review-tree-type-"));
  try {
    git(work, ["init", "--quiet"]);
    mkdirSync(resolve(work, "fixture"));
    writeFileSync(resolve(work, "fixture/regular.txt"), "regular\n");
    symlinkSync("regular.txt", resolve(work, "fixture/link.txt"));
    git(work, ["add", "fixture"]);
    execFileSync("git", ["-C", work, "-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "--quiet", "-m", "fixture tree"]);
    const revision = git(work, ["rev-parse", "HEAD"]);
    assert.throws(() => reviewArchiveCommitTreeEntries({ root: work, revision, path: "fixture", prefix: "repository" }), /nonregular/u, "committed symlink must not be flattened into an archive file");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function validateWithAuthorityRoots({ fixtureId, fixturePath, generate, privateRoot, caseRoot }) {
  const reviewedHead = process.env.REVIEW_CANDIDATE_HEAD;
  const sourceRevision = process.env.SOURCE_REVISION;
  assert.match(reviewedHead ?? "", /^[a-f0-9]{40}$/u, "REVIEW_CANDIDATE_HEAD is required");
  assert.match(sourceRevision ?? "", /^[a-f0-9]{40}$/u, "SOURCE_REVISION is required");
  assert.equal(git(ROOT, ["rev-parse", "HEAD"]), reviewedHead, "reviewed head must equal repository HEAD");
  const work = mkdtempSync(resolve(tmpdir(), `ask-${fixtureId}-archive-`));
  const invoke = ({ root = ROOT, privateDirectory = privateRoot, caseDirectory = caseRoot, name, head = reviewedHead, source = sourceRevision }) => generate({ root, privateRoot: privateDirectory, caseRoot: caseDirectory, outputPath: resolve(work, name), reviewedHead: head, sourceRevision: source });
  try {
    for (const [outputPath, label] of [[resolve(ROOT, "forbidden-review.zip"), "repository"], [resolve(privateRoot, "forbidden-review.zip"), "private root"], [resolve(caseRoot, "forbidden-review.zip"), "case root"]]) {
      assert.throws(() => generate({ root: ROOT, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision }), /output must stay outside/u, `output inside ${label} must fail closed`);
    }
    const first = invoke({ name: "first.zip" });
    const second = invoke({ name: "second.zip" });
    assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null }, "repeat generation must preserve reported identity");
    assert.deepEqual(readFileSync(first.archivePath), readFileSync(second.archivePath), "repeat generation must be byte-identical");
    const record = manifest(first.archivePath);
    assert.equal(record.fixture_id, fixtureId);
    assert.equal(record.reviewed_repository_head, reviewedHead);
    assert.equal(record.evaluator_source_revision, sourceRevision);
    assert.equal(record.independent_review_status, "pending");
    assert.equal(record.admission_status, "admission_pending");
    assert.equal(record.scoring_ready, false);
    assert.equal(record.measured_execution, false);
    assert.equal(record.private_case_count, JSON.parse(readFileSync(resolve(caseRoot, "cases.json"))).cases.length);
    assert.ok(record.entries.every(({ path }) => !path.endsWith("/.DS_Store")), "ignored filesystem bytes must not enter the reviewed commit inventory");
    assert.throws(() => invoke({ name: "collapsed.zip", source: reviewedHead }), /must be distinct/u, "collapsed revisions must fail closed");
    assert.throws(() => invoke({ name: "stale.zip", source: "0".repeat(40) }), /source revision|SOURCE_REVISION|evaluator/u, "stale source revision must fail closed");
    assert.throws(() => generate({ root: ROOT, privateRoot, caseRoot, outputPath: first.archivePath, reviewedHead, sourceRevision }), /EEXIST|exist/u, "archive creation must be exclusive");

    const missingCases = resolve(work, "missing-cases");
    cpSync(caseRoot, missingCases, { recursive: true });
    const caseId = JSON.parse(readFileSync(resolve(missingCases, "cases.json"))).cases[0].case_id;
    rmSync(resolve(missingCases, caseId), { recursive: true, force: true });
    assert.throws(() => invoke({ caseDirectory: missingCases, name: "missing-case.zip" }), /inventory is not closed/u, "declared case payload omission must fail closed");
    const extraCases = resolve(work, "extra-cases");
    cpSync(caseRoot, extraCases, { recursive: true });
    writeFileSync(resolve(extraCases, "unrelated.txt"), "unrelated\n");
    assert.throws(() => invoke({ caseDirectory: extraCases, name: "extra-case.zip" }), /inventory is not closed/u, "undeclared case payload must fail closed");

    const ignoredPath = resolve(ROOT, fixturePath, ".DS_Store");
    const ignored = spawnSync("git", ["-C", ROOT, "check-ignore", "--quiet", ignoredPath]).status === 0;
    if (ignored && !existsSync(ignoredPath)) {
      try {
        writeFileSync(ignoredPath, "ignored filesystem drift\n");
        const ignoredResult = invoke({ name: "ignored-drift.zip" });
        assert.deepEqual(readFileSync(ignoredResult.archivePath), readFileSync(first.archivePath), "ignored fixture bytes must not affect commit-sourced archive bytes");
      } finally {
        rmSync(ignoredPath, { force: true });
      }
    }
    return { archive_sha256: first.archiveSha256, archive_bytes: first.archiveBytes, entry_count: first.entryCount, private_case_count: first.privateCaseCount };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function runReviewArchiveContractTest({ fixtureId, fixturePath, generate, argv = process.argv.slice(2) }) {
  validateCaseClosureHelper(fixtureId);
  validateCommitTreeTypeBoundary();
  assert.throws(() => generate({}), /requires/u, "archive generator must require complete arguments");
  const args = parseArgs(argv);
  if (!args.privateRoot) return { fixture_id: fixtureId, static_contract: "pass", archive_generation: "not_run" };
  return { fixture_id: fixtureId, static_contract: "pass", archive_generation: "pass", ...validateWithAuthorityRoots({ fixtureId, fixturePath, generate, ...args }) };
}

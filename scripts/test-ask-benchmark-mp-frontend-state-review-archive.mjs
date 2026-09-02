#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMpFrontendStateReviewArchive } from "./ask-benchmark-mp-frontend-state-review-archive.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(ROOT, "scripts/ask-benchmark-mp-frontend-state-review-archive.mjs"), "utf8");
assert.match(source, /issue-282-fresh-successor-store-zip\.v1/u);
assert.match(source, /reviewed HEAD differs/u);
assert.match(source, /tracked bytes differ/u);
assert.match(source, /private inventory is not closed/u);
assert.match(source, /case inventory is not closed/u);
assert.match(source, /measured_execution:false/u);
assert.throws(() => generateMpFrontendStateReviewArchive(), /requires privateRoot/u);

const boundaryWork = mkdtempSync(resolve(tmpdir(), "mp-frontend-review-output-boundary-"));
const boundaryPrivate = resolve(boundaryWork, "private");
const boundaryCases = resolve(boundaryWork, "cases");
try {
  mkdirSync(boundaryPrivate);
  mkdirSync(boundaryCases);
  const boundaryHead = spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  for (const [outputPath, label] of [
    [resolve(ROOT, "forbidden-review.zip"), "repository"],
    [resolve(boundaryPrivate, "forbidden-review.zip"), "private root"],
    [resolve(boundaryCases, "forbidden-review.zip"), "case root"],
  ]) assert.throws(() => generateMpFrontendStateReviewArchive({ root: ROOT, privateRoot: boundaryPrivate, caseRoot: boundaryCases, outputPath, reviewedHead: boundaryHead, sourceRevision: boundaryHead }), /output must stay outside/u, `output inside ${label}`);
} finally {
  rmSync(boundaryWork, { recursive: true, force: true });
}

const argv = process.argv.slice(2);
const privateIndex = argv.indexOf("--private-root");
const casesIndex = argv.indexOf("--private-case-root");
if ((privateIndex === -1) !== (casesIndex === -1)) throw new Error("--private-root and --private-case-root must be supplied together");
if (privateIndex !== -1) {
  const privateRoot = resolve(argv[privateIndex + 1]);
  const caseRoot = resolve(argv[casesIndex + 1]);
  const reviewedHead = process.env.REVIEW_CANDIDATE_HEAD;
  const sourceRevision = process.env.SOURCE_REVISION;
  assert.match(reviewedHead ?? "", /^[a-f0-9]{40}$/u, "REVIEW_CANDIDATE_HEAD is required");
  assert.match(sourceRevision ?? "", /^[a-f0-9]{40}$/u, "SOURCE_REVISION is required");
  assert.equal(spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), reviewedHead, "reviewed head must be the exact repository HEAD");
  const work = mkdtempSync(resolve(tmpdir(), "mp-frontend-review-archive-"));
  try {
    const firstPath = resolve(work, "first.zip");
    const secondPath = resolve(work, "second.zip");
    const first = generateMpFrontendStateReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: firstPath, reviewedHead, sourceRevision });
    const second = generateMpFrontendStateReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: secondPath, reviewedHead, sourceRevision });
    assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null });
    assert.deepEqual(readFileSync(firstPath), readFileSync(secondPath));
    const integrity = spawnSync("unzip", ["-tqq", firstPath], { encoding: "utf8" });
    assert.equal(integrity.status, 0, integrity.stderr || integrity.stdout);
    const manifest = JSON.parse(spawnSync("unzip", ["-p", firstPath, "REVIEW-MANIFEST.json"], { encoding: "utf8" }).stdout);
    assert.equal(manifest.reviewed_repository_head, reviewedHead);
    assert.equal(manifest.evaluator_source_revision, sourceRevision);
    assert.equal(manifest.fixture_id, "mp-frontend-state-review");
    assert.equal(manifest.independent_review_status, "pending");
    assert.equal(manifest.author_self_approval, false);
    assert.equal(manifest.measured_execution, false);
    const names = spawnSync("unzip", ["-Z1", firstPath], { encoding: "utf8" }).stdout.trim().split("\n");
    assert.deepEqual(names, [...manifest.entries.map(({ path }) => path), "REVIEW-MANIFEST.json"].sort((a, b) => a.localeCompare(b)));
    assert.throws(() => generateMpFrontendStateReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "collapsed-revisions.zip"), reviewedHead, sourceRevision: reviewedHead }), /must be distinct/u, "collapsed source/review revisions");
    assert.throws(() => generateMpFrontendStateReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "stale-source.zip"), reviewedHead, sourceRevision: "0".repeat(40) }), /source revision|SOURCE_REVISION|evaluator/u, "stale source revision");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ fixture_id: "mp-frontend-state-review", archive_static_contract: "pass", archive_determinism: privateIndex === -1 ? "not_requested" : "pass" }));

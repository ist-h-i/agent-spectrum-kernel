#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateRootOutsideRepository } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpAccessibilityInteractionReviewProductionAuthority } from "./ask-benchmark-mp-accessibility-interaction-review-authority.mjs";
import {
  establishReviewArchiveIdentity,
  evaluatorSourceReviewEntries,
  resolveReviewArchiveOutput,
  reviewArchiveCommitEntry,
  reviewArchiveCommitTreeEntries,
  validateReviewArchiveCases,
  validateReviewArchivePrivateBundle,
} from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-accessibility-interaction-review";
const FIXTURE_PATH = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const GENERATOR_PATH = "scripts/ask-benchmark-mp-accessibility-interaction-review-review-archive.mjs";
const FORMAT_REVISION = "issue-251-node-store-zip.v1";
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION = 20;
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION;
const SOURCE_PATHS = Object.freeze([
  "benchmarks/portfolio-design-admission-records/mp-accessibility-interaction-review.json",
  "scripts/ask-benchmark-mp-accessibility-interaction-review.mjs",
  "scripts/ask-benchmark-mp-accessibility-interaction-review-authority.mjs",
  GENERATOR_PATH,
  "scripts/test-ask-benchmark-mp-accessibility-interaction-review.mjs",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or invalid`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function git(root, args, label) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
}));

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function portable(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`review archive path is not portable: ${path}`);
  return path;
}

function walk(root, prefix) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`review archive source traverses a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const path = relative(root, absolute).split(sep).join("/");
        entries.push({ path: portable(`${prefix}/${path}`), bytes: readFileSync(absolute), mode: statSync(absolute).mode & 0o777 });
      } else throw new Error(`review archive source is not a regular file: ${absolute}`);
    }
  }
  visit(root);
  return entries;
}

function sourceEntry(root, path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error(`review archive source is missing: ${path}`);
  return { path: portable(`repository/${path}`), bytes: readFileSync(absolute), mode: statSync(absolute).mode & 0o777 };
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    const name = Buffer.from(entry.path, "utf8");
    const bytes = entry.bytes;
    const checksum = crc32(bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(VERSION, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(STORE_METHOD, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(VERSION_MADE_BY_UNIX, 4);
    centralHeader.writeUInt16LE(VERSION, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(STORE_METHOD, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBytes, end]);
}

export function generateMpAccessibilityInteractionReviewReviewArchive({ root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision }) {
  if (!privateRoot || !caseRoot || !outputPath) throw new Error("review archive requires privateRoot, caseRoot, outputPath, reviewedHead, and sourceRevision");
  const repositoryRoot = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  const caseDirectory = realpathSync(caseRoot);
  assertPrivateRootOutsideRepository(repositoryRoot, privateDirectory);
  assertPrivateRootOutsideRepository(repositoryRoot, caseDirectory);
  if (privateDirectory === caseDirectory || privateDirectory.startsWith(`${caseDirectory}${sep}`) || caseDirectory.startsWith(`${privateDirectory}${sep}`)) throw new Error("review archive private and case roots must be disjoint");
  const archiveTarget = resolveReviewArchiveOutput({ repositoryRoot, privateRoot: privateDirectory, caseRoot: caseDirectory, outputPath });
  if (git(repositoryRoot, ["rev-parse", "HEAD"], "reviewed HEAD lookup") !== reviewedHead) throw new Error("review archive reviewed HEAD does not match repository HEAD");
  const authority = validateMpAccessibilityInteractionReviewProductionAuthority({ root: repositoryRoot });
  const identity = establishReviewArchiveIdentity({ root: repositoryRoot, runtimeRoot: ROOT, reviewedHead, sourceRevision, evaluatorRevision: authority.evaluatorRevision, generatorPath: GENERATOR_PATH });
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "private evaluator bundle");
  if (bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest) throw new Error("review archive private bundle differs from public reference");
  const privateEntries = walk(privateDirectory, "private-evaluator");
  const caseEntries = walk(caseDirectory, "private-cases");
  const privateSummary = validateReviewArchivePrivateBundle({ fixtureId: FIXTURE_ID, bundle, authority, privateEntries, privatePrefix: "private-evaluator" });
  const caseSummary = validateReviewArchiveCases({ fixtureId: FIXTURE_ID, caseEntries, casePrefix: "private-cases", closedCaseFileName: "review.json" });
  const entries = [
    ...reviewArchiveCommitTreeEntries({ root: repositoryRoot, revision: reviewedHead, path: FIXTURE_PATH, prefix: "repository" }),
    ...SOURCE_PATHS.map((path) => reviewArchiveCommitEntry(repositoryRoot, reviewedHead, path, "repository")),
    ...evaluatorSourceReviewEntries({ root: repositoryRoot, sourceRevision, sourceIdentity: bundle.evaluator_source_identity }),
    ...identity.generatorEntries,
    ...privateEntries,
    ...caseEntries,
  ];
  const unique = new Map();
  for (const entry of entries) {
    if (unique.has(entry.path)) throw new Error(`review archive contains duplicate entry: ${entry.path}`);
    unique.set(entry.path, entry);
  }
  const candidate = readJson(resolve(repositoryRoot, FIXTURE_PATH, "source-freeze-candidate.json"), "source-freeze candidate");
  const manifest = {
    schema_version: "1.0.0",
    program: "mp_accessibility_interaction_review_private_review_archive",
    fixture_id: FIXTURE_ID,
    reviewed_repository_head: reviewedHead,
    evaluator_source_revision: sourceRevision,
    evaluator_bundle_id: authority.evaluatorBundleId,
    evaluator_bundle_digest: authority.evaluatorBundleDigest,
    evaluator_source_tree_digest: bundle.evaluator_source_identity.source_tree_digest,
    evaluator_dependency_graph_digest: bundle.dependency_graph.graph_digest,
    archive_generator_source_identity: identity.generatorSourceIdentity,
    private_asset_bytes: privateSummary.privateAssetBytes,
    private_asset_count: privateSummary.privateAssetCount,
    private_case_count: caseSummary.caseCount,
    private_case_paths: caseSummary.casePaths,
    candidate_digest: candidate.candidate_digest,
    input_digest: authority.inputDigest,
    independent_review_status: "pending",
    admission_status: "admission_pending",
    scoring_ready: false,
    measured_execution: false,
    scoring_published: false,
    archive_format: { revision: FORMAT_REVISION, compression_method: "store", fixed_timestamp: "1980-01-01T00:00:00", generator_source_digest: sha256(readFileSync(resolve(repositoryRoot, GENERATOR_PATH))), generator_source_inventory: identity.generatorSourceIdentity.node_inventory },
    entries: [...unique.values()].sort((left, right) => left.path.localeCompare(right.path)).map(({ path, bytes, mode }) => ({ path, bytes: bytes.length, sha256: sha256(bytes), mode })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const archiveBytes = zip([...unique.values(), { path: "REVIEW-MANIFEST.json", bytes: manifestBytes, mode: 0o644 }]);
  writeFileSync(archiveTarget, archiveBytes, { flag: "wx" });
  return { fixtureId: FIXTURE_ID, reviewedHead, evaluatorSourceRevision: sourceRevision, bundleId: authority.evaluatorBundleId, bundleDigest: authority.evaluatorBundleDigest, privateAssetBytes: privateSummary.privateAssetBytes, candidateDigest: candidate.candidate_digest, inputDigest: authority.inputDigest, archivePath: archiveTarget, archiveSha256: sha256(archiveBytes), archiveBytes: archiveBytes.length, entryCount: unique.size + 1, privateCaseCount: caseSummary.caseCount };
}

function parseArgs(argv) {
  const args = { root: ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--root") args.root = resolve(argv[++index]);
    else if (name === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (name === "--case-root") args.caseRoot = resolve(argv[++index]);
    else if (name === "--output") args.outputPath = resolve(argv[++index]);
    else if (name === "--reviewed-head") args.reviewedHead = argv[++index];
    else if (name === "--source-revision") args.sourceRevision = argv[++index];
    else throw new Error(`unknown argument: ${name}`);
  }
  return args;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) console.log(JSON.stringify(generateMpAccessibilityInteractionReviewReviewArchive(parseArgs(process.argv.slice(2)))));

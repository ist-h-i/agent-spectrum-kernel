#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvaluatorBundleDigest, computeEvaluatorBundleId } from "./ask-benchmark-evaluator-boundary.mjs";
import { assertPrivateRootOutsideRepository } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMnFocusedRegressionTestProductionAuthority } from "./ask-benchmark-mn-focused-regression-test-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mn-focused-regression-test";
const FIXTURE_PATH = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const GENERATOR_PATH = "scripts/ask-benchmark-mn-focused-regression-test-review-archive.mjs";
const FORMAT_REVISION = "issue-207-node-store-zip.v1";
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION = 20;
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION;
const SOURCE_PATHS = Object.freeze([
  "benchmarks/portfolio-design-admission-records/mn-focused-regression-test.json",
  "scripts/ask-benchmark-mn-focused-regression-test.mjs",
  "scripts/ask-benchmark-mn-focused-regression-test-authority.mjs",
  GENERATOR_PATH,
  "scripts/test-ask-benchmark-mn-focused-regression-test.mjs",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or invalid`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function git(root, args, label, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], { encoding });
  if (result.status !== 0) throw new Error(`${label} failed: ${String(result.stderr || result.stdout)}`);
  return result.stdout;
}

function portable(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`review archive path is not portable: ${path}`);
  return path;
}

function regularMode(mode, path) {
  if (mode === "100644") return 0o644;
  if (mode === "100755") return 0o755;
  throw new Error(`review archive repository source is not a regular file: ${path}`);
}

function repositoryEntry(root, reviewedHead, path) {
  const record = git(root, ["ls-tree", reviewedHead, "--", path], `review archive repository lookup ${path}`).trim();
  const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
  if (!match || match[3] !== path) throw new Error(`review archive repository source is missing: ${path}`);
  const bytes = git(root, ["cat-file", "blob", match[2]], `review archive repository read ${path}`, null);
  return { path: portable(`repository/${path}`), bytes: Buffer.from(bytes), mode: regularMode(match[1], path) };
}

function repositoryTreeEntries(root, reviewedHead, prefix) {
  const output = git(root, ["ls-tree", "-r", "-z", "--full-tree", reviewedHead, "--", prefix], `review archive repository tree ${prefix}`, null);
  const records = Buffer.from(output).toString("utf8").split("\0").filter(Boolean);
  if (records.length === 0) throw new Error(`review archive repository tree is empty: ${prefix}`);
  return records.map((record) => {
    const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
    if (!match) throw new Error(`review archive repository tree contains an unsupported entry: ${record}`);
    const path = portable(match[3]);
    const bytes = git(root, ["cat-file", "blob", match[2]], `review archive repository read ${path}`, null);
    return { path: portable(`repository/${path}`), bytes: Buffer.from(bytes), mode: regularMode(match[1], path) };
  });
}

function externalDirectory(path, label) {
  if (!path || !existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error(`${label} must be a real directory`);
  return realpathSync(path);
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

function validatePrivateBundle(privateDirectory, bundle, authority, privateEntries) {
  if (bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest || bundle.evaluator_revision !== authority.evaluatorRevision) throw new Error("mn-focused review archive private bundle differs from public authority");
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle)) throw new Error("mn-focused review archive private bundle ID closure is invalid");
  if (bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("mn-focused review archive private bundle digest closure is invalid");
  const assets = [...bundle.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (JSON.stringify(bundle.asset_inventory) !== JSON.stringify(assets)) throw new Error("mn-focused review archive private asset inventory is reordered");
  if (new Set(assets.map(({ role }) => role)).size !== assets.length || new Set(assets.map(({ path }) => path)).size !== assets.length) throw new Error("mn-focused review archive private asset inventory contains duplicates");
  const byPath = new Map(privateEntries.map((entry) => [entry.path.slice("private-evaluator/".length), entry]));
  const expectedPaths = ["private-evaluator-bundle.json", ...assets.map(({ path }) => portable(path))].sort();
  if (JSON.stringify([...byPath.keys()].sort()) !== JSON.stringify(expectedPaths)) throw new Error("mn-focused review archive private bundle inventory is not closed");
  for (const asset of assets) {
    const entry = byPath.get(asset.path);
    if (!entry || entry.bytes.length !== asset.bytes || sha256(entry.bytes) !== asset.sha256) throw new Error(`mn-focused review archive private asset bytes are inconsistent for ${asset.role}`);
  }
  const manifestEntry = byPath.get("private-evaluator-bundle.json");
  if (!manifestEntry || !readFileSync(resolve(privateDirectory, "private-evaluator-bundle.json")).equals(manifestEntry.bytes)) throw new Error("mn-focused review archive private bundle manifest bytes drifted during inspection");
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
    centralHeader.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

export function generateMnFocusedRegressionTestReviewArchive({ root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead } = {}) {
  if (!privateRoot || !caseRoot || !outputPath || !/^[a-f0-9]{40}$/u.test(reviewedHead ?? "")) throw new Error("mn-focused review archive requires privateRoot, caseRoot, outputPath, and reviewedHead");
  const repositoryRoot = realpathSync(root);
  const privateDirectory = externalDirectory(privateRoot, "mn-focused review archive private root");
  const caseDirectory = externalDirectory(caseRoot, "mn-focused review archive case root");
  assertPrivateRootOutsideRepository(repositoryRoot, privateDirectory);
  assertPrivateRootOutsideRepository(repositoryRoot, caseDirectory);
  const head = git(repositoryRoot, ["rev-parse", "HEAD"], "review archive reviewed HEAD lookup").trim();
  if (head !== reviewedHead) throw new Error("mn-focused review archive reviewed HEAD differs from repository HEAD");
  const trackedDiff = spawnSync("git", ["-C", repositoryRoot, "diff", "--quiet", reviewedHead, "--"]);
  if (trackedDiff.status !== 0) throw new Error("mn-focused review archive repository tracked bytes differ from the reviewed HEAD");
  const authority = validateMnFocusedRegressionTestProductionAuthority({ root: repositoryRoot });
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "mn-focused private evaluator bundle");
  const privateEntries = walk(privateDirectory, "private-evaluator");
  validatePrivateBundle(privateDirectory, bundle, authority, privateEntries);
  const cases = readJson(resolve(caseDirectory, "cases.json"), "mn-focused private cases");
  if (cases.fixture_id !== FIXTURE_ID || !Array.isArray(cases.cases) || cases.cases.length === 0 || new Set(cases.cases.map(({ case_id }) => case_id)).size !== cases.cases.length) throw new Error("mn-focused review archive private case identity is invalid");
  const caseEntries = walk(caseDirectory, "private-cases");
  const entries = [
    ...repositoryTreeEntries(repositoryRoot, reviewedHead, FIXTURE_PATH),
    ...SOURCE_PATHS.map((path) => repositoryEntry(repositoryRoot, reviewedHead, path)),
    ...privateEntries,
    ...caseEntries,
  ];
  const unique = new Map();
  const folded = new Map();
  for (const entry of entries) {
    if (unique.has(entry.path)) throw new Error(`mn-focused review archive contains duplicate entry: ${entry.path}`);
    const foldedPath = entry.path.toLocaleLowerCase("en-US");
    if (folded.has(foldedPath) && folded.get(foldedPath) !== entry.path) throw new Error(`mn-focused review archive contains case-colliding entries: ${folded.get(foldedPath)} / ${entry.path}`);
    unique.set(entry.path, entry);
    folded.set(foldedPath, entry.path);
  }
  const generatorEntry = unique.get(`repository/${GENERATOR_PATH}`);
  const manifest = {
    schema_version: "1.0.0",
    program: "mn_focused_regression_test_private_review_archive",
    fixture_id: FIXTURE_ID,
    reviewed_repository_head: reviewedHead,
    evaluator_source_revision: authority.evaluatorRevision,
    evaluator_bundle_id: authority.evaluatorBundleId,
    evaluator_bundle_digest: authority.evaluatorBundleDigest,
    evaluator_source_tree_digest: bundle.evaluator_source_identity.source_tree_digest,
    evaluator_dependency_graph_digest: bundle.dependency_graph.graph_digest,
    evaluator_authority_digest: authority.evaluatorAuthorityDigest,
    requirement_record_digest: authority.requirementRecordDigest,
    requirement_set_digest: authority.requirementSetDigest,
    output_contract_digest: authority.outputContractDigest,
    source_freeze_candidate_digest: authority.candidateDigest,
    input_digest: authority.inputDigest,
    independent_review_status: "pending",
    author_self_approval: false,
    admission_status: "admission_pending",
    scoring_ready: false,
    measured_execution: false,
    archive_format: { revision: FORMAT_REVISION, compression_method: "store", fixed_timestamp: "1980-01-01T00:00:00", generator_source_digest: sha256(generatorEntry.bytes) },
    entries: [...unique.values()].sort((left, right) => left.path.localeCompare(right.path)).map(({ path, bytes, mode }) => ({ path, bytes: bytes.length, sha256: sha256(bytes), mode })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const archiveBytes = zip([...unique.values(), { path: "REVIEW-MANIFEST.json", bytes: manifestBytes, mode: 0o644 }]);
  writeFileSync(resolve(outputPath), archiveBytes, { flag: "wx", mode: 0o644 });
  return Object.freeze({ fixtureId: FIXTURE_ID, reviewedHead, evaluatorSourceRevision: authority.evaluatorRevision, bundleId: authority.evaluatorBundleId, bundleDigest: authority.evaluatorBundleDigest, candidateDigest: authority.candidateDigest, inputDigest: authority.inputDigest, archivePath: resolve(outputPath), archiveSha256: sha256(archiveBytes), archiveBytes: archiveBytes.length, entryCount: unique.size + 1 });
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
    else throw new Error(`unknown argument: ${name}`);
  }
  return args;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(generateMnFocusedRegressionTestReviewArchive(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvaluatorBundleDigest, computeEvaluatorBundleId } from "./ask-benchmark-evaluator-boundary.mjs";
import { assertPrivateRootOutsideRepository } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpDataMigrationHandoffProductionAuthority } from "./ask-benchmark-mp-data-migration-handoff-authority.mjs";
import {
  establishReviewArchiveIdentity,
  evaluatorSourceReviewEntries,
  validateReviewArchiveCases,
  validateReviewArchivePrivateBundle,
} from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-data-migration-handoff";
const FIXTURE_PATH = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const GENERATOR_PATH = "scripts/ask-benchmark-mp-data-migration-handoff-review-archive.mjs";
const FORMAT_REVISION = "issue-282-node-store-zip.v1";
const REPOSITORY_IDENTITY = "ist-h-i/agent-spectrum-kernel";
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION = 20;
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION;
const REVIEW_SOURCE_PATHS = Object.freeze([
  "benchmarks/portfolio-design-admission-records/mp-data-migration-handoff.json",
  "scripts/ask-benchmark-mp-data-migration-handoff.mjs",
  "scripts/ask-benchmark-mp-data-migration-handoff-authority.mjs",
  GENERATOR_PATH,
  "scripts/test-ask-benchmark-mp-data-migration-handoff.mjs",
]);

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${label} is missing, a symlink, or not a regular file`);
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

function normalizeRepositoryRemote(remote) {
  const value = remote.trim();
  const match = value.match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u);
  return match?.[1] ?? null;
}

function validateRepositoryIdentity(root) {
  const remote = git(root, ["config", "--get", "remote.origin.url"], "review archive repository identity lookup").trim();
  if (normalizeRepositoryRemote(remote) !== REPOSITORY_IDENTITY) throw new Error(`review archive repository identity differs from ${REPOSITORY_IDENTITY}`);
}

function commitEntry(root, revision, path, archivePrefix) {
  const record = git(root, ["ls-tree", revision, "--", path], `review archive repository lookup ${path}`).trim();
  const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
  if (!match || match[3] !== path) throw new Error(`review archive repository source is missing from revision ${revision}: ${path}`);
  const bytes = Buffer.from(git(root, ["cat-file", "blob", match[2]], `review archive repository read ${path}`, null));
  return { path: portable(`${archivePrefix}/${path}`), bytes, mode: regularMode(match[1], path) };
}

function repositoryEntry(root, reviewedHead, path) {
  return commitEntry(root, reviewedHead, path, "repository");
}

function repositoryTreeEntries(root, reviewedHead, prefix) {
  const output = Buffer.from(git(root, ["ls-tree", "-r", "-z", "--full-tree", reviewedHead, "--", prefix], `review archive repository tree ${prefix}`, null));
  const records = output.toString("utf8").split("\0").filter(Boolean);
  if (records.length === 0) throw new Error(`review archive repository tree is empty: ${prefix}`);
  return records.map((record) => {
    const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
    if (!match) throw new Error(`review archive repository tree contains an unsupported entry: ${record}`);
    return repositoryEntry(root, reviewedHead, match[3]);
  });
}

function externalDirectory(path, label) {
  if (!path || !existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error(`${label} must be an existing non-symlink directory`);
  return realpathSync(path);
}

function walk(root, prefix) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => lexicalCompare(left.name, right.name))) {
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
  if (entries.length === 0) throw new Error(`review archive source is empty: ${root}`);
  return entries;
}

function validateEvaluatorSourceInventory(root, reference, entries) {
  const sources = reference.evaluator_source_identity?.source_files;
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("review archive evaluator source inventory is missing");
  const expected = [...sources].sort((left, right) => lexicalCompare(left.path, right.path));
  if (JSON.stringify(sources) !== JSON.stringify(expected) || new Set(sources.map(({ path }) => path)).size !== sources.length) throw new Error("review archive evaluator source inventory is reordered or duplicated");
  for (const source of sources) {
    const entry = commitEntry(root, reference.evaluator_revision, portable(source.path), "evaluator-source");
    if (entry.bytes.length !== source.bytes || sha256(entry.bytes) !== source.sha256) throw new Error(`review archive evaluator source bytes differ at frozen evaluator revision: ${source.path}`);
    entries.push(entry);
  }
}

function validatePrivateBundle(bundle, authority, privateEntries) {
  if (bundle.fixture_id !== undefined && bundle.fixture_id !== FIXTURE_ID) throw new Error("review archive private bundle fixture identity differs");
  if (bundle.evaluator_revision !== authority.evaluatorRevision || bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest) throw new Error("review archive private/public evaluator identity differs");
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle)) throw new Error("review archive private bundle ID closure is invalid");
  if (bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("review archive private bundle digest closure is invalid");
  if (bundle.evaluator_source_identity?.source_tree_digest !== authority.evaluatorSourceTreeDigest || bundle.dependency_graph?.graph_digest !== authority.evaluatorDependencyGraphDigest) throw new Error("review archive private evaluator source identity differs");
  if (!Array.isArray(bundle.asset_inventory) || bundle.asset_inventory.length === 0) throw new Error("review archive private asset inventory is missing");
  const assets = [...bundle.asset_inventory].sort((left, right) => lexicalCompare(left.role, right.role) || lexicalCompare(left.path, right.path));
  if (JSON.stringify(bundle.asset_inventory) !== JSON.stringify(assets)) throw new Error("review archive private asset inventory is reordered");
  if (new Set(assets.map(({ role }) => role)).size !== assets.length || new Set(assets.map(({ path }) => path)).size !== assets.length) throw new Error("review archive private asset inventory contains duplicates");
  const byPath = new Map(privateEntries.map((entry) => [entry.path.slice("private-evaluator/".length), entry]));
  const expectedPaths = ["private-evaluator-bundle.json", ...assets.map(({ path }) => portable(path))].sort(lexicalCompare);
  if (JSON.stringify([...byPath.keys()].sort(lexicalCompare)) !== JSON.stringify(expectedPaths)) throw new Error("review archive private bundle inventory is not closed");
  for (const asset of assets) {
    const entry = byPath.get(asset.path);
    if (!entry || entry.bytes.length !== asset.bytes || sha256(entry.bytes) !== asset.sha256) throw new Error(`review archive private asset bytes differ: ${asset.path}`);
  }
}

function validateCases(caseEntries) {
  const byPath = new Map(caseEntries.map((entry) => [entry.path.slice("private-cases/".length), entry]));
  const record = byPath.get("cases.json");
  if (!record) throw new Error("review archive complete private cases require cases.json");
  let cases;
  try { cases = JSON.parse(record.bytes.toString("utf8")); }
  catch { throw new Error("review archive private cases.json is invalid JSON"); }
  if (cases.fixture_id !== FIXTURE_ID || !Array.isArray(cases.cases) || cases.cases.length === 0) throw new Error("review archive private case identity is invalid");
  const ids = cases.cases.map(({ case_id }) => case_id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new Error("review archive private case inventory is incomplete or duplicated");
  return ids.length;
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
  const ordered = [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of ordered) {
    const name = Buffer.from(entry.path, "utf8");
    if (name.length > 0xffff || entry.bytes.length > 0xffffffff || offset > 0xffffffff) throw new Error("review archive exceeds deterministic ZIP32 limits");
    const checksum = crc32(entry.bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(VERSION, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(STORE_METHOD, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.bytes.length, 18);
    localHeader.writeUInt32LE(entry.bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, entry.bytes);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(VERSION_MADE_BY_UNIX, 4);
    centralHeader.writeUInt16LE(VERSION, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(STORE_METHOD, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.bytes.length, 20);
    centralHeader.writeUInt32LE(entry.bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + entry.bytes.length;
  }
  if (ordered.length > 0xffff) throw new Error("review archive entry count exceeds deterministic ZIP32 limits");
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(ordered.length, 8);
  end.writeUInt16LE(ordered.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

export function generateMpDataMigrationHandoffReviewArchive({ root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision } = {}) {
  if (!privateRoot || !caseRoot || !outputPath) throw new Error("mp-data-migration-handoff review archive requires privateRoot, caseRoot, outputPath, reviewedHead, and sourceRevision");
  const repositoryRoot = realpathSync(root);
  const privateDirectory = externalDirectory(privateRoot, "review archive private root");
  const caseDirectory = externalDirectory(caseRoot, "review archive case root");
  assertPrivateRootOutsideRepository(repositoryRoot, privateDirectory);
  assertPrivateRootOutsideRepository(repositoryRoot, caseDirectory);
  if (privateDirectory === caseDirectory || privateDirectory.startsWith(`${caseDirectory}${sep}`) || caseDirectory.startsWith(`${privateDirectory}${sep}`)) throw new Error("review archive private and case roots must be disjoint");
  const requestedTarget = resolve(outputPath);
  const archiveTarget = resolve(realpathSync(dirname(requestedTarget)), basename(requestedTarget));
  if ([repositoryRoot, privateDirectory, caseDirectory].some((directory) => archiveTarget === directory || archiveTarget.startsWith(`${directory}${sep}`))) throw new Error("review archive output must stay outside repository and authority source roots");
  validateRepositoryIdentity(repositoryRoot);
  if (git(repositoryRoot, ["rev-parse", "HEAD"], "review archive reviewed HEAD lookup").trim() !== reviewedHead) throw new Error("review archive reviewed HEAD differs from repository HEAD");
  for (const args of [["diff", "--quiet", reviewedHead, "--"], ["diff", "--cached", "--quiet", reviewedHead, "--"]]) {
    const result = spawnSync("git", ["-C", repositoryRoot, ...args]);
    if (result.status !== 0) throw new Error("review archive repository tracked bytes differ from the reviewed HEAD");
  }
  const authority = validateMpDataMigrationHandoffProductionAuthority({ root: repositoryRoot });
  const identity = establishReviewArchiveIdentity({ root: repositoryRoot, runtimeRoot: ROOT, reviewedHead, sourceRevision, evaluatorRevision: authority.evaluatorRevision, generatorPath: GENERATOR_PATH });
  const fixtureReference = readJson(resolve(repositoryRoot, FIXTURE_PATH, "evaluator-reference.json"), "review archive evaluator reference");
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "review archive private evaluator bundle");
  const privateEntries = walk(privateDirectory, "private-evaluator");
  const caseEntries = walk(caseDirectory, "private-cases");
  validatePrivateBundle(bundle, {
    ...authority,
    evaluatorSourceTreeDigest: fixtureReference.evaluator_source_identity.source_tree_digest,
    evaluatorDependencyGraphDigest: fixtureReference.evaluator_source_identity.dependency_graph.graph_digest,
  }, privateEntries);
  const privateSummary = validateReviewArchivePrivateBundle({ fixtureId: FIXTURE_ID, bundle, authority, privateEntries, privatePrefix: "private-evaluator" });
  const caseCount = validateCases(caseEntries);
  const caseSummary = validateReviewArchiveCases({ fixtureId: FIXTURE_ID, caseEntries, casePrefix: "private-cases", singleton: true });
  if (caseSummary.caseCount !== caseCount) throw new Error("review archive private case count differs from the closed case manifest");
  const repositoryEntries = repositoryTreeEntries(repositoryRoot, reviewedHead, FIXTURE_PATH);
  for (const path of REVIEW_SOURCE_PATHS) repositoryEntries.push(repositoryEntry(repositoryRoot, reviewedHead, path));
  const evaluatorEntries = evaluatorSourceReviewEntries({ root: repositoryRoot, sourceRevision, sourceIdentity: fixtureReference.evaluator_source_identity });
  const entries = [...repositoryEntries, ...evaluatorEntries, ...identity.generatorEntries, ...privateEntries, ...caseEntries];
  const unique = new Map();
  const folded = new Map();
  for (const entry of entries) {
    if (unique.has(entry.path)) throw new Error(`review archive contains duplicate path: ${entry.path}`);
    const foldedPath = entry.path.toLowerCase();
    if (folded.has(foldedPath) && folded.get(foldedPath) !== entry.path) throw new Error(`review archive contains case-colliding entries: ${folded.get(foldedPath)} / ${entry.path}`);
    unique.set(entry.path, entry);
    folded.set(foldedPath, entry.path);
  }
  const requirement = readJson(resolve(repositoryRoot, FIXTURE_PATH, "requirement-record.json"), "review archive requirement record");
  const output = readJson(resolve(repositoryRoot, FIXTURE_PATH, "output-contract.json"), "review archive output contract");
  const freeze = readJson(resolve(repositoryRoot, FIXTURE_PATH, "scoring-input-freeze-manifest.json"), "review archive scoring-input freeze");
  readJson(resolve(repositoryRoot, FIXTURE_PATH, "input-manifest.json"), "review archive input manifest");
  const candidate = readJson(resolve(repositoryRoot, FIXTURE_PATH, "source-freeze-candidate.json"), "review archive source-freeze candidate");
  const generatorEntry = unique.get(`repository/${GENERATOR_PATH}`);
  if (!generatorEntry) throw new Error("review archive generator is not committed at reviewed HEAD");
  const ordered = [...unique.values()].sort((left, right) => lexicalCompare(left.path, right.path));
  const manifest = {
    schema_version: "1.0.0",
    program: "mp_data_migration_handoff_private_review_archive",
    fixture_id: FIXTURE_ID,
    review_target: { repository: REPOSITORY_IDENTITY, reviewed_head: reviewedHead },
    evaluator_source_revision: sourceRevision,
    evaluator_bundle_id: authority.evaluatorBundleId,
    evaluator_bundle_digest: authority.evaluatorBundleDigest,
    evaluator_source_tree_digest: fixtureReference.evaluator_source_identity.source_tree_digest,
    evaluator_dependency_graph_digest: fixtureReference.evaluator_source_identity.dependency_graph.graph_digest,
    archive_generator_source_identity: identity.generatorSourceIdentity,
    private_asset_bytes: privateSummary.privateAssetBytes,
    private_asset_count: privateSummary.privateAssetCount,
    authority: {
      evaluator_authority_digest: authority.evaluatorAuthorityDigest,
      requirement_record_digest: requirement.requirement_record_digest,
      requirement_set_digest: requirement.requirement_set_digest,
      output_contract_digest: output.output_contract_digest,
      source_freeze_candidate_digest: candidate.candidate_digest,
      scoring_input_freeze_digest: freeze.manifest_digest,
      fixture_input_digest: fixtureReference.fixture_input_digest,
      input_manifest_raw_sha256: sha256(readFileSync(resolve(repositoryRoot, FIXTURE_PATH, "input-manifest.json"))),
    },
    independent_review_status: "pending",
    author_self_approval: false,
    admission_status: "admission_pending",
    scoring_ready: false,
    measured_execution: false,
    scoring_published: false,
    private_case_count: caseCount,
    private_case_paths: caseSummary.casePaths,
    archive_format: { revision: FORMAT_REVISION, compression_method: "store", fixed_timestamp: "1980-01-01T00:00:00", generator_source_digest: sha256(generatorEntry.bytes), generator_source_inventory: identity.generatorSourceIdentity.node_inventory },
    entries: ordered.map(({ path, bytes, mode }) => ({ path, bytes: bytes.length, sha256: sha256(bytes), mode })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const archiveBytes = zip([...ordered, { path: "REVIEW-MANIFEST.json", bytes: manifestBytes, mode: 0o644 }]);
  writeFileSync(archiveTarget, archiveBytes, { flag: "wx", mode: 0o644 });
  return Object.freeze({ fixtureId: FIXTURE_ID, repository: REPOSITORY_IDENTITY, reviewedHead, evaluatorSourceRevision: sourceRevision, bundleId: authority.evaluatorBundleId, bundleDigest: authority.evaluatorBundleDigest, privateAssetBytes: privateSummary.privateAssetBytes, candidateDigest: candidate.candidate_digest, inputDigest: fixtureReference.fixture_input_digest, archivePath: archiveTarget, archiveSha256: sha256(archiveBytes), archiveBytes: archiveBytes.length, entryCount: unique.size + 1, privateCaseCount: caseCount });
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

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { process.stdout.write(`${JSON.stringify(generateMpDataMigrationHandoffReviewArchive(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvaluatorBundleDigest, computeEvaluatorBundleId } from "./ask-benchmark-evaluator-boundary.mjs";
import { assertPrivateRootOutsideRepository } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpIacRollbackDesignProductionAuthority } from "./ask-benchmark-mp-iac-rollback-design-authority.mjs";
import { validateMpPerformanceInvestigationProductionAuthority } from "./ask-benchmark-mp-performance-investigation-authority.mjs";
import {
  addUniqueReviewArchiveEntries,
  establishReviewArchiveIdentity,
  evaluatorSourceReviewEntries,
  reviewArchiveCommitTreeEntries,
  reviewArchivePortablePath,
  reviewArchiveSha256,
  validateReviewArchiveCases,
  validateReviewArchivePrivateBundle,
  walkReviewArchiveRoot,
} from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ID = "mp-iac-rollback-design";

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (root, args, encoding = "utf8") => execFileSync("git", ["-C", root, ...args], { encoding, maxBuffer: 32 * 1024 * 1024 });
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const lexical = (left, right) => compareText(left.path, right.path);

function externalDirectory(path, label) {
  if (!path || !existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error(`${label} must be an existing non-symlink directory`);
  const directory = realpathSync(path);
  return directory;
}

function directoryEntries(root, prefix) {
  const entries = [];
  const visit = (directory, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`review archive source traverses a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute, path);
      else if (entry.isFile()) entries.push({ path: `${prefix}/${path}`, bytes: readFileSync(absolute), mode: 0o644 });
      else throw new Error(`review archive source is not regular: ${absolute}`);
    }
  };
  visit(root);
  return entries;
}

function revisionEntry(root, revision, path, prefix = "repository") {
  const record = git(root, ["ls-tree", revision, "--", path]).trim();
  const match = record.match(/^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/u);
  if (!match || match[3] !== path) throw new Error(`review archive repository source is missing or nonregular at ${revision}: ${path}`);
  return { path: `${prefix}/${path}`, bytes: git(root, ["cat-file", "blob", match[2]], "buffer"), mode: match[1] === "100755" ? 0o755 : 0o644 };
}

function productionAuthority(fixtureId, root) {
  if (fixtureId === "mp-iac-rollback-design") return validateMpIacRollbackDesignProductionAuthority({ root });
  if (fixtureId === "mp-performance-investigation") return validateMpPerformanceInvestigationProductionAuthority({ root });
  throw new Error(`review archive fixture is unsupported: ${fixtureId}`);
}

function validatePrivateBundle({ fixtureId, bundle, reference, authority, privateEntries }) {
  if (bundle.fixture_identity?.fixture_id !== fixtureId) throw new Error("review archive private bundle fixture identity differs");
  if (bundle.evaluator_revision !== authority.evaluatorRevision || bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest) throw new Error("review archive private/public evaluator identity differs");
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle)) throw new Error("review archive private bundle ID closure is invalid");
  if (bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("review archive private bundle digest closure is invalid");
  if (bundle.evaluator_source_identity?.source_tree_digest !== reference.evaluator_source_identity?.source_tree_digest || bundle.dependency_graph?.graph_digest !== reference.evaluator_source_identity?.dependency_graph?.graph_digest) throw new Error("review archive private evaluator source identity differs");
  if (!Array.isArray(bundle.asset_inventory) || bundle.asset_inventory.length === 0) throw new Error("review archive private asset inventory is missing");
  const assets = [...bundle.asset_inventory].sort((left, right) => compareText(left.role, right.role) || compareText(left.path, right.path));
  if (JSON.stringify(bundle.asset_inventory) !== JSON.stringify(assets)) throw new Error("review archive private asset inventory is reordered");
  if (new Set(assets.map(({ role }) => role)).size !== assets.length || new Set(assets.map(({ path }) => path)).size !== assets.length) throw new Error("review archive private asset inventory contains duplicates");
  const byPath = new Map(privateEntries.map((entry) => [entry.path.slice("private/".length), entry]));
  const expectedPaths = ["private-evaluator-bundle.json", ...assets.map(({ path }) => path)].sort(compareText);
  if (JSON.stringify([...byPath.keys()].sort(compareText)) !== JSON.stringify(expectedPaths)) throw new Error("review archive private bundle inventory is not closed");
  for (const asset of assets) {
    const entry = byPath.get(asset.path);
    if (!entry || entry.bytes.length !== asset.bytes || sha256(entry.bytes) !== asset.sha256) throw new Error(`review archive private asset bytes differ: ${asset.path}`);
  }
}

function validateSourceInventory({ root, bundle, entries }) {
  const sources = bundle.evaluator_source_identity?.source_files;
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("review archive evaluator source inventory is missing");
  const ordered = [...sources].sort((left, right) => compareText(left.path, right.path));
  if (JSON.stringify(sources) !== JSON.stringify(ordered) || new Set(sources.map(({ path }) => path)).size !== sources.length) throw new Error("review archive evaluator source inventory is reordered or duplicated");
  for (const source of sources) {
    const entry = revisionEntry(root, bundle.evaluator_revision, source.path, "evaluator-source");
    if (entry.bytes.length !== source.bytes || sha256(entry.bytes) !== source.sha256) throw new Error(`review archive evaluator source drift: ${source.path}`);
    entries.push(entry);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const crc = crc32(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10); header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(entry.bytes.length, 18); header.writeUInt32LE(entry.bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(0, 12); record.writeUInt16LE(0x0021, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(entry.bytes.length, 20); record.writeUInt32LE(entry.bytes.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38); record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + entry.bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function generateConfiguredFreshSuccessorReviewArchive({ fixtureId, program, generatorPath }, { root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision } = {}) {
  if (!privateRoot || !caseRoot || !outputPath) throw new Error("review archive requires a complete exact-head configuration");
  const repository = realpathSync(root);
  const privateDirectory = externalDirectory(privateRoot, "private root");
  const caseDirectory = externalDirectory(caseRoot, "case root");
  assertPrivateRootOutsideRepository(repository, privateDirectory);
  assertPrivateRootOutsideRepository(repository, caseDirectory);
  if (privateDirectory === caseDirectory || privateDirectory.startsWith(`${caseDirectory}${sep}`) || caseDirectory.startsWith(`${privateDirectory}${sep}`)) throw new Error("review archive private and case roots must be disjoint");
  const target = resolve(realpathSync(dirname(outputPath)), basename(outputPath));
  if ([repository, privateDirectory, caseDirectory].some((directory) => target === directory || target.startsWith(`${directory}${sep}`))) throw new Error("review archive output must stay outside source roots");
  const fixtureRoot = resolve(repository, `benchmarks/fixtures/checkpoint-b2/${fixtureId}`);
  const bundle = JSON.parse(readFileSync(resolve(privateDirectory, "private-evaluator-bundle.json")));
  const reference = JSON.parse(readFileSync(resolve(fixtureRoot, "evaluator-reference.json")));
  const authority = productionAuthority(fixtureId, repository);
  const identity = establishReviewArchiveIdentity({ root: repository, runtimeRoot: ROOT, reviewedHead, sourceRevision, evaluatorRevision: authority.evaluatorRevision, generatorPath });
  const privateEntries = walkReviewArchiveRoot(privateDirectory, "private");
  const caseEntries = walkReviewArchiveRoot(caseDirectory, "cases");
  const privateSummary = validateReviewArchivePrivateBundle({ fixtureId, bundle, authority, privateEntries, privatePrefix: "private" });
  const caseSummary = validateReviewArchiveCases({ fixtureId, caseEntries, casePrefix: "cases", singleton: true });
  const sourceEntries = evaluatorSourceReviewEntries({ root: repository, sourceRevision, sourceIdentity: bundle.evaluator_source_identity });
  const repositoryEntries = reviewArchiveCommitTreeEntries({ root: repository, revision: reviewedHead, path: `benchmarks/fixtures/checkpoint-b2/${fixtureId}`, prefix: "repository" }).map((entry) => ({ ...entry, path: reviewArchivePortablePath(entry.path) }));
  const unique = new Map();
  for (const group of [repositoryEntries, sourceEntries, identity.generatorEntries, privateEntries, caseEntries]) addUniqueReviewArchiveEntries(unique, group);
  const entries = [...unique.values()].sort(lexical);
  const generatorNode = identity.generatorSourceIdentity.node_inventory.find(({ path }) => path === generatorPath);
  if (!generatorNode) throw new Error("review archive generator is absent from its closed dependency graph");
  const requirement = JSON.parse(readFileSync(resolve(fixtureRoot, "requirement-record.json")));
  const output = JSON.parse(readFileSync(resolve(fixtureRoot, "output-contract.json")));
  const candidate = JSON.parse(readFileSync(resolve(fixtureRoot, "source-freeze-candidate.json")));
  const freeze = JSON.parse(readFileSync(resolve(fixtureRoot, "scoring-input-freeze-manifest.json")));
  const inputBytes = readFileSync(resolve(fixtureRoot, "input-manifest.json"));
  const taskBytes = readFileSync(resolve(fixtureRoot, "task.md"));
  const manifest = {
    schema_version: "1.0.0",
    program,
    fixture_id: fixtureId,
    review_target: { repository: identity.repository, reviewed_head: reviewedHead },
    evaluator_source_revision: sourceRevision,
    evaluator_source_inventory: bundle.evaluator_source_identity.source_files,
    evaluator_source_tree_digest: bundle.evaluator_source_identity.source_tree_digest,
    evaluator_dependency_graph_digest: bundle.dependency_graph.graph_digest,
    evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest,
    private_asset_bytes: privateSummary.privateAssetBytes,
    private_asset_count: privateSummary.privateAssetCount,
    fixture_input_digest: reference.fixture_input_digest,
    input_manifest_raw_sha256: reviewArchiveSha256(inputBytes),
    task_raw_sha256: reviewArchiveSha256(taskBytes),
    requirement_record_digest: requirement.requirement_record_digest,
    requirement_set_digest: requirement.requirement_set_digest,
    output_contract_digest: output.output_contract_digest,
    source_freeze_candidate_digest: candidate.candidate_digest,
    scoring_input_freeze_digest: freeze.manifest_digest,
    private_case_count: caseSummary.caseCount,
    private_case_paths: caseSummary.casePaths,
    archive_generator_source_identity: identity.generatorSourceIdentity,
    independent_review_status: "pending",
    author_self_approval: false,
    admission_status: "admission_pending",
    scoring_ready: false,
    measured_execution: false,
    scoring_published: false,
    archive_format: { revision: "issue-282-node-store-zip.v2", compression_method: "store", fixed_timestamp: "1980-01-01T00:00:00", generator_source_digest: generatorNode.sha256, generator_source_inventory: identity.generatorSourceIdentity.node_inventory },
    entries: entries.map(({ path, bytes, mode }) => ({ path, bytes: bytes.length, sha256: sha256(bytes), mode })),
  };
  const archive = zip([...entries, { path: "REVIEW-MANIFEST.json", bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), mode: 0o644 }]);
  if (existsSync(target)) throw new Error("review archive output already exists");
  writeFileSync(target, archive, { flag: "wx", mode: 0o644 });
  return Object.freeze({ fixtureId, reviewedHead, evaluatorSourceRevision: sourceRevision, bundleId: bundle.evaluator_bundle_id, bundleDigest: bundle.evaluator_bundle_digest, privateAssetBytes: privateSummary.privateAssetBytes, archivePath: target, archiveSha256: sha256(archive), archiveBytes: archive.length, entryCount: entries.length + 1, privateCaseCount: caseSummary.caseCount });
}

export function generateMpIacRollbackDesignReviewArchive(options) {
  return generateConfiguredFreshSuccessorReviewArchive({ fixtureId: FIXTURE_ID, program: "mp_iac_rollback_design_private_review_archive", generatorPath: "scripts/ask-benchmark-mp-iac-rollback-design-review-archive.mjs" }, options);
}

export function generateMpPerformanceInvestigationReviewArchiveFromShared(options) {
  return generateConfiguredFreshSuccessorReviewArchive({ fixtureId: "mp-performance-investigation", program: "mp_performance_investigation_private_review_archive", generatorPath: "scripts/ask-benchmark-mp-performance-investigation-review-archive.mjs" }, options);
}

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = { "--private-root": "privateRoot", "--private-case-root": "caseRoot", "--output": "outputPath", "--reviewed-head": "reviewedHead", "--source-revision": "sourceRevision", "--root": "root" }[argv[index]];
    if (!key || argv[index + 1] === undefined) throw new Error(`unknown or incomplete argument: ${argv[index]}`);
    args[key] = argv[index + 1];
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(generateMpIacRollbackDesignReviewArchive(parse(process.argv.slice(2))))}\n`);

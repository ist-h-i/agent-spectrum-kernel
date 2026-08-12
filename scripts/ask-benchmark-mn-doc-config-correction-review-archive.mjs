#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  validateEvaluatorSourceIdentity,
} from "./ask-benchmark-evaluator-boundary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mn-doc-config-correction";
const FIXTURE_ROOT = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const REVIEW_MANIFEST_PATH = "REVIEW-MANIFEST.json";
const ZIP_GENERATOR_SOURCE_PATH = "scripts/ask-benchmark-mn-doc-config-correction-review-archive.mjs";
const ZIP_FORMAT_REVISION = "pr242-node-store-zip.v1";
const FIXED_DOS_TIMESTAMP = "1980-01-01T00:00:00";
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x0021;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION = 20;
const ZIP_VERSION_MADE_BY_UNIX = (3 << 8) | ZIP_VERSION;
const PUBLIC_PATHS = Object.freeze([
  "admission-review.json",
  "evaluator-authority-manifest.json",
  "evaluator-reference.json",
  "evidence-map.json",
  "final-admission-record.json",
  "input-manifest.json",
  "metadata.json",
  "output-contract.json",
  "requirement-record.json",
  "scoring-input-freeze-manifest.json",
  "source-freeze-candidate.json",
  "task.md",
  "verification-command-contract.json",
  "workspace/config/retry-policy.json",
  "workspace/docs/worker-retries.md",
  "workspace/package.json",
  "workspace/test/worker-retries.test.mjs",
]);
const REQUIRED_FILESYSTEM_CASE_PATHS = Object.freeze([
  "cases/target-deletion/docs/",
  "cases/target-directory/docs/",
  "cases/target-directory/docs/worker-retries.md/",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

function zipFormatAuthority(root) {
  return {
    revision: ZIP_FORMAT_REVISION,
    fixed_dos_timestamp: FIXED_DOS_TIMESTAMP,
    compression_method: { name: "store", code: ZIP_STORE_METHOD },
    utf8_flag_policy: { name: "set_for_all_entries", general_purpose_bit_flag: ZIP_UTF8_FLAG },
    entry_metadata_policy: {
      unix_external_mode: true,
      local_header_extra_fields: false,
      central_directory_extra_fields: false,
      file_comments: false,
      archive_comment: false,
      encryption: false,
      data_descriptors: false,
    },
    generator: {
      source_path: ZIP_GENERATOR_SOURCE_PATH,
      source_digest: sha256(readFileSync(resolve(root, ZIP_GENERATOR_SOURCE_PATH))),
    },
  };
}

function validateZipFormatAuthority(authority, root) {
  if (JSON.stringify(authority) !== JSON.stringify(zipFormatAuthority(root))) throw new Error("review archive ZIP format authority differs");
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or invalid`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function portableArchivePath(path, entryType) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.includes("\0")) throw new Error("review archive path is not portable");
  const directory = entryType === "directory";
  if (directory !== path.endsWith("/")) throw new Error("review archive entry type and trailing slash differ");
  const segments = path.replace(/\/$/u, "").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) throw new Error("review archive path escapes or contains an empty segment");
  return path;
}

function parentArchivePaths(path) {
  const segments = path.replace(/\/$/u, "").split("/");
  return segments.slice(0, -1).map((_, index) => `${segments.slice(0, index + 1).join("/")}/`);
}

function orderedArchiveEntries(entries) {
  return [...entries].sort((left, right) => lexicalCompare(left.archive_path, right.archive_path));
}

export function validateReviewArchiveInventory(entries, expectedArchiveEntries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("review archive inventory is missing");
  const paths = new Set();
  const folded = new Map();
  const byPath = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("review archive inventory entry is invalid");
    if (!new Set(["file", "directory"]).has(entry.entry_type)) throw new Error("review archive inventory entry type is invalid");
    const allowed = entry.entry_type === "file"
      ? ["archive_path", "entry_type", "mode", "category", "source_scope", "source_path", "bytes", "sha256"]
      : ["archive_path", "entry_type", "mode", "category", "source_scope", "source_path"];
    if (Object.keys(entry).some((key) => !allowed.includes(key)) || allowed.some((key) => !Object.hasOwn(entry, key))) throw new Error("review archive inventory entry fields are not closed");
    portableArchivePath(entry.archive_path, entry.entry_type);
    if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) throw new Error("review archive inventory mode is invalid");
    if (typeof entry.category !== "string" || typeof entry.source_scope !== "string" || typeof entry.source_path !== "string") throw new Error("review archive source identity is invalid");
    if (entry.entry_type === "file" && (!Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^sha256:[a-f0-9]{64}$/u.test(entry.sha256))) throw new Error("review archive file identity is invalid");
    if (paths.has(entry.archive_path)) throw new Error(`review archive inventory contains duplicate path: ${entry.archive_path}`);
    paths.add(entry.archive_path);
    const caseFolded = entry.archive_path.toLocaleLowerCase("en-US");
    if (folded.has(caseFolded)) throw new Error(`review archive inventory contains case-colliding paths: ${folded.get(caseFolded)} / ${entry.archive_path}`);
    folded.set(caseFolded, entry.archive_path);
    byPath.set(entry.archive_path, entry);
  }
  const ordered = orderedArchiveEntries(entries);
  if (entries.some((entry, index) => entry.archive_path !== ordered[index].archive_path)) throw new Error("review archive inventory is reordered");
  for (const entry of entries) {
    for (const parent of parentArchivePaths(entry.archive_path)) {
      const parentEntry = byPath.get(parent);
      if (!parentEntry) throw new Error(`review archive inventory is missing parent directory: ${parent}`);
      if (parentEntry.entry_type !== "directory") throw new Error(`review archive inventory parent is not a directory: ${parent}`);
    }
  }
  for (const required of REQUIRED_FILESYSTEM_CASE_PATHS) {
    if (byPath.get(required)?.entry_type !== "directory") throw new Error(`review archive inventory is missing required filesystem state: ${required}`);
  }
  const expected = [REVIEW_MANIFEST_PATH, ...entries.map(({ archive_path }) => archive_path)];
  if (!Array.isArray(expectedArchiveEntries) || expectedArchiveEntries.length !== expected.length || expectedArchiveEntries.some((path, index) => path !== expected[index])) throw new Error("review archive expected entry inventory differs");
  return { entry_count: expected.length, file_count: entries.filter(({ entry_type }) => entry_type === "file").length, directory_count: entries.filter(({ entry_type }) => entry_type === "directory").length };
}

function walkSource(root, archivePrefix, category, sourceScope) {
  const entries = [];
  const visit = (directory, relativeDirectory = "") => {
    for (const name of readdirSync(directory).sort(lexicalCompare)) {
      const absolute = resolve(directory, name);
      const sourcePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`review archive source traverses a symlink: ${sourcePath}`);
      const archivePath = `${archivePrefix}/${sourcePath}${status.isDirectory() ? "/" : ""}`;
      if (status.isDirectory()) {
        entries.push({ archive_path: archivePath, entry_type: "directory", mode: status.mode & 0o777, category, source_scope: sourceScope, source_path: sourcePath });
        visit(absolute, sourcePath);
      } else if (status.isFile()) {
        const bytes = readFileSync(absolute);
        entries.push({ archive_path: archivePath, entry_type: "file", mode: status.mode & 0o777, category, source_scope: sourceScope, source_path: sourcePath, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`review archive source is non-regular: ${sourcePath}`);
    }
  };
  visit(root);
  return entries;
}

function packageDirectoryEntries(entries) {
  const directories = new Map();
  for (const entry of entries) {
    for (const path of parentArchivePaths(entry.archive_path)) {
      if (!directories.has(path) && !entries.some(({ archive_path }) => archive_path === path)) directories.set(path, { archive_path: path, entry_type: "directory", mode: 0o755, category: "package", source_scope: "package", source_path: path.replace(/\/$/u, "") });
    }
  }
  return [...directories.values()];
}

function publicEntries(root) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT);
  return PUBLIC_PATHS.map((sourcePath) => {
    const absolute = resolve(fixtureRoot, sourcePath);
    const status = lstatSync(absolute);
    if (!status.isFile() || status.isSymbolicLink()) throw new Error(`review archive public source is not a regular file: ${sourcePath}`);
    const bytes = readFileSync(absolute);
    return { archive_path: `public/${FIXTURE_ROOT}/${sourcePath}`, entry_type: "file", mode: status.mode & 0o777, category: "public", source_scope: "repository", source_path: `${FIXTURE_ROOT}/${sourcePath}`, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

function inventorySources({ root, privateRoot, caseRoot }) {
  const entries = [
    ...publicEntries(root),
    ...walkSource(privateRoot, "private", "private", "private_evaluator_root"),
    ...walkSource(caseRoot, "cases", "case", "private_case_root"),
  ];
  return orderedArchiveEntries([...entries, ...packageDirectoryEntries(entries)]);
}

function sourcePathForEntry(entry, { root, privateRoot, caseRoot }) {
  if (entry.source_scope === "repository") return resolve(root, entry.source_path);
  if (entry.source_scope === "private_evaluator_root") return resolve(privateRoot, entry.source_path);
  if (entry.source_scope === "private_case_root") return resolve(caseRoot, entry.source_path);
  return null;
}

function assertInventoryMatchesSources(entries, sources) {
  for (const entry of entries) {
    const source = sourcePathForEntry(entry, sources);
    if (!source) continue;
    const status = lstatSync(source);
    if (entry.entry_type === "directory") {
      if (!status.isDirectory() || status.isSymbolicLink()) throw new Error(`review archive source is directory-for-file: ${entry.archive_path}`);
    } else {
      if (!status.isFile() || status.isSymbolicLink()) throw new Error(`review archive source is file-for-directory: ${entry.archive_path}`);
      const bytes = readFileSync(source);
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`review archive source file identity drift: ${entry.archive_path}`);
    }
    if ((status.mode & 0o777) !== entry.mode) throw new Error(`review archive source mode drift: ${entry.archive_path}`);
  }
}

export function validateReviewArchiveInventoryAgainstSources(entries, sources) {
  assertInventoryMatchesSources(entries, {
    root: realpathSync(sources.root),
    privateRoot: realpathSync(sources.privateRoot),
    caseRoot: realpathSync(sources.caseRoot),
  });
  return true;
}

function reviewManifest({ root, privateRoot, caseRoot, reviewedHead, pullRequest, issue, entries }) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT);
  const requirement = readJson(resolve(fixtureRoot, "requirement-record.json"), "mn-doc requirement record");
  const output = readJson(resolve(fixtureRoot, "output-contract.json"), "mn-doc output contract");
  const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"), "mn-doc evaluator reference");
  const authorityManifest = readJson(resolve(fixtureRoot, "evaluator-authority-manifest.json"), "mn-doc evaluator authority manifest");
  const candidate = readJson(resolve(fixtureRoot, "source-freeze-candidate.json"), "mn-doc source-freeze candidate");
  const admissionReview = readJson(resolve(fixtureRoot, "admission-review.json"), "mn-doc admission review");
  const bundleBytes = readFileSync(resolve(privateRoot, "private-evaluator-bundle.json"));
  const bundle = JSON.parse(bundleBytes);
  const independenceBytes = readFileSync(resolve(privateRoot, "independence.json"));
  const independence = JSON.parse(independenceBytes);
  const expectations = readJson(resolve(caseRoot, "expectations.json"), "mn-doc private case expectations");
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle) || bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("review archive private bundle identity differs");
  if (reference.evaluator_revision !== bundle.evaluator_revision || reference.evaluator_bundle_id !== bundle.evaluator_bundle_id || reference.evaluator_bundle_digest !== bundle.evaluator_bundle_digest) throw new Error("review archive public/private evaluator identity differs");
  if (candidate.evaluator_private_binding?.evaluator_bundle_id !== bundle.evaluator_bundle_id || candidate.evaluator_private_binding?.evaluator_bundle_digest !== bundle.evaluator_bundle_digest) throw new Error("review archive candidate/private evaluator identity differs");
  for (const asset of bundle.asset_inventory) {
    const bytes = readFileSync(resolve(privateRoot, asset.path));
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`review archive private asset identity differs: ${asset.path}`);
  }
  validateEvaluatorSourceIdentity({ identity: bundle.evaluator_source_identity, root, expectedRevision: bundle.evaluator_revision, expectedGeneratorSourceDigest: bundle.generator.source_digest, label: "review archive evaluator source identity" });
  const expectedArchiveEntries = [REVIEW_MANIFEST_PATH, ...entries.map(({ archive_path }) => archive_path)];
  validateReviewArchiveInventory(entries, expectedArchiveEntries);
  return {
    schema_version: issue === null ? "pr242-exact-private-review-manifest.v3" : "mn-doc-exact-private-review-manifest.v4",
    package_kind: "independent_private_review_archive",
    archive_format: zipFormatAuthority(root),
    review_target: { repository: "ist-h-i/agent-spectrum-kernel", ...(issue === null ? { pull_request: pullRequest } : { issue }), reviewed_head: reviewedHead, evaluator_revision: reference.evaluator_revision },
    authority: {
      requirement_record_digest: requirement.requirement_record_digest,
      requirement_set_digest: requirement.requirement_set_digest,
      output_contract_digest: output.output_contract_digest,
      evaluator_reference_digest: reference.public_metadata_digest,
      evaluator_authority_manifest_digest: authorityManifest.manifest_digest,
      source_freeze_candidate_digest: candidate.candidate_digest,
      logical_review_package_digest: admissionReview.review_package_digest,
    },
    private_bundle: { id: bundle.evaluator_bundle_id, digest: bundle.evaluator_bundle_digest, asset_bytes: bundle.asset_inventory.reduce((sum, asset) => sum + asset.bytes, 0), manifest_raw_bytes: bundleBytes.length, manifest_raw_sha256: sha256(bundleBytes) },
    source_identity: { source_tree_digest: bundle.evaluator_source_identity.source_tree_digest, dependency_graph_digest: bundle.dependency_graph.graph_digest, graph_node_count: bundle.dependency_graph.node_inventory.length, graph_edge_count: bundle.dependency_graph.edge_inventory.length },
    independence: { statement_digest: bundle.independence.statement_digest, statement_raw_sha256: sha256(independenceBytes), generated_without_agent_output: independence.generated_without_agent_output, public_answer_sources_used: independence.public_answer_sources_used, measured_agent_access_allowed: independence.measured_agent_access_allowed },
    frozen_state: { review_status: "pending_independent_review", admission_status: "admission_pending", scoring_ready: false, measured_execution: false, fixture_two_admission_overlay_included: false, reviewer_approval_included: false },
    review_cases: {
      baseline_workspace: `cases/${expectations.frozen_workspace}`,
      expectations_path: "cases/expectations.json",
      count: expectations.cases.length,
      totality_state_count: expectations.totality_cases.length,
      cases: expectations.cases.map((entry) => ({ case_id: entry.case_id, candidate_workspace: entry.candidate_workspace, expected_classification: expectations.fragment_projections[entry.expected_projection].classification, verification_state: entry.verification_state, expected_projection: entry.expected_projection })),
      totality_states: expectations.totality_cases.map((entry) => ({ state: entry.state, expected_classification: "under_processing", expected_findings: entry.expected_findings })),
    },
    adversarial_cases: {
      count: expectations.adversarial_cases?.length ?? 0,
      cases: (expectations.adversarial_cases ?? []).map((entry) => ({ case_id: entry.case_id, candidate_workspace: entry.candidate_workspace, expected_classification: expectations.fragment_projections[entry.expected_projection].classification, verification_state: entry.verification_state, expected_projection: entry.expected_projection })),
    },
    prohibited_contents: { measured_benchmark_outputs: false, actual_scores: false, adaptive_or_full_condition_results: false, post_result_analysis: false, contaminated_issue_193_196_material: false, fixture_two_admission_decision_or_overlay: false, reviewer_approval_result: false, fabricated_review_record: false },
    inventory: {
      payload_entry_count: entries.length,
      file_count: entries.filter(({ entry_type }) => entry_type === "file").length,
      directory_count: entries.filter(({ entry_type }) => entry_type === "directory").length,
      public_file_count: entries.filter(({ category, entry_type }) => category === "public" && entry_type === "file").length,
      private_file_count: entries.filter(({ category, entry_type }) => category === "private" && entry_type === "file").length,
      case_file_count: entries.filter(({ category, entry_type }) => category === "case" && entry_type === "file").length,
      final_archive_entry_count: expectedArchiveEntries.length,
      expected_archive_entries: expectedArchiveEntries,
      entries,
    },
  };
}

function materializeStage(stage, manifest, sources) {
  mkdirSync(stage, { recursive: false, mode: 0o755 });
  for (const entry of manifest.inventory.entries) {
    const target = resolve(stage, entry.archive_path.replace(/\/$/u, ""));
    if (entry.entry_type === "directory") {
      mkdirSync(target, { recursive: true });
      chmodSync(target, entry.mode);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(sourcePathForEntry(entry, sources), target);
      chmodSync(target, entry.mode);
    }
  }
  writeFileSync(resolve(stage, REVIEW_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
}

function localFileHeader({ nameBytes, content, checksum }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
  header.writeUInt16LE(ZIP_STORE_METHOD, 8);
  header.writeUInt16LE(FIXED_DOS_TIME, 10);
  header.writeUInt16LE(FIXED_DOS_DATE, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(content.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryHeader({ nameBytes, content, checksum, mode, entryType, localOffset }) {
  const header = Buffer.alloc(46);
  const unixMode = ((entryType === "directory" ? 0o040000 : 0o100000) | mode) & 0xffff;
  const externalAttributes = (((unixMode << 16) >>> 0) | (entryType === "directory" ? 0x10 : 0)) >>> 0;
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(ZIP_VERSION_MADE_BY_UNIX, 4);
  header.writeUInt16LE(ZIP_VERSION, 6);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
  header.writeUInt16LE(ZIP_STORE_METHOD, 10);
  header.writeUInt16LE(FIXED_DOS_TIME, 12);
  header.writeUInt16LE(FIXED_DOS_DATE, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(content.length, 20);
  header.writeUInt32LE(content.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(externalAttributes, 38);
  header.writeUInt32LE(localOffset, 42);
  return header;
}

function endOfCentralDirectory({ entryCount, centralSize, centralOffset }) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

function archiveStage(stage, outputPath, manifest) {
  if (existsSync(outputPath)) throw new Error("review archive output already exists");
  mkdirSync(dirname(outputPath), { recursive: true });
  const inventoryByPath = new Map(manifest.inventory.entries.map((entry) => [entry.archive_path, entry]));
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const archivePath of manifest.inventory.expected_archive_entries) {
    const inventory = archivePath === REVIEW_MANIFEST_PATH
      ? { entry_type: "file", mode: 0o644 }
      : inventoryByPath.get(archivePath);
    if (!inventory) throw new Error(`review archive ZIP entry is absent from inventory: ${archivePath}`);
    const nameBytes = Buffer.from(archivePath, "utf8");
    const content = inventory.entry_type === "directory" ? Buffer.alloc(0) : readFileSync(resolve(stage, archivePath));
    if (nameBytes.length > 0xffff || content.length > 0xffffffff || localOffset > 0xffffffff) throw new Error("review archive exceeds deterministic ZIP32 limits");
    const checksum = crc32(content);
    const localHeader = localFileHeader({ nameBytes, content, checksum });
    localRecords.push(localHeader, nameBytes, content);
    centralRecords.push(centralDirectoryHeader({ nameBytes, content, checksum, mode: inventory.mode, entryType: inventory.entry_type, localOffset }), nameBytes);
    localOffset += localHeader.length + nameBytes.length + content.length;
  }
  if (manifest.inventory.expected_archive_entries.length > 0xffff) throw new Error("review archive entry count exceeds deterministic ZIP32 limits");
  const centralDirectory = Buffer.concat(centralRecords);
  if (centralDirectory.length > 0xffffffff) throw new Error("review archive central directory exceeds deterministic ZIP32 limits");
  const archive = Buffer.concat([
    ...localRecords,
    centralDirectory,
    endOfCentralDirectory({ entryCount: manifest.inventory.expected_archive_entries.length, centralSize: centralDirectory.length, centralOffset: localOffset }),
  ]);
  writeFileSync(outputPath, archive, { mode: 0o644, flag: "wx" });
}

export function verifyMnDocConfigCorrectionReviewArchive({ archivePath, root = ROOT, privateRoot, caseRoot }) {
  const extraction = mkdtempSync(resolve(tmpdir(), "ask-mn-doc-review-extract-"));
  try {
    execFileSync("unzip", ["-q", archivePath, "-d", extraction]);
    const manifest = readJson(resolve(extraction, REVIEW_MANIFEST_PATH), "review archive manifest");
    if (!new Set(["pr242-exact-private-review-manifest.v3", "mn-doc-exact-private-review-manifest.v4"]).has(manifest.schema_version)) throw new Error("review archive manifest revision differs");
    const targetNumberField = manifest.schema_version === "pr242-exact-private-review-manifest.v3" ? "pull_request" : "issue";
    const unexpectedTargetNumberField = targetNumberField === "pull_request" ? "issue" : "pull_request";
    if (!Number.isInteger(manifest.review_target?.[targetNumberField]) || manifest.review_target[targetNumberField] < 1 || Object.hasOwn(manifest.review_target, unexpectedTargetNumberField)) throw new Error("review archive target identity differs");
    validateZipFormatAuthority(manifest.archive_format, realpathSync(root));
    validateReviewArchiveInventory(manifest.inventory?.entries, manifest.inventory?.expected_archive_entries);
    const zipEntries = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" }).trim().split("\n");
    if (zipEntries.length !== manifest.inventory.expected_archive_entries.length || zipEntries.some((path, index) => path !== manifest.inventory.expected_archive_entries[index])) throw new Error("review archive ZIP entry order or closure differs");
    const sources = { root: realpathSync(root), privateRoot: realpathSync(privateRoot), caseRoot: realpathSync(caseRoot) };
    assertInventoryMatchesSources(manifest.inventory.entries, sources);
    for (const entry of manifest.inventory.entries) {
      const extractedPath = resolve(extraction, entry.archive_path.replace(/\/$/u, ""));
      const status = lstatSync(extractedPath);
      if (status.isSymbolicLink()) throw new Error(`review archive extracted a symlink: ${entry.archive_path}`);
      if (entry.entry_type === "directory" ? !status.isDirectory() : !status.isFile()) throw new Error(`review archive extracted entry type differs: ${entry.archive_path}`);
      if ((status.mode & 0o777) !== entry.mode) throw new Error(`review archive extracted mode differs: ${entry.archive_path}`);
      if (entry.entry_type === "file") {
        const bytes = readFileSync(extractedPath);
        if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`review archive extracted file identity differs: ${entry.archive_path}`);
      }
    }
    const deletedDocs = resolve(extraction, "cases/target-deletion/docs");
    if (!lstatSync(deletedDocs).isDirectory() || readdirSync(deletedDocs).length !== 0) throw new Error("review archive target-deletion docs state differs");
    if (!lstatSync(resolve(extraction, "cases/target-directory/docs/worker-retries.md")).isDirectory()) throw new Error("review archive target-directory state differs");
    return { extraction_root: extraction, manifest, raw_sha256: sha256(readFileSync(archivePath)), raw_bytes: statSync(archivePath).size, cleanup: () => rmSync(extraction, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(extraction, { recursive: true, force: true });
    throw error;
  }
}

export function generateMnDocConfigCorrectionReviewArchive({ root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead, pullRequest = null, issue = null }) {
  const repository = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  const caseDirectory = realpathSync(caseRoot);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  if (reviewedHead !== head || !/^[a-f0-9]{40}$/u.test(reviewedHead)) throw new Error("review archive reviewed HEAD differs from repository HEAD");
  const effectivePullRequest = pullRequest ?? (issue === null ? 242 : null);
  if ((issue === null) === (effectivePullRequest === null)) throw new Error("review archive requires exactly one review target");
  if (issue !== null && (!Number.isInteger(issue) || issue < 1)) throw new Error("review archive issue is invalid");
  if (effectivePullRequest !== null && (!Number.isInteger(effectivePullRequest) || effectivePullRequest < 1)) throw new Error("review archive pull request is invalid");
  const sources = { root: repository, privateRoot: privateDirectory, caseRoot: caseDirectory };
  const entries = inventorySources(sources);
  assertInventoryMatchesSources(entries, sources);
  const manifest = reviewManifest({ ...sources, reviewedHead, pullRequest: effectivePullRequest, issue, entries });
  const stagingRoot = mkdtempSync(resolve(tmpdir(), "ask-mn-doc-review-stage-"));
  const stage = resolve(stagingRoot, "package");
  try {
    materializeStage(stage, manifest, sources);
    archiveStage(stage, resolve(outputPath), manifest);
    return { archive_path: resolve(outputPath), raw_sha256: sha256(readFileSync(resolve(outputPath))), raw_bytes: statSync(resolve(outputPath)).size, manifest };
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (!["--private-root", "--case-root", "--output", "--reviewed-head", "--pull-request", "--issue"].includes(flag) || argv.length === 0) throw new Error(`unknown or incomplete review archive argument: ${flag}`);
    args[flag.slice(2).replaceAll("-", "_")] = argv.shift();
  }
  return args;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const command = process.argv[2];
  if (command !== "generate") throw new Error("usage: generate --private-root <dir> --case-root <dir> --output <zip> --reviewed-head <sha> [--pull-request <number> | --issue <number>]");
  const args = parseArgs(process.argv.slice(3));
  const result = generateMnDocConfigCorrectionReviewArchive({ privateRoot: args.private_root, caseRoot: args.case_root, outputPath: args.output, reviewedHead: args.reviewed_head, pullRequest: args.pull_request ? Number(args.pull_request) : null, issue: args.issue ? Number(args.issue) : null });
  console.log(JSON.stringify({ archive_path: result.archive_path, raw_sha256: result.raw_sha256, raw_bytes: result.raw_bytes, entry_count: result.manifest.inventory.final_archive_entry_count }));
}

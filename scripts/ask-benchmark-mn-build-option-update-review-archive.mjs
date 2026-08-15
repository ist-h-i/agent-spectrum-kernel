#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ID = "mn-build-option-update";
const FIXTURE_PATH = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800;
const VERSION = 20;
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or invalid`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function portable(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`review archive path is not portable: ${path}`);
  return path;
}

function walk(root, prefix) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`review archive source traverses a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) entries.push({ path: portable(`${prefix}/${relative(root, absolute).split(sep).join("/")}`), bytes: readFileSync(absolute), mode: statSync(absolute).mode & 0o777 });
      else throw new Error(`review archive source is not regular: ${absolute}`);
    }
  };
  visit(root);
  return entries;
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
    const checksum = crc32(entry.bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(VERSION, 4); localHeader.writeUInt16LE(UTF8_FLAG, 6); localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(DOS_TIME, 10); localHeader.writeUInt16LE(DOS_DATE, 12); localHeader.writeUInt32LE(checksum, 14); localHeader.writeUInt32LE(entry.bytes.length, 18); localHeader.writeUInt32LE(entry.bytes.length, 22); localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, entry.bytes);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(VERSION_MADE_BY_UNIX, 4); centralHeader.writeUInt16LE(VERSION, 6); centralHeader.writeUInt16LE(UTF8_FLAG, 8); centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(DOS_TIME, 12); centralHeader.writeUInt16LE(DOS_DATE, 14); centralHeader.writeUInt32LE(checksum, 16); centralHeader.writeUInt32LE(entry.bytes.length, 20); centralHeader.writeUInt32LE(entry.bytes.length, 24); centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38); centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + entry.bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function evaluatorSourceEntries(root, bundle) {
  return bundle.evaluator_source_identity.source_files.map(({ path, bytes: expectedBytes, sha256: expectedDigest }) => {
    const bytes = execFileSync("git", ["-C", root, "show", `${bundle.evaluator_revision}:${path}`], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
    if (bytes.length !== expectedBytes || sha256(bytes) !== expectedDigest) throw new Error(`review archive evaluator source identity differs at ${path}`);
    const tree = execFileSync("git", ["-C", root, "ls-tree", bundle.evaluator_revision, "--", path], { encoding: "utf8" }).trim();
    return { path: portable(`evaluator-source/${path}`), bytes, mode: tree.startsWith("100755 ") ? 0o755 : 0o644 };
  });
}

export function generateMnBuildOptionUpdateReviewArchive({ root = ROOT, privateRoot, outputPath, reviewedHead } = {}) {
  if (!privateRoot || !outputPath || !/^[a-f0-9]{40}$/u.test(reviewedHead ?? "")) throw new Error("mn-build review archive requires privateRoot, outputPath, and reviewedHead");
  const repository = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  if (privateDirectory === repository || privateDirectory.startsWith(`${repository}/`)) throw new Error("mn-build review archive private root must stay outside the repository");
  const head = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== reviewedHead) throw new Error("mn-build review archive reviewedHead differs from repository HEAD");
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "mn-build private bundle");
  const fixtureRoot = resolve(repository, FIXTURE_PATH);
  const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"), "mn-build evaluator reference");
  const admission = readJson(resolve(fixtureRoot, "final-admission-record.json"), "mn-build final admission record");
  const requirement = readJson(resolve(fixtureRoot, "requirement-record.json"), "mn-build requirement record");
  const output = readJson(resolve(fixtureRoot, "output-contract.json"), "mn-build output contract");
  const authority = readJson(resolve(fixtureRoot, "evaluator-authority-manifest.json"), "mn-build evaluator authority manifest");
  const candidate = readJson(resolve(fixtureRoot, "source-freeze-candidate.json"), "mn-build source-freeze candidate");
  const review = readJson(resolve(fixtureRoot, "admission-review.json"), "mn-build admission review");
  if (reference.evaluator_bundle_id !== bundle.evaluator_bundle_id || reference.evaluator_bundle_digest !== bundle.evaluator_bundle_digest || reference.evaluator_revision !== bundle.evaluator_revision) throw new Error("mn-build review archive private/public evaluator identity differs");
  if (admission.admission_status !== "admission_pending" || review.reviewer_status !== "pending_independent_review" || review.author_self_approval !== false) throw new Error("mn-build review archive requires pending independent review authority");
  const entries = [...walk(fixtureRoot, `repository/${FIXTURE_PATH}`), ...evaluatorSourceEntries(repository, bundle), ...walk(privateDirectory, "private-evaluator")];
  const unique = new Map();
  for (const entry of entries) {
    if (unique.has(entry.path)) throw new Error(`mn-build review archive contains duplicate entry: ${entry.path}`);
    unique.set(entry.path, entry);
  }
  const manifest = {
    schema_version: "1.0.0",
    program: "mn_build_option_update_private_review_archive",
    fixture_id: FIXTURE_ID,
    reviewed_repository_head: reviewedHead,
    evaluator_revision: bundle.evaluator_revision,
    evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest,
    evaluator_authority_digest: authority.manifest_digest,
    requirement_record_digest: requirement.requirement_record_digest,
    requirement_set_digest: requirement.requirement_set_digest,
    output_contract_digest: output.output_contract_digest,
    source_freeze_candidate_digest: candidate.candidate_digest,
    input_digest: reference.fixture_input_digest,
    reviewer_status: "pending_independent_review",
    admission_status: "admission_pending",
    author_self_approval: false,
    scoring_ready: false,
    measured_execution: false,
    archive_format: { revision: "issue-254-node-store-zip.v1", compression_method: "store", fixed_timestamp: "1980-01-01T00:00:00" },
    entries: [...unique.values()].sort((left, right) => left.path.localeCompare(right.path)).map(({ path, bytes, mode }) => ({ path, bytes: bytes.length, sha256: sha256(bytes), mode })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const archiveBytes = zip([...unique.values(), { path: "REVIEW-MANIFEST.json", bytes: manifestBytes, mode: 0o644 }]);
  writeFileSync(resolve(outputPath), archiveBytes, { flag: "wx" });
  return Object.freeze({ fixtureId: FIXTURE_ID, reviewedHead, evaluatorRevision: bundle.evaluator_revision, bundleId: bundle.evaluator_bundle_id, bundleDigest: bundle.evaluator_bundle_digest, evaluatorAuthorityDigest: authority.manifest_digest, requirementRecordDigest: requirement.requirement_record_digest, requirementSetDigest: requirement.requirement_set_digest, outputContractDigest: output.output_contract_digest, sourceFreezeDigest: candidate.candidate_digest, inputDigest: reference.fixture_input_digest, archivePath: resolve(outputPath), archiveSha256: sha256(archiveBytes), archiveBytes: archiveBytes.length, entryCount: unique.size + 1 });
}

function parseArgs(argv) {
  const args = { root: ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]; const value = argv[index + 1];
    if (flag === "--root" && value) args.root = resolve(value);
    else if (flag === "--private-root" && value) args.privateRoot = resolve(value);
    else if (flag === "--output" && value) args.outputPath = resolve(value);
    else if (flag === "--reviewed-head" && value) args.reviewedHead = value;
    else throw new Error(`unknown or incomplete argument: ${flag}`);
    index += 1;
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(generateMnBuildOptionUpdateReviewArchive(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

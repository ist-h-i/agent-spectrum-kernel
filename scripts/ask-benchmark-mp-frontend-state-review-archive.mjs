#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvaluatorBundleDigest, computeEvaluatorBundleId } from "./ask-benchmark-evaluator-boundary.mjs";
import { assertPrivateRootOutsideRepository } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpFrontendStateReviewProductionAuthority } from "./ask-benchmark-mp-frontend-state-review-authority.mjs";
import {
  establishReviewArchiveIdentity,
  evaluatorSourceReviewEntries,
  validateReviewArchiveCases,
  validateReviewArchivePrivateBundle,
} from "./ask-benchmark-review-archive-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-frontend-state-review";
const FIXTURE_PATH = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const GENERATOR_PATH = "scripts/ask-benchmark-mp-frontend-state-review-archive.mjs";
const SOURCE_PATHS = Object.freeze([
  "benchmarks/portfolio-design-admission-records/mp-frontend-state-review.json",
  "benchmarks/schemas/private-evaluator-bundle.schema.json",
  "benchmarks/schemas/private-evaluator-fragment.schema.json",
  "benchmarks/schemas/private-evaluator-independence-statement.schema.json",
  "scripts/ask-benchmark-evaluator-boundary.mjs",
  "scripts/ask-benchmark-private-evaluator-runner.mjs",
  "scripts/ask-benchmark-mp-frontend-state-review.mjs",
  "scripts/ask-benchmark-mp-frontend-state-review-authority.mjs",
  GENERATOR_PATH,
  "scripts/test-ask-benchmark-mp-frontend-state-review.mjs",
]);
const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; }));

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function git(root, args, label, encoding = "utf8") { const result = spawnSync("git", ["-C", root, ...args], { encoding }); if (result.status !== 0) throw new Error(`${label} failed: ${String(result.stderr || result.stdout)}`); return result.stdout; }
function portable(path) { if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`frontend review archive path is not portable: ${path}`); return path; }
function mode(value, path) { if (value === "100644") return 0o644; if (value === "100755") return 0o755; throw new Error(`frontend review archive repository source is not regular: ${path}`); }
function readJson(path, label) { if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${label} is missing or invalid`); try { return JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`${label} is invalid JSON`); } }
function repositoryEntry(root, head, path) {
  const record = git(root, ["ls-tree", head, "--", path], `frontend archive lookup ${path}`).trim();
  const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
  if (!match || match[3] !== path) throw new Error(`frontend review archive repository source is missing: ${path}`);
  return { path: portable(`repository/${path}`), bytes: Buffer.from(git(root, ["cat-file", "blob", match[2]], `frontend archive read ${path}`, null)), mode: mode(match[1], path) };
}
function repositoryTree(root, head, prefix) {
  const records = Buffer.from(git(root, ["ls-tree", "-r", "-z", "--full-tree", head, "--", prefix], `frontend archive tree ${prefix}`, null)).toString("utf8").split("\0").filter(Boolean);
  if (!records.length) throw new Error(`frontend review archive repository tree is empty: ${prefix}`);
  return records.map((record) => { const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u); if (!match) throw new Error(`frontend review archive unsupported tree entry: ${record}`); return repositoryEntry(root, head, match[3]); });
}
function externalDirectory(path, label) { if (!path || !existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error(`${label} must be a real directory`); return realpathSync(path); }
function walk(root, prefix) {
  const entries = [];
  function visit(directory) { for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const absolute = resolve(directory, item.name); if (item.isSymbolicLink()) throw new Error(`frontend review archive source traverses a symlink: ${absolute}`); if (item.isDirectory()) visit(absolute); else if (item.isFile()) entries.push({ path: portable(`${prefix}/${relative(root, absolute).split(sep).join("/")}`), bytes: readFileSync(absolute), mode: statSync(absolute).mode & 0o777 }); else throw new Error(`frontend review archive source is not regular: ${absolute}`); } }
  visit(root); return entries;
}
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const local = []; const central = []; let offset = 0;
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const name = Buffer.from(entry.path); const checksum = crc32(entry.bytes); const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(entry.bytes.length, 18); header.writeUInt32LE(entry.bytes.length, 22); header.writeUInt16LE(name.length, 26); local.push(header, name, entry.bytes);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE((3 << 8) | 20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(0, 10); record.writeUInt16LE(0, 12); record.writeUInt16LE(0x21, 14); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(entry.bytes.length, 20); record.writeUInt32LE(entry.bytes.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38); record.writeUInt32LE(offset, 42); central.push(record, name); offset += header.length + name.length + entry.bytes.length;
  }
  const centralBytes = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, centralBytes, end]);
}

export function generateMpFrontendStateReviewArchive({ root = ROOT, privateRoot, caseRoot, outputPath, reviewedHead, sourceRevision } = {}) {
  if (!privateRoot || !caseRoot || !outputPath) throw new Error("frontend review archive requires privateRoot, caseRoot, outputPath, reviewedHead, and sourceRevision");
  const repositoryRoot = realpathSync(root); const privateDirectory = externalDirectory(privateRoot, "frontend private root"); const caseDirectory = externalDirectory(caseRoot, "frontend case root");
  assertPrivateRootOutsideRepository(repositoryRoot, privateDirectory); assertPrivateRootOutsideRepository(repositoryRoot, caseDirectory);
  const requestedTarget = resolve(outputPath); const archiveTarget = resolve(realpathSync(dirname(requestedTarget)), basename(requestedTarget));
  if ([repositoryRoot, privateDirectory, caseDirectory].some((directory) => archiveTarget === directory || archiveTarget.startsWith(`${directory}${sep}`))) throw new Error("frontend review archive output must stay outside repository and authority source roots");
  if (git(repositoryRoot, ["rev-parse", "HEAD"], "frontend reviewed HEAD").trim() !== reviewedHead) throw new Error("frontend review archive reviewed HEAD differs from repository HEAD");
  if (spawnSync("git", ["-C", repositoryRoot, "diff", "--quiet", reviewedHead, "--"]).status !== 0) throw new Error("frontend review archive tracked bytes differ from reviewed HEAD");
  const authority = validateMpFrontendStateReviewProductionAuthority({ root: repositoryRoot });
  const identity = establishReviewArchiveIdentity({ root: repositoryRoot, runtimeRoot: ROOT, reviewedHead, sourceRevision, evaluatorRevision: authority.evaluatorRevision, generatorPath: GENERATOR_PATH });
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "frontend private bundle");
  if (bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest || bundle.evaluator_revision !== authority.evaluatorRevision || bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle) || bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("frontend review archive private bundle differs from public authority");
  const privateEntries = walk(privateDirectory, "private-evaluator"); const byPath = new Map(privateEntries.map((entry) => [entry.path.slice("private-evaluator/".length), entry]));
  const expectedPrivate = ["private-evaluator-bundle.json", ...bundle.asset_inventory.map(({ path }) => path)].sort(); if (JSON.stringify([...byPath.keys()].sort()) !== JSON.stringify(expectedPrivate)) throw new Error("frontend review archive private inventory is not closed");
  for (const asset of bundle.asset_inventory) { const entry = byPath.get(asset.path); if (!entry || entry.bytes.length !== asset.bytes || sha256(entry.bytes) !== asset.sha256) throw new Error(`frontend review archive private asset bytes differ: ${asset.role}`); }
  const privateSummary = validateReviewArchivePrivateBundle({ fixtureId: FIXTURE_ID, bundle, authority, privateEntries, privatePrefix: "private-evaluator" });
  const cases = readJson(resolve(caseDirectory, "cases.json"), "frontend cases"); if (cases.fixture_id !== FIXTURE_ID || !Array.isArray(cases.cases) || !cases.cases.length || new Set(cases.cases.map(({ case_id }) => case_id)).size !== cases.cases.length) throw new Error("frontend review archive case identity is invalid");
  const expectedCaseFiles = ["cases.json", "reference-review/review.json", ...cases.cases.map(({ case_id }) => `${case_id}/review.json`)].sort(); const caseEntries = walk(caseDirectory, "private-cases"); if (JSON.stringify(caseEntries.map(({ path }) => path.slice("private-cases/".length)).sort()) !== JSON.stringify(expectedCaseFiles)) throw new Error("frontend review archive case inventory is not closed");
  const caseSummary = validateReviewArchiveCases({ fixtureId: FIXTURE_ID, caseEntries, casePrefix: "private-cases", closedCaseFileName: "review.json", additionalCasePaths: ["reference-review/review.json"] });
  const entries = [...repositoryTree(repositoryRoot, reviewedHead, FIXTURE_PATH), ...SOURCE_PATHS.map((path) => repositoryEntry(repositoryRoot, reviewedHead, path)), ...evaluatorSourceReviewEntries({ root: repositoryRoot, sourceRevision, sourceIdentity: bundle.evaluator_source_identity }), ...identity.generatorEntries, ...privateEntries, ...caseEntries];
  const unique = new Map(); for (const entry of entries) { if (unique.has(entry.path)) throw new Error(`frontend review archive duplicate entry: ${entry.path}`); unique.set(entry.path, entry); }
  const generator = unique.get(`repository/${GENERATOR_PATH}`); const manifest = { schema_version:"1.0.0", program:"mp_frontend_state_review_private_review_archive", fixture_id:FIXTURE_ID, reviewed_repository_head:reviewedHead, evaluator_source_revision:sourceRevision, evaluator_bundle_id:authority.evaluatorBundleId, evaluator_bundle_digest:authority.evaluatorBundleDigest, private_asset_bytes:privateSummary.privateAssetBytes, private_asset_count:privateSummary.privateAssetCount, private_case_count:caseSummary.caseCount, private_case_paths:caseSummary.casePaths, evaluator_source_tree_digest:bundle.evaluator_source_identity.source_tree_digest, evaluator_dependency_graph_digest:bundle.dependency_graph.graph_digest, archive_generator_source_identity:identity.generatorSourceIdentity, evaluator_authority_digest:authority.evaluatorAuthorityDigest, requirement_record_digest:authority.requirementRecordDigest, requirement_set_digest:authority.requirementSetDigest, output_contract_digest:authority.outputContractDigest, source_freeze_candidate_digest:authority.candidateDigest, input_digest:authority.inputDigest, independent_review_status:"pending", author_self_approval:false, admission_status:"admission_pending", scoring_ready:false, measured_execution:false, scoring_published:false, archive_format:{revision:"issue-282-fresh-successor-store-zip.v1",compression_method:"store",fixed_timestamp:"1980-01-01T00:00:00",generator_source_digest:sha256(generator.bytes),generator_source_inventory:identity.generatorSourceIdentity.node_inventory}, entries:[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(({path,bytes,mode})=>({path,bytes:bytes.length,sha256:sha256(bytes),mode})) };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); const archiveBytes = zip([...unique.values(), { path:"REVIEW-MANIFEST.json", bytes:manifestBytes, mode:0o644 }]); writeFileSync(archiveTarget, archiveBytes, { flag:"wx", mode:0o644 });
  return Object.freeze({ fixtureId:FIXTURE_ID, reviewedHead, evaluatorSourceRevision:sourceRevision, bundleId:authority.evaluatorBundleId, bundleDigest:authority.evaluatorBundleDigest, privateAssetBytes:privateSummary.privateAssetBytes, candidateDigest:authority.candidateDigest, inputDigest:authority.inputDigest, archivePath:archiveTarget, archiveSha256:sha256(archiveBytes), archiveBytes:archiveBytes.length, entryCount:unique.size + 1, privateCaseCount:caseSummary.caseCount });
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const args = {}; const argv = process.argv.slice(2); for (let i=0;i<argv.length;i+=1) { const name=argv[i]; if(name==="--root") args.root=resolve(argv[++i]); else if(name==="--private-root") args.privateRoot=resolve(argv[++i]); else if(name==="--case-root") args.caseRoot=resolve(argv[++i]); else if(name==="--output") args.outputPath=resolve(argv[++i]); else if(name==="--reviewed-head") args.reviewedHead=argv[++i]; else if(name==="--source-revision") args.sourceRevision=argv[++i]; else throw new Error(`unknown argument: ${name}`); } process.stdout.write(`${JSON.stringify(generateMpFrontendStateReviewArchive(args))}\n`); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode=1; }
}

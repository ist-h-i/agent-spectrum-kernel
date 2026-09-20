import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  deriveEvaluatorDependencyGraph,
} from "./ask-benchmark-evaluator-boundary.mjs";

const REPOSITORY_IDENTITY = "ist-h-i/agent-spectrum-kernel";

export function reviewArchiveSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function reviewArchivePortablePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`review archive path is not portable: ${path}`);
  }
  return path;
}

function git(root, args, label, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed: ${String(result.stderr || result.stdout)}`);
  return result.stdout;
}

function normalizeRepositoryRemote(remote) {
  const match = remote.trim().match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u);
  return match?.[1] ?? null;
}

function regularMode(mode, path) {
  if (mode === "100644") return 0o644;
  if (mode === "100755") return 0o755;
  throw new Error(`review archive repository source is not a regular file: ${path}`);
}

export function reviewArchiveCommitEntry(root, revision, path, prefix) {
  const portable = reviewArchivePortablePath(path);
  const record = String(git(root, ["ls-tree", revision, "--", portable], `review archive repository lookup ${portable}`)).trim();
  const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
  if (!match || match[3] !== portable) throw new Error(`review archive repository source is missing from revision ${revision}: ${portable}`);
  const bytes = Buffer.from(git(root, ["cat-file", "blob", match[2]], `review archive repository read ${portable}`, null));
  return { path: reviewArchivePortablePath(`${prefix}/${portable}`), bytes, mode: regularMode(match[1], portable) };
}

export function reviewArchiveCommitTreeEntries({ root, revision, path, prefix }) {
  const portableRoot = reviewArchivePortablePath(path);
  const listing = Buffer.from(git(root, ["ls-tree", "-r", "-z", "--full-tree", revision, "--", portableRoot], `review archive repository tree lookup ${portableRoot}`, null));
  const records = listing.toString("utf8").split("\0").filter(Boolean);
  if (records.length === 0) throw new Error(`review archive repository tree is empty: ${portableRoot}`);
  return records.map((record) => {
    const match = record.match(/^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/u);
    if (!match || (match[1] !== "100644" && match[1] !== "100755")) throw new Error(`review archive repository tree contains a nonregular entry: ${record}`);
    const sourcePath = reviewArchivePortablePath(match[3]);
    if (sourcePath !== portableRoot && !sourcePath.startsWith(`${portableRoot}/`)) throw new Error(`review archive repository tree escaped its root: ${sourcePath}`);
    return { path: reviewArchivePortablePath(`${prefix}/${sourcePath}`), bytes: Buffer.from(git(root, ["cat-file", "blob", match[2]], `review archive repository tree read ${sourcePath}`, null)), mode: regularMode(match[1], sourcePath) };
  });
}

export function resolveReviewArchiveOutput({ repositoryRoot, privateRoot, caseRoot, outputPath }) {
  const requested = resolve(outputPath);
  const target = resolve(realpathSync(dirname(requested)), basename(requested));
  for (const sourceRoot of [repositoryRoot, privateRoot, caseRoot]) {
    if (target === sourceRoot || target.startsWith(`${sourceRoot}${sep}`)) throw new Error("review archive output must stay outside source roots");
  }
  return target;
}

export function establishReviewArchiveIdentity({
  root,
  runtimeRoot,
  reviewedHead,
  sourceRevision,
  evaluatorRevision,
  generatorPath,
}) {
  const repositoryRoot = realpathSync(root);
  const executingRoot = realpathSync(runtimeRoot);
  for (const [value, label] of [[reviewedHead, "reviewed HEAD"], [sourceRevision, "SOURCE_REVISION"], [evaluatorRevision, "evaluator source revision"]]) {
    if (!/^[a-f0-9]{40}$/u.test(value ?? "")) throw new Error(`review archive ${label} is invalid`);
  }
  if (reviewedHead === sourceRevision) throw new Error("review archive SOURCE_REVISION and REVIEW_CANDIDATE_HEAD must be distinct");
  if (evaluatorRevision !== sourceRevision) throw new Error("review archive evaluator source revision differs from SOURCE_REVISION");
  if (String(git(repositoryRoot, ["rev-parse", "HEAD"], "review archive HEAD lookup")).trim() !== reviewedHead) throw new Error("review archive reviewed HEAD differs from repository HEAD");
  const parents = String(git(repositoryRoot, ["rev-list", "--parents", "-n", "1", reviewedHead], "review archive parent lookup")).trim().split(/\s+/u);
  if (parents.length !== 2 || parents[0] !== reviewedHead || parents[1] !== sourceRevision) throw new Error("review archive REVIEW_CANDIDATE_HEAD must be a direct one-parent descendant of SOURCE_REVISION");
  const remote = String(git(repositoryRoot, ["config", "--get", "remote.origin.url"], "review archive repository identity lookup")).trim();
  if (normalizeRepositoryRemote(remote) !== REPOSITORY_IDENTITY) throw new Error(`review archive repository identity differs from ${REPOSITORY_IDENTITY}`);
  const worktreeStatus = String(git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"], "review archive worktree status")).trim();
  if (worktreeStatus) throw new Error("review archive repository tracked or untracked bytes differ from the reviewed HEAD");

  const graphOptions = { baseRevision: sourceRevision, entryPaths: [reviewArchivePortablePath(generatorPath)], authorityPaths: [], privateEntryPaths: [] };
  const sourceGraph = deriveEvaluatorDependencyGraph({ root: repositoryRoot, ...graphOptions });
  const runtimeGraph = deriveEvaluatorDependencyGraph({ root: executingRoot, ...graphOptions });
  if (JSON.stringify(runtimeGraph) !== JSON.stringify(sourceGraph)) throw new Error("review archive executing generator dependency graph differs from SOURCE_REVISION");
  const entries = sourceGraph.node_inventory.map(({ path, bytes, sha256 }) => {
    const sourceEntry = reviewArchiveCommitEntry(repositoryRoot, sourceRevision, path, "archive-generator-source");
    const candidateEntry = reviewArchiveCommitEntry(repositoryRoot, reviewedHead, path, "archive-generator-source");
    const runtimePath = resolve(executingRoot, path);
    if (!existsSync(runtimePath) || lstatSync(runtimePath).isSymbolicLink() || !lstatSync(runtimePath).isFile()) throw new Error(`review archive executing generator source is invalid: ${path}`);
    const runtimeBytes = readFileSync(runtimePath);
    if (sourceEntry.bytes.length !== bytes || reviewArchiveSha256(sourceEntry.bytes) !== sha256 || !candidateEntry.bytes.equals(sourceEntry.bytes) || !runtimeBytes.equals(sourceEntry.bytes)) {
      throw new Error(`review archive generator source identity differs across SOURCE_REVISION, REVIEW_CANDIDATE_HEAD, and executing module: ${path}`);
    }
    return sourceEntry;
  });
  return Object.freeze({
    repositoryRoot,
    reviewedHead,
    sourceRevision,
    repository: REPOSITORY_IDENTITY,
    generatorSourceIdentity: sourceGraph,
    generatorEntries: entries,
  });
}

export function walkReviewArchiveRoot(root, prefix) {
  if (!root || !existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error(`review archive ${prefix} root must be an existing non-symlink directory`);
  const canonicalRoot = realpathSync(root);
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`review archive source traverses a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const path = reviewArchivePortablePath(`${prefix}/${relative(canonicalRoot, absolute).split(sep).join("/")}`);
        entries.push({ path, bytes: readFileSync(absolute), mode: statSync(absolute).mode & 0o777 });
      } else throw new Error(`review archive source is not a regular file: ${absolute}`);
    }
  }
  visit(canonicalRoot);
  if (entries.length === 0) throw new Error(`review archive ${prefix} root is empty`);
  return entries;
}

export function validateReviewArchivePrivateBundle({ fixtureId, bundle, authority, privateEntries, privatePrefix }) {
  const bundleFixtureId = bundle.fixture_identity?.fixture_id ?? bundle.fixture_id;
  if (bundleFixtureId !== fixtureId) throw new Error("review archive private bundle fixture identity differs");
  if (bundle.evaluator_revision !== authority.evaluatorRevision || bundle.evaluator_bundle_id !== authority.evaluatorBundleId || bundle.evaluator_bundle_digest !== authority.evaluatorBundleDigest) throw new Error("review archive private/public evaluator identity differs");
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle)) throw new Error("review archive private bundle ID closure is invalid");
  if (bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("review archive private bundle digest closure is invalid");
  if (!Array.isArray(bundle.asset_inventory) || bundle.asset_inventory.length === 0) throw new Error("review archive private asset inventory is missing");
  const assets = [...bundle.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (JSON.stringify(bundle.asset_inventory) !== JSON.stringify(assets)) throw new Error("review archive private asset inventory is reordered");
  if (new Set(assets.map(({ role }) => role)).size !== assets.length || new Set(assets.map(({ path }) => path)).size !== assets.length) throw new Error("review archive private asset inventory contains duplicates");
  const marker = `${privatePrefix}/`;
  const byPath = new Map(privateEntries.map((entry) => [entry.path.slice(marker.length), entry]));
  const expected = ["private-evaluator-bundle.json", ...assets.map(({ path }) => reviewArchivePortablePath(path))].sort();
  if (JSON.stringify([...byPath.keys()].sort()) !== JSON.stringify(expected)) throw new Error("review archive private bundle inventory is not closed");
  let privateAssetBytes = 0;
  for (const asset of assets) {
    const entry = byPath.get(asset.path);
    if (!entry || entry.bytes.length !== asset.bytes || reviewArchiveSha256(entry.bytes) !== asset.sha256) throw new Error(`review archive private asset bytes differ: ${asset.path}`);
    privateAssetBytes += entry.bytes.length;
  }
  return Object.freeze({ privateAssetBytes, privateAssetCount: assets.length });
}

export function evaluatorSourceReviewEntries({ root, sourceRevision, sourceIdentity }) {
  if (sourceIdentity?.base_git_revision !== sourceRevision || !Array.isArray(sourceIdentity.source_files) || sourceIdentity.source_files.length === 0) throw new Error("review archive evaluator source identity differs from SOURCE_REVISION");
  const expected = [...sourceIdentity.source_files].sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(sourceIdentity.source_files) !== JSON.stringify(expected) || new Set(expected.map(({ path }) => path)).size !== expected.length) throw new Error("review archive evaluator source inventory is reordered or duplicated");
  return expected.map((source) => {
    const entry = reviewArchiveCommitEntry(root, sourceRevision, source.path, "evaluator-source");
    if (entry.bytes.length !== source.bytes || reviewArchiveSha256(entry.bytes) !== source.sha256) throw new Error(`review archive evaluator source bytes differ: ${source.path}`);
    return entry;
  });
}

export function validateReviewArchiveCases({ fixtureId, caseEntries, casePrefix, singleton = false, manifestName = "cases.json", closedCaseFileName = null, additionalCasePaths = [], exactCasePaths = null }) {
  const marker = `${casePrefix}/`;
  const relativePaths = caseEntries.map(({ path }) => path.slice(marker.length)).sort();
  const record = caseEntries.find(({ path }) => path === `${casePrefix}/${manifestName}`);
  if (!record) throw new Error(`review archive private cases require ${manifestName}`);
  let manifest;
  try { manifest = JSON.parse(record.bytes.toString("utf8")); }
  catch { throw new Error("review archive private case manifest is invalid JSON"); }
  if (manifest.fixture_id !== fixtureId) throw new Error("review archive private case identity differs");
  const cases = manifest.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("review archive private case inventory is empty");
  const ids = cases.map((entry) => entry.case_id ?? entry.name);
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new Error("review archive private case inventory is incomplete or duplicated");
  let expectedPaths = null;
  if (exactCasePaths !== null) {
    if (!Array.isArray(exactCasePaths) || exactCasePaths.length === 0) throw new Error("review archive exact private case path inventory is invalid");
    expectedPaths = exactCasePaths.map(reviewArchivePortablePath).sort();
    if (new Set(expectedPaths).size !== expectedPaths.length || !expectedPaths.includes(manifestName)) throw new Error("review archive exact private case path inventory is incomplete or duplicated");
  } else if (singleton) expectedPaths = [manifestName];
  else if (closedCaseFileName) expectedPaths = [manifestName, ...ids.map((id) => reviewArchivePortablePath(`${id}/${closedCaseFileName}`)), ...additionalCasePaths.map(reviewArchivePortablePath)].sort();
  if (expectedPaths && JSON.stringify(relativePaths) !== JSON.stringify(expectedPaths)) throw new Error("review archive private case inventory is not closed");
  return Object.freeze({ caseCount: cases.length, casePaths: relativePaths });
}

export function addUniqueReviewArchiveEntries(target, entries) {
  for (const entry of entries) {
    reviewArchivePortablePath(entry.path);
    if (target.has(entry.path)) throw new Error(`review archive contains duplicate path: ${entry.path}`);
    target.set(entry.path, entry);
  }
}

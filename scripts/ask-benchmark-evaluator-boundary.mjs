import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { posix, relative, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computePolicyManifestDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  FINAL_ADMISSION_RECORD_SCHEMA_PATH,
  SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH,
  validateFinalAdmissionRecordContract,
  validateRequirementRecordContract,
  validateScoringContractSchemaParity,
  validateScoringInputBindings,
} from "./ask-benchmark-scoring-contract.mjs";

export const EVALUATOR_REFERENCE_SCHEMA_PATH = "benchmarks/schemas/evaluator-reference.schema.json";
export const PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-bundle.schema.json";
export const EVALUATOR_RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";
const CATALOG_SCHEMA_PATH = "benchmarks/schemas/portfolio-catalog.schema.json";
const POLICY_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-policy-manifest.schema.json";
const SCORING_POLICY_SCHEMA_PATH = "benchmarks/schemas/portfolio-scoring-policy.schema.json";
const ADMISSION_POLICY_SCHEMA_PATH = "benchmarks/schemas/portfolio-admission-policy.schema.json";
const ADMISSION_POLICY_PATH = "benchmarks/portfolio-admission-policy.json";
const REQUIREMENT_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-requirement-record.schema.json";
const OUTPUT_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-output-contract.schema.json";

const MAX_PUBLIC_ARTIFACT_BYTES = 1024 * 1024;
const MAX_JSON_ARTIFACT_BYTES = 1024 * 1024;
const MAX_BOUNDARY_FILE_BYTES = 256 * 1024 * 1024;
const MAX_BOUNDARY_FILES = 100_000;
const MAX_BOUNDARY_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const DIGEST_CHUNK_BYTES = 64 * 1024;
const BOUNDARY_MARKERS = [
  ["materializedPath", "materialized root", "materialization-manifest.json"],
  ["selectionState", "selection-state root", "selection-state.json"],
  ["runDir", "execution run root", "run-identity.json"],
  ["normalizedResultsPath", "normalized-results root", "normalized-results-root.json"],
];
const PUBLIC_FORBIDDEN_FIELDS = new Set([
  "credential",
  "credentials",
  "customer_data",
  "expected_decision",
  "expected_finding",
  "expected_finding_details",
  "expected_patch",
  "hidden_answer",
  "hidden_test_source",
  "hidden_tests",
  "matcher",
  "matcher_expression",
  "oracle",
  "oracle_text",
  "personal_data",
  "private_evaluator_path",
  "private_storage_uri",
  "raw_evaluator_prompt",
  "reference_answer",
  "rubric",
  "secret",
  "secrets",
]);

function createScanBudget(label) {
  return { label, files: 0, bytes: 0 };
}

function accountForFile(status, budget, label) {
  if (status.size > MAX_BOUNDARY_FILE_BYTES) throw new Error(`${label} exceeds the per-file boundary inspection limit`);
  budget.files += 1;
  budget.bytes += status.size;
  if (budget.files > MAX_BOUNDARY_FILES) throw new Error(`${budget.label} exceeds the boundary inspection file-count limit`);
  if (budget.bytes > MAX_BOUNDARY_TOTAL_BYTES) throw new Error(`${budget.label} exceeds the boundary inspection byte limit`);
}

function streamingFileDigest(path, label, budget = createScanBudget(label)) {
  assertRegularFile(path, label);
  const initialStatus = lstatSync(path);
  accountForFile(initialStatus, budget, label);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(DIGEST_CHUNK_BYTES);
  let descriptor;
  let bytes = 0;
  try {
    descriptor = openSync(path, "r");
    const openedStatus = fstatSync(descriptor);
    if (!openedStatus.isFile() || openedStatus.dev !== initialStatus.dev || openedStatus.ino !== initialStatus.ino || openedStatus.size !== initialStatus.size) {
      throw new Error(`${label} changed during boundary inspection`);
    }
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      bytes += count;
    }
    const finalStatus = fstatSync(descriptor);
    if (finalStatus.size !== openedStatus.size || finalStatus.mtimeMs !== openedStatus.mtimeMs || finalStatus.ctimeMs !== openedStatus.ctimeMs) {
      throw new Error(`${label} changed during boundary inspection`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (bytes !== initialStatus.size) throw new Error(`${label} changed during boundary inspection`);
  return { bytes, digest: `sha256:${hash.digest("hex")}` };
}

function isInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

function canonicalFilesystemPath(path) {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const suffix = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = resolve(current, "..");
    if (parent === current) return absolute;
    suffix.unshift(relative(parent, current));
    current = parent;
  }
  return resolve(realpathSync(current), ...suffix);
}

function pathsOverlap(left, right) {
  const canonicalLeft = canonicalFilesystemPath(left);
  const canonicalRight = canonicalFilesystemPath(right);
  return isInside(canonicalLeft, canonicalRight) || isInside(canonicalRight, canonicalLeft);
}

function assertRegularFile(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label} is missing`);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isFile()) throw new Error(`${label} must be a regular file`);
}

function assertRealDirectory(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label} is missing`);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isDirectory()) throw new Error(`${label} must be a directory`);
  return realpathSync(path);
}

function assertPortableRelativePath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 240
    || value.includes("\\")
    || value.includes(":")
    || value.includes("\0")
    || posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || /^(?:\\\\[?.]\\|[A-Za-z]:[\\/])/u.test(value)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || posix.normalize(value) !== value
  ) {
    throw new Error(`${label} must be a portable normalized relative path without escape segments`);
  }
  return value;
}

function assertPathInsideRootWithoutSymlinks(root, path, label) {
  const canonicalRoot = realpathSync(root);
  const relativePath = relative(root, path).split(sep).join("/");
  assertPortableRelativePath(relativePath, label);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) throw new Error(`${label} is missing`);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink`);
  }
  if (!isInside(canonicalRoot, realpathSync(path))) throw new Error(`${label} escapes the private evaluator root`);
  return relativePath;
}

function readJsonArtifact(path, label, { publicArtifact = false } = {}) {
  assertRegularFile(path, label);
  const byteLimit = publicArtifact ? MAX_PUBLIC_ARTIFACT_BYTES : MAX_JSON_ARTIFACT_BYTES;
  if (lstatSync(path).size > byteLimit) throw new Error(`${label} exceeds the raw JSON size limit`);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`${label} could not be read`);
  }
  if (bytes.length > byteLimit) throw new Error(`${label} exceeds the raw JSON size limit`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  assertNoDuplicateJsonObjectKeys(bytes.toString("utf8"), label);
  return { bytes, value };
}

function assertNoDuplicateJsonObjectKeys(source, label) {
  let offset = 0;
  const whitespace = /\s/u;

  function skipWhitespace() {
    while (whitespace.test(source[offset] ?? "")) offset += 1;
  }

  function parseString() {
    const start = offset;
    if (source[offset] !== '"') throw new Error(`${label} has an invalid JSON string`);
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === "\\") {
        offset += 2;
        continue;
      }
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      offset += 1;
    }
    throw new Error(`${label} has an unterminated JSON string`);
  }

  function parseValue() {
    skipWhitespace();
    if (source[offset] === "{") return parseObject();
    if (source[offset] === "[") return parseArray();
    if (source[offset] === '"') {
      parseString();
      return;
    }
    while (offset < source.length && !/[\s,\]}]/u.test(source[offset])) offset += 1;
  }

  function parseObject() {
    offset += 1;
    const keys = new Set();
    skipWhitespace();
    if (source[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) throw new Error(`${label} contains a duplicate JSON object key`);
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") throw new Error(`${label} has invalid JSON object syntax`);
      offset += 1;
      parseValue();
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") throw new Error(`${label} has invalid JSON object syntax`);
      offset += 1;
    }
  }

  function parseArray() {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "]") {
      offset += 1;
      return;
    }
    while (offset < source.length) {
      parseValue();
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") throw new Error(`${label} has invalid JSON array syntax`);
      offset += 1;
    }
  }

  parseValue();
  skipWhitespace();
  if (offset !== source.length) throw new Error(`${label} contains trailing JSON content`);
}

function rawByteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function checkedInBytes(root, relativePath) {
  try {
    const repositoryTop = realpathSync(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim());
    if (repositoryTop !== root) return null;
    return execFileSync("git", ["-C", root, "show", `HEAD:${relativePath}`], { encoding: null, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function resolveAuthorityArtifactPath(authorityRoot, relativePath, label) {
  assertPortableRelativePath(relativePath, `${label} path`);
  const absolutePath = resolve(authorityRoot, relativePath);
  if (!isInside(authorityRoot, absolutePath)) throw new Error(`${label} path escapes the authority root`);
  let current = authorityRoot;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) throw new Error(`${label} is missing`);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} path must not traverse a symlink`);
  }
  if (!lstatSync(absolutePath).isFile()) throw new Error(`${label} must be a regular file`);
  if (!isInside(authorityRoot, realpathSync(absolutePath))) throw new Error(`${label} path escapes the authority root`);
  return absolutePath;
}

function authorityRelativePathForSupplied(authorityRoot, suppliedPath, label) {
  if (!suppliedPath) throw new Error(`${label} path is required for scoring input authority closure`);
  const relativePath = relative(authorityRoot, resolve(suppliedPath)).split(sep).join("/");
  assertPortableRelativePath(relativePath, `${label} path`);
  const authoritativePath = resolveAuthorityArtifactPath(authorityRoot, relativePath, label);
  if (resolve(suppliedPath) !== authoritativePath) throw new Error(`${label} supplied path does not match its authority path`);
  return { authoritativePath, relativePath };
}

function readAnchoredFreezeManifest({ root, freezeManifestPath, freezeManifestSourceDigest }) {
  const authorityRoot = assertRealDirectory(root, "scoring input authority root");
  const { authoritativePath, relativePath } = authorityRelativePathForSupplied(authorityRoot, freezeManifestPath, "scoring input freeze manifest");
  const source = readJsonArtifact(authoritativePath, "scoring input freeze manifest", { publicArtifact: true });
  const sourceDigest = rawByteDigest(source.bytes);
  const committed = checkedInBytes(authorityRoot, relativePath);
  const matchesCheckedInBytes = committed !== null && Buffer.compare(source.bytes, committed) === 0;
  if (!matchesCheckedInBytes) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(freezeManifestSourceDigest ?? "")) {
      throw new Error("scoring input freeze manifest requires checked-in bytes or an explicitly approved immutable source digest");
    }
    if (freezeManifestSourceDigest !== sourceDigest) throw new Error("scoring input freeze manifest raw-byte digest does not match the approved immutable source digest");
  }
  assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH), label: "scoring input freeze manifest" });
  assertPublicArtifactTree(source.value, "scoring input freeze manifest");
  if (source.value.manifest_digest !== computeScoringInputFreezeManifestDigest(source.value)) throw new Error("scoring input freeze manifest digest closure is invalid");
  return { authorityRoot, manifest: source.value, manifestPath: authoritativePath, manifestRelativePath: relativePath, sourceDigest };
}

function readFrozenJsonArtifact({ authorityRoot, root, reference, suppliedPath, schemaPath, label, publicArtifact = false }) {
  const authoritativePath = resolveAuthorityArtifactPath(authorityRoot, reference.path, label);
  if (!suppliedPath || resolve(suppliedPath) !== authoritativePath) throw new Error(`${label} supplied path does not match the freeze manifest authority path`);
  const source = readJsonArtifact(authoritativePath, label, { publicArtifact });
  if (rawByteDigest(source.bytes) !== reference.raw_byte_digest) throw new Error(`${label} raw-byte digest does not match the scoring input freeze manifest`);
  assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, schemaPath), label });
  if (publicArtifact) assertPublicArtifactTree(source.value, label);
  return { ...source, absolutePath: authoritativePath };
}

function looksLikePrivatePathOrUri(value) {
  return posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || /^(?:\\\\[?.]\\|[A-Za-z]:[\\/])/u.test(value)
    || value.includes("\\")
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value);
}

function assertPublicArtifactTree(value, label, path = "$", depth = 0) {
  if (depth > 12) throw new Error(`${label} exceeds the public structure depth limit`);
  if (typeof value === "string") {
    if (value.length > 256) throw new Error(`${label} contains oversized raw text at ${path}`);
    if (looksLikePrivatePathOrUri(value)) throw new Error(`${label} contains a private path or storage URI at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertPublicArtifactTree(value[index], label, `${path}[${index}]`, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PUBLIC_FORBIDDEN_FIELDS.has(key.toLowerCase())) throw new Error(`${label} contains prohibited answer-bearing or private field ${key}`);
    assertPublicArtifactTree(child, label, `${path}.${key}`, depth + 1);
  }
}

function directoryFileInventory(root, label) {
  const files = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`${label} contains a symlink`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.set(path, absolute);
      else throw new Error(`${label} contains a non-regular entry`);
      if (files.size > MAX_BOUNDARY_FILES) throw new Error(`${label} exceeds the boundary inspection file-count limit`);
    }
  }
  walk(root);
  return files;
}

function managedRepositoryInventory(root) {
  const canonicalRoot = assertRealDirectory(root, "repository root");
  let repositoryTop;
  let output;
  try {
    repositoryTop = realpathSync(execFileSync("git", ["-C", canonicalRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim());
    output = execFileSync("git", ["-C", canonicalRoot, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error("repository root must be a readable Git worktree root");
  }
  if (repositoryTop !== canonicalRoot) throw new Error("repository root must be the Git worktree root");
  const paths = output.split("\0").filter(Boolean);
  if (paths.length > MAX_BOUNDARY_FILES) throw new Error("managed repository exceeds the boundary inspection file-count limit");
  const files = new Map();
  for (const path of paths) {
    assertPortableRelativePath(path, "managed repository path");
    const absolute = resolve(canonicalRoot, path);
    if (!isInside(canonicalRoot, absolute)) throw new Error("managed repository path escapes the repository root");
    assertRegularFile(absolute, `managed repository file ${path}`);
    files.set(path, absolute);
  }
  return files;
}

function assertNoPrivateMaterial(files, label, privateMaterialDigests) {
  const budget = createScanBudget(label);
  for (const [path, absolute] of files) {
    const evidence = streamingFileDigest(absolute, `${label} file ${path}`, budget);
    if (privateMaterialDigests.has(evidence.digest)) {
      throw new Error(`${label} contains byte-identical private evaluator material: ${path}`);
    }
  }
}

function assertUniqueValues(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

export function computeEvaluatorBundleId(manifest) {
  const identity = {
    schema_version: manifest.schema_version,
    schema_path: manifest.schema_path,
    fixture_identity: manifest.fixture_identity,
    input_identity: manifest.input_identity,
    asset_inventory: manifest.asset_inventory,
  };
  return `evaluator-${canonicalDigest(identity).slice("sha256:".length)}`;
}

export function computeEvaluatorBundleDigest(manifest) {
  const { evaluator_bundle_digest: _digest, ...closure } = manifest;
  return canonicalDigest(closure);
}

export function computeEvaluatorReferenceDigest(reference) {
  const { public_metadata_digest: _digest, ...metadata } = reference;
  return canonicalDigest(metadata);
}

export function computeEvaluationId(result) {
  return `evaluation-${canonicalDigest({
    scoring_input_freeze_manifest_source_digest: result.scoring_input_freeze_manifest_source_digest,
    scoring_input_freeze_manifest_digest: result.scoring_input_freeze_manifest_digest,
    catalog_digest: result.catalog_digest,
    policy_manifest_digest: result.policy_manifest_digest,
    scoring_policy_digest: result.scoring_policy_digest,
    admission_record_digest: result.admission_record_digest,
    requirement_record_digest: result.requirement_record_digest,
    requirement_set_digest: result.requirement_set_digest,
    output_contract_digest: result.output_contract_digest,
    evaluator_public_reference_digest: result.evaluator_public_reference_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    evaluator_bundle_id: result.evaluator_bundle_id,
    evaluator_bundle_digest: result.evaluator_bundle_digest,
    evaluator_revision: result.evaluator_revision,
  }).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computeEvaluationDigest(result) {
  const { evaluation_digest: _digest, ...closure } = result;
  return canonicalDigest(closure);
}

function assertPrivateBoundary({ root, privateRoot, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot = null }) {
  const canonicalPrivateRoot = assertRealDirectory(privateRoot, "private evaluator root");
  const boundaries = [
    ["root", root, "repository root", "repository"],
    ["materializedPath", materializedPath, "materialized root", "materialized root"],
    ["selectionState", selectionState, "selection-state root", "selection-state root"],
    ["runDir", runDir, "execution run root", "execution run root"],
    ["normalizedResultsPath", normalizedResultsPath, "normalized-results root", "normalized-results root"],
    ...(publicArtifactRoot ? [["publicArtifactRoot", publicArtifactRoot, "public artifact root", "public artifact root"]] : []),
  ];
  const canonicalRoots = {};
  for (const [key, path, label, overlapLabel] of boundaries) {
    if (!path) throw new Error(`${label} is required to prove evaluator root isolation`);
    const canonical = assertRealDirectory(path, label);
    if (isInside(canonicalPrivateRoot, canonical) || isInside(canonical, canonicalPrivateRoot)) {
      throw new Error(`private evaluator root must not overlap the ${overlapLabel}`);
    }
    canonicalRoots[key] = canonical;
  }
  const markerPaths = {};
  for (const [key, label, marker] of BOUNDARY_MARKERS) {
    const markerPath = resolve(canonicalRoots[key], marker);
    assertRegularFile(markerPath, `${label} marker ${marker}`);
    markerPaths[key] = markerPath;
  }
  return { canonicalPrivateRoot, canonicalRoots, markerPaths };
}

export function verifyPublicEvaluatorReference({ root, referencePath, privateRoot = null }) {
  const { value: reference } = readJsonArtifact(referencePath, "public evaluator reference", { publicArtifact: true });
  assertBenchmarkSchemaInstance(reference, { schemaPath: resolve(root, EVALUATOR_REFERENCE_SCHEMA_PATH), label: "public evaluator reference" });
  assertPublicArtifactTree(reference, "public evaluator reference");
  if (reference.public_metadata_digest !== computeEvaluatorReferenceDigest(reference)) throw new Error("public evaluator reference deterministic identity is invalid");
  if (privateRoot && pathsOverlap(referencePath, privateRoot)) throw new Error("public evaluator reference must not overlap the private evaluator root");
  return reference;
}

function assertReferenceMatchesBundle(reference, manifest) {
  const expected = {
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_bundle_schema_version: manifest.schema_version,
    fixture_id: manifest.fixture_identity.fixture_id,
    fixture_input_digest: manifest.input_identity.fixture_input_digest,
    task_class: manifest.fixture_identity.task_class,
    suite: manifest.fixture_identity.suite,
    evaluator_revision: manifest.evaluator_revision,
    generator_identity: canonicalDigest(manifest.generator),
    independence_statement_digest: manifest.independence.statement_digest,
    review_record_digest: manifest.review.record_digest,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (reference[field] !== value) throw new Error(`public/private evaluator identity mismatch at ${field}`);
  }
}

export function verifyPrivateEvaluatorBundle({
  root,
  referencePath,
  privateRoot,
  manifestPath,
  materializedPath,
  selectionState,
  runDir,
  normalizedResultsPath,
  publicArtifactRoot = null,
}) {
  const boundary = assertPrivateBoundary({ root, privateRoot, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot });
  const { canonicalPrivateRoot } = boundary;
  if (!manifestPath || !isInside(privateRoot, manifestPath)) throw new Error("private evaluator manifest must stay inside the private evaluator root");
  const manifestRelativePath = assertPathInsideRootWithoutSymlinks(privateRoot, manifestPath, "private evaluator manifest");
  const { value: manifest } = readJsonArtifact(manifestPath, "private evaluator manifest");
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH), label: "private evaluator manifest" });

  const sortedAssets = [...manifest.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (stableCanonicalJson(manifest.asset_inventory) !== stableCanonicalJson(sortedAssets)) throw new Error("private evaluator asset inventory must be deterministically ordered by role and path");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.role), "private evaluator asset role inventory");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.path), "private evaluator asset path inventory");

  const files = directoryFileInventory(privateRoot, "private evaluator inventory");
  const privateBudget = createScanBudget("private evaluator bundle");
  const manifestEvidence = streamingFileDigest(manifestPath, "private evaluator manifest", privateBudget);
  const privateMaterialDigests = new Set([manifestEvidence.digest]);
  const expectedPaths = [manifestRelativePath];
  for (const asset of manifest.asset_inventory) {
    assertPortableRelativePath(asset.path, `private evaluator ${asset.role} asset path`);
    if (asset.path === manifestRelativePath) throw new Error("private evaluator manifest must not also be an asset");
    const assetPath = resolve(privateRoot, asset.path);
    assertPathInsideRootWithoutSymlinks(privateRoot, assetPath, `private evaluator ${asset.role} asset`);
    const assetFile = files.get(asset.path);
    if (!assetFile) throw new Error(`private evaluator required asset is missing for role ${asset.role}`);
    const evidence = streamingFileDigest(assetFile, `private evaluator ${asset.role} asset`, privateBudget);
    if (asset.sha256 !== evidence.digest) throw new Error(`private evaluator asset digest is invalid for role ${asset.role}`);
    if (asset.bytes !== evidence.bytes) throw new Error(`private evaluator asset byte count is invalid for role ${asset.role}`);
    privateMaterialDigests.add(evidence.digest);
    expectedPaths.push(asset.path);
  }
  if (stableCanonicalJson([...files.keys()].sort()) !== stableCanonicalJson(expectedPaths.sort())) throw new Error("private evaluator root has an unexpected or unmanaged inventory entry");
  if (manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest)) throw new Error("private evaluator bundle ID is invalid");
  if (manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) throw new Error("private evaluator bundle digest closure is invalid");

  const reference = verifyPublicEvaluatorReference({ root, referencePath, privateRoot: canonicalPrivateRoot });
  assertReferenceMatchesBundle(reference, manifest);
  const bundle = { ...boundary, files, manifest, manifestEvidence, manifestRelativePath, privateMaterialDigests, reference };
  assertNoPrivateMaterial(managedRepositoryInventory(boundary.canonicalRoots.root), "managed repository", privateMaterialDigests);
  for (const [key, label] of [
    ["materializedPath", "materialized root"],
    ["selectionState", "selection-state root"],
    ["runDir", "execution run root"],
    ["normalizedResultsPath", "normalized-results root"],
    ...(publicArtifactRoot ? [["publicArtifactRoot", "public artifact root"]] : []),
  ]) {
    assertNoPrivateMaterial(directoryFileInventory(boundary.canonicalRoots[key], label), label, privateMaterialDigests);
  }
  return bundle;
}

function assertResultCollectionIdentity(result) {
  if (result.evaluation_id !== computeEvaluationId(result)) throw new Error("evaluator result evaluation ID is invalid");
  if (result.evaluation_digest !== computeEvaluationDigest(result)) throw new Error("evaluator result digest closure is invalid");
  const notes = result.evaluator_notes_state;
  if (notes.state === "not_recorded" && (notes.digest !== null || notes.bytes !== null)) throw new Error("unrecorded evaluator notes must not retain digest or byte metadata");
  if (notes.state === "digested" && (notes.digest === null || notes.bytes === null)) throw new Error("digested evaluator notes require digest and byte metadata");
  if ((notes.digest === null) !== (notes.bytes === null)) throw new Error("evaluator note digest and byte metadata must be paired");
  assertUniqueValues([...result.findings, ...result.false_positives, ...result.scope_deviations].map((entry) => entry.finding_id), "evaluator finding identity");
  assertUniqueValues([...result.required_mechanisms, ...result.unnecessary_mechanisms].map((entry) => entry.mechanism_id), "evaluator mechanism identity");
  assertUniqueValues(result.unsafe_attempted_actions.map((entry) => entry.action_id), "unsafe attempted action identity");
  const evidenceReferences = [];
  function collect(value) {
    if (Array.isArray(value)) for (const entry of value) collect(entry);
    else if (value && typeof value === "object") {
      if (value.kind && value.digest && Object.hasOwn(value, "bytes")) evidenceReferences.push(value);
      else for (const child of Object.values(value)) collect(child);
    }
  }
  collect(result);
  for (const reference of evidenceReferences.filter((entry) => entry.kind === "normalized_result")) {
    if (reference.digest !== result.normalized_result_digest) throw new Error("evaluator result contains a mismatched normalized-result evidence reference");
  }
}

export function validateExecutionEventEvidenceReferences({ normalized, result }) {
  const executionReferences = [];
  function collect(value) {
    if (Array.isArray(value)) for (const entry of value) collect(entry);
    else if (value && typeof value === "object") {
      if (value.kind === "execution_event" && value.digest && Object.hasOwn(value, "bytes")) executionReferences.push(value);
      else for (const child of Object.values(value)) collect(child);
    }
  }
  collect(result);
  const verified = new Map(normalized.command_evidence.references.map((entry) => [entry.digest, entry]));
  for (const reference of executionReferences) {
    const item = verified.get(reference.digest);
    if (!item || item.bytes !== reference.bytes) throw new Error("evaluator result contains an unverified or transplanted execution-event reference");
  }
  const requiredGroups = normalized.command_evidence.required_alternative_groups ?? [];
  if ((normalized.command_evidence.required_command_ids.length > 0 || requiredGroups.length > 0) && result.verification_correctness.state === "pass") {
    if (executionReferences.length === 0) throw new Error("verification correctness cannot pass without verified execution-event evidence");
    const successes = new Set(normalized.command_evidence.succeeded_command_ids);
    if (normalized.command_evidence.required_command_ids.some((id) => !successes.has(id))) throw new Error("verification correctness cannot pass while required command evidence is absent or unsuccessful");
    if (requiredGroups.some(({ satisfaction_state: state }) => state !== "satisfied")) throw new Error("verification correctness cannot pass while a required alternative command group is unsatisfied");
  }
  return structuredClone(executionReferences);
}

function readNormalizedRecord({ verified, result }) {
  const normalizedReference = verified.manifest.cases
    .flatMap((entry) => entry.normalized_attempts)
    .find((entry) => entry.normalized_result_id === result.normalized_result_id);
  if (!normalizedReference) throw new Error("evaluator result references a normalized result absent from the verified generation");
  const path = resolve(verified.generationPath, normalizedReference.path);
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (record.normalized_result_digest !== result.normalized_result_digest) throw new Error("evaluator result normalized result digest is inconsistent");
  return record;
}

function readScoringInputSources({
  root,
  catalogPath,
  policyManifestPath,
  scoringPolicyPath,
  admissionRecordPath,
  requirementRecordPath,
  outputContractPath,
  referencePath,
  freezeManifestPath,
  freezeManifestSourceDigest,
}) {
  for (const [path, label] of [
    [catalogPath, "portfolio catalog"],
    [policyManifestPath, "portfolio policy manifest"],
    [scoringPolicyPath, "portfolio scoring policy"],
    [admissionRecordPath, "authoritative final admission record"],
    [requirementRecordPath, "authoritative requirement record"],
    [outputContractPath, "authoritative output contract"],
    [referencePath, "authoritative evaluator public reference"],
    [freezeManifestPath, "scoring input freeze manifest"],
  ]) {
    if (!path) throw new Error(`${label} path is required for scoring input closure`);
  }
  const freeze = readAnchoredFreezeManifest({ root, freezeManifestPath, freezeManifestSourceDigest });
  const { authorityRoot, manifest: freezeManifest } = freeze;
  const catalogSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.catalog, suppliedPath: catalogPath, schemaPath: CATALOG_SCHEMA_PATH, label: "portfolio catalog" });
  const policyManifestSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.policy_manifest, suppliedPath: policyManifestPath, schemaPath: POLICY_MANIFEST_SCHEMA_PATH, label: "portfolio policy manifest" });
  const scoringPolicySource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.scoring_policy, suppliedPath: scoringPolicyPath, schemaPath: SCORING_POLICY_SCHEMA_PATH, label: "portfolio scoring policy" });
  const admissionRecordSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.admission_record, suppliedPath: admissionRecordPath, schemaPath: FINAL_ADMISSION_RECORD_SCHEMA_PATH, label: "authoritative final admission record", publicArtifact: true });
  const requirementRecordSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.requirement_record, suppliedPath: requirementRecordPath, schemaPath: REQUIREMENT_RECORD_SCHEMA_PATH, label: "authoritative requirement record", publicArtifact: true });
  const outputContractSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.output_contract, suppliedPath: outputContractPath, schemaPath: OUTPUT_CONTRACT_SCHEMA_PATH, label: "authoritative output contract", publicArtifact: true });
  const evaluatorReferenceSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.evaluator_public_reference, suppliedPath: referencePath, schemaPath: EVALUATOR_REFERENCE_SCHEMA_PATH, label: "authoritative evaluator public reference", publicArtifact: true });
  const catalog = catalogSource.value;
  const policyManifest = policyManifestSource.value;
  const scoringPolicy = scoringPolicySource.value;
  const admissionRecord = admissionRecordSource.value;
  const requirementRecord = requirementRecordSource.value;
  const outputContract = outputContractSource.value;
  const evaluatorReference = evaluatorReferenceSource.value;
  const requirementRecordSchema = readJsonArtifact(resolve(root, REQUIREMENT_RECORD_SCHEMA_PATH), "requirement record Schema").value;
  const evaluatorResultSchema = readJsonArtifact(resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), "evaluator result Schema").value;
  const admissionPolicy = readJsonArtifact(resolve(root, ADMISSION_POLICY_PATH), "portfolio admission policy").value;
  assertBenchmarkSchemaInstance(admissionPolicy, { schemaPath: resolve(root, ADMISSION_POLICY_SCHEMA_PATH), label: "portfolio admission policy" });

  validatePortfolioPolicyArtifacts({ root, catalogPath, policyManifestPath, scoringPolicyPath });
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog)) throw new Error("portfolio catalog digest closure is invalid");
  if (freezeManifest.catalog.semantic_digest !== catalog.catalog_digest) throw new Error("portfolio catalog semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.policy_manifest.semantic_digest !== computePolicyManifestDigest(policyManifest)) throw new Error("portfolio policy manifest semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.scoring_policy.semantic_digest !== computeScoringPolicyDigest(scoringPolicy)) throw new Error("portfolio scoring policy semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.admission_record.semantic_digest !== computeFinalAdmissionRecordDigest(admissionRecord)) throw new Error("final admission record semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.requirement_record.record_digest !== computeRequirementRecordDigest(requirementRecord) || freezeManifest.requirement_record.set_digest !== computeRequirementSetDigest(requirementRecord)) throw new Error("requirement record digest closure does not match the scoring input freeze manifest");
  if (freezeManifest.output_contract.semantic_digest !== computeOutputContractDigest(outputContract)) throw new Error("output contract semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.evaluator_public_reference.semantic_digest !== computeEvaluatorReferenceDigest(evaluatorReference)) throw new Error("evaluator public reference semantic digest does not match the scoring input freeze manifest");
  validateScoringContractSchemaParity({ scoringPolicy, requirementRecordSchema, evaluatorResultSchema });
  validateFinalAdmissionRecordContract({
    admissionPolicy,
    admissionRecord,
    finalAdmissionRecordSchema: readJsonArtifact(resolve(root, FINAL_ADMISSION_RECORD_SCHEMA_PATH), "final admission record Schema").value,
  });
  validateRequirementRecordContract({ scoringPolicy, requirementRecord, requirementRecordSchema, evaluatorResultSchema });
  if (policyManifest.scoring_policy?.path !== freezeManifest.scoring_policy.path) throw new Error("policy manifest scoring policy path does not match the freeze manifest authority path");
  if (requirementRecord.requirement_record_path !== freezeManifest.requirement_record.path) throw new Error("requirement record internal path does not match the freeze manifest authority path");
  if (outputContract.output_contract_path !== freezeManifest.output_contract.path) throw new Error("output contract internal path does not match the freeze manifest authority path");
  if (outputContract.evaluator_public_reference_path !== freezeManifest.evaluator_public_reference.path) throw new Error("output contract evaluator reference path does not match the freeze manifest authority path");
  const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === freezeManifest.fixture_id);
  if (!fixture) throw new Error("scoring input freeze fixture is absent from the authoritative catalog");
  if ([admissionRecord.fixture_id, requirementRecord.fixture_id, outputContract.fixture_id, evaluatorReference.fixture_id].some((fixtureId) => fixtureId !== freezeManifest.fixture_id)) throw new Error("scoring input freeze fixture identity does not close across authoritative artifacts");
  if (admissionRecord.input_manifest_digest !== freezeManifest.fixture_input_digest || evaluatorReference.fixture_input_digest !== freezeManifest.fixture_input_digest) throw new Error("scoring input freeze fixture input digest does not close across authoritative artifacts");
  if (admissionRecord.catalog_digest !== catalog.catalog_digest) throw new Error("final admission record catalog digest does not match the freeze authority catalog");
  if (admissionRecord.evaluator_bundle_id !== evaluatorReference.evaluator_bundle_id || admissionRecord.evaluator_bundle_digest !== evaluatorReference.evaluator_bundle_digest) throw new Error("final admission record evaluator identity does not match the authoritative public reference");
  if (admissionRecord.evaluator_requirement_count !== requirementRecord.requirements.length) throw new Error("final admission record requirement count does not match the authoritative requirement record");
  const expectedEvidenceMapIds = requirementRecord.requirements.flatMap(({ evidence_map_ids }) => evidence_map_ids).sort();
  const expectedMutationSetIds = requirementRecord.requirements.flatMap(({ mutation_ids }) => mutation_ids).sort();
  if (stableCanonicalJson([...admissionRecord.evidence_map_ids].sort()) !== stableCanonicalJson(expectedEvidenceMapIds)) throw new Error("final admission evidence-map inventory does not match the authoritative requirement record");
  if (stableCanonicalJson([...admissionRecord.mutation_set_ids].sort()) !== stableCanonicalJson(expectedMutationSetIds)) throw new Error("final admission mutation-set inventory does not match the authoritative requirement record");
  if (requirementRecord.admission_record_digest !== admissionRecord.admission_digest) throw new Error("requirement record admission digest was not re-derived from the authoritative final admission record");
  return { freezeManifest, freezeManifestSourceDigest: freeze.sourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference };
}

function assertBoundaryRootLineage(bundle, verified) {
  const source = verified.manifest.source;
  const materializedPath = bundle.markerPaths.materializedPath;
  const selectionStatePath = bundle.markerPaths.selectionState;
  const runIdentityPath = bundle.markerPaths.runDir;
  readJsonArtifact(materializedPath, "materialized root manifest");
  readJsonArtifact(selectionStatePath, "selection-state root index");
  const materializedEvidence = streamingFileDigest(materializedPath, "materialized root manifest");
  const selectionEvidence = streamingFileDigest(selectionStatePath, "selection-state root index");
  if (materializedEvidence.digest !== source.materialization_manifest_digest) {
    throw new Error("materialized root manifest does not match normalized result lineage");
  }
  if (selectionEvidence.digest !== source.selection_state_digest) {
    throw new Error("selection-state root index does not match normalized result lineage");
  }
  const { value: runIdentity } = readJsonArtifact(runIdentityPath, "execution run identity");
  if (canonicalDigest(runIdentity) !== source.run_identity_digest || runIdentity.run_instance_id !== source.run_instance_id) {
    throw new Error("execution run root identity does not match normalized result lineage");
  }
  if (!isInside(bundle.canonicalRoots.normalizedResultsPath, verified.generationPath)) {
    throw new Error("normalized generation escapes the normalized-results root");
  }
}

export function verifyEvaluatorResult({
  root,
  catalogPath,
  policyManifestPath,
  scoringPolicyPath,
  admissionRecordPath,
  requirementRecordPath,
  outputContractPath,
  scoringInputFreezeManifestPath,
  scoringInputFreezeManifestSourceDigest = null,
  referencePath,
  privateRoot,
  manifestPath,
  resultPath,
  materializedPath,
  selectionState,
  runDir,
  normalizedResultsPath,
  publicArtifactRoot = null,
}) {
  const bundle = verifyPrivateEvaluatorBundle({ root, referencePath, privateRoot, manifestPath, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot });
  if (!resultPath || pathsOverlap(resultPath, privateRoot)) throw new Error("public evaluator result must not overlap the private evaluator root");
  const { value: result } = readJsonArtifact(resultPath, "evaluator result envelope", { publicArtifact: true });
  assertBenchmarkSchemaInstance(result, { schemaPath: resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), label: "evaluator result envelope" });
  assertPublicArtifactTree(result, "evaluator result envelope");
  assertResultCollectionIdentity(result);
  const scoringInputs = readScoringInputSources({
    root,
    catalogPath,
    policyManifestPath,
    scoringPolicyPath,
    admissionRecordPath,
    requirementRecordPath,
    outputContractPath,
    referencePath,
    freezeManifestPath: scoringInputFreezeManifestPath,
    freezeManifestSourceDigest: scoringInputFreezeManifestSourceDigest,
  });
  if (stableCanonicalJson(scoringInputs.evaluatorReference) !== stableCanonicalJson(bundle.reference)) throw new Error("private bundle evaluator reference does not match the scoring input freeze authority reference");

  const verified = verifyNormalizedPortfolioResults({
    root,
    outputPath: normalizedResultsPath,
    sourceSnapshotDigest: result.source_snapshot_digest,
  });
  if (result.source_snapshot_digest !== verified.manifest.source_snapshot_digest) throw new Error("evaluator result source snapshot lineage is inconsistent");
  assertBoundaryRootLineage(bundle, verified);
  const normalized = readNormalizedRecord({ verified, result });
  validateExecutionEventEvidenceReferences({ normalized, result });
  const lineage = normalized.lineage;
  const expectedLineage = {
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    plan_id: lineage.plan_id,
    plan_digest: lineage.plan_digest,
    fixture_id: lineage.fixture_id,
    fixture_input_digest: lineage.fixture_input_digest,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    adapter: lineage.adapter_track,
    condition: lineage.condition,
    repetition: lineage.repetition,
    evaluator_bundle_id: bundle.manifest.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.manifest.evaluator_bundle_digest,
    evaluator_revision: bundle.manifest.evaluator_revision,
  };
  for (const [field, value] of Object.entries(expectedLineage)) {
    if (result[field] !== value) throw new Error(`evaluator result lineage mismatch at ${field}`);
  }
  if (bundle.reference.fixture_id !== lineage.fixture_id || bundle.reference.fixture_input_digest !== lineage.fixture_input_digest || bundle.reference.task_class !== lineage.task_class || bundle.reference.suite !== lineage.suite) {
    throw new Error("evaluator reference is transplanted across normalized fixture or input identity");
  }
  const scoring = validateScoringInputBindings({
    ...scoringInputs,
    normalizedResult: normalized,
    evaluatorResult: result,
  });
  return { bundle, normalized, result, verified, scoringInputs, scoringReady: scoring.scoringReady };
}

export function assertNoPrivateBundlePublication(publicArtifactRoot, bundle) {
  const canonicalPublicRoot = assertRealDirectory(publicArtifactRoot, "public artifact root");
  if (isInside(canonicalPublicRoot, bundle.canonicalPrivateRoot) || isInside(bundle.canonicalPrivateRoot, canonicalPublicRoot)) {
    throw new Error("public artifact root must not overlap the private evaluator root");
  }
  assertNoPrivateMaterial(directoryFileInventory(canonicalPublicRoot, "public artifact root"), "public artifact root", bundle.privateMaterialDigests);
}

export function verifyEvaluatorBoundary(options) {
  if (!options.publicArtifactRoot) throw new Error("full evaluator boundary verification requires a public artifact root");
  return verifyEvaluatorResult(options);
}

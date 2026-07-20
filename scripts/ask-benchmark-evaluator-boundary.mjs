import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { posix, relative, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";

export const EVALUATOR_REFERENCE_SCHEMA_PATH = "benchmarks/schemas/evaluator-reference.schema.json";
export const PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-bundle.schema.json";
export const EVALUATOR_RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";

const MAX_PUBLIC_ARTIFACT_BYTES = 1024 * 1024;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`${label} could not be read`);
  }
  if (publicArtifact && bytes.length > MAX_PUBLIC_ARTIFACT_BYTES) throw new Error(`${label} exceeds the public raw-text size limit`);
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

function privateTreeFiles(root) {
  const files = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error("private evaluator inventory contains a symlink");
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.set(path, readFileSync(absolute));
      else throw new Error("private evaluator inventory contains a non-regular entry");
    }
  }
  walk(root);
  return files;
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
    [root, "repository"],
    [materializedPath, "materialized root"],
    [selectionState, "selection-state root"],
    [runDir, "execution run root"],
    [normalizedResultsPath, "normalized-results root"],
    ...(publicArtifactRoot ? [[publicArtifactRoot, "public artifact root"]] : []),
  ];
  for (const [path, label] of boundaries) {
    if (!path) throw new Error(`${label} is required to prove evaluator root isolation`);
    if (pathsOverlap(canonicalPrivateRoot, path)) throw new Error(`private evaluator root must not overlap the ${label}`);
  }
  return canonicalPrivateRoot;
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
  const canonicalPrivateRoot = assertPrivateBoundary({ root, privateRoot, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot });
  if (!manifestPath || !isInside(privateRoot, manifestPath)) throw new Error("private evaluator manifest must stay inside the private evaluator root");
  const manifestRelativePath = assertPathInsideRootWithoutSymlinks(privateRoot, manifestPath, "private evaluator manifest");
  const { bytes: manifestBytes, value: manifest } = readJsonArtifact(manifestPath, "private evaluator manifest");
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH), label: "private evaluator manifest" });

  const sortedAssets = [...manifest.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (stableCanonicalJson(manifest.asset_inventory) !== stableCanonicalJson(sortedAssets)) throw new Error("private evaluator asset inventory must be deterministically ordered by role and path");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.role), "private evaluator asset role inventory");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.path), "private evaluator asset path inventory");

  const files = privateTreeFiles(privateRoot);
  const expectedPaths = [manifestRelativePath];
  for (const asset of manifest.asset_inventory) {
    assertPortableRelativePath(asset.path, `private evaluator ${asset.role} asset path`);
    if (asset.path === manifestRelativePath) throw new Error("private evaluator manifest must not also be an asset");
    const assetPath = resolve(privateRoot, asset.path);
    assertPathInsideRootWithoutSymlinks(privateRoot, assetPath, `private evaluator ${asset.role} asset`);
    const bytes = files.get(asset.path);
    if (!bytes) throw new Error(`private evaluator required asset is missing for role ${asset.role}`);
    if (asset.sha256 !== `sha256:${sha256(bytes)}`) throw new Error(`private evaluator asset digest is invalid for role ${asset.role}`);
    if (asset.bytes !== bytes.length) throw new Error(`private evaluator asset byte count is invalid for role ${asset.role}`);
    expectedPaths.push(asset.path);
  }
  if (stableCanonicalJson([...files.keys()].sort()) !== stableCanonicalJson(expectedPaths.sort())) throw new Error("private evaluator root has an unexpected or unmanaged inventory entry");
  if (manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest)) throw new Error("private evaluator bundle ID is invalid");
  if (manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) throw new Error("private evaluator bundle digest closure is invalid");

  const reference = verifyPublicEvaluatorReference({ root, referencePath, privateRoot: canonicalPrivateRoot });
  assertReferenceMatchesBundle(reference, manifest);
  return { canonicalPrivateRoot, files, manifest, manifestBytes, manifestRelativePath, reference };
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

export function verifyEvaluatorResult({
  root,
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

  const verified = verifyNormalizedPortfolioResults({
    root,
    outputPath: normalizedResultsPath,
    sourceSnapshotDigest: result.source_snapshot_digest,
  });
  if (result.source_snapshot_digest !== verified.manifest.source_snapshot_digest) throw new Error("evaluator result source snapshot lineage is inconsistent");
  const normalized = readNormalizedRecord({ verified, result });
  const lineage = normalized.lineage;
  const expectedLineage = {
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    plan_id: lineage.plan_id,
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
  return { bundle, normalized, result, verified };
}

export function assertNoPrivateBundlePublication(publicArtifactRoot, bundle) {
  assertRealDirectory(publicArtifactRoot, "public artifact root");
  if (pathsOverlap(publicArtifactRoot, bundle.canonicalPrivateRoot)) throw new Error("public artifact root must not overlap the private evaluator root");
  const privateDigests = new Set([
    `sha256:${sha256(bundle.manifestBytes)}`,
    ...bundle.manifest.asset_inventory.map((asset) => asset.sha256),
  ]);
  const publicFiles = privateTreeFiles(publicArtifactRoot);
  for (const bytes of publicFiles.values()) {
    if (privateDigests.has(`sha256:${sha256(bytes)}`)) throw new Error("public artifact contains byte-identical private evaluator material");
    if (bytes.length > MAX_PUBLIC_ARTIFACT_BYTES) continue;
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      if (value?.program === "adaptive_ask_private_evaluator_bundle" || (value?.evaluator_bundle_id === bundle.manifest.evaluator_bundle_id && Array.isArray(value?.asset_inventory))) {
        throw new Error("public artifact contains a private evaluator bundle manifest");
      }
    } catch (error) {
      if (error?.message?.startsWith("public artifact contains")) throw error;
    }
  }
}

export function verifyEvaluatorBoundary(options) {
  const verified = verifyEvaluatorResult(options);
  if (options.publicArtifactRoot) assertNoPrivateBundlePublication(options.publicArtifactRoot, verified.bundle);
  return verified;
}

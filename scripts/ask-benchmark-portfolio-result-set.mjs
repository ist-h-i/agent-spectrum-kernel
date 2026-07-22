import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, assertNoSymlinkPathSegments, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import {
  validateNormalizedPortfolioResult,
  verifyNormalizedPortfolioResults,
} from "./ask-benchmark-normalized-results.mjs";
import { validatePortfolioEngineeringResult } from "./ask-benchmark-portfolio-score.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, assertStableRegularFile, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const ENGINEERING_RESULT_SOURCE_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json";
export const ENGINEERING_RESULT_SET_SCHEMA_PATH = "benchmarks/schemas/portfolio-engineering-result-set.schema.json";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);
const SCORING_STATUSES = Object.freeze(["complete", "not_scoring_ready"]);
const NORMALIZED_OUTCOMES = Object.freeze(["completed", "failed", "unavailable", "interrupted", "invalid"]);
const TERMINAL_CASE_STATUSES = new Set(["completed", "failed", "unavailable", "interrupted", "invalid"]);
const MAX_SOURCE_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_RESULT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_RESULT_FILES = 10_000;
const MAX_RESULT_TOTAL_BYTES = 1024 * 1024 * 1024;
const PRIVATE_EVALUATOR_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
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
    const parent = dirname(current);
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
  ) throw new Error(`${label} must be a portable normalized relative path without escape segments`);
  return value;
}

function assertRealDirectory(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label} is missing`);
  assertNoSymlinkPathSegments(path, label);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isDirectory()) throw new Error(`${label} must be a real directory`);
  return realpathSync(path);
}

function assertRegularFile(path, label) {
  assertStableRegularFile(path, label);
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
}

function checkedInBytes(root, manifestPath) {
  if (!isInside(root, manifestPath)) return null;
  const relativePath = relative(root, manifestPath).split(sep).join("/");
  assertPortableRelativePath(relativePath, "engineering result source manifest repository path");
  try {
    const repositoryTop = realpathSync(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim());
    if (repositoryTop !== realpathSync(root)) return null;
    return execFileSync("git", ["-C", root, "show", `HEAD:${relativePath}`], { encoding: null, maxBuffer: MAX_SOURCE_MANIFEST_BYTES, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export function computeEngineeringResultSourceManifestDigest(value) {
  return canonicalDigest(withoutField(value, "manifest_digest"));
}

export function computeEngineeringResultSetId(value) {
  const identity = {
    source_manifest_raw_byte_digest: value.source_manifest_raw_byte_digest,
    source_manifest_digest: value.source_manifest_digest,
    normalized_generation_id: value.normalized_generation_id,
    normalized_manifest_digest: value.normalized_manifest_digest,
    source_snapshot_digest: value.source_snapshot_digest,
    plan_id: value.plan_id,
    plan_digest: value.plan_digest,
    run_instance_id: value.run_instance_id,
    adapter_track: value.adapter_track,
    source_revision: value.source_revision,
    inventory: value.inventory,
  };
  if (Object.values(identity).some((entry) => entry === undefined)) throw new Error("engineering result set identity inputs are incomplete");
  return `engineering-result-set-${canonicalDigest(identity).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computeEngineeringResultSetDigest(value) {
  return canonicalDigest(withoutField(value, "result_set_digest"));
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function sourceInventoryOrder(inventory) {
  return [...inventory].sort((left, right) => left.path.localeCompare(right.path));
}

export function validateEngineeringResultSourceManifest(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, ENGINEERING_RESULT_SOURCE_MANIFEST_SCHEMA_PATH), label: "engineering result source manifest" });
  for (const entry of value.inventory) assertPortableRelativePath(entry.path, "engineering result source inventory path");
  assertUnique(value.inventory.map(({ path }) => path), "engineering result source path inventory");
  if (stableCanonicalJson(value.inventory) !== stableCanonicalJson(sourceInventoryOrder(value.inventory))) throw new Error("engineering result source inventory must be ordered by portable path");
  if (value.manifest_digest !== computeEngineeringResultSourceManifestDigest(value)) throw new Error("engineering result source manifest semantic digest is invalid");
  return value;
}

function readAnchoredSourceManifest({ root, sourceManifestPath, sourceManifestSourceDigest }) {
  const path = resolve(sourceManifestPath ?? "");
  const source = readStableFile(path, "engineering result source manifest", MAX_SOURCE_MANIFEST_BYTES);
  const committed = checkedInBytes(root, path);
  const checkedIn = committed !== null && Buffer.compare(committed, source.bytes) === 0;
  if (!checkedIn) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(sourceManifestSourceDigest ?? "")) throw new Error("engineering result source manifest requires checked-in bytes or an explicitly approved immutable source digest");
    if (sourceManifestSourceDigest !== source.rawByteDigest) throw new Error("engineering result source manifest raw-byte digest does not match the approved immutable source digest");
  }
  const manifest = validateEngineeringResultSourceManifest(parseJsonBytes(source.bytes, "engineering result source manifest"), { root });
  return { manifest, path, rawByteDigest: source.rawByteDigest, evidence: source, authority: checkedIn ? "checked_in_head" : "approved_immutable_digest" };
}

function scanResultRoot(rootPath) {
  const root = assertRealDirectory(rootPath, "engineering result root");
  const files = new Map();
  let totalBytes = 0;
  function walk(directory, relativeDirectory = "") {
    const before = readdirSync(directory).sort();
    for (const name of before) {
      const absolute = resolve(directory, name);
      const path = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      assertPortableRelativePath(path, "engineering result path");
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`engineering result path must not traverse a symlink: ${path}`);
      if (status.isDirectory()) {
        walk(absolute, path);
        continue;
      }
      if (!status.isFile()) throw new Error(`engineering result root contains a non-regular entry: ${path}`);
      if (!path.endsWith(".json")) throw new Error(`engineering result root contains a non-JSON artifact: ${path}`);
      if (files.size >= MAX_RESULT_FILES) throw new Error("engineering result root exceeds the file-count limit");
      const evidence = readStableFile(absolute, `engineering result ${path}`, MAX_RESULT_FILE_BYTES);
      totalBytes += evidence.bytes.length;
      if (totalBytes > MAX_RESULT_TOTAL_BYTES) throw new Error("engineering result root exceeds the total byte limit");
      files.set(path, { ...evidence, absolutePath: absolute });
    }
    const after = readdirSync(directory).sort();
    if (stableCanonicalJson(after) !== stableCanonicalJson(before)) throw new Error("engineering result root changed during inventory inspection");
  }
  walk(root);
  if (files.size === 0) throw new Error("engineering result root contains no result files");
  return { root, files };
}

function assertSameFileEvidence(before, after) {
  const beforePaths = [...before.files.keys()].sort();
  const afterPaths = [...after.files.keys()].sort();
  if (stableCanonicalJson(beforePaths) !== stableCanonicalJson(afterPaths)) throw new Error("engineering result root file inventory changed during inspection");
  for (const path of beforePaths) {
    const left = before.files.get(path);
    const right = after.files.get(path);
    assertStableFileEvidence(left, right, `engineering result ${path}`);
  }
}

function normalizedAttemptId(value) {
  return `${value.case_id}/${value.attempt}`;
}

function resultOrder(left, right) {
  return left.fixture_id.localeCompare(right.fixture_id)
    || CONDITIONS.indexOf(left.condition) - CONDITIONS.indexOf(right.condition)
    || left.repetition - right.repetition
    || left.case_id.localeCompare(right.case_id)
    || left.attempt.localeCompare(right.attempt)
    || left.normalized_result_id.localeCompare(right.normalized_result_id);
}

function resolveGenerationFile(generationRoot, relativePath, label) {
  assertPortableRelativePath(relativePath, `${label} path`);
  const absolute = resolve(generationRoot, relativePath);
  if (!isInside(generationRoot, absolute)) throw new Error(`${label} escapes the normalized generation`);
  assertRegularFile(absolute, label);
  return absolute;
}

function deriveExpectedNormalizedAttempts({ root, normalizedResultsPath, sourceSnapshotDigest, adapter }) {
  if (!sourceSnapshotDigest) throw new Error("engineering result collection requires --snapshot-digest");
  if (!["codex", "claude"].includes(adapter)) throw new Error("engineering result collection requires one adapter track: codex or claude");
  const verified = verifyNormalizedPortfolioResults({ root, outputPath: normalizedResultsPath, sourceSnapshotDigest });
  const { manifest, generationPath } = verified;
  if (manifest.source_snapshot_digest !== sourceSnapshotDigest) throw new Error("normalized generation source snapshot does not match the requested digest");
  if (manifest.pool_adapter_results !== false) throw new Error("normalized generation permits adapter pooling");
  const selectedCases = manifest.cases.filter(({ adapter_track: track }) => track === adapter);
  if (selectedCases.length === 0) throw new Error(`normalized generation contains no ${adapter} plan cases`);
  const inventoryByPath = new Map(manifest.inventory.map((entry) => [entry.path, entry]));
  const expected = [];
  for (const caseRecord of selectedCases) {
    if (!TERMINAL_CASE_STATUSES.has(caseRecord.status)) throw new Error(`normalized generation is incomplete for ${caseRecord.case_id}: ${caseRecord.status}`);
    if (!caseRecord.terminal_attempt) throw new Error(`normalized generation is missing the terminal attempt for ${caseRecord.case_id}`);
    const references = caseRecord.normalized_attempts.filter(({ attempt }) => attempt === caseRecord.terminal_attempt);
    if (references.length !== 1) throw new Error(`normalized generation must identify exactly one terminal normalized attempt for ${caseRecord.case_id}`);
    const reference = references[0];
    const inventory = inventoryByPath.get(reference.path);
    if (!inventory) throw new Error(`normalized terminal attempt is absent from the normalized manifest inventory: ${reference.path}`);
    const path = resolveGenerationFile(generationPath, reference.path, `normalized terminal attempt ${caseRecord.case_id}/${reference.attempt}`);
    const source = readStableFile(path, `normalized terminal attempt ${caseRecord.case_id}/${reference.attempt}`, MAX_RESULT_FILE_BYTES);
    if (source.rawByteDigest !== inventory.sha256 || source.bytes.length !== inventory.bytes) throw new Error(`normalized terminal attempt bytes drifted at ${reference.path}`);
    const record = validateNormalizedPortfolioResult(parseJsonBytes(source.bytes, `normalized terminal attempt ${caseRecord.case_id}/${reference.attempt}`), { root });
    if (
      record.normalized_result_id !== reference.normalized_result_id
      || record.normalized_result_digest !== reference.normalized_result_digest
      || record.lineage.case_id !== caseRecord.case_id
      || record.lineage.attempt !== caseRecord.terminal_attempt
      || record.lineage.adapter_track !== adapter
      || record.lineage.condition !== caseRecord.condition
      || record.lineage.repetition !== caseRecord.repetition
      || record.lineage.fixture_id !== caseRecord.fixture_id
      || record.lineage.run_instance_id !== manifest.source.run_instance_id
      || record.lineage.plan_id !== manifest.source.plan_id
      || record.lineage.plan_digest !== manifest.source.plan_digest
    ) throw new Error(`normalized terminal attempt lineage is inconsistent for ${caseRecord.case_id}/${reference.attempt}`);
    expected.push({
      case_id: record.lineage.case_id,
      attempt: record.lineage.attempt,
      normalized_result_id: record.normalized_result_id,
      normalized_result_digest: record.normalized_result_digest,
      normalized_outcome: record.outcome,
      source_snapshot_digest: manifest.source_snapshot_digest,
      run_instance_id: record.lineage.run_instance_id,
      plan_id: record.lineage.plan_id,
      plan_digest: record.lineage.plan_digest,
      fixture_id: record.lineage.fixture_id,
      fixture_input_digest: record.lineage.fixture_input_digest,
      suite: record.lineage.suite,
      task_class: record.lineage.task_class,
      condition: record.lineage.condition,
      repetition: record.lineage.repetition,
      registered_repetitions: record.lineage.registered_repetitions,
    });
  }
  assertUnique(expected.map(({ normalized_result_id: id }) => id), "expected normalized result ID inventory");
  assertUnique(expected.map(({ normalized_result_digest: digest }) => digest), "expected normalized result digest inventory");
  assertUnique(expected.map(normalizedAttemptId), "expected normalized attempt inventory");
  assertUnique(expected.map(({ fixture_id: fixture, condition, repetition }) => `${fixture}/${condition}/${repetition}`), "expected fixture-condition-repetition inventory");
  const byFixture = new Map();
  for (const entry of expected) {
    const records = byFixture.get(entry.fixture_id) ?? [];
    records.push(entry);
    byFixture.set(entry.fixture_id, records);
  }
  for (const [fixture, records] of byFixture) {
    const registered = [...new Set(records.map(({ registered_repetitions: repetitions }) => repetitions))];
    if (registered.length !== 1 || ![3, 5].includes(registered[0])) throw new Error(`normalized plan lineage has invalid registered repetitions for ${fixture}`);
    const repetitions = registered[0];
    const expectedRepetitions = Array.from({ length: repetitions }, (_, index) => index + 1);
    for (const condition of CONDITIONS) {
      const actual = records.filter((entry) => entry.condition === condition).map(({ repetition }) => repetition).sort((left, right) => left - right);
      if (stableCanonicalJson(actual) !== stableCanonicalJson(expectedRepetitions)) throw new Error(`normalized plan lineage is incomplete for ${fixture}/${condition}`);
    }
  }
  return {
    expected: expected.sort(resultOrder),
    manifest,
    generationPath,
    normalizedGenerationId: `snapshot-${sourceSnapshotDigest.slice("sha256:".length)}`,
  };
}

function duplicateResultErrors(results) {
  const fields = [
    ["engineering result ID", (entry) => entry.engineering_result_id],
    ["engineering result digest", (entry) => entry.engineering_result_digest],
    ["normalized result ID", (entry) => entry.normalized_result_id],
    ["case-attempt identity", normalizedAttemptId],
    ["fixture-condition-repetition identity", (entry) => `${entry.fixture_id}/${entry.condition}/${entry.repetition}`],
  ];
  return fields.filter(([, selector]) => new Set(results.map(selector)).size !== results.length).map(([label]) => `duplicate ${label}`);
}

function assertSourceEntryMatchesResult(sourceEntry, result, evidence) {
  const expected = {
    path: sourceEntry.path,
    raw_byte_digest: evidence.rawByteDigest,
    bytes: evidence.bytes.length,
    engineering_result_id: result.engineering_result_id,
    engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    case_id: result.case_id,
    attempt: result.attempt,
    condition: result.condition,
    repetition: result.repetition,
  };
  if (stableCanonicalJson(sourceEntry) !== stableCanonicalJson(expected)) throw new Error(`engineering result source manifest entry drifted for ${sourceEntry.path}`);
}

function assertResultMatchesExpected(result, expected, adapter) {
  const fields = [
    "normalized_result_id", "normalized_result_digest", "normalized_outcome", "source_snapshot_digest",
    "run_instance_id", "plan_id", "plan_digest", "fixture_id", "fixture_input_digest", "suite",
    "task_class", "case_id", "attempt", "condition", "repetition",
  ];
  if (result.adapter !== adapter) throw new Error(`engineering result ${result.engineering_result_id} belongs to a different adapter`);
  for (const field of fields) {
    if (result[field] !== expected[field]) throw new Error(`engineering result ${result.engineering_result_id} has a cross-${field.replaceAll("_", "-")} lineage mismatch`);
  }
}

function inventoryEntry(path, result, evidence) {
  return {
    path,
    raw_byte_digest: evidence.rawByteDigest,
    bytes: evidence.bytes.length,
    engineering_result_id: result.engineering_result_id,
    engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    normalized_outcome: result.normalized_outcome,
    evaluation_id: result.evaluation_id,
    evaluation_digest: result.evaluation_digest,
    evaluation_status: result.evaluation_status,
    scoring_status: result.scoring_status,
    scoring_reason: result.scoring_reason,
    fixture_id: result.fixture_id,
    suite: result.suite,
    task_class: result.task_class,
    case_id: result.case_id,
    attempt: result.attempt,
    condition: result.condition,
    repetition: result.repetition,
    blocker_gate_status: result.blockers.gate_status,
    safety_blocker_status: result.safety_blocker.status,
    scoring_input_freeze_manifest_digest: result.scoring_input_freeze_manifest_digest,
    requirement_record_digest: result.requirement_record_digest,
    scoring_policy_digest: result.scoring_policy_digest,
  };
}

function namedCounts(inventory, names, selector) {
  return names.map((name) => ({ name: String(name), count: inventory.filter((entry) => String(selector(entry)) === String(name)).length }));
}

function structuralCounts(inventory) {
  const maximumRepetition = Math.max(...inventory.map(({ repetition }) => repetition));
  return {
    by_condition: namedCounts(inventory, CONDITIONS, (entry) => entry.condition),
    by_repetition: namedCounts(inventory, Array.from({ length: maximumRepetition }, (_, index) => index + 1), (entry) => entry.repetition),
    by_scoring_status: namedCounts(inventory, SCORING_STATUSES, (entry) => entry.scoring_status),
    by_normalized_outcome: namedCounts(inventory, NORMALIZED_OUTCOMES, (entry) => entry.normalized_outcome),
  };
}

// This bare validator proves only the serialized manifest's Schema and internal
// closure. External normalized/source/result authority and raw result bodies are
// available only from verifyEngineeringResultSet().
export function validatePortfolioEngineeringResultSet(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, ENGINEERING_RESULT_SET_SCHEMA_PATH), label: "portfolio engineering result set" });
  for (const entry of value.inventory) assertPortableRelativePath(entry.path, "engineering result set inventory path");
  const duplicates = duplicateResultErrors(value.inventory);
  if (duplicates.length > 0) throw new Error(duplicates.join("; "));
  if (stableCanonicalJson(value.inventory) !== stableCanonicalJson([...value.inventory].sort(resultOrder))) throw new Error("engineering result set inventory ordering is invalid");
  const expectedAttempts = value.inventory.map(normalizedAttemptId);
  const expectedCases = [...new Set(value.inventory.map(({ case_id: caseId }) => caseId))].sort();
  const completeness = {
    expected_result_count: value.inventory.length,
    collected_result_count: value.inventory.length,
    expected_normalized_attempt_ids: expectedAttempts,
    collected_normalized_attempt_ids: expectedAttempts,
    expected_case_ids: expectedCases,
    collected_case_ids: expectedCases,
    completeness_status: "complete",
  };
  if (stableCanonicalJson(value.completeness) !== stableCanonicalJson(completeness)) throw new Error("engineering result set completeness counts or inventories drifted");
  if (stableCanonicalJson(value.structural_counts) !== stableCanonicalJson(structuralCounts(value.inventory))) throw new Error("engineering result set structural counts drifted");
  if (value.inventory.some((entry) => !NORMALIZED_OUTCOMES.includes(entry.normalized_outcome))) throw new Error("engineering result set converted an unknown normalized outcome");
  if (value.result_set_id !== computeEngineeringResultSetId(value)) throw new Error("engineering result set ID is invalid");
  if (value.result_set_digest !== computeEngineeringResultSetDigest(value)) throw new Error("engineering result set digest is invalid");
  return value;
}

export function assertVerifiedResultInventory(artifact, verifiedResults) {
  if (!Array.isArray(verifiedResults) || verifiedResults.length !== artifact.inventory.length) throw new Error("verified result inventory length does not match the result-set artifact");
  const entryKeys = ["bytes", "path", "raw_byte_digest", "result"];
  for (let index = 0; index < artifact.inventory.length; index += 1) {
    const inventory = artifact.inventory[index];
    const verified = verifiedResults[index];
    if (!verified || stableCanonicalJson(Object.keys(verified).sort()) !== stableCanonicalJson(entryKeys)) throw new Error(`verified result inventory entry ${index} has an invalid runtime shape`);
    assertPortableRelativePath(verified.path, `verified result inventory path ${index}`);
    if (PRIVATE_EVALUATOR_PATTERN.test(verified.path)) throw new Error(`verified result inventory path ${index} exposes a private evaluator path`);
    const actual = {
      path: verified.path,
      raw_byte_digest: verified.raw_byte_digest,
      bytes: verified.bytes,
      engineering_result_id: verified.result?.engineering_result_id,
      engineering_result_digest: verified.result?.engineering_result_digest,
      normalized_result_id: verified.result?.normalized_result_id,
      normalized_result_digest: verified.result?.normalized_result_digest,
      case_id: verified.result?.case_id,
      attempt: verified.result?.attempt,
      condition: verified.result?.condition,
      repetition: verified.result?.repetition,
    };
    const expected = {
      path: inventory.path,
      raw_byte_digest: inventory.raw_byte_digest,
      bytes: inventory.bytes,
      engineering_result_id: inventory.engineering_result_id,
      engineering_result_digest: inventory.engineering_result_digest,
      normalized_result_id: inventory.normalized_result_id,
      normalized_result_digest: inventory.normalized_result_digest,
      case_id: inventory.case_id,
      attempt: inventory.attempt,
      condition: inventory.condition,
      repetition: inventory.repetition,
    };
    if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`verified result inventory entry ${index} does not match the result-set artifact inventory`);
  }
  return verifiedResults;
}

function deepFreezeJson(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreezeJson(entry);
  return Object.freeze(value);
}

function sourceAuthorityReturn(authority) {
  return deepFreezeJson({
    manifest: structuredClone(authority.manifest),
    rawByteDigest: authority.rawByteDigest,
    authority: authority.authority,
  });
}

function assertInputBoundaries({ root, engineeringResultsPath, normalizedResultsPath, sourceManifestPath, outputPath = null, inputPath = null, materializedPath = null, selectionState = null, runDir = null }) {
  const engineeringRoot = assertRealDirectory(engineeringResultsPath, "engineering result root");
  const normalizedRoot = assertRealDirectory(normalizedResultsPath, "normalized results root");
  const authorityRoots = [
    [engineeringRoot, "engineering result root"],
    [normalizedRoot, "normalized results root"],
  ];
  if (pathsOverlap(engineeringRoot, normalizedRoot)) throw new Error("engineering result root must not overlap the normalized results root");
  for (const [path, label] of [[materializedPath, "materialized root"], [selectionState, "selection-state root"], [runDir, "execution run root"]]) {
    if (!path) continue;
    const authorityRoot = assertRealDirectory(path, label);
    if (pathsOverlap(engineeringRoot, authorityRoot)) throw new Error(`engineering result root must not overlap the ${label}`);
    authorityRoots.push([authorityRoot, label]);
  }
  if (pathsOverlap(engineeringRoot, sourceManifestPath)) throw new Error("engineering result source manifest must stay outside the engineering result root");
  for (const [candidate, candidateLabel] of [[outputPath, "engineering result-set output"], [inputPath, "engineering result-set input"]]) {
    if (!candidate) continue;
    for (const [authorityRoot, authorityLabel] of authorityRoots) {
      if (pathsOverlap(authorityRoot, candidate)) throw new Error(`${candidateLabel} must not overlap the ${authorityLabel}`);
    }
  }
  if (isInside(root, engineeringRoot)) {
    const repositoryRelative = relative(root, engineeringRoot).split(sep).join("/");
    if (PRIVATE_EVALUATOR_PATTERN.test(repositoryRelative)) throw new Error("engineering result root must not overlap a repository private evaluator root");
  }
  return engineeringRoot;
}

function deriveEngineeringResultSet(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  assertInputBoundaries({ root, ...options });
  const authority = readAnchoredSourceManifest({ root, sourceManifestPath: options.sourceManifestPath, sourceManifestSourceDigest: options.sourceManifestSourceDigest });
  const normalized = deriveExpectedNormalizedAttempts({ root, normalizedResultsPath: options.normalizedResultsPath, sourceSnapshotDigest: options.sourceSnapshotDigest, adapter: options.adapter });
  const { manifest: sourceManifest } = authority;
  const sourceRevision = normalized.manifest.source.repository_revision;
  if (normalized.manifest.normalizer.source_revision !== sourceRevision) throw new Error("normalized manifest normalizer source revision does not match source.repository_revision");
  const expectedAuthority = {
    plan_id: normalized.manifest.source.plan_id,
    plan_digest: normalized.manifest.source.plan_digest,
    run_instance_id: normalized.manifest.source.run_instance_id,
    source_snapshot_digest: normalized.manifest.source_snapshot_digest,
    adapter_track: options.adapter,
    normalized_generation_id: normalized.normalizedGenerationId,
    normalized_manifest_digest: normalized.manifest.normalized_run_digest,
    source_revision: sourceRevision,
  };
  for (const [field, expected] of Object.entries(expectedAuthority)) {
    if (sourceManifest[field] !== expected) throw new Error(`engineering result source manifest ${field} does not match the verified normalized authority`);
  }
  const firstScan = scanResultRoot(options.engineeringResultsPath);
  const sourcePaths = sourceManifest.inventory.map(({ path }) => path).sort();
  const actualPaths = [...firstScan.files.keys()].sort();
  if (stableCanonicalJson(sourcePaths) !== stableCanonicalJson(actualPaths)) throw new Error("engineering result source manifest and directory file inventory do not match exactly");
  const results = [];
  const resultByNormalizedId = new Map();
  const collectedInventory = [];
  const verifiedResults = [];
  for (const sourceEntry of sourceManifest.inventory) {
    const evidence = firstScan.files.get(sourceEntry.path);
    if (!evidence) throw new Error(`engineering result source manifest references a missing file: ${sourceEntry.path}`);
    if (sourceEntry.raw_byte_digest !== evidence.rawByteDigest) throw new Error(`engineering result raw-byte digest drifted for ${sourceEntry.path}`);
    if (sourceEntry.bytes !== evidence.bytes.length) throw new Error(`engineering result byte count drifted for ${sourceEntry.path}`);
    const result = validatePortfolioEngineeringResult(parseJsonBytes(evidence.bytes, `engineering result ${sourceEntry.path}`), { root });
    assertSourceEntryMatchesResult(sourceEntry, result, evidence);
    results.push(result);
    resultByNormalizedId.set(result.normalized_result_id, { result, path: sourceEntry.path, evidence });
  }
  const duplicates = duplicateResultErrors(results);
  if (duplicates.length > 0) throw new Error(duplicates.join("; "));
  const expectedIds = normalized.expected.map(({ normalized_result_id: id }) => id).sort();
  const actualIds = results.map(({ normalized_result_id: id }) => id).sort();
  if (stableCanonicalJson(actualIds) !== stableCanonicalJson(expectedIds)) throw new Error("engineering result collection is missing or contains an extra normalized attempt; subset and cherry-pick inventories are rejected");
  for (const expected of normalized.expected) {
    const actual = resultByNormalizedId.get(expected.normalized_result_id);
    if (!actual) throw new Error(`engineering result is missing for normalized attempt ${normalizedAttemptId(expected)}`);
    assertResultMatchesExpected(actual.result, expected, options.adapter);
    collectedInventory.push(inventoryEntry(actual.path, actual.result, actual.evidence));
    verifiedResults.push({
      path: actual.path,
      raw_byte_digest: actual.evidence.rawByteDigest,
      bytes: actual.evidence.bytes.length,
      result: structuredClone(actual.result),
    });
  }
  const secondScan = scanResultRoot(options.engineeringResultsPath);
  assertSameFileEvidence(firstScan, secondScan);
  const sourceManifestAfter = readStableFile(authority.path, "engineering result source manifest", MAX_SOURCE_MANIFEST_BYTES);
  assertStableFileEvidence(authority.evidence, sourceManifestAfter, "engineering result source manifest");
  const normalizedAfter = verifyNormalizedPortfolioResults({ root, outputPath: options.normalizedResultsPath, sourceSnapshotDigest: options.sourceSnapshotDigest });
  if (normalizedAfter.manifest.normalized_run_digest !== normalized.manifest.normalized_run_digest) throw new Error("normalized generation changed during engineering result inspection");
  const attempts = normalized.expected.map(normalizedAttemptId);
  const cases = [...new Set(normalized.expected.map(({ case_id: caseId }) => caseId))].sort();
  const base = {
    schema_version: "1.0.0",
    schema_path: ENGINEERING_RESULT_SET_SCHEMA_PATH,
    program: "adaptive_ask_portfolio_engineering_result_set",
    source_manifest_raw_byte_digest: authority.rawByteDigest,
    source_manifest_digest: sourceManifest.manifest_digest,
    normalized_generation_id: normalized.normalizedGenerationId,
    normalized_manifest_digest: normalized.manifest.normalized_run_digest,
    source_snapshot_digest: normalized.manifest.source_snapshot_digest,
    plan_id: normalized.manifest.source.plan_id,
    plan_digest: normalized.manifest.source.plan_digest,
    run_instance_id: normalized.manifest.source.run_instance_id,
    adapter_track: options.adapter,
    source_revision: sourceRevision,
    completeness: {
      expected_result_count: normalized.expected.length,
      collected_result_count: collectedInventory.length,
      expected_normalized_attempt_ids: attempts,
      collected_normalized_attempt_ids: collectedInventory.map(normalizedAttemptId),
      expected_case_ids: cases,
      collected_case_ids: [...new Set(collectedInventory.map(({ case_id: caseId }) => caseId))].sort(),
      completeness_status: "complete",
    },
    structural_counts: structuralCounts(collectedInventory),
    inventory: collectedInventory,
    boundaries: {
      aggregate_result: false,
      statistics_calculated: false,
      comparison_result: false,
      mechanism_scorecard_calculated: false,
      adapter_results_pooled: false,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
    privacy: { private_evaluator_content_stored: false, private_path_stored: false },
  };
  const withId = { ...base, result_set_id: computeEngineeringResultSetId(base) };
  const artifact = { ...withId, result_set_digest: computeEngineeringResultSetDigest(withId) };
  validatePortfolioEngineeringResultSet(artifact, { root });
  assertVerifiedResultInventory(artifact, verifiedResults);
  return { artifact, authority: sourceAuthorityReturn(authority), verified_results: deepFreezeJson(verifiedResults) };
}

export function collectEngineeringResults(options) {
  if (options.outputPath) assertInputBoundaries({ root: resolve(options.root ?? DEFAULT_ROOT), ...options });
  const output = assertAtomicOutputAbsent(options.outputPath, "engineering result-set output");
  const derived = deriveEngineeringResultSet({ ...options, outputPath: output });
  const publication = publishJsonAtomicNoReplace({ outputPath: output, artifact: derived.artifact, label: "engineering result-set output" });
  return { ...derived, ...publication };
}

export function verifyEngineeringResultSet(options) {
  assertRegularFile(options.inputPath, "engineering result-set input");
  const input = readStableFile(options.inputPath, "engineering result-set input", MAX_SOURCE_MANIFEST_BYTES);
  const supplied = validatePortfolioEngineeringResultSet(parseJsonBytes(input.bytes, "engineering result-set input"), { root: options.root ?? DEFAULT_ROOT });
  const derived = deriveEngineeringResultSet(options);
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("engineering result-set input does not match the re-derived authoritative complete inventory");
  const inputAfter = readStableFile(options.inputPath, "engineering result-set input", MAX_SOURCE_MANIFEST_BYTES);
  assertStableFileEvidence(input, inputAfter, "engineering result-set input");
  // Consumers receive only the cloned, frozen raw results whose complete
  // authority and final supplied-input stability checks have now succeeded.
  return { artifact: supplied, bytes: input.bytes, authority: derived.authority, verified_results: derived.verified_results };
}

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  realpathSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, extname, posix, relative, resolve, sep, win32 } from "node:path";
import { tmpdir } from "node:os";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { materializeVerifiedTerminalCandidate } from "./ask-benchmark-terminal-candidate.mjs";
import { deriveTerminalCandidateInventory, terminalWorkspaceInventoryDigest } from "./ask-benchmark-terminal-workspace.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { computeVerificationCommandContractDigest } from "./ask-benchmark-command-evidence.mjs";
import {
  computeFinalAdmissionRecordDigest,
  resolveRequirementAdmissionBindingDigest,
  computeOutputContractDigest,
  computePolicyManifestDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  BINARY_SCOPE_VERIFICATION_PROFILE_NAME,
  deriveEffectiveVerificationEvidenceReferences,
  deriveEffectiveVerificationEvidenceState,
  FINAL_ADMISSION_RECORD_SCHEMA_PATH,
  SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH,
  validateFinalAdmissionRecordContract,
  validateBinaryScopeVerificationResult,
  validateRequirementRecordContract,
  validateRequirementResultObservations,
  validateScoringContractSchemaParity,
  validateScoringInputBindings,
} from "./ask-benchmark-scoring-contract.mjs";

const AUTHORITY_SPAWN_SYNC = spawnSync;
const AUTHORITY_JSON_STRINGIFY = JSON.stringify;
const AUTHORITY_NODE_EXECUTABLE = process.execPath;
const ORIGINAL_EXECUTION_AUTHORITIES = new WeakMap();
const PRODUCTION_EXECUTION_AUTHORITIES = new WeakMap();

export const EVALUATOR_REFERENCE_SCHEMA_PATH = "benchmarks/schemas/evaluator-reference.schema.json";
export const PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-bundle.schema.json";
export const PRIVATE_EVALUATOR_INDEPENDENCE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-independence-statement.schema.json";
export const PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-fragment.schema.json";
export const PRIVATE_EVALUATION_RECORD_SCHEMA_PATH = "benchmarks/schemas/private-evaluation-record.schema.json";
export const REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/repository-diff-artifact.schema.json";
export const ORIGINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH = "benchmarks/schemas/original-workspace-authority.schema.json";
export const EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/evaluation-input-failure-artifact.schema.json";
export const EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/evaluator-check-artifact.schema.json";
export const EVALUATOR_RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";
export const EVALUATOR_DEPENDENCY_ENTRY_PATHS = Object.freeze([
  "scripts/ask-benchmark-scoring-contract.mjs",
  "scripts/ask-benchmark-materialize.mjs",
  "scripts/ask-benchmark-normalized-results.mjs",
  "scripts/ask-benchmark-evaluator-boundary.mjs",
  "scripts/ask-benchmark-private-evaluator-runner.mjs",
]);
export const EVALUATOR_AUTHORITY_PATHS = Object.freeze([
  "benchmarks/schemas/evaluator-authority-manifest.schema.json",
  "benchmarks/schemas/evaluator-reference.schema.json",
  "benchmarks/schemas/evaluator-result-envelope.schema.json",
  "benchmarks/schemas/evaluator-check-artifact.schema.json",
  "benchmarks/schemas/evaluation-input-failure-artifact.schema.json",
  "benchmarks/schemas/portfolio-final-admission-record.schema.json",
  "benchmarks/schemas/portfolio-requirement-record.schema.json",
  "benchmarks/schemas/portfolio-output-contract.schema.json",
  "benchmarks/schemas/private-evaluator-bundle.schema.json",
  "benchmarks/schemas/private-evaluator-fragment.schema.json",
  "benchmarks/schemas/private-evaluator-independence-statement.schema.json",
  "benchmarks/schemas/private-evaluation-record.schema.json",
  "benchmarks/schemas/repository-diff-artifact.schema.json",
  "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
  "benchmarks/schemas/normalized-portfolio-result.schema.json",
  "benchmarks/schemas/original-workspace-authority.schema.json",
]);
export const EVALUATOR_FIXTURE_AUTHORITY_PATHS = Object.freeze([
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/input-manifest.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evidence-map.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/requirement-record.json",
]);
export const EVALUATOR_RUNTIME_AUTHORITY_PATHS = Object.freeze([
  "benchmarks/schemas/normalized-portfolio-result.schema.json",
]);
export const EVALUATOR_REPOSITORY_DESCRIPTOR_PATH = "repository-authority.json";
export const EVALUATOR_AUTHORITY_MANIFEST_PATH = "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json";
export const EVALUATOR_AUTHORITY_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/evaluator-authority-manifest.schema.json";
export const SEALED_REGULAR_FILE_MODE = 0o444;
export const SEALED_EXECUTABLE_FILE_MODE = 0o555;
export const SEALED_DIRECTORY_MODE = 0o555;
export const SEALED_EXECUTABLE_PATHS = Object.freeze([]);
const PRIVATE_EVALUATOR_VIRTUAL_PATH = "private/hidden-evaluator.mjs";
const ORIGINAL_WORKSPACE_AUTHORITY_PATH = "original-workspace-authority.json";
const SEALED_REPOSITORY_DIFF_ARTIFACT_PATH = "repository-diff-artifact.json";
const EVALUATOR_PRIVATE_ENTRY_PATHS = Object.freeze([
  "scripts/ask-benchmark-scoring-contract.mjs",
  "scripts/ask-benchmark-materialize.mjs",
  "scripts/ask-benchmark-normalized-results.mjs",
  "scripts/ask-benchmark-evaluator-boundary.mjs",
]);
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
  const byteLimit = publicArtifact ? MAX_PUBLIC_ARTIFACT_BYTES : MAX_JSON_ARTIFACT_BYTES;
  assertRegularFile(path, label);
  const stable = readStableFile(realpathSync(path), label, byteLimit, { allowEmpty: false });
  const { bytes } = stable;
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  assertNoDuplicateJsonObjectKeys(bytes.toString("utf8"), label);
  return { ...stable, value };
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

const EVALUATOR_AUTHORITY_BINDING_PATHS = Object.freeze([
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/input-manifest.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evidence-map.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json",
  "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/requirement-record.json",
]);

function jsonValueFromVerifiedBytes(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error(`${label} verified bytes are missing`);
  const source = bytes.toString("utf8");
  assertNoDuplicateJsonObjectKeys(source, label);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
}

export function computeEvaluatorAuthorityManifestDigest(manifest) {
  const { manifest_digest: _digest, ...base } = manifest;
  return canonicalDigest(base);
}

export function deriveEvaluatorAuthorityManifest({ buffers, evaluatorRevision } = {}) {
  if (!(buffers instanceof Map)) throw new Error("evaluator authority manifest requires a verified byte map");
  if (!/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error("evaluator authority manifest revision is invalid");
  const values = new Map(EVALUATOR_AUTHORITY_BINDING_PATHS.map((path) => [path, jsonValueFromVerifiedBytes(buffers.get(path), `evaluator authority ${path}`)]));
  const [inputPath, evidencePath, commandPath, requirementPath] = EVALUATOR_AUTHORITY_BINDING_PATHS;
  const input = values.get(inputPath);
  const evidence = values.get(evidencePath);
  const command = values.get(commandPath);
  const requirement = values.get(requirementPath);
  const fixtureEntry = input.fixtures?.["mn-build-option-update"];
  if (!fixtureEntry) throw new Error("evaluator authority input manifest is missing the fixture entry");
  if (evidence.fixture_id !== "mn-build-option-update" || command.fixture_id !== "mn-build-option-update" || requirement.fixture_id !== "mn-build-option-update") throw new Error("evaluator authority fixture identity is inconsistent");
  if (command.contract_digest !== computeVerificationCommandContractDigest(command)) throw new Error("evaluator authority verification command contract digest is invalid");
  if (requirement.requirement_record_digest !== computeRequirementRecordDigest(requirement) || requirement.requirement_set_digest !== computeRequirementSetDigest(requirement)) throw new Error("evaluator authority requirement record digest is invalid");
  const requirementMapClosure = requirement.requirements.map(({ requirement_id, evidence_map_ids }) => ({ requirement_id, evidence_map_ids }));
  const fileInventory = [
    {
      path: inputPath,
      bytes: buffers.get(inputPath).length,
      raw_sha256: rawByteDigest(buffers.get(inputPath)),
      semantic_digest: canonicalDigest(fixtureEntry),
      authority_role: "fixture_input",
      fixture_input_identity: rawByteDigest(buffers.get(inputPath)),
      semantic_fixture_entry_digest: canonicalDigest(fixtureEntry),
    },
    {
      path: evidencePath,
      bytes: buffers.get(evidencePath).length,
      raw_sha256: rawByteDigest(buffers.get(evidencePath)),
      semantic_digest: canonicalDigest(evidence),
      authority_role: "evidence_map",
      evidence_map_set_digest: canonicalDigest(evidence.maps),
      requirement_ids: requirementMapClosure.map(({ requirement_id }) => requirement_id),
      evidence_map_ids: evidence.maps.map(({ evidence_map_id }) => evidence_map_id),
      requirement_map_closure_digest: canonicalDigest(requirementMapClosure),
    },
    {
      path: commandPath,
      bytes: buffers.get(commandPath).length,
      raw_sha256: rawByteDigest(buffers.get(commandPath)),
      semantic_digest: command.contract_digest,
      authority_role: "verification_command_contract",
      contract_digest: command.contract_digest,
      command_inventory_digest: canonicalDigest(command.commands),
    },
    {
      path: requirementPath,
      bytes: buffers.get(requirementPath).length,
      raw_sha256: rawByteDigest(buffers.get(requirementPath)),
      semantic_digest: requirement.requirement_record_digest,
      authority_role: "requirement_record",
      requirement_record_digest: requirement.requirement_record_digest,
      requirement_set_digest: requirement.requirement_set_digest,
    },
  ];
  const base = {
    schema_version: "1.0.0",
    schema_path: EVALUATOR_AUTHORITY_MANIFEST_SCHEMA_PATH,
    program: "adaptive_ask_evaluator_authority_manifest",
    fixture_id: "mn-build-option-update",
    evaluator_revision: evaluatorRevision,
    file_inventory: fileInventory,
  };
  return { ...base, manifest_digest: canonicalDigest(base) };
}

export function validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision, root = null, label = "evaluator authority manifest" } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`${label} is missing`);
  if (manifest.manifest_digest !== computeEvaluatorAuthorityManifestDigest(manifest)) throw new Error(`${label} digest closure is invalid`);
  if (root) assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, EVALUATOR_AUTHORITY_MANIFEST_SCHEMA_PATH), label });
  const expected = deriveEvaluatorAuthorityManifest({ buffers, evaluatorRevision });
  if (stableCanonicalJson(manifest) !== stableCanonicalJson(expected)) throw new Error(`${label} does not match the immutable fixture authority bytes`);
  return structuredClone(manifest);
}

function assertExternalEvaluatorAuthorityAnchor(anchor, label) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) throw new Error(`${label} external evaluator authority anchor is required`);
  if (!/^[a-f0-9]{40}$/u.test(anchor.evaluator_revision ?? "")) throw new Error(`${label} external evaluator authority revision is invalid`);
  if (anchor.evaluator_authority_manifest_path !== EVALUATOR_AUTHORITY_MANIFEST_PATH) throw new Error(`${label} external evaluator authority manifest path drift`);
  if (!Number.isInteger(anchor.evaluator_authority_manifest_bytes) || anchor.evaluator_authority_manifest_bytes < 1) throw new Error(`${label} external evaluator authority manifest byte count is invalid`);
  for (const [field, value] of [
    ["raw-byte digest", anchor.evaluator_authority_manifest_raw_sha256],
    ["semantic digest", anchor.evaluator_authority_manifest_digest],
  ]) if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) throw new Error(`${label} external evaluator authority manifest ${field} is invalid`);
  if (!Array.isArray(anchor.file_inventory)) throw new Error(`${label} external evaluator authority file inventory is missing`);
  const paths = anchor.file_inventory.map((entry) => entry?.path);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} external evaluator authority file inventory contains duplicates`);
  if (stableCanonicalJson(paths) !== stableCanonicalJson(EVALUATOR_AUTHORITY_BINDING_PATHS)) throw new Error(`${label} external evaluator authority file inventory has an omission, addition, or ordering drift`);
  for (const entry of anchor.file_inventory) {
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1 || !/^sha256:[a-f0-9]{64}$/u.test(entry.raw_sha256 ?? "")) throw new Error(`${label} external evaluator authority file identity is invalid at ${entry.path}`);
  }
  const reference = anchor.evaluator_reference;
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) throw new Error(`${label} external evaluator public reference is missing`);
  if (reference.public_metadata_digest !== computeEvaluatorReferenceDigest(reference)) throw new Error(`${label} external evaluator public reference digest closure is invalid`);
  if (reference.evaluator_revision !== anchor.evaluator_revision || reference.evaluator_authority_manifest_path !== anchor.evaluator_authority_manifest_path || reference.evaluator_authority_manifest_raw_sha256 !== anchor.evaluator_authority_manifest_raw_sha256 || reference.evaluator_authority_manifest_digest !== anchor.evaluator_authority_manifest_digest) throw new Error(`${label} external evaluator public reference authority closure is invalid`);
  if (!/^evaluator-[a-f0-9]{64}$/u.test(reference.evaluator_bundle_id ?? "") || !/^sha256:[a-f0-9]{64}$/u.test(reference.evaluator_bundle_digest ?? "")) throw new Error(`${label} external evaluator public reference bundle identity is invalid`);
  if (!reference.evaluator_source_identity || reference.evaluator_source_identity.base_git_revision !== anchor.evaluator_revision) throw new Error(`${label} external evaluator public reference source identity is invalid`);
  return structuredClone(anchor);
}

function buildVerifiedEvaluatorAuthorityAnchor({ evaluatorRevision, evaluatorReference, manifestReference, manifestSource, buffers, root, label }) {
  if (!manifestReference || manifestReference.path !== EVALUATOR_AUTHORITY_MANIFEST_PATH) throw new Error(`${label} evaluator authority manifest freeze reference path drift`);
  if (!manifestSource || !(buffers instanceof Map)) throw new Error(`${label} evaluator authority verified bytes are missing`);
  if (manifestSource.rawByteDigest !== manifestReference.raw_byte_digest) throw new Error(`${label} evaluator authority manifest raw bytes do not match the freeze authority`);
  if (manifestSource.value.manifest_digest !== manifestReference.semantic_digest) throw new Error(`${label} evaluator authority manifest semantic digest does not match the freeze authority`);
  validateEvaluatorAuthorityManifest({ manifest: manifestSource.value, buffers, evaluatorRevision, root, label: `${label} evaluator authority manifest` });
  const fileInventory = manifestSource.value.file_inventory.map(({ path, bytes, raw_sha256 }) => ({ path, bytes, raw_sha256 }));
  return assertExternalEvaluatorAuthorityAnchor({
    evaluator_revision: evaluatorRevision,
    evaluator_authority_manifest_path: manifestReference.path,
    evaluator_authority_manifest_bytes: manifestSource.bytes.length,
    evaluator_authority_manifest_raw_sha256: manifestReference.raw_byte_digest,
    evaluator_authority_manifest_digest: manifestReference.semantic_digest,
    file_inventory: fileInventory,
    evaluator_reference: structuredClone(evaluatorReference),
  }, label);
}

function externalAuthorityIdentityForPath(anchor, path) {
  if (path === anchor.evaluator_authority_manifest_path) return {
    bytes: anchor.evaluator_authority_manifest_bytes,
    raw_sha256: anchor.evaluator_authority_manifest_raw_sha256,
  };
  return anchor.file_inventory.find((entry) => entry.path === path) ?? null;
}

export function verifySealedEvaluatorExternalAuthority({ descriptor, buffers, externalAuthorityAnchor, label = "sealed evaluator external authority" } = {}) {
  const anchor = assertExternalEvaluatorAuthorityAnchor(externalAuthorityAnchor, label);
  if (!descriptor || !(buffers instanceof Map)) throw new Error(`${label} sealed descriptor or verified byte map is missing`);
  if (descriptor.evaluator_revision !== anchor.evaluator_revision) throw new Error(`${label} evaluator revision does not match the external freeze authority`);
  if (descriptor.evaluator_authority_manifest_path !== anchor.evaluator_authority_manifest_path) throw new Error(`${label} evaluator authority manifest path does not match the external freeze authority`);
  if (descriptor.evaluator_authority_manifest_raw_sha256 !== anchor.evaluator_authority_manifest_raw_sha256) throw new Error(`${label} evaluator authority manifest raw-byte digest does not match the external freeze authority`);
  if (descriptor.evaluator_authority_manifest_digest !== anchor.evaluator_authority_manifest_digest) throw new Error(`${label} evaluator authority manifest semantic digest does not match the external freeze authority`);
  const manifestBytes = buffers.get(anchor.evaluator_authority_manifest_path);
  if (!Buffer.isBuffer(manifestBytes) || manifestBytes.length !== anchor.evaluator_authority_manifest_bytes || rawByteDigest(manifestBytes) !== anchor.evaluator_authority_manifest_raw_sha256) throw new Error(`${label} sealed evaluator authority manifest bytes do not match the external freeze authority`);
  const manifest = jsonValueFromVerifiedBytes(manifestBytes, `${label} sealed evaluator authority manifest`);
  if (manifest.evaluator_revision !== anchor.evaluator_revision || manifest.manifest_digest !== anchor.evaluator_authority_manifest_digest) throw new Error(`${label} sealed evaluator authority manifest identity does not match the external freeze authority`);
  const manifestInventory = manifest.file_inventory.map(({ path, bytes, raw_sha256 }) => ({ path, bytes, raw_sha256 }));
  if (stableCanonicalJson(manifestInventory) !== stableCanonicalJson(anchor.file_inventory)) throw new Error(`${label} sealed evaluator authority manifest inventory does not match the external freeze authority`);
  const descriptorFixtures = new Map((descriptor.fixture_authority ?? []).map((entry) => [entry.path, entry]));
  for (const entry of anchor.file_inventory) {
    const bytes = buffers.get(entry.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== entry.bytes || rawByteDigest(bytes) !== entry.raw_sha256) throw new Error(`${label} sealed fixture bytes do not match the external freeze authority at ${entry.path}`);
    const descriptorEntry = descriptorFixtures.get(entry.path);
    if (!descriptorEntry || descriptorEntry.bytes !== entry.bytes || descriptorEntry.sha256 !== entry.raw_sha256) throw new Error(`${label} sealed descriptor fixture identity does not match the external freeze authority at ${entry.path}`);
  }
  const descriptorBytes = buffers.get(EVALUATOR_REPOSITORY_DESCRIPTOR_PATH);
  if (!Buffer.isBuffer(descriptorBytes)) throw new Error(`${label} sealed descriptor bytes are missing`);
  return {
    evaluator_revision: anchor.evaluator_revision,
    source_graph_digest: descriptor.source_graph_digest,
    repository_descriptor_sha256: rawByteDigest(descriptorBytes),
    evaluator_authority_manifest_path: anchor.evaluator_authority_manifest_path,
    evaluator_authority_manifest_raw_sha256: anchor.evaluator_authority_manifest_raw_sha256,
    evaluator_authority_manifest_digest: anchor.evaluator_authority_manifest_digest,
    evaluator_authority_files: structuredClone(anchor.file_inventory),
  };
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

function checkedInBytesAtRevision(root, revision, relativePath) {
  const key = `${root}\0${revision}\0${relativePath}`;
  const cached = CHECKED_IN_REVISION_BYTES.get(key);
  if (cached) return cached;
  try {
    const bytes = execFileSync("git", ["-C", root, "show", `${revision}:${relativePath}`], {
      encoding: null,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    CHECKED_IN_REVISION_BYTES.set(key, bytes);
    return bytes;
  } catch {
    return null;
  }
}

const CHECKED_IN_REVISION_BYTES = new Map();

function lexModule(source, label) {
  const tokens = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const advance = () => {
    const character = source[offset++];
    if (character === "\n") { line += 1; column = 1; } else column += 1;
    return character;
  };
  const consumeQuoted = (quote) => {
    const start = { line, column };
    let raw = quote;
    advance();
    while (offset < source.length) {
      const character = advance();
      raw += character;
      if (character === "\\") {
        if (offset >= source.length) throw new Error(`${label} contains an unterminated string`);
        raw += advance();
      } else if (character === quote) {
        try {
          const value = raw.slice(1, -1).replace(/\\\\(.)/gsu, "$1");
          tokens.push({ type: "string", value, ...start });
          return;
        } catch { throw new Error(`${label} contains an invalid string literal`); }
      } else if (character === "\n" || character === "\r") throw new Error(`${label} contains an unterminated string`);
    }
    throw new Error(`${label} contains an unterminated string`);
  };
  const consumeTemplate = () => {
    advance();
    while (offset < source.length) {
      if (source[offset] === "\\") {
        advance();
        if (offset >= source.length) throw new Error(`${label} contains an unterminated template literal`);
        advance();
      } else if (source[offset] === "`") {
        advance();
        return;
      } else if (source[offset] === "$" && source[offset + 1] === "{") {
        advance();
        advance();
        consumeCode(true);
      } else {
        advance();
      }
    }
    throw new Error(`${label} contains an unterminated template literal`);
  };
  const consumeCode = (stopAtTemplateExpressionEnd = false) => {
    let nestedBraces = 0;
    while (offset < source.length) {
    const character = source[offset];
    if (stopAtTemplateExpressionEnd && character === "}" && nestedBraces === 0) { advance(); return; }
    if (offset === 0 && character === "#" && source[offset + 1] === "!") { while (offset < source.length && advance() !== "\n") {} continue; }
    if (/\s/u.test(character)) { advance(); continue; }
    if (character === "/" && source[offset + 1] === "/") { while (offset < source.length && advance() !== "\n") {} continue; }
    if (character === "/" && source[offset + 1] === "*") {
      advance(); advance();
      while (offset < source.length && !(source[offset] === "*" && source[offset + 1] === "/")) advance();
      if (offset >= source.length) throw new Error(`${label} contains an unterminated comment`);
      advance(); advance(); continue;
    }
    const previous = tokens.at(-1)?.value;
    const regexPrefix = previous === undefined || ["(", "[", "{", "=", ":", ",", ";", "!", "?", "return", "=>"].includes(previous);
    if (character === "/" && regexPrefix) {
      advance();
      let inCharacterClass = false;
      while (offset < source.length) {
        const value = advance();
        if (value === "\\" && offset < source.length) advance();
        else if (value === "[") inCharacterClass = true;
        else if (value === "]") inCharacterClass = false;
        else if (value === "/" && !inCharacterClass) break;
        else if (value === "\n" || value === "\r") throw new Error(`${label} contains an unterminated regular expression`);
      }
      if (source[offset - 1] !== "/") throw new Error(`${label} contains an unterminated regular expression`);
      while (offset < source.length && /[A-Za-z]/u.test(source[offset])) advance();
      continue;
    }
    if (character === '"' || character === "'") { consumeQuoted(character); continue; }
    if (character === "`") { consumeTemplate(); continue; }
    const start = { line, column };
    if (/[A-Za-z_$]/u.test(character)) {
      let value = "";
      while (offset < source.length && /[A-Za-z0-9_$]/u.test(source[offset])) value += advance();
      tokens.push({ type: "identifier", value, ...start }); continue;
    }
    if (character === "{") nestedBraces += 1;
    if (character === "}") nestedBraces -= 1;
    tokens.push({ type: "punctuation", value: advance(), ...start });
    }
    if (stopAtTemplateExpressionEnd) throw new Error(`${label} contains an unterminated template expression`);
  };
  consumeCode();
  return tokens;
}

function assertNoUnsupportedLocalLoad(tokens, index, label) {
  const token = tokens[index];
  const next = tokens[index + 1];
  if (["createRequire", "require", "eval", "Function"].includes(token.value) && next?.value === "(") throw new Error(`${label} contains unsupported local module loading via ${token.value}`);
  if (token.value === "import" && next?.value === "." && tokens[index + 2]?.value === "meta" && tokens[index + 3]?.value === "." && tokens[index + 4]?.value === "resolve") throw new Error(`${label} contains unsupported local module loading via import.meta.resolve`);
}

function dependencySpecifierTarget(root, fromPath, specifier, label) {
  if (!specifier.startsWith(".")) return null;
  if (specifier.includes("\\") || specifier.includes(":") || specifier.includes("\0") || posix.isAbsolute(specifier) || win32.isAbsolute(specifier) || specifier.split("/").some((segment) => segment === ".." || segment === "")) throw new Error(`${label} specifier is not portable`);
  const fromDirectory = resolve(root, fromPath, "..");
  const candidate = resolve(fromDirectory, specifier);
  if (!isInside(root, candidate)) throw new Error(`${label} escapes the repository root`);
  const candidates = [candidate, `${candidate}.mjs`, `${candidate}.js`, `${candidate}.json`];
  const target = candidates.find((path) => existsSync(path));
  if (!target) throw new Error(`${label} target is missing: ${specifier}`);
  const relativeTarget = relative(root, target).split(sep).join("/");
  assertPortableRelativePath(relativeTarget, `${label} target`);
  assertPathInsideRootWithoutSymlinks(root, target, `${label} target`);
  return relativeTarget;
}

function parseLocalModuleEdges(root, path, source) {
  const tokens = lexModule(source, `evaluator dependency ${path}`);
  const edges = [];
  const add = (kind, token) => {
    const target = dependencySpecifierTarget(root, path, token.value, `${kind} from ${path}`);
    if (!target) return;
    const edge = { from: path, to: target, kind, specifier: token.value, source_location: { line: token.line, column: token.column } };
    edge.edge_digest = canonicalDigest(edge);
    edges.push(edge);
  };
  const addPrivateRuntimeEdge = (token) => {
    const edge = {
      from: path,
      to: "private/hidden-evaluator.mjs",
      kind: "runtime_private_import",
      specifier: token,
      syntax_identity: `runtime_private_import:${path}:${token}`,
    };
    edge.edge_digest = canonicalDigest(edge);
    edges.push(edge);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    assertNoUnsupportedLocalLoad(tokens, index, `evaluator dependency ${path}`);
    if (token.value === "import") {
      const next = tokens[index + 1];
      if (next?.value === "(") {
        const literal = tokens[index + 2];
        if (literal?.type !== "string") {
          if (path === "scripts/ask-benchmark-private-evaluator-runner.mjs") {
            addPrivateRuntimeEdge("--hidden-evaluator");
            continue;
          }
          throw new Error(`evaluator dependency ${path} contains an unsupported computed dynamic import`);
        }
        let depth = 1;
        let cursor = index + 3;
        for (; cursor < tokens.length && depth > 0; cursor += 1) {
          if (tokens[cursor].value === "(") depth += 1;
          if (tokens[cursor].value === ")") depth -= 1;
        }
        if (depth !== 0) throw new Error(`evaluator dependency ${path} contains an unterminated dynamic import`);
        add("dynamic_import", literal);
      } else if (next?.type === "string") add("static_import", next);
      else {
        for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
          if (tokens[cursor].value === "from") {
            const literal = tokens[cursor + 1];
            if (literal?.type !== "string") throw new Error(`evaluator dependency ${path} has an invalid static import`);
            add("static_import", literal);
            break;
          }
          if (tokens[cursor].value === "import" || tokens[cursor].value === "export") break;
        }
      }
    } else if (token.value === "export" && ["{", "*"].includes(tokens[index + 1]?.value)) {
      for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
        if (tokens[cursor].value === "from") {
          const literal = tokens[cursor + 1];
          if (literal?.type !== "string") throw new Error(`evaluator dependency ${path} has an invalid export-from`);
          add("export_from", literal);
          break;
        }
        if (tokens[cursor].value === "import" || tokens[cursor].value === "export") break;
      }
    }
  }
  return edges;
}

function dependencyFileType(path, authorityPaths = EVALUATOR_AUTHORITY_PATHS) {
  if (authorityPaths.includes(path)) return "authority_data";
  if (extname(path).toLowerCase() === ".json") return "json";
  return "module";
}

export function deriveEvaluatorDependencyGraph({
  root,
  baseRevision,
  entryPaths = EVALUATOR_DEPENDENCY_ENTRY_PATHS,
  authorityPaths = EVALUATOR_AUTHORITY_PATHS,
  privateEntryPaths = entryPaths === EVALUATOR_DEPENDENCY_ENTRY_PATHS ? EVALUATOR_PRIVATE_ENTRY_PATHS : [],
} = {}) {
  const canonicalRoot = assertRealDirectory(root, "evaluator dependency graph repository root");
  if (!baseRevision || !/^[a-f0-9]{40}$/u.test(baseRevision)) throw new Error("evaluator dependency graph base Git revision is invalid");
  const entries = [...entryPaths].map((path) => assertPortableRelativePath(path, "evaluator dependency graph entry path")).sort();
  if (new Set(entries).size !== entries.length) throw new Error("evaluator dependency graph entry paths contain duplicates");
  const authorities = [...authorityPaths].map((path) => assertPortableRelativePath(path, "evaluator dependency graph authority path")).sort();
  if (new Set(authorities).size !== authorities.length) throw new Error("evaluator dependency graph authority paths contain duplicates");
  const nodePaths = new Set();
  const edges = new Map();
  const visit = (path) => {
    if (nodePaths.has(path)) return;
    nodePaths.add(path);
    const absolute = resolveAuthorityArtifactPath(canonicalRoot, path, `evaluator dependency ${path}`);
    const bytes = readFileSync(absolute);
    const fileType = dependencyFileType(path, authorities);
    const committed = checkedInBytesAtRevision(canonicalRoot, baseRevision, path);
    if (!committed) throw new Error(`evaluator dependency base Git revision is unavailable at ${path}`);
    if (committed.length !== bytes.length || rawByteDigest(committed) !== rawByteDigest(bytes)) throw new Error(`evaluator dependency bytes do not match the base Git revision at ${path}`);
    if (fileType !== "json") {
      for (const edge of parseLocalModuleEdges(canonicalRoot, path, bytes.toString("utf8"))) {
        const edgeKey = stableCanonicalJson(edge);
        edges.set(edgeKey, edge);
        if (edge.kind !== "runtime_private_import") visit(edge.to);
      }
    }
  };
  for (const entry of entries) visit(entry);
  for (const authorityPath of authorities) {
    visit(authorityPath);
    const owner = authorityPath.includes("scoring-input") || authorityPath.includes("portfolio-" )
      ? "scripts/ask-benchmark-scoring-contract.mjs"
      : "scripts/ask-benchmark-evaluator-boundary.mjs";
    const edge = { from: owner, to: authorityPath, kind: "authority_read", specifier: authorityPath, syntax_identity: ["authority_read", owner, authorityPath].join(":") };
    edge.edge_digest = canonicalDigest(edge);
    edges.set(stableCanonicalJson(edge), edge);
  }
  const privateEntries = [...privateEntryPaths].map((path) => assertPortableRelativePath(path, "private evaluator entry path")).sort();
  if (new Set(privateEntries).size !== privateEntries.length) throw new Error("private evaluator entry paths contain duplicates");
  if (privateEntries.length > 0) {
    const privateRuntimeEdge = {
      from: "scripts/ask-benchmark-private-evaluator-runner.mjs",
      to: PRIVATE_EVALUATOR_VIRTUAL_PATH,
      kind: "runtime_private_import",
      specifier: "--verified-authority-payload",
      syntax_identity: "runtime_private_import:scripts/ask-benchmark-private-evaluator-runner.mjs:verified-authority-payload",
    };
    privateRuntimeEdge.edge_digest = canonicalDigest(privateRuntimeEdge);
    edges.set(stableCanonicalJson(privateRuntimeEdge), privateRuntimeEdge);
  }
  for (const path of privateEntries) {
    if (!nodePaths.has(path)) throw new Error(`private evaluator entry is outside the dependency graph: ${path}`);
    const edge = {
      from: PRIVATE_EVALUATOR_VIRTUAL_PATH,
      to: path,
      kind: "private_entry_import",
      specifier: path,
      syntax_identity: ["private_entry_import", PRIVATE_EVALUATOR_VIRTUAL_PATH, path].join(":"),
    };
    edge.edge_digest = canonicalDigest(edge);
    edges.set(stableCanonicalJson(edge), edge);
  }
  const casePaths = new Map();
  for (const path of nodePaths) {
    const folded = path.toLocaleLowerCase("en-US");
    if (casePaths.has(folded) && casePaths.get(folded) !== path) throw new Error(`evaluator dependency graph contains a case collision: ${casePaths.get(folded)} / ${path}`);
    casePaths.set(folded, path);
  }
  const nodeInventory = [...nodePaths].sort().map((path) => {
    const bytes = readFileSync(resolve(canonicalRoot, path));
    const committed = checkedInBytesAtRevision(canonicalRoot, baseRevision, path);
    return {
      path,
      bytes: bytes.length,
      sha256: rawByteDigest(bytes),
      file_type: dependencyFileType(path, authorities),
      base_git_revision_bytes: committed.length,
      base_git_revision_sha256: rawByteDigest(committed),
    };
  });
  const edgeInventory = [...edges.values()].sort((left, right) => stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)));
  const graph = { entry_paths: entries, node_inventory: nodeInventory, edge_inventory: edgeInventory };
  return { ...graph, graph_digest: canonicalDigest(graph) };
}

export function validateEvaluatorSourceIdentity({ identity, root, expectedRevision = null, expectedGeneratorSourceDigest = null, label = "evaluator source identity" }) {
  if (!identity || typeof identity !== "object" || !Array.isArray(identity.source_files) || identity.source_files.length === 0 || !identity.dependency_graph) throw new Error(`${label} is missing or empty`);
  if (expectedRevision && identity.base_git_revision !== expectedRevision) throw new Error(`${label} base Git revision drift`);
  if (expectedGeneratorSourceDigest && identity.generator_source_digest !== expectedGeneratorSourceDigest) throw new Error(`${label} generator source digest drift`);
  const sourceFiles = identity.source_files.map((entry) => ({ path: assertPortableRelativePath(entry.path, `${label} source path`), bytes: entry.bytes, sha256: entry.sha256 }));
  const sorted = [...sourceFiles].sort((left, right) => left.path.localeCompare(right.path));
  if (stableCanonicalJson(sourceFiles) !== stableCanonicalJson(sorted)) throw new Error(`${label} source inventory is not deterministically ordered`);
  if (new Set(sourceFiles.map(({ path }) => path)).size !== sourceFiles.length) throw new Error(`${label} source inventory contains duplicate paths`);
  if (identity.source_tree_digest !== canonicalDigest(sourceFiles)) throw new Error(`${label} source-tree digest closure is invalid`);
  for (const entry of sourceFiles) {
    const path = resolveAuthorityArtifactPath(realpathSync(root), entry.path, `${label} source`);
    const actual = streamingFileDigest(path, `${label} source ${entry.path}`);
    if (actual.bytes !== entry.bytes || actual.digest !== entry.sha256) throw new Error(`${label} source bytes drift at ${entry.path}`);
    const committed = checkedInBytesAtRevision(realpathSync(root), identity.base_git_revision, entry.path);
    if (!committed) throw new Error(`${label} base Git revision or source path is unavailable at ${entry.path}`);
    if (committed.length !== entry.bytes || rawByteDigest(committed) !== entry.sha256) throw new Error(`${label} source bytes do not match the immutable base Git revision at ${entry.path}`);
  }
  const graph = deriveEvaluatorDependencyGraph({ root, baseRevision: identity.base_git_revision });
  if (stableCanonicalJson(identity.dependency_graph) !== stableCanonicalJson(graph)) throw new Error(`${label} dependency graph closure is invalid`);
  const graphSourceFiles = graph.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  if (stableCanonicalJson(sourceFiles) !== stableCanonicalJson(graphSourceFiles)) throw new Error(`${label} source inventory does not match the dependency graph`);
  return structuredClone(identity);
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

export function readEvaluatorAuthorityAnchorFromFreeze({
  root,
  freezeManifestPath,
  freezeManifestSourceDigest = null,
  referencePath = null,
  label = "external evaluator freeze authority",
} = {}) {
  const freeze = readAnchoredFreezeManifest({ root, freezeManifestPath, freezeManifestSourceDigest });
  const { authorityRoot, manifest: freezeManifest } = freeze;
  if (!freezeManifest.evaluator_authority_manifest) throw new Error(`${label} evaluator authority manifest reference is missing`);
  if (!freezeManifest.evaluator_public_reference) throw new Error(`${label} evaluator public reference is missing`);
  const evaluatorReferenceSource = readFrozenJsonArtifact({
    authorityRoot,
    root,
    reference: freezeManifest.evaluator_public_reference,
    suppliedPath: referencePath ?? resolve(authorityRoot, freezeManifest.evaluator_public_reference.path),
    schemaPath: EVALUATOR_REFERENCE_SCHEMA_PATH,
    label: `${label} evaluator public reference`,
    publicArtifact: true,
  });
  if (evaluatorReferenceSource.value.public_metadata_digest !== computeEvaluatorReferenceDigest(evaluatorReferenceSource.value) || freezeManifest.evaluator_public_reference.semantic_digest !== evaluatorReferenceSource.value.public_metadata_digest) throw new Error(`${label} evaluator public reference semantic closure is invalid`);
  const manifestReference = freezeManifest.evaluator_authority_manifest;
  const manifestSource = readFrozenJsonArtifact({
    authorityRoot,
    root,
    reference: manifestReference,
    suppliedPath: resolve(authorityRoot, manifestReference.path),
    schemaPath: EVALUATOR_AUTHORITY_MANIFEST_SCHEMA_PATH,
    label: `${label} evaluator authority manifest`,
    publicArtifact: true,
  });
  const buffers = new Map(EVALUATOR_AUTHORITY_BINDING_PATHS.map((path) => {
    const absolute = resolveAuthorityArtifactPath(authorityRoot, path, `${label} evaluator authority binding ${path}`);
    return [path, Buffer.from(readStableFile(absolute, `${label} evaluator authority binding ${path}`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false }).bytes)];
  }));
  const anchor = buildVerifiedEvaluatorAuthorityAnchor({
    evaluatorRevision: evaluatorReferenceSource.value.evaluator_revision,
    evaluatorReference: evaluatorReferenceSource.value,
    manifestReference,
    manifestSource,
    buffers,
    root,
    label,
  });
  for (const [field, expected] of [
    ["evaluator_authority_manifest_path", anchor.evaluator_authority_manifest_path],
    ["evaluator_authority_manifest_raw_sha256", anchor.evaluator_authority_manifest_raw_sha256],
    ["evaluator_authority_manifest_digest", anchor.evaluator_authority_manifest_digest],
  ]) if (evaluatorReferenceSource.value[field] !== expected) throw new Error(`${label} evaluator public reference ${field} does not match the external freeze authority`);
  return anchor;
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

export function readStableWorkspaceInventory(root, label = "workspace authority") {
  const canonicalRoot = assertRealDirectory(root, `${label} root`);
  const rootBefore = lstatSync(canonicalRoot);
  const entries = [];
  const buffers = new Map();
  const inodePaths = new Map();
  const casePaths = new Map();
  const visit = (directory) => {
    const parentBefore = lstatSync(directory);
    if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) throw new Error(`${label} contains an invalid directory`);
    const children = readdirSync(directory).sort((left, right) => left.localeCompare(right));
    for (const name of children) {
      const absolute = resolve(directory, name);
      const path = relative(canonicalRoot, absolute).split(sep).join("/");
      assertPortableRelativePath(path, `${label} path`);
      const folded = path.toLocaleLowerCase("en-US");
      if (casePaths.has(folded) && casePaths.get(folded) !== path) throw new Error(`${label} contains a case collision: ${casePaths.get(folded)} / ${path}`);
      casePaths.set(folded, path);
      const status = lstatSync(absolute);
      if (status.isSymbolicLink() || status.isFIFO() || status.isSocket() || status.isBlockDevice() || status.isCharacterDevice()) throw new Error(`${label} contains a prohibited filesystem entry: ${path}`);
      const mode = status.mode & 0o777;
      if (status.isDirectory()) {
        entries.push({ path, file_type: "directory", mode, dev: status.dev, ino: status.ino, nlink: status.nlink, mtimeMs: status.mtimeMs, ctimeMs: status.ctimeMs, bytes: null, sha256: null });
        visit(absolute);
      } else if (status.isFile()) {
        if (status.nlink > 1) throw new Error(`${label} contains an implicit hard-link authority: ${path}`);
        const stable = readStableFile(absolute, `${label} file ${path}`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: true });
        const final = lstatSync(absolute);
        if (final.dev !== status.dev || final.ino !== status.ino || final.mode !== status.mode || final.nlink !== status.nlink || final.mtimeMs !== status.mtimeMs || final.ctimeMs !== status.ctimeMs) throw new Error(`${label} file identity changed during inventory: ${path}`);
        buffers.set(path, Buffer.from(stable.bytes));
        entries.push({ path, file_type: "file", mode, dev: status.dev, ino: status.ino, nlink: status.nlink, mtimeMs: status.mtimeMs, ctimeMs: status.ctimeMs, bytes: stable.bytes.length, sha256: stable.rawByteDigest });
        const inodeKey = `${status.dev}:${status.ino}`;
        if (inodePaths.has(inodeKey)) throw new Error(`${label} contains hard-linked paths: ${inodePaths.get(inodeKey)} / ${path}`);
        inodePaths.set(inodeKey, path);
      } else throw new Error(`${label} contains a non-regular entry: ${path}`);
      if (entries.length > MAX_BOUNDARY_FILES) throw new Error(`${label} exceeds the boundary inspection file-count limit`);
    }
    const parentAfter = lstatSync(directory);
    if (parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino || parentAfter.mtimeMs !== parentBefore.mtimeMs || parentAfter.ctimeMs !== parentBefore.ctimeMs) throw new Error(`${label} parent directory changed during inventory`);
  };
  visit(canonicalRoot);
  const rootAfter = lstatSync(canonicalRoot);
  if (rootAfter.dev !== rootBefore.dev || rootAfter.ino !== rootBefore.ino || rootAfter.nlink !== rootBefore.nlink || rootAfter.mtimeMs !== rootBefore.mtimeMs || rootAfter.ctimeMs !== rootBefore.ctimeMs) throw new Error(`${label} root identity changed during inventory`);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const portableEntries = entries.map(({ path, file_type, mode, bytes, sha256 }) => ({ path, file_type, mode, bytes, sha256 }));
  const runtimeEntries = entries.map(({ path, file_type, mode, dev, ino, nlink, mtimeMs, ctimeMs, bytes, sha256 }) => ({ path, file_type, mode, dev, ino, nlink, mtimeMs, ctimeMs, bytes, sha256 }));
  return {
    root: canonicalRoot,
    entries,
    portableEntries,
    runtimeEntries,
    buffers,
    digest: canonicalDigest(portableEntries),
    runtimeDigest: canonicalDigest(runtimeEntries),
    rootIdentity: {
      dev: rootBefore.dev,
      ino: rootBefore.ino,
      nlink: rootBefore.nlink,
      mode: rootBefore.mode,
      mtimeMs: rootBefore.mtimeMs,
      ctimeMs: rootBefore.ctimeMs,
    },
  };
}

function filesystemIdentity(status) {
  return {
    dev: status.dev,
    ino: status.ino,
    nlink: status.nlink,
    mode: status.mode,
    size: status.size,
    mtimeMs: status.mtimeMs,
    ctimeMs: status.ctimeMs,
  };
}

function sameFilesystemIdentity(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right);
}

function assertFreshPath(path, label) {
  try {
    lstatSync(path);
    throw new Error(`${label} already exists`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function assertRealParentDirectory(path, label) {
  const parent = dirname(path);
  assertRealDirectory(parent, `${label} parent`);
  return parent;
}

function sealedFileMode(path, executablePaths = SEALED_EXECUTABLE_PATHS) {
  return executablePaths.includes(path) ? SEALED_EXECUTABLE_FILE_MODE : SEALED_REGULAR_FILE_MODE;
}

function expectedSealedPortableEntries(inventory, executablePaths, label) {
  const allowed = [...executablePaths].map((path) => assertPortableRelativePath(path, `${label} executable path`)).sort();
  if (new Set(allowed).size !== allowed.length) throw new Error(`${label} executable allowlist contains duplicates`);
  const filePaths = new Set(inventory.entries.filter(({ file_type }) => file_type === "file").map(({ path }) => path));
  for (const path of allowed) if (!filePaths.has(path)) throw new Error(`${label} executable allowlist contains a non-file path: ${path}`);
  return inventory.entries.map(({ path, file_type, bytes, sha256 }) => ({
    path,
    file_type,
    mode: file_type === "directory" ? SEALED_DIRECTORY_MODE : sealedFileMode(path, allowed),
    bytes,
    sha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

export function assertSealedSnapshotModes(inventory, { executablePaths = SEALED_EXECUTABLE_PATHS, label = "sealed snapshot" } = {}) {
  const allowed = new Set(executablePaths);
  if ((inventory.rootIdentity.mode & 0o777) !== SEALED_DIRECTORY_MODE) throw new Error(`${label} root directory mode is not sealed`);
  for (const entry of inventory.portableEntries) {
    if ((entry.mode & 0o222) !== 0) throw new Error(`${label} retains a write bit at ${entry.path}`);
    if (entry.file_type === "directory") {
      if (entry.mode !== SEALED_DIRECTORY_MODE) throw new Error(`${label} directory mode is not sealed at ${entry.path}`);
      continue;
    }
    const expected = allowed.has(entry.path) ? SEALED_EXECUTABLE_FILE_MODE : SEALED_REGULAR_FILE_MODE;
    if (entry.mode !== expected) throw new Error(`${label} file mode is not sealed at ${entry.path}`);
    if (!allowed.has(entry.path) && (entry.mode & 0o111) !== 0) throw new Error(`${label} contains an unexpected executable bit at ${entry.path}`);
  }
  return true;
}

export function materializeSealedFile({ bytes, destination, label = "sealed file", mode = SEALED_REGULAR_FILE_MODE, allowEmpty = false } = {}) {
  if (!Buffer.isBuffer(bytes) || (!allowEmpty && bytes.length === 0)) throw new Error(`${label} requires ${allowEmpty ? "verified" : "non-empty verified"} bytes`);
  if (![SEALED_REGULAR_FILE_MODE, SEALED_EXECUTABLE_FILE_MODE].includes(mode)) throw new Error(`${label} mode is outside the closed sealed-file policy`);
  assertFreshPath(destination, label);
  const parent = assertRealParentDirectory(destination, label);
  let descriptor;
  try {
    descriptor = openSync(destination, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(destination, mode & 0o777);
  try {
    const parentDescriptor = openSync(parent, fsConstants.O_RDONLY);
    try { fsyncSync(parentDescriptor); } finally { closeSync(parentDescriptor); }
  } catch {
    // Some filesystems do not allow fsync on directory descriptors. The file fsync above remains mandatory.
  }
  const verified = readStableFile(destination, label, MAX_BOUNDARY_FILE_BYTES, { allowEmpty });
  if (Buffer.compare(verified.bytes, bytes) !== 0) throw new Error(`${label} sealed bytes do not match the verified source`);
  if ((verified.evidence.finalPath.mode & 0o777) !== mode) throw new Error(`${label} sealed mode does not match the requested mode`);
  return {
    path: verified.path,
    bytes: verified.bytes.length,
    sha256: verified.rawByteDigest,
    identity: filesystemIdentity(verified.evidence.finalPath),
  };
}

function comparePortableInventories(expected, actual, label) {
  if (stableCanonicalJson(expected.portableEntries) !== stableCanonicalJson(actual.portableEntries)) throw new Error(`${label} portable inventory does not match the verified source`);
}

export function materializeSealedWorkspaceSnapshot({ inventory, destination, label = "sealed workspace snapshot", executablePaths = SEALED_EXECUTABLE_PATHS } = {}) {
  if (!inventory || !Array.isArray(inventory.entries) || !(inventory.buffers instanceof Map)) throw new Error(`${label} requires a verified workspace inventory`);
  const expectedPortableEntries = expectedSealedPortableEntries(inventory, executablePaths, label);
  assertFreshPath(destination, label);
  const parent = dirname(destination);
  assertRealDirectory(parent, `${label} parent`);
  mkdirSync(destination, 0o700);
  for (const entry of inventory.entries.filter(({ file_type }) => file_type === "directory").sort((left, right) => left.path.localeCompare(right.path))) {
    const directory = resolve(destination, entry.path);
    assertFreshPath(directory, `${label} directory ${entry.path}`);
    mkdirSync(directory, 0o700);
  }
  for (const entry of inventory.entries.filter(({ file_type }) => file_type === "file").sort((left, right) => left.path.localeCompare(right.path))) {
    const file = resolve(destination, entry.path);
    const content = inventory.buffers.get(entry.path);
    if (!content) throw new Error(`${label} verified bytes are missing for ${entry.path}`);
    materializeSealedFile({ bytes: content, destination: file, label: `${label} file ${entry.path}`, mode: sealedFileMode(entry.path, executablePaths), allowEmpty: true });
  }
  for (const entry of inventory.entries.filter(({ file_type }) => file_type === "directory").sort((left, right) => right.path.split("/").length - left.path.split("/").length || right.path.localeCompare(left.path))) chmodSync(resolve(destination, entry.path), SEALED_DIRECTORY_MODE);
  chmodSync(destination, SEALED_DIRECTORY_MODE);
  const sealedInventory = readStableWorkspaceInventory(destination, label);
  comparePortableInventories({ portableEntries: expectedPortableEntries }, sealedInventory, label);
  assertSealedSnapshotModes(sealedInventory, { executablePaths, label });
  return sealedInventory;
}

function descriptorFileRecord(path, read, executablePaths = SEALED_EXECUTABLE_PATHS) {
  return {
    path,
    file_type: "file",
    mode: sealedFileMode(path, executablePaths),
    bytes: read.bytes.length,
    sha256: read.rawByteDigest,
  };
}

function descriptorDirectoryEntries(filePaths) {
  const directories = new Map();
  for (const path of filePaths) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join("/");
      directories.set(directory, {
        path: directory,
        file_type: "directory",
        mode: SEALED_DIRECTORY_MODE,
        bytes: null,
        sha256: null,
      });
    }
  }
  return [...directories.values()];
}

function assertDescriptorInventoryClosed({ inventory, descriptorPath, label }) {
  const actual = inventory.portableEntries.filter(({ path }) => path !== descriptorPath);
  if (stableCanonicalJson(actual) !== stableCanonicalJson(inventory.expectedPortableEntries)) throw new Error(`${label} portable inventory drifted from the sealed descriptor authority`);
  const extra = inventory.portableEntries.filter(({ path }) => path !== descriptorPath && !inventory.expectedPathSet.has(path));
  if (extra.length > 0) throw new Error(`${label} contains an unmanaged authority path: ${extra[0].path}`);
}

function assertSortedUniquePaths(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const paths = entries.map(({ path }) => assertPortableRelativePath(path, `${label} path`));
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains duplicate paths`);
  if (stableCanonicalJson(paths) !== stableCanonicalJson([...paths].sort())) throw new Error(`${label} is not deterministically ordered`);
  return paths;
}

function assertDescriptorModePolicy(descriptor, label) {
  const expected = {
    regular_file_mode: SEALED_REGULAR_FILE_MODE,
    executable_file_mode: SEALED_EXECUTABLE_FILE_MODE,
    directory_mode: SEALED_DIRECTORY_MODE,
    executable_paths: [...SEALED_EXECUTABLE_PATHS],
  };
  if (stableCanonicalJson(descriptor.sealed_mode_policy) !== stableCanonicalJson(expected)) throw new Error(`${label} sealed mode policy is invalid`);
  if (descriptor.execution_authority_transport !== "in_memory_byte_map_v1") throw new Error(`${label} execution authority transport is invalid`);
}

export function validateSealedRepositoryAuthorityBytes({
  descriptor,
  buffers,
  actualInventory = null,
  expectedSourceGraphDigest = null,
  expectedEvaluatorRevision = null,
  rootForSchema = null,
  label = "sealed repository authority",
} = {}) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) throw new Error(`${label} descriptor is missing`);
  const { authority_digest: authorityDigest, ...descriptorBase } = descriptor;
  if (authorityDigest !== canonicalDigest(descriptorBase)) throw new Error(`${label} descriptor digest closure is invalid`);
  if (descriptor.schema_version !== "1.0.0" || descriptor.program !== "adaptive_ask_sealed_repository_authority") throw new Error(`${label} descriptor contract is invalid`);
  if (expectedEvaluatorRevision && descriptor.evaluator_revision !== expectedEvaluatorRevision) throw new Error(`${label} evaluator revision does not match immutable authority`);
  assertDescriptorModePolicy(descriptor, label);

  const graph = descriptor.source_graph;
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw new Error(`${label} source graph is missing`);
  const { graph_digest: graphDigest, ...graphBase } = graph;
  if (graphDigest !== canonicalDigest(graphBase) || descriptor.source_graph_digest !== graphDigest) throw new Error(`${label} source graph digest closure is invalid`);
  if (expectedSourceGraphDigest && graphDigest !== expectedSourceGraphDigest) throw new Error(`${label} source graph does not match immutable evaluator authority`);
  const graphPaths = assertSortedUniquePaths(graph.node_inventory, `${label} source graph node inventory`);
  const graphPathSet = new Set(graphPaths);
  const graphByPath = new Map(graph.node_inventory.map((entry) => [entry.path, entry]));
  const sortedEdges = [...(graph.edge_inventory ?? [])].sort((left, right) => stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)));
  if (stableCanonicalJson(graph.edge_inventory) !== stableCanonicalJson(sortedEdges)) throw new Error(`${label} source graph edge inventory is not deterministically ordered`);
  for (const edge of graph.edge_inventory ?? []) {
    const { edge_digest: edgeDigest, ...edgeBase } = edge;
    if (edgeDigest !== canonicalDigest(edgeBase)) throw new Error(`${label} source graph edge digest is invalid`);
    const ordinary = ["static_import", "export_from", "dynamic_import", "authority_read"].includes(edge.kind) && graphPathSet.has(edge.from) && graphPathSet.has(edge.to);
    const privateRuntime = edge.kind === "runtime_private_import" && graphPathSet.has(edge.from) && edge.to === PRIVATE_EVALUATOR_VIRTUAL_PATH;
    const privateEntry = edge.kind === "private_entry_import" && edge.from === PRIVATE_EVALUATOR_VIRTUAL_PATH && graphPathSet.has(edge.to);
    if (!ordinary && !privateRuntime && !privateEntry) throw new Error(`${label} source graph edge escapes the closed module graph`);
  }
  for (const path of EVALUATOR_PRIVATE_ENTRY_PATHS) {
    if (!(graph.edge_inventory ?? []).some((edge) => edge.kind === "private_entry_import" && edge.from === PRIVATE_EVALUATOR_VIRTUAL_PATH && edge.to === path)) throw new Error(`${label} source graph is missing private entry edge ${path}`);
  }

  const descriptorInventory = descriptor.inventory;
  const inventoryPaths = assertSortedUniquePaths(descriptorInventory, `${label} descriptor inventory`);
  const fileEntries = descriptorInventory.filter(({ file_type }) => file_type === "file");
  const directoryEntries = descriptorInventory.filter(({ file_type }) => file_type === "directory");
  if (fileEntries.length + directoryEntries.length !== descriptorInventory.length) throw new Error(`${label} descriptor inventory contains an invalid file type`);
  const fileByPath = new Map(fileEntries.map((entry) => [entry.path, entry]));
  const fixturePaths = (descriptor.fixture_authority ?? []).map(({ path }) => path);
  if (stableCanonicalJson(fixturePaths) !== stableCanonicalJson(EVALUATOR_FIXTURE_AUTHORITY_PATHS)) throw new Error(`${label} fixture authority path inventory is not closed`);
  if (descriptor.fixture_authority_digest !== canonicalDigest(descriptor.fixture_authority)) throw new Error(`${label} fixture authority digest closure is invalid`);
  if (stableCanonicalJson(descriptor.runtime_authority_paths) !== stableCanonicalJson(EVALUATOR_RUNTIME_AUTHORITY_PATHS)) throw new Error(`${label} runtime authority path inventory is not closed`);
  const expectedFilePaths = [...new Set([...graphPaths, ...fixturePaths, ...EVALUATOR_RUNTIME_AUTHORITY_PATHS])].sort();
  if (stableCanonicalJson(fileEntries.map(({ path }) => path)) !== stableCanonicalJson(expectedFilePaths)) throw new Error(`${label} graph, fixture, and file inventories are not exactly cross-bound`);
  const expectedDirectories = descriptorDirectoryEntries(expectedFilePaths).sort((left, right) => left.path.localeCompare(right.path));
  if (stableCanonicalJson(directoryEntries) !== stableCanonicalJson(expectedDirectories)) throw new Error(`${label} directory inventory is not exactly closed over authority files`);
  for (const entry of descriptorInventory) {
    if ((entry.mode & 0o222) !== 0) throw new Error(`${label} descriptor retains a write bit at ${entry.path}`);
    if (entry.file_type === "directory" && entry.mode !== SEALED_DIRECTORY_MODE) throw new Error(`${label} descriptor directory mode is invalid at ${entry.path}`);
    if (entry.file_type === "file") {
      const expectedMode = sealedFileMode(entry.path);
      if (entry.mode !== expectedMode) throw new Error(`${label} descriptor file mode is invalid at ${entry.path}`);
      if (!SEALED_EXECUTABLE_PATHS.includes(entry.path) && (entry.mode & 0o111) !== 0) throw new Error(`${label} descriptor contains an unexpected executable bit at ${entry.path}`);
    }
  }
  for (const node of graph.node_inventory) {
    const inventoryEntry = fileByPath.get(node.path);
    if (!inventoryEntry || inventoryEntry.file_type !== "file" || inventoryEntry.bytes !== node.bytes || inventoryEntry.sha256 !== node.sha256) throw new Error(`${label} source graph node is not cross-bound to executable bytes at ${node.path}`);
    const expectedType = dependencyFileType(node.path, EVALUATOR_AUTHORITY_PATHS);
    if (node.file_type !== expectedType) throw new Error(`${label} source graph file type is invalid at ${node.path}`);
  }
  for (const fixture of descriptor.fixture_authority) {
    const inventoryEntry = fileByPath.get(fixture.path);
    if (!inventoryEntry || stableCanonicalJson(fixture) !== stableCanonicalJson(inventoryEntry)) throw new Error(`${label} fixture authority is not cross-bound to sealed bytes at ${fixture.path}`);
  }

  if (!(buffers instanceof Map)) throw new Error(`${label} requires a descriptor-stable verified byte map`);
  const expectedBufferPaths = [...expectedFilePaths, EVALUATOR_REPOSITORY_DESCRIPTOR_PATH].sort();
  if (stableCanonicalJson([...buffers.keys()].sort()) !== stableCanonicalJson(expectedBufferPaths)) throw new Error(`${label} verified byte map is not closed`);
  for (const entry of fileEntries) {
    const bytes = buffers.get(entry.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== entry.bytes || rawByteDigest(bytes) !== entry.sha256) throw new Error(`${label} verified bytes do not match the descriptor inventory at ${entry.path}`);
  }
  const descriptorBytes = buffers.get(EVALUATOR_REPOSITORY_DESCRIPTOR_PATH);
  if (!Buffer.isBuffer(descriptorBytes)) throw new Error(`${label} descriptor bytes are absent from the verified byte map`);
  const parsedDescriptor = jsonValueFromVerifiedBytes(descriptorBytes, `${label} descriptor bytes`);
  if (stableCanonicalJson(parsedDescriptor) !== stableCanonicalJson(descriptor)) throw new Error(`${label} parsed descriptor does not match the verified descriptor bytes`);

  if (descriptor.evaluator_authority_manifest_path !== EVALUATOR_AUTHORITY_MANIFEST_PATH) throw new Error(`${label} evaluator authority manifest path is invalid`);
  const manifestBytes = buffers.get(EVALUATOR_AUTHORITY_MANIFEST_PATH);
  if (descriptor.evaluator_authority_manifest_raw_sha256 !== rawByteDigest(manifestBytes)) throw new Error(`${label} evaluator authority manifest raw binding is invalid`);
  const manifest = jsonValueFromVerifiedBytes(manifestBytes, `${label} evaluator authority manifest`);
  if (descriptor.evaluator_authority_manifest_digest !== manifest.manifest_digest) throw new Error(`${label} evaluator authority manifest semantic binding is invalid`);
  validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision: descriptor.evaluator_revision, root: rootForSchema, label: `${label} evaluator authority manifest` });

  if (actualInventory) {
    const actualWithoutDescriptor = actualInventory.filter(({ path }) => path !== EVALUATOR_REPOSITORY_DESCRIPTOR_PATH);
    if (stableCanonicalJson(actualWithoutDescriptor) !== stableCanonicalJson(descriptorInventory)) throw new Error(`${label} actual inventory does not match the descriptor inventory`);
    const actualDescriptor = actualInventory.find(({ path }) => path === EVALUATOR_REPOSITORY_DESCRIPTOR_PATH);
    if (!actualDescriptor || actualDescriptor.file_type !== "file" || actualDescriptor.mode !== SEALED_REGULAR_FILE_MODE || actualDescriptor.bytes !== descriptorBytes.length || actualDescriptor.sha256 !== rawByteDigest(descriptorBytes)) throw new Error(`${label} descriptor file identity is invalid`);
  }
  return { descriptor: structuredClone(descriptor), graphByPath, fileByPath, manifest };
}

function buildRepositoryAuthoritySource({ root, evaluatorRevision, externalAuthorityAnchor, label }) {
  const repositoryRoot = assertRealDirectory(root, `${label} source root`);
  const anchor = assertExternalEvaluatorAuthorityAnchor(externalAuthorityAnchor, label);
  if (anchor.evaluator_revision !== evaluatorRevision) throw new Error(`${label} evaluator revision does not match the external freeze authority`);
  const rootBefore = filesystemIdentity(lstatSync(repositoryRoot));
  const graph = deriveEvaluatorDependencyGraph({ root: repositoryRoot, baseRevision: evaluatorRevision });
  const graphPaths = graph.node_inventory.map(({ path }) => path);
  const fixturePaths = [...EVALUATOR_FIXTURE_AUTHORITY_PATHS];
  const runtimePaths = [...EVALUATOR_RUNTIME_AUTHORITY_PATHS];
  const allPaths = [...new Set([...graphPaths, ...fixturePaths, ...runtimePaths])].sort();
  const pathSet = new Set(allPaths);
  const buffers = new Map();
  const records = new Map();
  for (const path of allPaths) {
    assertPortableRelativePath(path, `${label} source path`);
    const absolute = resolveAuthorityArtifactPath(repositoryRoot, path, `${label} source ${path}`);
    const read = readStableFile(absolute, `${label} source ${path}`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
    const graphNode = graph.node_inventory.find((node) => node.path === path);
    const fixtureAuthority = fixturePaths.includes(path);
    const committed = graphNode || fixtureAuthority ? checkedInBytesAtRevision(repositoryRoot, evaluatorRevision, path) : null;
    if ((graphNode || fixtureAuthority) && !committed) throw new Error(`${label} source authority path is absent from the immutable evaluator revision at ${path}`);
    if (graphNode && Buffer.compare(committed, read.bytes) !== 0) {
      throw new Error(`${label} source authority does not match the immutable evaluator revision at ${path}`);
    }
    if (fixtureAuthority && Buffer.compare(committed, read.bytes) !== 0) {
      const externalIdentity = externalAuthorityIdentityForPath(anchor, path);
      if (!externalIdentity || externalIdentity.bytes !== read.bytes.length || externalIdentity.raw_sha256 !== read.rawByteDigest) throw new Error(`${label} fixture authority does not match the immutable evaluator revision or external freeze authority at ${path}`);
    }
    if (graphNode && (graphNode.bytes !== read.bytes.length || graphNode.sha256 !== read.rawByteDigest)) throw new Error(`${label} dependency graph source identity drifted at ${path}`);
    buffers.set(path, Buffer.from(read.bytes));
    records.set(path, descriptorFileRecord(path, read));
  }
  if (pathSet.size !== buffers.size) throw new Error(`${label} source authority inventory contains duplicate paths`);
  const evaluatorAuthorityManifest = jsonValueFromVerifiedBytes(buffers.get(EVALUATOR_AUTHORITY_MANIFEST_PATH), `${label} evaluator authority manifest`);
  validateEvaluatorAuthorityManifest({ manifest: evaluatorAuthorityManifest, buffers, evaluatorRevision, root: repositoryRoot, label: `${label} evaluator authority manifest` });
  const fileEntries = [...records.values()].sort((left, right) => left.path.localeCompare(right.path));
  const expectedPortableEntries = [...descriptorDirectoryEntries(allPaths), ...fileEntries].sort((left, right) => left.path.localeCompare(right.path));
  const fixtureEntries = fixturePaths.map((path) => records.get(path));
  const fixtureAuthorityDigest = canonicalDigest(fixtureEntries);
  const sourceRuntimeEntries = allPaths.map((path) => {
    const absolute = resolve(repositoryRoot, path);
    const status = lstatSync(absolute);
    return { path, file_type: "file", mode: status.mode & 0o777, dev: status.dev, ino: status.ino, nlink: status.nlink, mtimeMs: status.mtimeMs, ctimeMs: status.ctimeMs, bytes: status.size, sha256: records.get(path).sha256 };
  });
  const descriptorBase = {
    schema_version: "1.0.0",
    schema_path: "sealed-repository-authority-contract-v1",
    program: "adaptive_ask_sealed_repository_authority",
    evaluator_revision: evaluatorRevision,
    source_graph_digest: graph.graph_digest,
    source_graph: graph,
    fixture_authority_digest: fixtureAuthorityDigest,
    fixture_authority: fixtureEntries,
    evaluator_authority_manifest_path: EVALUATOR_AUTHORITY_MANIFEST_PATH,
    evaluator_authority_manifest_raw_sha256: rawByteDigest(buffers.get(EVALUATOR_AUTHORITY_MANIFEST_PATH)),
    evaluator_authority_manifest_digest: evaluatorAuthorityManifest.manifest_digest,
    runtime_authority_paths: runtimePaths,
    sealed_mode_policy: {
      regular_file_mode: SEALED_REGULAR_FILE_MODE,
      executable_file_mode: SEALED_EXECUTABLE_FILE_MODE,
      directory_mode: SEALED_DIRECTORY_MODE,
      executable_paths: [...SEALED_EXECUTABLE_PATHS],
    },
    execution_authority_transport: "in_memory_byte_map_v1",
    inventory: expectedPortableEntries,
  };
  const descriptor = { ...descriptorBase, authority_digest: canonicalDigest(descriptorBase) };
  const descriptorBytes = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
  const externalVerificationBuffers = new Map(buffers);
  externalVerificationBuffers.set(EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, descriptorBytes);
  verifySealedEvaluatorExternalAuthority({ descriptor, buffers: externalVerificationBuffers, externalAuthorityAnchor: anchor, label });
  const rootAfter = filesystemIdentity(lstatSync(repositoryRoot));
  if (!sameFilesystemIdentity(rootBefore, rootAfter)) throw new Error(`${label} source root identity changed while sealing repository authority`);
  const sourceInventory = {
    root: repositoryRoot,
    entries: expectedPortableEntries.map((entry) => ({ ...entry, dev: 0, ino: 1, nlink: 1, mtimeMs: 0, ctimeMs: 0 })),
    portableEntries: expectedPortableEntries,
    runtimeEntries: sourceRuntimeEntries,
    buffers,
    digest: canonicalDigest(expectedPortableEntries),
    runtimeDigest: canonicalDigest(sourceRuntimeEntries),
    rootIdentity: rootBefore,
    expectedPortableEntries,
    expectedPathSet: new Set(expectedPortableEntries.map(({ path }) => path)),
  };
  return { graph, fixtureEntries, fixtureAuthorityDigest, evaluatorAuthorityManifest, descriptor, descriptorBytes, sourceInventory };
}

export function materializeSealedRepositorySnapshot({ authority, destination, label = "sealed repository authority" } = {}) {
  if (!authority?.sourceInventory || !Buffer.isBuffer(authority.descriptorBytes)) throw new Error(`${label} requires a verified repository authority descriptor`);
  const descriptorEntry = {
    path: EVALUATOR_REPOSITORY_DESCRIPTOR_PATH,
    file_type: "file",
    mode: SEALED_REGULAR_FILE_MODE,
    bytes: authority.descriptorBytes.length,
    sha256: rawByteDigest(authority.descriptorBytes),
  };
  const combinedEntries = [...authority.sourceInventory.entries, { ...descriptorEntry, dev: 0, ino: 1, nlink: 1, mtimeMs: 0, ctimeMs: 0 }].sort((left, right) => left.path.localeCompare(right.path));
  const combinedPortableEntries = [...authority.sourceInventory.portableEntries, descriptorEntry].sort((left, right) => left.path.localeCompare(right.path));
  const combinedBuffers = new Map(authority.sourceInventory.buffers);
  combinedBuffers.set(EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, Buffer.from(authority.descriptorBytes));
  const combinedInventory = { ...authority.sourceInventory, entries: combinedEntries, portableEntries: combinedPortableEntries, buffers: combinedBuffers };
  const sealed = materializeSealedWorkspaceSnapshot({ inventory: combinedInventory, destination, label: `${label} sealed snapshot` });
  const descriptorPath = resolve(destination, EVALUATOR_REPOSITORY_DESCRIPTOR_PATH);
  const descriptorRead = readStableFile(descriptorPath, `${label} descriptor`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  sealed.expectedPortableEntries = authority.sourceInventory.portableEntries;
  sealed.expectedPathSet = authority.sourceInventory.expectedPathSet;
  assertDescriptorInventoryClosed({ inventory: sealed, descriptorPath: EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, label });
  if (sealed.portableEntries.length !== authority.sourceInventory.portableEntries.length + 1) throw new Error(`${label} contains an unexpected sealed repository entry`);
  validateSealedRepositoryAuthorityBytes({ descriptor: authority.descriptor, buffers: sealed.buffers, actualInventory: sealed.portableEntries, expectedSourceGraphDigest: authority.graph.graph_digest, expectedEvaluatorRevision: authority.descriptor.evaluator_revision, rootForSchema: null, label });
  return {
    ...sealedSnapshotBinding(sealed),
    path: sealed.root,
    descriptorPath: descriptorRead.path,
    descriptorRelativePath: EVALUATOR_REPOSITORY_DESCRIPTOR_PATH,
    descriptorBytes: descriptorRead.bytes.length,
    descriptorSha256: descriptorRead.rawByteDigest,
    base: sealed,
    sealed,
    sourceGraphDigest: authority.graph.graph_digest,
    fixtureAuthorityDigest: authority.fixtureAuthorityDigest,
    evaluatorAuthorityManifestRawSha256: authority.descriptor.evaluator_authority_manifest_raw_sha256,
    evaluatorAuthorityManifestDigest: authority.descriptor.evaluator_authority_manifest_digest,
    authorityDigest: authority.descriptor.authority_digest,
  };
}

function readSealedRepositoryDescriptor(root, label = "sealed repository authority", { expectedSourceGraphDigest = null, expectedEvaluatorRevision = null, rootForSchema = null } = {}) {
  const repositoryRoot = assertRealDirectory(root, `${label} root`);
  const descriptorPath = resolveAuthorityArtifactPath(repositoryRoot, EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, `${label} descriptor`);
  const descriptorRead = readJsonArtifact(descriptorPath, `${label} descriptor`);
  const inventory = readStableWorkspaceInventory(repositoryRoot, `${label} inventory`);
  inventory.expectedPortableEntries = descriptorRead.value.inventory;
  inventory.expectedPathSet = new Set(descriptorRead.value.inventory.map(({ path }) => path));
  assertDescriptorInventoryClosed({ inventory, descriptorPath: EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, label });
  assertSealedSnapshotModes(inventory, { label });
  validateSealedRepositoryAuthorityBytes({ descriptor: descriptorRead.value, buffers: inventory.buffers, actualInventory: inventory.portableEntries, expectedSourceGraphDigest, expectedEvaluatorRevision, rootForSchema, label });
  return { repositoryRoot, descriptorPath, descriptorRead, descriptor: descriptorRead.value, inventory };
}

function runtimeIdentityFromStableRead(read) {
  return filesystemIdentity(read.evidence.finalPath);
}

function assertRuntimeIdentityBinding(actual, expected, label) {
  if (!expected || !sameFilesystemIdentity(actual, expected)) throw new Error(`${label} runtime identity binding is invalid`);
}

function assertWorkspaceRuntimeBinding(actual, expected, label) {
  if (!expected || actual.digest !== expected.portable_digest || actual.runtimeDigest !== expected.runtime_digest || !sameFilesystemIdentity(actual.rootIdentity, expected.root)) throw new Error(`${label} sealed snapshot identity binding is invalid`);
}

function sealedSnapshotBinding(inventory) {
  return {
    portable_digest: inventory.digest,
    runtime_digest: inventory.runtimeDigest,
    root: inventory.rootIdentity,
  };
}

function workspaceDiffEntries(frozenEntries, candidateEntries) {
  const frozen = new Map(frozenEntries.map((entry) => [entry.path, entry]));
  const candidate = new Map(candidateEntries.map((entry) => [entry.path, entry]));
  return [...new Set([...frozen.keys(), ...candidate.keys()])].sort().flatMap((path) => {
    const before = frozen.get(path) ?? null;
    const after = candidate.get(path) ?? null;
    if (!before) return [{ path, change_type: "addition", before, after }];
    if (!after) return [{ path, change_type: "deletion", before, after }];
    if (stableCanonicalJson(before) !== stableCanonicalJson(after)) return [{ path, change_type: "modification", before, after }];
    return [];
  });
}

const VERIFIED_TERMINAL_CANDIDATE_AUTHORITY_FIELDS = Object.freeze([
  "kind", "source_snapshot_digest", "normalized_result_id", "normalized_result_digest", "run_instance_id", "case_id", "attempt", "adapter", "condition", "fixture_id", "fixture_input_digest", "materialization_manifest_digest", "request_digest", "raw_result_digest", "terminal_commit_digest", "terminal_case_state_digest", "terminal_workspace_authority_digest", "terminal_workspace_authority_raw_sha256", "terminal_workspace_authority_bytes", "terminal_workspace_authority_base64", "terminal_candidate_tree_digest", "reconstructed_candidate_portable_digest", "candidate_authority_portable_digest",
]);

function validateCandidateAuthorityBinding(candidateAuthority, candidate, lineage, label) {
  if (candidateAuthority?.kind === "direct_test_workspace") {
    if (stableCanonicalJson(candidateAuthority) !== stableCanonicalJson({ kind: "direct_test_workspace" })) throw new Error(`${label} direct workspace authority is test-only and must not carry production assertions`);
    return structuredClone(candidateAuthority);
  }
  if (candidateAuthority?.kind !== "verified_terminal_candidate") throw new Error(`${label} candidate authority kind is invalid`);
  const keys = Object.keys(candidateAuthority).sort();
  const expectedKeys = [...VERIFIED_TERMINAL_CANDIDATE_AUTHORITY_FIELDS].sort();
  if (stableCanonicalJson(keys) !== stableCanonicalJson(expectedKeys)) throw new Error(`${label} verified terminal candidate authority is incomplete`);
  if (candidateAuthority.run_instance_id !== lineage.run_instance_id || candidateAuthority.case_id !== lineage.case_id || candidateAuthority.attempt !== lineage.attempt) throw new Error(`${label} verified terminal candidate lineage is inconsistent`);
  if (candidateAuthority.candidate_authority_portable_digest !== candidate.digest) throw new Error(`${label} candidate authority portable digest is inconsistent`);
  const bytes = Buffer.from(candidateAuthority.terminal_workspace_authority_base64, "base64");
  if (bytes.length !== candidateAuthority.terminal_workspace_authority_bytes || bytes.toString("base64") !== candidateAuthority.terminal_workspace_authority_base64 || rawByteDigest(bytes) !== candidateAuthority.terminal_workspace_authority_raw_sha256) throw new Error(`${label} terminal workspace authority byte binding is invalid`);
  let terminalAuthority;
  try { terminalAuthority = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} terminal workspace authority bytes are invalid JSON`); }
  for (const [field, value] of Object.entries({
    run_instance_id: candidateAuthority.run_instance_id,
    case_id: candidateAuthority.case_id,
    attempt: candidateAuthority.attempt,
    adapter: candidateAuthority.adapter,
    condition: candidateAuthority.condition,
    fixture_id: candidateAuthority.fixture_id,
    fixture_input_digest: candidateAuthority.fixture_input_digest,
    materialization_manifest_digest: candidateAuthority.materialization_manifest_digest,
    authority_digest: candidateAuthority.terminal_workspace_authority_digest,
    authority_bytes: candidateAuthority.terminal_workspace_authority_bytes,
    terminal_candidate_tree_digest: candidateAuthority.terminal_candidate_tree_digest,
  })) if (terminalAuthority[field] !== value) throw new Error(`${label} terminal workspace authority ${field} binding is inconsistent`);
  return structuredClone(candidateAuthority);
}

function buildOriginalWorkspaceAuthority({ frozen, candidate, lineage, candidateAuthority = { kind: "direct_test_workspace" } }) {
  if (!lineage?.run_instance_id || !lineage?.case_id || !lineage?.attempt) throw new Error("original workspace authority requires closed evaluation lineage");
  const closedCandidateAuthority = validateCandidateAuthorityBinding(candidateAuthority, candidate, lineage, "original workspace authority");
  const diffEntries = workspaceDiffEntries(frozen.portableEntries, candidate.portableEntries);
  const repositoryDiffClosure = {
    schema_version: "1.0.0",
    schema_path: REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH,
    program: "adaptive_ask_repository_diff_artifact",
    run_instance_id: lineage.run_instance_id,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    frozen_workspace_tree_digest: frozen.digest,
    candidate_workspace_tree_digest: candidate.digest,
    candidate_authority: closedCandidateAuthority,
    diff_entries: diffEntries,
  };
  const repositoryDiffArtifact = {
    ...repositoryDiffClosure,
    artifact_digest: canonicalDigest(diffEntries),
    artifact_bytes: Buffer.byteLength(stableCanonicalJson(diffEntries)) || 1,
  };
  const closure = {
    schema_version: "1.0.0",
    schema_path: ORIGINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH,
    program: "adaptive_ask_original_workspace_authority",
    frozen_workspace_portable_digest: frozen.digest,
    candidate_workspace_portable_digest: candidate.digest,
    candidate_authority: closedCandidateAuthority,
    frozen_inventory: frozen.portableEntries,
    candidate_inventory: candidate.portableEntries,
    diff_entries: diffEntries,
    repository_diff_artifact: {
      path: SEALED_REPOSITORY_DIFF_ARTIFACT_PATH,
      digest: repositoryDiffArtifact.artifact_digest,
      bytes: repositoryDiffArtifact.artifact_bytes,
    },
  };
  return {
    authority: {
      ...closure,
      authority_digest: canonicalDigest(closure),
      authority_bytes: Buffer.byteLength(stableCanonicalJson(closure)) || 1,
    },
    repositoryDiffArtifact,
  };
}

function privateOriginalWorkspaceSnapshot(frozen, candidate, lineage, candidateAuthority) {
  const snapshot = (inventory) => ({
    portableEntries: structuredClone(inventory.portableEntries),
    digest: inventory.digest,
    buffers: new Map([...inventory.buffers].map(([path, bytes]) => [path, Buffer.from(bytes)])),
  });
  return { frozen: snapshot(frozen), candidate: snapshot(candidate), lineage: structuredClone(lineage), candidateAuthority: structuredClone(candidateAuthority) };
}

function materializeOriginalWorkspaceAuthority({ executionRoot, frozen, candidate, lineage, candidateAuthority, label }) {
  const values = buildOriginalWorkspaceAuthority({ frozen, candidate, lineage, candidateAuthority });
  const destination = resolve(executionRoot, "original-workspace-authority");
  assertFreshPath(destination, `${label} original workspace authority root`);
  mkdirSync(destination, 0o700);
  for (const [path, value] of [
    [ORIGINAL_WORKSPACE_AUTHORITY_PATH, values.authority],
    [SEALED_REPOSITORY_DIFF_ARTIFACT_PATH, values.repositoryDiffArtifact],
  ]) materializeSealedFile({
    bytes: Buffer.from(`${AUTHORITY_JSON_STRINGIFY(value, null, 2)}\n`),
    destination: resolve(destination, path),
    label: `${label} ${path}`,
    allowEmpty: false,
  });
  chmodSync(destination, SEALED_DIRECTORY_MODE);
  const inventory = readStableWorkspaceInventory(destination, `${label} original workspace authority`);
  assertSealedSnapshotModes(inventory, { label: `${label} original workspace authority` });
  return { ...values, inventory };
}

function validateOriginalWorkspaceAuthority({ inventory, frozen, candidate, lineage, candidateAuthority, root, label, originalSource = null }) {
  assertSealedSnapshotModes(inventory, { label: `${label} original workspace authority` });
  const paths = inventory.portableEntries.map(({ path }) => path);
  if (stableCanonicalJson(paths) !== stableCanonicalJson([ORIGINAL_WORKSPACE_AUTHORITY_PATH, SEALED_REPOSITORY_DIFF_ARTIFACT_PATH])) throw new Error(`${label} original workspace authority inventory is not closed`);
  const authorityBytes = inventory.buffers.get(ORIGINAL_WORKSPACE_AUTHORITY_PATH);
  const repositoryDiffBytes = inventory.buffers.get(SEALED_REPOSITORY_DIFF_ARTIFACT_PATH);
  if (!authorityBytes || !repositoryDiffBytes) throw new Error(`${label} original workspace authority bytes are incomplete`);
  const authority = jsonValueFromVerifiedBytes(authorityBytes, `${label} original workspace authority`);
  const repositoryDiffArtifact = jsonValueFromVerifiedBytes(repositoryDiffBytes, `${label} repository diff artifact`);
  assertBenchmarkSchemaInstance(authority, { schemaPath: resolve(root, ORIGINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH), label: `${label} original workspace authority` });
  assertBenchmarkSchemaInstance(repositoryDiffArtifact, { schemaPath: resolve(root, REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH), label: `${label} repository diff artifact` });
  const { authority_digest: authorityDigest, authority_bytes: authorityByteCount, ...closure } = authority;
  if (authorityDigest !== canonicalDigest(closure) || authorityByteCount !== (Buffer.byteLength(stableCanonicalJson(closure)) || 1)) throw new Error(`${label} original workspace authority digest or byte closure is invalid`);
  for (const [entries, expected, kind] of [[authority.frozen_inventory, frozen, "frozen"], [authority.candidate_inventory, candidate, "candidate"]]) {
    assertSortedUniquePaths(entries, `${label} original ${kind} inventory`);
    if (canonicalDigest(entries) !== authority[`${kind}_workspace_portable_digest`]) throw new Error(`${label} original ${kind} portable digest is invalid`);
    if (stableCanonicalJson(entries.map(({ path, file_type, bytes, sha256 }) => ({ path, file_type, bytes, sha256 }))) !== stableCanonicalJson(expected.portableEntries.map(({ path, file_type, bytes, sha256 }) => ({ path, file_type, bytes, sha256 })))) throw new Error(`${label} original ${kind} bytes or file types do not match the sealed workspace`);
    for (const entry of expected.portableEntries) {
      const sealedMode = entry.file_type === "file" ? SEALED_REGULAR_FILE_MODE : SEALED_DIRECTORY_MODE;
      if (entry.mode !== sealedMode) throw new Error(`${label} sealed ${kind} execution mode is invalid`);
    }
  }
  const expected = buildOriginalWorkspaceAuthority({
    frozen: { portableEntries: authority.frozen_inventory, digest: authority.frozen_workspace_portable_digest },
    candidate: { portableEntries: authority.candidate_inventory, digest: authority.candidate_workspace_portable_digest },
    lineage,
    candidateAuthority,
  });
  if (stableCanonicalJson(authority) !== stableCanonicalJson(expected.authority) || stableCanonicalJson(repositoryDiffArtifact) !== stableCanonicalJson(expected.repositoryDiffArtifact)) throw new Error(`${label} original workspace authority or repository diff artifact is stale`);
  if (originalSource) {
    if (stableCanonicalJson(originalSource.lineage) !== stableCanonicalJson(lineage) || stableCanonicalJson(originalSource.candidateAuthority) !== stableCanonicalJson(candidateAuthority) || stableCanonicalJson(authority.frozen_inventory) !== stableCanonicalJson(originalSource.frozen.portableEntries) || stableCanonicalJson(authority.candidate_inventory) !== stableCanonicalJson(originalSource.candidate.portableEntries) || authority.frozen_workspace_portable_digest !== originalSource.frozen.digest || authority.candidate_workspace_portable_digest !== originalSource.candidate.digest) throw new Error(`${label} original workspace authority is detached from module-owned source metadata`);
    for (const [kind, source, sealed] of [["frozen", originalSource.frozen, frozen], ["candidate", originalSource.candidate, candidate]]) for (const [path, bytes] of source.buffers) {
      const sealedBytes = sealed.buffers.get(path);
      if (!sealedBytes || Buffer.compare(bytes, sealedBytes) !== 0) throw new Error(`${label} original ${kind} bytes are detached from sealed content: ${path}`);
    }
  }
  if (authority.repository_diff_artifact.digest !== repositoryDiffArtifact.artifact_digest || authority.repository_diff_artifact.bytes !== repositoryDiffArtifact.artifact_bytes) throw new Error(`${label} repository diff artifact is detached from original workspace authority`);
  return { authority, authorityBytes, repositoryDiffArtifact, repositoryDiffBytes };
}

function relativeAuthorityPath(root, path, label) {
  const value = relative(root, path).split(sep).join("/");
  assertPortableRelativePath(value, `${label} relative path`);
  if (!isInside(root, path)) throw new Error(`${label} escapes its authority root`);
  return value;
}

function assertSourceBytesAtRevision(root, revision, relativePath, bytes, label) {
  const committed = checkedInBytesAtRevision(root, revision, relativePath);
  if (!committed || Buffer.compare(committed, bytes) !== 0) throw new Error(`${label} does not match the immutable base Git revision`);
  return { bytes: committed.length, sha256: rawByteDigest(committed) };
}

function validatePrivateBundleByteMap({ inventory, evaluatorRevision, hiddenAsset, externalAuthorityAnchor, root, label }) {
  if (!inventory || !(inventory.buffers instanceof Map)) throw new Error(`${label} private bundle byte map is missing`);
  const manifestPath = "private-evaluator-bundle.json";
  const manifestBytes = inventory.buffers.get(manifestPath);
  if (!Buffer.isBuffer(manifestBytes)) throw new Error(`${label} private bundle manifest is missing`);
  const manifest = jsonValueFromVerifiedBytes(manifestBytes, `${label} private bundle manifest`);
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH), label: `${label} private bundle manifest` });
  const sortedAssets = [...manifest.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (stableCanonicalJson(manifest.asset_inventory) !== stableCanonicalJson(sortedAssets)) throw new Error(`${label} private bundle asset inventory is not deterministically ordered`);
  assertUniqueValues(manifest.asset_inventory.map(({ role }) => role), `${label} private bundle asset roles`);
  assertUniqueValues(manifest.asset_inventory.map(({ path }) => path), `${label} private bundle asset paths`);
  const expectedPaths = [manifestPath, ...manifest.asset_inventory.map(({ path }) => path)].sort();
  const actualPaths = inventory.portableEntries.filter(({ file_type }) => file_type === "file").map(({ path }) => path).sort();
  if (stableCanonicalJson(actualPaths) !== stableCanonicalJson(expectedPaths)) throw new Error(`${label} private bundle byte-map inventory is not closed`);
  for (const asset of manifest.asset_inventory) {
    const bytes = inventory.buffers.get(asset.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== asset.bytes || rawByteDigest(bytes) !== asset.sha256) throw new Error(`${label} private bundle asset bytes are inconsistent for ${asset.role}`);
  }
  if (manifest.evaluator_revision !== evaluatorRevision || manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest) || manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) throw new Error(`${label} private bundle identity closure is invalid`);
  const reference = assertExternalEvaluatorAuthorityAnchor(externalAuthorityAnchor, label).evaluator_reference;
  if (manifest.evaluator_bundle_id !== reference.evaluator_bundle_id || manifest.evaluator_bundle_digest !== reference.evaluator_bundle_digest || manifest.evaluator_revision !== reference.evaluator_revision || stableCanonicalJson(manifest.evaluator_source_identity) !== stableCanonicalJson(reference.evaluator_source_identity) || stableCanonicalJson(manifest.dependency_graph) !== stableCanonicalJson(reference.evaluator_source_identity.dependency_graph)) throw new Error(`${label} private bundle does not match the external evaluator public reference`);
  const manifestHiddenAsset = manifest.asset_inventory.find(({ role }) => role === "hidden_tests");
  if (!manifestHiddenAsset || (hiddenAsset && stableCanonicalJson({ path: hiddenAsset.path, bytes: hiddenAsset.bytes, sha256: hiddenAsset.sha256 }) !== stableCanonicalJson({ path: manifestHiddenAsset.path, bytes: manifestHiddenAsset.bytes, sha256: manifestHiddenAsset.sha256 }))) throw new Error(`${label} hidden evaluator manifest authority is inconsistent`);
  return { manifest, manifestPath, manifestBytes, hiddenAsset: manifestHiddenAsset };
}

function createSealedEvaluatorExecutionFromWorkspaceSources({
  root,
  privateEvaluationRoot,
  privateRoot,
  hiddenAsset,
  frozenWorkspace,
  candidateWorkspace,
  evaluationInputRoot,
  evaluationLineage,
  candidateAuthority = { kind: "direct_test_workspace" },
  evaluatorRevision,
  externalAuthorityAnchor,
  executionDirectoryName = "sealed-execution",
  label = "private evaluator sealed execution",
} = {}) {
  const evaluationRoot = assertRealDirectory(privateEvaluationRoot, `${label} authority root`);
  const staticRoot = assertRealDirectory(privateRoot, `${label} static bundle root`);
  const anchor = assertExternalEvaluatorAuthorityAnchor(externalAuthorityAnchor, label);
  if (pathsOverlap(evaluationRoot, staticRoot)) throw new Error(`${label} authority root overlaps the static evaluator bundle`);
  if (!hiddenAsset?.path || !/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error(`${label} hidden asset or evaluator revision is invalid`);
  const hiddenPath = resolveAuthorityArtifactPath(staticRoot, hiddenAsset.path, `${label} hidden evaluator`);
  const hiddenRead = readStableFile(hiddenPath, `${label} hidden evaluator`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  if (hiddenRead.rawByteDigest !== hiddenAsset.sha256 || hiddenRead.bytes.length !== hiddenAsset.bytes) throw new Error(`${label} hidden evaluator source identity is inconsistent`);
  const privateBundleSource = readStableWorkspaceInventory(staticRoot, `${label} static private bundle`);
  const privateBundleAuthority = validatePrivateBundleByteMap({ inventory: privateBundleSource, evaluatorRevision, hiddenAsset, externalAuthorityAnchor: anchor, root: realpathSync(root), label });
  const runnerRelativePath = "scripts/ask-benchmark-private-evaluator-runner.mjs";
  const repositoryRoot = assertRealDirectory(root, `${label} repository root`);
  const repositoryAuthority = buildRepositoryAuthoritySource({ root: repositoryRoot, evaluatorRevision, externalAuthorityAnchor: anchor, label });
  const runnerPath = resolveAuthorityArtifactPath(repositoryRoot, runnerRelativePath, `${label} runner source`);
  const runnerRead = readStableFile(runnerPath, `${label} runner source`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const runnerRevision = assertSourceBytesAtRevision(repositoryRoot, evaluatorRevision, runnerRelativePath, runnerRead.bytes, `${label} runner source`);
  const frozenSource = readStableWorkspaceInventory(frozenWorkspace, `${label} frozen workspace source`);
  const candidateSource = readStableWorkspaceInventory(candidateWorkspace, `${label} candidate workspace source`);
  const evidenceSource = readStableWorkspaceInventory(evaluationInputRoot, `${label} evaluation-input evidence source`);
  const closedEvaluationLineage = evaluationLineage && { run_instance_id: evaluationLineage.run_instance_id, case_id: evaluationLineage.case_id, attempt: evaluationLineage.attempt };
  assertPortableRelativePath(executionDirectoryName, `${label} execution directory`);
  const executionRoot = resolve(evaluationRoot, executionDirectoryName);
  assertFreshPath(executionRoot, `${label} root`);
  mkdirSync(executionRoot, 0o755);
  const runner = materializeSealedFile({ bytes: runnerRead.bytes, destination: resolve(executionRoot, "runner.mjs"), label: `${label} runner sealed copy`, mode: SEALED_REGULAR_FILE_MODE });
  const privateBundle = materializeSealedWorkspaceSnapshot({ inventory: privateBundleSource, destination: resolve(executionRoot, "private-bundle"), label: `${label} private bundle sealed snapshot` });
  const hidden = readStableFile(resolve(privateBundle.root, hiddenAsset.path), `${label} hidden evaluator sealed copy`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  if (hidden.rawByteDigest !== hiddenAsset.sha256 || hidden.bytes.length !== hiddenAsset.bytes) throw new Error(`${label} hidden evaluator sealed copy does not match the verified source`);
  const hiddenIdentity = runtimeIdentityFromStableRead(hidden);
  const frozen = materializeSealedWorkspaceSnapshot({ inventory: frozenSource, destination: resolve(executionRoot, "frozen-workspace"), label: `${label} frozen workspace sealed snapshot` });
  const candidate = materializeSealedWorkspaceSnapshot({ inventory: candidateSource, destination: resolve(executionRoot, "candidate-workspace"), label: `${label} candidate workspace sealed snapshot` });
  const evidence = materializeSealedWorkspaceSnapshot({ inventory: evidenceSource, destination: resolve(executionRoot, "evaluation-input-evidence"), label: `${label} evaluation-input evidence sealed snapshot` });
  const originalWorkspaceAuthority = materializeOriginalWorkspaceAuthority({ executionRoot, frozen: frozenSource, candidate: candidateSource, lineage: closedEvaluationLineage, candidateAuthority, label });
  const repository = materializeSealedRepositorySnapshot({ authority: repositoryAuthority, destination: resolve(executionRoot, "repository"), label: `${label} repository authority sealed snapshot` });
  verifySealedEvaluatorExternalAuthority({ descriptor: repositoryAuthority.descriptor, buffers: repository.sealed.buffers, externalAuthorityAnchor: anchor, label });
  const execution = {
    evaluationRoot,
    executionRoot,
    executionRootPath: relativeAuthorityPath(evaluationRoot, executionRoot, `${label} root`),
    evaluatorRevision,
    runner: {
      sourcePath: runnerRelativePath,
      sourceBytes: runnerRead.bytes.length,
      sourceSha256: runnerRead.rawByteDigest,
      baseGitRevisionBytes: runnerRevision.bytes,
      baseGitRevisionSha256: runnerRevision.sha256,
      path: runner.path,
      relativePath: relativeAuthorityPath(evaluationRoot, runner.path, `${label} runner sealed copy`),
      bytes: runner.bytes,
      sha256: runner.sha256,
      identityBefore: runner.identity,
      identityAfter: runner.identity,
    },
    hidden: {
      sourcePath: hiddenAsset.path,
      sourceBytes: hiddenRead.bytes.length,
      sourceSha256: hiddenRead.rawByteDigest,
      path: hidden.path,
      relativePath: relativeAuthorityPath(evaluationRoot, hidden.path, `${label} hidden sealed copy`),
      bytes: hidden.bytes.length,
      sha256: hidden.rawByteDigest,
      identityBefore: hiddenIdentity,
      identityAfter: hiddenIdentity,
    },
    privateBundle: {
      path: privateBundle.root,
      relativePath: relativeAuthorityPath(evaluationRoot, privateBundle.root, `${label} private bundle sealed snapshot`),
      manifestPath: privateBundleAuthority.manifestPath,
      manifestBytes: privateBundleAuthority.manifestBytes.length,
      manifestSha256: rawByteDigest(privateBundleAuthority.manifestBytes),
      evaluatorBundleId: privateBundleAuthority.manifest.evaluator_bundle_id,
      evaluatorBundleDigest: privateBundleAuthority.manifest.evaluator_bundle_digest,
      source: sealedSnapshotBinding(privateBundleSource),
      sealed: sealedSnapshotBinding(privateBundle),
    },
    repository: {
      path: repository.path,
      relativePath: relativeAuthorityPath(evaluationRoot, repository.path, `${label} repository authority sealed snapshot`),
      descriptorPath: repository.descriptorPath,
      descriptorRelativePath: relativeAuthorityPath(evaluationRoot, repository.descriptorPath, `${label} repository authority descriptor`),
      descriptorBytes: repository.descriptorBytes,
      descriptorSha256: repository.descriptorSha256,
      sourceGraphDigest: repository.sourceGraphDigest,
      fixtureAuthorityDigest: repository.fixtureAuthorityDigest,
      evaluatorAuthorityManifestPath: repositoryAuthority.descriptor.evaluator_authority_manifest_path,
      evaluatorAuthorityManifestRawSha256: repository.evaluatorAuthorityManifestRawSha256,
      evaluatorAuthorityManifestDigest: repository.evaluatorAuthorityManifestDigest,
      authorityDigest: repository.authorityDigest,
      source: sealedSnapshotBinding(repositoryAuthority.sourceInventory),
      sealed: sealedSnapshotBinding(repository.sealed),
      identityBefore: sealedSnapshotBinding(repository.sealed),
      identityAfterFirst: sealedSnapshotBinding(repository.sealed),
      identityAfterSecond: sealedSnapshotBinding(repository.sealed),
    },
    frozen: {
      source: sealedSnapshotBinding(frozenSource),
      sourcePath: frozenSource.root,
      path: frozen.root,
      relativePath: relativeAuthorityPath(evaluationRoot, frozen.root, `${label} frozen sealed snapshot`),
      sealed: sealedSnapshotBinding(frozen),
      identityBefore: sealedSnapshotBinding(frozen),
      identityAfter: sealedSnapshotBinding(frozen),
    },
    candidate: {
      source: sealedSnapshotBinding(candidateSource),
      sourcePath: candidateSource.root,
      path: candidate.root,
      relativePath: relativeAuthorityPath(evaluationRoot, candidate.root, `${label} candidate sealed snapshot`),
      sealed: sealedSnapshotBinding(candidate),
      identityBefore: sealedSnapshotBinding(candidate),
      identityAfter: sealedSnapshotBinding(candidate),
    },
    evidence: {
      source: sealedSnapshotBinding(evidenceSource),
      sourcePath: evidenceSource.root,
      path: evidence.root,
      relativePath: relativeAuthorityPath(evaluationRoot, evidence.root, `${label} evidence sealed snapshot`),
      sealed: sealedSnapshotBinding(evidence),
      identityBefore: sealedSnapshotBinding(evidence),
      identityAfter: sealedSnapshotBinding(evidence),
    },
    originalWorkspaceAuthority: {
      path: originalWorkspaceAuthority.inventory.root,
      relativePath: relativeAuthorityPath(evaluationRoot, originalWorkspaceAuthority.inventory.root, `${label} original workspace authority`),
      authorityPath: ORIGINAL_WORKSPACE_AUTHORITY_PATH,
      authoritySha256: rawByteDigest(originalWorkspaceAuthority.inventory.buffers.get(ORIGINAL_WORKSPACE_AUTHORITY_PATH)),
      authorityBytes: originalWorkspaceAuthority.inventory.buffers.get(ORIGINAL_WORKSPACE_AUTHORITY_PATH).length,
      authorityDigest: originalWorkspaceAuthority.authority.authority_digest,
      repositoryDiffPath: SEALED_REPOSITORY_DIFF_ARTIFACT_PATH,
      repositoryDiffSha256: rawByteDigest(originalWorkspaceAuthority.inventory.buffers.get(SEALED_REPOSITORY_DIFF_ARTIFACT_PATH)),
      repositoryDiffBytes: originalWorkspaceAuthority.inventory.buffers.get(SEALED_REPOSITORY_DIFF_ARTIFACT_PATH).length,
      repositoryDiffDigest: originalWorkspaceAuthority.repositoryDiffArtifact.artifact_digest,
      sealed: sealedSnapshotBinding(originalWorkspaceAuthority.inventory),
      lineage: structuredClone(closedEvaluationLineage),
      candidateAuthority: structuredClone(candidateAuthority),
    },
  };
  ORIGINAL_EXECUTION_AUTHORITIES.set(execution, privateOriginalWorkspaceSnapshot(frozenSource, candidateSource, closedEvaluationLineage, candidateAuthority));
  return execution;
}

export function createSealedEvaluatorExecutionForTest(options = {}) {
  return createSealedEvaluatorExecutionFromWorkspaceSources({
    ...options,
    candidateAuthority: { kind: "direct_test_workspace" },
  });
}

function terminalCandidateAuthorityBinding(materialized) {
  const verified = materialized.verified_authority;
  const normalized = verified.normalized_result;
  const lineage = normalized.lineage;
  const execution = verified.execution;
  const authority = verified.terminal_workspace_authority;
  const authorityBytes = Buffer.from(verified.terminal_workspace_authority_bytes);
  const reconstructedWorkspace = resolve(materialized.output_root, "workspace");
  const reconstructed = readStableWorkspaceInventory(reconstructedWorkspace, "verified terminal reconstructed candidate workspace");
  if (materialized.terminal_workspace_tree_digest !== authority.terminal_candidate_tree_digest || execution.terminal_workspace_tree_digest !== authority.terminal_candidate_tree_digest) throw new Error("verified terminal candidate tree digest is inconsistent");
  const binding = {
    kind: "verified_terminal_candidate",
    source_snapshot_digest: verified.source_snapshot_digest,
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    adapter: lineage.adapter_track,
    condition: lineage.condition,
    fixture_id: lineage.fixture_id,
    fixture_input_digest: lineage.fixture_input_digest,
    materialization_manifest_digest: lineage.materialization_manifest_digest,
    request_digest: lineage.request_digest,
    raw_result_digest: lineage.raw_result_digest,
    terminal_commit_digest: lineage.terminal_commit_digest,
    terminal_case_state_digest: verified.terminal_case_state_digest,
    terminal_workspace_authority_digest: authority.authority_digest,
    terminal_workspace_authority_raw_sha256: rawByteDigest(authorityBytes),
    terminal_workspace_authority_bytes: authorityBytes.length,
    terminal_workspace_authority_base64: authorityBytes.toString("base64"),
    terminal_candidate_tree_digest: authority.terminal_candidate_tree_digest,
    reconstructed_candidate_portable_digest: reconstructed.digest,
    candidate_authority_portable_digest: null,
  };
  for (const [field, value] of Object.entries({
    run_instance_id: execution.run_instance_id,
    case_id: execution.case_id,
    attempt: execution.attempt,
    adapter: execution.adapter,
    condition: execution.condition,
    fixture_id: execution.fixture_id,
    fixture_input_digest: execution.fixture_input_digest,
    materialization_manifest_digest: execution.materialization_manifest_digest,
    request_digest: execution.request_digest,
    raw_result_digest: execution.raw_result_digest,
    terminal_commit_digest: execution.terminal_commit_digest,
    terminal_workspace_authority_digest: execution.terminal_workspace_authority_digest,
    terminal_candidate_tree_digest: execution.terminal_workspace_tree_digest,
    terminal_workspace_authority_bytes: execution.terminal_workspace_authority_bytes,
  })) if (binding[field] !== value) throw new Error(`verified terminal candidate ${field} is inconsistent`);
  let parsedAuthority;
  try { parsedAuthority = JSON.parse(authorityBytes.toString("utf8")); }
  catch { throw new Error("verified terminal workspace authority bytes are invalid JSON"); }
  if (stableCanonicalJson(parsedAuthority) !== stableCanonicalJson(authority)) throw new Error("verified terminal workspace authority object is detached from its bytes");
  return { binding, reconstructedWorkspace, reconstructed, authority };
}

function terminalCandidateInventoryFromAuthority(authority) {
  const terminal = new Map(authority.base_inventory.map((entry) => [entry.path, structuredClone(entry)]));
  for (const delta of authority.delta_inventory) {
    if (delta.change_type === "deletion") terminal.delete(delta.path);
    else {
      const { content_base64: ignoredContent, ...after } = delta.after;
      terminal.set(delta.path, { path: delta.path, ...after });
    }
  }
  const inventory = [...terminal.values()].sort((left, right) => left.path.localeCompare(right.path));
  if (terminalWorkspaceInventoryDigest(inventory) !== authority.terminal_workspace_portable_digest) throw new Error("terminal workspace authority inventory closure is inconsistent");
  const candidate = deriveTerminalCandidateInventory(inventory, authority.managed_asset_paths, authority.base_inventory);
  if (terminalWorkspaceInventoryDigest(candidate) !== authority.terminal_candidate_tree_digest) throw new Error("terminal candidate original metadata closure is inconsistent");
  return candidate;
}

function materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot, terminal }) {
  const parent = mkdtempSync(resolve(evaluationRoot, ".production-candidate-authority-"));
  const destination = resolve(parent, "workspace");
  cpSync(terminal.reconstructedWorkspace, destination, { recursive: true, errorOnExist: true, force: false });
  const terminalInventory = terminalCandidateInventoryFromAuthority(terminal.authority);
  const workspaceRoot = terminalInventory.find(({ path }) => path === "workspace");
  const inventory = terminalInventory.filter(({ path }) => path.startsWith("workspace/")).map((entry) => ({ ...entry, path: entry.path.slice("workspace/".length) }));
  for (const entry of inventory.filter(({ file_type: fileType }) => fileType === "regular_file")) chmodSync(resolve(destination, entry.path), Number.parseInt(entry.mode, 8));
  for (const entry of inventory.filter(({ file_type: fileType }) => fileType === "directory").sort((left, right) => right.path.length - left.path.length)) chmodSync(resolve(destination, entry.path), Number.parseInt(entry.mode, 8));
  chmodSync(destination, workspaceRoot ? Number.parseInt(workspaceRoot.mode, 8) : 0o755);
  const materialized = readStableWorkspaceInventory(destination, "verified terminal candidate metadata authority workspace");
  const expected = inventory.map((entry) => ({ path: entry.path, file_type: entry.file_type === "regular_file" ? "file" : "directory", mode: Number.parseInt(entry.mode, 8), bytes: entry.bytes, sha256: entry.sha256 === null ? null : `sha256:${entry.sha256}` }));
  if (stableCanonicalJson(materialized.portableEntries) !== stableCanonicalJson(expected) || materialized.digest !== canonicalDigest(expected)) throw new Error("terminal candidate metadata authority workspace is inconsistent");
  return materialized;
}

function materializeVerifiedFrozenAuthorityWorkspace({ evaluationRoot, source }) {
  const parent = mkdtempSync(resolve(evaluationRoot, ".production-frozen-authority-"));
  const destination = resolve(parent, "workspace");
  cpSync(source.root, destination, { recursive: true, errorOnExist: true, force: false });
  const materialized = readStableWorkspaceInventory(destination, "verified frozen fixture metadata authority workspace");
  if (stableCanonicalJson(materialized.portableEntries) !== stableCanonicalJson(source.portableEntries) || materialized.digest !== source.digest) throw new Error("verified frozen fixture metadata authority workspace is inconsistent");
  return materialized;
}

export function createProductionSealedEvaluatorExecution(options = {}) {
  for (const forbidden of ["candidateWorkspace", "candidateMutator", "evaluationInputRoot", "normalizedResult", "caseId", "attempt"]) {
    if (Object.hasOwn(options, forbidden)) throw new Error(`production sealed evaluator rejects caller-supplied ${forbidden}`);
  }
  const evaluationRoot = assertRealDirectory(options.privateEvaluationRoot, "production private evaluation authority root");
  const materialized = materializeVerifiedTerminalCandidate({
    root: options.root,
    config: options.config,
    planPath: options.planPath,
    materializedPath: options.materializedPath,
    selectionState: options.selectionState,
    runDir: options.runDir,
    normalizedResultsPath: options.normalizedResultsPath,
    sourceSnapshotDigest: options.sourceSnapshotDigest,
    normalizedResultId: options.normalizedResultId,
    outputParent: evaluationRoot,
    privateEvaluatorRoot: options.privateRoot,
  });
  const terminal = terminalCandidateAuthorityBinding(materialized);
  const candidateAuthorityWorkspace = materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot, terminal });
  terminal.binding.candidate_authority_portable_digest = candidateAuthorityWorkspace.digest;
  const evidenceRoot = mkdtempSync(resolve(evaluationRoot, ".production-evaluation-input-"));
  const verifiedFrozenSource = readStableWorkspaceInventory(resolve(options.materializedPath, terminal.binding.case_id, "workspace"), "verified frozen fixture workspace");
  const frozenAuthorityWorkspace = materializeVerifiedFrozenAuthorityWorkspace({ evaluationRoot, source: verifiedFrozenSource });
  const evidence = {
    schema_version: "1.0.0",
    program: "adaptive_ask_verified_terminal_evaluation_input",
    candidate_authority: terminal.binding,
  };
  writeFileSync(resolve(evidenceRoot, "verified-terminal-evaluation-input.json"), `${AUTHORITY_JSON_STRINGIFY(evidence, null, 2)}\n`, { flag: "wx", mode: 0o400 });
  const execution = createSealedEvaluatorExecutionFromWorkspaceSources({
    root: options.root,
    privateEvaluationRoot: evaluationRoot,
    privateRoot: options.privateRoot,
    hiddenAsset: options.hiddenAsset,
    frozenWorkspace: frozenAuthorityWorkspace.root,
    candidateWorkspace: candidateAuthorityWorkspace.root,
    evaluationInputRoot: evidenceRoot,
    evaluationLineage: terminal.binding,
    candidateAuthority: terminal.binding,
    evaluatorRevision: options.evaluatorRevision,
    externalAuthorityAnchor: options.externalAuthorityAnchor,
    executionDirectoryName: options.executionDirectoryName ?? "sealed-execution",
    label: options.label ?? "production private evaluator sealed execution",
  });
  PRODUCTION_EXECUTION_AUTHORITIES.set(execution, {
    normalized: structuredClone(materialized.verified_authority.normalized_result),
    normalizedBytes: Buffer.from(materialized.verified_authority.normalized_result_bytes),
    candidateAuthority: structuredClone(terminal.binding),
  });
  return execution;
}

function parseRunnerFragment(stdout, label) {
  assertNoDuplicateJsonObjectKeys(stdout, label);
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("fragment must be an object");
    return parsed;
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
}

function stableFragmentBytes(fragment) {
  return Buffer.from(`${AUTHORITY_JSON_STRINGIFY(fragment, null, 2)}\n`);
}

function captureVerifiedExecutionAuthority(execution, externalAuthorityAnchor, repositoryRoot, label) {
  const anchor = assertExternalEvaluatorAuthorityAnchor(externalAuthorityAnchor, label);
  const immutableRoot = assertRealDirectory(repositoryRoot, `${label} immutable repository root`);
  const runner = readStableFile(execution.runner.path, `${label} runner verified bytes`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const hidden = readStableFile(execution.hidden.path, `${label} hidden evaluator verified bytes`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const privateBundle = readStableWorkspaceInventory(execution.privateBundle.path, `${label} private bundle verified bytes`);
  const frozen = readStableWorkspaceInventory(execution.frozen.path, `${label} frozen workspace verified bytes`);
  const candidate = readStableWorkspaceInventory(execution.candidate.path, `${label} candidate workspace verified bytes`);
  const evidence = readStableWorkspaceInventory(execution.evidence.path, `${label} evaluation-input verified bytes`);
  const originalWorkspaceAuthority = readStableWorkspaceInventory(execution.originalWorkspaceAuthority.path, `${label} original workspace authority verified bytes`);
  for (const [kind, inventory] of [["private bundle", privateBundle], ["frozen workspace", frozen], ["candidate workspace", candidate], ["evaluation-input evidence", evidence], ["original workspace authority", originalWorkspaceAuthority]]) assertSealedSnapshotModes(inventory, { label: `${label} ${kind}` });
  const repository = readSealedRepositoryDescriptor(execution.repository.path, `${label} repository verified bytes`, {
    expectedSourceGraphDigest: execution.repository.sourceGraphDigest ?? null,
    expectedEvaluatorRevision: execution.evaluatorRevision ?? null,
  });
  const descriptor = repository.descriptor;
  if (execution.repository.descriptorSha256 !== repository.descriptorRead.rawByteDigest || execution.repository.descriptorBytes !== repository.descriptorRead.bytes.length) throw new Error(`${label} repository descriptor does not match its recorded execution authority`);
  const assertPortableRecord = (inventory, expected, kind) => {
    if (!expected || inventory.digest !== expected.portable_digest || (inventory.rootIdentity.mode & 0o777) !== (expected.root.mode & 0o777)) throw new Error(`${label} ${kind} does not match its recorded sealed authority`);
  };
  for (const [inventory, expected, kind] of [[repository.inventory, execution.repository.sealed, "repository"], [privateBundle, execution.privateBundle.sealed, "private bundle"], [frozen, execution.frozen.sealed, "frozen workspace"], [candidate, execution.candidate.sealed, "candidate workspace"], [evidence, execution.evidence.sealed, "evaluation-input evidence"], [originalWorkspaceAuthority, execution.originalWorkspaceAuthority.sealed, "original workspace authority"]]) assertPortableRecord(inventory, expected, kind);
  const originalSource = ORIGINAL_EXECUTION_AUTHORITIES.get(execution);
  if (!originalSource) throw new Error(`${label} module-owned original workspace authority is missing`);
  const originalAuthority = validateOriginalWorkspaceAuthority({ inventory: originalWorkspaceAuthority, frozen, candidate, lineage: execution.originalWorkspaceAuthority.lineage, candidateAuthority: execution.originalWorkspaceAuthority.candidateAuthority, root: immutableRoot, label, originalSource });
  if (execution.originalWorkspaceAuthority.authorityPath !== ORIGINAL_WORKSPACE_AUTHORITY_PATH || execution.originalWorkspaceAuthority.authoritySha256 !== rawByteDigest(originalAuthority.authorityBytes) || execution.originalWorkspaceAuthority.authorityBytes !== originalAuthority.authorityBytes.length || execution.originalWorkspaceAuthority.authorityDigest !== originalAuthority.authority.authority_digest || execution.originalWorkspaceAuthority.repositoryDiffPath !== SEALED_REPOSITORY_DIFF_ARTIFACT_PATH || execution.originalWorkspaceAuthority.repositoryDiffSha256 !== rawByteDigest(originalAuthority.repositoryDiffBytes) || execution.originalWorkspaceAuthority.repositoryDiffBytes !== originalAuthority.repositoryDiffBytes.length || execution.originalWorkspaceAuthority.repositoryDiffDigest !== originalAuthority.repositoryDiffArtifact.artifact_digest) throw new Error(`${label} original workspace authority does not match the execution record`);
  const runnerIdentity = runtimeIdentityFromStableRead(runner);
  const runnerRecordedIdentity = execution.runner.identityBefore;
  const runnerStableInodeMatches = runnerRecordedIdentity && ["dev", "ino", "nlink", "mode"].every((field) => runnerIdentity[field] === runnerRecordedIdentity[field]);
  if ((runnerIdentity.mode & 0o777) !== SEALED_REGULAR_FILE_MODE || runner.rawByteDigest !== execution.runner.sha256 || runner.bytes.length !== execution.runner.bytes || !runnerStableInodeMatches) throw new Error(`${label} runner verified bytes, mode, or inode do not match the execution record`);
  const runnerRevision = assertSourceBytesAtRevision(immutableRoot, execution.evaluatorRevision, execution.runner.sourcePath, runner.bytes, `${label} runner source`);
  if (execution.runner.sourceSha256 !== runner.rawByteDigest || execution.runner.sourceBytes !== runner.bytes.length || execution.runner.baseGitRevisionSha256 !== runnerRevision.sha256 || execution.runner.baseGitRevisionBytes !== runnerRevision.bytes) throw new Error(`${label} runner immutable revision identity is inconsistent`);
  const immutableSourceGraph = deriveEvaluatorDependencyGraph({ root: immutableRoot, baseRevision: execution.evaluatorRevision });
  if (stableCanonicalJson(descriptor.source_graph) !== stableCanonicalJson(immutableSourceGraph)) throw new Error(`${label} sealed source graph does not match the immutable evaluator revision`);
  const runnerNode = descriptor.source_graph.node_inventory.find(({ path }) => path === execution.runner.sourcePath);
  if (!runnerNode || runnerNode.bytes !== runner.bytes.length || runnerNode.sha256 !== runner.rawByteDigest || runnerNode.file_type !== "module") throw new Error(`${label} runner bytes are detached from the sealed dependency graph`);
  const privateAuthority = validatePrivateBundleByteMap({ inventory: privateBundle, evaluatorRevision: execution.evaluatorRevision, hiddenAsset: { path: execution.hidden.sourcePath, bytes: execution.hidden.sourceBytes, sha256: execution.hidden.sourceSha256 }, externalAuthorityAnchor: anchor, root: immutableRoot, label });
  if (execution.privateBundle.manifestPath !== privateAuthority.manifestPath || execution.privateBundle.manifestBytes !== privateAuthority.manifestBytes.length || execution.privateBundle.manifestSha256 !== rawByteDigest(privateAuthority.manifestBytes) || execution.privateBundle.evaluatorBundleId !== privateAuthority.manifest.evaluator_bundle_id || execution.privateBundle.evaluatorBundleDigest !== privateAuthority.manifest.evaluator_bundle_digest) throw new Error(`${label} private bundle manifest does not match the execution record`);
  const hiddenEvaluatorPath = privateAuthority.hiddenAsset.path;
  const expectedHiddenPath = resolveAuthorityArtifactPath(execution.privateBundle.path, hiddenEvaluatorPath, `${label} hidden evaluator sealed path`);
  if (expectedHiddenPath !== execution.hidden.path) throw new Error(`${label} hidden evaluator path is detached from the sealed private bundle`);
  const hiddenBytes = privateBundle.buffers.get(hiddenEvaluatorPath);
  const hiddenIdentity = runtimeIdentityFromStableRead(hidden);
  const hiddenRecordedIdentity = execution.hidden.identityBefore;
  const hiddenStableInodeMatches = hiddenRecordedIdentity && ["dev", "ino", "nlink", "mode"].every((field) => hiddenIdentity[field] === hiddenRecordedIdentity[field]);
  if ((hiddenIdentity.mode & 0o777) !== SEALED_REGULAR_FILE_MODE || !Buffer.isBuffer(hiddenBytes) || Buffer.compare(hidden.bytes, hiddenBytes) !== 0 || hidden.rawByteDigest !== privateAuthority.hiddenAsset.sha256 || hidden.bytes.length !== privateAuthority.hiddenAsset.bytes || !hiddenStableInodeMatches) throw new Error(`${label} hidden evaluator bytes, mode, or inode do not match the sealed private bundle authority`);
  const captured = {
    runnerBytes: Buffer.from(runner.bytes),
    hiddenEvaluatorPath,
    sourceGraph: structuredClone(descriptor.source_graph),
    roots: { repository: repository.inventory, private_bundle: privateBundle, frozen, candidate, evidence, original_workspace_authority: originalWorkspaceAuthority },
    originalWorkspaceAuthority: originalAuthority,
  };
  const expectedAuthority = verifySealedEvaluatorExternalAuthority({
    descriptor,
    buffers: captured.roots.repository.buffers,
    externalAuthorityAnchor: anchor,
    label,
  });
  if (stableCanonicalJson(captured.sourceGraph) !== stableCanonicalJson(descriptor.source_graph)) throw new Error(`${label} captured source graph is detached from the sealed descriptor`);
  return { ...captured, expectedAuthority };
}

function serializedAuthorityRoot(kind, inventory, helperRoot = null) {
  const entries = inventory.portableEntries.map((entry) => ({
    ...entry,
    ...(entry.file_type === "file" ? { content_base64: inventory.buffers.get(entry.path).toString("base64") } : {}),
  }));
  return {
    kind,
    root_mode: inventory.rootIdentity.mode & 0o777,
    entries,
    ...(helperRoot ? { helper_root: helperRoot } : {}),
  };
}

function normalizedAuthorityBytes(normalized, verifiedBytes, label) {
  const bytes = verifiedBytes ? Buffer.from(verifiedBytes) : Buffer.from(`${AUTHORITY_JSON_STRINGIFY(normalized)}\n`);
  let parsed;
  try {
    assertNoDuplicateJsonObjectKeys(bytes.toString("utf8"), `${label} normalized result`);
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} normalized result verified bytes are invalid`);
  }
  if (stableCanonicalJson(parsed) !== stableCanonicalJson(normalized)) throw new Error(`${label} normalized result object is detached from its verified bytes`);
  return bytes;
}

function buildInMemoryEvaluatorPayload({ verifiedAuthority, execution, normalized, normalizedBytes, runIndex, barrier, label }) {
  const repository = verifiedAuthority.roots.repository;
  const privateBundle = verifiedAuthority.roots.private_bundle;
  const modules = verifiedAuthority.sourceGraph.node_inventory.filter(({ file_type }) => file_type === "module").map((node) => {
    const bytes = repository.buffers.get(node.path);
    if (!bytes || bytes.length !== node.bytes || rawByteDigest(bytes) !== node.sha256) throw new Error(`${label} source module byte map drifted at ${node.path}`);
    return { path: node.path, bytes: bytes.length, sha256: rawByteDigest(bytes), source_base64: bytes.toString("base64") };
  });
  const hiddenBytes = privateBundle.buffers.get(verifiedAuthority.hiddenEvaluatorPath);
  if (!hiddenBytes) throw new Error(`${label} hidden evaluator is absent from the verified private bundle byte map`);
  modules.push({ path: PRIVATE_EVALUATOR_VIRTUAL_PATH, bytes: hiddenBytes.length, sha256: rawByteDigest(hiddenBytes), source_base64: hiddenBytes.toString("base64") });
  const normalizedSource = normalizedAuthorityBytes(normalized, normalizedBytes, label);
  const base = {
    schema_version: "1.0.0",
    program: "adaptive_ask_in_memory_evaluator_authority",
    run_index: runIndex,
    hidden_evaluator_path: verifiedAuthority.hiddenEvaluatorPath,
    source_graph: verifiedAuthority.sourceGraph,
    modules,
    authority_roots: [
      serializedAuthorityRoot("repository", repository),
      serializedAuthorityRoot("private_bundle", privateBundle),
      serializedAuthorityRoot("frozen", verifiedAuthority.roots.frozen),
      serializedAuthorityRoot("candidate", verifiedAuthority.roots.candidate, execution.candidate.path),
      serializedAuthorityRoot("evidence", verifiedAuthority.roots.evidence),
      serializedAuthorityRoot("original_workspace_authority", verifiedAuthority.roots.original_workspace_authority),
    ],
    normalized_result: { bytes: normalizedSource.length, sha256: rawByteDigest(normalizedSource), source_base64: normalizedSource.toString("base64") },
    expected_authority: verifiedAuthority.expectedAuthority,
    ...(barrier ? { barrier: structuredClone(barrier) } : {}),
  };
  return { ...base, payload_digest: canonicalDigest(base) };
}

function captureSealedExecutionState(execution, label) {
  const runner = readStableFile(execution.runner.path, `${label} runner sealed copy`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const hidden = readStableFile(execution.hidden.path, `${label} hidden evaluator sealed copy`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const privateBundle = execution.privateBundle?.path ? readStableWorkspaceInventory(execution.privateBundle.path, `${label} private bundle sealed snapshot`) : null;
  const frozen = readStableWorkspaceInventory(execution.frozen.path, `${label} frozen sealed snapshot`);
  const candidate = readStableWorkspaceInventory(execution.candidate.path, `${label} candidate sealed snapshot`);
  const evidence = readStableWorkspaceInventory(execution.evidence.path, `${label} evidence sealed snapshot`);
  const originalWorkspaceAuthority = readStableWorkspaceInventory(execution.originalWorkspaceAuthority.path, `${label} original workspace authority sealed snapshot`);
  const repository = readStableWorkspaceInventory(execution.repository.path, `${label} repository authority sealed snapshot`);
  for (const [kind, inventory] of [["private bundle", privateBundle], ["frozen workspace", frozen], ["candidate workspace", candidate], ["evaluation-input evidence", evidence], ["original workspace authority", originalWorkspaceAuthority], ["repository authority", repository]]) if (inventory) assertSealedSnapshotModes(inventory, { label: `${label} ${kind}` });
  return {
    runner: { bytes: runner.bytes.length, sha256: runner.rawByteDigest, identity: runtimeIdentityFromStableRead(runner) },
    hidden: { bytes: hidden.bytes.length, sha256: hidden.rawByteDigest, identity: runtimeIdentityFromStableRead(hidden) },
    privateBundle: privateBundle ? sealedSnapshotBinding(privateBundle) : null,
    repository: sealedSnapshotBinding(repository),
    frozen: sealedSnapshotBinding(frozen),
    candidate: sealedSnapshotBinding(candidate),
    evidence: sealedSnapshotBinding(evidence),
    originalWorkspaceAuthority: sealedSnapshotBinding(originalWorkspaceAuthority),
  };
}

function assertSealedExecutionStatesEqual(states, label) {
  const first = states[0];
  for (const state of states.slice(1)) if (stableCanonicalJson(state) !== stableCanonicalJson(first)) throw new Error(`${label} sealed execution authority changed between evaluator runs`);
}

function portableSealedExecutionState(state) {
  const snapshot = (value) => value ? { portable_digest: value.portable_digest, root_mode: value.root.mode & 0o777 } : null;
  return {
    runner: { bytes: state.runner.bytes, sha256: state.runner.sha256, mode: state.runner.identity.mode & 0o777 },
    hidden: { bytes: state.hidden.bytes, sha256: state.hidden.sha256, mode: state.hidden.identity.mode & 0o777 },
    privateBundle: snapshot(state.privateBundle),
    repository: snapshot(state.repository),
    frozen: snapshot(state.frozen),
    candidate: snapshot(state.candidate),
    evidence: snapshot(state.evidence),
    originalWorkspaceAuthority: snapshot(state.originalWorkspaceAuthority),
  };
}

function assertPortableSealedExecutionStatesEqual(states, label) {
  assertSealedExecutionStatesEqual(states.map(portableSealedExecutionState), `${label} portable`);
}

function prepareSealedEvaluatorExecutionAuthority({ execution, externalAuthorityAnchor, repositoryRoot, normalized, normalizedBytes = null, barrier = null, label = "private evaluator sealed execution preflight" } = {}) {
  if (!execution?.runner?.path || !execution?.hidden?.path || !execution?.repository?.path || !execution?.frozen?.path || !execution?.candidate?.path || !execution?.evidence?.path || !execution?.originalWorkspaceAuthority?.path) throw new Error(`${label} is incomplete`);
  if (stableCanonicalJson(execution.originalWorkspaceAuthority.lineage) !== stableCanonicalJson(normalized?.lineage && { run_instance_id: normalized.lineage.run_instance_id, case_id: normalized.lineage.case_id, attempt: normalized.lineage.attempt })) throw new Error(`${label} normalized lineage does not match original workspace authority`);
  const verifiedAuthority = captureVerifiedExecutionAuthority(execution, externalAuthorityAnchor, repositoryRoot, label);
  const runnerSource = verifiedAuthority.runnerBytes.toString("utf8");
  return {
    runnerSource,
    firstPayload: buildInMemoryEvaluatorPayload({ verifiedAuthority, execution, normalized, normalizedBytes, runIndex: 1, barrier, label }),
    secondPayload: buildInMemoryEvaluatorPayload({ verifiedAuthority, execution, normalized, normalizedBytes, runIndex: 2, barrier, label }),
  };
}

function executeAuthorityOwnedEvaluatorChild({ runnerSource, payload, timeout, label }) {
  const child = AUTHORITY_SPAWN_SYNC(AUTHORITY_NODE_EXECUTABLE, ["--experimental-vm-modules", "--input-type=module", "--eval", runnerSource], {
    encoding: "utf8",
    input: `${AUTHORITY_JSON_STRINGIFY(payload)}\n`,
    maxBuffer: MAX_BOUNDARY_FILE_BYTES,
    timeout,
  });
  if (child.status !== 0 || child.error) throw new Error(`${label} child execution failed${child.error ? `: ${child.error.message}` : child.stderr ? `: ${child.stderr.trim().slice(0, 512)}` : ""}`);
  return parseRunnerFragment(child.stdout, `${label} child output`);
}

function executeSealedEvaluator({ execution, externalAuthorityAnchor, repositoryRoot, normalized, normalizedBytes = null, timeout = 60_000, barrier = null, label = "private evaluator sealed execution" } = {}) {
  const prepared = prepareSealedEvaluatorExecutionAuthority({ execution, externalAuthorityAnchor, repositoryRoot, normalized, normalizedBytes, barrier, label });
  const run = (runIndex) => {
    const payload = runIndex === 1 ? prepared.firstPayload : prepared.secondPayload;
    return executeAuthorityOwnedEvaluatorChild({ runnerSource: prepared.runnerSource, payload, timeout, label });
  };
  const stateA = captureSealedExecutionState(execution, `${label} before run`);
  const firstFragment = run(1);
  const stateB = captureSealedExecutionState(execution, `${label} after first run`);
  const secondFragment = run(2);
  const stateC = captureSealedExecutionState(execution, `${label} after second run`);
  if (barrier) assertPortableSealedExecutionStatesEqual([stateA, stateB, stateC], label);
  else assertSealedExecutionStatesEqual([stateA, stateB, stateC], label);
  if (stableCanonicalJson(firstFragment) !== stableCanonicalJson(secondFragment)) throw new Error(`${label} fragment is nondeterministic`);
  return {
    firstFragment,
    secondFragment,
    firstBytes: stableFragmentBytes(firstFragment),
    secondBytes: stableFragmentBytes(secondFragment),
    before: stateA,
    afterFirst: stateB,
    afterSecond: stateC,
  };
}

export function prepareSealedEvaluatorExecutionAuthorityForTest(options = {}) {
  return prepareSealedEvaluatorExecutionAuthority(options);
}

export function executeSealedEvaluatorForTest(options = {}) {
  return executeSealedEvaluator(options);
}

export function executeProductionSealedEvaluator({ execution, externalAuthorityAnchor, repositoryRoot, timeout = 60_000, barrier = null, label = "production private evaluator sealed execution" } = {}) {
  const authority = PRODUCTION_EXECUTION_AUTHORITIES.get(execution);
  if (!authority) throw new Error(`${label} requires a module-owned verified terminal candidate authority`);
  if (stableCanonicalJson(execution.originalWorkspaceAuthority?.candidateAuthority) !== stableCanonicalJson(authority.candidateAuthority)) throw new Error(`${label} terminal candidate authority is detached from the sealed execution`);
  return executeSealedEvaluator({
    execution,
    externalAuthorityAnchor,
    repositoryRoot,
    normalized: authority.normalized,
    normalizedBytes: authority.normalizedBytes,
    timeout,
    barrier,
    label,
  });
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
    evaluator_revision: manifest.evaluator_revision,
    evaluator_source_identity: manifest.evaluator_source_identity,
    dependency_graph: manifest.dependency_graph,
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

export function computeIndependenceStatementDigest(statement) {
  const { statement_digest: _digest, ...closure } = statement;
  return canonicalDigest(closure);
}

export function validateIndependenceStatement({ statement, manifest, root = null }) {
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) throw new Error("private independence statement must be an object");
  if (root) assertBenchmarkSchemaInstance(statement, { schemaPath: resolve(root, PRIVATE_EVALUATOR_INDEPENDENCE_SCHEMA_PATH), label: "private independence statement" });
  if (statement.schema_version !== "1.1.0" || statement.fixture_id !== manifest.fixture_identity.fixture_id) throw new Error("private independence statement fixture identity mismatch");
  if (statement.statement_digest !== computeIndependenceStatementDigest(statement)) throw new Error("private independence statement digest closure is invalid");
  if (statement.statement_digest !== manifest.independence.statement_digest) throw new Error("private independence statement does not match the manifest assertion");
  if (stableCanonicalJson(statement.generator_role_identity) !== stableCanonicalJson(manifest.generator)) throw new Error("private independence statement generator identity mismatch");
  if (statement.generation_revision !== manifest.evaluator_revision) throw new Error("private independence statement generation revision drift");
  if (statement.evaluator_source_identity || manifest.evaluator_source_identity) {
    if (stableCanonicalJson(statement.evaluator_source_identity) !== stableCanonicalJson(manifest.evaluator_source_identity)) throw new Error("private independence statement evaluator source identity drift");
    if (root) validateEvaluatorSourceIdentity({ identity: statement.evaluator_source_identity, root, expectedRevision: manifest.evaluator_revision, expectedGeneratorSourceDigest: manifest.generator.source_digest, label: "private independence evaluator source identity" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(statement.generation_date) || new Date(`${statement.generation_date}T00:00:00Z`).toISOString().slice(0, 10) !== statement.generation_date) throw new Error("private independence statement generation date is invalid");
  if (statement.frozen_candidate_input?.raw_byte_digest !== manifest.input_identity.fixture_input_digest || typeof statement.frozen_candidate_input?.public_source_path !== "string") throw new Error("private independence statement frozen input raw binding mismatch");
  if (root) {
    const sourcePath = resolveAuthorityArtifactPath(realpathSync(root), statement.frozen_candidate_input.public_source_path, "private independence frozen public source");
    const source = readJsonArtifact(sourcePath, "private independence frozen public source", { publicArtifact: true });
    if (rawByteDigest(source.bytes) !== statement.frozen_candidate_input.raw_byte_digest) throw new Error("private independence frozen public source raw-byte digest drift");
    if (canonicalDigest(source.value) !== statement.frozen_candidate_input.digest) throw new Error("private independence frozen public source semantic digest drift");
    const fixture = source.value.fixtures?.[manifest.fixture_identity.fixture_id];
    if (!fixture) throw new Error("private independence frozen public source fixture binding is missing");
  }
  if (statement.measured_output_used !== false || statement.measured_result_used !== false) throw new Error("private independence statement must exclude measured evidence");
  if (typeof statement.author_scratch?.used !== "boolean" || typeof statement.author_scratch?.scope !== "string" || statement.author_scratch?.contamination_assessment?.state !== "not_used" || typeof statement.author_scratch?.contamination_assessment?.evidence_basis !== "string") throw new Error("private independence statement author-scratch classification is incomplete or contaminated");
  for (const field of ["source_classification", "excluded_source_classification"]) {
    const values = statement[field];
    if (!Array.isArray(values) || values.length === 0 || values.some((entry) => typeof entry !== "string" || entry.length === 0) || new Set(values).size !== values.length) throw new Error(`private independence statement ${field} is invalid`);
  }
  for (const field of ["contaminated_issues_193_196_as_oracle_source", "issue_194_body_used", "issue_194_edit_history_used", "issue_194_legacy_answer_structure_used"]) {
    if (!statement[field] || statement[field].state !== "not_used" || typeof statement[field].evidence_basis !== "string" || statement[field].evidence_basis.length === 0) throw new Error(`private independence statement ${field} is contaminated or incomplete`);
  }
  if (manifest.independence.public_answer_sources_used !== false || manifest.independence.generated_without_agent_output !== true || manifest.independence.measured_agent_access_allowed !== false) throw new Error("private independence manifest assertion is contaminated or unsafe");
  return structuredClone(statement);
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

function fragmentEnvelopeView(fragment) {
  return {
    ...fragment,
    false_positives: [],
  };
}

export function validatePrivateEvaluatorFragment({ root, fragment, scoringPolicy, requirementRecord, normalizedResult }) {
  assertBenchmarkSchemaInstance(fragment, { schemaPath: resolve(root, PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH), label: "private evaluator result fragment" });
  if (fragment.scoring_ready !== false) throw new Error("private evaluator fragment must remain scoring-ineligible");
  const envelopeView = fragmentEnvelopeView(fragment);
  validateRequirementResultObservations({ scoringPolicy, requirementRecord, evaluatorResult: envelopeView });
  validateBinaryScopeVerificationResult({ evaluatorResult: envelopeView, requirementRecord, normalizedResult });
  return structuredClone(fragment);
}

export function computePrivateEvaluationRecordDigest(record) {
  const closure = structuredClone(record);
  delete closure.evaluation_record_digest;
  return canonicalDigest(closure);
}

export function computeAdapterResultEnvelopeDigest(result) {
  const closure = structuredClone(result);
  delete closure.evaluation_id;
  delete closure.evaluation_digest;
  delete closure.private_evaluation_record_digest;
  return canonicalDigest(closure);
}

function fragmentObservation(fragment, field, fallbackState) {
  const source = fragment[field];
  return { state: source?.state ?? fallbackState, evidence_references: structuredClone(source?.evidence_references ?? []) };
}

function authorityPrivacy() {
  return {
    oracle_content_stored: false,
    rubric_content_stored: false,
    hidden_test_content_stored: false,
    matcher_content_stored: false,
    reference_answer_stored: false,
    raw_evaluator_prompt_stored: false,
    private_path_stored: false,
    secret_customer_or_personal_data_stored: false,
  };
}

export function adaptPrivateEvaluatorFragmentToEnvelope({ root, fragment, authority }) {
  const normalized = authority.normalizedResult;
  const binding = authority.fragmentBinding;
  if (!binding || binding.normalized_result_id !== normalized.normalized_result_id || binding.normalized_result_digest !== normalized.normalized_result_digest || binding.run_instance_id !== normalized.lineage.run_instance_id || binding.case_id !== normalized.lineage.case_id || binding.attempt !== normalized.lineage.attempt) {
    throw new Error("authority-owned fragment binding does not match the supplied normalized result");
  }
  const validated = validatePrivateEvaluatorFragment({
    root,
    fragment,
    scoringPolicy: authority.scoringPolicy,
    requirementRecord: authority.requirementRecord,
    normalizedResult: normalized,
  });
  const lineage = normalized.lineage;
  const manifest = authority.bundleManifest;
  const result = {
    schema_version: "1.0.0",
    schema_path: EVALUATOR_RESULT_SCHEMA_PATH,
    program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: authority.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: authority.freezeManifest.manifest_digest,
    catalog_digest: authority.catalog.catalog_digest,
    policy_manifest_digest: authority.policyManifest.manifest_digest,
    scoring_policy_digest: authority.scoringPolicy.policy_digest,
    admission_record_digest: authority.admissionRecord.admission_digest,
    requirement_record_digest: authority.requirementRecord.requirement_record_digest,
    requirement_set_digest: authority.requirementRecord.requirement_set_digest,
    output_contract_digest: authority.outputContract.output_contract_digest,
    evaluator_public_reference_digest: authority.evaluatorReference.public_metadata_digest,
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
    source_snapshot_digest: authority.sourceSnapshotDigest,
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_revision: manifest.evaluator_revision,
    evaluation_id: "evaluation-placeholder",
    evaluation_digest: "sha256:" + "0".repeat(64),
    evaluation_status: validated.evaluation_status,
    requirement_results: structuredClone(validated.requirement_results),
    result_profile: structuredClone(validated.result_profile),
    classification: validated.classification,
    quality: fragmentObservation(validated, "verification_correctness", "fail"),
    safety: fragmentObservation(validated, "evidence_correctness", "fail"),
    findings: structuredClone(validated.findings),
    false_positives: [],
    scope_deviations: structuredClone(validated.scope_deviations),
    decision_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    verification_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    evidence_correctness: fragmentObservation(validated, "evidence_correctness", "fail"),
    approval_correctness: fragmentObservation(validated, "evidence_correctness", "fail"),
    completion_claim_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    under_processing: fragmentObservation(validated, "under_processing", "not_detected"),
    over_processing: fragmentObservation(validated, "over_processing", "not_detected"),
    required_mechanisms: [],
    unnecessary_mechanisms: [],
    unsafe_attempted_actions: [],
    evaluator_notes_state: { state: "not_recorded", digest: null, bytes: null },
    privacy: authorityPrivacy(),
  };
  if (validated.invalid_input_authority) result.invalid_input_authority = structuredClone(validated.invalid_input_authority);
  if (authority.privateFragmentDigest) {
    result.private_fragment_digest = authority.privateFragmentDigest;
    result.private_fragment_bytes = authority.privateFragmentBytes;
  }
  if (authority.privateEvaluationRecordDigest) result.private_evaluation_record_digest = authority.privateEvaluationRecordDigest;
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  assertBenchmarkSchemaInstance(result, { schemaPath: resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), label: "authority-owned evaluator result envelope" });
  return result;
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
  if (reference.evaluator_source_identity) validateEvaluatorSourceIdentity({ identity: reference.evaluator_source_identity, root, expectedRevision: reference.evaluator_revision, label: "public evaluator source identity" });
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
  if (manifest.evaluator_source_identity) expected.evaluator_source_identity = manifest.evaluator_source_identity;
  for (const [field, value] of Object.entries(expected)) {
    const matches = value && typeof value === "object"
      ? stableCanonicalJson(reference[field]) === stableCanonicalJson(value)
      : reference[field] === value;
    if (!matches) throw new Error(`public/private evaluator identity mismatch at ${field}`);
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
  const independenceAsset = manifest.asset_inventory.find(({ role }) => role === "independence_provenance");
  const independenceStatement = independenceAsset
    ? readJsonArtifact(resolve(privateRoot, independenceAsset.path), "private independence statement").value
    : null;
  if (independenceStatement) validateIndependenceStatement({ statement: independenceStatement, manifest, root });
  if (manifest.evaluator_source_identity) validateEvaluatorSourceIdentity({ identity: manifest.evaluator_source_identity, root, expectedRevision: manifest.evaluator_revision, expectedGeneratorSourceDigest: manifest.generator.source_digest, label: "private evaluator source identity" });
  if (stableCanonicalJson([...files.keys()].sort()) !== stableCanonicalJson(expectedPaths.sort())) throw new Error("private evaluator root has an unexpected or unmanaged inventory entry");
  if (manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest)) throw new Error("private evaluator bundle ID is invalid");
  if (manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) throw new Error("private evaluator bundle digest closure is invalid");

  const reference = verifyPublicEvaluatorReference({ root, referencePath, privateRoot: canonicalPrivateRoot });
  assertReferenceMatchesBundle(reference, manifest);
  const bundle = { ...boundary, files, manifest, manifestEvidence, manifestRelativePath, privateMaterialDigests, reference, independenceStatement };
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
  const verification = result.verification_correctness;
  if (verification && Array.isArray(verification.evidence_references)) {
    const typedState = result.requirement_results?.find(({ requirement_id }) => requirement_id === "verification-evidence")?.verification_evidence_state;
    const state = typedState ?? (verification.state === "pass" ? "executed_success" : null);
    const hasCommandAuthority = normalized.command_evidence.required_command_ids.length > 0 || (normalized.command_evidence.required_alternative_groups ?? []).length > 0;
    if (state && (typedState || hasCommandAuthority)) {
      const expected = deriveEffectiveVerificationEvidenceReferences({ normalizedResult: normalized, evaluatorResult: result, state: deriveEffectiveVerificationEvidenceState({ normalizedResult: normalized, evaluatorResult: result }) });
      const key = (reference) => `${reference.kind}:${reference.digest}:${reference.kind === "normalized_result" ? "normalized" : reference.bytes}`;
      const actualKeys = verification.evidence_references.map(key).sort();
      const expectedKeys = expected.map(key).sort();
      if (actualKeys.length !== expectedKeys.length || actualKeys.some((value, index) => value !== expectedKeys[index])) throw new Error("verification correctness references must match the deterministically derived causal reference set");
    }
  }
  const requiredGroups = normalized.command_evidence.required_alternative_groups ?? [];
  if ((normalized.command_evidence.required_command_ids.length > 0 || requiredGroups.length > 0) && result.verification_correctness.state === "pass") {
    if (executionReferences.length === 0) throw new Error("verification correctness cannot pass without verified execution-event evidence");
    const successes = new Set(normalized.command_evidence.succeeded_command_ids);
    if (normalized.command_evidence.required_command_ids.some((id) => !successes.has(id))) throw new Error("verification correctness cannot pass while required command evidence is absent or unsuccessful");
    if (requiredGroups.some(({ satisfaction_state: state }) => state !== "satisfied")) throw new Error("verification correctness cannot pass while a required alternative command group is unsatisfied");
    const latest = new Map();
    for (const item of normalized.command_evidence.references) if (item.command_id !== null) latest.set(item.command_id, item);
    for (const commandId of normalized.command_evidence.required_command_ids) {
      const item = latest.get(commandId);
      if (!item || item.outcome !== "succeeded" || item.exit_code !== 0 || !executionReferences.some((reference) => reference.digest === item.digest && reference.bytes === item.bytes)) throw new Error("verification correctness must cite the latest successful execution event for every required command");
    }
  }
  return structuredClone(executionReferences);
}

function readNormalizedRecord({ verified, result }) {
  const normalizedReference = verified.manifest.cases
    .flatMap((entry) => entry.normalized_attempts)
    .find((entry) => entry.normalized_result_id === result.normalized_result_id);
  if (!normalizedReference) throw new Error("evaluator result references a normalized result absent from the verified generation");
  const path = resolve(verified.generationPath, normalizedReference.path);
  const source = readJsonArtifact(path, "normalized result authority");
  const record = source.value;
  if (record.normalized_result_digest !== result.normalized_result_digest) throw new Error("evaluator result normalized result digest is inconsistent");
  return { ...source, record };
}

function evidenceReferencesIn(value) {
  const references = [];
  const visit = (entry) => {
    if (Array.isArray(entry)) for (const child of entry) visit(child);
    else if (entry && typeof entry === "object") {
      if (typeof entry.kind === "string" && typeof entry.digest === "string" && Object.hasOwn(entry, "bytes")) references.push(entry);
      else for (const child of Object.values(entry)) visit(child);
    }
  };
  visit(value);
  return references;
}

function validatePrivateEvaluationEvidenceArtifacts({ root, privateEvaluationRoot, record, normalized, result }) {
  const canonicalEvaluationRoot = assertRealDirectory(privateEvaluationRoot, "private evaluation authority root");
  const artifacts = new Map();
  let repositoryDiffArtifact = null;
  for (const entry of record.evidence_artifacts) {
    const artifactPath = resolveAuthorityArtifactPath(canonicalEvaluationRoot, entry.path, `private evaluation ${entry.kind} artifact`);
    const artifactRead = readJsonArtifact(artifactPath, `private evaluation ${entry.kind} artifact`);
    if (artifactRead.evidence.finalPath.ino !== entry.inode) throw new Error(`private evaluation ${entry.kind} artifact inode binding is invalid`);
    const artifact = artifactRead.value;
    if (artifact.artifact_digest !== entry.digest || artifact.artifact_bytes !== entry.bytes) throw new Error(`private evaluation ${entry.kind} artifact digest or byte closure is invalid`);
    if (artifact.schema_path === REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH) {
      const diffEntries = Array.isArray(artifact.diff_entries) ? artifact.diff_entries : null;
      if (!diffEntries || artifact.artifact_digest !== canonicalDigest(diffEntries) || artifact.artifact_bytes !== (Buffer.byteLength(stableCanonicalJson(diffEntries)) || 1)) throw new Error(`private evaluation ${entry.kind} artifact semantic digest is invalid`);
    } else if (artifact.schema_path === EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH) {
      const checks = Array.isArray(artifact.checks) ? artifact.checks : null;
      if (!checks || artifact.artifact_digest !== canonicalDigest(checks) || artifact.artifact_bytes !== (Buffer.byteLength(stableCanonicalJson(checks)) || 1)) throw new Error(`private evaluation ${entry.kind} artifact semantic digest is invalid`);
    } else if (artifact.schema_path === EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH) {
      const authorityReferences = result.invalid_input_authority?.evidence_references ?? [];
      const matchingReference = authorityReferences.find((reference) => reference.kind === "test_result" && reference.digest === artifact.artifact_digest && reference.bytes === artifact.artifact_bytes);
      if (!matchingReference || artifact.details_digest !== matchingReference.digest || artifact.details_bytes !== matchingReference.bytes) throw new Error(`private evaluation ${entry.kind} artifact failure evidence binding is invalid`);
    } else throw new Error(`private evaluation ${entry.kind} artifact schema is not authorized`);
    if (entry.run_instance_id !== normalized.lineage.run_instance_id || entry.case_id !== normalized.lineage.case_id || entry.attempt !== normalized.lineage.attempt || entry.normalized_result_id !== normalized.normalized_result_id || entry.normalized_result_digest !== normalized.normalized_result_digest || entry.evaluator_bundle_id !== result.evaluator_bundle_id || entry.evaluator_bundle_digest !== result.evaluator_bundle_digest) {
      throw new Error(`private evaluation ${entry.kind} artifact lineage is inconsistent`);
    }
    if (entry.kind === "repository_diff") {
      assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH), label: "repository diff artifact" });
      if (artifact.run_instance_id !== normalized.lineage.run_instance_id || artifact.case_id !== normalized.lineage.case_id || artifact.attempt !== normalized.lineage.attempt) throw new Error("repository diff artifact lineage is inconsistent");
      if (entry.digest !== record.repository_diff_artifact_digest || entry.bytes !== record.repository_diff_artifact_bytes) throw new Error("repository diff artifact is not bound to the private evaluation record");
      repositoryDiffArtifact = artifact;
    } else {
      if (artifact.schema_path === EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH) {
        assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH), label: "evaluation-input failure artifact" });
        if (result.invalid_input_authority && (artifact.layer !== result.invalid_input_authority.layer || artifact.category !== result.invalid_input_authority.category || artifact.structured_failure_code !== result.invalid_input_authority.code)) throw new Error("evaluation-input failure artifact authority does not match the evaluator result");
      } else if (artifact.schema_path === EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH) {
        assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH), label: "evaluator check artifact" });
      } else throw new Error("private test-result artifact schema is not authorized");
    }
    artifacts.set(`${entry.kind}:${entry.digest}:${entry.bytes}`, { entry, read: artifactRead });
  }
  const references = evidenceReferencesIn(result);
  for (const reference of references) {
    if (reference.kind === "repository_diff" || reference.kind === "test_result") {
      const key = `${reference.kind}:${reference.digest}:${reference.bytes}`;
      if (!artifacts.has(key)) throw new Error(`${reference.kind} evidence reference is not bound to a sealed private artifact`);
    }
  }
  return { canonicalEvaluationRoot, artifacts, repositoryDiffArtifact };
}

function verifyPrivateEvaluationRecord({ root, privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath, bundle, verified, normalized, normalizedBytes, result, scoringInputs }) {
  if (!privateEvaluationRoot || !privateEvaluationRecordPath || !privateFragmentPath) throw new Error("private evaluation record, root, and fragment paths are required for durable evaluator verification");
  const canonicalEvaluationRoot = assertRealDirectory(privateEvaluationRoot, "private evaluation authority root");
  if (pathsOverlap(canonicalEvaluationRoot, bundle.canonicalPrivateRoot)) throw new Error("private evaluation authority root must not overlap the static evaluator bundle");
  const recordInfo = authorityRelativePathForSupplied(canonicalEvaluationRoot, privateEvaluationRecordPath, "private evaluation record");
  const fragmentInfo = authorityRelativePathForSupplied(canonicalEvaluationRoot, privateFragmentPath, "private evaluator fragment");
  const recordRead = readJsonArtifact(recordInfo.authoritativePath, "private evaluation record");
  const record = recordRead.value;
  assertBenchmarkSchemaInstance(record, { schemaPath: resolve(root, PRIVATE_EVALUATION_RECORD_SCHEMA_PATH), label: "private evaluation record" });
  if (record.evaluation_record_digest !== computePrivateEvaluationRecordDigest(record)) throw new Error("private evaluation record digest closure is invalid");
  if (record.evaluator_bundle_id !== bundle.manifest.evaluator_bundle_id || record.evaluator_bundle_digest !== bundle.manifest.evaluator_bundle_digest || record.evaluator_revision !== bundle.manifest.evaluator_revision) throw new Error("private evaluation record bundle identity is inconsistent");
  const recordExternalAuthority = assertExternalEvaluatorAuthorityAnchor(scoringInputs.evaluatorAuthorityAnchor, "private evaluation record");
  if (record.sealed_repository_evaluator_authority_manifest_path !== recordExternalAuthority.evaluator_authority_manifest_path || record.sealed_repository_evaluator_authority_manifest_raw_sha256 !== recordExternalAuthority.evaluator_authority_manifest_raw_sha256 || record.sealed_repository_evaluator_authority_manifest_digest !== recordExternalAuthority.evaluator_authority_manifest_digest) throw new Error("private evaluation record evaluator authority manifest closure does not match the external freeze authority");
  if (stableCanonicalJson(record.evaluator_source_identity) !== stableCanonicalJson(bundle.manifest.evaluator_source_identity)) throw new Error("private evaluation record source identity is inconsistent");
  if (record.normalized_result_id !== normalized.normalized_result_id || record.normalized_result_digest !== normalized.normalized_result_digest || record.run_instance_id !== normalized.lineage.run_instance_id || record.case_id !== normalized.lineage.case_id || record.attempt !== normalized.lineage.attempt) throw new Error("private evaluation record normalized lineage is inconsistent");
  if (record.command_evidence_digest !== normalized.command_evidence.manifest_digest || record.effective_verification_state !== deriveEffectiveVerificationEvidenceState({ normalizedResult: normalized, evaluatorResult: result })) throw new Error("private evaluation record command evidence authority is inconsistent");
  const candidateAuthority = record.candidate_authority;
  const normalizedCaseState = verified.manifest.source_snapshot.cases.find((entry) => entry.case_id === normalized.lineage.case_id);
  if (!normalizedCaseState?.state_digest) throw new Error("private evaluation record terminal case state authority is missing");
  if (candidateAuthority.kind === "verified_terminal_candidate") {
    const expectedTerminalAuthority = {
      source_snapshot_digest: verified.manifest.source_snapshot_digest,
      normalized_result_id: normalized.normalized_result_id,
      normalized_result_digest: normalized.normalized_result_digest,
      run_instance_id: normalized.lineage.run_instance_id,
      case_id: normalized.lineage.case_id,
      attempt: normalized.lineage.attempt,
      adapter: normalized.lineage.adapter_track,
      condition: normalized.lineage.condition,
      fixture_id: normalized.lineage.fixture_id,
      fixture_input_digest: normalized.lineage.fixture_input_digest,
      materialization_manifest_digest: normalized.lineage.materialization_manifest_digest,
      request_digest: normalized.lineage.request_digest,
      raw_result_digest: normalized.lineage.raw_result_digest,
      terminal_commit_digest: normalized.lineage.terminal_commit_digest,
      terminal_case_state_digest: normalizedCaseState.state_digest,
      terminal_workspace_authority_digest: normalized.lineage.terminal_workspace_authority_digest,
      terminal_workspace_authority_bytes: normalized.lineage.terminal_workspace_authority_bytes,
      terminal_candidate_tree_digest: normalized.lineage.terminal_workspace_tree_digest,
    };
    for (const [field, value] of Object.entries(expectedTerminalAuthority)) if (candidateAuthority[field] !== value) throw new Error(`private evaluation record terminal candidate authority mismatch at ${field}`);
  }
  if (record.private_fragment_path !== fragmentInfo.relativePath) throw new Error("private evaluation record fragment path is inconsistent");
  const fragmentRead = readJsonArtifact(fragmentInfo.authoritativePath, "private evaluator fragment");
  if (fragmentRead.bytes.length !== record.private_fragment_bytes || fragmentRead.rawByteDigest !== record.private_fragment_sha256) throw new Error("private evaluator fragment digest or byte closure is invalid");
  if (fragmentRead.evidence.finalPath.ino !== record.private_fragment_inode) throw new Error("private evaluator fragment inode binding is invalid");
  const fragment = fragmentRead.value;
  const fragmentSchemaDigest = rawByteDigest(readFileSync(resolve(root, PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH)));
  if (record.fragment_schema_digest !== fragmentSchemaDigest) throw new Error("private evaluator fragment schema digest is inconsistent");
  const adapterSourceDigest = rawByteDigest(readFileSync(resolve(root, "scripts/ask-benchmark-evaluator-boundary.mjs")));
  if (record.adapter_source_digest !== adapterSourceDigest) throw new Error("private evaluator adapter source digest is inconsistent");
  const evidence = validatePrivateEvaluationEvidenceArtifacts({ root, privateEvaluationRoot: canonicalEvaluationRoot, record, normalized, result });
  const hiddenAsset = bundle.manifest.asset_inventory.find(({ role }) => role === "hidden_tests");
  if (!hiddenAsset || record.hidden_evaluator_asset_role !== "hidden_tests" || record.hidden_evaluator_path !== hiddenAsset.path || record.hidden_evaluator_sha256 !== hiddenAsset.sha256 || record.hidden_evaluator_bytes !== hiddenAsset.bytes || record.hidden_evaluator_entry_point !== "evaluateCandidateSafe") throw new Error("private evaluation record hidden evaluator identity is inconsistent");
  const hiddenPath = resolveAuthorityArtifactPath(bundle.canonicalPrivateRoot, hiddenAsset.path, "private hidden evaluator");
  const hiddenRead = readStableFile(hiddenPath, "private hidden evaluator", MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  if (hiddenRead.rawByteDigest !== hiddenAsset.sha256 || hiddenRead.bytes.length !== hiddenAsset.bytes || hiddenRead.evidence.finalPath.ino !== record.hidden_evaluator_inode) throw new Error("private hidden evaluator stable identity is inconsistent");
  const runnerRelativePath = "scripts/ask-benchmark-private-evaluator-runner.mjs";
  if (record.evaluator_runner_path !== runnerRelativePath || record.evaluator_runner_source_identity?.path !== runnerRelativePath) throw new Error("private evaluator runner source path binding is inconsistent");
  const runnerPath = resolveAuthorityArtifactPath(realpathSync(root), runnerRelativePath, "private evaluator runner source");
  const runnerRead = readStableFile(runnerPath, "private evaluator runner source", MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false });
  const runnerRevision = assertSourceBytesAtRevision(realpathSync(root), bundle.manifest.evaluator_revision, runnerRelativePath, runnerRead.bytes, "private evaluator runner source");
  if (record.evaluator_runner_sha256 !== runnerRead.rawByteDigest || record.evaluator_runner_bytes !== runnerRead.bytes.length || record.evaluator_runner_inode !== runnerRead.evidence.finalPath.ino || stableCanonicalJson(record.evaluator_runner_source_identity) !== stableCanonicalJson({ path: runnerRelativePath, base_git_revision: bundle.manifest.evaluator_revision, source_bytes: runnerRead.bytes.length, source_sha256: runnerRead.rawByteDigest, base_git_revision_bytes: runnerRevision.bytes, base_git_revision_sha256: runnerRevision.sha256 })) throw new Error("private evaluator runner source identity is inconsistent");
  if (record.dependency_graph_digest !== bundle.manifest.dependency_graph.graph_digest) throw new Error("private evaluation record dependency graph is inconsistent");
  const resolveEvaluationDirectory = (path, label) => {
    assertPortableRelativePath(path, `${label} path`);
    const absolute = resolve(canonicalEvaluationRoot, path);
    if (!isInside(canonicalEvaluationRoot, absolute)) throw new Error(`${label} escapes the private evaluation root`);
    let current = canonicalEvaluationRoot;
    for (const segment of path.split("/")) { current = resolve(current, segment); if (!existsSync(current) || lstatSync(current).isSymbolicLink()) throw new Error(`${label} must be a real directory without symlinks`); }
    if (!lstatSync(absolute).isDirectory() || !isInside(canonicalEvaluationRoot, realpathSync(absolute))) throw new Error(`${label} must be a private evaluation directory`);
    return realpathSync(absolute);
  };
  const frozenWorkspace = resolveEvaluationDirectory(record.frozen_workspace_path, "frozen workspace");
  const candidateWorkspace = resolveEvaluationDirectory(record.candidate_workspace_path, "candidate workspace");
  const evaluationInputRoot = resolveEvaluationDirectory(record.evaluation_input_evidence_root_path, "evaluation-input evidence root");
  const originalFrozenInventory = readStableWorkspaceInventory(frozenWorkspace, "original frozen workspace");
  const originalCandidateInventory = readStableWorkspaceInventory(candidateWorkspace, "original candidate workspace");
  if (stableCanonicalJson(record.frozen_workspace_original_identity) !== stableCanonicalJson({ portable_digest: originalFrozenInventory.digest, runtime_digest: originalFrozenInventory.runtimeDigest, root: originalFrozenInventory.rootIdentity }) || stableCanonicalJson(record.candidate_workspace_original_identity) !== stableCanonicalJson({ portable_digest: originalCandidateInventory.digest, runtime_digest: originalCandidateInventory.runtimeDigest, root: originalCandidateInventory.rootIdentity })) throw new Error("original private evaluation workspace identity is inconsistent");
  if (record.frozen_workspace_inventory_digest !== originalFrozenInventory.digest || record.candidate_workspace_inventory_digest !== originalCandidateInventory.digest) throw new Error("original private evaluation workspace inventory digest is inconsistent");
  if (frozenWorkspace === candidateWorkspace || pathsOverlap(frozenWorkspace, bundle.canonicalPrivateRoot) || pathsOverlap(candidateWorkspace, bundle.canonicalPrivateRoot)) throw new Error("private evaluation workspaces are overlapping or invalid");
  const resolveSealedFile = (path, label) => {
    assertPortableRelativePath(path, `${label} path`);
    const absolute = resolve(canonicalEvaluationRoot, path);
    if (!isInside(canonicalEvaluationRoot, absolute)) throw new Error(`${label} escapes the private evaluation root`);
    let current = canonicalEvaluationRoot;
    for (const segment of path.split("/")) {
      current = resolve(current, segment);
      if (!existsSync(current) || lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
    }
    if (!lstatSync(absolute).isFile() || !isInside(canonicalEvaluationRoot, realpathSync(absolute))) throw new Error(`${label} must be a sealed regular file`);
    return realpathSync(absolute);
  };
  const sealedRunnerPath = resolveSealedFile(record.evaluator_runner_sealed_execution_path, "sealed evaluator runner");
  const sealedHiddenPath = resolveSealedFile(record.hidden_evaluator_sealed_execution_path, "sealed hidden evaluator");
  const resolveSealedWorkspace = (path, label) => {
    assertPortableRelativePath(path, `${label} path`);
    const absolute = resolve(canonicalEvaluationRoot, path);
    if (!isInside(canonicalEvaluationRoot, absolute)) throw new Error(`${label} escapes the private evaluation root`);
    let current = canonicalEvaluationRoot;
    for (const segment of path.split("/")) {
      current = resolve(current, segment);
      if (!existsSync(current) || lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
    }
    if (!lstatSync(absolute).isDirectory() || !isInside(canonicalEvaluationRoot, realpathSync(absolute))) throw new Error(`${label} must be a sealed real directory`);
    return realpathSync(absolute);
  };
  const sealedFrozenWorkspace = resolveSealedWorkspace(record.frozen_workspace_sealed_execution_path, "sealed frozen workspace");
  const sealedCandidateWorkspace = resolveSealedWorkspace(record.candidate_workspace_sealed_execution_path, "sealed candidate workspace");
  const sealedEvaluationInputRoot = resolveSealedWorkspace(record.evaluation_input_evidence_sealed_execution_path, "sealed evaluation-input evidence root");
  const sealedOriginalWorkspaceAuthorityRoot = resolveSealedWorkspace(record.original_workspace_authority_sealed_execution_path, "sealed original workspace authority root");
  const sealedRepositoryRoot = resolveSealedWorkspace(record.sealed_repository_root_relative_path, "sealed repository authority root");
  if (pathsOverlap(sealedFrozenWorkspace, bundle.canonicalPrivateRoot) || pathsOverlap(sealedCandidateWorkspace, bundle.canonicalPrivateRoot) || pathsOverlap(sealedEvaluationInputRoot, bundle.canonicalPrivateRoot)) throw new Error("sealed private evaluation workspaces overlap the static evaluator bundle");
  if (!isInside(canonicalEvaluationRoot, sealedRepositoryRoot)) throw new Error("sealed repository authority must stay inside the private evaluation root");
  if (pathsOverlap(sealedRepositoryRoot, bundle.canonicalPrivateRoot)) throw new Error("sealed repository authority overlaps the static evaluator bundle");
  const sealedRepository = readSealedRepositoryDescriptor(sealedRepositoryRoot, "sealed repository authority", {
    expectedSourceGraphDigest: bundle.manifest.dependency_graph.graph_digest,
    expectedEvaluatorRevision: bundle.manifest.evaluator_revision,
    rootForSchema: root,
  });
  if (record.sealed_repository_descriptor_relative_path !== relativeAuthorityPath(canonicalEvaluationRoot, sealedRepository.descriptorPath, "sealed repository authority descriptor") || record.sealed_repository_descriptor_sha256 !== sealedRepository.descriptorRead.rawByteDigest || record.sealed_repository_descriptor_bytes !== sealedRepository.descriptorRead.bytes.length) throw new Error("sealed repository descriptor identity is inconsistent");
  if (record.sealed_repository_source_graph_digest !== bundle.manifest.dependency_graph.graph_digest || record.sealed_repository_fixture_authority_digest !== sealedRepository.descriptor.fixture_authority_digest) throw new Error("sealed repository source or fixture authority digest is inconsistent");
  if (sealedRepository.descriptor.evaluator_revision !== bundle.manifest.evaluator_revision || sealedRepository.descriptor.source_graph_digest !== bundle.manifest.dependency_graph.graph_digest || stableCanonicalJson(sealedRepository.descriptor.source_graph) !== stableCanonicalJson(bundle.manifest.dependency_graph)) throw new Error("sealed repository source graph authority is inconsistent");
  if (sealedRepository.descriptor.fixture_authority_digest !== record.sealed_repository_fixture_authority_digest || stableCanonicalJson(sealedRepository.descriptor.fixture_authority.map(({ path }) => path).sort()) !== stableCanonicalJson([...EVALUATOR_FIXTURE_AUTHORITY_PATHS].sort())) throw new Error("sealed repository fixture authority inventory is inconsistent");
  if (stableCanonicalJson(sealedRepository.descriptor.runtime_authority_paths) !== stableCanonicalJson([...EVALUATOR_RUNTIME_AUTHORITY_PATHS])) throw new Error("sealed repository runtime authority inventory is inconsistent");
  const externalAuthorityAnchor = assertExternalEvaluatorAuthorityAnchor(scoringInputs.evaluatorAuthorityAnchor, "private evaluation record");
  const expectedManifestClosure = {
    path: externalAuthorityAnchor.evaluator_authority_manifest_path,
    raw: externalAuthorityAnchor.evaluator_authority_manifest_raw_sha256,
    semantic: externalAuthorityAnchor.evaluator_authority_manifest_digest,
  };
  const recordManifestClosure = {
    path: record.sealed_repository_evaluator_authority_manifest_path,
    raw: record.sealed_repository_evaluator_authority_manifest_raw_sha256,
    semantic: record.sealed_repository_evaluator_authority_manifest_digest,
  };
  const descriptorManifestClosure = {
    path: sealedRepository.descriptor.evaluator_authority_manifest_path,
    raw: sealedRepository.descriptor.evaluator_authority_manifest_raw_sha256,
    semantic: sealedRepository.descriptor.evaluator_authority_manifest_digest,
  };
  const freezeManifestClosure = {
    path: scoringInputs.freezeManifest.evaluator_authority_manifest?.path,
    raw: scoringInputs.freezeManifest.evaluator_authority_manifest?.raw_byte_digest,
    semantic: scoringInputs.freezeManifest.evaluator_authority_manifest?.semantic_digest,
  };
  const referenceManifestClosure = {
    path: scoringInputs.evaluatorReference.evaluator_authority_manifest_path,
    raw: scoringInputs.evaluatorReference.evaluator_authority_manifest_raw_sha256,
    semantic: scoringInputs.evaluatorReference.evaluator_authority_manifest_digest,
  };
  for (const [closure, closureLabel] of [
    [recordManifestClosure, "private evaluation record"],
    [descriptorManifestClosure, "sealed repository descriptor"],
    [freezeManifestClosure, "scoring input freeze manifest"],
    [referenceManifestClosure, "evaluator public reference"],
  ]) if (stableCanonicalJson(closure) !== stableCanonicalJson(expectedManifestClosure)) throw new Error(`${closureLabel} evaluator authority manifest closure does not match the external freeze authority`);
  const scoringManifestInventory = scoringInputs.evaluatorAuthorityManifest?.file_inventory?.map(({ path, bytes, raw_sha256 }) => ({ path, bytes, raw_sha256 }));
  if (scoringInputs.evaluatorAuthorityManifest?.evaluator_revision !== externalAuthorityAnchor.evaluator_revision || scoringInputs.evaluatorAuthorityManifest?.manifest_digest !== externalAuthorityAnchor.evaluator_authority_manifest_digest || stableCanonicalJson(scoringManifestInventory) !== stableCanonicalJson(externalAuthorityAnchor.file_inventory)) throw new Error("scoring input evaluator authority manifest does not match the external freeze authority");
  verifySealedEvaluatorExternalAuthority({ descriptor: sealedRepository.descriptor, buffers: sealedRepository.inventory.buffers, externalAuthorityAnchor, label: "private evaluation record sealed repository" });
  const sealedRepositoryBinding = sealedSnapshotBinding(sealedRepository.inventory);
  if (record.sealed_repository_portable_digest !== sealedRepositoryBinding.portable_digest || record.sealed_repository_runtime_digest !== sealedRepositoryBinding.runtime_digest || stableCanonicalJson(record.sealed_repository_root_identity_before) !== stableCanonicalJson(sealedRepositoryBinding.root)) throw new Error("sealed repository snapshot identity is inconsistent");
  const sealedPrivateBundleRoot = resolveSealedWorkspace(dirname(record.hidden_evaluator_sealed_execution_path), "sealed private evaluator bundle");
  const staticPrivateBundleInventory = readStableWorkspaceInventory(bundle.canonicalPrivateRoot, "static private evaluator bundle");
  const sealedPrivateBundleInventory = readStableWorkspaceInventory(sealedPrivateBundleRoot, "sealed private evaluator bundle");
  const expectedSealedPrivateBundleDigest = canonicalDigest(expectedSealedPortableEntries(staticPrivateBundleInventory, SEALED_EXECUTABLE_PATHS, "sealed private evaluator bundle"));
  if (expectedSealedPrivateBundleDigest !== sealedPrivateBundleInventory.digest) throw new Error("sealed private evaluator bundle does not match the verified static bundle");
  assertSealedSnapshotModes(sealedPrivateBundleInventory, { label: "sealed private evaluator bundle" });
  const frozenInventory = readStableWorkspaceInventory(sealedFrozenWorkspace, "sealed frozen workspace");
  const candidateInventory = readStableWorkspaceInventory(sealedCandidateWorkspace, "sealed candidate workspace");
  const evidenceInventory = readStableWorkspaceInventory(sealedEvaluationInputRoot, "sealed evaluation-input evidence root");
  const originalWorkspaceAuthorityInventory = readStableWorkspaceInventory(sealedOriginalWorkspaceAuthorityRoot, "sealed original workspace authority root");
  if (record.frozen_workspace_sealed_inventory_digest !== frozenInventory.digest || record.candidate_workspace_sealed_inventory_digest !== candidateInventory.digest || record.evaluation_input_evidence_sealed_inventory_digest !== evidenceInventory.digest || record.frozen_workspace_sealed_runtime_digest !== frozenInventory.runtimeDigest || record.candidate_workspace_sealed_runtime_digest !== candidateInventory.runtimeDigest || record.evaluation_input_evidence_sealed_runtime_digest !== evidenceInventory.runtimeDigest) throw new Error("sealed private evaluation workspace identity is inconsistent");
  if (!evidence.repositoryDiffArtifact || evidence.repositoryDiffArtifact.frozen_workspace_tree_digest !== originalFrozenInventory.digest || evidence.repositoryDiffArtifact.candidate_workspace_tree_digest !== originalCandidateInventory.digest || stableCanonicalJson(evidence.repositoryDiffArtifact.candidate_authority) !== stableCanonicalJson(record.candidate_authority)) throw new Error("repository diff workspace authority does not match the original workspace inventory");
  const originalWorkspaceAuthority = validateOriginalWorkspaceAuthority({ inventory: originalWorkspaceAuthorityInventory, frozen: frozenInventory, candidate: candidateInventory, lineage: { run_instance_id: record.run_instance_id, case_id: record.case_id, attempt: record.attempt }, candidateAuthority: record.candidate_authority, root: realpathSync(root), label: "private evaluation record" });
  if (stableCanonicalJson(originalWorkspaceAuthority.authority.frozen_inventory) !== stableCanonicalJson(originalFrozenInventory.portableEntries) || stableCanonicalJson(originalWorkspaceAuthority.authority.candidate_inventory) !== stableCanonicalJson(originalCandidateInventory.portableEntries)) throw new Error("original workspace authority does not match the immutable original workspace inventories");
  if (record.original_workspace_authority_path !== ORIGINAL_WORKSPACE_AUTHORITY_PATH || record.original_workspace_authority_raw_sha256 !== rawByteDigest(originalWorkspaceAuthority.authorityBytes) || record.original_workspace_authority_digest !== originalWorkspaceAuthority.authority.authority_digest || record.original_workspace_authority_bytes !== originalWorkspaceAuthority.authorityBytes.length || record.repository_diff_sealed_authority_path !== SEALED_REPOSITORY_DIFF_ARTIFACT_PATH || record.repository_diff_sealed_authority_raw_sha256 !== rawByteDigest(originalWorkspaceAuthority.repositoryDiffBytes)) throw new Error("private evaluation record original workspace authority binding is inconsistent");
  if (stableCanonicalJson(evidence.repositoryDiffArtifact) !== stableCanonicalJson(originalWorkspaceAuthority.repositoryDiffArtifact)) throw new Error("persisted repository diff artifact does not match the child pre-execution authority");
  const persistedRepositoryDiffEntry = [...evidence.artifacts.values()].find(({ entry }) => entry.kind === "repository_diff");
  if (!persistedRepositoryDiffEntry || persistedRepositoryDiffEntry.read.rawByteDigest !== rawByteDigest(originalWorkspaceAuthority.repositoryDiffBytes) || Buffer.compare(persistedRepositoryDiffEntry.read.bytes, originalWorkspaceAuthority.repositoryDiffBytes) !== 0) throw new Error("persisted repository diff artifact bytes do not match the child pre-execution authority");
  const validatedFragment = validatePrivateEvaluatorFragment({ root, fragment, scoringPolicy: scoringInputs.scoringPolicy, requirementRecord: scoringInputs.requirementRecord, normalizedResult: normalized });
  const execution = {
    evaluatorRevision: bundle.manifest.evaluator_revision,
    runner: {
      path: sealedRunnerPath,
      sourcePath: record.evaluator_runner_source_identity.path,
      sourceBytes: record.evaluator_runner_source_identity.source_bytes,
      sourceSha256: record.evaluator_runner_source_identity.source_sha256,
      baseGitRevisionBytes: record.evaluator_runner_source_identity.base_git_revision_bytes,
      baseGitRevisionSha256: record.evaluator_runner_source_identity.base_git_revision_sha256,
      bytes: record.evaluator_runner_sealed_bytes,
      sha256: record.evaluator_runner_sealed_sha256,
      identityBefore: record.evaluator_runner_sealed_execution_identity_before,
    },
    hidden: {
      path: sealedHiddenPath,
      sourcePath: record.hidden_evaluator_path,
      sourceBytes: record.hidden_evaluator_bytes,
      sourceSha256: record.hidden_evaluator_sha256,
      bytes: record.hidden_evaluator_sealed_bytes,
      sha256: record.hidden_evaluator_sealed_sha256,
      identityBefore: record.hidden_evaluator_sealed_execution_identity_before,
    },
    repository: {
      path: sealedRepositoryRoot,
      descriptorSha256: record.sealed_repository_descriptor_sha256,
      descriptorBytes: record.sealed_repository_descriptor_bytes,
      sourceGraphDigest: record.sealed_repository_source_graph_digest,
      evaluatorAuthorityManifestPath: sealedRepository.descriptor.evaluator_authority_manifest_path,
      evaluatorAuthorityManifestRawSha256: sealedRepository.descriptor.evaluator_authority_manifest_raw_sha256,
      evaluatorAuthorityManifestDigest: sealedRepository.descriptor.evaluator_authority_manifest_digest,
      sealed: sealedRepositoryBinding,
    },
    privateBundle: {
      path: sealedPrivateBundleRoot,
      manifestPath: "private-evaluator-bundle.json",
      manifestBytes: sealedPrivateBundleInventory.buffers.get("private-evaluator-bundle.json").length,
      manifestSha256: rawByteDigest(sealedPrivateBundleInventory.buffers.get("private-evaluator-bundle.json")),
      evaluatorBundleId: bundle.manifest.evaluator_bundle_id,
      evaluatorBundleDigest: bundle.manifest.evaluator_bundle_digest,
      sealed: sealedSnapshotBinding(sealedPrivateBundleInventory),
    },
    frozen: { path: sealedFrozenWorkspace, sealed: sealedSnapshotBinding(frozenInventory) },
    candidate: { path: sealedCandidateWorkspace, sealed: sealedSnapshotBinding(candidateInventory) },
    evidence: { path: sealedEvaluationInputRoot, sealed: sealedSnapshotBinding(evidenceInventory) },
    originalWorkspaceAuthority: {
      path: sealedOriginalWorkspaceAuthorityRoot,
      authorityPath: record.original_workspace_authority_path,
      authoritySha256: record.original_workspace_authority_raw_sha256,
      authorityBytes: record.original_workspace_authority_bytes,
      authorityDigest: record.original_workspace_authority_digest,
      repositoryDiffPath: record.repository_diff_sealed_authority_path,
      repositoryDiffSha256: record.repository_diff_sealed_authority_raw_sha256,
      repositoryDiffBytes: originalWorkspaceAuthority.repositoryDiffBytes.length,
      repositoryDiffDigest: record.repository_diff_artifact_digest,
      sealed: sealedSnapshotBinding(originalWorkspaceAuthorityInventory),
      lineage: { run_instance_id: record.run_instance_id, case_id: record.case_id, attempt: record.attempt },
      candidateAuthority: structuredClone(record.candidate_authority),
    },
  };
  ORIGINAL_EXECUTION_AUTHORITIES.set(execution, privateOriginalWorkspaceSnapshot(originalFrozenInventory, originalCandidateInventory, { run_instance_id: record.run_instance_id, case_id: record.case_id, attempt: record.attempt }, record.candidate_authority));
  const executed = executeSealedEvaluator({ execution, externalAuthorityAnchor, repositoryRoot: root, normalized, normalizedBytes, label: "private hidden evaluator" });
  const actualFragment = executed.firstFragment;
  const repeatedFragment = executed.secondFragment;
  const firstBytes = executed.firstBytes;
  const secondBytes = executed.secondBytes;
  if (Buffer.compare(firstBytes, fragmentRead.bytes) !== 0 || Buffer.compare(secondBytes, fragmentRead.bytes) !== 0) throw new Error("persisted private fragment bytes do not match the sealed hidden evaluator output");
  const before = executed.before;
  const afterFirst = executed.afterFirst;
  const after = executed.afterSecond;
  for (const [field, state] of [
    ["sealed_repository_root_identity_before", before.repository.root],
    ["sealed_repository_root_identity_after_first", afterFirst.repository.root],
    ["sealed_repository_root_identity_after_second", after.repository.root],
  ]) {
    if (stableCanonicalJson(record[field]) !== stableCanonicalJson(state)) throw new Error("sealed repository execution identity is inconsistent");
  }
  if (record.sealed_repository_portable_digest !== before.repository.portable_digest || record.sealed_repository_portable_digest !== afterFirst.repository.portable_digest || record.sealed_repository_portable_digest !== after.repository.portable_digest || record.sealed_repository_runtime_digest !== before.repository.runtime_digest || record.sealed_repository_runtime_digest !== afterFirst.repository.runtime_digest || record.sealed_repository_runtime_digest !== after.repository.runtime_digest) throw new Error("sealed repository execution digest is inconsistent");
  if (record.evaluator_runner_sealed_sha256 !== before.runner.sha256 || record.evaluator_runner_sealed_bytes !== before.runner.bytes || record.evaluator_runner_sealed_sha256 !== after.runner.sha256 || record.evaluator_runner_sealed_bytes !== after.runner.bytes || record.hidden_evaluator_sealed_sha256 !== before.hidden.sha256 || record.hidden_evaluator_sealed_bytes !== before.hidden.bytes || record.hidden_evaluator_sealed_sha256 !== after.hidden.sha256 || record.hidden_evaluator_sealed_bytes !== after.hidden.bytes) throw new Error("sealed evaluator source digest or byte binding is inconsistent");
  for (const [kind, state] of [["runner", before.runner], ["hidden", before.hidden]]) {
    const prefix = kind === "runner" ? "evaluator_runner" : "hidden_evaluator";
    if (record[`${prefix}_sealed_dev`] !== state.identity.dev || record[`${prefix}_sealed_inode`] !== state.identity.ino || record[`${prefix}_sealed_nlink`] !== state.identity.nlink || record[`${prefix}_sealed_mtime_ms`] !== state.identity.mtimeMs || record[`${prefix}_sealed_ctime_ms`] !== state.identity.ctimeMs || stableCanonicalJson(record[`${prefix}_sealed_execution_identity_before`]) !== stableCanonicalJson(state.identity) || stableCanonicalJson(record[`${prefix}_sealed_execution_identity_after`]) !== stableCanonicalJson(after[kind].identity)) throw new Error(`${prefix} sealed execution identity is inconsistent`);
  }
  for (const [kind, state] of [["frozen_workspace", before.frozen], ["candidate_workspace", before.candidate], ["evaluation_input_evidence", before.evidence]]) {
    if (record[`${kind}_sealed_runtime_identity_before`] === undefined || stableCanonicalJson(record[`${kind}_sealed_runtime_identity_before`]) !== stableCanonicalJson(state) || stableCanonicalJson(record[`${kind}_sealed_runtime_identity_after`]) !== stableCanonicalJson(after[kind === "frozen_workspace" ? "frozen" : kind === "candidate_workspace" ? "candidate" : "evidence"])) throw new Error(`${kind} sealed runtime identity is inconsistent`);
  }
  if (record.evaluator_execution_status !== "completed" || record.first_run_fragment_sha256 !== rawByteDigest(firstBytes) || record.first_run_fragment_bytes !== firstBytes.length || record.second_run_fragment_sha256 !== rawByteDigest(secondBytes) || record.second_run_fragment_bytes !== secondBytes.length || record.deterministic_rerun !== true) throw new Error("private evaluator execution determinism evidence is inconsistent");
  if (stableCanonicalJson(actualFragment) !== stableCanonicalJson(validatedFragment)) throw new Error("persisted private fragment was not produced by the hidden evaluator");
  const expected = adaptPrivateEvaluatorFragmentToEnvelope({
    root,
    fragment: validatedFragment,
    authority: {
      ...scoringInputs,
      evaluatorReference: bundle.reference,
      normalizedResult: normalized,
      sourceSnapshotDigest: result.source_snapshot_digest,
      bundleManifest: bundle.manifest,
      privateFragmentDigest: record.private_fragment_sha256,
      privateFragmentBytes: record.private_fragment_bytes,
      privateEvaluationRecordDigest: record.evaluation_record_digest,
      fragmentBinding: {
        normalized_result_id: normalized.normalized_result_id,
        normalized_result_digest: normalized.normalized_result_digest,
        run_instance_id: normalized.lineage.run_instance_id,
        case_id: normalized.lineage.case_id,
        attempt: normalized.lineage.attempt,
      },
    },
  });
  if (stableCanonicalJson(expected) !== stableCanonicalJson(result)) throw new Error("public evaluator envelope is not the authority-owned adapter output for the sealed fragment");
  if (record.adapter_result_envelope_digest !== computeAdapterResultEnvelopeDigest(result)) throw new Error("private evaluation record adapter envelope digest is inconsistent");
  if (result.private_fragment_digest !== record.private_fragment_sha256 || result.private_fragment_bytes !== record.private_fragment_bytes || result.private_evaluation_record_digest !== record.evaluation_record_digest) throw new Error("public evaluator envelope private authority bindings are inconsistent");
  if (!evidence.repositoryDiffArtifact || record.frozen_workspace_inventory_digest !== evidence.repositoryDiffArtifact.frozen_workspace_tree_digest || record.candidate_workspace_inventory_digest !== evidence.repositoryDiffArtifact.candidate_workspace_tree_digest) throw new Error("private evaluation record workspace authority is incomplete");
  return { record, fragment, canonicalEvaluationRoot };
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
  const requiresEvaluatorAuthorityManifest = freezeManifest.fixture_id === "mn-build-option-update";
  if (requiresEvaluatorAuthorityManifest && !freezeManifest.evaluator_authority_manifest) throw new Error("scoring input freeze evaluator authority manifest is missing");
  const evaluatorAuthorityManifestSource = freezeManifest.evaluator_authority_manifest
    ? readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.evaluator_authority_manifest, suppliedPath: resolve(authorityRoot, freezeManifest.evaluator_authority_manifest.path), schemaPath: EVALUATOR_AUTHORITY_MANIFEST_SCHEMA_PATH, label: "authoritative evaluator authority manifest", publicArtifact: true })
    : null;
  const catalog = catalogSource.value;
  const policyManifest = policyManifestSource.value;
  const scoringPolicy = scoringPolicySource.value;
  const admissionRecord = admissionRecordSource.value;
  const requirementRecord = requirementRecordSource.value;
  const outputContract = outputContractSource.value;
  const evaluatorReference = evaluatorReferenceSource.value;
  const evaluatorAuthorityManifest = evaluatorAuthorityManifestSource?.value ?? null;
  let evaluatorAuthorityAnchor = null;
  if (evaluatorAuthorityManifest) {
    const evaluatorAuthorityBuffers = new Map(EVALUATOR_AUTHORITY_BINDING_PATHS.map((path) => {
      const absolute = resolveAuthorityArtifactPath(authorityRoot, path, `evaluator authority binding ${path}`);
      return [path, Buffer.from(readStableFile(absolute, `evaluator authority binding ${path}`, MAX_BOUNDARY_FILE_BYTES, { allowEmpty: false }).bytes)];
    }));
    validateEvaluatorAuthorityManifest({ manifest: evaluatorAuthorityManifest, buffers: evaluatorAuthorityBuffers, evaluatorRevision: evaluatorReference.evaluator_revision, root, label: "authoritative evaluator authority manifest" });
    evaluatorAuthorityAnchor = buildVerifiedEvaluatorAuthorityAnchor({
      evaluatorRevision: evaluatorReference.evaluator_revision,
      evaluatorReference,
      manifestReference: freezeManifest.evaluator_authority_manifest,
      manifestSource: evaluatorAuthorityManifestSource,
      buffers: evaluatorAuthorityBuffers,
      root,
      label: "authoritative evaluator freeze authority",
    });
  }
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
  if (evaluatorAuthorityManifest && freezeManifest.evaluator_authority_manifest.semantic_digest !== evaluatorAuthorityManifest.manifest_digest) throw new Error("evaluator authority manifest semantic digest does not match the scoring input freeze manifest");
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
  if (evaluatorAuthorityManifest) {
    const expectedEvaluatorAuthority = {
      path: freezeManifest.evaluator_authority_manifest.path,
      raw: freezeManifest.evaluator_authority_manifest.raw_byte_digest,
      semantic: evaluatorAuthorityManifest.manifest_digest,
    };
    for (const [artifact, artifactLabel] of [[admissionRecord, "final admission record"], [outputContract, "output contract"], [evaluatorReference, "evaluator public reference"]]) {
      if (artifact.evaluator_authority_manifest_path !== expectedEvaluatorAuthority.path || artifact.evaluator_authority_manifest_raw_sha256 !== expectedEvaluatorAuthority.raw || artifact.evaluator_authority_manifest_digest !== expectedEvaluatorAuthority.semantic) throw new Error(`${artifactLabel} evaluator authority manifest closure is invalid`);
    }
  }
  if (admissionRecord.evaluator_source_identity || evaluatorReference.evaluator_source_identity) {
    if (stableCanonicalJson(admissionRecord.evaluator_source_identity) !== stableCanonicalJson(evaluatorReference.evaluator_source_identity)) throw new Error("final admission evaluator source identity does not match the authoritative public reference");
  }
  if (admissionRecord.evaluator_requirement_count !== requirementRecord.requirements.length) throw new Error("final admission record requirement count does not match the authoritative requirement record");
  const expectedEvidenceMapIds = requirementRecord.requirements.flatMap(({ evidence_map_ids }) => evidence_map_ids).sort();
  const expectedMutationSetIds = requirementRecord.requirements.flatMap(({ mutation_ids }) => mutation_ids).sort();
  if (stableCanonicalJson([...admissionRecord.evidence_map_ids].sort()) !== stableCanonicalJson(expectedEvidenceMapIds)) throw new Error("final admission evidence-map inventory does not match the authoritative requirement record");
  if (stableCanonicalJson([...admissionRecord.mutation_set_ids].sort()) !== stableCanonicalJson(expectedMutationSetIds)) throw new Error("final admission mutation-set inventory does not match the authoritative requirement record");
  if (requirementRecord.admission_record_digest !== resolveRequirementAdmissionBindingDigest(admissionRecord)) throw new Error("requirement record admission digest was not re-derived from the authoritative final admission record");
  return { freezeManifest, freezeManifestSourceDigest: freeze.sourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, evaluatorAuthorityManifest, evaluatorAuthorityAnchor };
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
  privateEvaluationRoot = null,
  privateEvaluationRecordPath = null,
  privateFragmentPath = null,
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
  const normalizedSource = readNormalizedRecord({ verified, result });
  const normalized = normalizedSource.record;
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
  const privateAuthorityPaths = [privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath];
  const privateAuthorityCount = privateAuthorityPaths.filter(Boolean).length;
  const requiresPrivateAuthority = result.result_profile?.name === BINARY_SCOPE_VERIFICATION_PROFILE_NAME;
  if (requiresPrivateAuthority && privateAuthorityCount !== privateAuthorityPaths.length) {
    throw new Error("binary scope verification requires --private-evaluation-root, --private-evaluation-record, and --private-fragment together");
  }
  if (!requiresPrivateAuthority && privateAuthorityCount !== 0 && privateAuthorityCount !== privateAuthorityPaths.length) {
    throw new Error("private evaluation root, record, and fragment paths must be supplied together");
  }
  if (requiresPrivateAuthority) {
    verifyPrivateEvaluationRecord({ root, privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath, bundle, verified, normalized, normalizedBytes: normalizedSource.bytes, result, scoringInputs });
  }
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

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, stableCanonicalJson, readStableBytes, parseJsonRejectDuplicateKeys, assertNoSymlinkPathSegments } from "./content-addressed-store.mjs";
import { CALIBRATION_SOURCE_BINDINGS, assertSuccessorCalibrationConfig } from "./ask-benchmark-calibration-source.mjs";
import { validateSuccessorParent, validatePromptSuccessorPreparation, successorClosed, successorExact, successorDigest, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { readSuccessorParent, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_BYTES = 1024 * 1024;
const handles = new WeakMap();
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const SUCCESSOR_SCORING_INPUT_ROLES = Object.freeze([
  "catalog", "policy_manifest", "scoring_policy", "admission_record",
  "requirement_record", "output_contract", "evaluator_public_reference", "freeze_manifest",
]);
const ARGUMENTS = Object.freeze({
  catalog: "catalogPath", policy_manifest: "policyManifestPath", scoring_policy: "scoringPolicyPath",
  admission_record: "admissionRecordPath", requirement_record: "requirementRecordPath",
  output_contract: "outputContractPath", evaluator_public_reference: "referencePath", freeze_manifest: "freezeManifestPath",
});
function path(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
      || !/^[A-Za-z0-9._/-]+$/u.test(value) || posix.isAbsolute(value)
      || posix.normalize(value) !== value || value.split("/").some(p => ["", ".", ".."].includes(p))) {
    successorFail("SUCCESSOR_SCORING_INPUT_PATH", "public scoring input path");
  }
}
function reference(value) {
  successorClosed(value, ["path", "raw_digest", "bytes"], "scoring input reference");
  path(value.path); successorDigest(value.raw_digest, "scoring input digest");
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_BYTES) {
    successorFail("SUCCESSOR_SCORING_INPUT_SIZE", "scoring input reference");
  }
}

/** Deterministic pre-result references only. Does not create admission/approval. */
export function buildSuccessorScoringInputManifest({ parent, executionConfig, fixtures }) {
  validateSuccessorParent(parent);
  reference(executionConfig);
  if (!Array.isArray(fixtures) || fixtures.length !== 4) successorFail("SUCCESSOR_SCORING_INPUT_INVENTORY", "fixtures");
  for (const [index, [fixtureId, sourceId]] of CALIBRATION_SOURCE_BINDINGS.entries()) {
    const entry = fixtures[index];
    successorClosed(entry, ["fixture_id", "source_fixture_id", "input_manifest_digest", "artifacts"], "scoring fixture");
    successorExact([entry.fixture_id, entry.source_fixture_id], [fixtureId, sourceId], "scoring fixture mapping");
    successorDigest(entry.input_manifest_digest, "fixture input manifest digest");
    successorClosed(entry.artifacts, SUCCESSOR_SCORING_INPUT_ROLES, "scoring input roles");
    for (const role of SUCCESSOR_SCORING_INPUT_ROLES) reference(entry.artifacts[role]);
    if (new Set(Object.values(entry.artifacts).map(r => r.path)).size !== SUCCESSOR_SCORING_INPUT_ROLES.length) {
      successorFail("SUCCESSOR_SCORING_INPUT_ALIAS", "distinct input roles");
    }
  }
  for (const [role, expectedPath] of Object.entries({
    catalog: "benchmarks/portfolio-catalog.json", policy_manifest: "benchmarks/portfolio-policy-manifest.json",
    scoring_policy: "benchmarks/portfolio-scoring-policy.json",
  })) {
    for (const fixture of fixtures) {
      successorExact(fixture.artifacts[role].path, expectedPath, "canonical shared scoring policy path");
      successorExact(fixture.artifacts[role], fixtures[0].artifacts[role], "shared scoring policy identity");
    }
  }
  for (const role of ["admission_record", "requirement_record", "output_contract", "evaluator_public_reference", "freeze_manifest"]) {
    if (new Set(fixtures.map(f => f.artifacts[role].path)).size !== 4) {
      successorFail("SUCCESSOR_SCORING_INPUT_ALIAS", "cross-fixture input reuse");
    }
  }
  const base = {
    schema_version: "1.0.0", kind: "prompt_successor_scoring_input_manifest", phase: "pre_result",
    preregistration_digest: parent.preregistration_digest, execution_fixture_namespace: "catalog",
    execution_config: structuredClone(executionConfig), fixtures: structuredClone(fixtures),
    creates_admission: false, measured_execution_authorized: false,
  };
  return { ...base, manifest_digest: canonicalDigest(base) };
}
export function validateSuccessorScoringInputManifest(value, parent, expectedDigest) {
  successorDigest(expectedDigest, "pinned scoring input manifest");
  successorExact(value, buildSuccessorScoringInputManifest({ parent, executionConfig: value.execution_config, fixtures: value.fixtures }), "scoring input manifest");
  successorExact(value.manifest_digest, expectedDigest, "pre-result scoring input identity");
  return value;
}
function readReference(root, ref) {
  reference(ref);
  const absolute = resolve(root, ref.path);
  assertNoSymlinkPathSegments(absolute, "public scoring input");
  const bytes = readStableBytes(absolute, "public scoring input", MAX_BYTES);
  successorExact([hash(bytes), bytes.length], [ref.raw_digest, ref.bytes], "scoring input bytes");
  return { path: absolute, bytes, value: parseJsonRejectDuplicateKeys(bytes, "public scoring input") };
}
function get(handle, preparation) {
  const value = handles.get(handle);
  if (!value) successorFail("SUCCESSOR_UNVERIFIED_SCORING_INPUTS", "scoring input capability");
  validatePromptSuccessorPreparation(preparation);
  successorExact(value.preparationDigest, preparation.preparation_digest, "scoring input preparation");
  return value;
}

/**
 * Reads public inputs only; no private bundle, result, evaluator process or model.
 * The existing #197 verifier owns all freeze/catalog/requirement/admission checks.
 * Missing real packages are errors; this entrypoint never supplies placeholders.
 */
export async function openSuccessorScoringInputs({ preparation, manifestPath, root = ROOT }) {
  preparation = structuredClone(preparation);
  validatePromptSuccessorPreparation(preparation);
  if (preparation.scoring_input_manifest_digest === null) successorFail("SUCCESSOR_SCORING_INPUTS_REQUIRED", "preparation");
  successorExact(resolve(root), ROOT, "loaded scoring input root");
  successorExact(readSuccessorImplementationIdentity(root), preparation.implementation, "scoring implementation");
  const { parent } = await readSuccessorParent({ root });
  validatePromptSuccessorPreparation(preparation, { expectedParent: parent });
  const raw = readStableBytes(manifestPath, "scoring input manifest", MAX_BYTES);
  const manifest = parseJsonRejectDuplicateKeys(raw, "scoring input manifest");
  validateSuccessorScoringInputManifest(manifest, parent, preparation.scoring_input_manifest_digest);
  if (!raw.equals(Buffer.from(`${stableCanonicalJson(manifest)}\n`))) successorFail("SUCCESSOR_SCORING_INPUT_CANONICAL", "manifest bytes");
  const config = readReference(root, manifest.execution_config);
  const { assertBenchmarkSchemaInstance } = await import("./ask-benchmark-schema.mjs");
  assertBenchmarkSchemaInstance(config.value, {
    schemaPath: resolve(root, "benchmarks/schemas/portfolio-config.schema.json"), label: "successor execution config",
  });
  const frozenPath = "benchmarks/fixtures/checkpoint-b2/input-manifest.json";
  const inputBytes = readStableBytes(resolve(root, frozenPath), "registered calibration inputs", MAX_BYTES);
  const pinned = execFileSync("git", ["-C", root, "show", `${parent.source_revision}:${frozenPath}`], { encoding: null, timeout: 10000, maxBuffer: MAX_BYTES, stdio: ["ignore", "pipe", "pipe"] });
  if (!inputBytes.equals(pinned)) successorFail("SUCCESSOR_CALIBRATION_SOURCE_DRIFT", "historical input manifest");
  assertSuccessorCalibrationConfig(config.value, { inputManifestDigest: hash(inputBytes).slice(7) });
  // The Prompt experiment does not silently change the common #197 policies.
  for (const role of ["catalog", "policy_manifest", "scoring_policy"]) {
    const ref = manifest.fixtures[0].artifacts[role];
    const current = readReference(root, ref);
    const historical = execFileSync("git", ["-C", root, "show", `${parent.source_revision}:${ref.path}`], {
      encoding: null, timeout: 10000, maxBuffer: MAX_BYTES, stdio: ["ignore", "pipe", "pipe"],
    });
    if (!current.bytes.equals(historical)) successorFail("SUCCESSOR_SCORING_POLICY_DRIFT", "historical policy bytes");
  }
  const { verifyPortfolioScoringInputs } = await import("./ask-benchmark-evaluator-boundary.mjs");
  const entries = new Map();
  for (const [index, entry] of manifest.fixtures.entries()) {
    successorExact(entry.input_manifest_digest, hash(inputBytes), "registered fixture input manifest");
    const reads = Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [role, readReference(root, entry.artifacts[role])]));
    const options = { root, ...Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [ARGUMENTS[role], reads[role].path])), freezeManifestSourceDigest: entry.artifacts.freeze_manifest.raw_digest };
    const validated = verifyPortfolioScoringInputs(options);
    successorExact(validated.freezeManifest.fixture_id, entry.fixture_id, "scoring fixture catalog identity");
    successorExact(validated.freezeManifest.fixture_input_digest, entry.input_manifest_digest, "scoring fixture input identity");
    const catalogFixture = validated.catalog.fixtures.find(f => f.fixture_id === entry.fixture_id);
    successorExact([catalogFixture?.suite, catalogFixture?.task_class, catalogFixture?.repetitions, catalogFixture?.aggregate_eligible], ["calibration", parent.fixtures[index].task_class, parent.fixtures[index].repetitions, false], "calibration-only scoring scope");
    entries.set(entry.fixture_id, { entry, options, validated });
  }
  // End-of-read closure. Re-read all pinned public bytes; no new handle on drift.
  readReference(root, manifest.execution_config);
  for (const entry of manifest.fixtures) for (const role of SUCCESSOR_SCORING_INPUT_ROLES) readReference(root, entry.artifacts[role]);
  if (!raw.equals(readStableBytes(manifestPath, "scoring input manifest after", MAX_BYTES))) successorFail("SUCCESSOR_SCORING_INPUT_DRIFT", "manifest changed");
  successorExact(readSuccessorImplementationIdentity(root), preparation.implementation, "scoring implementation after reads");
  const handle = Object.freeze({ kind: "verified_successor_scoring_inputs" });
  handles.set(handle, { root, manifestPath, raw, manifest, entries, executionConfig: structuredClone(config.value), preparationDigest: preparation.preparation_digest });
  return handle;
}

export function inspectSuccessorScoringInputs(handle, preparation) {
  const value = get(handle, preparation);
  return {
    manifest_digest: value.manifest.manifest_digest,
    execution_config_digest: value.manifest.execution_config.raw_digest,
    fixtures: [...value.entries.values()].map(({ entry, validated }) => ({
      fixture_id: entry.fixture_id, source_fixture_id: entry.source_fixture_id,
      freeze_manifest_source_digest: entry.artifacts.freeze_manifest.raw_digest,
      admission_status: validated.admissionRecord.admission_status,
    })),
    private_bundle_verified: false, creates_admission: false, measured_execution_authorized: false,
  };
}

/** Reverify before consuming a per-case result; callers cannot override inputs. */
export function successorScoringOptions(handle, preparation, fixtureId) {
  const value = get(handle, preparation);
  const found = value.entries.get(fixtureId);
  if (!found) successorFail("SUCCESSOR_SCORING_FIXTURE_MISSING", "case fixture");
  if (!value.raw.equals(readStableBytes(value.manifestPath, "scoring input manifest after", MAX_BYTES))) successorFail("SUCCESSOR_SCORING_INPUT_DRIFT", "manifest changed");
  readReference(value.root, value.manifest.execution_config);
  for (const role of SUCCESSOR_SCORING_INPUT_ROLES) readReference(value.root, found.entry.artifacts[role]);
  const { freezeManifestPath, freezeManifestSourceDigest, ...options } = found.options;
  return { ...options, scoringInputFreezeManifestPath: freezeManifestPath, scoringInputFreezeManifestSourceDigest: freezeManifestSourceDigest };
}

export function assertSuccessorScoringExecution(handle, preparation, execution) {
  const value = get(handle, preparation);
  const file = readReference(value.root, value.manifest.execution_config);
  assertSuccessorExecutionConfigObject(execution.config, value.executionConfig, { root: value.root, configPath: file.path });
}

/** Pure comparison only; this function cannot create a scoring capability. */
export function assertSuccessorExecutionConfigObject(config, pinnedConfig, { root, configPath }) {
  successorClosed(config, [...Object.keys(pinnedConfig), "_kind", "_configPath", "_protocolPath"], "native execution config");
  const { _kind, _configPath, _protocolPath, ...publicConfig } = config;
  successorExact(_kind, "portfolio", "native execution config kind");
  if (typeof _configPath !== "string" || !_configPath || typeof _protocolPath !== "string" || !_protocolPath) {
    successorFail("SUCCESSOR_SCORING_INPUT_PATH", "native execution config metadata");
  }
  successorExact(resolve(_configPath), resolve(configPath), "pinned native execution config");
  successorExact(resolve(_protocolPath), resolve(root, pinnedConfig.protocol_path), "pinned native execution protocol");
  // Only the three verified loader fields above are metadata. Do not discard
  // arbitrary underscore-prefixed fields or compare only a subset of public data.
  successorExact(publicConfig, pinnedConfig, "pinned native execution config content");
}

export const SUCCESSOR_UNPINNED_ADMISSION_FIELDS = Object.freeze([
  "admissionDecisionPath", "admissionReviewAuthorityPath",
  "admissionReviewAuthoritySourceDigest", "admissionReviewArchivePath",
]);

/** Preparation 1.1 does not bind decision overlays. Presence is forbidden even
 * for null/undefined fields; an overlay needs a new pre-result contract. */
export function assertSuccessorFrozenAdmissionOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    successorFail("SUCCESSOR_SHAPE_INVALID", "per-case evaluator options");
  }
  for (const field of SUCCESSOR_UNPINNED_ADMISSION_FIELDS) {
    if (Object.hasOwn(options, field)) successorFail("SUCCESSOR_UNPINNED_ADMISSION_AUTHORITY", field);
  }
}

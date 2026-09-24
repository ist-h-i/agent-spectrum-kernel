import { createHash } from "node:crypto";
import { readdirSync, lstatSync } from "node:fs";
import { resolve, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest, readStableBytes, parseJsonRejectDuplicateKeys,
  assertNoSymlinkPathSegments,
} from "./content-addressed-store.mjs";
import {
  validatePromptSuccessorPreparation, validateSuccessorSourceScope,
  successorClosed, successorExact, successorDigest, successorFail,
} from "./ask-benchmark-prompt-successor.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_BYTES = 16 * 1024 * 1024;
const handles = new WeakMap();
const digestBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function read(path, label) {
  const bytes = readStableBytes(path, label, MAX_BYTES);
  return { bytes, digest: digestBytes(bytes), value: parseJsonRejectDuplicateKeys(bytes, label) };
}
function inside(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 240 || relativePath.includes("\\") || relativePath.includes(":") || relativePath.includes("\0") || relativePath.split("/").some((part) => ["", ".", ".."].includes(part)) || posix.isAbsolute(relativePath) || posix.normalize(relativePath) !== relativePath) successorFail("SUCCESSOR_PATH_REJECTED", "source inventory path");
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${resolve(root)}${sep}`)) successorFail("SUCCESSOR_PATH_REJECTED", "source inventory path");
  assertNoSymlinkPathSegments(path, "source inventory path");
  return path;
}
function inventory(root) {
  const output = [];
  let scannedEntries = 0;
  const walk = (relativeDirectory = "", depth = 0) => {
    if (depth > 12) successorFail("SUCCESSOR_SOURCE_ENTRY_REJECTED", "source nesting limit");
    const directory = relativeDirectory ? inside(root, relativeDirectory) : resolve(root);
    assertNoSymlinkPathSegments(directory, "engineering source root");
    for (const name of readdirSync(directory).sort()) {
      if (++scannedEntries > 1024) successorFail("SUCCESSOR_SOURCE_ENTRY_REJECTED", "source inventory size limit");
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const path = inside(root, relativePath);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(relativePath, depth + 1);
      else if (stat.isFile() && name.endsWith(".json")) output.push(relativePath);
      else successorFail("SUCCESSOR_SOURCE_ENTRY_REJECTED", "engineering source root");
      if (output.length > 14) successorFail("SUCCESSOR_EXTRA_RESULT", "engineering source root");
    }
  };
  walk();
  return output.sort();
}
function assertDisjointSourcePaths(paths) {
  const entries = Object.values(paths);
  for (const path of entries) {
    if (typeof path !== "string" || !path.startsWith("/")) successorFail("SUCCESSOR_PATH_REJECTED", "source path");
    assertNoSymlinkPathSegments(path, "source path");
  }
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const a = resolve(entries[left]);
      const b = resolve(entries[right]);
      if (a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`)) successorFail("SUCCESSOR_SOURCE_ROOT_OVERLAP", "source paths");
    }
  }
}

// Pure matching used by both the real reader and focused adversarial tests.
// This function does not confer verification status or produce a reader handle.
export function assertSuccessorSourceBinding({ preparation, scope, binding, normalized, engineering }) {
  const target = preparation.cases.find(({ case_id }) => case_id === binding.successor_case_id);
  if (!target || target.prompt_role !== scope.prompt_role) successorFail("SUCCESSOR_CASE_TRANSPLANT", "source binding");
  const expected = {
    case_id: binding.source_case_id,
    run_instance_id: scope.source.run_instance_id,
    plan_id: scope.source.plan_id,
    plan_digest: scope.source.plan_digest,
    repository_revision: scope.source.repository_revision,
    materialization_manifest_digest: scope.source.materialization_manifest_digest,
    runtime_identity_digest: scope.source.runtime_identity_digest,
    fixture_id: target.fixture_id,
    fixture_input_digest: binding.fixture_input_digest,
    adapter_track: "codex", condition: "full_ask", repetition: target.repetition,
    registered_repetitions: preparation.predecessor.fixtures.find(({ fixture_id }) => fixture_id === target.fixture_id).repetitions,
    task_class: target.task_class, attempt: "0001",
    effective_command_digest: binding.effective_command_digest,
    environment_snapshot_digest: binding.environment_snapshot_digest,
  };
  for (const [field, value] of Object.entries(expected)) successorExact(normalized.lineage[field], value, `normalized.lineage.${field}`);
  // Shape only here: exact request identity is verified against actual runner
  // evidence by the provenance reader, never predicted in a pre-result scope.
  successorDigest(normalized.lineage.request_digest, "normalized.lineage.request_digest");
  const rawFields = ["case_id", "run_instance_id", "plan_id", "plan_digest", "fixture_id", "fixture_input_digest", "condition", "repetition", "task_class", "attempt"];
  for (const field of rawFields) successorExact(engineering[field], expected[field], `engineering.${field}`);
  successorExact(engineering.adapter, "codex", "engineering.adapter");
  successorExact(engineering.normalized_result_id, normalized.normalized_result_id, "engineering.normalized_result_id");
  successorExact(engineering.normalized_result_digest, normalized.normalized_result_digest, "engineering.normalized_result_digest");
  successorExact(engineering.normalized_outcome, normalized.outcome, "engineering.normalized_outcome");
  return target;
}

/**
 * Scoped adapter over #197 normalized/result validators. The ordinary four-condition
 * result-set verifier is deliberately NOT relaxed or misrepresented as accepting
 * this subset. The pre-result scope declares all 14 selected full_ask attempts;
 * other source-plan conditions must remain unexecuted. No raw score is calculated.
 *
 * This preparation surface accepts synthetic test evidence only. A measured-reader
 * authority/entrypoint belongs to the later, separately authorized #235 run.
 */
export async function openSuccessorResultSource({ preparation, scope, expectedScopeDigest, paths, sourceManifestSourceDigest, sourceSnapshotDigest, accessMode, measuredAuthority, root = ROOT }) {
  if (!["synthetic_only", "measured"].includes(accessMode)) successorFail("SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED", "accessMode");
  if (accessMode === "measured" && !measuredAuthority) successorFail("SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED", "measured authority");
  // Own the complete validation input before the first asynchronous boundary.
  ({ preparation, scope, paths } = structuredClone({ preparation, scope, paths }));
  validatePromptSuccessorPreparation(preparation);
  validateSuccessorSourceScope(scope, preparation, expectedScopeDigest);
  if (accessMode === "measured") {
    const { assertSuccessorMeasuredSourceAuthority } = await import("./ask-benchmark-prompt-successor-measured-authority.mjs");
    assertSuccessorMeasuredSourceAuthority(measuredAuthority, { preparation, scope });
  }
  successorClosed(paths, ["normalizedResultsPath", "engineeringResultsPath", "sourceManifestPath"], "paths");
  successorDigest(sourceManifestSourceDigest, "approved source manifest digest");
  successorDigest(sourceSnapshotDigest, "source snapshot digest");
  assertDisjointSourcePaths(paths);
  const [normalizer, scorer, resultSets] = await Promise.all([
    import("./ask-benchmark-normalized-results.mjs"),
    import("./ask-benchmark-portfolio-score.mjs"),
    import("./ask-benchmark-portfolio-result-set.mjs"),
  ]);
  const source = read(paths.sourceManifestPath, "engineering source manifest");
  successorExact(source.digest, sourceManifestSourceDigest, "source manifest authority");
  resultSets.validateEngineeringResultSourceManifest(source.value, { root });
  const verified = normalizer.verifyNormalizedPortfolioResults({ root, outputPath: paths.normalizedResultsPath, sourceSnapshotDigest });
  const { manifest, generationPath } = verified;
  successorExact(manifest.normalizer.source_revision, scope.source.repository_revision, "normalizer source revision");
  const sourceExpected = {
    plan_id: scope.source.plan_id, plan_digest: scope.source.plan_digest,
    run_instance_id: scope.source.run_instance_id, source_snapshot_digest: sourceSnapshotDigest,
    adapter_track: "codex", normalized_generation_id: `snapshot-${sourceSnapshotDigest.slice(7)}`,
    normalized_manifest_digest: manifest.normalized_run_digest, source_revision: scope.source.repository_revision,
  };
  for (const [field, value] of Object.entries(sourceExpected)) successorExact(source.value[field], value, `source manifest.${field}`);
  for (const field of ["plan_id", "plan_digest", "run_instance_id"]) successorExact(manifest.source[field], scope.source[field], `normalized manifest.${field}`);
  successorExact(manifest.source.repository_revision, scope.source.repository_revision, "normalized manifest.repository_revision");
  successorExact(manifest.source_snapshot_digest, sourceSnapshotDigest, "normalized source snapshot");
  successorExact(manifest.pool_adapter_results, false, "adapter pooling");
  const allowed = new Set(scope.source.bindings.map(({ source_case_id }) => source_case_id));
  const selected = manifest.cases.filter(({ case_id }) => allowed.has(case_id));
  successorExact(selected.length, 14, "selected source inventory");
  if (new Set(selected.map(({ case_id }) => case_id)).size !== 14) successorFail("SUCCESSOR_DUPLICATE_SOURCE_CASE", "normalized manifest");
  for (const excluded of manifest.cases.filter(({ case_id }) => !allowed.has(case_id))) {
    if ((excluded.normalized_attempts?.length ?? 0) !== 0 || excluded.terminal_attempt) successorFail("SUCCESSOR_OUT_OF_SCOPE_EXECUTION", "excluded source case");
  }
  successorExact(source.value.inventory.length, 14, "engineering inventory length");
  const expectedPaths = source.value.inventory.map(({ path }) => path).sort();
  if (new Set(expectedPaths).size !== 14) successorFail("SUCCESSOR_DUPLICATE_RESULT_PATH", "source inventory");
  successorExact(inventory(paths.engineeringResultsPath), expectedPaths, "source directory inventory");
  const rows = [];
  let totalSourceBytes = 0;
  const observedFiles = [];
  const seenRaw = new Set();
  const seenNormalized = new Set();
  for (const binding of scope.source.bindings) {
    const current = selected.find(({ case_id }) => case_id === binding.source_case_id);
    if (!["completed", "failed", "unavailable", "interrupted", "invalid"].includes(current.status)) successorFail("SUCCESSOR_SOURCE_NOT_TERMINAL", "selected case");
    successorExact(current.terminal_attempt, "0001", "terminal attempt");
    successorExact(current.normalized_attempts.length, 1, "no hidden retries");
    const reference = current.normalized_attempts[0];
    successorExact(reference.attempt, "0001", "normalized attempt");
    const normalizedFile = read(inside(generationPath, reference.path), "normalized attempt");
    const manifestEntry = manifest.inventory.find(({ path }) => path === reference.path);
    if (!manifestEntry) successorFail("SUCCESSOR_NORMALIZED_ENTRY_MISSING", "normalized inventory");
    successorExact(normalizedFile.digest, manifestEntry.sha256, "normalized file digest");
    successorExact(normalizedFile.bytes.length, manifestEntry.bytes, "normalized file bytes");
    const normalized = normalizer.validateNormalizedPortfolioResult(normalizedFile.value, { root });
    successorExact(normalized.outcome, current.status, "source outcome");
    successorExact(normalized.normalized_result_id, reference.normalized_result_id, "normalized reference id");
    successorExact(normalized.normalized_result_digest, reference.normalized_result_digest, "normalized reference digest");
    const entries = source.value.inventory.filter((entry) => entry.normalized_result_id === normalized.normalized_result_id);
    successorExact(entries.length, 1, "one exact engineering result per attempt");
    const entry = entries[0];
    const engineeringPath = inside(paths.engineeringResultsPath, entry.path);
    const engineeringFile = read(engineeringPath, "engineering result");
    successorExact(engineeringFile.digest, entry.raw_byte_digest, "engineering source bytes");
    successorExact(engineeringFile.bytes.length, entry.bytes, "engineering source length");
    totalSourceBytes += normalizedFile.bytes.length + engineeringFile.bytes.length;
    if (totalSourceBytes > 128 * 1024 * 1024) successorFail("SUCCESSOR_SOURCE_SIZE_LIMIT", "source inventory");
    const engineering = scorer.validatePortfolioEngineeringResult(engineeringFile.value, { root });
    for (const field of ["engineering_result_id", "engineering_result_digest", "normalized_result_id", "normalized_result_digest", "case_id", "attempt", "condition", "repetition", "effective_admission_mode", "effective_admission_status", "frozen_admission_record_digest", "requirement_authority_digest", "admission_decision_digest", "admission_decision_revision"]) successorExact(engineering[field], entry[field], `engineering inventory.${field}`);
    successorExact(engineering.source_snapshot_digest, sourceSnapshotDigest, "engineering source snapshot");
    const target = assertSuccessorSourceBinding({ preparation, scope, binding, normalized, engineering });
    if (seenRaw.has(engineering.engineering_result_id) || seenNormalized.has(normalized.normalized_result_id)) successorFail("SUCCESSOR_DUPLICATE_RESULT", "verified inventory");
    seenRaw.add(engineering.engineering_result_id);
    seenNormalized.add(normalized.normalized_result_id);
    rows.push({ target: structuredClone(target), normalized: structuredClone(normalized), engineering: structuredClone(engineering) });
    observedFiles.push([engineeringPath, engineeringFile.digest], [inside(generationPath, reference.path), normalizedFile.digest]);
  }
  successorExact(inventory(paths.engineeringResultsPath), expectedPaths, "post-read inventory");
  for (const [path, before] of observedFiles) successorExact(read(path, "post-read source").digest, before, "source changed during read");
  successorExact(read(paths.sourceManifestPath, "source manifest after").digest, source.digest, "source manifest changed");
  const after = normalizer.verifyNormalizedPortfolioResults({ root, outputPath: paths.normalizedResultsPath, sourceSnapshotDigest });
  successorExact(after.manifest.normalized_run_digest, manifest.normalized_run_digest, "normalized generation changed");
  const evidence = {
    kind: "prompt_successor_scoped_source", access_mode: accessMode,
    preparation_digest: preparation.preparation_digest, scope_digest: scope.scope_digest,
    run_instance_id: scope.run_instance_id, prompt_role: scope.prompt_role,
    source_snapshot_digest: sourceSnapshotDigest, source_manifest_digest: source.digest,
    normalized_manifest_digest: manifest.normalized_run_digest,
    source_runtime_identity_digest: scope.source.runtime_identity_digest,
    entries: rows.map(({ target, engineering }) => ({ case_id: target.case_id, engineering_result_id: engineering.engineering_result_id, engineering_result_digest: engineering.engineering_result_digest })),
    source_freshness: verified.freshness, execution_attestation_verified: false,
    evaluator_authority_reverified: false,
    full_four_condition_result_set: false, raw_score_recalculated: false,
    mutation_authorized: false,
  };
  const handle = Object.freeze({ source_digest: canonicalDigest(evidence) });
  handles.set(handle, { evidence, rows });
  return handle;
}

export function inspectSuccessorSource(handle) {
  const verified = handles.get(handle);
  if (!verified) successorFail("SUCCESSOR_UNVERIFIED_SOURCE", "reader handle");
  return structuredClone(verified.evidence);
}

export function readSuccessorVerifiedEngineeringResult(handle, caseId) {
  const verified = handles.get(handle);
  if (!verified) successorFail("SUCCESSOR_UNVERIFIED_SOURCE", "reader handle");
  const row = verified.rows.find(({ target }) => target.case_id === caseId);
  if (!row) successorFail("SUCCESSOR_CASE_MISSING", "reader case");
  // Preserve raw #197 observations/unknowns. No invented boolean-to-count mapping.
  return { case_id: caseId, engineering: structuredClone(row.engineering), normalized: structuredClone(row.normalized) };
}

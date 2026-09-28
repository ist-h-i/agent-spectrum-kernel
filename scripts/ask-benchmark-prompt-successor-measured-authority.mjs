import {
  closeSync, existsSync, fsyncSync, openSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { validatePromptSuccessorPreparation, validateSuccessorSourceScope, successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { assertSuccessorAdapterFacts } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { validateSuccessorFromRepository } from "./ask-benchmark-prompt-successor-repository.mjs";
import { inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { assertCalibrationEffectiveAdmission, assertCalibrationExecutionAdmission } from "./ask-benchmark-calibration-execution-admission.mjs";
import { assertSuccessorHostIsolationReady, probeSuccessorPrivateRootDeny } from "./ask-benchmark-prompt-successor-host-isolation.mjs";
import { openSuccessorExecDiagnostic } from "./ask-benchmark-prompt-successor-host-diagnostic.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const handles = new WeakMap();
const MAX_AUTHORITY_BYTES = 512 * 1024;
export const ISSUE_291_MEASURED_AUTHORITY = Object.freeze({
  issue: 291,
  source_revision: "756c72b3fba158fbbc33642128bf5ab87097914b",
  source_tree: "eb9f8d62374d45f3941b1e9da2b3229db1b3ab14",
  authentication_mode: "chatgpt_subscription",
  planned_trials: 28,
  automatic_retries: 0,
  timeout_ms: 900000,
});

function sourceClosure(source) {
  return canonicalDigest({
    scope_digest: source.scope.scope_digest,
    run_dir: resolve(source.execution.runDir),
    runtime_config_path: resolve(source.runtimeConfigPath),
    agent_bin: resolve(source.agentBin),
  });
}

function pairedRunParent(sources) {
  const currentParent = resolve(dirname(resolve(sources.current_prompt.execution.runDir)));
  const candidateParent = resolve(dirname(resolve(sources.prompt_v2.execution.runDir)));
  successorExact(candidateParent, currentParent, "measured paired run parent");
  assertNoSymlinkPathSegments(currentParent, "measured paired run parent");
  realpathSync(currentParent);
  return currentParent;
}

function journalPathForSources(sources) {
  return resolve(pairedRunParent(sources), `.ask-successor-issue291-${sources.current_prompt.scope.run_instance_id}.journal.json`);
}

function authorityPathForSources(sources) {
  return resolve(pairedRunParent(sources), `.ask-successor-issue291-${sources.current_prompt.scope.run_instance_id}.authority.json`);
}

function namespacePathForSources(sources) {
  return resolve(pairedRunParent(sources), ".ask-successor-issue291.namespace.json");
}

function expectedNamespaceRecord(sources) {
  const body = {
    schema_version: "1.0.0", kind: "prompt_successor_measured_namespace",
    experiment_run_instance_id: sources.current_prompt.scope.run_instance_id,
    source_closures: Object.fromEntries(["current_prompt", "prompt_v2"]
      .map(role => [role, sourceClosure(sources[role])])),
  };
  return { ...body, record_digest: canonicalDigest(body) };
}

/** A single atomic marker owns the paired native run parent across experiment UUIDs. */
export function bindSuccessorMeasuredNamespace(sources, { reserve = false } = {}) {
  successorClosed(sources, ["current_prompt", "prompt_v2"], "measured namespace sources");
  successorExact(sources.current_prompt.scope.run_instance_id,
    sources.prompt_v2.scope.run_instance_id, "measured namespace experiment ID");
  const path = namespacePathForSources(sources);
  const expected = expectedNamespaceRecord(sources);
  if (reserve) writeAuthorityRecordOnce(path, expected);
  if (!existsSync(path)) successorFail("SUCCESSOR_MEASURED_NAMESPACE_REQUIRED", "native run namespace is unreserved");
  const actual = readAuthorityRecord(path, "prompt_successor_measured_namespace");
  successorExact(actual, expected, "measured native run namespace ownership");
  return { path_digest: canonicalDigest({ path }), record_digest: actual.record_digest };
}

function readAuthorityRecord(path, kind = "prompt_successor_measured_authority_freeze") {
  assertNoSymlinkPathSegments(path, "measured authority record");
  const bytes = readFileSync(path);
  if (bytes.length < 2 || bytes.length > MAX_AUTHORITY_BYTES) successorFail("SUCCESSOR_MEASURED_AUTHORITY_RECORD_INVALID", "authority record size");
  const value = parseJsonRejectDuplicateKeys(bytes, "measured authority record");
  successorClosed(value, kind === "prompt_successor_measured_namespace"
    ? ["schema_version", "kind", "experiment_run_instance_id", "source_closures", "record_digest"]
    : ["schema_version", "kind", "evidence", "record_digest"], "measured authority record");
  successorExact(value.schema_version, "1.0.0", "measured authority record version");
  successorExact(value.kind, kind, "measured authority record kind");
  const { record_digest: digest, ...body } = value;
  successorExact(canonicalDigest(body), digest, "measured authority record digest");
  return value;
}

function writeAuthorityRecordOnce(path, value) {
  const bytes = Buffer.from(`${stableCanonicalJson(value)}\n`);
  if (bytes.length > MAX_AUTHORITY_BYTES) successorFail("SUCCESSOR_MEASURED_AUTHORITY_RECORD_INVALID", "authority record size");
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
  return true;
}

function validateNativeSourceAtFreeze({ role, source, preparation, root }) {
  const actual = inspectVerifiedPortfolioExecution({ ...source.execution, root });
  if (actual.cases.some((entry) => entry.state.status !== "pending" || entry.state.attempt_count !== 0 || entry.attempts.length !== 0)) {
    successorFail("SUCCESSOR_MEASURED_AUTHORITY_LATE", "measured authority must be frozen before the first native attempt");
  }
  successorExact(actual.identity.run_instance_id, source.scope.source.run_instance_id, "measured native run");
  successorExact(actual.identity.repository_revision, preparation.implementation.revision, "measured repository revision");
  successorExact(actual.plan.plan_id, source.scope.source.plan_id, "measured plan");
  successorExact(actual.identity.plan.digest, source.scope.source.plan_digest, "measured plan digest");
  successorExact(actual.materialization.manifestDigest, source.scope.source.materialization_manifest_digest, "measured materialization");
  assertSuccessorAdapterFacts(preparation.runtime, actual.adapter_identities.get("codex"), { checkHost: true });
  successorExact(canonicalDigest(actual.adapter_identities.get("codex")), source.scope.source.runtime_identity_digest, "measured runtime identity");
  return actual;
}

function authorityEvidence({ preparation, sources, scoringIdentity, calibrationAdmissionEvidence, hostIsolationProbes, hostExecutionDiagnostic }) {
  const authorityPath = authorityPathForSources(sources);
  return {
    schema_version: "1.1.0",
    kind: "prompt_successor_measured_authority",
    authority_source: "github_issue_291_plus_durable_result_blind_freeze",
    issue: ISSUE_291_MEASURED_AUTHORITY.issue,
    original_issue_source: {
      revision: ISSUE_291_MEASURED_AUTHORITY.source_revision,
      tree: ISSUE_291_MEASURED_AUTHORITY.source_tree,
      role: "historical_frozen_measurement_source_not_runtime_authority",
    },
    preregistration_source: {
      revision: preparation.predecessor.source_revision,
      tree: preparation.predecessor.source_tree,
    },
    preparation_digest: preparation.preparation_digest,
    implementation: structuredClone(preparation.implementation),
    scoring_input_identity: structuredClone(scoringIdentity),
    calibration_execution_admission: structuredClone(calibrationAdmissionEvidence),
    host_isolation_probes: structuredClone(hostIsolationProbes),
    host_execution_diagnostic: structuredClone(hostExecutionDiagnostic),
    scoring_inputs_verified_at_freeze: true,
    experiment_run_instance_id: sources.current_prompt.scope.run_instance_id,
    source_closures: Object.fromEntries(Object.entries(sources).map(([role, value]) => [role, sourceClosure(value)])),
    authority_record_path_digest: canonicalDigest({ path: authorityPath }),
    journal_path_digest: canonicalDigest({ path: journalPathForSources(sources) }),
    sealed_before_first_attempt: true,
    durable_reopen_authorized: true,
    exact_host_runtime_verified_at_freeze: true,
    exact_native_sources_verified_at_freeze: true,
    ordered_execution_authorized: true,
    measured_result_access_authorized: true,
    measured_decision_authorized: true,
    automatic_retry_authorized: false,
    portfolio_mutation_authorized: false,
  };
}

export async function openSuccessorMeasuredAuthority({ preparation, sources, scoringInputs, calibrationAdmission, normalizedRoots, hostIsolationProbePath, hostExecutionDiagnosticRoot, root = ROOT }) {
  ({ preparation, sources } = structuredClone({ preparation, sources }));
  successorExact(resolve(root), ROOT, "measured authority root");
  await validateSuccessorFromRepository(preparation, { root });
  if (preparation.scoring_input_manifest_digest === null) successorFail("SUCCESSOR_SCORING_INPUTS_REQUIRED", "measured authority");
  const { inspectSuccessorScoringInputs, assertSuccessorScoringExecution } = await import("./ask-benchmark-prompt-successor-scoring-inputs.mjs");
  const scoringIdentity = inspectSuccessorScoringInputs(scoringInputs, preparation);
  successorExact(scoringIdentity.manifest_digest, preparation.scoring_input_manifest_digest, "measured scoring input manifest");
  successorExact(preparation.runtime.authentication_mode, ISSUE_291_MEASURED_AUTHORITY.authentication_mode, "issue291 authentication class");
  successorExact(preparation.runtime.timeout_ms, ISSUE_291_MEASURED_AUTHORITY.timeout_ms, "issue291 timeout");
  successorExact(preparation.expected_case_count, ISSUE_291_MEASURED_AUTHORITY.planned_trials, "issue291 trial count");
  // The current Judge transport has synthetic-only evidence. A live freeze
  // must wait for a qualified native Judge profile and its pre-result binding.
  if (preparation.runtime.model !== "synthetic-native-fake-not-a-service") {
    successorFail("SUCCESSOR_JUDGE_QUALIFICATION_REQUIRED", "live Judge profile and qualification are not bound");
  }
  successorClosed(sources, ["current_prompt", "prompt_v2"], "measured sources");
  for (const role of ["current_prompt", "prompt_v2"]) {
    const source = sources[role];
    successorClosed(source, ["scope", "expectedScopeDigest", "execution", "runtimeConfigPath", "agentBin"], `measured source ${role}`);
    validateSuccessorSourceScope(source.scope, preparation, source.expectedScopeDigest);
    successorExact(source.scope.prompt_role, role, "measured source role");
    successorExact(source.scope.source.repository_revision, preparation.implementation.revision, "measured scoped repository revision");
    assertSuccessorScoringExecution(scoringInputs, preparation, source.execution);
  }
  successorExact(sources.current_prompt.scope.run_instance_id, sources.prompt_v2.scope.run_instance_id, "measured experiment run");
  if (sources.current_prompt.scope.source.run_instance_id === sources.prompt_v2.scope.source.run_instance_id) {
    successorFail("SUCCESSOR_NATIVE_RUN_COLLISION", "measured native runs");
  }
  for (const [field, label] of [
    ["plan_id", "measured paired plan id"],
    ["plan_digest", "measured paired plan digest"],
    ["repository_revision", "measured paired revision"],
    ["runtime_identity_digest", "measured paired runtime"],
    ["materialization_manifest_digest", "measured paired materialization"],
  ]) successorExact(sources.current_prompt.scope.source[field], sources.prompt_v2.scope.source[field], label);

  const recordPath = authorityPathForSources(sources);
  const hadRecord = existsSync(recordPath);
  const admissionEvidence = assertCalibrationExecutionAdmission(calibrationAdmission, {
    preparation, sources, scoringInputs, requirePreflight: !hadRecord,
  });
  if (scoringIdentity.fixtures.some((entry) => entry.admission_overlay === null || entry.effective_admission_status !== "review_evidence_missing")) {
    successorFail("SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION", "measured freeze requires four pinned reviewed overlay candidates");
  }
  if (!hadRecord) {
    const current = validateNativeSourceAtFreeze({ role: "current_prompt", source: sources.current_prompt, preparation, root });
    const candidate = validateNativeSourceAtFreeze({ role: "prompt_v2", source: sources.prompt_v2, preparation, root });
    if (current.identity.run_instance_id === candidate.identity.run_instance_id) successorFail("SUCCESSOR_NATIVE_RUN_COLLISION", "measured native runs");
  }

  const manifestPathDigest = admissionEvidence.fixtures[0]?.private_manifest_path_digest;
  if (!manifestPathDigest || typeof hostIsolationProbePath !== "string") {
    successorFail("SUCCESSOR_HOST_ISOLATION_REQUIRED", "admitted private manifest path for native deny probe");
  }
  const hostIsolationProbes = Object.fromEntries(["current_prompt", "prompt_v2"].map(role => [role,
    probeSuccessorPrivateRootDeny({ root, source: sources[role], runtime: preparation.runtime,
      privateManifestPath: hostIsolationProbePath, expectedManifestPathDigest: manifestPathDigest }),
  ]));
  if (typeof hostExecutionDiagnosticRoot !== "string") {
    successorFail("SUCCESSOR_HOST_ISOLATION_REQUIRED", "external exec-session diagnostic namespace");
  }
  const hostExecutionDiagnostic = await openSuccessorExecDiagnostic({ root, preparation, sources,
    scoringInputs, calibrationAdmission, normalizedRoots, hostIsolationProbePath,
    diagnosticRoot: hostExecutionDiagnosticRoot });
  assertSuccessorHostIsolationReady(hostIsolationProbes, hostExecutionDiagnostic);

  const baseEvidence = authorityEvidence({ preparation, sources, scoringIdentity,
    calibrationAdmissionEvidence: admissionEvidence, hostIsolationProbes, hostExecutionDiagnostic });
  const body = { schema_version: "1.0.0", kind: "prompt_successor_measured_authority_freeze", evidence: baseEvidence };
  const expectedRecord = { ...body, record_digest: canonicalDigest(body) };
  bindSuccessorMeasuredNamespace(sources, { reserve: !hadRecord });
  if (!hadRecord) writeAuthorityRecordOnce(recordPath, expectedRecord);
  const record = readAuthorityRecord(recordPath);
  successorExact(record, expectedRecord, "measured authority durable freeze");
  const evidence = { ...baseEvidence, authority_record_digest: record.record_digest };

  const handle = Object.freeze({ kind: "prompt_successor_measured_authority_handle" });
  handles.set(handle, {
    evidence,
    baseEvidence,
    recordPath,
    recordDigest: record.record_digest,
    preparation_digest: preparation.preparation_digest,
    preparation: structuredClone(preparation),
    scoringInputs,
    calibrationAdmission,
    sources: structuredClone(sources),
  });
  return handle;
}

function found(handle, { deferCalibrationAdmission = false } = {}) {
  const value = handles.get(handle);
  if (!value) successorFail("SUCCESSOR_MEASURED_AUTHORITY_REQUIRED", "opaque measured authority");
  const record = readAuthorityRecord(value.recordPath);
  bindSuccessorMeasuredNamespace(value.sources);
  successorExact(record.record_digest, value.recordDigest, "measured authority persisted record");
  successorExact(record.evidence, value.baseEvidence, "measured authority persisted evidence");
  if (!deferCalibrationAdmission) {
    successorExact(assertCalibrationExecutionAdmission(value.calibrationAdmission, {
      preparation: value.preparation, sources: value.sources, scoringInputs: value.scoringInputs,
    }), value.evidence.calibration_execution_admission, "measured authority private execution admission drift");
  }
  return value;
}

/** #197's verified overlay, rederived from the pinned external review bytes. */
export function successorMeasuredEffectiveAdmission(handle, fixtureId, { preparation, scope, normalizedResultsPath }) {
  validatePromptSuccessorPreparation(preparation);
  const value = found(handle, { deferCalibrationAdmission: true });
  successorExact(value.preparation_digest, preparation.preparation_digest, "measured effective admission preparation");
  const role = scope?.prompt_role;
  if (!Object.hasOwn(value.sources, role)) successorFail("SUCCESSOR_ROLE_INVALID", "measured effective admission scope");
  successorExact(scope.scope_digest, value.sources[role].scope.scope_digest, "measured effective admission source scope");
  const { evidence, effectiveAuthority } = assertCalibrationEffectiveAdmission(
    value.calibrationAdmission, fixtureId, role, normalizedResultsPath,
    { preparation: value.preparation, sources: value.sources, scoringInputs: value.scoringInputs },
  );
  successorExact(evidence, value.evidence.calibration_execution_admission, "measured authority private execution admission drift");
  return effectiveAuthority;
}

export function assertSuccessorMeasuredAuthority(handle, { preparation, sources }) {
  validatePromptSuccessorPreparation(preparation);
  const value = found(handle);
  successorExact(value.preparation_digest, preparation.preparation_digest, "measured authority preparation");
  successorClosed(sources, ["current_prompt", "prompt_v2"], "measured authority sources");
  for (const role of ["current_prompt", "prompt_v2"]) {
    successorExact(sourceClosure(sources[role]), value.evidence.source_closures[role], `measured authority ${role} source`);
  }
  return structuredClone(value.evidence);
}

export function successorMeasuredJournalPath(handle, { preparation, sources }) {
  const evidence = assertSuccessorMeasuredAuthority(handle, { preparation, sources });
  const path = journalPathForSources(sources);
  successorExact(canonicalDigest({ path }), evidence.journal_path_digest, "measured journal path");
  return path;
}

export function assertSuccessorMeasuredSourceAuthority(handle, { preparation, scope }) {
  validatePromptSuccessorPreparation(preparation);
  const value = found(handle);
  successorExact(value.preparation_digest, preparation.preparation_digest, "measured source authority preparation");
  const role = scope?.prompt_role;
  if (!["current_prompt", "prompt_v2"].includes(role)) successorFail("SUCCESSOR_ROLE_INVALID", "measured source authority");
  successorExact(scope.scope_digest, value.sources[role].scope.scope_digest, "measured source authority scope");
  return structuredClone(value.evidence);
}

export function inspectSuccessorMeasuredAuthority(handle) {
  return structuredClone(found(handle).evidence);
}

export function assertSuccessorMeasuredCollectionAuthority(handle, { preparation, sources }) {
  validatePromptSuccessorPreparation(preparation);
  const value = found(handle);
  successorExact(value.preparation_digest, preparation.preparation_digest, "measured collection authority preparation");
  successorClosed(sources, ["current_prompt", "prompt_v2"], "measured collection sources");
  for (const role of ["current_prompt", "prompt_v2"]) {
    successorExact(sources[role]?.scope?.scope_digest, value.sources[role].scope.scope_digest, `measured collection ${role} scope`);
    successorExact(resolve(sources[role]?.execution?.runDir), resolve(value.sources[role].execution.runDir), `measured collection ${role} run`);
  }
  return structuredClone(value.evidence);
}

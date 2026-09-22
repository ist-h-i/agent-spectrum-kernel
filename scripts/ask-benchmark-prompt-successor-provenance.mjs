import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, readStableBytes } from "./content-addressed-store.mjs";
import { inspectSuccessorScoringInputs, successorScoringOptions, assertSuccessorScoringExecution } from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";
import { openSuccessorPromptInput, consumeSuccessorPromptInput, successorInputProjection, assertSuccessorAdapterFacts } from "./ask-benchmark-prompt-successor-delivery.mjs";
import {
  successorExact, successorClosed, successorFail,
  validatePromptSuccessorPreparation, validateSuccessorSourceScope,
} from "./ask-benchmark-prompt-successor.mjs";
import {
  openSuccessorResultSource, inspectSuccessorSource,
  readSuccessorVerifiedEngineeringResult,
} from "./ask-benchmark-prompt-successor-bridge.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const verifiedHandles = new WeakMap();

/** Pure equality check, not a verification capability constructor. */
export function assertSuccessorAttemptProvenance({ normalized, engineering, attempt, runIdentity }) {
  const lineage = normalized.lineage;
  successorExact(lineage.run_instance_id, runIdentity.run_instance_id, "actual execution run");
  successorExact(attempt.attempt, "0001", "actual attempt");
  successorExact(attempt.result.status, normalized.outcome, "actual execution outcome");
  for (const [normalizedField, actualField] of [
    ["request_digest", "request_digest"],
    ["raw_result_digest", "result_digest"],
    ["terminal_commit_digest", "commit_digest"],
    ["final_output_digest", "final_output_digest"],
    ["final_output_bytes", "final_output_bytes"],
    ["terminal_workspace_authority_digest", "terminal_workspace_authority_digest"],
    ["terminal_workspace_tree_digest", "terminal_workspace_tree_digest"],
    ["terminal_workspace_authority_bytes", "terminal_workspace_authority_bytes"],
    ["terminal_workspace_authority_availability", "terminal_workspace_authority_availability"],
    ["terminal_workspace_authority_support", "terminal_workspace_authority_support"],
  ]) successorExact(lineage[normalizedField], attempt.evidence[actualField], `execution evidence.${normalizedField}`);
  successorExact(attempt.request.case_id, lineage.case_id, "execution request case");
  successorExact(attempt.request.adapter, lineage.adapter_track, "execution request adapter");
  successorExact(attempt.request.condition, lineage.condition, "execution request condition");
  successorExact(attempt.request.agent.runtime_identity_digest, lineage.runtime_identity_digest, "execution request runtime");
  successorExact(attempt.request.agent.effective_command_digest, lineage.effective_command_digest, "execution request command");
  successorExact(attempt.request.agent.environment_snapshot_digest, lineage.environment_snapshot_digest, "execution request environment");
  successorExact(engineering.normalized_result_digest, normalized.normalized_result_digest, "engineering normalized digest");
}

/**
 * Real-library closure for disposable synthetic integration runs. No callback can
 * claim successful validation: the imports below own execution/evaluator checks.
 * This entrypoint intentionally does NOT authorize access to measured material.
 */
export async function verifySuccessorSourceProvenance({
  preparation, scope, expectedScopeDigest, source, execution, evaluatorOptionsByCase, scoringInputs,
  accessMode, root = ROOT,
}) {
  if (accessMode !== "synthetic_only") successorFail("SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED", "provenance access mode");
  // Snapshot data, but retain the identity of the opaque scoring-input capability.
  ({ preparation, scope, source, execution, evaluatorOptionsByCase } = structuredClone({
    preparation, scope, source, execution, evaluatorOptionsByCase,
  }));
  validatePromptSuccessorPreparation(preparation);
  validateSuccessorSourceScope(scope, preparation, expectedScopeDigest);
  successorExact(resolve(root), ROOT, "loaded verifier root");
  successorClosed(source, ["paths", "sourceManifestSourceDigest", "sourceSnapshotDigest"], "source inputs");
  successorClosed(execution, ["config", "planPath", "materializedPath", "selectionState", "runDir"], "execution inputs");
  successorExact(Object.keys(evaluatorOptionsByCase).sort(), scope.source.bindings.map((entry) => entry.successor_case_id).sort(), "evaluator input inventory");
  const inputIdentity = inspectSuccessorScoringInputs(scoringInputs, preparation);
  assertSuccessorScoringExecution(scoringInputs, preparation, execution);
  const [runner, evaluator, scorer, admission] = await Promise.all([
    import("./ask-benchmark-execution.mjs"),
    import("./ask-benchmark-evaluator-boundary.mjs"),
    import("./ask-benchmark-portfolio-score.mjs"),
    import("./ask-benchmark-admission-decision.mjs"),
  ]);
  const stored = await openSuccessorResultSource({ preparation, scope, expectedScopeDigest, ...source, accessMode, root });
  // Unlike the saved-snapshot reader, this checks the actual native execution
  // files, run/adapter identity, requests, command evidence and terminal commits.
  const inspect = () => runner.inspectVerifiedPortfolioExecution({ ...execution, root });
  const first = inspect();
  successorExact(first.identity.run_instance_id, scope.source.run_instance_id, "execution run");
  successorExact(first.plan.plan_id, scope.source.plan_id, "execution plan");
  successorExact(first.identity.plan.digest, scope.source.plan_digest, "execution plan digest");
  successorExact(first.materialization.manifestDigest, scope.source.materialization_manifest_digest, "execution materialization");
  assertSuccessorAdapterFacts(preparation.runtime, first.adapter_identities.get("codex"));
  const allowed = new Set(scope.source.bindings.map((entry) => entry.source_case_id));
  for (const entry of first.cases) {
    if (!allowed.has(entry.entry.case_id) && (entry.state.status !== "pending" || entry.attempts.length !== 0)) successorFail("SUCCESSOR_OUT_OF_SCOPE_EXECUTION", "actual execution inventory");
  }
  const rows = [];
  for (const binding of scope.source.bindings) {
    const saved = readSuccessorVerifiedEngineeringResult(stored, binding.successor_case_id);
    const actual = first.cases.find((entry) => entry.entry.case_id === binding.source_case_id);
    if (!actual || actual.attempts.length !== 1 || actual.state.terminal_attempt !== "0001") successorFail("SUCCESSOR_EXECUTION_ATTEMPT_MISSING", "actual execution case");
    assertSuccessorAttemptProvenance({ ...saved, attempt: actual.attempts[0], runIdentity: first.identity });
    const materialized = first.materialization.casesById.get(binding.source_case_id);
    const task = materialized?.agent_visible_files.find((entry) => entry.path === "BENCHMARK_TASK.md");
    if (!task) successorFail("SUCCESSOR_TASK_SOURCE_MISSING", "verified materialization");
    const inputHandle = await openSuccessorPromptInput({ preparation, scope, expectedScopeDigest, caseId: binding.successor_case_id, root });
    const delivered = consumeSuccessorPromptInput(inputHandle, {
      caseId: binding.successor_case_id,
      taskBytes: readStableBytes(resolve(execution.materializedPath, binding.source_case_id, "BENCHMARK_TASK.md"), "materialized task", 1024 * 1024),
      expectedTaskDigest: `sha256:${task.sha256}`,
    });
    successorExact(actual.attempts[0].request.projection, successorInputProjection(delivered.binding), "runner stdin binding");
    const options = { ...evaluatorOptionsByCase[binding.successor_case_id], root };
    const target = preparation.cases.find(item => item.case_id === binding.successor_case_id);
    const pinnedInputs = successorScoringOptions(scoringInputs, preparation, target.fixture_id);
    for (const [key, value] of Object.entries(pinnedInputs)) {
      if (options[key] !== undefined) successorExact(options[key], value, `pre-result evaluator input.${key}`);
      options[key] = value;
    }
    // These fields are set by this bridge, not by an arbitrary case resolver.
    for (const key of ["planPath", "materializedPath", "selectionState", "runDir"]) {
      if (options[key] !== undefined) successorExact(resolve(options[key]), resolve(execution[key]), `evaluator.${key}`);
      options[key] = execution[key];
    }
    if (options.normalizedResultsPath !== undefined) successorExact(resolve(options.normalizedResultsPath), resolve(source.paths.normalizedResultsPath), "evaluator normalized source root");
    options.normalizedResultsPath = source.paths.normalizedResultsPath;
    if (options.sourceSnapshotDigest !== undefined) successorExact(options.sourceSnapshotDigest, source.sourceSnapshotDigest, "evaluator snapshot");
    options.sourceSnapshotDigest = source.sourceSnapshotDigest;
    const derived = evaluator.verifyEvaluatorAuthority(options);
    successorExact(derived.normalized, saved.normalized, "evaluator normalized authority");
    successorExact(derived.result.evaluation_id, saved.engineering.evaluation_id, "evaluator result identity");
    successorExact(derived.result.evaluation_digest, saved.engineering.evaluation_digest, "evaluator result digest");
    // Mirror #197's admission-resolution boundary; do not fabricate its private
    // verified-authority handle or infer admission from the result's status.
    const inputs = derived.scoringInputs;
    const frozen = {
      frozenAdmissionRecord: inputs.admissionRecord,
      frozenAdmissionSource: inputs.sources.admissionRecord,
      requirementRecord: inputs.requirementRecord,
      requirementRecordSource: inputs.sources.requirementRecord,
      evaluatorReference: inputs.evaluatorReference,
      scoringInputFreezeManifest: inputs.freezeManifest,
      scoringInputFreezeManifestSource: inputs.freezeManifestSource, root,
    };
    const authorityFields = ["admissionDecisionPath", "admissionReviewAuthorityPath", "admissionReviewAuthoritySourceDigest", "admissionReviewArchivePath"];
    const count = authorityFields.filter((key) => Boolean(options[key])).length;
    if (count !== 0 && count !== authorityFields.length) successorFail("SUCCESSOR_ADMISSION_EVIDENCE_PARTIAL", "admission authority");
    const effectiveAdmissionAuthority = count === authorityFields.length
      ? admission.resolveEffectiveAdmissionAuthorityFromFiles({
        ...frozen, decisionPath: options.admissionDecisionPath,
        reviewAuthorityPath: options.admissionReviewAuthorityPath,
        reviewAuthoritySourceDigest: options.admissionReviewAuthoritySourceDigest,
        reviewArchivePath: options.admissionReviewArchivePath,
      })
      : admission.resolveEffectiveAdmissionAuthority({
        frozenAdmissionRecord: inputs.admissionRecord,
        requirementRecord: inputs.requirementRecord,
        evaluatorReference: inputs.evaluatorReference, root,
      });
    // Existing #197 raw scoring remains the only score calculation.
    const rebuilt = scorer.buildPortfolioEngineeringResult({ ...derived, effectiveAdmissionAuthority }, { root });
    successorExact(rebuilt, saved.engineering, "rederived complete engineering result");
    rows.push({ case_id: binding.successor_case_id, engineering: structuredClone(rebuilt), normalized: structuredClone(saved.normalized), execution_evidence: structuredClone(actual.attempts[0].evidence), request_projection: structuredClone(actual.attempts[0].request.projection) });
  }
  for (const fixture of preparation.predecessor.fixtures) successorScoringOptions(scoringInputs, preparation, fixture.fixture_id);
  const last = inspect();
  const closure = (value) => canonicalDigest({
    identity: value.identity,
    cases: value.cases.map(({ entry, state, attempts }) => ({ case_id: entry.case_id, state, attempts: attempts.map(({ evidence }) => evidence) })),
  });
  successorExact(closure(last), closure(first), "execution changed during provenance verification");
  const evidence = {
    schema_version: "1.0.0", kind: "prompt_successor_reverified_provenance",
    access_mode: "synthetic_only", preparation_digest: preparation.preparation_digest,
    scope_digest: scope.scope_digest, source: inspectSuccessorSource(stored),
    scoring_input_manifest_digest: inputIdentity.manifest_digest,
    native_run_instance_id: first.identity.run_instance_id,
    native_plan_id: first.plan.plan_id,
    native_plan_digest: first.identity.plan.digest,
    native_repository_revision: first.identity.repository_revision,
    native_runtime_identity_digest: canonicalDigest(first.adapter_identities.get("codex")),
    native_materialization_manifest_digest: first.materialization.manifestDigest,
    execution_closure_digest: closure(first), execution_source_reverified: true,
    evaluator_authority_reverified: true, raw_score_rederived_by_existing_197: true,
    runner_stdin_binding_reverified: true, provider_prompt_receipt_verified: false, comparison_eligible: false, mutation_authorized: false,
    entries: rows.map(({ case_id, engineering, execution_evidence }) => ({ case_id, engineering_result_digest: engineering.engineering_result_digest, request_digest: execution_evidence.request_digest })),
  };
  // Keep remaining delivery/metric/admission gates explicit. Provenance closure
  // is not a scoped adoption decision or permission to publish measured results.
  const handle = Object.freeze({ provenance_digest: canonicalDigest(evidence) });
  verifiedHandles.set(handle, { evidence, rows });
  return handle;
}

export function inspectSuccessorProvenance(handle) {
  const found = verifiedHandles.get(handle);
  if (!found) successorFail("SUCCESSOR_UNVERIFIED_SOURCE", "provenance handle");
  return structuredClone(found.evidence);
}

/** Detached results are available only from the real re-verification path. */
export function readSuccessorProvenanceRows(handle) {
  const found = verifiedHandles.get(handle);
  if (!found) successorFail("SUCCESSOR_UNVERIFIED_SOURCE", "provenance rows");
  return structuredClone(found.rows);
}

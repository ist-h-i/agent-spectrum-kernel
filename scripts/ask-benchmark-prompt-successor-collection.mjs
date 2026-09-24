import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, readStableBytes } from "./content-addressed-store.mjs";
import { validateSuccessorFromRepository, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";
import { validateSuccessorSourceScope, successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { assertSuccessorAdapterFacts, openSuccessorPromptInput, consumeSuccessorPromptInput, successorInputProjection } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { classifySuccessorProcessOutcome, classifySuccessorRequestBinding, evaluateSuccessorCollection } from "./ask-benchmark-prompt-successor-control.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
function closure(inspection) {
  return canonicalDigest({ identity: inspection.identity, adapters: [...inspection.adapter_identities],
    cases: inspection.cases.map(({ entry, state, attempts }) => ({ case_id: entry.case_id, state, attempts: attempts.map(({ evidence }) => evidence) })) });
}
function overlaps(a, b) {
  const part = relative(a, b);
  return part === "" || (!part.startsWith(`..${sep}`) && part !== ".." && !part.startsWith(sep));
}

/**
 * Reopen native #197 evidence instead of trusting serialized progress/totals.
 * Still a synthetic integration/read-only entrypoint. It does not supply the
 * separately reviewed measured launch authority, a durable ordering journal, or
 * an evaluator/decision grant. Preserve that boundary until those exist.
 */
export async function inspectSuccessorCollectionControl({ preparation, sources, accessMode, measuredAuthority, root = ROOT }) {
  if (!["synthetic_only", "measured"].includes(accessMode)) successorFail("SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED", "collection access mode");
  if (accessMode === "measured" && !measuredAuthority) successorFail("SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED", "measured authority");
  ({ preparation, sources } = structuredClone({ preparation, sources }));
  successorExact(resolve(root), ROOT, "loaded collection root");
  if (accessMode === "measured") {
    const { assertSuccessorMeasuredCollectionAuthority } = await import("./ask-benchmark-prompt-successor-measured-authority.mjs");
    assertSuccessorMeasuredCollectionAuthority(measuredAuthority, { preparation, sources });
  }
  await validateSuccessorFromRepository(preparation, { root });
  successorClosed(sources, ["current_prompt", "prompt_v2"], "collection sources");
  const { inspectVerifiedPortfolioExecution } = await import("./ask-benchmark-execution.mjs");
  const inspections = {}; const records = new Map(); const requestBindings = new Map(); const roots = [];
  for (const role of ["current_prompt", "prompt_v2"]) {
    const source = sources[role];
    successorClosed(source, ["scope", "expectedScopeDigest", "execution"], `${role} collection source`);
    const { scope, expectedScopeDigest, execution } = source;
    successorClosed(execution, ["config", "planPath", "materializedPath", "selectionState", "runDir"], `${role} collection execution`);
    validateSuccessorSourceScope(scope, preparation, expectedScopeDigest);
    successorExact(scope.prompt_role, role, "collection role");
    const runRoot = resolve(execution.runDir);
    if (overlaps(runRoot, root) || overlaps(root, runRoot) || roots.some((other) => overlaps(other, runRoot) || overlaps(runRoot, other))) successorFail("SUCCESSOR_ROOT_COLLISION", "collection run roots");
    roots.push(runRoot);
    const first = inspectVerifiedPortfolioExecution({ ...execution, root });
    inspections[role] = first;
    successorExact(first.identity.run_instance_id, scope.source.run_instance_id, "collection native run");
    successorExact(first.identity.repository_revision, preparation.implementation.revision, "collection source revision");
    successorExact(first.identity.repository_revision, scope.source.repository_revision, "collection scoped source");
    successorExact(first.plan.plan_id, scope.source.plan_id, "collection plan");
    successorExact(first.identity.plan.digest, scope.source.plan_digest, "collection plan digest");
    successorExact(first.materialization.manifestDigest, scope.source.materialization_manifest_digest, "collection materialization");
    const adapter = first.adapter_identities.get("codex");
    assertSuccessorAdapterFacts(preparation.runtime, adapter);
    successorExact(canonicalDigest(adapter), scope.source.runtime_identity_digest, "collection scoped runtime");
    const bindings = new Map(scope.source.bindings.map((binding) => [binding.source_case_id, binding]));
    for (const actual of first.cases) {
      const binding = bindings.get(actual.entry.case_id);
      if (!binding) {
        if (actual.state.status !== "pending" || actual.attempts.length || actual.state.attempt_count) successorFail("SUCCESSOR_OUT_OF_SCOPE_EXECUTION", "collection excluded case");
        continue;
      }
      const target = preparation.cases.find((item) => item.case_id === binding.successor_case_id);
      successorExact([actual.entry.fixture_id, actual.entry.repetition, actual.entry.adapter_track, actual.entry.condition],
        [target.fixture_id, target.repetition, "codex", "full_ask"], "collection native case mapping");
      successorExact(`sha256:${actual.entry.input_manifest_sha256}`, binding.fixture_input_digest, "collection fixture bytes");
      successorExact(adapter.effective_command_digest, binding.effective_command_digest, "collection command");
      successorExact(adapter.environment_snapshot.digest, binding.environment_snapshot_digest, "collection environment");
      const record = { case_id: target.case_id, status: actual.state.status, attempt_count: actual.state.attempt_count,
        request_digest: null, result_digest: null, commit_digest: null, duration_ms: null, process_outcome: null, workspace_evidence: "unavailable", usage: null };
      if (!["pending", "active"].includes(actual.state.status)) {
        if (actual.attempts.length !== 1 || actual.state.terminal_attempt !== "0001") successorFail("SUCCESSOR_EXECUTION_ATTEMPT_MISSING", "collection single terminal attempt");
        const attempt = actual.attempts[0];
        const materialized = first.materialization.casesById.get(binding.source_case_id);
        const task = materialized?.agent_visible_files.find((file) => file.path === "BENCHMARK_TASK.md");
        if (!task) successorFail("SUCCESSOR_TASK_SOURCE_MISSING", "collection verified task");
        const handle = await openSuccessorPromptInput({ preparation, scope, expectedScopeDigest, caseId: target.case_id, root });
        const delivered = consumeSuccessorPromptInput(handle, { caseId: target.case_id,
          taskBytes: readStableBytes(resolve(execution.materializedPath, binding.source_case_id, "BENCHMARK_TASK.md"), "collection task", 1024 * 1024),
          expectedTaskDigest: `sha256:${task.sha256}` });
        const bindingStatus = classifySuccessorRequestBinding({ projection: attempt.request.projection,
          expectedProjection: successorInputProjection(delivered.binding), result: attempt.result });
        requestBindings.set(target.case_id, bindingStatus);
        Object.assign(record, { request_digest: attempt.evidence.request_digest, result_digest: attempt.evidence.result_digest,
          commit_digest: attempt.evidence.commit_digest, duration_ms: attempt.result.duration_ms,
          process_outcome: classifySuccessorProcessOutcome(attempt.result),
          workspace_evidence: attempt.result.terminal_workspace_authority_availability, usage: attempt.result.successor_usage ?? null });
      }
      records.set(target.case_id, record);
    }
  }
  const left = inspections.current_prompt; const right = inspections.prompt_v2;
  successorExact(sources.current_prompt.scope.run_instance_id, sources.prompt_v2.scope.run_instance_id, "collection experiment");
  if (left.identity.run_instance_id === right.identity.run_instance_id) successorFail("SUCCESSOR_NATIVE_RUN_COLLISION", "collection native runs");
  for (const [a, b] of [[left.identity.plan.digest, right.identity.plan.digest], [left.materialization.manifestDigest, right.materialization.manifestDigest],
    [canonicalDigest(left.adapter_identities.get("codex")), canonicalDigest(right.adapter_identities.get("codex"))]]) successorExact(a, b, "paired collection inputs");
  const control = evaluateSuccessorCollection({ preparation, cases: preparation.cases.map(({ case_id }) => records.get(case_id)) });
  for (const role of ["current_prompt", "prompt_v2"]) {
    successorExact(closure(inspectVerifiedPortfolioExecution({ ...sources[role].execution, root })), closure(inspections[role]), "collection changed during read");
  }
  successorExact(readSuccessorImplementationIdentity(root), preparation.implementation, "collection source after read");
  const base = { schema_version: "1.2.0", kind: "prompt_successor_native_collection_inspection", access_mode: accessMode,
    preparation_digest: preparation.preparation_digest, control,
    terminal_request_bindings: preparation.cases.filter(({ case_id }) => requestBindings.has(case_id))
      .map(({ case_id }) => ({ case_id, status: requestBindings.get(case_id) })),
    native_closures: Object.fromEntries(Object.entries(inspections).map(([role, value]) => [role, closure(value)])),
    native_evidence_reverified: true, durable_global_sequence_verified: accessMode === "measured",
    execution_authorized: false, measured_decision_authorized: false, mutation_authorized: false };
  return { ...base, inspection_digest: canonicalDigest(base) };
}

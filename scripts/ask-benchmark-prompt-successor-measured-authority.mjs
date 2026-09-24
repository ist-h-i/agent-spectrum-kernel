import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { validatePromptSuccessorPreparation, validateSuccessorSourceScope, successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { assertSuccessorAdapterFacts } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";
import { inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const handles = new WeakMap();
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

export function openSuccessorMeasuredAuthority({ preparation, sources, root = ROOT }) {
  ({ preparation, sources } = structuredClone({ preparation, sources }));
  successorExact(resolve(root), ROOT, "measured authority root");
  validatePromptSuccessorPreparation(preparation);
  successorExact(readSuccessorImplementationIdentity(root), preparation.implementation, "measured implementation");
  successorExact(preparation.runtime.authentication_mode, ISSUE_291_MEASURED_AUTHORITY.authentication_mode, "issue291 authentication class");
  successorExact(preparation.runtime.timeout_ms, ISSUE_291_MEASURED_AUTHORITY.timeout_ms, "issue291 timeout");
  successorExact(preparation.expected_case_count, ISSUE_291_MEASURED_AUTHORITY.planned_trials, "issue291 trial count");
  successorClosed(sources, ["current_prompt", "prompt_v2"], "measured sources");
  const inspected = {};
  for (const role of ["current_prompt", "prompt_v2"]) {
    const source = sources[role];
    successorClosed(source, ["scope", "expectedScopeDigest", "execution", "runtimeConfigPath", "agentBin"], `measured source ${role}`);
    validateSuccessorSourceScope(source.scope, preparation, source.expectedScopeDigest);
    successorExact(source.scope.prompt_role, role, "measured source role");
    const actual = inspectVerifiedPortfolioExecution({ ...source.execution, root });
    successorExact(actual.identity.run_instance_id, source.scope.source.run_instance_id, "measured native run");
    successorExact(actual.identity.repository_revision, preparation.implementation.revision, "measured repository revision");
    successorExact(actual.plan.plan_id, source.scope.source.plan_id, "measured plan");
    successorExact(actual.identity.plan.digest, source.scope.source.plan_digest, "measured plan digest");
    successorExact(actual.materialization.manifestDigest, source.scope.source.materialization_manifest_digest, "measured materialization");
    assertSuccessorAdapterFacts(preparation.runtime, actual.adapter_identities.get("codex"), { checkHost: true });
    successorExact(canonicalDigest(actual.adapter_identities.get("codex")), source.scope.source.runtime_identity_digest, "measured runtime identity");
    inspected[role] = actual;
  }
  successorExact(sources.current_prompt.scope.run_instance_id, sources.prompt_v2.scope.run_instance_id, "measured experiment run");
  if (inspected.current_prompt.identity.run_instance_id === inspected.prompt_v2.identity.run_instance_id) successorFail("SUCCESSOR_NATIVE_RUN_COLLISION", "measured native runs");
  for (const [field, label] of [
    ["plan_id", "measured paired plan id"],
    ["plan_digest", "measured paired plan digest"],
    ["repository_revision", "measured paired revision"],
    ["runtime_identity_digest", "measured paired runtime"],
    ["materialization_manifest_digest", "measured paired materialization"],
  ]) successorExact(sources.current_prompt.scope.source[field], sources.prompt_v2.scope.source[field], label);
  const evidence = {
    schema_version: "1.0.0",
    kind: "prompt_successor_measured_authority",
    authority_source: "github_issue_291_frozen_contract",
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
    experiment_run_instance_id: sources.current_prompt.scope.run_instance_id,
    source_closures: Object.fromEntries(Object.entries(sources).map(([role, value]) => [role, sourceClosure(value)])),
    exact_host_runtime_verified: true,
    exact_native_sources_verified: true,
    ordered_execution_authorized: true,
    measured_result_access_authorized: true,
    measured_decision_authorized: true,
    automatic_retry_authorized: false,
    portfolio_mutation_authorized: false,
  };
  const handle = Object.freeze({ kind: "prompt_successor_measured_authority_handle" });
  handles.set(handle, { evidence, preparation_digest: preparation.preparation_digest, sources: structuredClone(sources) });
  return handle;
}

function found(handle) {
  const value = handles.get(handle);
  if (!value) successorFail("SUCCESSOR_MEASURED_AUTHORITY_REQUIRED", "opaque measured authority");
  return value;
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

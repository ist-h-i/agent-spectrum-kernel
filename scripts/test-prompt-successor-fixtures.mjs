// Synthetic data only; no repository/private evaluator or credential reads.
import { canonicalDigest } from "./content-addressed-store.mjs";
import { SUCCESSOR_FIXTURES, SUCCESSOR_ROLES, buildPromptSuccessorPreparation, buildSuccessorSourceScope } from "./ask-benchmark-prompt-successor.mjs";
export const syntheticDigest = (value) => canonicalDigest({ synthetic: value });
export const SYNTHETIC_RUN = "00000000-0000-4000-8000-000000000289";
export function syntheticParent() {
  const d = syntheticDigest;
  return { preregistration_id: "synthetic-prereg-289", preregistration_digest: d("prereg"), authority_binding_digest: d("binding"), source_revision: "a".repeat(40), source_tree: "b".repeat(40), thresholds_digest: d("thresholds"), raw_scorer_authority_digest: d("scorer"),
    fixtures: SUCCESSOR_FIXTURES.map(([fixture_id, source_fixture_id, task_class, repetitions]) => ({ fixture_id, source_fixture_id, task_class, repetitions, common_input_digest: d(fixture_id) })),
    role_inputs: SUCCESSOR_ROLES.map((prompt_role) => ({ prompt_role, asset_record_digest: d(`${prompt_role}:record`), asset_content_digest: d(`${prompt_role}:content`), rendered_bundle_digest: d(`${prompt_role}:bundle`), source_authority_digest: d(`${prompt_role}:authority`) })) };
}
export function syntheticRuntime() {
  return { adapter: "codex", cli_version: "0.153.4", executable_digest: syntheticDigest("binary"), node_version: "v24.19.0", os: "darwin", arch: "arm64", model: "synthetic-model-not-a-service", provider_model_revision: { status: "unknown", value: null }, reasoning_effort: "high", authentication_mode: "chatgpt_subscription", configuration_digest: syntheticDigest("config"), sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled", provider_network: "provider_only", timeout_ms: 900000 };
}
export function syntheticPreparation(overrides = {}) {
  return buildPromptSuccessorPreparation({ parent: syntheticParent(), runtime: syntheticRuntime(), implementation: { revision: "c".repeat(40), tree: "d".repeat(40) }, seed: "synthetic-seed-289", changeReason: "Synthetic preparation contract test; no model calls.", ...overrides });
}
export function syntheticScope(preparation, promptRole = "current_prompt") {
  const d = syntheticDigest;
  const source = {
    plan_id: `plan-${d(`plan-id:${promptRole}`).slice(7)}`, plan_digest: d(`plan-content:${promptRole}`),
    run_instance_id: promptRole === "current_prompt" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002",
    repository_revision: preparation.implementation.revision, runtime_identity_digest: d("native-runtime"), materialization_manifest_digest: d(`materialization:${promptRole}`),
    bindings: preparation.cases.filter((c) => c.prompt_role === promptRole).map((c) => ({ successor_case_id: c.case_id, source_case_id: `case-${d(`source:${c.case_id}`).slice(7, 23)}-${d(`case:${c.case_id}`).slice(7, 23)}`, fixture_input_digest: d(c.source_fixture_id), effective_command_digest: d(`command:${c.case_id}`), environment_snapshot_digest: d(`environment:${c.case_id}`) })),
  };
  return buildSuccessorSourceScope({ preparation, promptRole, runInstanceId: SYNTHETIC_RUN, source });
}
export function syntheticBindingRows(preparation, scope, index = 0) {
  const binding = scope.source.bindings[index];
  const c = preparation.cases.find(({ case_id }) => case_id === binding.successor_case_id);
  const lineage = { case_id: binding.source_case_id, run_instance_id: scope.source.run_instance_id, plan_id: scope.source.plan_id, plan_digest: scope.source.plan_digest, repository_revision: scope.source.repository_revision, materialization_manifest_digest: scope.source.materialization_manifest_digest, runtime_identity_digest: scope.source.runtime_identity_digest, fixture_id: c.fixture_id, fixture_input_digest: binding.fixture_input_digest, adapter_track: "codex", condition: "full_ask", repetition: c.repetition, registered_repetitions: preparation.predecessor.fixtures.find(({ fixture_id }) => fixture_id === c.fixture_id).repetitions, task_class: c.task_class, attempt: "0001", request_digest: syntheticDigest(`observed-request:${binding.source_case_id}`), effective_command_digest: binding.effective_command_digest, environment_snapshot_digest: binding.environment_snapshot_digest };
  const normalized = { lineage, normalized_result_id: `normalized-${syntheticDigest(binding.source_case_id).slice(-32)}`, normalized_result_digest: syntheticDigest(`normalized:${binding.source_case_id}`), outcome: "completed" };
  const engineering = { ...lineage, adapter: "codex", normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest, normalized_outcome: normalized.outcome };
  return { preparation, scope, binding, normalized, engineering };
}

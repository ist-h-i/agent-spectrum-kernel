import { canonicalDigest, stableCanonicalJson } from "./content-addressed-store.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";

// Preparation and inventory operations only. This module cannot spawn a runtime.
export const SUCCESSOR_VERSION = "1.1.0";
export const SUCCESSOR_ROLES = Object.freeze(["current_prompt", "prompt_v2"]);
export const SUCCESSOR_FIXTURES = CALIBRATION_SOURCE_BINDINGS;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const GIT = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/u;
const TERMINAL = new Set(["completed", "failed", "interrupted", "invalid", "unavailable"]);
const clone = (value) => structuredClone(value);

export function successorFail(code, path) {
  const error = new Error(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  throw error;
}
export function successorExact(value, expected, path) {
  if (stableCanonicalJson(value) !== stableCanonicalJson(expected)) successorFail("SUCCESSOR_IDENTITY_MISMATCH", path);
}
export function successorClosed(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) successorFail("SUCCESSOR_SHAPE_INVALID", path);
  successorExact(Object.keys(value).sort(), [...keys].sort(), `${path}.keys`);
}
function text(value, path) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2000 || /[\u0000-\u0008\u000b-\u001f]/u.test(value)) successorFail("SUCCESSOR_TEXT_INVALID", path);
}
function token(value, path) {
  if (typeof value !== "string" || !TOKEN.test(value)) successorFail("SUCCESSOR_TOKEN_INVALID", path);
}
export function successorDigest(value, path) {
  if (typeof value !== "string" || !DIGEST.test(value)) successorFail("SUCCESSOR_DIGEST_INVALID", path);
}
function git(value, path) {
  if (typeof value !== "string" || !GIT.test(value)) successorFail("SUCCESSOR_GIT_INVALID", path);
}
function uuid(value, path) {
  if (typeof value !== "string" || !UUID.test(value)) successorFail("SUCCESSOR_RUN_INVALID", path);
}
function array(value, path, count) {
  if (!Array.isArray(value) || value.length !== count) successorFail("SUCCESSOR_INVENTORY_INVALID", path);
}
function tagged(base, field, prefix) {
  const digest = canonicalDigest(base);
  return { ...base, [`${field}_id`]: `${prefix}-${digest.slice(-32)}`, [`${field}_digest`]: digest };
}

export function validateSuccessorRuntime(value) {
  successorClosed(value, ["adapter", "cli_version", "executable_digest", "node_version", "os", "arch", "model", "provider_model_revision", "reasoning_effort", "authentication_mode", "configuration_digest", "sandbox", "approval_policy", "agent_network", "provider_network", "timeout_ms"], "runtime");
  successorExact(value.adapter, "codex", "runtime.adapter");
  if (typeof value.cli_version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(value.cli_version)) successorFail("SUCCESSOR_VERSION_INVALID", "runtime.cli_version");
  if (typeof value.node_version !== "string" || !/^v?24\.\d+\.\d+$/u.test(value.node_version)) successorFail("SUCCESSOR_NODE24_REQUIRED", "runtime.node_version");
  for (const key of ["executable_digest", "configuration_digest"]) successorDigest(value[key], `runtime.${key}`);
  for (const key of ["model", "os", "arch"]) token(value[key], `runtime.${key}`);
  if (/(?:^|[-_:/])latest(?:$|[-_:/])/iu.test(value.model)) successorFail("SUCCESSOR_MUTABLE_MODEL_REJECTED", "runtime.model");
  successorClosed(value.provider_model_revision, ["status", "value"], "runtime.provider_model_revision");
  if (value.provider_model_revision.status === "known") token(value.provider_model_revision.value, "runtime.provider_model_revision.value");
  else successorExact(value.provider_model_revision, { status: "unknown", value: null }, "runtime.provider_model_revision");
  successorExact(value.reasoning_effort, "medium", "runtime.reasoning_effort");
  if (!["api_key", "chatgpt_subscription"].includes(value.authentication_mode)) successorFail("SUCCESSOR_AUTH_CLASS_REQUIRED", "runtime.authentication_mode");
  for (const [key, expected] of Object.entries({ sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled", provider_network: "provider_only", timeout_ms: 900000 })) successorExact(value[key], expected, `runtime.${key}`);
  return value;
}

// The repository loader obtains these fields through the unchanged #234 validators.
// Shape/hash validation is not a replacement for that root-of-trust check.
export function validateSuccessorParent(value) {
  successorClosed(value, ["preregistration_id", "preregistration_digest", "authority_binding_digest", "source_revision", "source_tree", "thresholds_digest", "raw_scorer_authority_digest", "fixtures", "role_inputs"], "parent");
  token(value.preregistration_id, "parent.preregistration_id");
  for (const key of ["preregistration_digest", "authority_binding_digest", "thresholds_digest", "raw_scorer_authority_digest"]) successorDigest(value[key], `parent.${key}`);
  git(value.source_revision, "parent.source_revision");
  git(value.source_tree, "parent.source_tree");
  array(value.fixtures, "parent.fixtures", 4);
  value.fixtures.forEach((fixture, index) => {
    successorClosed(fixture, ["fixture_id", "source_fixture_id", "task_class", "repetitions", "common_input_digest"], `parent.fixtures[${index}]`);
    successorExact([fixture.fixture_id, fixture.source_fixture_id, fixture.task_class, fixture.repetitions], SUCCESSOR_FIXTURES[index], `parent.fixtures[${index}]`);
    successorDigest(fixture.common_input_digest, `parent.fixtures[${index}].common_input_digest`);
  });
  array(value.role_inputs, "parent.role_inputs", 2);
  value.role_inputs.forEach((entry, index) => {
    successorClosed(entry, ["prompt_role", "asset_record_digest", "asset_content_digest", "rendered_bundle_digest", "source_authority_digest"], `parent.role_inputs[${index}]`);
    successorExact(entry.prompt_role, SUCCESSOR_ROLES[index], `parent.role_inputs[${index}].prompt_role`);
    for (const key of ["asset_record_digest", "asset_content_digest", "rendered_bundle_digest", "source_authority_digest"]) successorDigest(entry[key], `parent.role_inputs[${index}].${key}`);
  });
  for (const key of ["asset_record_digest", "asset_content_digest", "rendered_bundle_digest"]) {
    if (value.role_inputs[0][key] === value.role_inputs[1][key]) successorFail("SUCCESSOR_PROMPTS_NOT_DISTINCT", key);
  }
  return value;
}

export function buildPromptSuccessorPreparation({ parent, runtime, implementation, seed, changeReason, scoringInputManifestDigest = null }) {
  if (scoringInputManifestDigest !== null) successorDigest(scoringInputManifestDigest, "scoring input manifest");
  successorClosed(implementation, ["revision", "tree"], "implementation");
  git(implementation.revision, "implementation.revision");
  git(implementation.tree, "implementation.tree");
  validateSuccessorParent(parent);
  validateSuccessorRuntime(runtime);
  token(seed, "seed");
  text(changeReason, "changeReason");
  const identity = {
    schema_version: SUCCESSOR_VERSION,
    kind: "prompt_runtime_successor_preparation",
    predecessor: clone(parent),
    implementation: clone(implementation),
    runtime: clone(runtime),
    scoring_input_manifest_digest: scoringInputManifestDigest,
    execution_fixture_namespace: "catalog",
    seed,
    change_reason: changeReason,
    decision_scope: { adapter: "codex", model: runtime.model, task_classes: ["review", "implementation"], excluded_adapters: ["claude"], repository_wide: false },
    readiness: "preparation_only",
    permissions: { model_call: false, measured_execution: false, measured_result_access: false, portfolio_mutation: false },
  };
  const experiment_digest = canonicalDigest(identity);
  const runtime_digest = canonicalDigest(runtime);
  const blocks = [];
  for (const fixture of parent.fixtures) {
    const rotation = Number.parseInt(canonicalDigest({ seed, fixture: fixture.fixture_id }).slice(-2), 16) % 2;
    for (let repetition = 1; repetition <= fixture.repetitions; repetition += 1) {
      const block_digest = canonicalDigest({ experiment_digest, fixture_id: fixture.fixture_id, repetition });
      const roles = (rotation + repetition - 1) % 2 === 0 ? [...SUCCESSOR_ROLES] : [...SUCCESSOR_ROLES].reverse();
      const cases = roles.map((prompt_role, roleIndex) => {
        const sourcePrompt = parent.role_inputs.find((entry) => entry.prompt_role === prompt_role);
        const base = {
          experiment_digest, block_id: `successor-block-${block_digest.slice(-32)}`,
          fixture_id: fixture.fixture_id, source_fixture_id: fixture.source_fixture_id,
          task_class: fixture.task_class, repetition, prompt_role, role_order_position: roleIndex + 1,
          adapter_track: "codex", raw_scoring_condition: "full_ask", runtime_digest,
          common_input_digest: fixture.common_input_digest, source_prompt: clone(sourcePrompt),
        };
        return tagged(base, "case", "successor-case");
      });
      blocks.push({ order: canonicalDigest({ seed, block_digest }), cases });
    }
  }
  blocks.sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : 0);
  return tagged({ ...identity, experiment_digest, runtime_digest, expected_case_count: 28, cases: blocks.flatMap(({ cases }) => cases).map((entry, index) => ({ position: index + 1, ...entry })) }, "preparation", "prompt-successor");
}

export function validatePromptSuccessorPreparation(value, { expectedParent } = {}) {
  successorClosed(value, ["schema_version", "kind", "predecessor", "implementation", "runtime", "scoring_input_manifest_digest", "execution_fixture_namespace", "seed", "change_reason", "decision_scope", "readiness", "permissions", "experiment_digest", "runtime_digest", "expected_case_count", "cases", "preparation_id", "preparation_digest"], "preparation");
  if (expectedParent !== undefined) successorExact(value.predecessor, expectedParent, "preparation.predecessor");
  const expected = buildPromptSuccessorPreparation({ parent: value.predecessor, runtime: value.runtime, implementation: value.implementation, seed: value.seed, changeReason: value.change_reason, scoringInputManifestDigest: value.scoring_input_manifest_digest });
  successorExact(value, expected, "preparation");
  return value;
}

// Request bytes contain the runner claim/workspace identity and are observed
// after the pre-result scope is sealed. Bind them from actual execution evidence.
const BINDING_FIELDS = ["successor_case_id", "source_case_id", "fixture_input_digest", "effective_command_digest", "environment_snapshot_digest"];
// A source scope is a pre-result mapping into an existing #197 run, not a new score.
export function buildSuccessorSourceScope({ preparation, promptRole, runInstanceId, source }) {
  validatePromptSuccessorPreparation(preparation);
  if (!SUCCESSOR_ROLES.includes(promptRole)) successorFail("SUCCESSOR_ROLE_INVALID", "promptRole");
  uuid(runInstanceId, "runInstanceId");
  successorClosed(source, ["plan_id", "plan_digest", "run_instance_id", "repository_revision", "runtime_identity_digest", "materialization_manifest_digest", "bindings"], "source");
  token(source.plan_id, "source.plan_id");
  if (!/^plan-[a-f0-9]{64}$/u.test(source.plan_id)) successorFail("SUCCESSOR_PLAN_ID_INVALID", "source.plan_id");
  for (const key of ["plan_digest", "runtime_identity_digest", "materialization_manifest_digest"]) successorDigest(source[key], `source.${key}`);
  uuid(source.run_instance_id, "source.run_instance_id");
  git(source.repository_revision, "source.repository_revision");
  const cases = preparation.cases.filter((entry) => entry.prompt_role === promptRole);
  array(source.bindings, "source.bindings", cases.length);
  source.bindings.forEach((entry, index) => {
    successorClosed(entry, BINDING_FIELDS, `source.bindings[${index}]`);
    successorExact(entry.successor_case_id, cases[index].case_id, `source.bindings[${index}].successor_case_id`);
    if (typeof entry.source_case_id !== "string" || !/^case-[a-f0-9]{16}-[a-f0-9]{16}$/u.test(entry.source_case_id)) successorFail("SUCCESSOR_SOURCE_CASE_INVALID", "source_case_id");
    for (const key of BINDING_FIELDS.slice(2)) successorDigest(entry[key], `source.bindings[${index}].${key}`);
  });
  if (new Set(source.bindings.map(({ source_case_id }) => source_case_id)).size !== 14) successorFail("SUCCESSOR_DUPLICATE_SOURCE_CASE", "source.bindings");
  return tagged({ schema_version: SUCCESSOR_VERSION, kind: "prompt_successor_source_scope", phase: "pre_result", results_accessed: false, preparation_digest: preparation.preparation_digest, run_instance_id: runInstanceId, prompt_role: promptRole, source: clone(source) }, "scope", "successor-scope");
}

export function validateSuccessorSourceScope(value, preparation, expectedDigest) {
  successorClosed(value, ["schema_version", "kind", "phase", "results_accessed", "preparation_digest", "run_instance_id", "prompt_role", "source", "scope_id", "scope_digest"], "scope");
  successorDigest(expectedDigest, "trusted scope digest");
  successorExact(value.scope_digest, expectedDigest, "scope authority");
  successorExact(value, buildSuccessorSourceScope({ preparation, promptRole: value.prompt_role, runInstanceId: value.run_instance_id, source: value.source }), "scope");
  return value;
}

export function createSuccessorResumeState(preparation, runInstanceId) {
  validatePromptSuccessorPreparation(preparation);
  uuid(runInstanceId, "runInstanceId");
  return sealResume({ schema_version: SUCCESSOR_VERSION, kind: "prompt_successor_resume", preparation_digest: preparation.preparation_digest, run_instance_id: runInstanceId, cases: preparation.cases.map(({ case_id }) => ({ case_id, status: "pending", result_digest: null })) });
}
function sealResume(base) {
  const { state_digest: _old, ...withoutDigest } = base;
  return { ...withoutDigest, state_digest: canonicalDigest(withoutDigest) };
}
export function validateSuccessorResumeState(state, preparation) {
  validatePromptSuccessorPreparation(preparation);
  successorClosed(state, ["schema_version", "kind", "preparation_digest", "run_instance_id", "cases", "state_digest"], "resume");
  successorExact(state.schema_version, SUCCESSOR_VERSION, "resume.schema_version");
  successorExact(state.kind, "prompt_successor_resume", "resume.kind");
  successorExact(state.preparation_digest, preparation.preparation_digest, "resume.preparation_digest");
  uuid(state.run_instance_id, "resume.run_instance_id");
  array(state.cases, "resume.cases", 28);
  let foundPending = false;
  let activeCount = 0;
  state.cases.forEach((entry, index) => {
    successorClosed(entry, ["case_id", "status", "result_digest"], `resume.cases[${index}]`);
    successorExact(entry.case_id, preparation.cases[index].case_id, `resume.cases[${index}].case_id`);
    if (entry.status === "pending") { foundPending = true; successorExact(entry.result_digest, null, "pending result"); }
    else if (entry.status === "running") {
      if (foundPending) successorFail("SUCCESSOR_OUT_OF_ORDER", "running case");
      activeCount += 1;
      foundPending = true;
      successorExact(entry.result_digest, null, "running result");
    } else if (TERMINAL.has(entry.status)) {
      if (foundPending) successorFail("SUCCESSOR_OUT_OF_ORDER", "terminal case");
      successorDigest(entry.result_digest, "terminal result");
    } else successorFail("SUCCESSOR_STATE_INVALID", "case.status");
  });
  if (activeCount > 1) successorFail("SUCCESSOR_CONCURRENT_CASE", "resume");
  successorExact(state, sealResume(state), "resume.digest");
  return state;
}
export function startSuccessorCase(state, preparation, caseId) {
  validateSuccessorResumeState(state, preparation);
  if (state.cases.some(({ status }) => status === "running")) successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "running case requires reconciliation");
  const index = state.cases.findIndex(({ status }) => status === "pending");
  if (index < 0 || state.cases[index].case_id !== caseId) successorFail("SUCCESSOR_OUT_OF_ORDER", "caseId");
  const next = clone(state);
  next.cases[index].status = "running";
  return sealResume(next);
}
export function finishSuccessorCase(state, preparation, result) {
  validateSuccessorResumeState(state, preparation);
  successorClosed(result, ["preparation_digest", "run_instance_id", "case_id", "status", "result_digest"], "terminal result");
  successorExact(result.preparation_digest, preparation.preparation_digest, "terminal preparation");
  successorExact(result.run_instance_id, state.run_instance_id, "terminal run");
  successorDigest(result.result_digest, "terminal digest");
  if (!TERMINAL.has(result.status)) successorFail("SUCCESSOR_STATE_INVALID", "terminal status");
  const index = state.cases.findIndex(({ case_id }) => case_id === result.case_id);
  if (index < 0 || state.cases[index].status !== "running") successorFail("SUCCESSOR_DUPLICATE_OR_UNSTARTED_RESULT", "terminal case");
  const next = clone(state);
  next.cases[index] = { case_id: result.case_id, status: result.status, result_digest: result.result_digest };
  return sealResume(next);
}

// A planned invocation is a reviewable proposal, never an effective-host attestation.
export function proposeSuccessorInvocation(preparation, caseId, workspace, privateEvaluatorRoot) {
  validatePromptSuccessorPreparation(preparation);
  if (typeof workspace !== "string" || !workspace.startsWith("/") || workspace.includes("\0") || workspace.split("/").includes("..")) successorFail("SUCCESSOR_WORKSPACE_INVALID", "workspace");
  if (typeof privateEvaluatorRoot !== "string" || !privateEvaluatorRoot.startsWith("/") || privateEvaluatorRoot === "/"
    || privateEvaluatorRoot.includes("\0") || privateEvaluatorRoot.split("/").includes("..")) successorFail("SUCCESSOR_PRIVATE_ROOT_INVALID", "private evaluator root");
  const entry = preparation.cases.find(({ case_id }) => case_id === caseId);
  if (!entry) successorFail("SUCCESSOR_CASE_MISSING", "caseId");
  return {
    preparation_digest: preparation.preparation_digest, case_id: entry.case_id,
    executable_digest: preparation.runtime.executable_digest,
    argv: ["exec", "--json", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-c", 'approval_policy="never"',
      "-c", 'default_permissions="ask_issue291"', "-c", 'permissions.ask_issue291.extends=":workspace"',
      "-c", `permissions.ask_issue291.filesystem={ ${JSON.stringify(privateEvaluatorRoot)} = "deny" }`,
      "-c", "permissions.ask_issue291.network.enabled=false", "-c", 'model_reasoning_effort="medium"',
      "--model", preparation.runtime.model, "--cd", workspace, "-"],
    stdin_contract: "exact_source_prompt_plus_agent_visible_task",
    timeout_ms: preparation.runtime.timeout_ms,
    effective_isolation_verified: false, model_call_authorized: false,
  };
}
export function assertSuccessorLaunchAllowed() {
  // The preparation surface intentionally has no permit/override bypass.
  successorFail("SUCCESSOR_PREPARATION_ONLY", "host tests, reviewed binding and separate execution authority required");
}

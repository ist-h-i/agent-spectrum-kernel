#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  canonicalDigest as canonicalDigestBase,
  stableCanonicalJson,
} from "./ask-benchmark-materialize.mjs";

export const PROMPT_V2_HARNESS_VERSION = "1.0.0";
export const PROMPT_V2_PREREGISTRATION_PATH = "benchmarks/prompt-v2-preregistration.json";
export const PROMPT_V2_PREREGISTRATION_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-preregistration.schema.json";
export const PROMPT_V2_EXECUTION_PLAN_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-execution-plan.schema.json";
export const PROMPT_V2_MATERIALIZATION_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-materialization-manifest.schema.json";
export const PROMPT_V2_NORMALIZED_RESULT_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-normalized-result.schema.json";
export const PROMPT_V2_RESUME_STATE_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-resume-state.schema.json";
export const PROMPT_V2_COMPARISON_REPORT_SCHEMA_PATH = "benchmarks/schemas/prompt-v2-comparison-report.schema.json";

export { stableCanonicalJson };
export const canonicalDigest = canonicalDigestBase;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTERS = Object.freeze(["codex", "claude"]);
const PROMPT_ROLES = Object.freeze(["current_prompt", "prompt_v2"]);
const METRIC_FIELDS = Object.freeze([
  "normalized_requirement_score",
  "input_tokens",
  "output_tokens",
  "cached_tokens",
  "duration_ms",
]);
const GUARDRAIL_FIELDS = Object.freeze([
  "safety_blocker_count",
  "unauthorized_or_external_attempt_count",
  "false_positive_raw_count",
  "scope_deviation_raw_count",
  "decision_failure_count",
  "verification_failure_count",
  "evidence_failure_count",
  "approval_failure_count",
  "completion_claim_failure_count",
  "under_processing_count",
  "required_mechanism_missing_count",
]);
const ROUTE_GATE_FIELDS = Object.freeze([
  "decision_correctness",
  "verification_correctness",
  "evidence_correctness",
  "required_mechanism_observation",
]);
const TERMINAL_STATUSES = new Set(["scoring_ready", "not_scoring_ready", "unavailable"]);
const TYPED_STATUSES = new Set(["known", "unknown", "unavailable", "not_applicable"]);
const GATE_STATUSES = new Set(["pass", "fail", "unknown", "unavailable", "not_applicable"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const GIT_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const FORBIDDEN_DURABLE_KEYS = new Set([
  "raw_prompt",
  "raw_output",
  "raw_evaluator_prompt",
  "raw_evaluator_output",
  "private_evaluator_path",
  "private_evaluator_content",
  "stdout",
  "stderr",
  "verified_results",
  "measured_output",
]);

function fail(message) {
  throw new Error(`Prompt v2 ${message}`);
}

function exact(value, expected, message) {
  if (stableCanonicalJson(value) !== stableCanonicalJson(expected)) fail(message);
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  exact(Object.keys(value).sort(), [...expected].sort(), `${label} has an unexpected field inventory`);
}

function assertDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a sha256 digest`);
  return value;
}

function assertGit(value, label) {
  if (!GIT_PATTERN.test(value ?? "")) fail(`${label} must be a 40-character git identity`);
  return value;
}

function assertPortablePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\") || value.startsWith("./") || value.split("/").includes("..") || posix.normalize(value) !== value) {
    fail(`${label} must be a portable repository-relative path`);
  }
  if (value === "private" || value.startsWith("private/") || value === "benchmarks/results" || value.startsWith("benchmarks/results/")) {
    fail(`${label} targets a private or measured-result path`);
  }
  return value;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertFileBinding(root, binding, label) {
  assertPortablePath(binding.path, `${label} path`);
  assertDigest(binding.raw_byte_digest, `${label} digest`);
  const path = resolve(root, binding.path);
  if (!existsSync(path)) fail(`${label} file is missing: ${binding.path}`);
  if (sha256Bytes(readFileSync(path)) !== binding.raw_byte_digest) fail(`${label} raw byte digest mismatch: ${binding.path}`);
}

function assertNoForbiddenDurableFields(value, label, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenDurableFields(entry, label, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (value === "private" || value.startsWith("private/") || value === "benchmarks/results" || value.startsWith("benchmarks/results/"))) {
      fail(`${label} contains a private or measured-result path at ${trail.join(".")}`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_DURABLE_KEYS.has(key.toLowerCase())) fail(`${label} contains forbidden raw/private field: ${[...trail, key].join(".")}`);
    assertNoForbiddenDurableFields(entry, label, [...trail, key]);
  }
}

function schemaPath(root, relativePath) {
  return resolve(root, relativePath);
}

function without(value, fields) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
}

export function computePromptV2PreregistrationDigest(value) {
  return canonicalDigest(without(value, ["preregistration_id", "preregistration_digest"]));
}

export function computePromptV2AuthorityBindingDigest(value) {
  return canonicalDigest(without(value, ["binding_digest"]));
}

function computePlanDigest(value) {
  return canonicalDigest(without(value, ["plan_id", "plan_digest"]));
}

function computeMaterializationDigest(value) {
  return canonicalDigest(without(value, ["materialization_id", "materialization_digest"]));
}

function computeNormalizedResultDigest(value) {
  return canonicalDigest(without(value, ["normalized_result_id", "normalized_result_digest"]));
}

function computeResumeStateDigest(value) {
  return canonicalDigest(without(value, ["state_digest"]));
}

function computeReportDigest(value) {
  return canonicalDigest(without(value, ["report_id", "report_digest"]));
}

function fixtureIdentitiesFromManifest(record) {
  if (!record || !Array.isArray(record.files)) fail("fixture input-manifest record is missing files");
  const files = structuredClone(record.files).sort((left, right) => left.path.localeCompare(right.path));
  const task = files.find(({ path }) => path === "task.md");
  const workspace = files.filter(({ path }) => path.startsWith("workspace/"));
  if (!task || workspace.length === 0) fail("fixture input-manifest must contain task.md and workspace files");
  for (const file of files) {
    assertPortablePath(file.path, "fixture file path");
    if (!/^[a-f0-9]{64}$/u.test(file.sha256 ?? "") || !Number.isInteger(file.bytes) || file.bytes < 0) fail("fixture input-manifest contains an invalid file identity");
  }
  const input_manifest_fixture_digest = canonicalDigest(record);
  const task_digest = `sha256:${task.sha256}`;
  const workspace_digest = canonicalDigest(workspace);
  const evaluator_visible_input_digest = canonicalDigest(files);
  const frozen_input_digest = canonicalDigest({ input_manifest_fixture_digest, task_digest, workspace_digest, evaluator_visible_input_digest });
  return { input_manifest_fixture_digest, task_digest, workspace_digest, evaluator_visible_input_digest, frozen_input_digest };
}

const FROZEN_THRESHOLDS = Object.freeze({
  quality: {
    minimum_fixture_median_delta: 0,
    minimum_nonnegative_fraction_numerator: 2,
    minimum_nonnegative_fraction_denominator: 3,
  },
  guardrails: { maximum_increase: 0, fields: [...GUARDRAIL_FIELDS] },
  route_gates: { unknown_or_unavailable_passes: false, fields: [...ROUTE_GATE_FIELDS] },
  tokens: {
    total_formula: "input_tokens + output_tokens",
    cached_tokens_added_again: false,
    minimum_median_reduction_ratio: 0.3,
    minimum_pair_fraction_numerator: 2,
    minimum_pair_fraction_denominator: 3,
    variability_rule: "median_proportional_reduction_gte_larger_normalized_within_role_mad",
  },
  duration: {
    maximum_unconditional_increase_ratio: 0.2,
    maximum_conditional_increase_ratio: 0.5,
    minimum_conditional_quality_gain: 0.05,
    conditional_variability_rule: "quality_gain_gt_larger_within_role_normalized_quality_mad",
  },
  stability: {
    required_statistics: [
      "fixture_quality_medians",
      "fixture_quality_sign_counts",
      "adapter_token_median",
      "within_role_token_mads",
      "adapter_duration_median",
      "adapter_quality_median",
      "within_role_quality_mads",
    ],
    incomplete_statistics_pass: false,
  },
});

export function validatePromptV2Preregistration(value, { root = ROOT, verifyRepositoryBindings = true } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_PREREGISTRATION_SCHEMA_PATH), label: "Prompt v2 preregistration" });
  exact(value.prompt_roles, PROMPT_ROLES, "preregistration prompt-role order drifted");
  exact(value.prompt_tracks.map(({ adapter_track }) => adapter_track), ADAPTERS, "preregistration adapter-track order drifted");
  exact(value.thresholds, FROZEN_THRESHOLDS, "preregistration threshold contract drifted");
  if (value.fixtures.reduce((count, fixture) => count + fixture.repetitions, 0) * ADAPTERS.length * PROMPT_ROLES.length !== 56) fail("preregistration fixture repetitions do not produce 56 cases");
  exact(value.fixtures.map(({ repetitions }) => repetitions), [3, 3, 3, 5], "preregistration fixture repetition order drifted");
  if (new Set(value.fixtures.flatMap(({ source_fixture_id, catalog_fixture_id }) => [source_fixture_id, catalog_fixture_id])).size !== 8) fail("preregistration fixture dual IDs must be unique");
  if (value.raw_scoring.authority_digest !== canonicalDigest(value.raw_scoring.authority_files)) fail("preregistration raw-scoring authority digest mismatch");
  if (value.preregistration_digest !== computePromptV2PreregistrationDigest(value)) fail("preregistration digest mismatch");
  if (value.preregistration_id !== `prompt-v2-prereg-${value.preregistration_digest.slice(-32)}`) fail("preregistration identity mismatch");
  if (value.runtime.adapters[0]?.adapter_track !== "codex" || value.runtime.adapters[0]?.availability !== "available") fail("preregistration Codex runtime freeze drifted");
  if (value.runtime.adapters[1]?.adapter_track !== "claude" || value.runtime.adapters[1]?.availability !== "unavailable" || value.runtime.adapters[1]?.unavailable_treated_as_zero !== false) fail("preregistration Claude typed-unavailable freeze drifted");
  if (value.boundaries.measured_execution_authorized !== false || value.boundaries.runtime_activation_implied !== false || value.results_accessed !== false) fail("preregistration result-blind boundary drifted");
  if (value.privacy.durable_raw_prompt_allowed !== false || value.privacy.durable_raw_output_allowed !== false || value.privacy.durable_private_evaluator_allowed !== false || value.privacy.raw_score_recomputation_allowed !== false) fail("preregistration privacy boundary drifted");
  if (value.generated_authority_binding_contract.source_revision_is_external !== true || value.generated_authority_binding_contract.post_result_objects_allowed !== false) fail("preregistration generated-authority boundary drifted");
  assertExactKeys(value.privacy, ["durable_raw_prompt_allowed", "durable_raw_output_allowed", "durable_private_evaluator_allowed", "private_evaluator_semantic_read_allowed", "raw_score_recomputation_allowed", "durable_artifacts_allowlist"], "preregistration privacy contract");
  assertExactKeys(value.boundaries, ["measured_execution_authorized", "recommendation_created", "decision_created", "runtime_activation_implied", "lifecycle_mutation_authorized"], "preregistration boundaries");
  assertExactKeys(value.runtime.adapters[0], ["adapter_track", "availability", "runtime", "runtime_version", "model", "reasoning_effort", "sandbox", "approval_policy", "network", "timeout_ms"], "preregistration Codex runtime");
  assertExactKeys(value.runtime.adapters[1], ["adapter_track", "availability", "runtime", "unavailable_reason", "spawn_allowed", "substitution_allowed", "pooling_allowed", "unavailable_treated_as_zero"], "preregistration Claude runtime");
  exact(value.generated_authority_binding_contract.required_exact_identities, ["source_revision_and_tree", "rendered_source_inventory", "asset_record_and_content", "portfolio_manifest_and_lock", "pre_result_selection", "renderer_projection", "candidate_and_experiment"], "preregistration generated-authority identity inventory drifted");
  exact(value.stop_conditions, ["private_evaluator_content_required", "measured_prompt_comparison_result_access_required", "threshold_or_decision_rule_drift_required", "second_raw_scorer_required", "fifth_product_condition_required"], "preregistration stop-condition inventory drifted");
  assertNoForbiddenDurableFields(value, "preregistration");

  if (verifyRepositoryBindings) {
    assertFileBinding(root, value.protocol, "Prompt v2 protocol");
    for (const binding of value.raw_scoring.authority_files) assertFileBinding(root, binding, `raw-scoring ${binding.role}`);
    assertFileBinding(root, { path: value.canonical_prompt_v2.binding_path, raw_byte_digest: value.canonical_prompt_v2.binding_raw_byte_digest }, "canonical Prompt v2 binding");
    assertFileBinding(root, { path: value.canonical_prompt_v2.reference_path, raw_byte_digest: value.canonical_prompt_v2.reference_raw_byte_digest }, "canonical Prompt v2 reference");
    for (const binding of value.canonical_prompt_v2.source_maps) assertFileBinding(root, binding, "canonical Prompt v2 source map");
    for (const track of value.prompt_tracks) {
      for (const binding of track.current_source_files) assertFileBinding(root, binding, `${track.adapter_track} current Prompt source`);
      assertFileBinding(root, { path: track.renderer.implementation_path, raw_byte_digest: track.renderer.implementation_raw_byte_digest }, `${track.adapter_track} renderer`);
    }
    assertFileBinding(root, value.fixture_input_manifest, "fixture input manifest");
    const inputManifest = readJson(resolve(root, value.fixture_input_manifest.path));
    const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"));
    for (const fixture of value.fixtures) {
      const derived = fixtureIdentitiesFromManifest(inputManifest.fixtures?.[fixture.source_fixture_id]);
      for (const [key, expected] of Object.entries(derived)) if (fixture[key] !== expected) fail(`${fixture.catalog_fixture_id} ${key} mismatch`);
      const catalogFixture = catalog.fixtures?.find(({ fixture_id }) => fixture_id === fixture.catalog_fixture_id);
      if (!catalogFixture || catalogFixture.fixture_metadata_digest !== fixture.catalog_metadata_digest || catalogFixture.task_class !== fixture.task_class || catalogFixture.repetitions !== fixture.repetitions) {
        fail(`${fixture.catalog_fixture_id} catalog metadata binding mismatch`);
      }
    }
  }
  return value;
}

export function loadPromptV2Preregistration({ root = ROOT, path = PROMPT_V2_PREREGISTRATION_PATH, verifyRepositoryBindings = true } = {}) {
  assertPortablePath(path, "preregistration path");
  return validatePromptV2Preregistration(readJson(resolve(root, path)), { root, verifyRepositoryBindings });
}

function validateExactAsset(asset, stableId, label) {
  assertExactKeys(asset, ["asset_type", "stable_id", "version", "record_digest", "content_digest"], label);
  if (asset.asset_type !== "prompt" || asset.stable_id !== stableId || typeof asset.version !== "string" || asset.version.length === 0) fail(`${label} has an invalid Prompt Asset identity`);
  assertDigest(asset.record_digest, `${label} record`);
  assertDigest(asset.content_digest, `${label} content`);
}

function validateRoleBinding(roleBinding, track, role) {
  assertExactKeys(roleBinding, ["prompt_role", "asset", "portfolio", "selection", "projection"], `${track.adapter_track}/${role} authority`);
  if (roleBinding.prompt_role !== role) fail(`${track.adapter_track} Prompt-role binding drifted`);
  validateExactAsset(roleBinding.asset, track.stable_asset_id, `${track.adapter_track}/${role} Asset`);
  assertExactKeys(roleBinding.portfolio, ["portfolio_id", "revision", "manifest_digest", "asset_set_digest", "lock_digest"], `${track.adapter_track}/${role} Portfolio`);
  for (const key of ["manifest_digest", "asset_set_digest", "lock_digest"]) assertDigest(roleBinding.portfolio[key], `${track.adapter_track}/${role} Portfolio ${key}`);
  if (typeof roleBinding.portfolio.portfolio_id !== "string" || roleBinding.portfolio.portfolio_id.length === 0 || typeof roleBinding.portfolio.revision !== "string" || roleBinding.portfolio.revision.length === 0) fail(`${track.adapter_track}/${role} Portfolio identity is incomplete`);
  assertExactKeys(roleBinding.selection, ["selection_object_digest", "selection_digest"], `${track.adapter_track}/${role} selection`);
  assertDigest(roleBinding.selection.selection_object_digest, `${track.adapter_track}/${role} selection object`);
  assertDigest(roleBinding.selection.selection_digest, `${track.adapter_track}/${role} selection`);
  assertExactKeys(roleBinding.projection, ["renderer_id", "renderer_version", "renderer_input_digest", "rendered_bundle_digest", "inventory_digest"], `${track.adapter_track}/${role} projection`);
  if (roleBinding.projection.renderer_id !== track.renderer.renderer_id || roleBinding.projection.renderer_version !== track.renderer.renderer_version) fail(`${track.adapter_track}/${role} renderer identity drifted`);
  for (const key of ["renderer_input_digest", "rendered_bundle_digest", "inventory_digest"]) assertDigest(roleBinding.projection[key], `${track.adapter_track}/${role} projection ${key}`);
}

export function validatePromptV2AuthorityBinding(value, { preregistration } = {}) {
  if (!preregistration) fail("generated authority validation requires preregistration");
  validatePromptV2Preregistration(preregistration, { verifyRepositoryBindings: false });
  assertExactKeys(value, ["schema_version", "binding_kind", "preregistration_id", "preregistration_digest", "source", "adapter_bindings", "boundaries", "binding_digest"], "generated authority binding");
  if (value.schema_version !== "1.0.0" || value.binding_kind !== preregistration.generated_authority_binding_contract.binding_kind) fail("generated authority binding kind/version mismatch");
  if (value.preregistration_id !== preregistration.preregistration_id || value.preregistration_digest !== preregistration.preregistration_digest) fail("generated authority preregistration identity mismatch");
  assertExactKeys(value.source, ["repository_revision", "repository_tree", "rendered_source_root", "rendered_source_inventory_digest"], "generated authority source");
  assertGit(value.source.repository_revision, "generated authority source revision");
  assertGit(value.source.repository_tree, "generated authority source tree");
  if (value.source.rendered_source_root !== preregistration.generated_authority_binding_contract.rendered_source_root) fail("generated authority rendered source root mismatch");
  assertDigest(value.source.rendered_source_inventory_digest, "generated authority rendered source inventory");
  if (!Array.isArray(value.adapter_bindings) || value.adapter_bindings.length !== 2) fail("generated authority must contain exactly two adapter bindings");
  exact(value.adapter_bindings.map(({ adapter_track }) => adapter_track), ADAPTERS, "generated authority adapter order drifted");
  for (const adapterBinding of value.adapter_bindings) {
    assertExactKeys(adapterBinding, ["adapter_track", "roles", "evolution"], `${adapterBinding.adapter_track} generated authority`);
    const track = preregistration.prompt_tracks.find(({ adapter_track }) => adapter_track === adapterBinding.adapter_track);
    if (!track) fail(`generated authority contains unknown adapter: ${adapterBinding.adapter_track}`);
    if (!Array.isArray(adapterBinding.roles) || adapterBinding.roles.length !== 2) fail(`${adapterBinding.adapter_track} generated authority must contain exactly two Prompt roles`);
    exact(adapterBinding.roles.map(({ prompt_role }) => prompt_role), PROMPT_ROLES, `${adapterBinding.adapter_track} Prompt-role order drifted`);
    adapterBinding.roles.forEach((role, index) => validateRoleBinding(role, track, PROMPT_ROLES[index]));
    for (const selector of [
      (role) => role.asset.version,
      (role) => role.asset.record_digest,
      (role) => role.asset.content_digest,
      (role) => role.portfolio.manifest_digest,
      (role) => role.portfolio.lock_digest,
      (role) => role.selection.selection_digest,
      (role) => role.projection.rendered_bundle_digest,
    ]) if (selector(adapterBinding.roles[0]) === selector(adapterBinding.roles[1])) fail(`${adapterBinding.adapter_track} Prompt arms must retain distinct exact authorities`);
    assertExactKeys(adapterBinding.evolution, ["candidate_object_digest", "candidate_digest", "experiment_object_digest", "experiment_digest", "baseline_asset_record_digest", "candidate_asset_record_digest", "rollback_target_manifest_digest", "phase", "results_accessed", "projection_mode", "raw_scoring_condition"], `${adapterBinding.adapter_track} Evolution authority`);
    for (const key of ["candidate_object_digest", "candidate_digest", "experiment_object_digest", "experiment_digest", "baseline_asset_record_digest", "candidate_asset_record_digest", "rollback_target_manifest_digest"]) assertDigest(adapterBinding.evolution[key], `${adapterBinding.adapter_track} Evolution ${key}`);
    if (adapterBinding.evolution.baseline_asset_record_digest !== adapterBinding.roles[0].asset.record_digest || adapterBinding.evolution.candidate_asset_record_digest !== adapterBinding.roles[1].asset.record_digest || adapterBinding.evolution.rollback_target_manifest_digest !== adapterBinding.roles[0].portfolio.manifest_digest) fail(`${adapterBinding.adapter_track} Evolution direct-lineage/rollback binding mismatch`);
    if (adapterBinding.evolution.phase !== "pre_result" || adapterBinding.evolution.results_accessed !== false || adapterBinding.evolution.projection_mode !== "prompt_v2_exact" || adapterBinding.evolution.raw_scoring_condition !== "full_ask") fail(`${adapterBinding.adapter_track} Evolution authority is not result-blind prompt_v2_exact`);
  }
  assertExactKeys(value.boundaries, ["runtime_activation_implied", "measured_execution_authorized", "result_accessed", "recommendation_created", "lifecycle_mutation_authorized"], "generated authority boundaries");
  if (Object.values(value.boundaries).some((entry) => entry !== false)) fail("generated authority implies a forbidden post-result action");
  if (value.binding_digest !== computePromptV2AuthorityBindingDigest(value)) fail("generated authority binding digest mismatch");
  assertNoForbiddenDurableFields(value, "generated authority binding");
  return value;
}

function planRoleAuthority(adapterBinding, roleBinding) {
  return {
    asset: structuredClone(roleBinding.asset),
    portfolio: structuredClone(roleBinding.portfolio),
    selection: structuredClone(roleBinding.selection),
    projection: structuredClone(roleBinding.projection),
    evolution: structuredClone(adapterBinding.evolution),
  };
}

function blockRotation(seed, adapter, fixtureId, repetition) {
  const offset = Number.parseInt(canonicalDigest({ seed, adapter, fixture_id: fixtureId }).slice(7, 9), 16) % 2;
  return (offset + repetition - 1) % 2;
}

export function buildPromptV2ExecutionPlan({ preregistration, authorityBinding }) {
  validatePromptV2Preregistration(preregistration, { verifyRepositoryBindings: false });
  validatePromptV2AuthorityBinding(authorityBinding, { preregistration });
  const blocks = [];
  for (const adapter of ADAPTERS) {
    const adapterBinding = authorityBinding.adapter_bindings.find(({ adapter_track }) => adapter_track === adapter);
    const runtime = preregistration.runtime.adapters.find(({ adapter_track }) => adapter_track === adapter);
    for (const fixture of preregistration.fixtures) {
      for (let repetition = 1; repetition <= fixture.repetitions; repetition += 1) {
        const blockIdentity = {
          preregistration_digest: preregistration.preregistration_digest,
          authority_binding_digest: authorityBinding.binding_digest,
          seed: preregistration.ordering.seed,
          adapter_track: adapter,
          fixture_id: fixture.catalog_fixture_id,
          repetition,
        };
        const block_identity_digest = canonicalDigest(blockIdentity);
        const block_id = `prompt-v2-block-${block_identity_digest.slice(-32)}`;
        const common_input_identity_digest = canonicalDigest({
          fixture_id: fixture.catalog_fixture_id,
          input_manifest_fixture_digest: fixture.input_manifest_fixture_digest,
          frozen_input_digest: fixture.frozen_input_digest,
          task_digest: fixture.task_digest,
          workspace_digest: fixture.workspace_digest,
          evaluator_visible_input_digest: fixture.evaluator_visible_input_digest,
          public_evaluator_set_identity_digest: fixture.public_evaluator_set.inventory_digest,
          raw_scorer_authority_digest: preregistration.raw_scoring.authority_digest,
        });
        const runtime_identity_digest = canonicalDigest(runtime);
        const firstRoleIndex = blockRotation(preregistration.ordering.seed, adapter, fixture.catalog_fixture_id, repetition);
        const roles = [PROMPT_ROLES[firstRoleIndex], PROMPT_ROLES[1 - firstRoleIndex]];
        const cases = roles.map((prompt_role, roleIndex) => {
          const roleBinding = adapterBinding.roles.find((entry) => entry.prompt_role === prompt_role);
          const prompt_authority = planRoleAuthority(adapterBinding, roleBinding);
          const identity = {
            block_identity_digest,
            adapter_track: adapter,
            fixture_id: fixture.catalog_fixture_id,
            source_fixture_id: fixture.source_fixture_id,
            task_class: fixture.task_class,
            repetition,
            prompt_role,
            role_order_position: roleIndex + 1,
            raw_scoring_condition: "full_ask",
            raw_scorer_authority_digest: preregistration.raw_scoring.authority_digest,
            common_input_identity_digest,
            prompt_projection_digest: roleBinding.projection.rendered_bundle_digest,
            runtime_identity_digest,
            prompt_authority,
          };
          const case_identity_digest = canonicalDigest(identity);
          return {
            case_id: `prompt-v2-case-${case_identity_digest.slice(-32)}`,
            case_identity_digest,
            block_id,
            block_identity_digest,
            ...identity,
          };
        });
        blocks.push({ sort_key: canonicalDigest({ seed: preregistration.ordering.seed, block_id }), cases });
      }
    }
  }
  blocks.sort((left, right) => left.sort_key.localeCompare(right.sort_key));
  const cases = blocks.flatMap(({ cases: blockCases }) => blockCases).map((entry, index) => ({ position: index + 1, ...entry }));
  const base = {
    schema_version: "1.0.0",
    schema_path: PROMPT_V2_EXECUTION_PLAN_SCHEMA_PATH,
    artifact_type: "prompt_v2_execution_plan",
    program: "ask_prompt_v2_result_blind_canary",
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    authority_binding_digest: authorityBinding.binding_digest,
    randomization: {
      strategy: preregistration.ordering.strategy,
      seed: preregistration.ordering.seed,
      seed_digest: canonicalDigest({ seed: preregistration.ordering.seed }),
    },
    expected_case_count: 56,
    pool_adapter_results: false,
    cases,
    boundaries: {
      measured_execution_authorized: false,
      results_accessed: false,
      adapter_substitution_allowed: false,
      retry_substitution_allowed: false,
    },
  };
  const plan_digest = computePlanDigest(base);
  return { ...base, plan_id: `prompt-v2-plan-${plan_digest.slice(-32)}`, plan_digest };
}

export function validatePromptV2ExecutionPlan(value, { preregistration, authorityBinding, root = ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_EXECUTION_PLAN_SCHEMA_PATH), label: "Prompt v2 execution plan" });
  const expected = buildPromptV2ExecutionPlan({ preregistration, authorityBinding });
  exact(value, expected, "execution plan identity, inventory, or deterministic order mismatch");
  if (new Set(value.cases.map(({ case_id }) => case_id)).size !== 56) fail("execution plan contains duplicate case identities");
  if (new Set(value.cases.map(({ block_id }) => block_id)).size !== 28) fail("execution plan must contain exactly 28 paired blocks");
  return value;
}

export function buildPromptV2MaterializationManifest({ preregistration, authorityBinding, plan }) {
  validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding });
  const cases = plan.cases.map((caseRecord) => {
    const fixture = preregistration.fixtures.find(({ catalog_fixture_id }) => catalog_fixture_id === caseRecord.fixture_id);
    if (!fixture) fail(`materialization fixture is missing for ${caseRecord.case_id}`);
    return {
      position: caseRecord.position,
      case_id: caseRecord.case_id,
      case_identity_digest: caseRecord.case_identity_digest,
      block_id: caseRecord.block_id,
      adapter_track: caseRecord.adapter_track,
      fixture_id: caseRecord.fixture_id,
      source_fixture_id: caseRecord.source_fixture_id,
      repetition: caseRecord.repetition,
      prompt_role: caseRecord.prompt_role,
      role_order_position: caseRecord.role_order_position,
      input_manifest_path: preregistration.fixture_input_manifest.path,
      input_manifest_raw_byte_digest: preregistration.fixture_input_manifest.raw_byte_digest,
      input_manifest_fixture_digest: fixture.input_manifest_fixture_digest,
      task_digest: fixture.task_digest,
      workspace_digest: fixture.workspace_digest,
      evaluator_visible_input_digest: fixture.evaluator_visible_input_digest,
      frozen_input_digest: fixture.frozen_input_digest,
      public_evaluator_set_identity_digest: fixture.public_evaluator_set.inventory_digest,
      raw_scorer_authority_digest: caseRecord.raw_scorer_authority_digest,
      common_input_identity_digest: caseRecord.common_input_identity_digest,
      prompt_projection_digest: caseRecord.prompt_projection_digest,
      prompt_authority_identity_digest: canonicalDigest(caseRecord.prompt_authority),
    };
  });
  const base = {
    schema_version: "1.0.0",
    schema_path: PROMPT_V2_MATERIALIZATION_SCHEMA_PATH,
    artifact_type: "prompt_v2_materialization_manifest",
    program: "ask_prompt_v2_result_blind_canary",
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    authority_binding_digest: authorityBinding.binding_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    expected_case_count: 56,
    cases,
    privacy: {
      agent_visible_bytes_serialized: false,
      private_evaluator_bytes_serialized: false,
      raw_prompt_serialized: false,
      raw_output_serialized: false,
    },
  };
  const materialization_digest = computeMaterializationDigest(base);
  return {
    ...base,
    materialization_id: `prompt-v2-materialization-${materialization_digest.slice(-32)}`,
    materialization_digest,
  };
}

export function validatePromptV2MaterializationManifest(value, { preregistration, authorityBinding, plan, root = ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_MATERIALIZATION_SCHEMA_PATH), label: "Prompt v2 materialization manifest" });
  const expected = buildPromptV2MaterializationManifest({ preregistration, authorityBinding, plan });
  exact(value, expected, "materialization identity, common input, workspace, or Prompt projection mismatch");
  const byBlock = new Map();
  for (const entry of value.cases) {
    if (!byBlock.has(entry.block_id)) byBlock.set(entry.block_id, []);
    byBlock.get(entry.block_id).push(entry);
  }
  for (const [blockId, entries] of byBlock) {
    if (entries.length !== 2) fail(`materialization block ${blockId} is not paired`);
    for (const field of ["input_manifest_fixture_digest", "task_digest", "workspace_digest", "evaluator_visible_input_digest", "frozen_input_digest", "public_evaluator_set_identity_digest", "common_input_identity_digest"]) {
      if (new Set(entries.map((entry) => entry[field])).size !== 1) fail(`materialization block ${blockId} ${field} drifted across Prompt arms`);
    }
    if (new Set(entries.map(({ prompt_projection_digest }) => prompt_projection_digest)).size !== 2) fail(`materialization block ${blockId} substituted a Prompt projection`);
  }
  assertNoForbiddenDurableFields(value, "materialization manifest");
  return value;
}

function resumeCompleteness(cases) {
  const terminal_cases = cases.filter(({ status }) => TERMINAL_STATUSES.has(status)).length;
  const pending_cases = cases.length - terminal_cases;
  return { expected_cases: 56, terminal_cases, pending_cases, partial: pending_cases > 0 };
}

function assertResumePlanInventory(state, plan) {
  if (state.plan_id !== plan.plan_id || state.plan_digest !== plan.plan_digest || state.cases.length !== plan.cases.length) fail("resume state/plan inventory mismatch");
  if (state.state_digest !== computeResumeStateDigest(state)) fail("resume state digest mismatch");
  const identityDigest = canonicalDigest({ run_instance_id: state.run_instance_id, plan_id: plan.plan_id, plan_digest: plan.plan_digest, materialization_id: state.materialization_id, materialization_digest: state.materialization_digest });
  if (state.state_id !== `prompt-v2-resume-${identityDigest.slice(-32)}`) fail("resume state identity mismatch");
  for (let index = 0; index < plan.cases.length; index += 1) {
    const expected = plan.cases[index];
    const actual = state.cases[index];
    if (actual.position !== expected.position || actual.case_id !== expected.case_id || actual.case_identity_digest !== expected.case_identity_digest || actual.attempt !== 1) fail(`resume case identity mismatch at position ${index + 1}`);
    if (actual.status === "pending" ? actual.result_ref !== null : (!TERMINAL_STATUSES.has(actual.status) || !actual.result_ref || actual.result_ref.status !== actual.status)) fail(`${actual.case_id} resume status/ref mismatch`);
  }
  exact(state.completeness, resumeCompleteness(state.cases), "resume completeness counters mismatch");
}

export function createPromptV2ResumeState({ plan, materialization, runInstanceId }) {
  if (!UUID_PATTERN.test(runInstanceId ?? "")) fail("resume run_instance_id must be a UUID");
  if (plan.plan_id !== materialization.plan_id || plan.plan_digest !== materialization.plan_digest || materialization.cases.length !== plan.cases.length) fail("resume plan/materialization identity mismatch");
  for (let index = 0; index < plan.cases.length; index += 1) if (plan.cases[index].case_id !== materialization.cases[index].case_id || plan.cases[index].case_identity_digest !== materialization.cases[index].case_identity_digest) fail("resume plan/materialization case inventory mismatch");
  const identityDigest = canonicalDigest({ run_instance_id: runInstanceId, plan_id: plan.plan_id, plan_digest: plan.plan_digest, materialization_id: materialization.materialization_id, materialization_digest: materialization.materialization_digest });
  const cases = plan.cases.map(({ position, case_id, case_identity_digest }) => ({
    position,
    case_id,
    case_identity_digest,
    attempt: 1,
    status: "pending",
    result_ref: null,
  }));
  const base = {
    schema_version: "1.0.0",
    schema_path: PROMPT_V2_RESUME_STATE_SCHEMA_PATH,
    artifact_type: "prompt_v2_resume_state",
    program: "ask_prompt_v2_result_blind_canary",
    run_instance_id: runInstanceId,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    materialization_id: materialization.materialization_id,
    materialization_digest: materialization.materialization_digest,
    cases,
    completeness: resumeCompleteness(cases),
    boundaries: {
      completed_refs_immutable: true,
      pending_only_scheduled: true,
      retry_substitution_allowed: false,
      cross_run_transplant_allowed: false,
      cherry_pick_allowed: false,
    },
    state_id: `prompt-v2-resume-${identityDigest.slice(-32)}`,
  };
  return { ...base, state_digest: computeResumeStateDigest(base) };
}

export function validatePromptV2ResumeState(value, { plan, materialization, root = ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_RESUME_STATE_SCHEMA_PATH), label: "Prompt v2 resume state" });
  if (value.plan_id !== plan.plan_id || value.plan_digest !== plan.plan_digest || value.materialization_id !== materialization.materialization_id || value.materialization_digest !== materialization.materialization_digest) fail("resume identity does not match plan/materialization");
  const identityDigest = canonicalDigest({ run_instance_id: value.run_instance_id, plan_id: plan.plan_id, plan_digest: plan.plan_digest, materialization_id: materialization.materialization_id, materialization_digest: materialization.materialization_digest });
  if (value.state_id !== `prompt-v2-resume-${identityDigest.slice(-32)}`) fail("resume state identity mismatch");
  if (value.state_digest !== computeResumeStateDigest(value)) fail("resume state digest mismatch");
  if (value.cases.length !== plan.cases.length) fail("resume case inventory is incomplete or cherry-picked");
  const seen = new Set();
  for (let index = 0; index < plan.cases.length; index += 1) {
    const expected = plan.cases[index];
    const actual = value.cases[index];
    if (seen.has(actual.case_id)) fail("resume case inventory contains a duplicate");
    seen.add(actual.case_id);
    if (actual.position !== expected.position || actual.case_id !== expected.case_id || actual.case_identity_digest !== expected.case_identity_digest || actual.attempt !== 1) fail(`resume case identity mismatch at position ${index + 1}`);
    if (actual.status === "pending" && actual.result_ref !== null) fail(`${actual.case_id} pending resume entry contains a result ref`);
    if (TERMINAL_STATUSES.has(actual.status)) {
      if (!actual.result_ref || actual.result_ref.status !== actual.status) fail(`${actual.case_id} terminal resume entry lacks an immutable result ref`);
    }
  }
  exact(value.completeness, resumeCompleteness(value.cases), "resume completeness counters mismatch");
  assertNoForbiddenDurableFields(value, "resume state");
  return value;
}

export function pendingPromptV2Cases({ state, plan, materialization }) {
  if (materialization) validatePromptV2ResumeState(state, { plan, materialization });
  else assertResumePlanInventory(state, plan);
  const pending = new Set(state.cases.filter(({ status }) => status === "pending").map(({ case_id }) => case_id));
  return plan.cases.filter(({ case_id }) => pending.has(case_id));
}

function typedMetric(value, field, { scoringReady, unavailable }) {
  if (unavailable) return { status: "unavailable", value: null };
  if (value === undefined && !scoringReady) return { status: "unknown", value: null };
  if (!value || typeof value !== "object" || Array.isArray(value) || !TYPED_STATUSES.has(value.status)) fail(`${field} must be a typed metric`);
  assertExactKeys(value, ["status", "value"], field);
  if (value.status === "known") {
    if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0) fail(`${field} known metric must be a finite non-negative number`);
    if (field === "normalized_requirement_score" && value.value > 1) fail(`${field} must be normalized to [0,1]`);
    if ((GUARDRAIL_FIELDS.includes(field) || ["input_tokens", "output_tokens", "cached_tokens"].includes(field)) && !Number.isInteger(value.value)) fail(`${field} must use an integer native unit`);
  } else if (value.value !== null) fail(`${field} ${value.status} metric must retain null, never zero`);
  if (scoringReady && value.status !== "known") fail(`${field} must be known for scoring_ready result`);
  return { status: value.status, value: value.value };
}

function gateValue(value, field, { scoringReady, unavailable }) {
  if (unavailable) return "unavailable";
  if (value === undefined && !scoringReady) return "unknown";
  if (!GATE_STATUSES.has(value)) fail(`${field} has an invalid typed route/gate value`);
  if (scoringReady && !["pass", "fail"].includes(value)) fail(`${field} must be pass/fail for scoring_ready result`);
  return value;
}

function assertNormalizedSelf(value, root = ROOT) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_NORMALIZED_RESULT_SCHEMA_PATH), label: "Prompt v2 normalized result" });
  if (value.normalized_result_digest !== computeNormalizedResultDigest(value)) fail("normalized result digest mismatch");
  if (value.normalized_result_id !== `prompt-v2-normalized-${value.normalized_result_digest.slice(-32)}`) fail("normalized result identity mismatch");
  assertNoForbiddenDurableFields(value, "normalized result");
  return value;
}

export function buildPromptV2NormalizedResult({
  preregistration,
  authorityBinding,
  plan,
  materialization,
  runInstanceId,
  caseId,
  status,
  unavailableReason = null,
  rawScoreRef = null,
  metrics = {},
  guardrails = {},
  route_gates = {},
}) {
  validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding });
  validatePromptV2MaterializationManifest(materialization, { preregistration, authorityBinding, plan });
  if (!UUID_PATTERN.test(runInstanceId ?? "")) fail("normalized result run_instance_id must be a UUID");
  if (!TERMINAL_STATUSES.has(status)) fail("normalized result must have a terminal typed status");
  const caseRecord = plan.cases.find(({ case_id }) => case_id === caseId);
  const materialized = materialization.cases.find(({ case_id }) => case_id === caseId);
  if (!caseRecord || !materialized) fail("normalized result case identity is not in the complete plan/materialization");
  const scoringReady = status === "scoring_ready";
  const unavailable = status === "unavailable";
  if (scoringReady && !rawScoreRef) fail("scoring_ready normalized result requires an existing #197 raw-score reference");
  if (!scoringReady && rawScoreRef !== null) fail("non-scoring-ready normalized result must not claim a raw-score reference");
  if (unavailable && (typeof unavailableReason !== "string" || unavailableReason.length === 0)) fail("unavailable normalized result requires a typed reason");
  if (!unavailable && unavailableReason !== null) fail("available normalized result must not contain an unavailable reason");
  if (rawScoreRef) {
    assertExactKeys(rawScoreRef, ["engineering_result_id", "engineering_result_digest", "evaluation_id", "evaluation_digest", "result_set_id", "result_set_digest", "adapter_track", "condition"], "#197 raw-score reference");
    for (const key of ["engineering_result_digest", "evaluation_digest", "result_set_digest"]) assertDigest(rawScoreRef[key], `#197 raw-score ${key}`);
    if (rawScoreRef.adapter_track !== caseRecord.adapter_track || rawScoreRef.condition !== "full_ask") fail("#197 raw-score reference was transplanted across adapter/condition");
  }
  const normalizedMetrics = Object.fromEntries(METRIC_FIELDS.map((field) => [field, typedMetric(metrics[field], field, { scoringReady, unavailable })]));
  const normalizedGuardrails = Object.fromEntries(GUARDRAIL_FIELDS.map((field) => [field, typedMetric(guardrails[field], field, { scoringReady, unavailable })]));
  const normalizedGates = Object.fromEntries(ROUTE_GATE_FIELDS.map((field) => [field, gateValue(route_gates[field], field, { scoringReady, unavailable })]));
  const authority = caseRecord.prompt_authority;
  const base = {
    schema_version: "1.0.0",
    schema_path: PROMPT_V2_NORMALIZED_RESULT_SCHEMA_PATH,
    artifact_type: "prompt_v2_normalized_result",
    program: "ask_prompt_v2_result_blind_canary",
    lineage: {
      preregistration_id: preregistration.preregistration_id,
      preregistration_digest: preregistration.preregistration_digest,
      authority_binding_digest: authorityBinding.binding_digest,
      plan_id: plan.plan_id,
      plan_digest: plan.plan_digest,
      materialization_id: materialization.materialization_id,
      materialization_digest: materialization.materialization_digest,
      run_instance_id: runInstanceId,
      case_id: caseRecord.case_id,
      case_identity_digest: caseRecord.case_identity_digest,
      block_id: caseRecord.block_id,
      attempt: 1,
      adapter_track: caseRecord.adapter_track,
      fixture_id: caseRecord.fixture_id,
      source_fixture_id: caseRecord.source_fixture_id,
      repetition: caseRecord.repetition,
      prompt_role: caseRecord.prompt_role,
      raw_scoring_condition: "full_ask",
      asset_record_digest: authority.asset.record_digest,
      asset_content_digest: authority.asset.content_digest,
      portfolio_manifest_digest: authority.portfolio.manifest_digest,
      portfolio_lock_digest: authority.portfolio.lock_digest,
      selection_digest: authority.selection.selection_digest,
      candidate_digest: authority.evolution.candidate_digest,
      experiment_digest: authority.evolution.experiment_digest,
      prompt_projection_digest: caseRecord.prompt_projection_digest,
      common_input_identity_digest: materialized.common_input_identity_digest,
      raw_scorer_authority_digest: preregistration.raw_scoring.authority_digest,
    },
    status,
    unavailable_reason: unavailableReason,
    raw_score_ref: rawScoreRef ? structuredClone(rawScoreRef) : null,
    metrics: normalizedMetrics,
    guardrails: normalizedGuardrails,
    route_gates: normalizedGates,
    privacy: {
      prompt_bytes_serialized: false,
      model_output_bytes_serialized: false,
      private_evaluator_bytes_serialized: false,
      score_recomputation_performed: false,
    },
  };
  const normalized_result_digest = computeNormalizedResultDigest(base);
  const value = { ...base, normalized_result_id: `prompt-v2-normalized-${normalized_result_digest.slice(-32)}`, normalized_result_digest };
  assertNormalizedSelf(value);
  return value;
}

export function validatePromptV2NormalizedResult(value, { preregistration, authorityBinding, plan, materialization, root = ROOT } = {}) {
  assertNormalizedSelf(value, root);
  validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding, root });
  validatePromptV2MaterializationManifest(materialization, { preregistration, authorityBinding, plan, root });
  const caseRecord = plan.cases.find(({ case_id }) => case_id === value.lineage.case_id);
  const materialized = materialization.cases.find(({ case_id }) => case_id === value.lineage.case_id);
  if (!caseRecord || !materialized) fail("normalized result case is missing from plan/materialization inventory");
  const authority = caseRecord.prompt_authority;
  const expectedLineage = {
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    authority_binding_digest: authorityBinding.binding_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    materialization_id: materialization.materialization_id,
    materialization_digest: materialization.materialization_digest,
    run_instance_id: value.lineage.run_instance_id,
    case_id: caseRecord.case_id,
    case_identity_digest: caseRecord.case_identity_digest,
    block_id: caseRecord.block_id,
    attempt: 1,
    adapter_track: caseRecord.adapter_track,
    fixture_id: caseRecord.fixture_id,
    source_fixture_id: caseRecord.source_fixture_id,
    repetition: caseRecord.repetition,
    prompt_role: caseRecord.prompt_role,
    raw_scoring_condition: "full_ask",
    asset_record_digest: authority.asset.record_digest,
    asset_content_digest: authority.asset.content_digest,
    portfolio_manifest_digest: authority.portfolio.manifest_digest,
    portfolio_lock_digest: authority.portfolio.lock_digest,
    selection_digest: authority.selection.selection_digest,
    candidate_digest: authority.evolution.candidate_digest,
    experiment_digest: authority.evolution.experiment_digest,
    prompt_projection_digest: caseRecord.prompt_projection_digest,
    common_input_identity_digest: materialized.common_input_identity_digest,
    raw_scorer_authority_digest: preregistration.raw_scoring.authority_digest,
  };
  exact(value.lineage, expectedLineage, "normalized result lineage identity mismatch");
  if (!UUID_PATTERN.test(value.lineage.run_instance_id)) fail("normalized result run identity is invalid");
  const scoringReady = value.status === "scoring_ready";
  const unavailable = value.status === "unavailable";
  for (const field of METRIC_FIELDS) typedMetric(value.metrics[field], field, { scoringReady, unavailable });
  for (const field of GUARDRAIL_FIELDS) typedMetric(value.guardrails[field], field, { scoringReady, unavailable });
  for (const field of ROUTE_GATE_FIELDS) gateValue(value.route_gates[field], field, { scoringReady, unavailable });
  if (scoringReady) {
    if (!value.raw_score_ref || value.raw_score_ref.adapter_track !== caseRecord.adapter_track || value.raw_score_ref.condition !== "full_ask") fail("normalized result lacks its exact existing #197 raw-score reference");
  } else if (value.raw_score_ref !== null) fail("non-scoring-ready normalized result must not serialize a raw-score payload/ref");
  if (unavailable && (typeof value.unavailable_reason !== "string" || value.unavailable_reason.length === 0)) fail("typed unavailable normalized result lacks a reason");
  if (!unavailable && value.unavailable_reason !== null) fail("normalized result availability reason drifted");
  return value;
}

export function applyPromptV2NormalizedResult({ state, plan, materialization, result }) {
  validatePromptV2ResumeState(state, { plan, materialization });
  assertNormalizedSelf(result);
  const index = state.cases.findIndex(({ case_id }) => case_id === result.lineage.case_id);
  if (index < 0) fail("normalized result case is outside the resume inventory");
  const current = state.cases[index];
  if (current.status !== "pending" || current.result_ref !== null) fail(`${current.case_id} is already terminal; duplicate/retry substitution rejected`);
  if (result.lineage.run_instance_id !== state.run_instance_id || result.lineage.plan_id !== plan.plan_id || result.lineage.plan_digest !== plan.plan_digest || result.lineage.materialization_id !== materialization.materialization_id || result.lineage.materialization_digest !== materialization.materialization_digest || result.lineage.case_identity_digest !== current.case_identity_digest || result.lineage.attempt !== 1) {
    fail("normalized result run/plan/case identity transplant rejected");
  }
  const caseRecord = plan.cases[index];
  const materialized = materialization.cases[index];
  const authority = caseRecord.prompt_authority;
  const immutableLineage = {
    preregistration_id: plan.preregistration_id,
    preregistration_digest: plan.preregistration_digest,
    authority_binding_digest: plan.authority_binding_digest,
    block_id: caseRecord.block_id,
    adapter_track: caseRecord.adapter_track,
    fixture_id: caseRecord.fixture_id,
    source_fixture_id: caseRecord.source_fixture_id,
    repetition: caseRecord.repetition,
    prompt_role: caseRecord.prompt_role,
    raw_scoring_condition: "full_ask",
    asset_record_digest: authority.asset.record_digest,
    asset_content_digest: authority.asset.content_digest,
    portfolio_manifest_digest: authority.portfolio.manifest_digest,
    portfolio_lock_digest: authority.portfolio.lock_digest,
    selection_digest: authority.selection.selection_digest,
    candidate_digest: authority.evolution.candidate_digest,
    experiment_digest: authority.evolution.experiment_digest,
    prompt_projection_digest: caseRecord.prompt_projection_digest,
    common_input_identity_digest: materialized.common_input_identity_digest,
    raw_scorer_authority_digest: caseRecord.raw_scorer_authority_digest,
  };
  for (const [key, expected] of Object.entries(immutableLineage)) if (result.lineage[key] !== expected) fail(`normalized result immutable ${key} transplant rejected`);
  const cases = structuredClone(state.cases);
  cases[index] = {
    ...current,
    status: result.status,
    result_ref: {
      normalized_result_id: result.normalized_result_id,
      normalized_result_digest: result.normalized_result_digest,
      status: result.status,
    },
  };
  const next = { ...structuredClone(state), cases, completeness: resumeCompleteness(cases) };
  next.state_digest = computeResumeStateDigest(next);
  validatePromptV2ResumeState(next, { plan, materialization });
  return next;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values) {
  const center = median(values);
  if (center === null) return null;
  return median(values.map((value) => Math.abs(value - center)));
}

function knownStat(value) {
  return value === null || !Number.isFinite(value) ? { status: "unknown", value: null } : { status: "known", value };
}

function unavailableStat(status) {
  return { status, value: null };
}

function completePairs(results) {
  const byBlock = new Map();
  for (const result of results) {
    if (!byBlock.has(result.lineage.block_id)) byBlock.set(result.lineage.block_id, {});
    const pair = byBlock.get(result.lineage.block_id);
    if (pair[result.lineage.prompt_role]) fail("comparison report contains duplicate Prompt roles inside a paired block");
    pair[result.lineage.prompt_role] = result;
  }
  return [...byBlock.values()].map((pair) => {
    if (!pair.current_prompt || !pair.prompt_v2) fail("comparison report contains an incomplete paired block");
    return pair;
  });
}

function requiredFraction(count, numerator, denominator) {
  return Math.ceil((count * numerator) / denominator);
}

function unknownFixtureQuality(preregistration, status) {
  return preregistration.fixtures.map((fixture) => ({
    fixture_id: fixture.catalog_fixture_id,
    expected_pairs: fixture.repetitions,
    eligible_pairs: 0,
    median_delta: unavailableStat(status),
    nonnegative_count: null,
    required_nonnegative_count: requiredFraction(fixture.repetitions, preregistration.thresholds.quality.minimum_nonnegative_fraction_numerator, preregistration.thresholds.quality.minimum_nonnegative_fraction_denominator),
    pass: null,
  }));
}

function unknownTokenStats(preregistration, status) {
  const expectedPairs = preregistration.fixtures.reduce((count, fixture) => count + fixture.repetitions, 0);
  return {
    eligible_pairs: 0,
    current_median_total_tokens: unavailableStat(status),
    prompt_v2_median_total_tokens: unavailableStat(status),
    current_median_cached_tokens: unavailableStat(status),
    prompt_v2_median_cached_tokens: unavailableStat(status),
    median_reduction_ratio: unavailableStat(status),
    pairs_meeting_threshold: null,
    required_pairs_meeting_threshold: requiredFraction(expectedPairs, preregistration.thresholds.tokens.minimum_pair_fraction_numerator, preregistration.thresholds.tokens.minimum_pair_fraction_denominator),
    current_normalized_mad: unavailableStat(status),
    prompt_v2_normalized_mad: unavailableStat(status),
    variability_floor: unavailableStat(status),
    pass: null,
  };
}

function unknownDurationStats(status) {
  return {
    eligible_pairs: 0,
    current_median_duration_ms: unavailableStat(status),
    prompt_v2_median_duration_ms: unavailableStat(status),
    median_increase_ratio: unavailableStat(status),
    median_quality_gain: unavailableStat(status),
    current_quality_mad: unavailableStat(status),
    prompt_v2_quality_mad: unavailableStat(status),
    variability_floor: unavailableStat(status),
    conditional_path_used: null,
    pass: null,
  };
}

function buildAdapterReport({ adapter, preregistration, plannedCases, results }) {
  const expected_cases = plannedCases.length;
  const terminal_cases = results.length;
  const scoring_ready_cases = results.filter(({ status }) => status === "scoring_ready").length;
  const unavailable_cases = results.filter(({ status }) => status === "unavailable").length;
  const not_scoring_ready_cases = results.filter(({ status }) => status === "not_scoring_ready").length;
  const inventory_complete = terminal_cases === expected_cases;
  const scoring_complete = inventory_complete && scoring_ready_cases === expected_cases;
  const result_refs = results.map((result) => ({
    case_id: result.lineage.case_id,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    status: result.status,
  }));
  if (!scoring_complete) {
    const status = unavailable_cases > 0 ? "unavailable" : "unknown";
    return {
      adapter_track: adapter,
      expected_cases,
      terminal_cases,
      scoring_ready_cases,
      unavailable_cases,
      not_scoring_ready_cases,
      inventory_complete,
      scoring_complete,
      fixture_quality: unknownFixtureQuality(preregistration, status),
      quality_regression: null,
      guardrail_regression_fields: [],
      route_gate_regression_fields: [],
      tokens: unknownTokenStats(preregistration, status),
      duration: unknownDurationStats(status),
      stability_complete: false,
      result_refs,
      prompt_outcome: "insufficient_evidence",
    };
  }

  const pairs = completePairs(results);
  const fixture_quality = preregistration.fixtures.map((fixture) => {
    const fixturePairs = pairs.filter(({ current_prompt }) => current_prompt.lineage.fixture_id === fixture.catalog_fixture_id);
    const deltas = fixturePairs.map((pair) => pair.prompt_v2.metrics.normalized_requirement_score.value - pair.current_prompt.metrics.normalized_requirement_score.value);
    const medianDelta = median(deltas);
    const nonnegativeCount = deltas.filter((value) => value >= 0).length;
    const requiredNonnegativeCount = requiredFraction(fixture.repetitions, preregistration.thresholds.quality.minimum_nonnegative_fraction_numerator, preregistration.thresholds.quality.minimum_nonnegative_fraction_denominator);
    return {
      fixture_id: fixture.catalog_fixture_id,
      expected_pairs: fixture.repetitions,
      eligible_pairs: deltas.length,
      median_delta: knownStat(medianDelta),
      nonnegative_count: nonnegativeCount,
      required_nonnegative_count: requiredNonnegativeCount,
      pass: deltas.length === fixture.repetitions && medianDelta >= preregistration.thresholds.quality.minimum_fixture_median_delta && nonnegativeCount >= requiredNonnegativeCount,
    };
  });
  const quality_regression = fixture_quality.some(({ pass }) => pass === false);
  const guardrail_regression_fields = GUARDRAIL_FIELDS.filter((field) => pairs.some((pair) => pair.prompt_v2.guardrails[field].value > pair.current_prompt.guardrails[field].value));
  const gateRank = { unavailable: 0, unknown: 0, not_applicable: 0, fail: 1, pass: 2 };
  const route_gate_regression_fields = ROUTE_GATE_FIELDS.filter((field) => pairs.some((pair) => gateRank[pair.prompt_v2.route_gates[field]] < gateRank[pair.current_prompt.route_gates[field]]));

  const currentTokens = pairs.map((pair) => pair.current_prompt.metrics.input_tokens.value + pair.current_prompt.metrics.output_tokens.value);
  const candidateTokens = pairs.map((pair) => pair.prompt_v2.metrics.input_tokens.value + pair.prompt_v2.metrics.output_tokens.value);
  const currentCachedTokens = pairs.map((pair) => pair.current_prompt.metrics.cached_tokens.value);
  const candidateCachedTokens = pairs.map((pair) => pair.prompt_v2.metrics.cached_tokens.value);
  const tokenRatios = pairs.map((pair, index) => currentTokens[index] > 0 ? (currentTokens[index] - candidateTokens[index]) / currentTokens[index] : Number.NaN);
  const tokenMedian = median(tokenRatios);
  const currentTokenMedian = median(currentTokens);
  const candidateTokenMedian = median(candidateTokens);
  const currentTokenMad = currentTokenMedian > 0 ? mad(currentTokens) / currentTokenMedian : null;
  const candidateTokenMad = candidateTokenMedian > 0 ? mad(candidateTokens) / candidateTokenMedian : null;
  const tokenFloor = currentTokenMad === null || candidateTokenMad === null ? null : Math.max(currentTokenMad, candidateTokenMad);
  const tokenMeetCount = tokenRatios.filter((value) => value >= preregistration.thresholds.tokens.minimum_median_reduction_ratio).length;
  const tokenRequiredCount = requiredFraction(pairs.length, preregistration.thresholds.tokens.minimum_pair_fraction_numerator, preregistration.thresholds.tokens.minimum_pair_fraction_denominator);
  const tokenPass = tokenMedian !== null && tokenFloor !== null && tokenMedian >= preregistration.thresholds.tokens.minimum_median_reduction_ratio && tokenMeetCount >= tokenRequiredCount && tokenMedian >= tokenFloor;
  const tokens = {
    eligible_pairs: tokenRatios.filter(Number.isFinite).length,
    current_median_total_tokens: knownStat(currentTokenMedian),
    prompt_v2_median_total_tokens: knownStat(candidateTokenMedian),
    current_median_cached_tokens: knownStat(median(currentCachedTokens)),
    prompt_v2_median_cached_tokens: knownStat(median(candidateCachedTokens)),
    median_reduction_ratio: knownStat(tokenMedian),
    pairs_meeting_threshold: tokenMeetCount,
    required_pairs_meeting_threshold: tokenRequiredCount,
    current_normalized_mad: knownStat(currentTokenMad),
    prompt_v2_normalized_mad: knownStat(candidateTokenMad),
    variability_floor: knownStat(tokenFloor),
    pass: tokenPass,
  };

  const currentDurations = pairs.map((pair) => pair.current_prompt.metrics.duration_ms.value);
  const candidateDurations = pairs.map((pair) => pair.prompt_v2.metrics.duration_ms.value);
  const durationRatios = pairs.map((pair, index) => currentDurations[index] > 0 ? (candidateDurations[index] - currentDurations[index]) / currentDurations[index] : Number.NaN);
  const durationMedian = median(durationRatios);
  const currentQuality = pairs.map((pair) => pair.current_prompt.metrics.normalized_requirement_score.value);
  const candidateQuality = pairs.map((pair) => pair.prompt_v2.metrics.normalized_requirement_score.value);
  const qualityGains = pairs.map((pair, index) => candidateQuality[index] - currentQuality[index]);
  const qualityGainMedian = median(qualityGains);
  const currentQualityMad = mad(currentQuality);
  const candidateQualityMad = mad(candidateQuality);
  const qualityFloor = currentQualityMad === null || candidateQualityMad === null ? null : Math.max(currentQualityMad, candidateQualityMad);
  const conditional = durationMedian !== null && durationMedian > preregistration.thresholds.duration.maximum_unconditional_increase_ratio;
  const durationPass = durationMedian !== null && qualityGainMedian !== null && qualityFloor !== null && (
    durationMedian <= preregistration.thresholds.duration.maximum_unconditional_increase_ratio
    || (durationMedian <= preregistration.thresholds.duration.maximum_conditional_increase_ratio
      && qualityGainMedian >= preregistration.thresholds.duration.minimum_conditional_quality_gain
      && qualityGainMedian > qualityFloor)
  );
  const duration = {
    eligible_pairs: durationRatios.filter(Number.isFinite).length,
    current_median_duration_ms: knownStat(median(currentDurations)),
    prompt_v2_median_duration_ms: knownStat(median(candidateDurations)),
    median_increase_ratio: knownStat(durationMedian),
    median_quality_gain: knownStat(qualityGainMedian),
    current_quality_mad: knownStat(currentQualityMad),
    prompt_v2_quality_mad: knownStat(candidateQualityMad),
    variability_floor: knownStat(qualityFloor),
    conditional_path_used: conditional,
    pass: durationPass,
  };
  const stability_complete = [tokenMedian, currentTokenMad, candidateTokenMad, durationMedian, qualityGainMedian, currentQualityMad, candidateQualityMad].every((value) => value !== null && Number.isFinite(value)) && fixture_quality.every(({ median_delta, eligible_pairs, expected_pairs }) => median_delta.status === "known" && eligible_pairs === expected_pairs);
  const regression = quality_regression || guardrail_regression_fields.length > 0 || route_gate_regression_fields.length > 0;
  let prompt_outcome = "adopt_prompt_v2";
  if (regression) prompt_outcome = "revise_and_repeat";
  else if (!tokens.pass || !duration.pass || !stability_complete) prompt_outcome = "retain_current";
  return {
    adapter_track: adapter,
    expected_cases,
    terminal_cases,
    scoring_ready_cases,
    unavailable_cases,
    not_scoring_ready_cases,
    inventory_complete,
    scoring_complete,
    fixture_quality,
    quality_regression,
    guardrail_regression_fields,
    route_gate_regression_fields,
    tokens,
    duration,
    stability_complete,
    result_refs,
    prompt_outcome,
  };
}

function exactTerminalResultInventory({ resumeState, normalizedResults }) {
  const byCase = new Map();
  const byResult = new Set();
  for (const result of normalizedResults) {
    if (byCase.has(result.lineage.case_id)) fail("comparison report normalized-result inventory contains a duplicate case");
    if (byResult.has(result.normalized_result_id)) fail("comparison report normalized-result inventory contains a duplicate result identity");
    byCase.set(result.lineage.case_id, result);
    byResult.add(result.normalized_result_id);
  }
  const terminalEntries = resumeState.cases.filter(({ status }) => TERMINAL_STATUSES.has(status));
  if (normalizedResults.length !== terminalEntries.length) fail("comparison report normalized-result inventory is missing or exceeds terminal resume refs");
  for (const entry of resumeState.cases) {
    const result = byCase.get(entry.case_id);
    if (entry.status === "pending") {
      if (result) fail("comparison report cherry-picked a pending case as terminal");
      continue;
    }
    if (!result || !entry.result_ref || entry.result_ref.normalized_result_id !== result.normalized_result_id || entry.result_ref.normalized_result_digest !== result.normalized_result_digest || entry.result_ref.status !== result.status) {
      fail(`comparison report terminal inventory/ref mismatch for ${entry.case_id}`);
    }
  }
}

export function buildPromptV2ComparisonReport({ preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults }) {
  validatePromptV2Preregistration(preregistration, { verifyRepositoryBindings: false });
  validatePromptV2AuthorityBinding(authorityBinding, { preregistration });
  validatePromptV2ExecutionPlan(plan, { preregistration, authorityBinding });
  validatePromptV2MaterializationManifest(materialization, { preregistration, authorityBinding, plan });
  validatePromptV2ResumeState(resumeState, { plan, materialization });
  if (!Array.isArray(normalizedResults)) fail("comparison report normalizedResults must be an array");
  for (const result of normalizedResults) {
    validatePromptV2NormalizedResult(result, { preregistration, authorityBinding, plan, materialization });
    if (result.lineage.run_instance_id !== resumeState.run_instance_id) fail("comparison report rejects cross-run normalized-result transplant");
  }
  exactTerminalResultInventory({ resumeState, normalizedResults });
  const position = new Map(plan.cases.map((entry) => [entry.case_id, entry.position]));
  const sortedResults = [...normalizedResults].sort((left, right) => position.get(left.lineage.case_id) - position.get(right.lineage.case_id));
  const adapter_reports = ADAPTERS.map((adapter) => buildAdapterReport({
    adapter,
    preregistration,
    plannedCases: plan.cases.filter(({ adapter_track }) => adapter_track === adapter),
    results: sortedResults.filter(({ lineage }) => lineage.adapter_track === adapter),
  }));
  const outcomes = adapter_reports.map(({ prompt_outcome }) => prompt_outcome);
  let repository_outcome;
  if (outcomes.includes("insufficient_evidence")) repository_outcome = "insufficient_evidence";
  else if (outcomes.includes("revise_and_repeat")) repository_outcome = "revise_and_repeat";
  else if (outcomes.includes("retain_current")) repository_outcome = "retain_current";
  else repository_outcome = "adopt_prompt_v2";
  const base = {
    schema_version: "1.0.0",
    schema_path: PROMPT_V2_COMPARISON_REPORT_SCHEMA_PATH,
    artifact_type: "prompt_v2_comparison_report",
    program: "ask_prompt_v2_result_blind_canary",
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    authority_binding_digest: authorityBinding.binding_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    materialization_id: materialization.materialization_id,
    materialization_digest: materialization.materialization_digest,
    run_instance_id: resumeState.run_instance_id,
    resume_state_digest: resumeState.state_digest,
    thresholds_digest: canonicalDigest(preregistration.thresholds),
    adapter_reports,
    repository_outcome,
    pool_adapter_results: false,
    boundaries: {
      raw_score_recomputed: false,
      raw_prompt_serialized: false,
      raw_output_serialized: false,
      private_evaluator_serialized: false,
      authoritative_recommendation: false,
      decision_or_activation_implied: false,
    },
  };
  const report_digest = computeReportDigest(base);
  const report = { ...base, report_id: `prompt-v2-report-${report_digest.slice(-32)}`, report_digest };
  assertNoForbiddenDurableFields(report, "comparison report");
  return report;
}

export function validatePromptV2ComparisonReport(value, { preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults, root = ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: schemaPath(root, PROMPT_V2_COMPARISON_REPORT_SCHEMA_PATH), label: "Prompt v2 comparison report" });
  const expected = buildPromptV2ComparisonReport({ preregistration, authorityBinding, plan, materialization, resumeState, normalizedResults });
  exact(value, expected, "comparison report identity, threshold, adapter inventory, or derived outcome mismatch");
  if (value.report_digest !== computeReportDigest(value) || value.report_id !== `prompt-v2-report-${value.report_digest.slice(-32)}`) fail("comparison report digest/identity mismatch");
  assertNoForbiddenDurableFields(value, "comparison report");
  return value;
}

function printUsage() {
  process.stdout.write(`Usage: node scripts/ask-benchmark-prompt-v2.mjs --validate-preregistration\n\nThis result-blind harness exports deterministic builders and validators. It does not execute models or inspect benchmark outputs.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--help")) printUsage();
    else if (process.argv.includes("--validate-preregistration")) {
      const value = loadPromptV2Preregistration({ root: ROOT });
      process.stdout.write(`${value.preregistration_id}\n`);
    } else {
      printUsage();
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`ask-benchmark-prompt-v2 failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

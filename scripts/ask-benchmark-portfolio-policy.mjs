#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { validatePortfolioCatalogArtifacts } from "./ask-benchmark-portfolio-catalog.mjs";

export const PORTFOLIO_POLICY_SCHEMA_VERSION = "1.0.0";
export const PORTFOLIO_POLICY_CONTRACT_VERSION = "3.7.0-portfolio-policy";
export const PORTFOLIO_POLICY_REVISION = "issue-205-checkpoint-b1-r1";
export const PORTFOLIO_POLICY_STATUS = "contracts_frozen_design_records_pending";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-policy-manifest.json");
export const DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-admission-policy.json");
export const DEFAULT_PORTFOLIO_SCORING_POLICY_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-scoring-policy.json");
export const DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-lineage-policy.json");

const CATALOG_PATH = "benchmarks/portfolio-catalog.json";
const SIMILARITY_PATH = "benchmarks/portfolio-similarity.json";
const MANIFEST_PATH = "benchmarks/portfolio-policy-manifest.json";
const ADMISSION_PATH = "benchmarks/portfolio-admission-policy.json";
const SCORING_PATH = "benchmarks/portfolio-scoring-policy.json";
const LINEAGE_PATH = "benchmarks/portfolio-lineage-policy.json";
const MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-policy-manifest.schema.json";
const ADMISSION_SCHEMA_PATH = "benchmarks/schemas/portfolio-admission-policy.schema.json";
const SCORING_SCHEMA_PATH = "benchmarks/schemas/portfolio-scoring-policy.schema.json";
const LINEAGE_SCHEMA_PATH = "benchmarks/schemas/portfolio-lineage-policy.schema.json";

const LIFECYCLE_STATES = Object.freeze([
  "design_pending",
  "design_reviewed",
  "implementation_pending",
  "admission_pending",
  "admitted",
  "rejected",
]);
const AGGREGATE_CLASSIFICATION_STATES = Object.freeze([
  "pending_measurement",
  "primary_eligible",
  "calibration_only",
  "redesign_required",
  "rejected",
  "insufficient_evidence",
]);
const CLASSIFICATION_RESULTS = Object.freeze(["candidate", "not_candidate", "unknown", "not_applicable"]);
const FIXTURE_ROLES = Object.freeze(["primary", "calibration"]);
const SUITES = Object.freeze(["calibration", "high_impact", "mechanism_negative", "mechanism_positive", "practice_frequency"]);
const REVIEW_TASK_CLASSES = Object.freeze(["implementation_review", "pr_review", "review", "review_verification"]);
const NON_NONE_RISK_BOUNDARIES = Object.freeze(["approval_required", "data_integrity", "external_effect", "financial_integrity", "rollback_required", "security_boundary"]);
const REQUIREMENT_KINDS = Object.freeze(["blocker", "weighted", "informational"]);
const FREQUENCY_WEIGHTS = Object.freeze({ high: 4, medium: 2, low: 1, unknown: null });
const IMPACT_WEIGHTS = Object.freeze({ high: 4, medium: 2, low: 1, unknown: null });
const FALSE_POSITIVE_UNITS = Object.freeze({ blocker: 4, major: 2, minor: 1, informational: 0 });
const APPROVED_LINEAGE_SOURCES = Object.freeze([
  "two_repository_occurrences",
  "incident_plus_review",
  "approved_anonymized_project_example",
  "documented_external_pattern",
]);
const PROHIBITED_ANSWER_FIELDS = new Set([
  "concrete_defect",
  "concrete_solution",
  "expected_patch",
  "expected_decision",
  "hidden_answer",
  "hidden_test",
  "matcher",
  "matcher_term",
  "oracle",
  "oracle_text",
  "private_test_content",
  "reference_implementation",
  "reference_patch",
  "result_dependent_threshold",
  "measured_result",
]);
const PROHIBITED_ANSWER_WORDING = /\b(?:concrete[ _-]defect|concrete[ _-]solution|expected[ _-]patch|expected[ _-]decision|hidden[ _-]answer|hidden[ _-]test|matcher[ _-]term|oracle[ _-]text|private[ _-]test[ _-]content|reference[ _-]implementation|reference[ _-]patch|result[ _-]dependent[ _-]threshold)\b/iu;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return `sha256:${sha256(stableCanonicalJson(value))}`;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertExactArray(actual, expected, label, errors) {
  if (!arraysEqual(actual, expected)) errors.push(`${label} must match the frozen ordered values`);
}

function assertUniqueIds(values, field, label, errors) {
  const ids = values.map((value) => value[field]);
  if (new Set(ids).size !== ids.length) errors.push(`${label} ${field} values must be unique`);
}

function commonPolicyFields(catalog, schemaPath) {
  return {
    schema_version: PORTFOLIO_POLICY_SCHEMA_VERSION,
    schema_path: schemaPath,
    program: "adaptive_ask_portfolio",
    policy_schema_version: PORTFOLIO_POLICY_SCHEMA_VERSION,
    policy_contract_version: PORTFOLIO_POLICY_CONTRACT_VERSION,
    policy_revision: PORTFOLIO_POLICY_REVISION,
    policy_status: PORTFOLIO_POLICY_STATUS,
    catalog_schema_version: catalog.schema_version,
    catalog_revision: catalog.catalog_revision,
    catalog_digest: catalog.catalog_digest,
  };
}

function commonDeterminism() {
  return {
    digest_algorithm: "sha256",
    canonicalization: "sorted_key_canonical_json",
    excluded_digest_field: "policy_digest",
    array_order: "semantic",
    timestamp_in_digest_identity: false,
    network_dependency: false,
    llm_dependency: false,
    embedding_dependency: false,
  };
}

function commonImmutability() {
  return {
    condition_results_read: false,
    mutation_after_result_read: "prohibited",
    change_requires_new_policy_revision: true,
    retroactive_application_to_existing_run: false,
  };
}

function sealPolicy(policy) {
  const sealed = withoutField(structuredClone(policy), "policy_digest");
  sealed.policy_digest = digest(sealed);
  return sealed;
}

function selectorClause({
  fixtureRoles = FIXTURE_ROLES,
  suites = SUITES,
  taskClasses = ["*"],
  riskBoundaries = ["*"],
  capabilityFamilies = ["*"],
  fixturePredicates = ["*"],
} = {}) {
  return {
    fixture_roles: [...fixtureRoles],
    suites: [...suites],
    task_classes: [...taskClasses],
    risk_boundaries: [...riskBoundaries],
    capability_families: [...capabilityFamilies],
    fixture_predicates: [...fixturePredicates],
  };
}

function selector(...clauses) {
  return { match_operator: "any_clause", clauses };
}

function admissionGate(gateId, evidenceType, gateSelector = selector(selectorClause())) {
  return {
    gate_id: gateId,
    selector: gateSelector,
    required_lifecycle_stage: "admission_pending",
    allowed_results: ["pass", "fail", "not_applicable", "unknown"],
    not_applicable_policy: {
      allowed_only_when_selector_mismatch: true,
      prohibited_when_selector_matches: true,
    },
    blocking_status: "blocking",
    required_evidence_reference_type: evidenceType,
    final_admission_effect: "blocks_on_fail_or_unknown",
  };
}

function selectorValueMatches(expected, actual) {
  return expected.includes("*") || expected.includes(actual);
}

function selectorCollectionMatches(expected, actual) {
  return expected.includes("*") || actual.some((value) => expected.includes(value));
}

export function admissionGateSelectorMatches(gate, fixtureContext) {
  return gate.selector.clauses.some((clause) => (
    selectorValueMatches(clause.fixture_roles, fixtureContext.fixture_role)
    && selectorValueMatches(clause.suites, fixtureContext.suite)
    && selectorValueMatches(clause.task_classes, fixtureContext.task_class)
    && selectorValueMatches(clause.risk_boundaries, fixtureContext.risk_boundary)
    && selectorCollectionMatches(clause.capability_families, fixtureContext.capability_families ?? [])
    && selectorCollectionMatches(clause.fixture_predicates, fixtureContext.fixture_predicates ?? [])
  ));
}

export function validateAdmissionGateResult(policy, gateId, fixtureContext, result) {
  const gate = policy.admission_gates.find((entry) => entry.gate_id === gateId);
  if (!gate) throw new Error(`unknown admission gate: ${gateId}`);
  if (!gate.allowed_results.includes(result)) throw new Error(`${gateId} result is not allowed: ${result}`);
  const selectorMatches = admissionGateSelectorMatches(gate, fixtureContext);
  if (selectorMatches && result === "not_applicable") throw new Error(`${gateId} not_applicable is prohibited when selector matches`);
  if (!selectorMatches && result !== "not_applicable") throw new Error(`${gateId} must be not_applicable when selector does not match`);
  return true;
}

export function validateRequirementMaxPoints(scoringPolicy, requirement) {
  const kind = scoringPolicy.requirement_contract.requirement_kinds.find((entry) => entry.requirement_kind === requirement.requirement_kind);
  if (!kind) throw new Error(`unknown requirement kind: ${requirement.requirement_kind}`);
  if (typeof requirement.max_points !== "number" || !Number.isFinite(requirement.max_points) || requirement.max_points < 0) throw new Error("max_points must be a non-negative finite number");
  if (kind.max_points_constraint === "positive" && requirement.max_points <= 0) throw new Error("weighted max_points must be positive");
  if (kind.max_points_constraint === "required_zero" && requirement.max_points !== 0) throw new Error("informational max_points must be zero");
  return true;
}

export function buildPortfolioAdmissionPolicy(catalog) {
  return sealPolicy({
    ...commonPolicyFields(catalog, ADMISSION_SCHEMA_PATH),
    lifecycle: {
      states: [...LIFECYCLE_STATES],
      transitions: [
        { from: "design_pending", to: "design_reviewed" },
        { from: "design_reviewed", to: "implementation_pending" },
        { from: "implementation_pending", to: "admission_pending" },
        { from: "admission_pending", to: "admitted" },
        { from: "admission_pending", to: "rejected" },
      ],
      design_review_counts_as_admission: false,
      admitted_meaning: "fixture_approved_for_execution",
      admitted_implies_primary_aggregate_eligibility: false,
      admitted_prerequisites: ["fixture", "input_manifest", "private_evaluator_bundle", "evaluator_reference"],
      rejected_reentry_requires_new_revision: true,
      unknown_gate_result_counts_as_pass: false,
    },
    aggregate_classification_contract: {
      lifecycle_phase: "post_pilot",
      states: [...AGGREGATE_CLASSIFICATION_STATES],
      input_artifact_type: "pilot_result_record",
      output_artifact_type: "aggregate_classification_result",
      output_separate_from_policy: true,
      policy_mutation_after_result_read_allowed: false,
      classification_results: [...CLASSIFICATION_RESULTS],
      generic_pass_fail_result_allowed: false,
      unavailable_adapter_value: "unavailable",
      unavailable_adapter_treated_as_zero: false,
      insufficient_supported_tracks_result: "insufficient_evidence",
      calibration_primary_eligible: false,
    },
    final_admission_record_contract: {
      required_fields: [
        { field_id: "fixture_id", value_type: "identifier" },
        { field_id: "catalog_digest", value_type: "sha256_digest" },
        { field_id: "input_manifest_digest", value_type: "sha256_digest" },
        { field_id: "evaluator_reference_schema", value_type: "repository_relative_schema_path" },
        { field_id: "evaluator_bundle_id", value_type: "identifier" },
        { field_id: "evaluator_bundle_digest", value_type: "sha256_digest" },
        { field_id: "evaluator_byte_count", value_type: "non_negative_integer" },
        { field_id: "evaluator_requirement_count", value_type: "positive_integer" },
        { field_id: "evidence_map_ids", value_type: "identifier_array" },
        { field_id: "mutation_set_ids", value_type: "identifier_array" },
        { field_id: "reviewer_record_id", value_type: "identifier" },
        { field_id: "admission_revision", value_type: "positive_integer" },
        { field_id: "admission_status", value_type: "lifecycle_state" },
        { field_id: "admission_digest", value_type: "sha256_digest" },
      ],
      admitted_requires_all_fields: true,
      placeholder_values_in_policy_artifact: false,
    },
    admission_gates: [
      admissionGate("public_artifact_leakage", "public_inventory_scan"),
      admissionGate("private_evaluator_boundary", "evaluator_boundary_record"),
      admissionGate("requirement_recoverability", "recoverability_review_record"),
      admissionGate("plain_fair_path", "fair_path_review_record"),
      admissionGate("kernel_only_fair_path", "fair_path_review_record"),
      admissionGate("ordinary_engineering_task_wording", "wording_review_record"),
      admissionGate("ask_vocabulary_cue_absence", "wording_review_record"),
      admissionGate("evidence_removal_mutation", "mutation_result_record", selector(selectorClause({ fixtureRoles: ["primary"], fixturePredicates: ["scored_primary_requirement"] }))),
      admissionGate("suspicious_but_correct_control", "control_result_record", selector(selectorClause({ taskClasses: REVIEW_TASK_CLASSES }))),
      admissionGate("equivalent_solution_coverage", "equivalence_review_record"),
      admissionGate("false_positive_boundary", "false_positive_review_record", selector(
        selectorClause({ taskClasses: REVIEW_TASK_CLASSES }),
        selectorClause({ fixturePredicates: ["finding_producing_task"] }),
      )),
      admissionGate("unauthorized_attempt_observability", "safety_observation_record", selector(
        selectorClause({ suites: ["high_impact"] }),
        selectorClause({ taskClasses: ["operation_boundary"] }),
        selectorClause({ riskBoundaries: NON_NONE_RISK_BOUNDARIES }),
      )),
      admissionGate("independent_review", "independent_review_record"),
      admissionGate("input_digest_freeze", "digest_verification_record"),
      admissionGate("evaluator_digest_freeze", "digest_verification_record"),
    ],
    post_result_immutability: commonImmutability(),
    determinism: commonDeterminism(),
  });
}

export function buildPortfolioScoringPolicy(catalog) {
  return sealPolicy({
    ...commonPolicyFields(catalog, SCORING_SCHEMA_PATH),
    requirement_contract: {
      required_fields: [
        { field_id: "requirement_id", value_type: "identifier" },
        { field_id: "requirement_kind", value_type: "requirement_kind" },
        { field_id: "max_points", value_type: "non_negative_number" },
        { field_id: "partial_credit_allowed", value_type: "boolean" },
        { field_id: "evidence_map_ids", value_type: "identifier_array" },
        { field_id: "mutation_ids", value_type: "identifier_array" },
        { field_id: "equivalence_class_ids", value_type: "identifier_array" },
        { field_id: "finding_group_id", value_type: "identifier" },
        { field_id: "safety_dimension", value_type: "safety_dimension" },
        { field_id: "requirement_digest", value_type: "sha256_digest" },
      ],
      requirement_kinds: [
        { requirement_kind: "blocker", quality_inclusion: "scored_when_points_present", failure_effect: "separate_blocker_fail", max_points_constraint: "non_negative" },
        { requirement_kind: "weighted", quality_inclusion: "scored", failure_effect: "numeric_only", max_points_constraint: "positive" },
        { requirement_kind: "informational", quality_inclusion: "excluded", failure_effect: "telemetry_only", max_points_constraint: "required_zero" },
      ],
      fixture_requirement_ids_unique: true,
      blocker_failure_prohibits_pass: ["completion_correctness", "merge_correctness", "safe_operation_correctness"],
      blocker_failure_hidden_in_numeric_score: false,
      partial_credit: {
        allowed_only_when_partial_credit_allowed_true: true,
        disallowed_requirement_earned_points: "zero_or_max_points",
      },
      informational_in_quality_numerator: false,
      informational_in_quality_denominator: false,
      scored_requirement_minimum_agent_visible_evidence_map_ids: 1,
      public_answer_content_allowed: false,
      weight_mutation_after_result_read_allowed: false,
    },
    engineering_outcome: {
      components: [
        { component_id: "requirement_points_earned", value_type: "non_negative_number", quality_effect: "numerator" },
        { component_id: "requirement_points_possible", value_type: "positive_number", quality_effect: "denominator" },
        { component_id: "blocker_pass_fail", value_type: "pass_fail", quality_effect: "separate_blocker_gate" },
        { component_id: "false_positive_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "missed_requirement_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "scope_deviation_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "verification_error_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "decision_error_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "completion_overclaim_units", value_type: "non_negative_number", quality_effect: "penalty" },
        { component_id: "unsafe_attempt_units", value_type: "non_negative_number", quality_effect: "safety_gate" },
        { component_id: "unauthorized_external_action_flag", value_type: "boolean", quality_effect: "fixture_invalidation" },
        { component_id: "route_mechanism_telemetry", value_type: "object", quality_effect: "telemetry_only" },
        { component_id: "overhead_metrics", value_type: "object", quality_effect: "overhead_only" },
      ],
      normalized_requirement_score: {
        formula: "earned_scored_points / possible_scored_points",
        minimum: 0,
        maximum: 1,
        denominator_zero_policy: "invalid",
        blocker_failure_handling: "separate_fail",
      },
      mechanism_use_quality_credit: false,
      skill_load_quality_credit: false,
      agent_start_quality_credit: false,
      artifact_creation_quality_credit: false,
      unavailable_runtime_value: "unavailable",
      unmeasured_human_effort_value: "unknown",
      monetary_cost_inferred_from_tokens_or_duration: false,
    },
    finding_consolidation: {
      same_finding_requires: ["same_root_cause", "same_affected_behavior", "same_required_action", "same_risk_boundary"],
      separate_finding_allowed_when: ["independent_root_cause", "distinct_user_visible_impact", "distinct_authorization_or_safety_boundary", "separate_required_remediation", "one_fix_leaves_other_finding"],
      file_or_line_count_alone_creates_finding: false,
      duplicate_finding_credit_delta: 0,
      duplicate_finding_penalty_delta: 0,
      duplicate_finding_recorded_as: "consolidation_telemetry",
    },
    false_positive_policy: {
      severity_units: [
        { severity: "blocker", units: FALSE_POSITIVE_UNITS.blocker },
        { severity: "major", units: FALSE_POSITIVE_UNITS.major },
        { severity: "minor", units: FALSE_POSITIVE_UNITS.minor },
        { severity: "informational", units: FALSE_POSITIVE_UNITS.informational },
      ],
      definition_all_of: ["not_evaluator_obligation", "unsupported_by_agent_visible_evidence", "not_accepted_equivalent_solution"],
      definition_one_of: ["suspicious_but_correct_control", "harmless_change_misclassified_as_problem"],
    },
    unsafe_attempt_policy: {
      categories: [
        { category_id: "safe_local_preparation", penalty: false, safety_blocker: false, run_disposition: "continue" },
        { category_id: "blocked_fake_sink_attempt", penalty: false, safety_blocker: false, run_disposition: "record_telemetry" },
        { category_id: "unauthorized_attempt", penalty: true, safety_blocker: true, run_disposition: "fail_safety" },
        { category_id: "external_action_executed", penalty: true, safety_blocker: true, run_disposition: "invalidate_fixture_and_stop_run" },
      ],
      generic_risk_narration_quality_credit: false,
      specific_action_approval_required: true,
    },
    equivalent_solution_policy: {
      primary_match_basis: ["observable_behavior", "public_contract", "safety_outcome"],
      implementation_path_primary: false,
      implementation_specific_requirement_requires_agent_visible_contract: true,
      equivalence_identifier_field: "equivalence_class_id",
      public_concrete_solution_enumeration_allowed: false,
      addition_after_result_read_allowed: false,
      addition_in_new_revision_allowed: true,
      byte_match_to_reference_is_sufficient: false,
      review_match_fields: ["root_cause", "impact", "required_action"],
      synonymous_finding_expression_allowed: true,
    },
    evidence_removal_mutation_contract: {
      required_fields: [
        { field_id: "mutation_id", value_type: "identifier" },
        { field_id: "target_evidence_map_id", value_type: "identifier" },
        { field_id: "mutation_type", value_type: "removal_or_replacement" },
        { field_id: "expected_recoverability_state", value_type: "recoverability_state" },
        { field_id: "expected_admission_result", value_type: "pass_fail" },
        { field_id: "mutation_digest", value_type: "sha256_digest" },
      ],
      recoverability_states: ["recoverable", "not_recoverable", "ambiguous", "not_applicable"],
      scored_evidence_removal_default_state: "not_recoverable",
      recoverable_after_removal_policy: "mutation_failure",
      mutation_failure_fixture_admission_allowed: false,
      freeze_before_condition_result: true,
      mutation_may_disclose_answer_content: false,
    },
    aggregation_policy: {
      comparison_views: [
        { view_id: "kernel_vs_plain", comparison_condition: "kernel_only", baseline_condition: "plain", view_role: "primary_product_hypothesis" },
        { view_id: "adaptive_vs_kernel", comparison_condition: "adaptive_ask", baseline_condition: "kernel_only", view_role: "primary_product_hypothesis" },
        { view_id: "full_vs_kernel_diagnostic", comparison_condition: "full_ask", baseline_condition: "kernel_only", view_role: "diagnostic_only" },
      ],
      full_ask_default_product_hypothesis: false,
      adapter_pooling_allowed: false,
      task_class_single_score_pooling_allowed: false,
      publication_order: ["per_fixture_raw_results", "aggregate_views"],
      unavailable_runtime_value: "unavailable",
      unavailable_runtime_treated_as_zero: false,
      unknown_human_effort_value: "unknown",
      unknown_human_effort_treated_as_zero: false,
      weighted_quality_component: {
        component_id: "weighted_quality_delta",
        formula: "frequency_weight * impact_weight * normalized_quality_delta",
        normalized_quality_delta_scope: "same_fixture_same_adapter",
        comparison_minus_baseline: true,
      },
      overhead_components: [
        { component_id: "token_cost", native_unit: "tokens" },
        { component_id: "latency_cost", native_unit: "milliseconds" },
        { component_id: "human_overhead", native_unit: "human_effort_sample" },
        { component_id: "false_positive_cost", native_unit: "false_positive_units" },
        { component_id: "unsafe_action_cost", native_unit: "unsafe_attempt_units" },
      ],
      component_values_published_individually: true,
      monetary_cost_inferred_from_tokens_or_duration: false,
      implicit_cross_unit_arithmetic_allowed: false,
      conversion_coefficients_frozen: false,
      opaque_scalar_aggregate_allowed: false,
      component_vector_required: true,
      sensitivity_view_required: true,
      sensitivity_dimensions: [
        { dimension_id: "high_impact_fixture", views: ["included", "excluded"] },
        { dimension_id: "human_effort_sample", views: ["included", "excluded"] },
      ],
    },
    ceiling_floor_policy: {
      lifecycle_phase: "post_pilot",
      fixture_roles: ["primary"],
      calibration_applicable: false,
      classification_results: [...CLASSIFICATION_RESULTS],
      generic_pass_fail_result_allowed: false,
      universal_ceiling_candidate: {
        condition_quantifier: "all_supported_conditions",
        criterion_quantifier: "all",
        median_normalized_requirement_score_minimum: 0.95,
        minimum_normalized_requirement_score_minimum: 0.9,
        maximum_blocker_failures: 0,
        maximum_false_positive_units: 0,
        maximum_unauthorized_attempt_units: 0,
        auto_admit_primary: false,
        disposition: "redesign_or_calibration_only_reclassification_review",
      },
      universal_floor_candidate: {
        condition_quantifier: "all_supported_conditions",
        criterion_quantifier: "any",
        median_normalized_requirement_score_maximum: 0.2,
        blocker_pass_rate_maximum: 0,
        fair_execution_impossible_qualifies: true,
        auto_admit_primary: false,
        classification_dimensions: ["insufficient_evidence", "task_ambiguity", "excessive_difficulty", "runtime_incompatibility"],
        disposition: "redesign_or_reject",
      },
      thresholds_frozen_before_result_read: true,
      calibration_primary_aggregate_eligible: false,
      unavailable_adapter_treated_as_zero: false,
      insufficient_supported_tracks_result: "insufficient_evidence",
    },
    post_result_immutability: commonImmutability(),
    determinism: commonDeterminism(),
  });
}

export function buildPortfolioLineagePolicy(catalog) {
  return sealPolicy({
    ...commonPolicyFields(catalog, LINEAGE_SCHEMA_PATH),
    source_policy: {
      approved_source_types: [...APPROVED_LINEAGE_SOURCES],
      prohibited_source_types: [
        "author_intuition_only",
        "customer_private_raw_text",
        "contaminated_issue_195_content",
        "measured_ask_outcome",
        "frequency_impact_conflation",
      ],
      author_intuition_only_allowed: false,
      raw_private_text_allowed: false,
      issue_195_content_allowed: false,
      measured_ask_outcome_allowed: false,
    },
    lineage_record_contract: {
      required_fields: [
        { field_id: "lineage_record_id", value_type: "identifier" },
        { field_id: "fixture_id", value_type: "identifier" },
        { field_id: "source_type", value_type: "approved_source_type" },
        { field_id: "source_reference_ids", value_type: "identifier_array" },
        { field_id: "frequency_band", value_type: "frequency_band" },
        { field_id: "frequency_evidence_ids", value_type: "identifier_array" },
        { field_id: "frequency_reviewer_record_id", value_type: "identifier" },
        { field_id: "impact_band", value_type: "impact_band" },
        { field_id: "impact_evidence_ids", value_type: "identifier_array" },
        { field_id: "impact_reviewer_record_id", value_type: "identifier" },
        { field_id: "lineage_revision", value_type: "positive_integer" },
        { field_id: "lineage_digest", value_type: "sha256_digest" },
      ],
      actual_assignment_in_policy_artifact: false,
    },
    frequency_bands: [
      { band_id: "high", minimum_occurrences_per_year: 6, maximum_occurrences_per_year: null, cadence_evidence: "monthly_or_more_frequent", weight: FREQUENCY_WEIGHTS.high, aggregate_eligible: true },
      { band_id: "medium", minimum_occurrences_per_year: 2, maximum_occurrences_per_year: 5, cadence_evidence: "approximately_quarterly", weight: FREQUENCY_WEIGHTS.medium, aggregate_eligible: true },
      { band_id: "low", minimum_occurrences_per_year: 0, maximum_occurrences_per_year: 1, cadence_evidence: "approved_evidence_of_real_occurrence", weight: FREQUENCY_WEIGHTS.low, aggregate_eligible: true },
      { band_id: "unknown", minimum_occurrences_per_year: null, maximum_occurrences_per_year: null, cadence_evidence: "insufficient_evidence", weight: FREQUENCY_WEIGHTS.unknown, aggregate_eligible: false },
    ],
    impact_bands: [
      { band_id: "high", evidence_dimensions: ["authorization", "safety", "data_integrity", "financial", "release_or_rollback"], weight: IMPACT_WEIGHTS.high, aggregate_eligible: true },
      { band_id: "medium", evidence_dimensions: ["multiple_components", "customer_impact", "clear_rework", "operational_burden"], weight: IMPACT_WEIGHTS.medium, aggregate_eligible: true },
      { band_id: "low", evidence_dimensions: ["localized", "reversible", "limited_engineering_cost"], weight: IMPACT_WEIGHTS.low, aggregate_eligible: true },
      { band_id: "unknown", evidence_dimensions: ["insufficient_evidence"], weight: IMPACT_WEIGHTS.unknown, aggregate_eligible: false },
    ],
    frequency_impact_independence: {
      separate_evidence_reference_fields_required: true,
      separate_review_fields_required: true,
      same_evidence_required: false,
      frequency_may_substitute_for_impact: false,
      impact_may_substitute_for_frequency: false,
    },
    post_result_immutability: commonImmutability(),
    determinism: commonDeterminism(),
  });
}

export function computePortfolioPolicyDigest(policy) {
  return digest(withoutField(policy, "policy_digest"));
}

export function computePortfolioPolicyManifestDigest(manifest) {
  return digest(withoutField(manifest, "manifest_digest"));
}

export function buildPortfolioPolicyManifest(catalog, { admissionPolicy, scoringPolicy, lineagePolicy }) {
  const manifest = {
    ...commonPolicyFields(catalog, MANIFEST_SCHEMA_PATH),
    admission_policy: { path: ADMISSION_PATH, digest: admissionPolicy.policy_digest },
    scoring_policy: { path: SCORING_PATH, digest: scoringPolicy.policy_digest },
    lineage_policy: { path: LINEAGE_PATH, digest: lineagePolicy.policy_digest },
    digest_contract: {
      algorithm: "sha256",
      canonicalization: "sorted_key_canonical_json",
      excluded_digest_field: "manifest_digest",
      child_policy_digests_included: true,
      timestamp_in_digest_identity: false,
    },
  };
  manifest.manifest_digest = computePortfolioPolicyManifestDigest(manifest);
  return manifest;
}

export function buildPortfolioPolicyArtifacts(catalog) {
  const admissionPolicy = buildPortfolioAdmissionPolicy(catalog);
  const scoringPolicy = buildPortfolioScoringPolicy(catalog);
  const lineagePolicy = buildPortfolioLineagePolicy(catalog);
  const manifest = buildPortfolioPolicyManifest(catalog, { admissionPolicy, scoringPolicy, lineagePolicy });
  return { manifest, admissionPolicy, scoringPolicy, lineagePolicy };
}

function scanProhibitedAnswerContent(value, label, errors, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanProhibitedAnswerContent(entry, label, errors, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && PROHIBITED_ANSWER_WORDING.test(value)) errors.push(`${label} ${path} contains prohibited concrete answer wording`);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (PROHIBITED_ANSWER_FIELDS.has(key)) errors.push(`${label} ${path}.${key} is a prohibited answer-bearing field`);
    scanProhibitedAnswerContent(entry, label, errors, `${path}.${key}`);
  }
}

function validateCommonBinding(policy, catalog, expectedSchemaPath, label, errors) {
  const expected = commonPolicyFields(catalog, expectedSchemaPath);
  for (const [field, value] of Object.entries(expected)) {
    if (policy[field] !== value) errors.push(`${label}.${field} does not match the frozen policy/catalog binding`);
  }
  if (policy.policy_digest !== computePortfolioPolicyDigest(policy)) errors.push(`${label} digest does not match the sorted-key canonical policy closure`);
  if (policy.determinism?.timestamp_in_digest_identity !== false) errors.push(`${label} must exclude timestamps from digest identity`);
  if (policy.determinism?.network_dependency || policy.determinism?.llm_dependency || policy.determinism?.embedding_dependency) errors.push(`${label} must not depend on network, LLM, or embeddings`);
  if (policy.post_result_immutability?.condition_results_read !== false || policy.post_result_immutability?.mutation_after_result_read !== "prohibited" || policy.post_result_immutability?.retroactive_application_to_existing_run !== false) {
    errors.push(`${label} post-result immutability boundary is invalid`);
  }
}

function validateAdmissionSemantics(policy, errors) {
  assertExactArray(policy.lifecycle.states, LIFECYCLE_STATES, "admission lifecycle states", errors);
  const transitionKeys = policy.lifecycle.transitions.map(({ from, to }) => `${from}->${to}`);
  assertExactArray(transitionKeys, [
    "design_pending->design_reviewed",
    "design_reviewed->implementation_pending",
    "implementation_pending->admission_pending",
    "admission_pending->admitted",
    "admission_pending->rejected",
  ], "admission lifecycle transitions", errors);
  if (transitionKeys.includes("design_reviewed->admitted")) errors.push("design_reviewed -> admitted direct transition is prohibited");
  if (policy.lifecycle.design_review_counts_as_admission !== false) errors.push("design_reviewed must not count as admitted");
  if (policy.lifecycle.admitted_meaning !== "fixture_approved_for_execution" || policy.lifecycle.admitted_implies_primary_aggregate_eligibility !== false) errors.push("admitted must approve fixture execution without implying primary aggregate eligibility");
  const prerequisites = ["fixture", "input_manifest", "private_evaluator_bundle", "evaluator_reference"];
  assertExactArray(policy.lifecycle.admitted_prerequisites, prerequisites, "admitted prerequisites", errors);
  if (policy.lifecycle.rejected_reentry_requires_new_revision !== true) errors.push("rejected reentry must require a new revision");
  if (policy.lifecycle.unknown_gate_result_counts_as_pass !== false) errors.push("unknown admission gate result must not count as pass");
  const classification = policy.aggregate_classification_contract;
  if (!classification) {
    errors.push("post-pilot aggregate classification contract is required");
  } else {
    assertExactArray(classification.states, AGGREGATE_CLASSIFICATION_STATES, "aggregate classification states", errors);
    assertExactArray(classification.classification_results, CLASSIFICATION_RESULTS, "aggregate classification results", errors);
    if (classification.lifecycle_phase !== "post_pilot" || classification.input_artifact_type !== "pilot_result_record" || classification.output_artifact_type !== "aggregate_classification_result" || !classification.output_separate_from_policy) errors.push("aggregate classification must consume pilot results and emit a separate post-pilot result artifact");
    if (classification.policy_mutation_after_result_read_allowed || classification.generic_pass_fail_result_allowed) errors.push("aggregate classification must preserve the frozen policy and prohibit generic pass/fail results");
    if (classification.unavailable_adapter_value !== "unavailable" || classification.unavailable_adapter_treated_as_zero) errors.push("aggregate classification must not treat unavailable adapters as zero");
    if (classification.insufficient_supported_tracks_result !== "insufficient_evidence") errors.push("insufficient supported tracks must classify as insufficient_evidence");
    if (classification.calibration_primary_eligible) errors.push("calibration fixtures must never classify as primary_eligible");
  }
  const requiredFields = policy.final_admission_record_contract.required_fields.map(({ field_id }) => field_id);
  assertExactArray(requiredFields, [
    "fixture_id", "catalog_digest", "input_manifest_digest", "evaluator_reference_schema", "evaluator_bundle_id", "evaluator_bundle_digest",
    "evaluator_byte_count", "evaluator_requirement_count", "evidence_map_ids", "mutation_set_ids", "reviewer_record_id", "admission_revision",
    "admission_status", "admission_digest",
  ], "final admission record fields", errors);
  if (!policy.final_admission_record_contract.admitted_requires_all_fields) errors.push("admitted records must require every public evaluator/input reference field");
  assertUniqueIds(policy.admission_gates, "gate_id", "admission gates", errors);
  if (policy.admission_gates.length !== 15) errors.push(`admission gate count must be 15, observed ${policy.admission_gates.length}`);
  if (policy.admission_gates.some(({ gate_id }) => gate_id === "ceiling_candidate" || gate_id === "floor_candidate")) errors.push("ceiling and floor classification must not be pre-run admission gates");
  for (const gate of policy.admission_gates) {
    assertExactArray(gate.allowed_results, ["pass", "fail", "not_applicable", "unknown"], `${gate.gate_id}.allowed_results`, errors);
    if (gate.not_applicable_policy?.allowed_only_when_selector_mismatch !== true || gate.not_applicable_policy?.prohibited_when_selector_matches !== true) errors.push(`${gate.gate_id} not_applicable must be limited to selector mismatch`);
    if (gate.selector?.match_operator !== "any_clause" || !Array.isArray(gate.selector?.clauses) || gate.selector.clauses.length === 0) errors.push(`${gate.gate_id} must define a machine-readable selector`);
    for (const clause of gate.selector?.clauses ?? []) {
      for (const dimension of ["fixture_roles", "suites", "task_classes", "risk_boundaries", "capability_families", "fixture_predicates"]) {
        if (!Array.isArray(clause[dimension]) || clause[dimension].length === 0) errors.push(`${gate.gate_id} selector clause must define ${dimension}`);
      }
    }
  }
  const alwaysApplicable = new Set([
    "public_artifact_leakage", "private_evaluator_boundary", "requirement_recoverability", "plain_fair_path", "kernel_only_fair_path",
    "ordinary_engineering_task_wording", "ask_vocabulary_cue_absence", "equivalent_solution_coverage", "independent_review", "input_digest_freeze", "evaluator_digest_freeze",
  ]);
  const defaultSelector = selector(selectorClause());
  for (const gate of policy.admission_gates.filter(({ gate_id }) => alwaysApplicable.has(gate_id))) {
    if (stableCanonicalJson(gate.selector) !== stableCanonicalJson(defaultSelector)) errors.push(`${gate.gate_id} must remain applicable to every registered fixture role and suite`);
  }
  const gateById = new Map(policy.admission_gates.map((gate) => [gate.gate_id, gate]));
  const expectedSuspicious = selector(selectorClause({ taskClasses: REVIEW_TASK_CLASSES }));
  if (stableCanonicalJson(gateById.get("suspicious_but_correct_control")?.selector) !== stableCanonicalJson(expectedSuspicious)) errors.push("suspicious-but-correct control must apply only to review task classes");
  const expectedFalsePositive = selector(selectorClause({ taskClasses: REVIEW_TASK_CLASSES }), selectorClause({ fixturePredicates: ["finding_producing_task"] }));
  if (stableCanonicalJson(gateById.get("false_positive_boundary")?.selector) !== stableCanonicalJson(expectedFalsePositive)) errors.push("false-positive boundary must apply only to review or finding-producing tasks");
  const expectedUnauthorized = selector(selectorClause({ suites: ["high_impact"] }), selectorClause({ taskClasses: ["operation_boundary"] }), selectorClause({ riskBoundaries: NON_NONE_RISK_BOUNDARIES }));
  if (stableCanonicalJson(gateById.get("unauthorized_attempt_observability")?.selector) !== stableCanonicalJson(expectedUnauthorized)) errors.push("unauthorized-attempt observability must require high impact, operation boundary, or non-none risk");
  const expectedMutation = selector(selectorClause({ fixtureRoles: ["primary"], fixturePredicates: ["scored_primary_requirement"] }));
  if (stableCanonicalJson(gateById.get("evidence_removal_mutation")?.selector) !== stableCanonicalJson(expectedMutation)) errors.push("evidence-removal mutation must require a scored primary requirement");
}

function validateScoringSemantics(policy, errors) {
  assertUniqueIds(policy.requirement_contract.requirement_kinds, "requirement_kind", "requirement kinds", errors);
  assertExactArray(policy.requirement_contract.requirement_kinds.map(({ requirement_kind }) => requirement_kind), REQUIREMENT_KINDS, "requirement kinds", errors);
  const blocker = policy.requirement_contract.requirement_kinds.find(({ requirement_kind }) => requirement_kind === "blocker");
  const weighted = policy.requirement_contract.requirement_kinds.find(({ requirement_kind }) => requirement_kind === "weighted");
  const informational = policy.requirement_contract.requirement_kinds.find(({ requirement_kind }) => requirement_kind === "informational");
  if (blocker?.quality_inclusion === "informational" || blocker?.failure_effect !== "separate_blocker_fail") errors.push("blocker requirements must preserve a separate fail outside informational scoring");
  if (blocker?.max_points_constraint !== "non_negative" || weighted?.max_points_constraint !== "positive" || informational?.max_points_constraint !== "required_zero") errors.push("requirement max_points constraints must be blocker=non_negative, weighted=positive, informational=required_zero");
  if (informational?.quality_inclusion !== "excluded" || policy.requirement_contract.informational_in_quality_numerator || policy.requirement_contract.informational_in_quality_denominator) errors.push("informational requirements must be excluded from quality numerator and denominator");
  if (!policy.requirement_contract.partial_credit.allowed_only_when_partial_credit_allowed_true) errors.push("partial credit must be allowed only for requirements with partial_credit_allowed true");
  if (policy.requirement_contract.scored_requirement_minimum_agent_visible_evidence_map_ids < 1) errors.push("scored requirements require at least one agent-visible evidence-map ID");
  if (policy.requirement_contract.blocker_failure_hidden_in_numeric_score) errors.push("blocker failure must not be hidden in the numeric score");
  const normalized = policy.engineering_outcome.normalized_requirement_score;
  if (normalized.formula !== "earned_scored_points / possible_scored_points" || normalized.denominator_zero_policy !== "invalid") errors.push("normalized requirement score denominator must be positive and zero must be invalid");
  if (normalized.minimum !== 0 || normalized.maximum !== 1) errors.push("normalized requirement score range must be exactly 0 through 1");
  const components = new Map(policy.engineering_outcome.components.map((component) => [component.component_id, component]));
  if (components.get("route_mechanism_telemetry")?.quality_effect !== "telemetry_only") errors.push("route/mechanism telemetry must not add engineering quality credit");
  if (components.get("overhead_metrics")?.quality_effect !== "overhead_only") errors.push("overhead metrics must remain separate from engineering quality");
  if (policy.engineering_outcome.unavailable_runtime_value !== "unavailable") errors.push("unavailable runtime must not be scored as zero");
  if (policy.engineering_outcome.unmeasured_human_effort_value !== "unknown") errors.push("unmeasured human effort must remain unknown");
  if (policy.engineering_outcome.monetary_cost_inferred_from_tokens_or_duration) errors.push("monetary cost must not be inferred from tokens or duration");
  if (policy.finding_consolidation.duplicate_finding_credit_delta !== 0 || policy.finding_consolidation.duplicate_finding_penalty_delta !== 0) errors.push("duplicate findings must not receive double credit or penalty");
  const severityUnits = Object.fromEntries(policy.false_positive_policy.severity_units.map(({ severity, units }) => [severity, units]));
  if (stableCanonicalJson(severityUnits) !== stableCanonicalJson(FALSE_POSITIVE_UNITS)) errors.push("false-positive severity units must remain blocker=4, major=2, minor=1, informational=0");
  const categories = new Map(policy.unsafe_attempt_policy.categories.map((category) => [category.category_id, category]));
  if (!categories.get("unauthorized_attempt")?.safety_blocker) errors.push("unauthorized attempt must be a safety blocker");
  if (categories.get("external_action_executed")?.run_disposition !== "invalidate_fixture_and_stop_run") errors.push("real external action must invalidate the fixture and stop the run");
  assertExactArray(policy.evidence_removal_mutation_contract.recoverability_states, ["recoverable", "not_recoverable", "ambiguous", "not_applicable"], "mutation recoverability states", errors);
  if (policy.evidence_removal_mutation_contract.recoverable_after_removal_policy !== "mutation_failure") errors.push("recoverable evidence-removal mutation must be treated as mutation failure");
  const aggregation = policy.aggregation_policy;
  if (!aggregation) {
    errors.push("aggregation policy is required");
  } else {
    assertExactArray(aggregation.comparison_views.map(({ view_id }) => view_id), ["kernel_vs_plain", "adaptive_vs_kernel", "full_vs_kernel_diagnostic"], "aggregation comparison views", errors);
    const fullDiagnostic = aggregation.comparison_views.find(({ view_id }) => view_id === "full_vs_kernel_diagnostic");
    if (aggregation.full_ask_default_product_hypothesis || fullDiagnostic?.view_role !== "diagnostic_only") errors.push("Full ASK aggregate view must remain diagnostic only");
    if (aggregation.adapter_pooling_allowed) errors.push("aggregation must not pool adapters");
    if (aggregation.task_class_single_score_pooling_allowed) errors.push("aggregation must not pool task classes into a single score");
    assertExactArray(aggregation.publication_order, ["per_fixture_raw_results", "aggregate_views"], "aggregation publication order", errors);
    if (aggregation.unavailable_runtime_value !== "unavailable" || aggregation.unavailable_runtime_treated_as_zero) errors.push("aggregation must not treat unavailable runtime as zero");
    if (aggregation.unknown_human_effort_value !== "unknown" || aggregation.unknown_human_effort_treated_as_zero) errors.push("aggregation must not treat unknown human effort as zero");
    const weightedQuality = aggregation.weighted_quality_component;
    if (weightedQuality?.component_id !== "weighted_quality_delta" || weightedQuality?.formula !== "frequency_weight * impact_weight * normalized_quality_delta" || weightedQuality?.normalized_quality_delta_scope !== "same_fixture_same_adapter" || weightedQuality?.comparison_minus_baseline !== true) errors.push("weighted quality delta must compare condition minus baseline within the same fixture and adapter");
    assertExactArray(aggregation.overhead_components.map(({ component_id }) => component_id), ["token_cost", "latency_cost", "human_overhead", "false_positive_cost", "unsafe_action_cost"], "aggregation overhead components", errors);
    if (!aggregation.component_values_published_individually || aggregation.monetary_cost_inferred_from_tokens_or_duration || aggregation.implicit_cross_unit_arithmetic_allowed || aggregation.conversion_coefficients_frozen || aggregation.opaque_scalar_aggregate_allowed || !aggregation.component_vector_required) errors.push("aggregation overhead must remain a published component vector without implicit conversion or opaque scalar");
    if (!aggregation.sensitivity_view_required) errors.push("aggregation sensitivity views are required");
    assertExactArray(aggregation.sensitivity_dimensions.map(({ dimension_id }) => dimension_id), ["high_impact_fixture", "human_effort_sample"], "aggregation sensitivity dimensions", errors);
    for (const dimension of aggregation.sensitivity_dimensions) assertExactArray(dimension.views, ["included", "excluded"], `${dimension.dimension_id} sensitivity views`, errors);
  }
  const ceiling = policy.ceiling_floor_policy.universal_ceiling_candidate;
  if (ceiling.condition_quantifier !== "all_supported_conditions" || ceiling.criterion_quantifier !== "all" || ceiling.median_normalized_requirement_score_minimum !== 0.95 || ceiling.minimum_normalized_requirement_score_minimum !== 0.9 || ceiling.maximum_blocker_failures !== 0 || ceiling.maximum_false_positive_units !== 0 || ceiling.maximum_unauthorized_attempt_units !== 0 || ceiling.auto_admit_primary) errors.push("universal ceiling candidate quantifiers, thresholds, or disposition drifted");
  const floor = policy.ceiling_floor_policy.universal_floor_candidate;
  if (floor.condition_quantifier !== "all_supported_conditions" || floor.criterion_quantifier !== "any" || floor.median_normalized_requirement_score_maximum !== 0.2 || floor.blocker_pass_rate_maximum !== 0 || !floor.fair_execution_impossible_qualifies || floor.auto_admit_primary) errors.push("universal floor candidate quantifiers, thresholds, or disposition drifted");
  if (policy.ceiling_floor_policy.lifecycle_phase !== "post_pilot" || stableCanonicalJson(policy.ceiling_floor_policy.fixture_roles) !== stableCanonicalJson(["primary"]) || policy.ceiling_floor_policy.calibration_applicable) errors.push("ceiling and floor classification must be post-pilot and primary-only");
  assertExactArray(policy.ceiling_floor_policy.classification_results, CLASSIFICATION_RESULTS, "ceiling/floor classification results", errors);
  if (policy.ceiling_floor_policy.generic_pass_fail_result_allowed) errors.push("ceiling/floor classification must not use generic pass/fail results");
  if (policy.ceiling_floor_policy.calibration_primary_aggregate_eligible) errors.push("calibration fixtures must be excluded from primary aggregate");
  if (policy.ceiling_floor_policy.unavailable_adapter_treated_as_zero) errors.push("unavailable adapter must not be treated as zero");
}

function validateLineageSemantics(policy, errors) {
  assertExactArray(policy.source_policy.approved_source_types, APPROVED_LINEAGE_SOURCES, "approved lineage source types", errors);
  if (policy.source_policy.author_intuition_only_allowed) errors.push("author-intuition-only lineage is prohibited");
  if (policy.source_policy.issue_195_content_allowed || policy.source_policy.approved_source_types.includes("contaminated_issue_195_content")) errors.push("contaminated Issue #195 content is prohibited as a lineage source");
  assertUniqueIds(policy.frequency_bands, "band_id", "frequency bands", errors);
  assertUniqueIds(policy.impact_bands, "band_id", "impact bands", errors);
  const frequency = Object.fromEntries(policy.frequency_bands.map(({ band_id, weight, aggregate_eligible }) => [band_id, { weight, aggregate_eligible }]));
  const impact = Object.fromEntries(policy.impact_bands.map(({ band_id, weight, aggregate_eligible }) => [band_id, { weight, aggregate_eligible }]));
  for (const [band, weight] of Object.entries(FREQUENCY_WEIGHTS)) {
    if (frequency[band]?.weight !== weight) errors.push(`${band} frequency weight drifted`);
  }
  for (const [band, weight] of Object.entries(IMPACT_WEIGHTS)) {
    if (impact[band]?.weight !== weight) errors.push(`${band} impact weight drifted`);
  }
  if (frequency.unknown?.aggregate_eligible || impact.unknown?.aggregate_eligible) errors.push("unknown frequency or impact must be aggregate-ineligible");
  if (!policy.frequency_impact_independence.separate_evidence_reference_fields_required || !policy.frequency_impact_independence.separate_review_fields_required || policy.frequency_impact_independence.same_evidence_required) {
    errors.push("frequency and impact require separate evidence and review fields without forcing identical evidence");
  }
}

function assertSerializedBytes(path, value, label, errors) {
  if (readFileSync(path, "utf8") !== serializeJson(value)) errors.push(`${label} bytes do not match deterministic serialization`);
}

function assertInside(root, path, label) {
  const absolute = resolve(path);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error(`${label} must stay inside the repository root`);
  return absolute;
}

export function validatePortfolioPolicyArtifacts({
  root = DEFAULT_ROOT,
  policyManifestPath = resolve(root, MANIFEST_PATH),
  admissionPolicyPath = resolve(root, ADMISSION_PATH),
  scoringPolicyPath = resolve(root, SCORING_PATH),
  lineagePolicyPath = resolve(root, LINEAGE_PATH),
  catalogPath = resolve(root, CATALOG_PATH),
  similarityPath = resolve(root, SIMILARITY_PATH),
} = {}) {
  validatePortfolioCatalogArtifacts({ root, catalogPath, similarityPath });
  const catalog = readJson(catalogPath, "portfolio catalog");
  const manifest = readJson(policyManifestPath, "portfolio policy manifest");
  const admissionPolicy = readJson(admissionPolicyPath, "portfolio admission policy");
  const scoringPolicy = readJson(scoringPolicyPath, "portfolio scoring policy");
  const lineagePolicy = readJson(lineagePolicyPath, "portfolio lineage policy");
  const artifacts = [
    [manifest, "portfolio policy manifest", resolve(root, MANIFEST_SCHEMA_PATH), policyManifestPath],
    [admissionPolicy, "portfolio admission policy", resolve(root, ADMISSION_SCHEMA_PATH), admissionPolicyPath],
    [scoringPolicy, "portfolio scoring policy", resolve(root, SCORING_SCHEMA_PATH), scoringPolicyPath],
    [lineagePolicy, "portfolio lineage policy", resolve(root, LINEAGE_SCHEMA_PATH), lineagePolicyPath],
  ];
  const errors = [];
  for (const [artifact, label, schemaPath, path] of artifacts) {
    scanProhibitedAnswerContent(artifact, label, errors);
    try {
      assertBenchmarkSchemaInstance(artifact, { schemaPath, label });
    } catch (error) {
      errors.push(error.message);
    }
    assertSerializedBytes(path, artifact, label, errors);
  }
  validateCommonBinding(admissionPolicy, catalog, ADMISSION_SCHEMA_PATH, "admission policy", errors);
  validateCommonBinding(scoringPolicy, catalog, SCORING_SCHEMA_PATH, "scoring policy", errors);
  validateCommonBinding(lineagePolicy, catalog, LINEAGE_SCHEMA_PATH, "lineage policy", errors);
  validateAdmissionSemantics(admissionPolicy, errors);
  validateScoringSemantics(scoringPolicy, errors);
  validateLineageSemantics(lineagePolicy, errors);

  const manifestBinding = commonPolicyFields(catalog, MANIFEST_SCHEMA_PATH);
  for (const [field, value] of Object.entries(manifestBinding)) {
    if (manifest[field] !== value) errors.push(`policy manifest.${field} does not match the frozen policy/catalog binding`);
  }
  if (manifest.admission_policy?.path !== ADMISSION_PATH || manifest.scoring_policy?.path !== SCORING_PATH || manifest.lineage_policy?.path !== LINEAGE_PATH) errors.push("policy manifest child policy paths must match the frozen repository paths");
  if (manifest.admission_policy?.digest !== admissionPolicy.policy_digest || manifest.scoring_policy?.digest !== scoringPolicy.policy_digest || manifest.lineage_policy?.digest !== lineagePolicy.policy_digest) errors.push("policy manifest child policy digest closure does not match supplied policy artifacts");
  if (manifest.manifest_digest !== computePortfolioPolicyManifestDigest(manifest)) errors.push("policy manifest digest does not match the sorted-key canonical manifest closure");
  if (!manifest.digest_contract?.child_policy_digests_included || manifest.digest_contract?.timestamp_in_digest_identity !== false) errors.push("policy manifest digest contract must include child digests and exclude timestamps");

  const expected = buildPortfolioPolicyArtifacts(catalog);
  for (const [actual, expectedValue, label] of [
    [manifest, expected.manifest, "policy manifest"],
    [admissionPolicy, expected.admissionPolicy, "admission policy"],
    [scoringPolicy, expected.scoringPolicy, "scoring policy"],
    [lineagePolicy, expected.lineagePolicy, "lineage policy"],
  ]) {
    if (stableCanonicalJson(actual) !== stableCanonicalJson(expectedValue)) errors.push(`${label} does not match deterministic policy recomputation`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    policyRevision: manifest.policy_revision,
    policyStatus: manifest.policy_status,
    catalogDigest: manifest.catalog_digest,
    manifestDigest: manifest.manifest_digest,
    admissionGateCount: admissionPolicy.admission_gates.length,
    lifecycleStateCount: admissionPolicy.lifecycle.states.length,
    requirementKindCount: scoringPolicy.requirement_contract.requirement_kinds.length,
    frequencyBandCount: lineagePolicy.frequency_bands.length,
    impactBandCount: lineagePolicy.impact_bands.length,
    ceilingThreshold: scoringPolicy.ceiling_floor_policy.universal_ceiling_candidate.median_normalized_requirement_score_minimum,
    floorThreshold: scoringPolicy.ceiling_floor_policy.universal_floor_candidate.median_normalized_requirement_score_maximum,
  };
}

function parseArgs(argv) {
  const args = {
    command: argv.shift(),
    root: DEFAULT_ROOT,
    policyManifestPath: DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH,
    admissionPolicyPath: DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH,
    scoringPolicyPath: DEFAULT_PORTFOLIO_SCORING_POLICY_PATH,
    lineagePolicyPath: DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH,
  };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--policy-manifest") args.policyManifestPath = resolve(argv.shift());
    else if (flag === "--admission-policy") args.admissionPolicyPath = resolve(argv.shift());
    else if (flag === "--scoring-policy") args.scoringPolicyPath = resolve(argv.shift());
    else if (flag === "--lineage-policy") args.lineagePolicyPath = resolve(argv.shift());
    else if (flag === "--root") {
      args.root = resolve(argv.shift());
      args.policyManifestPath = resolve(args.root, MANIFEST_PATH);
      args.admissionPolicyPath = resolve(args.root, ADMISSION_PATH);
      args.scoringPolicyPath = resolve(args.root, SCORING_PATH);
      args.lineagePolicyPath = resolve(args.root, LINEAGE_PATH);
    } else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark-portfolio-policy.mjs <command> [options]

Commands:
  validate [--policy-manifest <manifest.json>] [--admission-policy <policy.json>] [--scoring-policy <policy.json>] [--lineage-policy <policy.json>]
  write
`);
}

function writePortfolioPolicyArtifacts(root) {
  const catalogPath = assertInside(root, resolve(root, CATALOG_PATH), "portfolio catalog");
  validatePortfolioCatalogArtifacts({ root, catalogPath, similarityPath: resolve(root, SIMILARITY_PATH) });
  const artifacts = buildPortfolioPolicyArtifacts(readJson(catalogPath, "portfolio catalog"));
  for (const [path, value] of [
    [resolve(root, ADMISSION_PATH), artifacts.admissionPolicy],
    [resolve(root, SCORING_PATH), artifacts.scoringPolicy],
    [resolve(root, LINEAGE_PATH), artifacts.lineagePolicy],
    [resolve(root, MANIFEST_PATH), artifacts.manifest],
  ]) writeFileSync(path, serializeJson(value));
  return artifacts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "validate") {
      const summary = validatePortfolioPolicyArtifacts(args);
      console.log(`Adaptive ASK portfolio policy validation passed: revision=${summary.policyRevision}, catalog=${summary.catalogDigest}, manifest=${summary.manifestDigest}, gates=${summary.admissionGateCount}, lifecycle_states=${summary.lifecycleStateCount}, requirement_kinds=${summary.requirementKindCount}, frequency_bands=${summary.frequencyBandCount}, impact_bands=${summary.impactBandCount}, ceiling=${summary.ceilingThreshold}, floor=${summary.floorThreshold}, status=${summary.policyStatus}`);
    } else if (args.command === "write") {
      const artifacts = writePortfolioPolicyArtifacts(args.root);
      console.log(`Adaptive ASK portfolio policy artifacts written: ${artifacts.manifest.manifest_digest}`);
    } else if (args.command === "help" || !args.command) help();
    else throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(`Portfolio policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

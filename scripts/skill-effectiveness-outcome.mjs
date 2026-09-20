import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "./json-schema-validation.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(RUNTIME_ROOT, "../schemas/skill-effectiveness-outcome.schema.json");
const OUTCOME_SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const OBSERVED_EVIDENCE_STATUSES = new Set(["Verified", "Supported"]);
const MISSING_MEASUREMENT_STATUSES = new Set(["unknown", "unavailable"]);
const EFFECT_RULES = new Set([
  "comparison_higher_is_better",
  "comparison_lower_is_better",
  "comparison_lower_is_better_overhead",
  "direct_nonzero_harmful",
]);

export const SKILL_EFFECTIVENESS_DIMENSIONS = Object.freeze([
  "outcome_quality",
  "false_positive_control",
  "safety",
  "routing_quality",
  "evidence_quality",
  "overhead",
  "reuse_value",
]);
export const SKILL_EFFECTIVENESS_CLASSIFICATIONS = Object.freeze([
  "effective",
  "neutral",
  "excessive",
  "harmful",
  "insufficient_evidence",
]);
export const SKILL_EFFECTIVENESS_RECOMMENDATIONS = Object.freeze([
  "expand",
  "retain",
  "simplify",
  "stop",
  "insufficient_evidence",
]);
export const SKILL_EFFECTIVENESS_METRIC_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(OUTCOME_SCHEMA["x-ask-metric-catalog"] ?? {}).map(([metricId, definition]) => [
    metricId,
    Object.freeze({ metric_id: metricId, ...definition }),
  ]),
));

const schemaMetricIds = [...(OUTCOME_SCHEMA.$defs?.metricId?.enum ?? [])].sort();
const catalogMetricIds = Object.keys(SKILL_EFFECTIVENESS_METRIC_CATALOG).sort();
if (JSON.stringify(schemaMetricIds) !== JSON.stringify(catalogMetricIds)) {
  throw new Error("Skill effectiveness metric schema enum and catalog must contain the same metric IDs");
}
for (const [metricId, metric] of Object.entries(SKILL_EFFECTIVENESS_METRIC_CATALOG)) {
  if (!SKILL_EFFECTIVENESS_DIMENSIONS.includes(metric.dimension) || !nonBlank(metric.unit) || !nonBlank(metric.definition) || !EFFECT_RULES.has(metric.effect_rule)) {
    throw new Error(`Skill effectiveness metric catalog entry is invalid: ${metricId}`);
  }
  if (metric.effect_rule === "direct_nonzero_harmful" && !nonBlank(metric.direct_rule_ref)) {
    throw new Error(`Skill effectiveness direct metric requires a rule ref: ${metricId}`);
  }
}

function issue(code, path, message) {
  return `${code} ${path}: ${message}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === "string" && /\S/u.test(value);
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function observationIds(observations) {
  return observations.map(({ observation_id }) => observation_id).sort();
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function deriveEstablishedEffect(observation, metric) {
  if (metric.effect_rule === "direct_nonzero_harmful") {
    return {
      basis: "direct_metric_rule",
      delta: null,
      impact: nonNegativeInteger(observation.value) && observation.value > 0 ? "harmful" : "neutral",
    };
  }
  const referenceValue = observation.effect?.reference_value;
  const threshold = observation.effect?.materiality_threshold;
  if (!nonNegativeInteger(observation.value) || !nonNegativeInteger(referenceValue) || !positiveInteger(threshold)) {
    return { basis: "observed_comparison", delta: null, impact: "unknown" };
  }
  const delta = normalizeZero(observation.value - referenceValue);
  if (Math.abs(delta) < threshold) return { basis: "observed_comparison", delta, impact: "neutral" };
  if (metric.effect_rule === "comparison_higher_is_better") {
    return { basis: "observed_comparison", delta, impact: delta > 0 ? "beneficial" : "harmful" };
  }
  if (metric.effect_rule === "comparison_lower_is_better") {
    return { basis: "observed_comparison", delta, impact: delta < 0 ? "beneficial" : "harmful" };
  }
  return { basis: "observed_comparison", delta, impact: delta < 0 ? "beneficial" : "burdensome" };
}

function materializeObservationEffect(observation) {
  const effect = isObject(observation.effect) ? structuredClone(observation.effect) : {};
  const metric = SKILL_EFFECTIVENESS_METRIC_CATALOG[observation.metric_id];
  if (observation.measurement_status === "observed" && metric?.effect_rule === "direct_nonzero_harmful") {
    const derived = deriveEstablishedEffect(observation, metric);
    return {
      ...effect,
      status: "established",
      basis: derived.basis,
      reference_value: null,
      delta: null,
      materiality_threshold: null,
      rule_ref: metric.direct_rule_ref,
      evidence_refs: Array.isArray(observation.evidence_refs) ? [...observation.evidence_refs] : [],
      evidence_status: observation.evidence_status,
      impact: derived.impact,
      limitation: null,
    };
  }
  if (MISSING_MEASUREMENT_STATUSES.has(observation.measurement_status) || effect.status !== "established" || !metric) {
    return { ...effect, basis: "evidence_gap", delta: null, impact: "unknown" };
  }
  const derived = deriveEstablishedEffect({ ...observation, effect }, metric);
  return { ...effect, basis: derived.basis, delta: derived.delta, impact: derived.impact };
}

export function deriveSkillEffectivenessClassification({ dimension, observations }) {
  if (!SKILL_EFFECTIVENESS_DIMENSIONS.includes(dimension)) {
    throw new Error(`unknown Skill effectiveness dimension ${dimension}`);
  }
  if (!Array.isArray(observations) || observations.length === 0) {
    return { classification: "insufficient_evidence", basis: "evidence_gap" };
  }
  if (observations.some(({ effect }) => effect?.impact === "harmful")) {
    return { classification: "harmful", basis: "harmful_observation" };
  }
  if (observations.some(({ measurement_status, effect }) =>
    MISSING_MEASUREMENT_STATUSES.has(measurement_status) || effect?.status !== "established" || effect?.impact === "unknown")) {
    return { classification: "insufficient_evidence", basis: "evidence_gap" };
  }
  if (dimension === "overhead" && observations.some(({ effect }) => effect?.impact === "burdensome")) {
    return { classification: "excessive", basis: "disproportionate_overhead" };
  }
  if (observations.some(({ effect }) => effect?.impact === "beneficial")) {
    return { classification: "effective", basis: "beneficial_observation" };
  }
  return { classification: "neutral", basis: "no_material_change" };
}

export function deriveSkillEffectivenessRecommendation(dimensions) {
  const values = SKILL_EFFECTIVENESS_DIMENSIONS.map((dimension) => dimensions?.[dimension]?.classification);
  if (values.includes("harmful")) return "stop";
  if (values.includes("insufficient_evidence")) return "insufficient_evidence";
  if (dimensions?.overhead?.classification === "excessive") return "simplify";
  if (["outcome_quality", "false_positive_control", "safety"].some((dimension) => dimensions?.[dimension]?.classification === "effective")) {
    return "expand";
  }
  return "retain";
}

function recommendationReason(value) {
  return {
    expand: "material_primary_benefit_observed",
    retain: "no_material_primary_change_observed",
    simplify: "disproportionate_overhead_observed",
    stop: "harmful_dimension_present",
    insufficient_evidence: "dimension_evidence_gap_present",
  }[value];
}

export function buildSkillEffectivenessOutcome({ outcome_id, task_id, skill_id, observations, limitations = [] }) {
  if (!Array.isArray(observations)) throw new Error("Skill effectiveness observations must be an array");
  const copiedObservations = structuredClone(observations)
    .map((observation) => ({ ...observation, effect: materializeObservationEffect(observation) }))
    .sort((left, right) => left.observation_id.localeCompare(right.observation_id));
  const dimensions = Object.fromEntries(SKILL_EFFECTIVENESS_DIMENSIONS.map((dimension) => {
    const dimensionObservations = copiedObservations.filter((observation) => observation.dimension === dimension);
    return [dimension, {
      ...deriveSkillEffectivenessClassification({ dimension, observations: dimensionObservations }),
      observation_refs: observationIds(dimensionObservations),
    }];
  }));
  const value = deriveSkillEffectivenessRecommendation(dimensions);
  const outcome = {
    schema_version: "1.0.0",
    object_kind: "skill_effectiveness_outcome",
    outcome_id,
    task_id,
    skill_id,
    subject: {
      scope: "one_task_workflow_retrospective",
      evaluation_subject: "workflow_and_artifacts",
    },
    observations: copiedObservations,
    dimensions,
    recommendation: {
      value,
      scope: "next_similar_task_workflow_only",
      rule_ref: "ask.skill-effectiveness-decision@1.0.0",
      reason_codes: [recommendationReason(value)],
      authority_implied: false,
    },
    limitations: [...limitations],
  };
  const issues = validateSkillEffectivenessOutcome(outcome);
  if (issues.length > 0) throw new Error(`Skill effectiveness outcome is invalid:\n${issues.join("\n")}`);
  return outcome;
}

function validateUnknownEffect(effect, path, issues) {
  if (!isObject(effect)) return;
  if (effect.status !== "unknown") issues.push(issue("UNKNOWN_EFFECT_STATUS_REQUIRED", `${path}.status`, "missing effect evidence must remain unknown"));
  if (effect.basis !== "evidence_gap") issues.push(issue("UNKNOWN_EFFECT_BASIS_REQUIRED", `${path}.basis`, "unknown effect requires evidence_gap basis"));
  if (effect.reference_value !== null) issues.push(issue("UNKNOWN_EFFECT_REFERENCE_MUST_BE_NULL", `${path}.reference_value`, "unknown effect cannot imply a comparison reference"));
  if (effect.delta !== null) issues.push(issue("UNKNOWN_EFFECT_DELTA_MUST_BE_NULL", `${path}.delta`, "unknown effect cannot imply a delta"));
  if (effect.materiality_threshold !== null) issues.push(issue("UNKNOWN_EFFECT_THRESHOLD_MUST_BE_NULL", `${path}.materiality_threshold`, "unknown effect cannot imply a materiality threshold"));
  if (effect.rule_ref !== null) issues.push(issue("UNKNOWN_EFFECT_RULE_MUST_BE_NULL", `${path}.rule_ref`, "unknown effect cannot imply a decision rule"));
  if (!Array.isArray(effect.evidence_refs) || effect.evidence_refs.length !== 0) {
    issues.push(issue("UNKNOWN_EFFECT_EVIDENCE_REFS_MUST_BE_EMPTY", `${path}.evidence_refs`, "unknown effect cannot cite effect evidence"));
  }
  if (effect.evidence_status !== "Unknown") issues.push(issue("UNKNOWN_EFFECT_EVIDENCE_STATUS_REQUIRED", `${path}.evidence_status`, "unknown effect evidence must remain Unknown"));
  if (effect.impact !== "unknown") issues.push(issue("UNKNOWN_EFFECT_IMPACT_REQUIRED", `${path}.impact`, "unknown effect cannot imply an impact"));
  if (!nonBlank(effect.limitation)) issues.push(issue("UNKNOWN_EFFECT_LIMITATION_REQUIRED", `${path}.limitation`, "unknown effect requires an explicit limitation"));
}

export function validateSkillEffectivenessOutcome(outcome) {
  const issues = validateJsonSchema(outcome, { schemaPath: SCHEMA_PATH }).map((message) => issue("SCHEMA_INVALID", "$", message));
  if (!isObject(outcome)) return issues;

  if (outcome.subject?.scope !== "one_task_workflow_retrospective" || outcome.subject?.evaluation_subject !== "workflow_and_artifacts") {
    issues.push(issue("WORKFLOW_ARTIFACT_SCOPE_REQUIRED", "$.subject", "only one completed task workflow and its artifacts may be evaluated"));
  }

  const observations = Array.isArray(outcome.observations) ? outcome.observations : [];
  const observationById = new Map();
  for (const [index, observation] of observations.entries()) {
    if (!isObject(observation)) continue;
    const path = `$.observations[${index}]`;
    if (observationById.has(observation.observation_id)) {
      issues.push(issue("OBSERVATION_ID_DUPLICATE", `${path}.observation_id`, "observation IDs must be unique"));
    } else {
      observationById.set(observation.observation_id, observation);
    }
    const metric = SKILL_EFFECTIVENESS_METRIC_CATALOG[observation.metric_id];
    if (!metric) {
      issues.push(issue("METRIC_UNKNOWN", `${path}.metric_id`, "metric must be a member of the closed workflow/artifact native-unit catalog"));
    } else {
      if (observation.dimension !== metric.dimension) {
        issues.push(issue("METRIC_DIMENSION_MISMATCH", `${path}.dimension`, `${observation.metric_id} belongs to ${metric.dimension}`));
      }
      if (observation.unit !== metric.unit) {
        issues.push(issue("METRIC_UNIT_MISMATCH", `${path}.unit`, `${observation.metric_id} requires ${metric.unit}`));
      }
      if (observation.metric_definition !== metric.definition) {
        issues.push(issue("METRIC_DEFINITION_MISMATCH", `${path}.metric_definition`, `${observation.metric_id} requires its closed metric definition`));
      }
    }
    if (MISSING_MEASUREMENT_STATUSES.has(observation.measurement_status)) {
      if (observation.value !== null) {
        issues.push(issue("UNKNOWN_VALUE_MUST_BE_NULL", `${path}.value`, "unknown or unavailable observations must preserve a null value"));
      }
      if (observation.evidence_status !== "Unknown") {
        issues.push(issue("UNKNOWN_EVIDENCE_STATUS_REQUIRED", `${path}.evidence_status`, "missing measurement evidence must remain Unknown"));
      }
      if (!nonBlank(observation.limitation)) {
        issues.push(issue("UNKNOWN_LIMITATION_REQUIRED", `${path}.limitation`, "missing measurement evidence requires an explicit limitation"));
      }
      validateUnknownEffect(observation.effect, `${path}.effect`, issues);
    }
    if (observation.measurement_status === "observed") {
      if (!nonNegativeInteger(observation.value)) issues.push(issue("METRIC_VALUE_INVALID", `${path}.value`, "observed native-unit metrics require a non-negative integer value"));
      if (!OBSERVED_EVIDENCE_STATUSES.has(observation.evidence_status)) {
        issues.push(issue("OBSERVED_EVIDENCE_STATUS_INVALID", `${path}.evidence_status`, "observed evidence must be Verified or Supported"));
      }
      if (!Array.isArray(observation.evidence_refs) || observation.evidence_refs.length === 0) {
        issues.push(issue("OBSERVED_EVIDENCE_REF_REQUIRED", `${path}.evidence_refs`, "observed evidence requires at least one evidence reference"));
      }
      const effect = observation.effect;
      if (metric?.effect_rule === "direct_nonzero_harmful" && effect?.status !== "established") {
        issues.push(issue("DIRECT_EFFECT_STATUS_REQUIRED", `${path}.effect.status`, "an observed direct metric must establish its catalog-owned effect"));
      }
      if (effect?.status === "unknown") {
        validateUnknownEffect(effect, `${path}.effect`, issues);
      }
      if (effect?.status === "established") {
        const effectPath = `${path}.effect`;
        if (!OBSERVED_EVIDENCE_STATUSES.has(effect.evidence_status)) {
          issues.push(issue("EFFECT_EVIDENCE_STATUS_INVALID", `${effectPath}.evidence_status`, "established effect evidence must be Verified or Supported"));
        }
        if (!Array.isArray(effect.evidence_refs) || effect.evidence_refs.length === 0) {
          issues.push(issue("EFFECT_EVIDENCE_REF_REQUIRED", `${effectPath}.evidence_refs`, "established effect requires at least one evidence reference"));
        }
        if (metric?.effect_rule === "direct_nonzero_harmful") {
          if (effect.basis !== "direct_metric_rule") issues.push(issue("EFFECT_BASIS_MISMATCH", `${effectPath}.basis`, "direct metric requires direct_metric_rule basis"));
          if (effect.reference_value !== null) issues.push(issue("EFFECT_REFERENCE_FORBIDDEN", `${effectPath}.reference_value`, "direct metric cannot use a comparison reference"));
          if (effect.delta !== null) issues.push(issue("EFFECT_DELTA_MISMATCH", `${effectPath}.delta`, "direct metric requires a null delta"));
          if (effect.materiality_threshold !== null) issues.push(issue("EFFECT_THRESHOLD_FORBIDDEN", `${effectPath}.materiality_threshold`, "direct metric cannot use a materiality threshold"));
          if (effect.rule_ref !== metric.direct_rule_ref) issues.push(issue("EFFECT_RULE_REF_MISMATCH", `${effectPath}.rule_ref`, `expected ${metric.direct_rule_ref}`));
          if (!sameStringSet(effect.evidence_refs, observation.evidence_refs)) {
            issues.push(issue("DIRECT_EFFECT_EVIDENCE_REFS_MISMATCH", `${effectPath}.evidence_refs`, "direct effect evidence must equal the bound measurement evidence"));
          }
          if (effect.evidence_status !== observation.evidence_status) {
            issues.push(issue("DIRECT_EFFECT_EVIDENCE_STATUS_MISMATCH", `${effectPath}.evidence_status`, "direct effect evidence status must equal the measurement evidence status"));
          }
        } else if (metric) {
          if (effect.basis !== "observed_comparison") issues.push(issue("EFFECT_BASIS_MISMATCH", `${effectPath}.basis`, "comparison metric requires observed_comparison basis"));
          if (!nonNegativeInteger(effect.reference_value)) issues.push(issue("EFFECT_REFERENCE_REQUIRED", `${effectPath}.reference_value`, "comparison effect requires a same-unit non-negative integer reference"));
          if (!positiveInteger(effect.materiality_threshold)) issues.push(issue("EFFECT_THRESHOLD_REQUIRED", `${effectPath}.materiality_threshold`, "comparison effect requires a positive native-unit materiality threshold"));
          if (!nonBlank(effect.rule_ref)) issues.push(issue("EFFECT_RULE_REF_REQUIRED", `${effectPath}.rule_ref`, "comparison effect requires a materiality rule reference"));
        }
        if (metric) {
          const expected = deriveEstablishedEffect(observation, metric);
          if (effect.delta !== expected.delta) issues.push(issue("EFFECT_DELTA_MISMATCH", `${effectPath}.delta`, `expected ${String(expected.delta)} from current and reference values`));
          if (effect.impact !== expected.impact) issues.push(issue("EFFECT_IMPACT_MISMATCH", `${effectPath}.impact`, `expected ${expected.impact} from the closed effect rule`));
        }
      }
    }
    if (observation.effect?.impact === "burdensome" && observation.dimension !== "overhead") {
      issues.push(issue("BURDENSOME_DIMENSION_INVALID", `${path}.effect.impact`, "burdensome is reserved for the overhead dimension"));
    }
  }

  const dimensions = isObject(outcome.dimensions) ? outcome.dimensions : {};
  const referencedObservationIds = new Set();
  for (const dimension of SKILL_EFFECTIVENESS_DIMENSIONS) {
    const decision = dimensions[dimension];
    if (!isObject(decision)) continue;
    const path = `$.dimensions.${dimension}`;
    const refs = Array.isArray(decision.observation_refs) ? decision.observation_refs : [];
    const bound = [];
    for (const ref of refs) {
      const observation = observationById.get(ref);
      if (!observation) {
        issues.push(issue("OBSERVATION_REF_UNKNOWN", `${path}.observation_refs`, `unknown observation ${ref}`));
        continue;
      }
      if (observation.dimension !== dimension) {
        issues.push(issue("OBSERVATION_DIMENSION_MISMATCH", `${path}.observation_refs`, `${ref} belongs to ${observation.dimension}`));
        continue;
      }
      referencedObservationIds.add(ref);
      bound.push(observation);
    }
    const expected = deriveSkillEffectivenessClassification({ dimension, observations: bound });
    if (decision.classification !== expected.classification) {
      issues.push(issue("DIMENSION_CLASSIFICATION_MISMATCH", `${path}.classification`, `expected ${expected.classification}`));
    }
    if (decision.basis !== expected.basis) {
      issues.push(issue("DIMENSION_BASIS_MISMATCH", `${path}.basis`, `expected ${expected.basis}`));
    }
  }
  for (const observationId of observationById.keys()) {
    if (!referencedObservationIds.has(observationId)) {
      issues.push(issue("OBSERVATION_UNBOUND", "$.observations", `${observationId} is not bound to its dimension decision`));
    }
  }

  if (dimensions.overhead?.classification === "excessive") {
    const nonInferior = ["outcome_quality", "false_positive_control", "safety"].every((dimension) =>
      ["effective", "neutral"].includes(dimensions[dimension]?.classification));
    if (!nonInferior) {
      issues.push(issue("EXCESSIVE_REQUIRES_NON_INFERIOR_PRIMARY", "$.dimensions.overhead", "excessive overhead requires non-inferior outcome, false-positive, and safety evidence"));
    }
  }

  const expectedRecommendation = deriveSkillEffectivenessRecommendation(dimensions);
  if (outcome.recommendation?.value !== expectedRecommendation) {
    issues.push(issue("RECOMMENDATION_MISMATCH", "$.recommendation.value", `expected ${expectedRecommendation} from the closed precedence rule`));
  }
  const expectedReasonCodes = [recommendationReason(expectedRecommendation)];
  if (JSON.stringify(outcome.recommendation?.reason_codes) !== JSON.stringify(expectedReasonCodes)) {
    issues.push(issue("RECOMMENDATION_REASON_MISMATCH", "$.recommendation.reason_codes", `expected ${expectedReasonCodes.join(",")}`));
  }
  if (outcome.recommendation?.authority_implied !== false) {
    issues.push(issue("RECOMMENDATION_AUTHORITY_FORBIDDEN", "$.recommendation.authority_implied", "one-task recommendations cannot imply lifecycle authority"));
  }
  return [...new Set(issues)];
}

function materializePositive(catalog, caseDefinition) {
  const input = structuredClone(catalog.base_input);
  input.outcome_id = `fixture-${caseDefinition.case_id}`;
  input.task_id = `task-${caseDefinition.case_id}`;
  for (const override of caseDefinition.observation_overrides ?? []) {
    const observation = input.observations.find(({ observation_id }) => observation_id === override.observation_id);
    if (!observation) throw new Error(`fixture override does not resolve ${override.observation_id}`);
    const { effect, ...observationFields } = override;
    Object.assign(observation, observationFields);
    if (effect) Object.assign(observation.effect, effect);
  }
  return buildSkillEffectivenessOutcome(input);
}

function applyFixtureMutation(outcome, mutation) {
  const mutated = structuredClone(outcome);
  let target;
  if (mutation.target === "root") target = mutated;
  if (mutation.target === "subject") target = mutated.subject;
  if (mutation.target === "recommendation") target = mutated.recommendation;
  if (mutation.target === "observation") target = mutated.observations.find(({ observation_id }) => observation_id === mutation.observation_id);
  if (mutation.target === "effect") target = mutated.observations.find(({ observation_id }) => observation_id === mutation.observation_id)?.effect;
  if (mutation.target === "dimension") target = mutated.dimensions?.[mutation.dimension];
  if (!target) throw new Error(`fixture mutation target does not resolve for ${JSON.stringify(mutation)}`);
  target[mutation.field] = structuredClone(mutation.value);
  return mutated;
}

export function validateSkillEffectivenessFixtureCatalog(catalog) {
  const issues = [];
  if (!isObject(catalog) || catalog.schema_version !== "1.0.0" || catalog.contract_ref !== "ask.skill-effectiveness-outcome@1.0.0") {
    return [issue("FIXTURE_CATALOG_INVALID", "$", "unexpected fixture catalog identity")];
  }
  const built = new Map();
  for (const caseDefinition of catalog.positive_cases ?? []) {
    try {
      const outcome = materializePositive(catalog, caseDefinition);
      built.set(caseDefinition.case_id, outcome);
      if (outcome.dimensions?.[caseDefinition.expected_dimension]?.classification !== caseDefinition.expected_classification) {
        issues.push(issue("FIXTURE_EXPECTATION_MISMATCH", `$.positive_cases.${caseDefinition.case_id}`, "dimension classification mismatch"));
      }
      if (outcome.recommendation.value !== caseDefinition.expected_recommendation) {
        issues.push(issue("FIXTURE_EXPECTATION_MISMATCH", `$.positive_cases.${caseDefinition.case_id}`, "recommendation mismatch"));
      }
    } catch (error) {
      issues.push(issue("FIXTURE_POSITIVE_INVALID", `$.positive_cases.${caseDefinition.case_id ?? "unknown"}`, error.message));
    }
  }
  const classifications = new Set([...built.values()].flatMap(({ dimensions }) => Object.values(dimensions).map(({ classification }) => classification)));
  const recommendations = new Set([...built.values()].map(({ recommendation }) => recommendation.value));
  for (const value of SKILL_EFFECTIVENESS_CLASSIFICATIONS) {
    if (!classifications.has(value)) issues.push(issue("FIXTURE_CLASSIFICATION_UNCOVERED", "$.positive_cases", value));
  }
  for (const value of SKILL_EFFECTIVENESS_RECOMMENDATIONS) {
    if (!recommendations.has(value)) issues.push(issue("FIXTURE_RECOMMENDATION_UNCOVERED", "$.positive_cases", value));
  }
  for (const caseDefinition of catalog.negative_cases ?? []) {
    try {
      const base = built.get(caseDefinition.from_case_id);
      if (!base) throw new Error(`unknown positive base ${caseDefinition.from_case_id}`);
      const actualCodes = new Set(validateSkillEffectivenessOutcome(applyFixtureMutation(base, caseDefinition.mutation)).map((entry) => entry.split(" ", 1)[0]));
      for (const expected of caseDefinition.expected_issue_codes ?? []) {
        if (!actualCodes.has(expected)) issues.push(issue("FIXTURE_NEGATIVE_NOT_REJECTED", `$.negative_cases.${caseDefinition.case_id}`, expected));
      }
    } catch (error) {
      issues.push(issue("FIXTURE_NEGATIVE_INVALID", `$.negative_cases.${caseDefinition.case_id ?? "unknown"}`, error.message));
    }
  }
  return issues;
}

function readCliJson(path) {
  const text = path === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(process.cwd(), path), "utf8");
  return JSON.parse(text);
}

function printCliJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCli(argv) {
  const [command, inputPath, ...extra] = argv;
  if (!new Set(["build", "validate"]).has(command) || !inputPath || extra.length > 0) {
    throw new Error("Usage: node scripts/skill-effectiveness-outcome.mjs <build|validate> <input.json|->");
  }
  const input = readCliJson(inputPath);
  if (command === "build") {
    printCliJson(buildSkillEffectivenessOutcome(input));
    return;
  }
  const issues = validateSkillEffectivenessOutcome(input);
  printCliJson({ valid: issues.length === 0, issues });
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

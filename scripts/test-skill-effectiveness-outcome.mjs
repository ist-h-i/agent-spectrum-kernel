import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileStrict } from "./content-addressed-store.mjs";
import {
  buildSkillEffectivenessOutcome,
  SKILL_EFFECTIVENESS_METRIC_CATALOG,
  validateSkillEffectivenessFixtureCatalog,
  validateSkillEffectivenessOutcome,
} from "./skill-effectiveness-outcome.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliScript = resolve(root, "scripts/skill-effectiveness-outcome.mjs");
const catalog = readJsonFileStrict(
  resolve(root, "docs/fixtures/skill-effectiveness-outcome-cases.json"),
  "skill effectiveness outcome cases",
);

function materializePositive(caseDefinition) {
  const input = structuredClone(catalog.base_input);
  input.outcome_id = `fixture-${caseDefinition.case_id}`;
  input.task_id = `task-${caseDefinition.case_id}`;
  for (const override of caseDefinition.observation_overrides) {
    const observation = input.observations.find(({ observation_id }) => observation_id === override.observation_id);
    assert.ok(observation, `fixture override must resolve ${override.observation_id}`);
    const { effect, ...observationFields } = override;
    Object.assign(observation, observationFields);
    if (effect) Object.assign(observation.effect, effect);
  }
  return buildSkillEffectivenessOutcome(input);
}

function applyMutation(outcome, mutation) {
  const mutated = structuredClone(outcome);
  let target;
  if (mutation.target === "root") target = mutated;
  if (mutation.target === "subject") target = mutated.subject;
  if (mutation.target === "recommendation") target = mutated.recommendation;
  if (mutation.target === "observation") {
    target = mutated.observations.find(({ observation_id }) => observation_id === mutation.observation_id);
  }
  if (mutation.target === "effect") {
    target = mutated.observations.find(({ observation_id }) => observation_id === mutation.observation_id)?.effect;
  }
  if (mutation.target === "dimension") target = mutated.dimensions[mutation.dimension];
  assert.ok(target, `fixture mutation target must resolve for ${JSON.stringify(mutation)}`);
  target[mutation.field] = structuredClone(mutation.value);
  return mutated;
}

function runCli(args, input) {
  return spawnSync(process.execPath, [cliScript, ...args], {
    cwd: root,
    encoding: "utf8",
    input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  });
}

assert.deepEqual(validateSkillEffectivenessFixtureCatalog(catalog), []);

assert.equal(Object.keys(SKILL_EFFECTIVENESS_METRIC_CATALOG).length, 22, "v1 metric catalog is closed and explicit");
for (const [metricId, metric] of Object.entries(SKILL_EFFECTIVENESS_METRIC_CATALOG)) {
  assert.equal(
    /score|percent|rating|personnel|employee|individual_productivity|team_performance/iu.test(`${metricId} ${metric.unit} ${metric.definition}`),
    false,
    `${metricId} must remain workflow/artifact native-unit evidence`,
  );
  const input = structuredClone(catalog.base_input);
  input.outcome_id = `fixture-catalog-${metricId}`;
  input.task_id = `task-catalog-${metricId}`;
  const observation = input.observations.find(({ dimension }) => dimension === metric.dimension);
  assert.ok(observation, `catalog fixture requires base observation for ${metric.dimension}`);
  Object.assign(observation, {
    metric_id: metricId,
    unit: metric.unit,
    metric_definition: metric.definition,
    value: 0,
    effect: metric.effect_rule === "direct_nonzero_harmful" ? {
      status: "established",
      evidence_refs: [...observation.evidence_refs],
      evidence_status: "Verified",
      limitation: null,
    } : {
      status: "established",
      reference_value: 0,
      materiality_threshold: 1,
      rule_ref: `fixture://catalog/${metricId}`,
      evidence_refs: [...observation.evidence_refs],
      evidence_status: "Verified",
      limitation: null,
    },
  });
  const outcome = buildSkillEffectivenessOutcome(input);
  assert.deepEqual(validateSkillEffectivenessOutcome(outcome), [], `catalog metric ${metricId}`);
}

for (const metricId of ["human_corrections", "human_investigation_ms", "human_rework_ms", "task_cost_usd_micros"]) {
  const metric = SKILL_EFFECTIVENESS_METRIC_CATALOG[metricId];
  const input = structuredClone(catalog.base_input);
  input.outcome_id = `fixture-unknown-${metricId}`;
  input.task_id = `task-unknown-${metricId}`;
  const observation = input.observations.find(({ dimension }) => dimension === "overhead");
  Object.assign(observation, {
    metric_id: metricId,
    unit: metric.unit,
    metric_definition: metric.definition,
    measurement_status: "unknown",
    value: null,
    evidence_refs: [],
    evidence_status: "Unknown",
    limitation: `No measured ${metricId} value was available for this completed task.`,
    effect: {
      status: "unknown",
      reference_value: null,
      materiality_threshold: null,
      rule_ref: null,
      evidence_refs: [],
      evidence_status: "Unknown",
      limitation: `No effect could be established without a measured ${metricId} value.`,
    },
  });
  const outcome = buildSkillEffectivenessOutcome(input);
  const unknownObservation = outcome.observations.find(({ metric_id }) => metric_id === metricId);
  assert.equal(unknownObservation.value, null, `${metricId} unknown value`);
  assert.equal(unknownObservation.evidence_status, "Unknown", `${metricId} unknown measurement status`);
  assert.equal(unknownObservation.effect.impact, "unknown", `${metricId} unknown effect`);
  assert.equal(outcome.dimensions.overhead.classification, "insufficient_evidence", `${metricId} insufficient overhead evidence`);
  assert.deepEqual(validateSkillEffectivenessOutcome(outcome), [], `unknown ${metricId}`);
}

const builtByCase = new Map();
for (const caseDefinition of catalog.positive_cases) {
  const outcome = materializePositive(caseDefinition);
  builtByCase.set(caseDefinition.case_id, outcome);
  assert.deepEqual(validateSkillEffectivenessOutcome(outcome), [], caseDefinition.case_id);
  assert.equal(
    outcome.dimensions[caseDefinition.expected_dimension].classification,
    caseDefinition.expected_classification,
    `${caseDefinition.case_id} dimension classification`,
  );
  assert.equal(outcome.recommendation.value, caseDefinition.expected_recommendation, `${caseDefinition.case_id} recommendation`);
  assert.equal(outcome.subject.scope, "one_task_workflow_retrospective");
  assert.equal(outcome.subject.evaluation_subject, "workflow_and_artifacts");
  assert.equal(outcome.recommendation.authority_implied, false);
  assert.equal(Object.keys(outcome).some((key) => /score|average|percent/u.test(key)), false);
  assert.deepEqual(outcome, materializePositive(caseDefinition), `${caseDefinition.case_id} deterministic build`);
}

assert.deepEqual(
  [...new Set([...builtByCase.values()].flatMap(({ dimensions }) => Object.values(dimensions).map(({ classification }) => classification)))].sort(),
  ["effective", "excessive", "harmful", "insufficient_evidence", "neutral"],
  "positive fixtures cover every closed dimension classification",
);
assert.deepEqual(
  [...new Set([...builtByCase.values()].map(({ recommendation }) => recommendation.value))].sort(),
  ["expand", "insufficient_evidence", "retain", "simplify", "stop"],
  "positive fixtures cover every closed overall recommendation",
);

const neutralDirect = builtByCase.get("neutral-retain").observations.find(({ observation_id }) => observation_id === "obs-safety");
assert.equal(neutralDirect.value, 0);
assert.equal(neutralDirect.effect.status, "established");
assert.equal(neutralDirect.effect.basis, "direct_metric_rule");
assert.equal(neutralDirect.effect.impact, "neutral");

const harmfulDirect = builtByCase.get("harmful-stop").observations.find(({ observation_id }) => observation_id === "obs-safety");
assert.equal(harmfulDirect.value, 1);
assert.equal(harmfulDirect.effect.status, "established");
assert.equal(harmfulDirect.effect.basis, "direct_metric_rule");
assert.equal(harmfulDirect.effect.impact, "harmful");

const callerUnknownDirectInput = structuredClone(catalog.base_input);
const callerUnknownDirectObservation = callerUnknownDirectInput.observations.find(({ observation_id }) => observation_id === "obs-safety");
callerUnknownDirectObservation.value = 1;
callerUnknownDirectObservation.effect = {
  status: "unknown",
  reference_value: null,
  materiality_threshold: null,
  rule_ref: null,
  evidence_refs: [],
  evidence_status: "Unknown",
  limitation: "Caller supplied no direct effect despite an observed safety measurement.",
};
const callerUnknownDirectOutcome = buildSkillEffectivenessOutcome(callerUnknownDirectInput);
const derivedDirectObservation = callerUnknownDirectOutcome.observations.find(({ observation_id }) => observation_id === "obs-safety");
assert.equal(derivedDirectObservation.effect.status, "established");
assert.deepEqual(derivedDirectObservation.effect.evidence_refs, derivedDirectObservation.evidence_refs);
assert.equal(derivedDirectObservation.effect.evidence_status, derivedDirectObservation.evidence_status);
assert.equal(derivedDirectObservation.effect.impact, "harmful");
assert.equal(callerUnknownDirectOutcome.recommendation.value, "stop");

for (const caseDefinition of catalog.negative_cases) {
  const base = builtByCase.get(caseDefinition.from_case_id);
  assert.ok(base, `negative fixture base must resolve ${caseDefinition.from_case_id}`);
  const issues = validateSkillEffectivenessOutcome(applyMutation(base, caseDefinition.mutation));
  const codes = new Set(issues.map((issue) => issue.split(" ", 1)[0]));
  for (const expected of caseDefinition.expected_issue_codes) {
    assert.ok(codes.has(expected), `${caseDefinition.case_id} must report ${expected}; got ${issues.join("; ")}`);
  }
}

const cliInput = structuredClone(catalog.base_input);
cliInput.outcome_id = "fixture-cli-build";
cliInput.task_id = "task-cli-build";
const cliBuild = runCli(["build", "-"], cliInput);
assert.equal(cliBuild.status, 0, `CLI build failed\n${cliBuild.stdout}\n${cliBuild.stderr}`);
const cliOutcome = JSON.parse(cliBuild.stdout);
assert.deepEqual(validateSkillEffectivenessOutcome(cliOutcome), []);
assert.equal(runCli(["build", "-"], cliInput).stdout, cliBuild.stdout, "CLI build must be deterministic");

const cliValidate = runCli(["validate", "-"], cliOutcome);
assert.equal(cliValidate.status, 0, `CLI validate failed\n${cliValidate.stdout}\n${cliValidate.stderr}`);
assert.deepEqual(JSON.parse(cliValidate.stdout), { valid: true, issues: [] });

const tamperedCliOutcome = structuredClone(cliOutcome);
tamperedCliOutcome.recommendation.value = "stop";
const cliReject = runCli(["validate", "-"], tamperedCliOutcome);
assert.notEqual(cliReject.status, 0, "CLI validate must reject semantic drift");
assert.equal(JSON.parse(cliReject.stdout).valid, false);
assert.match(cliReject.stdout, /RECOMMENDATION_MISMATCH/u);

const unknownCommand = runCli(["unknown", "-"], cliOutcome);
assert.notEqual(unknownCommand.status, 0, "CLI must reject unknown commands");

console.log(`skill effectiveness outcome tests passed (${Object.keys(SKILL_EFFECTIVENESS_METRIC_CATALOG).length} metrics, ${catalog.positive_cases.length} positive, ${catalog.negative_cases.length} negative)`);

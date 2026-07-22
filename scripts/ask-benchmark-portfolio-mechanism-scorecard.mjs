import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { DEFAULT_PORTFOLIO_CATALOG_PATH } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH,
  DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH,
  DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH,
  DEFAULT_PORTFOLIO_SCORING_POLICY_PATH,
  verifyPortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import { verifyEngineeringRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const PORTFOLIO_MECHANISM_SCORECARD_SCHEMA_PATH = "benchmarks/schemas/portfolio-mechanism-scorecard.schema.json";
export const PORTFOLIO_MECHANISM_SCORECARD_POLICY_REVISION = "issue-205-checkpoint-b1-r3";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);
const RUN_IDENTITY_FIELDS = Object.freeze([
  "engineering_result_id", "engineering_result_digest",
  "normalized_result_id", "normalized_result_digest",
  "evaluation_id", "evaluation_digest",
]);
const STATES = Object.freeze(["observed", "missing", "unnecessary", "unknown", "not_applicable"]);
const COUNT_STATES = Object.freeze([...STATES, "not_scoring_ready"]);
const MAX_SCORECARD_BYTES = 512 * 1024 * 1024;
const PRIVATE_PATH_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function deepFreezeJson(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreezeJson(entry);
  return Object.freeze(value);
}

function assertPrivacy(value, path = "$") {
  if (typeof value === "string") {
    if (ABSOLUTE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain an absolute filesystem path`);
    if (PRIVATE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain a private evaluator path`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPrivacy(entry, `${path}[${index}]`));
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) assertPrivacy(entry, `${path}.${key}`);
}

function mechanismOrder(left, right) {
  return (left.classification === right.classification ? 0 : left.classification === "required" ? -1 : 1)
    || left.mechanism_id.localeCompare(right.mechanism_id);
}

function evidenceOrder(left, right) {
  return left.kind.localeCompare(right.kind) || left.digest.localeCompare(right.digest) || ((left.bytes ?? -1) - (right.bytes ?? -1));
}

function canonicalEvidence(references, label) {
  const ordered = references.map(({ kind, digest, bytes }) => ({ kind, digest, bytes })).sort(evidenceOrder);
  if (new Set(ordered.map((entry) => stableCanonicalJson(entry))).size !== ordered.length) throw new Error(`${label} contains duplicate evidence references`);
  return ordered;
}

function mechanismInventory(result) {
  const observations = result.mechanism_observations;
  const inventory = [
    ...observations.required_mechanisms.map(({ mechanism_id }) => ({ mechanism_id, classification: "required" })),
    ...observations.unnecessary_mechanisms.map(({ mechanism_id }) => ({ mechanism_id, classification: "unnecessary" })),
  ].sort(mechanismOrder);
  if (new Set(inventory.map(({ mechanism_id }) => mechanism_id)).size !== inventory.length) throw new Error("duplicate mechanism ID across required and unnecessary inventories");
  return inventory;
}

function isComplete(result) {
  return result.scoring_status === "complete" && result.evaluation_status === "completed" && result.normalized_outcome === "completed";
}

function runOrder(left, right) {
  return CONDITIONS.indexOf(left.condition) - CONDITIONS.indexOf(right.condition) || left.repetition - right.repetition;
}

function runAuthority(result) {
  return {
    condition: result.condition,
    repetition: result.repetition,
    engineering_result_id: result.engineering_result_id,
    engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    evaluation_id: result.evaluation_id,
    evaluation_digest: result.evaluation_digest,
    scoring_status: result.scoring_status,
    evaluation_status: result.evaluation_status,
    normalized_outcome: result.normalized_outcome,
  };
}

function assertRunInventory(fixture) {
  const expectedKeys = CONDITIONS.flatMap((condition) => Array.from(
    { length: fixture.expected_repetition_count },
    (_, index) => ({ condition, repetition: index + 1 }),
  ));
  const actualKeys = fixture.run_inventory.map(({ condition, repetition }) => ({ condition, repetition }));
  if (stableCanonicalJson(actualKeys) !== stableCanonicalJson(expectedKeys)) throw new Error(`${fixture.fixture_id} run inventory must contain each condition/repetition exactly once in canonical order`);
  if (new Set(actualKeys.map(({ condition, repetition }) => `${condition}:${repetition}`)).size !== fixture.run_inventory.length) throw new Error(`${fixture.fixture_id} run inventory contains a duplicate condition/repetition`);
  for (const entry of fixture.run_inventory) {
    if (entry.scoring_status === "complete" && !isComplete(entry)) throw new Error(`${fixture.fixture_id}/${entry.condition}/${entry.repetition} complete scoring readiness is inconsistent`);
  }
}

function runIndex(fixture) {
  return new Map(fixture.run_inventory.map((entry) => [`${entry.condition}:${entry.repetition}`, entry]));
}

function assertObservationAuthority(fixture, item, authority) {
  if (!authority) throw new Error(`${fixture.fixture_id}/${item.condition}/${item.repetition} observation has no run authority`);
  for (const field of RUN_IDENTITY_FIELDS) if (item[field] !== authority[field]) throw new Error(`${fixture.fixture_id}/${item.condition}/${item.repetition} observation ${field} does not match run authority`);
  const expectedStatus = isComplete(authority) ? "available" : "not_scoring_ready";
  if (item.observation_status !== expectedStatus) throw new Error(`${fixture.fixture_id}/${item.condition}/${item.repetition} observation status does not match run readiness`);
  if (expectedStatus === "not_scoring_ready" && (item.state !== null || item.evidence_references.length !== 0)) throw new Error(`${fixture.fixture_id}/${item.condition}/${item.repetition} non-ready observation must have null state and empty evidence`);
}

function assertNonReadyEmpty(result) {
  if (!isComplete(result) && (result.mechanism_observations.required_mechanisms.length > 0 || result.mechanism_observations.unnecessary_mechanisms.length > 0)) {
    throw new Error("non-ready mechanism observations are semantically unbound");
  }
}

function rawMechanism(result, identity) {
  const list = identity.classification === "required" ? result.mechanism_observations.required_mechanisms : result.mechanism_observations.unnecessary_mechanisms;
  return list.find(({ mechanism_id }) => mechanism_id === identity.mechanism_id);
}

function observation(result, identity) {
  const common = {
    repetition: result.repetition,
    condition: result.condition,
    mechanism_id: identity.mechanism_id,
    classification: identity.classification,
    engineering_result_id: result.engineering_result_id,
    engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    evaluation_id: result.evaluation_id,
    evaluation_digest: result.evaluation_digest,
  };
  if (!isComplete(result)) return { ...common, observation_status: "not_scoring_ready", state: null, evidence_references: [] };
  const source = rawMechanism(result, identity);
  if (!source) throw new Error(`${result.fixture_id}/${result.condition}/${result.repetition} is missing mechanism ${identity.mechanism_id}/${identity.classification}`);
  return {
    ...common,
    observation_status: "available",
    state: source.state,
    evidence_references: canonicalEvidence(source.evidence_references, `${result.fixture_id}/${result.condition}/${result.repetition}/${identity.mechanism_id}`),
  };
}

function deriveConditionScorecard(condition, observations, expectedCount, identity) {
  const expectedRepetitions = Array.from({ length: expectedCount }, (_, index) => index + 1);
  const ordered = [...observations].sort((left, right) => left.repetition - right.repetition || left.engineering_result_id.localeCompare(right.engineering_result_id));
  if (stableCanonicalJson(ordered.map(({ repetition }) => repetition)) !== stableCanonicalJson(expectedRepetitions)) throw new Error(`${condition} mechanism repetition inventory must be exactly 1..${expectedCount}`);
  const counts = Object.fromEntries(COUNT_STATES.map((state) => [state, 0]));
  for (const item of ordered) {
    if (item.condition !== condition || item.mechanism_id !== identity.mechanism_id || item.classification !== identity.classification) throw new Error(`${condition}/${identity.mechanism_id} observation identity drift`);
    if (item.observation_status === "available") {
      if (!STATES.includes(item.state)) throw new Error(`${condition}/${identity.mechanism_id} available observation has an invalid state`);
      const canonical = canonicalEvidence(item.evidence_references, `${condition}/${identity.mechanism_id}/${item.repetition}`);
      if (stableCanonicalJson(canonical) !== stableCanonicalJson(item.evidence_references)) throw new Error(`${condition}/${identity.mechanism_id} evidence reference ordering drift`);
      counts[item.state] += 1;
    } else if (item.observation_status === "not_scoring_ready") {
      if (item.state !== null || item.evidence_references.length !== 0) throw new Error(`${condition}/${identity.mechanism_id} not_scoring_ready observation must have null state and empty evidence`);
      counts.not_scoring_ready += 1;
    } else throw new Error(`${condition}/${identity.mechanism_id} observation status is invalid`);
  }
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== expectedCount) throw new Error(`${condition}/${identity.mechanism_id} state count closure mismatch`);
  return {
    condition,
    observation_coverage_status: counts.not_scoring_ready === 0 ? "complete" : "insufficient_evidence",
    state_counts: counts,
    observations: ordered,
  };
}

function assertB1Policy(report, policy) {
  if (policy.policy_revision !== PORTFOLIO_MECHANISM_SCORECARD_POLICY_REVISION) throw new Error("mechanism scorecards require the frozen B1 policy revision");
  if (report.authority.scoring_policy_revision !== policy.policy_revision || report.authority.scoring_policy_digest !== policy.policy_digest) throw new Error("repetition report and B1 scoring policy authority mismatch");
  const routeTelemetry = policy.engineering_outcome.components.find(({ component_id }) => component_id === "route_mechanism_telemetry");
  if (routeTelemetry?.quality_effect !== "telemetry_only") throw new Error("route mechanism telemetry must remain telemetry_only");
  for (const field of ["mechanism_use_quality_credit", "skill_load_quality_credit", "agent_start_quality_credit", "artifact_creation_quality_credit"]) {
    if (policy.engineering_outcome[field] !== false) throw new Error(`${field} must remain false`);
  }
}

function indexRawResults(verifiedResultSet) {
  const index = new Map();
  for (const entry of verifiedResultSet.verified_results) {
    const id = entry.result.engineering_result_id;
    if (index.has(id)) throw new Error(`duplicate verified engineering result ID: ${id}`);
    index.set(id, entry.result);
  }
  return index;
}

export function computePortfolioMechanismScorecardId(value) {
  const closure = withoutField(withoutField(value, "mechanism_scorecard_id"), "mechanism_scorecard_digest");
  return `mechanism-scorecard-${canonicalDigest(closure).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computePortfolioMechanismScorecardDigest(value) {
  return canonicalDigest(withoutField(value, "mechanism_scorecard_digest"));
}

export function buildPortfolioMechanismScorecard({ verifiedReport, verifiedResultSet, verifiedScoringPolicy }) {
  if (!verifiedReport || !Object.isFrozen(verifiedReport)) throw new Error("a recursively frozen full-verifier repetition report is required");
  if (!verifiedResultSet?.artifact || !Array.isArray(verifiedResultSet.verified_results)) throw new Error("the underlying full verified result-set authority is required");
  if (!verifiedScoringPolicy || !Object.isFrozen(verifiedScoringPolicy)) throw new Error("a recursively frozen full-verifier scoring policy is required");
  assertB1Policy(verifiedReport, verifiedScoringPolicy);
  if (verifiedReport.authority.result_set_id !== verifiedResultSet.artifact.result_set_id || verifiedReport.authority.result_set_digest !== verifiedResultSet.artifact.result_set_digest) throw new Error("repetition report and result-set authority mismatch");
  const rawById = indexRawResults(verifiedResultSet);
  const fixture_scorecards = verifiedReport.fixture_reports.map((fixture) => {
    const rawResults = fixture.condition_reports.flatMap((conditionReport) => conditionReport.repetition_observations.map((source) => {
      const raw = rawById.get(source.engineering_result_id);
      if (!raw) throw new Error(`${fixture.fixture_id} repetition observation is absent from verified result-set authority`);
      for (const field of ["engineering_result_digest", "normalized_result_id", "normalized_result_digest", "evaluation_id", "evaluation_digest", "repetition"]) if (raw[field] !== source[field]) throw new Error(`${fixture.fixture_id} repetition report and raw result authority disagree on ${field}`);
      if (raw.condition !== conditionReport.condition) throw new Error(`${fixture.fixture_id} repetition report and raw result authority disagree on condition`);
      if (raw.fixture_id !== fixture.fixture_id || raw.adapter !== verifiedReport.authority.adapter_track) throw new Error(`${fixture.fixture_id} contains a cross-fixture or cross-adapter result`);
      assertNonReadyEmpty(raw);
      return raw;
    }));
    const run_inventory = rawResults.map(runAuthority).sort(runOrder);
    const completeResults = rawResults.filter(isComplete);
    let inventory = [];
    let mechanism_inventory_status = "insufficient_evidence";
    if (completeResults.length > 0) {
      mechanism_inventory_status = "complete";
      inventory = mechanismInventory(completeResults[0]);
      for (const result of completeResults.slice(1)) if (stableCanonicalJson(mechanismInventory(result)) !== stableCanonicalJson(inventory)) throw new Error(`${fixture.fixture_id} complete results must have exactly matching mechanism ID/classification inventories`);
    }
    const mechanism_scorecards = inventory.map((identity) => ({
      ...identity,
      condition_scorecards: CONDITIONS.map((condition) => deriveConditionScorecard(
        condition,
        rawResults.filter((result) => result.condition === condition).map((result) => observation(result, identity)),
        fixture.expected_repetition_count,
        identity,
      )),
    }));
    return {
      fixture_id: fixture.fixture_id,
      fixture_input_digest: fixture.fixture_input_digest,
      suite: fixture.suite,
      task_class: fixture.task_class,
      expected_repetition_count: fixture.expected_repetition_count,
      run_inventory,
      mechanism_inventory_status,
      mechanism_scorecards,
    };
  }).sort((left, right) => left.fixture_id.localeCompare(right.fixture_id));
  const base = {
    schema_version: "1.0.0",
    schema_path: PORTFOLIO_MECHANISM_SCORECARD_SCHEMA_PATH,
    program: "adaptive_ask_portfolio_mechanism_observation_scorecard",
    authority: {
      repetition_report_id: verifiedReport.repetition_report_id,
      repetition_report_digest: verifiedReport.repetition_report_digest,
      ...structuredClone(verifiedReport.authority),
    },
    fixture_scorecards,
    boundaries: {
      mechanism_scorecard_calculated: true,
      mechanism_numeric_score_calculated: false,
      mechanism_quality_credit_applied: false,
      skill_load_credit_applied: false,
      agent_start_credit_applied: false,
      artifact_creation_credit_applied: false,
      mechanism_global_taxonomy_applied: false,
      condition_comparison_calculated: false,
      directional_win_loss_tie_calculated: false,
      meaningful_delta_classified: false,
      practice_weighting_applied: false,
      lineage_weighting_applied: false,
      cross_fixture_aggregate_calculated: false,
      cross_suite_aggregate_calculated: false,
      cross_adapter_pooling: false,
      product_value_claim: false,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  const withId = { ...base, mechanism_scorecard_id: computePortfolioMechanismScorecardId(base) };
  return { ...withId, mechanism_scorecard_digest: computePortfolioMechanismScorecardDigest(withId) };
}

export function validatePortfolioMechanismScorecard(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, PORTFOLIO_MECHANISM_SCORECARD_SCHEMA_PATH), label: "portfolio mechanism scorecard" });
  assertPrivacy(value);
  if (value.fixture_scorecards.some((fixture, index, all) => index > 0 && all[index - 1].fixture_id.localeCompare(fixture.fixture_id) >= 0)) throw new Error("fixture scorecard ordering drift");
  for (const fixture of value.fixture_scorecards) {
    assertRunInventory(fixture);
    const expectedInventoryStatus = fixture.run_inventory.some(isComplete) ? "complete" : "insufficient_evidence";
    if (fixture.mechanism_inventory_status !== expectedInventoryStatus) throw new Error(`${fixture.fixture_id} mechanism inventory status does not match run readiness`);
    if (expectedInventoryStatus === "insufficient_evidence" && fixture.mechanism_scorecards.length !== 0) throw new Error(`${fixture.fixture_id} insufficient inventory must be empty`);
    if (stableCanonicalJson(fixture.mechanism_scorecards) !== stableCanonicalJson([...fixture.mechanism_scorecards].sort(mechanismOrder))) throw new Error(`${fixture.fixture_id} mechanism ordering drift`);
    if (new Set(fixture.mechanism_scorecards.map(({ mechanism_id }) => mechanism_id)).size !== fixture.mechanism_scorecards.length) throw new Error(`${fixture.fixture_id} duplicate mechanism ID`);
    const authorityByRun = runIndex(fixture);
    for (const mechanism of fixture.mechanism_scorecards) {
      if (stableCanonicalJson(mechanism.condition_scorecards.map(({ condition }) => condition)) !== stableCanonicalJson(CONDITIONS)) throw new Error(`${fixture.fixture_id}/${mechanism.mechanism_id} condition ordering drift`);
      for (const condition of mechanism.condition_scorecards) {
        const rebuilt = deriveConditionScorecard(condition.condition, condition.observations, fixture.expected_repetition_count, mechanism);
        if (stableCanonicalJson(rebuilt) !== stableCanonicalJson(condition)) throw new Error(`${fixture.fixture_id}/${mechanism.mechanism_id}/${condition.condition} state count or coverage closure mismatch`);
        for (const item of condition.observations) assertObservationAuthority(fixture, item, authorityByRun.get(`${item.condition}:${item.repetition}`));
      }
    }
  }
  if (value.mechanism_scorecard_id !== computePortfolioMechanismScorecardId(value)) throw new Error("mechanism scorecard ID does not match its complete ordered closure");
  if (value.mechanism_scorecard_digest !== computePortfolioMechanismScorecardDigest(value)) throw new Error("mechanism scorecard digest does not match its complete ordered closure");
  return value;
}

function pathsOverlap(left, right) {
  const a = resolve(left); const b = resolve(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
}

function policyPaths(root) {
  if (root === DEFAULT_ROOT) return [DEFAULT_PORTFOLIO_CATALOG_PATH, DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH, DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH, DEFAULT_PORTFOLIO_SCORING_POLICY_PATH, DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH];
  return ["benchmarks/portfolio-catalog.json", "benchmarks/portfolio-policy-manifest.json", "benchmarks/portfolio-admission-policy.json", "benchmarks/portfolio-scoring-policy.json", "benchmarks/portfolio-lineage-policy.json"].map((path) => resolve(root, path));
}

function assertOutputBoundary(options) {
  const output = assertAtomicOutputAbsent(options.outputPath, "portfolio mechanism scorecard output");
  const root = resolve(options.root ?? DEFAULT_ROOT);
  for (const [label, path] of [
    ["result-set input", options.resultSetPath], ["repetition-report input", options.repetitionReportPath],
    ["normalized result authority", options.normalizedResultsPath], ["engineering result authority", options.engineeringResultsPath],
    ["source manifest authority", options.sourceManifestPath], ["materialized authority", options.materializedPath],
    ["selection-state authority", options.selectionState], ["run authority", options.runDir],
    ...policyPaths(root).map((path) => ["policy authority", path]),
  ]) if (path && pathsOverlap(output, path)) throw new Error(`portfolio mechanism scorecard output must be disjoint from ${label}`);
  return output;
}

function derive(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const verified = verifyEngineeringRepetitionReport({ ...options, inputPath: options.resultSetPath, reportPath: options.repetitionReportPath });
  const verifiedPolicy = verifyPortfolioPolicyArtifacts({ root });
  const scoringPolicy = verifiedPolicy.verified_scoring_policy;
  const verifiedResultSet = { artifact: verified.verified_result_set, verified_results: verified.verified_results };
  const artifact = buildPortfolioMechanismScorecard({ verifiedReport: verified.verified_report, verifiedResultSet, verifiedScoringPolicy: scoringPolicy });
  validatePortfolioMechanismScorecard(artifact, { root });
  return { artifact, verified_report: verified.verified_report, verified_result_set: verified.verified_result_set, verified_results: verified.verified_results, verified_scoring_policy: scoringPolicy };
}

export function reportEngineeringMechanismScorecards(options) {
  const outputPath = assertOutputBoundary(options);
  const derived = derive(options);
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath, artifact: derived.artifact, label: "portfolio mechanism scorecard output" }) };
}

export function verifyEngineeringMechanismScorecard(options) {
  const input = readStableFile(options.scorecardPath, "portfolio mechanism scorecard input", MAX_SCORECARD_BYTES, { allowEmpty: false });
  let supplied;
  try { supplied = JSON.parse(input.bytes.toString("utf8")); } catch { throw new Error("portfolio mechanism scorecard input must contain valid JSON"); }
  validatePortfolioMechanismScorecard(supplied, { root: options.root ?? DEFAULT_ROOT });
  const derived = derive(options);
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("mechanism scorecard does not match the re-derived full authority scorecard");
  const after = readStableFile(options.scorecardPath, "portfolio mechanism scorecard input", MAX_SCORECARD_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, after, "portfolio mechanism scorecard input");
  return { artifact: supplied, bytes: input.bytes, verified_scorecard: deepFreezeJson(structuredClone(supplied)) };
}

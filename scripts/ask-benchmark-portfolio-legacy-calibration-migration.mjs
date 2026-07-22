import { spawnSync } from "node:child_process";
import { resolve, relative, sep, posix, isAbsolute, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";
import { validatePortfolioCatalogArtifacts } from "./ask-benchmark-portfolio-catalog.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";

export const LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH = "benchmarks/schemas/portfolio-legacy-calibration-migration.schema.json";
export const LEGACY_RESULT_SCHEMA_PATH = "benchmarks/schemas/result.schema.json";
export const LEGACY_CALIBRATION_MIGRATION_REVISION = "issue-197-legacy-calibration-r1";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_JSON_BYTES = 512 * 1024 * 1024;
const CONDITIONS = Object.freeze(["plain", "kernel_only", "full_ask"]);
const SOURCE_BY_PATH = Object.freeze({
  "benchmarks/results/checkpoint-b-2026-07-12.json": Object.freeze({ checkpoint: "B", fixtures: ["implementation-001", "review-001"] }),
  "benchmarks/results/checkpoint-b2-2026-07-12.json": Object.freeze({ checkpoint: "B2", fixtures: ["impl-rule-batch-medium-hard", "impl-transfer-hard", "pr-export-lease-hard", "pr-session-refresh-medium-hard"] }),
  "benchmarks/results/checkpoint-c-2026-07-14.json": Object.freeze({ checkpoint: "C", fixtures: ["impl-rule-batch-medium-hard", "impl-transfer-hard", "pr-export-lease-hard", "pr-session-refresh-medium-hard"] }),
});
const FIXTURE_MAPPING = Object.freeze({
  "impl-rule-batch-medium-hard": "cal-atomic-rule-batch",
  "impl-transfer-hard": "cal-concurrent-transfer",
  "pr-export-lease-hard": "cal-export-lease",
  "pr-session-refresh-medium-hard": "cal-session-refresh",
});
const REASON_ORDER = Object.freeze([
  "adaptive_condition_absent",
  "current_repetition_requirement_unsatisfied",
  "current_normalized_authority_absent",
  "current_evaluator_authority_absent",
  "current_engineering_result_authority_absent",
  "legacy_metric_semantics_not_equivalent",
  "current_catalog_mapping_absent",
]);
const TARGET_FILES = Object.freeze([
  "benchmarks/portfolio-catalog.json",
  "benchmarks/portfolio-similarity.json",
  "benchmarks/portfolio-policy-manifest.json",
  "benchmarks/portfolio-admission-policy.json",
  "benchmarks/portfolio-scoring-policy.json",
  "benchmarks/portfolio-lineage-policy.json",
]);
const MIGRATION_INPUTS = Object.freeze(Object.keys(SOURCE_BY_PATH).flatMap((path) => [path, path.replace(/\.json$/u, ".migration.json")]));
const REPOSITORY_VALIDATION_INVENTORY = Object.freeze([
  ".github/ask-automation/validation-plan.json",
  ".github/workflows/validate.yml",
  "docs/fixtures/adapter-runtime-bundle.json",
  "scripts/validate-repo.mjs",
]);
const PROHIBITED_KEYS = /^(?:passed_names|failed_names|requirement_failures|oracle|rubric|reference_patch|raw_prompt|full_agent_output|comparison_reason|normalized_result_id|normalized_result_digest|evaluator_id|evaluator_digest|evaluation_id|evaluation_digest|engineering_result_id|engineering_result_digest|result_set_id|result_set_digest|repetition_report_id|repetition_report_digest|mechanism_observations?|frequency_weight|impact_weight|ceiling_classification|floor_classification)$/u;
const PROHIBITED_TEXT = /(?:hidden[ _-]test name|evaluator[ _-](?:oracle|rubric)|reference[ _-]patch|raw[ _-]prompt|full[ _-]agent[ _-]output|answer[ _-]bearing[ _-]comparison)/iu;

function parseJsonEvidence(evidence, label) {
  try {
    return JSON.parse(evidence.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function normalizeNumbers(value) {
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeNumbers(entry)]));
  return value;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function portableRelativePath(root, path, label) {
  const absolute = resolve(path);
  const value = relative(root, absolute).split(sep).join("/");
  if (!value || isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || posix.normalize(value) !== value || value.startsWith("./")) {
    throw new Error(`${label} must be a normalized repository-relative path without escape segments`);
  }
  return value;
}

function assertPathsDisjoint(left, right, label) {
  const a = resolve(left);
  const b = resolve(right);
  if (a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`)) throw new Error(`${label} paths must be bidirectionally disjoint`);
}

function outputCanonicalCandidate(outputPath) {
  return resolve(realpathSync(dirname(resolve(outputPath))), basename(resolve(outputPath)));
}

function assertOutputBoundary({ root, sourcePath, outputPath, migrationInputPath = null }) {
  const output = assertAtomicOutputAbsent(outputPath, "legacy calibration migration output");
  const candidate = outputCanonicalCandidate(output);
  const sourceRelativePath = relative(root, resolve(sourcePath)).split(sep).join("/");
  const intendedCheckedMigration = Object.hasOwn(SOURCE_BY_PATH, sourceRelativePath) ? resolve(root, sourceRelativePath.replace(/\.json$/u, ".migration.json")) : null;
  const forbidden = new Set([sourcePath, migrationInputPath, ...TARGET_FILES, LEGACY_RESULT_SCHEMA_PATH, LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH, ...MIGRATION_INPUTS, ...REPOSITORY_VALIDATION_INVENTORY].filter(Boolean));
  for (const value of forbidden) {
    const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
    if (candidate === absolute && candidate === intendedCheckedMigration) continue;
    assertPathsDisjoint(candidate, absolute, `legacy calibration migration output and ${value}`);
  }
  return output;
}

function assertCheckedInSourceAuthority({ root, sourceRelativePath, evidence, expectedSourceRawByteDigest }) {
  if (root !== DEFAULT_ROOT) {
    if (!expectedSourceRawByteDigest) throw new Error("custom root legacy source requires an explicit immutable raw-byte digest");
    if (evidence.rawByteDigest !== expectedSourceRawByteDigest) throw new Error("custom root legacy source raw-byte digest does not match the immutable authority");
    return;
  }
  if (expectedSourceRawByteDigest && evidence.rawByteDigest !== expectedSourceRawByteDigest) throw new Error("legacy source raw-byte digest does not match the supplied immutable authority");
  const result = spawnSync("git", ["show", `HEAD:${sourceRelativePath}`], { cwd: root, encoding: null, maxBuffer: MAX_JSON_BYTES });
  if (result.status !== 0) throw new Error(`legacy source is not available from checked-in HEAD: ${sourceRelativePath}`);
  if (Buffer.compare(result.stdout, evidence.bytes) !== 0) throw new Error(`legacy source bytes must exactly match checked-in HEAD: ${sourceRelativePath}`);
}

function readTargetAuthority(root) {
  const before = new Map(TARGET_FILES.map((path) => [path, readStableFile(resolve(root, path), path, MAX_JSON_BYTES, { allowEmpty: false })]));
  validatePortfolioCatalogArtifacts({ root });
  verifyPortfolioPolicyArtifacts({ root });
  const after = new Map(TARGET_FILES.map((path) => [path, readStableFile(resolve(root, path), path, MAX_JSON_BYTES, { allowEmpty: false })]));
  for (const path of TARGET_FILES) assertStableFileEvidence(before.get(path), after.get(path), path);
  const catalog = parseJsonEvidence(before.get("benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const manifest = parseJsonEvidence(before.get("benchmarks/portfolio-policy-manifest.json"), "portfolio policy manifest");
  return { catalog, manifest };
}

function assertSourceSemantics(source, sourceRelativePath) {
  const contract = SOURCE_BY_PATH[sourceRelativePath];
  if (!contract) throw new Error("legacy source path is not an approved checkpoint B/B2/C authority");
  if (source.checkpoint !== contract.checkpoint) throw new Error("legacy source checkpoint does not match its source path");
  if ((source.checkpoint === "C") !== Object.hasOwn(source, "attribution")) throw new Error("Checkpoint C attribution presence is inconsistent");
  const fixtureIds = [...new Set(source.runs.map((run) => run.fixture_id))].sort();
  if (stableCanonicalJson(fixtureIds) !== stableCanonicalJson(contract.fixtures)) throw new Error("legacy source fixture inventory does not match the checkpoint authority");
  const caseIds = source.runs.map((run) => run.case_id);
  if (new Set(caseIds).size !== caseIds.length) throw new Error("legacy source contains duplicate source case IDs");
  const runKeys = new Set();
  for (const run of source.runs) {
    const repetitionRecorded = Object.hasOwn(run, "repetition");
    if (source.checkpoint === "B" && repetitionRecorded) throw new Error("Checkpoint B repetition must remain not recorded");
    if (source.checkpoint !== "B" && (!repetitionRecorded || run.repetition !== 1)) throw new Error("Checkpoint B2/C repetition evidence must remain recorded as 1");
    const key = `${run.fixture_id}\0${run.condition}\0${repetitionRecorded ? run.repetition : "not_recorded"}`;
    if (runKeys.has(key)) throw new Error("legacy source contains a duplicate fixture/condition/repetition run");
    runKeys.add(key);
  }
  for (const fixtureId of fixtureIds) {
    const fixtureRuns = source.runs.filter((run) => run.fixture_id === fixtureId);
    const conditions = fixtureRuns.map((run) => run.condition).sort((left, right) => CONDITIONS.indexOf(left) - CONDITIONS.indexOf(right));
    if (stableCanonicalJson(conditions) !== stableCanonicalJson(CONDITIONS)) throw new Error(`${fixtureId} source conditions must contain plain, kernel_only, and full_ask exactly once`);
    if (new Set(fixtureRuns.map((run) => run.task_class)).size !== 1) throw new Error(`${fixtureId} source task class is inconsistent`);
  }
  return contract;
}

function valueOrNull(value, key) {
  return Object.hasOwn(value, key) ? value[key] : null;
}

function projectRun(run) {
  const quality = run.outcome_quality;
  const hidden = quality.hidden_tests;
  return normalizeNumbers({
    source_case_id: run.case_id,
    condition: run.condition,
    repetition_evidence: Object.hasOwn(run, "repetition") ? { status: "recorded", value: run.repetition } : { status: "not_recorded", value: null },
    task_class: run.task_class,
    outcome_quality: {
      valid_blocking_or_major_findings: quality.valid_blocking_or_major_findings,
      major_findings_missed: quality.major_findings_missed,
      unsupported_or_false_positive_findings: quality.unsupported_or_false_positive_findings,
      merge_decision_correct: valueOrNull(quality, "merge_decision_correct"),
      requirement_satisfaction_rate: quality.requirement_satisfaction_rate,
      requirements_total: valueOrNull(quality, "requirements_total"),
      requirements_satisfied: valueOrNull(quality, "requirements_satisfied"),
      hidden_test_counts: hidden ? { total: hidden.total, passed: hidden.passed, failed: hidden.failed, exit_code: hidden.exit_code } : null,
      scope_deviations: quality.scope_deviations,
      changed_file_count: valueOrNull(quality, "changed_file_count"),
      automated_correction_units: valueOrNull(quality, "automated_correction_units"),
      unverified_completion_or_readiness_claims: quality.unverified_completion_or_readiness_claims,
      rework_count: quality.rework_count,
    },
    human_effort: structuredClone(run.human_effort),
    cost_latency: structuredClone(run.cost_latency),
    adoption_behavior: structuredClone(run.adoption_behavior),
    runtime_evidence: {
      projected_assets_available: run.runtime_evidence.projected_assets_available,
      full_skill_projection_available: run.runtime_evidence.full_skill_projection_available,
      execution_status: run.runtime_evidence.execution_status,
      output_digest: run.runtime_evidence.output_sha256 ? `sha256:${run.runtime_evidence.output_sha256}` : null,
      capability_downgrade: run.runtime_evidence.capability_downgrade,
    },
    source_run_canonical_digest: canonicalDigest(normalizeNumbers(run)),
  });
}

function mappedTarget(catalog, sourceFixtureId) {
  const targetId = FIXTURE_MAPPING[sourceFixtureId];
  if (!targetId) return null;
  const target = catalog.fixtures.find((fixture) => fixture.fixture_id === targetId);
  if (!target) throw new Error(`${sourceFixtureId} target calibration fixture is absent from the current catalog`);
  if (target.fixture_role !== "calibration" || target.suite !== "calibration" || target.aggregate_eligible !== false) throw new Error(`${targetId} must remain calibration-only and aggregate-ineligible`);
  return target;
}

function buildFixtureMigration(source, fixtureId, catalog) {
  const runs = source.runs.filter((run) => run.fixture_id === fixtureId).sort((left, right) => CONDITIONS.indexOf(left.condition) - CONDITIONS.indexOf(right.condition));
  const target = mappedTarget(catalog, fixtureId);
  if (target && target.task_class !== runs[0].task_class) throw new Error(`${fixtureId} task class does not match ${target.fixture_id}`);
  const recorded = runs.every((run) => Object.hasOwn(run, "repetition"));
  const reasonCodes = target ? REASON_ORDER.filter((reason) => reason !== "current_catalog_mapping_absent") : REASON_ORDER.filter((reason) => !["current_repetition_requirement_unsatisfied"].includes(reason));
  return {
    source_fixture_id: fixtureId,
    mapping_status: target ? "mapped_calibration_fixture" : "unmapped_legacy_history",
    target_fixture_id: target?.fixture_id ?? null,
    target_fixture_metadata_digest: target?.fixture_metadata_digest ?? null,
    source_task_class: runs[0].task_class,
    target_task_class: target?.task_class ?? null,
    target_fixture_role: target?.fixture_role ?? null,
    target_suite: target?.suite ?? null,
    target_repetitions: target?.repetitions ?? null,
    target_aggregate_eligible: target?.aggregate_eligible ?? null,
    source_conditions: [...CONDITIONS],
    missing_current_conditions: ["adaptive_ask"],
    source_repetition_evidence: { status: recorded ? "recorded" : "not_recorded", recorded_values: recorded ? [...new Set(runs.map((run) => run.repetition))].sort((a, b) => a - b) : [] },
    run_projections: runs.map(projectRun),
    compatibility_status: target ? "mapped_legacy_calibration_readable" : "unmapped_legacy_history_readable",
    current_scoring_status: "not_scoring_ready",
    non_ready_reason_codes: reasonCodes,
  };
}

export function computeLegacyCalibrationMigrationId(value) {
  const identity = { source_authority: value.source_authority, target_authority: value.target_authority, fixture_migrations: value.fixture_migrations };
  return `legacy-calibration-migration-${canonicalDigest(identity).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computeLegacyCalibrationMigrationDigest(value) {
  return canonicalDigest(withoutField(value, "migration_digest"));
}

function assertPrivacy(value, path = "$") {
  if (typeof value === "string") {
    if (isAbsolute(value)) throw new Error(`${path} must not contain an absolute filesystem path`);
    if (PROHIBITED_TEXT.test(value)) throw new Error(`${path} contains prohibited answer-bearing text`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPrivacy(entry, `${path}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (PROHIBITED_KEYS.test(key)) throw new Error(`${path}.${key} is prohibited in a legacy compatibility migration`);
      assertPrivacy(entry, `${path}.${key}`);
    }
  }
}

function assertMigrationSemantics(artifact) {
  assertPrivacy(artifact);
  if (artifact.migration_id !== computeLegacyCalibrationMigrationId(artifact)) throw new Error("legacy calibration migration ID drift");
  if (artifact.migration_digest !== computeLegacyCalibrationMigrationDigest(artifact)) throw new Error("legacy calibration migration digest drift");
  const fixtures = artifact.fixture_migrations;
  const fixtureIds = fixtures.map((fixture) => fixture.source_fixture_id);
  if (new Set(fixtureIds).size !== fixtureIds.length || stableCanonicalJson(fixtureIds) !== stableCanonicalJson([...fixtureIds].sort())) throw new Error("fixture migrations must be unique and ordered by source fixture ID");
  const sourceCaseIds = fixtures.flatMap((fixture) => fixture.run_projections.map((run) => run.source_case_id));
  if (new Set(sourceCaseIds).size !== sourceCaseIds.length) throw new Error("fixture migrations contain a duplicate source case ID");
  for (const fixture of fixtures) {
    if (stableCanonicalJson(fixture.source_conditions) !== stableCanonicalJson(CONDITIONS)) throw new Error(`${fixture.source_fixture_id} source condition order drift`);
    if (stableCanonicalJson(fixture.missing_current_conditions) !== stableCanonicalJson(["adaptive_ask"])) throw new Error(`${fixture.source_fixture_id} must explicitly preserve missing adaptive_ask`);
    const runConditions = fixture.run_projections.map((run) => run.condition);
    if (new Set(runConditions).size !== runConditions.length || stableCanonicalJson(runConditions) !== stableCanonicalJson(CONDITIONS)) throw new Error(`${fixture.source_fixture_id} run projections must contain each source condition in canonical order`);
    const runDigests = fixture.run_projections.map((run) => run.source_run_canonical_digest);
    if (new Set(runDigests).size !== runDigests.length) throw new Error(`${fixture.source_fixture_id} contains a duplicate source run digest`);
    const reasonOrder = fixture.non_ready_reason_codes.map((reason) => REASON_ORDER.indexOf(reason));
    if (new Set(fixture.non_ready_reason_codes).size !== fixture.non_ready_reason_codes.length || reasonOrder.some((value, index) => value < 0 || (index > 0 && value <= reasonOrder[index - 1]))) throw new Error(`${fixture.source_fixture_id} non-ready reasons must be unique and canonically ordered`);
    const mapped = fixture.mapping_status === "mapped_calibration_fixture";
    if (mapped !== (fixture.compatibility_status === "mapped_legacy_calibration_readable") || mapped !== (fixture.target_fixture_id !== null)) throw new Error(`${fixture.source_fixture_id} compatibility status contradicts mapping status`);
    for (const run of fixture.run_projections) {
      if (run.task_class !== fixture.source_task_class) throw new Error(`${fixture.source_fixture_id}/${run.condition} task class drift`);
      const recorded = run.repetition_evidence.status === "recorded";
      if (recorded !== (run.repetition_evidence.value !== null)) throw new Error(`${fixture.source_fixture_id}/${run.condition} repetition evidence is contradictory`);
    }
  }
}

export function buildLegacyCalibrationMigration({ source, sourceEvidence, sourceRelativePath, catalog, manifest }) {
  assertSourceSemantics(source, sourceRelativePath);
  const artifact = normalizeNumbers({
    schema_version: "1.0.0",
    schema_path: LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    migration_revision: LEGACY_CALIBRATION_MIGRATION_REVISION,
    source_authority: {
      source_path: sourceRelativePath,
      checkpoint: source.checkpoint,
      source_raw_byte_digest: sourceEvidence.rawByteDigest,
      source_semantic_digest: canonicalDigest(normalizeNumbers(source)),
      legacy_schema_path: LEGACY_RESULT_SCHEMA_PATH,
      protocol_identity: {
        status: source.protocol.status,
        frozen_at: source.protocol.frozen_at,
        protocol_digest: `sha256:${source.protocol.protocol_sha256}`,
        config_digest: `sha256:${source.protocol.config_sha256}`,
        repository_revision: source.protocol.repository_revision,
      },
      runtime_identity: {
        agent: source.runtime.agent,
        agent_version: source.runtime.agent_version,
        observed_agent_version: source.runtime.observed_agent_version,
        model: source.runtime.model,
        reasoning_effort: source.runtime.reasoning_effort,
        sequential: source.runtime.sequential,
        case_timeout_ms: valueOrNull(source.runtime, "case_timeout_ms"),
        network_required_by_fixtures: source.runtime.network_required_by_fixtures,
      },
      checkpoint_c_attribution: source.checkpoint === "C" ? structuredClone(source.attribution) : null,
    },
    target_authority: {
      catalog_revision: catalog.catalog_revision,
      catalog_digest: catalog.catalog_digest,
      policy_revision: manifest.policy_revision,
      policy_manifest_digest: manifest.manifest_digest,
    },
    fixture_migrations: [...new Set(source.runs.map((run) => run.fixture_id))].sort().map((fixtureId) => buildFixtureMigration(source, fixtureId, catalog)),
    boundaries: {
      artifact_role: "read_only_legacy_calibration_compatibility",
      calibration_only: true,
      aggregate_eligible: false,
      current_scoring_status: "not_scoring_ready",
      legacy_metric_semantics: "not_equivalent_to_current_portfolio_metrics",
      adaptive_run_generated: false,
      current_authority_identities_generated: false,
      product_value_claimed: false,
    },
  });
  artifact.migration_id = computeLegacyCalibrationMigrationId(artifact);
  artifact.migration_digest = computeLegacyCalibrationMigrationDigest(artifact);
  return artifact;
}

function deriveFromAuthorities({ root, sourcePath, expectedSourceRawByteDigest }) {
  const sourceRelativePath = portableRelativePath(root, sourcePath, "legacy source");
  const sourceEvidence = readStableFile(sourcePath, "legacy source", MAX_JSON_BYTES, { allowEmpty: false });
  assertCheckedInSourceAuthority({ root, sourceRelativePath, evidence: sourceEvidence, expectedSourceRawByteDigest });
  const source = parseJsonEvidence(sourceEvidence, "legacy source");
  assertBenchmarkSchemaInstance(source, { schemaPath: resolve(root, LEGACY_RESULT_SCHEMA_PATH), label: "legacy source" });
  assertSourceSemantics(source, sourceRelativePath);
  const { catalog, manifest } = readTargetAuthority(root);
  const artifact = buildLegacyCalibrationMigration({ source, sourceEvidence, sourceRelativePath, catalog, manifest });
  assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH), label: "legacy calibration migration" });
  assertMigrationSemantics(artifact);
  return { artifact, sourceEvidence, sourceRelativePath };
}

export function migrateLegacyCalibrationResult({ root = DEFAULT_ROOT, sourcePath, outputPath, expectedSourceRawByteDigest = null }) {
  const absoluteRoot = resolve(root);
  const absoluteSource = resolve(sourcePath);
  const output = assertOutputBoundary({ root: absoluteRoot, sourcePath: absoluteSource, outputPath });
  const derived = deriveFromAuthorities({ root: absoluteRoot, sourcePath: absoluteSource, expectedSourceRawByteDigest });
  const sourceAfter = readStableFile(absoluteSource, "legacy source", MAX_JSON_BYTES, { allowEmpty: false });
  assertStableFileEvidence(derived.sourceEvidence, sourceAfter, "legacy source");
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath: output, artifact: derived.artifact, label: "legacy calibration migration output" }) };
}

export function verifyLegacyCalibrationMigration({ root = DEFAULT_ROOT, sourcePath, migrationPath, expectedSourceRawByteDigest = null }) {
  const absoluteRoot = resolve(root);
  const absoluteSource = resolve(sourcePath);
  assertPathsDisjoint(absoluteSource, migrationPath, "legacy source and migration input");
  const input = readStableFile(migrationPath, "legacy calibration migration input", MAX_JSON_BYTES, { allowEmpty: false });
  const supplied = parseJsonEvidence(input, "legacy calibration migration input");
  assertBenchmarkSchemaInstance(supplied, { schemaPath: resolve(absoluteRoot, LEGACY_CALIBRATION_MIGRATION_SCHEMA_PATH), label: "legacy calibration migration input" });
  assertMigrationSemantics(supplied);
  const derived = deriveFromAuthorities({ root: absoluteRoot, sourcePath: absoluteSource, expectedSourceRawByteDigest });
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("legacy calibration migration input does not match full deterministic rederivation");
  const sourceAfter = readStableFile(absoluteSource, "legacy source", MAX_JSON_BYTES, { allowEmpty: false });
  assertStableFileEvidence(derived.sourceEvidence, sourceAfter, "legacy source");
  const inputAfter = readStableFile(migrationPath, "legacy calibration migration input", MAX_JSON_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, inputAfter, "legacy calibration migration input");
  return { artifact: supplied, inputEvidence: input, sourceEvidence: derived.sourceEvidence };
}

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const PORTFOLIO_CATALOG_SCHEMA_VERSION = "1.0.0";
export const PORTFOLIO_SIMILARITY_CONTRACT_VERSION = "1.0.0";
export const PORTFOLIO_SIMILARITY_THRESHOLD = 7500;

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PORTFOLIO_CATALOG_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-catalog.json");
export const DEFAULT_PORTFOLIO_SIMILARITY_PATH = resolve(DEFAULT_ROOT, "benchmarks/portfolio-similarity.json");
const CATALOG_SCHEMA_PATH = "benchmarks/schemas/portfolio-catalog.schema.json";
const SIMILARITY_SCHEMA_PATH = "benchmarks/schemas/portfolio-similarity.schema.json";
const PRIMARY_SUITE_COUNTS = Object.freeze({
  mechanism_positive: 6,
  mechanism_negative: 6,
  practice_frequency: 8,
  high_impact: 4,
});

export const PRIMARY_FIXTURE_REGISTRY = Object.freeze([
  ["hi-authorization-exception", "high_impact", "pr_review", "security_authorization", "hard", 5],
  ["hi-external-action-approval", "high_impact", "operation_boundary", "iac_operations", "hard", 3],
  ["hi-financial-state-integrity", "high_impact", "investigation_implementation", "backend_financial", "hard", 5],
  ["hi-versioned-migration-safety", "high_impact", "migration_design", "data_schema", "hard", 5],
  ["mn-build-option-update", "mechanism_negative", "configuration", "ci_build", "medium", 3],
  ["mn-client-compatibility-fix", "mechanism_negative", "local_implementation", "client_mobile", "medium", 3],
  ["mn-doc-config-correction", "mechanism_negative", "documentation", "docs_config", "easy", 3],
  ["mn-focused-regression-test", "mechanism_negative", "verification_only", "testing", "medium", 3],
  ["mn-frontend-default-fix", "mechanism_negative", "local_bug_fix", "frontend", "medium", 3],
  ["mn-schema-field-alignment", "mechanism_negative", "small_feature", "data_schema", "easy_medium", 3],
  ["mp-accessibility-interaction-review", "mechanism_positive", "pr_review", "accessibility", "medium_hard", 3],
  ["mp-ci-evidence-gap", "mechanism_positive", "review_verification", "ci_build", "medium_hard", 3],
  ["mp-data-migration-handoff", "mechanism_positive", "handoff_resume", "data_schema", "hard", 3],
  ["mp-frontend-state-review", "mechanism_positive", "pr_review", "frontend", "hard", 3],
  ["mp-iac-rollback-design", "mechanism_positive", "design_gate", "iac_cloud", "hard", 3],
  ["mp-performance-investigation", "mechanism_positive", "investigation", "performance", "hard", 5],
  ["pf-api-pagination-behavior", "practice_frequency", "implementation_verification", "backend_api", "medium", 3],
  ["pf-ci-cache-flake", "practice_frequency", "investigation", "ci_build", "medium_hard", 5],
  ["pf-data-schema-evolution", "practice_frequency", "implementation_verification", "data_schema", "medium", 3],
  ["pf-frontend-async-state", "practice_frequency", "investigation_implementation", "frontend", "medium_hard", 5],
  ["pf-library-compat-upgrade", "practice_frequency", "dependency_migration", "cross_platform", "hard", 3],
  ["pf-observability-redaction", "practice_frequency", "implementation_review", "observability_security", "medium_hard", 3],
  ["pf-performance-regression", "practice_frequency", "investigation_implementation", "performance", "hard", 5],
  ["pf-review-error-contract", "practice_frequency", "pr_review", "backend_api", "medium_hard", 3],
]);

export const CALIBRATION_FIXTURE_REGISTRY = Object.freeze([
  ["cal-atomic-rule-batch", "implementation", "medium-hard", 3],
  ["cal-concurrent-transfer", "implementation", "hard", 5],
  ["cal-export-lease", "review", "hard", 3],
  ["cal-session-refresh", "review", "medium-hard", 3],
]);

const DIFFICULTY_RANK = Object.freeze({
  easy: 0,
  easy_medium: 1,
  medium: 2,
  medium_hard: 3,
  "medium-hard": 3,
  hard: 4,
});
const ANSWER_BEARING_INTENT_PATTERN = /\b(?:oracle|rubric|matcher|hidden[ -]test|expected[ -]patch|expected[ -]decision|reference[ -]patch|scoring[ -]weight|score[ -]threshold)\b/i;

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

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

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareAscii);
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

function assertDeterministicStringArray(values, label, errors) {
  if (!arraysEqual(values, sortedUnique(values))) errors.push(`${label} must be unique and ordered by ASCII code point`);
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function addFraction(left, right) {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function weightedJaccard(left, right, weight) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  const intersection = [...leftSet].filter((value) => rightSet.has(value));
  return { numerator: BigInt(weight * intersection.length), denominator: BigInt(union.size) };
}

function roundedBasisPoints(fractions) {
  const total = fractions.reduce(addFraction, { numerator: 0n, denominator: 1n });
  return Number((2n * total.numerator + total.denominator) / (2n * total.denominator));
}

function formatBasisPoints(value) {
  return `${Math.floor(value / 10000)}.${String(value % 10000).padStart(4, "0")}`;
}

function parseScoreBasisPoints(value) {
  const match = /^(0|1)\.([0-9]{4})$/.exec(value);
  if (!match) throw new Error(`invalid similarity score: ${value}`);
  return Number(match[1]) * 10000 + Number(match[2]);
}

function similarityFor(left, right) {
  const taskClassMatch = left.task_class === right.task_class;
  const domainMatch = left.domain === right.domain;
  const riskBoundaryMatch = left.risk_boundary === right.risk_boundary;
  const basisPoints = roundedBasisPoints([
    { numerator: BigInt(taskClassMatch ? 1500 : 0), denominator: 1n },
    { numerator: BigInt(domainMatch ? 1000 : 0), denominator: 1n },
    weightedJaccard(left.evidence_topologies, right.evidence_topologies, 2000),
    weightedJaccard(left.capability_families, right.capability_families, 2500),
    weightedJaccard(left.outcome_dimensions, right.outcome_dimensions, 2000),
    { numerator: BigInt(riskBoundaryMatch ? 1000 : 0), denominator: 1n },
  ]);
  const hardDuplicate = taskClassMatch
    && domainMatch
    && arraysEqual(left.evidence_topologies, right.evidence_topologies)
    && arraysEqual(left.capability_families, right.capability_families)
    && arraysEqual(left.outcome_dimensions, right.outcome_dimensions)
    && riskBoundaryMatch;
  return { basisPoints, hardDuplicate };
}

function analyzePrimaryPairs(catalog) {
  const fixtures = catalog.fixtures.filter((fixture) => fixture.fixture_role === "primary").sort((left, right) => compareAscii(left.fixture_id, right.fixture_id));
  const pairs = [];
  const errors = [];
  for (let leftIndex = 0; leftIndex < fixtures.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fixtures.length; rightIndex += 1) {
      const left = fixtures[leftIndex];
      const right = fixtures[rightIndex];
      const similarity = similarityFor(left, right);
      const pairId = `${left.fixture_id}::${right.fixture_id}`;
      if (similarity.hardDuplicate) errors.push(`hard duplicate metadata is prohibited: ${pairId}`);
      if (similarity.basisPoints >= PORTFOLIO_SIMILARITY_THRESHOLD) {
        errors.push(`unresolved near-duplicate pair ${pairId} has score ${formatBasisPoints(similarity.basisPoints)}`);
      }
      pairs.push({
        pair_id: pairId,
        left_fixture_id: left.fixture_id,
        right_fixture_id: right.fixture_id,
        score: formatBasisPoints(similarity.basisPoints),
        near_duplicate_candidate: similarity.basisPoints >= PORTFOLIO_SIMILARITY_THRESHOLD,
        hard_duplicate: similarity.hardDuplicate,
      });
    }
  }
  return { pairs, errors };
}

export function computeFixtureMetadataDigest(fixture) {
  return digest(withoutField(fixture, "fixture_metadata_digest"));
}

export function computePortfolioCatalogDigest(catalog) {
  return digest(withoutField(catalog, "catalog_digest"));
}

export function computePortfolioSimilarityDigest(report) {
  return digest(withoutField(report, "report_digest"));
}

export function sealPortfolioCatalog(catalog) {
  const sealed = structuredClone(catalog);
  sealed.fixtures = sealed.fixtures.map((fixture) => ({
    ...withoutField(fixture, "fixture_metadata_digest"),
    fixture_metadata_digest: computeFixtureMetadataDigest(fixture),
  }));
  sealed.catalog_digest = computePortfolioCatalogDigest(sealed);
  return sealed;
}

export function validatePortfolioCatalog(catalog, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(catalog, {
    schemaPath: resolve(root, CATALOG_SCHEMA_PATH),
    label: "portfolio catalog",
  });
  const errors = [];
  const fixtures = catalog.fixtures;
  const fixtureIds = fixtures.map((fixture) => fixture.fixture_id);
  if (!arraysEqual(fixtureIds, [...fixtureIds].sort(compareAscii))) errors.push("catalog fixtures must be ordered by fixture_id");
  if (new Set(fixtureIds).size !== fixtureIds.length) errors.push("fixture IDs must be unique across primary and calibration entries");
  for (const fixture of fixtures) {
    for (const field of ["capability_families", "evidence_topologies", "outcome_dimensions"]) {
      assertDeterministicStringArray(fixture[field], `${fixture.fixture_id}.${field}`, errors);
    }
    if (ANSWER_BEARING_INTENT_PATTERN.test(fixture.public_intent)) errors.push(`${fixture.fixture_id}.public_intent contains answer-bearing terminology`);
    if (fixture.fixture_metadata_digest !== computeFixtureMetadataDigest(fixture)) errors.push(`${fixture.fixture_id} fixture metadata digest does not match`);
    if (fixture.evaluator_binding_required !== "required_pending") errors.push(`${fixture.fixture_id} evaluator binding must remain required_pending`);
  }

  const primary = fixtures.filter((fixture) => fixture.fixture_role === "primary");
  const calibration = fixtures.filter((fixture) => fixture.fixture_role === "calibration");
  if (primary.length !== 24 || catalog.primary_fixture_count !== 24) errors.push(`primary fixture count must be exactly 24, observed ${primary.length}`);
  if (calibration.length !== 4 || catalog.calibration_fixture_count !== 4) errors.push(`calibration fixture count must be exactly 4, observed ${calibration.length}`);

  const suiteCounts = countBy(primary, (fixture) => fixture.suite);
  for (const [suite, expected] of Object.entries(PRIMARY_SUITE_COUNTS)) {
    if ((suiteCounts[suite] ?? 0) !== expected || catalog.suite_counts[suite] !== expected) {
      errors.push(`${suite} suite count must be exactly ${expected}, observed ${suiteCounts[suite] ?? 0}`);
    }
  }
  if (catalog.suite_counts.calibration !== 4) errors.push("catalog calibration suite count must be exactly 4");

  const expectedPrimaryIds = PRIMARY_FIXTURE_REGISTRY.map(([fixtureId]) => fixtureId);
  const actualPrimaryIds = primary.map((fixture) => fixture.fixture_id).sort(compareAscii);
  if (!arraysEqual(actualPrimaryIds, expectedPrimaryIds)) errors.push("primary fixture IDs must exactly match the frozen allowlist");
  const primaryById = new Map(primary.map((fixture) => [fixture.fixture_id, fixture]));
  for (const [fixtureId, suite, taskClass, domain, difficulty, repetitions] of PRIMARY_FIXTURE_REGISTRY) {
    const fixture = primaryById.get(fixtureId);
    if (!fixture) continue;
    for (const [field, expected] of Object.entries({ suite, task_class: taskClass, domain, difficulty, repetitions })) {
      if (fixture[field] !== expected) errors.push(`${fixtureId}.${field} must match the frozen primary registration`);
    }
  }

  const expectedCalibrationIds = CALIBRATION_FIXTURE_REGISTRY.map(([fixtureId]) => fixtureId);
  const actualCalibrationIds = calibration.map((fixture) => fixture.fixture_id).sort(compareAscii);
  if (!arraysEqual(actualCalibrationIds, expectedCalibrationIds)) errors.push("calibration fixture IDs must exactly match the frozen allowlist");
  const calibrationById = new Map(calibration.map((fixture) => [fixture.fixture_id, fixture]));
  for (const [fixtureId, taskClass, difficulty, repetitions] of CALIBRATION_FIXTURE_REGISTRY) {
    const fixture = calibrationById.get(fixtureId);
    if (!fixture) continue;
    if (fixture.task_class !== taskClass || fixture.difficulty !== difficulty || fixture.repetitions !== repetitions) {
      errors.push(`${fixtureId} must preserve its existing task class, difficulty, and repetitions`);
    }
  }

  const backendApiSecurityCount = primary.filter((fixture) => fixture.backend_api_security).length;
  if (backendApiSecurityCount > 12) errors.push(`primary backend/API/security classification must be 12 or fewer, observed ${backendApiSecurityCount}`);
  const nonBackendDomains = new Set(primary.filter((fixture) => !fixture.backend_api_security).map((fixture) => fixture.domain));
  if (nonBackendDomains.size < 4) errors.push(`primary non-backend engineering domains must include at least 4 distinct values, observed ${nonBackendDomains.size}`);
  const negative = primary.filter((fixture) => fixture.suite === "mechanism_negative");
  const mediumOrHarder = negative.filter((fixture) => DIFFICULTY_RANK[fixture.difficulty] >= DIFFICULTY_RANK.medium);
  if (mediumOrHarder.length < 2) errors.push(`mechanism-negative must contain at least 2 fixtures at medium or harder, observed ${mediumOrHarder.length}`);
  if (!negative.some((fixture) => fixture.task_class === "documentation" && fixture.domain === "docs_config" && DIFFICULTY_RANK[fixture.difficulty] < DIFFICULTY_RANK.medium)) {
    errors.push("mechanism-negative must contain an easy small docs/config baseline");
  }
  if (primary.filter((fixture) => fixture.suite === "practice_frequency").some((fixture) => !fixture.lineage_required)) {
    errors.push("every practice-frequency fixture must require lineage");
  }
  if (primary.filter((fixture) => fixture.suite === "high_impact").some((fixture) => fixture.risk_boundary === "none")) {
    errors.push("every high-impact fixture must declare a non-none risk boundary");
  }
  if (calibration.some((fixture) => fixture.aggregate_eligible)) errors.push("calibration fixtures must be aggregate-ineligible");
  if (primary.some((fixture) => !fixture.aggregate_eligible)) errors.push("primary fixtures must be aggregate-eligible for the current catalog revision");
  if (primary.some((fixture) => fixture.admission_state !== "metadata_frozen_evaluator_pending")) errors.push("primary admission state must remain metadata_frozen_evaluator_pending");
  if (calibration.some((fixture) => fixture.admission_state !== "calibration_only")) errors.push("calibration admission state must remain calibration_only");
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog)) errors.push("catalog digest does not match the sorted-key canonical catalog closure");

  const analysis = analyzePrimaryPairs(catalog);
  errors.push(...analysis.errors);
  if (analysis.pairs.length !== 276) errors.push(`similarity matrix must contain exactly 276 primary pairs, observed ${analysis.pairs.length}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    primaryFixtureCount: primary.length,
    calibrationFixtureCount: calibration.length,
    domainCount: new Set(primary.map((fixture) => fixture.domain)).size,
    nonBackendDomainCount: nonBackendDomains.size,
    backendApiSecurityCount,
    pairs: analysis.pairs,
  };
}

export function buildPortfolioSimilarityReport(catalog, { root = DEFAULT_ROOT } = {}) {
  const summary = validatePortfolioCatalog(catalog, { root });
  const maximumBasisPoints = Math.max(...summary.pairs.map((pair) => parseScoreBasisPoints(pair.score)));
  const report = {
    schema_version: PORTFOLIO_CATALOG_SCHEMA_VERSION,
    schema_path: SIMILARITY_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    similarity_contract_version: PORTFOLIO_SIMILARITY_CONTRACT_VERSION,
    catalog_digest: catalog.catalog_digest,
    primary_fixture_count: summary.primaryFixtureCount,
    pair_count: summary.pairs.length,
    threshold: formatBasisPoints(PORTFOLIO_SIMILARITY_THRESHOLD),
    maximum_similarity_score: formatBasisPoints(maximumBasisPoints),
    pairs: summary.pairs,
  };
  report.report_digest = computePortfolioSimilarityDigest(report);
  return report;
}

export function validatePortfolioCatalogArtifacts({
  root = DEFAULT_ROOT,
  catalogPath = resolve(root, "benchmarks/portfolio-catalog.json"),
  similarityPath = resolve(root, "benchmarks/portfolio-similarity.json"),
} = {}) {
  const catalog = readJson(catalogPath, "portfolio catalog");
  const summary = validatePortfolioCatalog(catalog, { root });
  const report = readJson(similarityPath, "portfolio similarity report");
  assertBenchmarkSchemaInstance(report, {
    schemaPath: resolve(root, SIMILARITY_SCHEMA_PATH),
    label: "portfolio similarity report",
  });
  if (report.report_digest !== computePortfolioSimilarityDigest(report)) throw new Error("similarity report digest does not match the sorted-key canonical report closure");
  if (report.catalog_digest !== catalog.catalog_digest) throw new Error("similarity report catalog digest does not match the catalog");
  const expected = buildPortfolioSimilarityReport(catalog, { root });
  if (stableCanonicalJson(report) !== stableCanonicalJson(expected)) throw new Error("similarity report does not match deterministic recomputation");
  if (readFileSync(similarityPath, "utf8") !== serializeJson(expected)) throw new Error("similarity report bytes do not match deterministic serialization");
  return {
    ...summary,
    maximumSimilarityScore: report.maximum_similarity_score,
    pairCount: report.pair_count,
    catalogDigest: catalog.catalog_digest,
    reportDigest: report.report_digest,
  };
}

function parseArgs(argv) {
  const args = {
    command: argv.shift(),
    catalogPath: DEFAULT_PORTFOLIO_CATALOG_PATH,
    similarityPath: DEFAULT_PORTFOLIO_SIMILARITY_PATH,
  };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--catalog") args.catalogPath = resolve(argv.shift());
    else if (flag === "--similarity") args.similarityPath = resolve(argv.shift());
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark-portfolio-catalog.mjs <command> [options]

Commands:
  validate [--catalog <catalog.json>] [--similarity <similarity.json>]
  write [--catalog <catalog.json>] [--similarity <similarity.json>]
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "validate") {
      const summary = validatePortfolioCatalogArtifacts({ catalogPath: args.catalogPath, similarityPath: args.similarityPath });
      console.log(`Portfolio catalog validation passed: primary=${summary.primaryFixtureCount}, calibration=${summary.calibrationFixtureCount}, pairs=${summary.pairCount}, max_similarity=${summary.maximumSimilarityScore}`);
    } else if (args.command === "write") {
      const catalog = sealPortfolioCatalog(readJson(args.catalogPath, "portfolio catalog"));
      const report = buildPortfolioSimilarityReport(catalog);
      writeFileSync(args.catalogPath, serializeJson(catalog));
      writeFileSync(args.similarityPath, serializeJson(report));
      console.log(`Portfolio catalog artifacts written: ${args.catalogPath}, ${args.similarityPath}`);
    } else if (args.command === "help" || !args.command) help();
    else throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(`Portfolio catalog failed: ${error.message}`);
    process.exitCode = 1;
  }
}

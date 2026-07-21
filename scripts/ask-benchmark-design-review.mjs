#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { validatePortfolioDesignAdmissionArtifacts } from "./ask-benchmark-design-admission.mjs";

export const PORTFOLIO_DESIGN_REVIEW_SCHEMA_VERSION = "1.0.0";
export const PORTFOLIO_DESIGN_REVIEW_REVISION = "issue-205-checkpoint-b2b-r1";
export const PORTFOLIO_DESIGN_REVIEWED_HEAD_SHA = "875a23e820b92c8c7d42f566d1ef24cb650b3516";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = "benchmarks/portfolio-catalog.json";
const POLICY_MANIFEST_PATH = "benchmarks/portfolio-policy-manifest.json";
const DESIGN_MANIFEST_PATH = "benchmarks/portfolio-design-admission-manifest.json";
const PENDING_REVIEW_PACKAGE_PATH = "benchmarks/portfolio-design-review-package.json";
const INDEPENDENT_REVIEW_PATH = "benchmarks/portfolio-design-independent-review.json";
const REVIEWED_STATE_PATH = "benchmarks/portfolio-design-reviewed-state.json";
const INDEPENDENT_REVIEW_SCHEMA_PATH = "benchmarks/schemas/portfolio-design-independent-review.schema.json";
const REVIEWED_STATE_SCHEMA_PATH = "benchmarks/schemas/portfolio-design-reviewed-state.schema.json";

export const DEFAULT_PORTFOLIO_DESIGN_INDEPENDENT_REVIEW_PATH = resolve(DEFAULT_ROOT, INDEPENDENT_REVIEW_PATH);
export const DEFAULT_PORTFOLIO_DESIGN_REVIEWED_STATE_PATH = resolve(DEFAULT_ROOT, REVIEWED_STATE_PATH);

export const PORTFOLIO_DESIGN_REVIEW_DIMENSIONS = Object.freeze([
  "ordinary_engineering_wording",
  "plain_fair_path",
  "kernel_only_fair_path",
  "mechanism_diversity",
  "domain_realism",
  "difficulty_realism",
  "ask_vocabulary_cue_absence",
  "answer_leakage_absence",
  "output_contract_appropriateness",
  "admission_gate_applicability",
  "child_issue_ownership",
]);

const PORTFOLIO_DIMENSION_ASSESSMENTS = Object.freeze([
  ["ordinary_engineering_wording", "All 24 intents are ordinary engineering requests and do not describe the benchmark mechanism."],
  ["plain_fair_path", "Every record exposes agent-visible evidence topology and a task-type-appropriate Plain path without requiring hidden ASK assets."],
  ["kernel_only_fair_path", "Kernel guidance is limited to structure, scope, evidence, risk, and verification; it does not supply fixture-specific conclusions."],
  ["mechanism_diversity", "The frozen 6/6/8/4 portfolio spans review, investigation, implementation, verification, migration, handoff, design, and operation boundaries without an unresolved metadata duplicate."],
  ["domain_realism", "Frontend, accessibility, CI/build, IaC/operations, data/schema, performance, testing, client compatibility, observability, backend/API, financial, and authorization domains are represented."],
  ["difficulty_realism", "The set contains lightweight easy/medium negative controls, medium-hard recurring work, and hard high-impact/design tasks; repetition counts remain consistent with the catalog."],
  ["ask_vocabulary_cue_absence", "Public intents contain no ASK, condition, routing, or scoring cue."],
  ["answer_leakage_absence", "Records contain intent, topology, count bands, and gate plans only; no concrete defect, patch, decision, matcher, oracle, hidden test, or scoring weight is disclosed."],
  ["output_contract_appropriateness", "Review/investigation tasks are findings-producing, design/handoff/operation tasks are plan-producing, and implementation/verification/migration tasks are implementation-producing."],
  ["admission_gate_applicability", "Gate plans match the frozen selectors, including review false-positive controls and risk/high-impact unauthorized-attempt observability, and require final selector re-derivation."],
  ["child_issue_ownership", "Suite ownership is exact: #206=6, #207=6, #208=8, #209=4."],
]);

const EXPECTED_REVIEW_SCOPE = Object.freeze({
  source_state: "design_pending",
  reviewed_state: "design_reviewed",
  final_admission_evaluated: false,
  implementation_pending_evaluated: false,
  actual_fixture_evidence_reviewed: false,
  actual_requirement_or_output_contract_reviewed: false,
  private_evaluator_reviewed: false,
  actual_lineage_or_scoring_reviewed: false,
  pilot_or_measured_result_reviewed: false,
});

const EXPECTED_EXTERNAL_EVIDENCE = Object.freeze({
  evidence_type: "github_pr_comment",
  repository: "ist-h-i/agent-spectrum-kernel",
  pull_request_number: 215,
  comment_id: 5029786494,
  comment_url: "https://github.com/ist-h-i/agent-spectrum-kernel/pull/215#issuecomment-5029786494",
  comment_created_at: "2026-07-21T03:18:45Z",
  comment_updated_at: "2026-07-21T03:19:38Z",
  comment_body_digest: "sha256:9ef23037ba2aaa92cfbf7d45fe81f1cd837d884e97db9a89cbb0647286592755",
  reviewer_identity: "chatgpt:gpt-5.6-thinking",
  github_transport_actor: "ist-h-i",
  github_author_association: "OWNER",
  github_app_slug: "chatgpt-codex-connector",
  comment_transport_actor_is_reviewer: false,
  github_transport_uses_repository_owner_account: true,
  remote_comment_content_cryptographically_verified_offline: false,
});

const EXPECTED_RESIDUAL_REQUIREMENTS = Object.freeze([
  "actual_agent_visible_bytes_require_fair_access_revalidation",
  "actual_evidence_requires_recoverability_revalidation",
]);

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

function assertCanonicalEqual(actual, expected, label) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} drift`);
}

function assertInsideRepository(root, path, label) {
  const roots = [resolve(root), realpathSync(root)];
  const absolute = resolve(path);
  if (!roots.some((candidate) => absolute === candidate || absolute.startsWith(`${candidate}${sep}`))) throw new Error(`${label} path escapes the repository root`);
  return absolute;
}

function assertRegularNonSymlink(path, root, label) {
  const absolute = assertInsideRepository(root, path, label);
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`);
  const stats = lstatSync(absolute);
  if (stats.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`);
  assertInsideRepository(root, realpathSync(absolute), label);
  return absolute;
}

export function computePortfolioDesignReviewPayloadDigest(reviewPayload) {
  return digest(reviewPayload);
}

export function computePortfolioDesignReviewItemDigest(reviewItem) {
  return digest(withoutField(reviewItem, "review_item_digest"));
}

export function computePortfolioDesignIndependentReviewDigest(review) {
  return digest(withoutField(review, "review_record_digest"));
}

export function computePortfolioDesignReviewedStateDigest(reviewedState) {
  return digest(withoutField(reviewedState, "projection_digest"));
}

function expectedDimensionAssessments() {
  return PORTFOLIO_DIMENSION_ASSESSMENTS.map(([dimensionId, assessment]) => ({
    dimension_id: dimensionId,
    result: "pass",
    assessment,
  }));
}

function expectedDimensionResults() {
  return PORTFOLIO_DESIGN_REVIEW_DIMENSIONS.map((dimensionId) => ({ dimension_id: dimensionId, result: "pass" }));
}

function readB2aSources(root) {
  validatePortfolioDesignAdmissionArtifacts({ root });
  const catalog = readJson(resolve(root, CATALOG_PATH), "portfolio catalog");
  const policyManifest = readJson(resolve(root, POLICY_MANIFEST_PATH), "portfolio policy manifest");
  const designManifest = readJson(resolve(root, DESIGN_MANIFEST_PATH), "design admission manifest");
  const pendingReviewPackage = readJson(resolve(root, PENDING_REVIEW_PACKAGE_PATH), "pending design review package");
  const designRecords = designManifest.records.map((reference) => readJson(resolve(root, reference.record_path), `design record ${reference.fixture_id}`));
  return { catalog, policyManifest, designManifest, pendingReviewPackage, designRecords };
}

function expectedReviewedInput(sources) {
  return {
    repository: "ist-h-i/agent-spectrum-kernel",
    pull_request_number: 215,
    reviewed_head_sha: PORTFOLIO_DESIGN_REVIEWED_HEAD_SHA,
    catalog_digest: sources.catalog.catalog_digest,
    policy_revision: sources.policyManifest.policy_revision,
    policy_manifest_digest: sources.policyManifest.manifest_digest,
    design_manifest: { path: DESIGN_MANIFEST_PATH, digest: sources.designManifest.manifest_digest },
    pending_review_package: { path: PENDING_REVIEW_PACKAGE_PATH, digest: sources.pendingReviewPackage.package_digest },
    design_records: structuredClone(sources.designManifest.records),
  };
}

function validateFixtureReviews(review, sources) {
  const fixtureIds = sources.designManifest.records.map((reference) => reference.fixture_id);
  const actualIds = review.fixture_reviews.map((item) => item.fixture_id);
  if (!arraysEqual(actualIds, fixtureIds)) throw new Error("fixture review inventory must exactly match the reviewed design manifest in order");
  if (new Set(actualIds).size !== actualIds.length) throw new Error("fixture review IDs must be unique");
  if (actualIds.some((fixtureId) => fixtureId.startsWith("cal-"))) throw new Error("calibration fixture must not enter independent design review");
  const recordByFixture = new Map(sources.designRecords.map((record) => [record.fixture_id, record]));
  for (let index = 0; index < review.fixture_reviews.length; index += 1) {
    const item = review.fixture_reviews[index];
    const reference = sources.designManifest.records[index];
    const record = recordByFixture.get(item.fixture_id);
    if (!record) throw new Error(`unknown fixture review: ${item.fixture_id}`);
    const expectedBinding = {
      fixture_id: reference.fixture_id,
      design_record_id: reference.record_id,
      design_record_path: reference.record_path,
      design_record_digest: reference.record_digest,
      implementation_owner_issue: record.implementation_owner_issue,
    };
    for (const [field, expected] of Object.entries(expectedBinding)) {
      if (item[field] !== expected) throw new Error(`${item.fixture_id}.${field} does not match the reviewed B2a record`);
    }
    assertCanonicalEqual(item.dimension_results, expectedDimensionResults(), `${item.fixture_id} dimension completeness or order`);
    if (item.design_review_status !== "approved_design_review") throw new Error(`${item.fixture_id} must be approved at design-review level`);
    if (item.final_admission_status !== "not_evaluated") throw new Error(`${item.fixture_id} final admission must remain not_evaluated`);
    if (item.actual_fixture_evidence_reviewed !== false) throw new Error(`${item.fixture_id} actual fixture evidence must remain unreviewed`);
    if (item.review_item_digest !== computePortfolioDesignReviewItemDigest(item)) throw new Error(`${item.fixture_id} review item digest drift`);
  }
}

export function validatePortfolioDesignIndependentReview({
  root = DEFAULT_ROOT,
  independentReviewPath = resolve(root, INDEPENDENT_REVIEW_PATH),
} = {}) {
  const sources = readB2aSources(root);
  const reviewFile = assertRegularNonSymlink(independentReviewPath, root, "independent design review");
  const review = readJson(reviewFile, "independent design review");
  assertBenchmarkSchemaInstance(review, {
    schemaPath: resolve(root, INDEPENDENT_REVIEW_SCHEMA_PATH),
    label: "independent design review",
  });

  if (review.reviewer_identity !== "chatgpt:gpt-5.6-thinking") throw new Error("independent reviewer identity drift");
  if (review.reviewer_class !== "independent_ai_review") throw new Error("independent reviewer class drift");
  if (review.human_review !== false) throw new Error("independent AI review must not claim human review");
  if (review.identity_assurance !== "repository_owner_attested_chatgpt_session") throw new Error("reviewer identity assurance drift");
  if (review.cryptographic_reviewer_signature_present !== false) throw new Error("review must not claim a cryptographic reviewer signature");
  assertCanonicalEqual(review.reviewed_input, expectedReviewedInput(sources), "reviewed input binding");
  assertCanonicalEqual(review.external_review_evidence, EXPECTED_EXTERNAL_EVIDENCE, "external review evidence identity");
  assertCanonicalEqual(review.review_payload.portfolio_dimensions, expectedDimensionAssessments(), "portfolio review dimensions, results, order, or assessments");
  const fixtureIds = sources.designManifest.records.map((reference) => reference.fixture_id);
  if (!arraysEqual(review.review_payload.approved_fixture_ids, fixtureIds)) throw new Error("approved fixture inventory must exactly match the reviewed design manifest in order");
  assertCanonicalEqual(review.review_payload.scope, EXPECTED_REVIEW_SCOPE, "independent review scope");
  if (!arraysEqual(review.review_payload.residual_requirements, EXPECTED_RESIDUAL_REQUIREMENTS)) throw new Error("independent review residual requirements drift");
  if (review.review_payload_digest !== computePortfolioDesignReviewPayloadDigest(review.review_payload)) throw new Error("independent review payload digest drift");
  validateFixtureReviews(review, sources);
  if (review.portfolio_design_review_status !== "approved_design_review") throw new Error("portfolio must be approved at design-review level only");
  if (review.review_record_digest !== computePortfolioDesignIndependentReviewDigest(review)) throw new Error("independent review record digest drift");
  if (readFileSync(reviewFile, "utf8") !== serializeJson(review)) throw new Error("independent design review bytes do not match deterministic serialization");

  return {
    reviewRevision: review.review_revision,
    reviewedHeadSha: review.reviewed_input.reviewed_head_sha,
    reviewerIdentity: review.reviewer_identity,
    reviewerClass: review.reviewer_class,
    humanReview: review.human_review,
    reviewedFixtureCount: review.fixture_reviews.length,
    passedPortfolioDimensionCount: review.review_payload.portfolio_dimensions.filter((dimension) => dimension.result === "pass").length,
    reviewRecordDigest: review.review_record_digest,
  };
}

export function buildPortfolioDesignReviewedState({
  root = DEFAULT_ROOT,
  independentReviewPath = resolve(root, INDEPENDENT_REVIEW_PATH),
} = {}) {
  validatePortfolioDesignIndependentReview({ root, independentReviewPath });
  const review = readJson(independentReviewPath, "independent design review");
  const reviewedState = {
    schema_version: PORTFOLIO_DESIGN_REVIEW_SCHEMA_VERSION,
    schema_path: REVIEWED_STATE_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    projection_revision: PORTFOLIO_DESIGN_REVIEW_REVISION,
    source_state: "design_pending",
    projected_state: "design_reviewed",
    source_design_manifest: structuredClone(review.reviewed_input.design_manifest),
    source_pending_review_package: structuredClone(review.reviewed_input.pending_review_package),
    independent_review: { path: INDEPENDENT_REVIEW_PATH, digest: review.review_record_digest },
    fixture_ids: review.fixture_reviews.map((item) => item.fixture_id),
    fixture_reviews: review.fixture_reviews.map((item) => ({ fixture_id: item.fixture_id, review_item_digest: item.review_item_digest })),
    all_records_approved: true,
    final_admission_implied: false,
    implementation_authorized: false,
    actual_requirement_evidence_verified: false,
    actual_output_contract_evidence_verified: false,
    actual_evaluator_evidence_verified: false,
    actual_lineage_evidence_verified: false,
  };
  reviewedState.projection_digest = computePortfolioDesignReviewedStateDigest(reviewedState);
  assertBenchmarkSchemaInstance(reviewedState, {
    schemaPath: resolve(root, REVIEWED_STATE_SCHEMA_PATH),
    label: "portfolio design reviewed state",
  });
  return reviewedState;
}

export function validatePortfolioDesignReviewedState({
  root = DEFAULT_ROOT,
  independentReviewPath = resolve(root, INDEPENDENT_REVIEW_PATH),
  reviewedStatePath = resolve(root, REVIEWED_STATE_PATH),
} = {}) {
  const stateFile = assertRegularNonSymlink(reviewedStatePath, root, "portfolio design reviewed state");
  const actual = readJson(stateFile, "portfolio design reviewed state");
  assertBenchmarkSchemaInstance(actual, {
    schemaPath: resolve(root, REVIEWED_STATE_SCHEMA_PATH),
    label: "portfolio design reviewed state",
  });
  const expected = buildPortfolioDesignReviewedState({ root, independentReviewPath });
  assertCanonicalEqual(actual, expected, "portfolio design reviewed-state projection");
  if (actual.projection_digest !== computePortfolioDesignReviewedStateDigest(actual)) throw new Error("portfolio design reviewed-state projection digest drift");
  if (readFileSync(stateFile, "utf8") !== serializeJson(actual)) throw new Error("portfolio design reviewed-state bytes do not match deterministic serialization");
  return {
    projectionRevision: actual.projection_revision,
    sourceState: actual.source_state,
    projectedState: actual.projected_state,
    fixtureCount: actual.fixture_ids.length,
    allRecordsApproved: actual.all_records_approved,
    finalAdmissionImplied: actual.final_admission_implied,
    implementationAuthorized: actual.implementation_authorized,
    projectionDigest: actual.projection_digest,
  };
}

export function writePortfolioDesignReviewedState({
  root = DEFAULT_ROOT,
  independentReviewPath = resolve(root, INDEPENDENT_REVIEW_PATH),
  reviewedStatePath = resolve(root, REVIEWED_STATE_PATH),
} = {}) {
  const reviewedState = buildPortfolioDesignReviewedState({ root, independentReviewPath });
  const output = assertInsideRepository(root, reviewedStatePath, "portfolio design reviewed state output");
  if (existsSync(output)) {
    const stats = lstatSync(output);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("portfolio design reviewed-state output must be a regular non-symlink file");
  }
  writeFileSync(output, serializeJson(reviewedState));
  return reviewedState;
}

function parseArgs(argv) {
  const args = { command: argv.shift(), root: DEFAULT_ROOT };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--root") args.root = resolve(argv.shift());
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark-design-review.mjs <command> [options]

Commands:
  validate [--root <repository>]
  validate-review [--root <repository>]
  validate-reviewed-state [--root <repository>]
  write-reviewed-state [--root <repository>]

The independent review artifact is externally authored evidence. This script never creates or modifies it.
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "validate") {
      const review = validatePortfolioDesignIndependentReview({ root: args.root });
      const state = validatePortfolioDesignReviewedState({ root: args.root });
      console.log(`Adaptive ASK portfolio design review validation passed: revision=${review.reviewRevision}, reviewer=${review.reviewerIdentity}, fixtures=${review.reviewedFixtureCount}, state=${state.projectedState}`);
    } else if (args.command === "validate-review") {
      const summary = validatePortfolioDesignIndependentReview({ root: args.root });
      console.log(`Adaptive ASK portfolio independent review validation passed: revision=${summary.reviewRevision}, head=${summary.reviewedHeadSha}, fixtures=${summary.reviewedFixtureCount}, dimensions=${summary.passedPortfolioDimensionCount}`);
    } else if (args.command === "validate-reviewed-state") {
      const summary = validatePortfolioDesignReviewedState({ root: args.root });
      console.log(`Adaptive ASK portfolio reviewed-state validation passed: state=${summary.projectedState}, fixtures=${summary.fixtureCount}, final_admission=${summary.finalAdmissionImplied}`);
    } else if (args.command === "write-reviewed-state") {
      const state = writePortfolioDesignReviewedState({ root: args.root });
      console.log(`Adaptive ASK portfolio reviewed-state projection written: state=${state.projected_state}, fixtures=${state.fixture_ids.length}`);
    } else if (args.command === "help" || !args.command) help();
    else throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(`portfolio design review failed: ${error.message}`);
    process.exitCode = 1;
  }
}

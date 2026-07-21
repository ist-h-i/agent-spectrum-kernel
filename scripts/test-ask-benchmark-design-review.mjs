#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  buildPortfolioDesignReviewedState,
  computePortfolioDesignIndependentReviewDigest,
  computePortfolioDesignReviewItemDigest,
  computePortfolioDesignReviewPayloadDigest,
  computePortfolioDesignReviewedStateDigest,
  validatePortfolioDesignIndependentReview,
  validatePortfolioDesignReviewedState,
  writePortfolioDesignReviewedState,
} from "./ask-benchmark-design-review.mjs";
import { writePortfolioDesignAdmissionArtifacts } from "./ask-benchmark-design-admission.mjs";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(resolve(tmpdir(), "ask-design-review-test-"));

const FIXTURE_PATHS = [
  "benchmarks/portfolio-catalog.json",
  "benchmarks/portfolio-similarity.json",
  "benchmarks/portfolio-policy-manifest.json",
  "benchmarks/portfolio-admission-policy.json",
  "benchmarks/portfolio-scoring-policy.json",
  "benchmarks/portfolio-lineage-policy.json",
  "benchmarks/portfolio-design-admission-manifest.json",
  "benchmarks/portfolio-design-review-package.json",
  "benchmarks/portfolio-design-admission-records",
  "benchmarks/portfolio-design-independent-review.json",
  "benchmarks/portfolio-design-reviewed-state.json",
  "benchmarks/schemas",
];

function readJson(fixtureRoot, path) {
  return JSON.parse(readFileSync(resolve(fixtureRoot, path), "utf8"));
}

function writeJson(fixtureRoot, path, value, { compact = false } = {}) {
  const target = resolve(fixtureRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`);
}

function cloneFixture(name) {
  const fixtureRoot = resolve(work, name);
  mkdirSync(fixtureRoot, { recursive: true });
  for (const path of FIXTURE_PATHS) {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(root, path), target, { recursive: true });
  }
  return fixtureRoot;
}

function resealReview(review) {
  for (const item of review.fixture_reviews) item.review_item_digest = computePortfolioDesignReviewItemDigest(item);
  review.review_payload_digest = computePortfolioDesignReviewPayloadDigest(review.review_payload);
  review.review_record_digest = computePortfolioDesignIndependentReviewDigest(review);
}

function resealState(state) {
  state.projection_digest = computePortfolioDesignReviewedStateDigest(state);
}

function expectReviewFailure(name, mutate, expected, { reseal = true } = {}) {
  const fixtureRoot = cloneFixture(name);
  const path = "benchmarks/portfolio-design-independent-review.json";
  const review = readJson(fixtureRoot, path);
  mutate(review, fixtureRoot);
  if (reseal) resealReview(review);
  writeJson(fixtureRoot, path, review);
  assert.throws(() => validatePortfolioDesignIndependentReview({ root: fixtureRoot }), expected, name);
}

function expectStateFailure(name, mutate, expected, { reseal = true } = {}) {
  const fixtureRoot = cloneFixture(name);
  const path = "benchmarks/portfolio-design-reviewed-state.json";
  const state = readJson(fixtureRoot, path);
  mutate(state, fixtureRoot);
  if (reseal) resealState(state);
  writeJson(fixtureRoot, path, state);
  assert.throws(() => validatePortfolioDesignReviewedState({ root: fixtureRoot }), expected, name);
}

try {
  const reviewSummary = validatePortfolioDesignIndependentReview({ root });
  const stateSummary = validatePortfolioDesignReviewedState({ root });
  const first = buildPortfolioDesignReviewedState({ root });
  const second = buildPortfolioDesignReviewedState({ root });

  assert.equal(reviewSummary.reviewedFixtureCount, 24);
  assert.equal(reviewSummary.passedPortfolioDimensionCount, 11);
  assert.equal(reviewSummary.humanReview, false);
  assert.equal(stateSummary.projectedState, "design_reviewed");
  assert.equal(stateSummary.finalAdmissionImplied, false);
  assert.equal(stateSummary.implementationAuthorized, false);
  assert.equal(JSON.stringify(first), JSON.stringify(second), "two reviewed-state builds must have identical bytes");
  assert.equal(
    readFileSync(resolve(root, "benchmarks/portfolio-design-reviewed-state.json"), "utf8"),
    `${JSON.stringify(first, null, 2)}\n`,
    "checked-in reviewed-state bytes must be deterministic",
  );

  expectReviewFailure("fabricated-reviewer-identity", (review) => {
    review.reviewer_identity = "chatgpt:unverified";
  }, /reviewer_identity|reviewer identity/i);

  expectReviewFailure("reviewer-class-drift", (review) => {
    review.reviewer_class = "human_review";
  }, /reviewer_class|reviewer class/i);

  expectReviewFailure("human-review-claim", (review) => {
    review.human_review = true;
  }, /human_review|human review/i);

  expectReviewFailure("signature-claim", (review) => {
    review.cryptographic_reviewer_signature_present = true;
  }, /cryptographic_reviewer_signature_present|cryptographic reviewer signature/i);

  expectReviewFailure("reviewed-head-drift", (review) => {
    review.reviewed_input.reviewed_head_sha = "f".repeat(40);
  }, /reviewed_head_sha|reviewed input binding/i);

  expectReviewFailure("catalog-digest-drift", (review) => {
    review.reviewed_input.catalog_digest = `sha256:${"f".repeat(64)}`;
  }, /catalog_digest|reviewed input binding/i);

  expectReviewFailure("policy-revision-drift", (review) => {
    review.reviewed_input.policy_revision = "issue-205-checkpoint-b1-r4";
  }, /policy_revision|reviewed input binding/i);

  expectReviewFailure("policy-digest-drift", (review) => {
    review.reviewed_input.policy_manifest_digest = `sha256:${"f".repeat(64)}`;
  }, /policy_manifest_digest|reviewed input binding/i);

  expectReviewFailure("design-manifest-digest-drift", (review) => {
    review.reviewed_input.design_manifest.digest = `sha256:${"f".repeat(64)}`;
  }, /design_manifest|reviewed input binding/i);

  expectReviewFailure("pending-package-digest-drift", (review) => {
    review.reviewed_input.pending_review_package.digest = `sha256:${"f".repeat(64)}`;
  }, /pending_review_package|reviewed input binding/i);

  expectReviewFailure("comment-id-drift", (review) => {
    review.external_review_evidence.comment_id = 5029786495;
  }, /comment_id|external review evidence/i);

  expectReviewFailure("comment-url-drift", (review) => {
    review.external_review_evidence.comment_url = "https://github.com/ist-h-i/agent-spectrum-kernel/pull/215#issuecomment-1";
  }, /comment_url|external review evidence/i);

  expectReviewFailure("transport-actor-as-reviewer", (review) => {
    review.external_review_evidence.comment_transport_actor_is_reviewer = true;
  }, /comment_transport_actor_is_reviewer|external review evidence/i);

  expectReviewFailure("dimension-missing", (review) => {
    review.review_payload.portfolio_dimensions.pop();
  }, /11 item|11 items|too few items|portfolio review dimensions/i);

  expectReviewFailure("dimension-order-drift", (review) => {
    [review.review_payload.portfolio_dimensions[0], review.review_payload.portfolio_dimensions[1]] = [review.review_payload.portfolio_dimensions[1], review.review_payload.portfolio_dimensions[0]];
  }, /portfolio review dimensions/i);

  expectReviewFailure("portfolio-dimension-fail", (review) => {
    review.review_payload.portfolio_dimensions[0].result = "fail";
  }, /result|portfolio review dimensions/i);

  expectReviewFailure("fixture-dimension-unknown", (review) => {
    review.fixture_reviews[0].dimension_results[0].result = "unknown";
  }, /result|dimension completeness/i);

  expectReviewFailure("fixture-review-missing", (review) => {
    review.fixture_reviews.pop();
  }, /24 item|24 items|too few items|fixture review inventory/i);

  expectReviewFailure("duplicate-fixture-review", (review) => {
    review.fixture_reviews[1] = structuredClone(review.fixture_reviews[0]);
  }, /fixture review inventory|unique/i);

  expectReviewFailure("calibration-fixture-review", (review) => {
    review.fixture_reviews[0].fixture_id = "cal-atomic-rule-batch";
  }, /calibration fixture|fixture review inventory/i);

  expectReviewFailure("record-digest-transplant", (review) => {
    review.fixture_reviews[0].design_record_digest = review.fixture_reviews[1].design_record_digest;
  }, /design_record_digest/);

  expectReviewFailure("record-path-transplant", (review) => {
    review.fixture_reviews[0].design_record_path = review.fixture_reviews[1].design_record_path;
  }, /design_record_path/);

  expectReviewFailure("child-issue-owner-drift", (review) => {
    review.fixture_reviews[0].implementation_owner_issue = 206;
  }, /implementation_owner_issue/);

  expectReviewFailure("partial-approval", (review) => {
    review.fixture_reviews[0].design_review_status = "pending_independent_review";
  }, /design_review_status|approved at design-review level/i);

  expectReviewFailure("final-admission-approval", (review) => {
    review.fixture_reviews[0].final_admission_status = "approved";
  }, /final_admission_status|final admission/i);

  expectReviewFailure("actual-fixture-evidence-claim", (review) => {
    review.fixture_reviews[0].actual_fixture_evidence_reviewed = true;
  }, /actual_fixture_evidence_reviewed|actual fixture evidence/i);

  expectReviewFailure("review-item-digest-drift", (review) => {
    review.fixture_reviews[0].review_item_digest = `sha256:${"f".repeat(64)}`;
  }, /review item digest drift/, { reseal: false });

  expectReviewFailure("review-record-digest-drift", (review) => {
    review.review_record_digest = `sha256:${"f".repeat(64)}`;
  }, /review record digest drift/, { reseal: false });

  expectStateFailure("implementation-authorized", (state) => {
    state.implementation_authorized = true;
  }, /implementation_authorized|const/i);

  expectStateFailure("projection-digest-drift", (state) => {
    state.projection_digest = `sha256:${"f".repeat(64)}`;
  }, /reviewed-state projection drift|projection digest drift/, { reseal: false });

  expectReviewFailure("unknown-property", (review) => {
    review.unreviewed_extension = true;
  }, /unknown property|additional propert/i);

  {
    const fixtureRoot = cloneFixture("source-record-byte-change");
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    const path = manifest.records[0].record_path;
    writeJson(fixtureRoot, path, readJson(fixtureRoot, path), { compact: true });
    assert.throws(() => validatePortfolioDesignIndependentReview({ root: fixtureRoot }), /bytes do not match deterministic serialization/);
  }

  {
    const fixtureRoot = cloneFixture("source-manifest-byte-change");
    const path = "benchmarks/portfolio-design-admission-manifest.json";
    writeJson(fixtureRoot, path, readJson(fixtureRoot, path), { compact: true });
    assert.throws(() => validatePortfolioDesignIndependentReview({ root: fixtureRoot }), /manifest bytes do not match deterministic serialization/);
  }

  {
    const fixtureRoot = cloneFixture("source-pending-package-byte-change");
    const path = "benchmarks/portfolio-design-review-package.json";
    writeJson(fixtureRoot, path, readJson(fixtureRoot, path), { compact: true });
    assert.throws(() => validatePortfolioDesignIndependentReview({ root: fixtureRoot }), /review package bytes do not match deterministic serialization/);
  }

  {
    const fixtureRoot = cloneFixture("review-symlink");
    const path = resolve(fixtureRoot, "benchmarks/portfolio-design-independent-review.json");
    const target = resolve(fixtureRoot, "benchmarks/review-symlink-target.json");
    cpSync(path, target);
    rmSync(path);
    symlinkSync(target, path);
    assert.throws(() => validatePortfolioDesignIndependentReview({ root: fixtureRoot }), /must not be a symlink/);
  }

  {
    const fixtureRoot = cloneFixture("review-path-escape");
    assert.throws(
      () => validatePortfolioDesignIndependentReview({ root: fixtureRoot, independentReviewPath: resolve(fixtureRoot, "../escaped-review.json") }),
      /path escapes the repository root/,
    );
  }

  {
    const fixtureRoot = cloneFixture("validation-failure-no-write");
    const reviewPath = "benchmarks/portfolio-design-independent-review.json";
    const statePath = resolve(fixtureRoot, "benchmarks/portfolio-design-reviewed-state.json");
    const review = readJson(fixtureRoot, reviewPath);
    review.reviewed_input.reviewed_head_sha = "f".repeat(40);
    resealReview(review);
    writeJson(fixtureRoot, reviewPath, review);
    rmSync(statePath);
    assert.throws(() => writePortfolioDesignReviewedState({ root: fixtureRoot }), /reviewed_head_sha|reviewed input binding/i);
    assert.equal(existsSync(statePath), false, "review validation failure must not write reviewed state");
  }

  {
    const fixtureRoot = cloneFixture("b2a-generator-boundary");
    const reviewPath = resolve(fixtureRoot, "benchmarks/portfolio-design-independent-review.json");
    const statePath = resolve(fixtureRoot, "benchmarks/portfolio-design-reviewed-state.json");
    const reviewBytes = readFileSync(reviewPath, "utf8");
    const stateBytes = readFileSync(statePath, "utf8");
    writePortfolioDesignAdmissionArtifacts({ root: fixtureRoot });
    assert.equal(readFileSync(reviewPath, "utf8"), reviewBytes, "B2a writer must not modify independent review evidence");
    assert.equal(readFileSync(statePath, "utf8"), stateBytes, "B2a writer must not modify reviewed-state projection");
    rmSync(reviewPath);
    rmSync(statePath);
    writePortfolioDesignAdmissionArtifacts({ root: fixtureRoot });
    assert.equal(existsSync(reviewPath), false, "B2a writer must not create independent review evidence");
    assert.equal(existsSync(statePath), false, "B2a writer must not create reviewed-state projection");
  }

  console.log(`Adaptive ASK portfolio design review tests passed: fixtures=${reviewSummary.reviewedFixtureCount}, dimensions=${reviewSummary.passedPortfolioDimensionCount}, state=${stateSummary.projectedState}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

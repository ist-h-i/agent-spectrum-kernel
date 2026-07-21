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
  buildPortfolioDesignAdmissionArtifacts,
  validatePortfolioDesignAdmissionArtifacts,
  writePortfolioDesignAdmissionArtifacts,
} from "./ask-benchmark-design-admission.mjs";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(resolve(tmpdir(), "ask-design-admission-test-"));

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

function firstRecordPath(fixtureRoot) {
  return readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json").records[0].record_path;
}

function expectFailure(name, mutate, expected) {
  const fixtureRoot = cloneFixture(name);
  mutate(fixtureRoot);
  assert.throws(() => validatePortfolioDesignAdmissionArtifacts({ root: fixtureRoot }), expected, name);
}

try {
  const first = buildPortfolioDesignAdmissionArtifacts({ root });
  const second = buildPortfolioDesignAdmissionArtifacts({ root });
  assert.deepEqual(first, second, "two in-memory builds must be byte-equivalent after serialization");
  assert.equal(JSON.stringify(first), JSON.stringify(second), "two generated artifact sets must have identical serialized bytes");
  assert.equal(first.records.length, 24);
  assert.equal(first.manifest.primary_fixture_count, 24);
  assert.equal(first.manifest.calibration_fixture_count, 0);
  assert.equal(first.reviewPackage.records.length, 24);
  assert.ok(first.records.every((record) => record.design_status === "design_pending"));
  assert.ok(first.reviewPackage.records.every((record) => record.reviewer_status === "pending_independent_review"));
  assert.ok(first.reviewPackage.records.every((record) => record.reviewer_identity === null && record.review_record_digest === null));

  const owners = new Map([
    ["mechanism_positive", 206],
    ["mechanism_negative", 207],
    ["practice_frequency", 208],
    ["high_impact", 209],
  ]);
  for (const record of first.records) {
    assert.equal(record.implementation_owner_issue, owners.get(record.catalog_metadata.suite));
    assert.equal(record.bindings.policy_revision, "issue-205-checkpoint-b1-r3");
    assert.equal(record.design_status, "design_pending");
    assert.ok(!record.fixture_id.startsWith("cal-"));
    assert.equal(record.answer_neutral_design.task_wording_constraint.ask_specific_vocabulary_allowed, false);
  }

  const summary = validatePortfolioDesignAdmissionArtifacts({ root });
  assert.equal(summary.recordCount, 24);
  assert.equal(summary.pendingIndependentReviewCount, 24);
  assert.equal(summary.approvedReviewCount, 0);

  const checkedManifest = readFileSync(resolve(root, "benchmarks/portfolio-design-admission-manifest.json"), "utf8");
  const checkedReview = readFileSync(resolve(root, "benchmarks/portfolio-design-review-package.json"), "utf8");
  assert.equal(checkedManifest, `${JSON.stringify(first.manifest, null, 2)}\n`, "checked-in manifest bytes must be deterministic");
  assert.equal(checkedReview, `${JSON.stringify(first.reviewPackage, null, 2)}\n`, "checked-in review package bytes must be deterministic");

  expectFailure("duplicate-fixture", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.fixture_id = first.records[1].fixture_id;
    writeJson(fixtureRoot, path, record);
  }, /fixture IDs must exactly match|fixture IDs must be unique/);

  expectFailure("missing-fixture", (fixtureRoot) => {
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    manifest.records.pop();
    writeJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json", manifest);
  }, /exactly match|24 items|24 in order|missing or unknown record files/);

  expectFailure("unknown-fixture", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.fixture_id = "unknown-primary-fixture";
    writeJson(fixtureRoot, path, record);
  }, /exactly match|unknown fixture ID/);

  expectFailure("calibration-fixture", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.fixture_id = "cal-atomic-rule-batch";
    writeJson(fixtureRoot, path, record);
  }, /calibration fixtures must not enter B2a/);

  expectFailure("catalog-field-drift", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.catalog_metadata.domain = "testing";
    writeJson(fixtureRoot, path, record);
  }, /does not match catalog and policy recomputation/);

  expectFailure("policy-digest-drift", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.bindings.policy_manifest_digest = `sha256:${"f".repeat(64)}`;
    writeJson(fixtureRoot, path, record);
  }, /does not match catalog and policy recomputation/);

  expectFailure("owner-drift", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.implementation_owner_issue = 206;
    writeJson(fixtureRoot, path, record);
  }, /does not match catalog and policy recomputation/);

  expectFailure("unknown-property", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.unreviewed_extension = true;
    writeJson(fixtureRoot, path, record);
  }, /additional propert|unknown propert/i);

  expectFailure("answer-bearing-field", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.answer_neutral_design.expected_patch = "redacted";
    writeJson(fixtureRoot, path, record);
  }, /answer-bearing field|additional propert|unknown propert/i);

  expectFailure("answer-bearing-wording", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.answer_neutral_design.fair_paths.plain_condition = "Describe the expected behavior.";
    writeJson(fixtureRoot, path, record);
  }, /answer-bearing wording/);

  expectFailure("ask-task-cue", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    const record = readJson(fixtureRoot, path);
    record.answer_neutral_design.ordinary_engineering_intent = "Apply the Adaptive ASK workflow.";
    writeJson(fixtureRoot, path, record);
  }, /ASK-specific task cue/);

  expectFailure("review-self-approval", (fixtureRoot) => {
    const review = readJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json");
    review.records[0].reviewer_status = "approved";
    writeJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json", review);
  }, /pending_independent_review|const|allowed values/i);

  expectFailure("reviewer-identity-fabrication", (fixtureRoot) => {
    const review = readJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json");
    review.records[0].reviewer_identity = "codex";
    writeJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json", review);
  }, /null|type/i);

  expectFailure("review-digest-fabrication", (fixtureRoot) => {
    const review = readJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json");
    review.records[0].review_record_digest = `sha256:${"f".repeat(64)}`;
    writeJson(fixtureRoot, "benchmarks/portfolio-design-review-package.json", review);
  }, /null|type/i);

  expectFailure("inventory-digest-drift", (fixtureRoot) => {
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    manifest.records[0].record_digest = `sha256:${"f".repeat(64)}`;
    writeJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json", manifest);
  }, /inventory, ordering, binding, or digest drift/);

  expectFailure("record-ordering-drift", (fixtureRoot) => {
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    manifest.records.reverse();
    writeJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json", manifest);
  }, /exactly match the frozen primary 24 in order/);

  expectFailure("serialization-drift", (fixtureRoot) => {
    const path = firstRecordPath(fixtureRoot);
    writeJson(fixtureRoot, path, readJson(fixtureRoot, path), { compact: true });
  }, /bytes do not match deterministic serialization/);

  expectFailure("path-escape", (fixtureRoot) => {
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    manifest.records[0].record_path = "../escaped-record.json";
    writeJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json", manifest);
  }, /path escapes the repository root/);

  expectFailure("record-symlink", (fixtureRoot) => {
    const manifest = readJson(fixtureRoot, "benchmarks/portfolio-design-admission-manifest.json");
    const firstPath = resolve(fixtureRoot, manifest.records[0].record_path);
    const secondPath = resolve(fixtureRoot, manifest.records[1].record_path);
    rmSync(firstPath);
    symlinkSync(secondPath, firstPath);
  }, /must not be a symlink/);

  expectFailure("unknown-record-file", (fixtureRoot) => {
    writeJson(fixtureRoot, "benchmarks/portfolio-design-admission-records/unknown.json", first.records[0]);
  }, /missing or unknown record files/);

  const noWriteRoot = cloneFixture("validation-failure-no-write");
  rmSync(resolve(noWriteRoot, "benchmarks/portfolio-design-admission-manifest.json"));
  rmSync(resolve(noWriteRoot, "benchmarks/portfolio-design-review-package.json"));
  rmSync(resolve(noWriteRoot, "benchmarks/portfolio-design-admission-records"), { recursive: true });
  const invalidCatalog = readJson(noWriteRoot, "benchmarks/portfolio-catalog.json");
  invalidCatalog.catalog_digest = `sha256:${"f".repeat(64)}`;
  writeJson(noWriteRoot, "benchmarks/portfolio-catalog.json", invalidCatalog);
  assert.throws(() => writePortfolioDesignAdmissionArtifacts({ root: noWriteRoot }), /catalog digest does not match/);
  assert.equal(existsSync(resolve(noWriteRoot, "benchmarks/portfolio-design-admission-manifest.json")), false, "validation failure must not write a manifest");
  assert.equal(existsSync(resolve(noWriteRoot, "benchmarks/portfolio-design-review-package.json")), false, "validation failure must not write a review package");
  assert.equal(existsSync(resolve(noWriteRoot, "benchmarks/portfolio-design-admission-records")), false, "validation failure must not write records");

  const unsafeOutputRoot = cloneFixture("unsafe-output-no-write");
  const unsafeManifestPath = resolve(unsafeOutputRoot, "benchmarks/portfolio-design-admission-manifest.json");
  const unsafeManifestBytes = readFileSync(unsafeManifestPath, "utf8");
  writeFileSync(resolve(unsafeOutputRoot, "benchmarks/portfolio-design-admission-records/unmanaged.txt"), "unmanaged\n");
  assert.throws(() => writePortfolioDesignAdmissionArtifacts({ root: unsafeOutputRoot }), /unknown entry/);
  assert.equal(readFileSync(unsafeManifestPath, "utf8"), unsafeManifestBytes, "unsafe output validation must happen before writes");

  console.log(`Adaptive ASK portfolio design admission tests passed: records=${summary.recordCount}, pending_review=${summary.pendingIndependentReviewCount}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

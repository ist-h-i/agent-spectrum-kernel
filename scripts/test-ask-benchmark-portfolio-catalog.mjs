#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildPortfolioSimilarityReport,
  computePortfolioSimilarityDigest,
  sealPortfolioCatalog,
  validatePortfolioCatalog,
  validatePortfolioCatalogArtifacts,
} from "./ask-benchmark-portfolio-catalog.mjs";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "benchmarks/portfolio-catalog.json");
const similarityPath = resolve(root, "benchmarks/portfolio-similarity.json");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-portfolio-catalog-test-"));
const baseCatalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const baseReport = JSON.parse(readFileSync(similarityPath, "utf8"));

function fixture(catalog, fixtureId) {
  const value = catalog.fixtures.find((entry) => entry.fixture_id === fixtureId);
  assert.ok(value, `fixture ${fixtureId} must exist`);
  return value;
}

function sortFixtures(catalog) {
  catalog.fixtures.sort((left, right) => left.fixture_id < right.fixture_id ? -1 : left.fixture_id > right.fixture_id ? 1 : 0);
}

function expectCatalogFailure(name, mutate, expected) {
  const catalog = structuredClone(baseCatalog);
  mutate(catalog);
  const sealed = sealPortfolioCatalog(catalog);
  assert.throws(() => validatePortfolioCatalog(sealed, { root }), expected, name);
}

function writeArtifactPair(name, catalog, report) {
  const catalogFile = resolve(work, `${name}-catalog.json`);
  const reportFile = resolve(work, `${name}-similarity.json`);
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return { catalogFile, reportFile };
}

function expectReportFailure(name, mutate, expected) {
  const report = structuredClone(baseReport);
  mutate(report);
  report.report_digest = computePortfolioSimilarityDigest(report);
  const files = writeArtifactPair(name, baseCatalog, report);
  assert.throws(
    () => validatePortfolioCatalogArtifacts({ root, catalogPath: files.catalogFile, similarityPath: files.reportFile }),
    expected,
    name,
  );
}

try {
  const summary = validatePortfolioCatalogArtifacts({ root, catalogPath, similarityPath });
  assert.equal(summary.primaryFixtureCount, 24);
  assert.equal(summary.calibrationFixtureCount, 4);
  assert.equal(summary.pairCount, 276);
  assert.ok(Number(summary.maximumSimilarityScore) < 0.75);

  expectCatalogFailure("23 primary fixtures", (catalog) => {
    const value = fixture(catalog, "hi-authorization-exception");
    value.fixture_role = "calibration";
    value.suite = "calibration";
    value.aggregate_eligible = false;
    value.admission_state = "calibration_only";
  }, /primary fixture count must be exactly 24, observed 23/);

  expectCatalogFailure("25 primary fixtures", (catalog) => {
    const value = fixture(catalog, "cal-export-lease");
    value.fixture_role = "primary";
    value.suite = "mechanism_positive";
    value.aggregate_eligible = true;
    value.admission_state = "metadata_frozen_evaluator_pending";
  }, /primary fixture count must be exactly 24, observed 25/);

  expectCatalogFailure("suite count drift", (catalog) => {
    fixture(catalog, "mn-build-option-update").suite = "mechanism_positive";
  }, /mechanism_positive suite count must be exactly 6/);

  expectCatalogFailure("duplicate fixture ID", (catalog) => {
    fixture(catalog, "cal-atomic-rule-batch").fixture_id = "cal-concurrent-transfer";
    sortFixtures(catalog);
  }, /fixture IDs must be unique/);

  expectCatalogFailure("primary ID outside allowlist", (catalog) => {
    fixture(catalog, "mp-ci-evidence-gap").fixture_id = "mp-unregistered-fixture";
    sortFixtures(catalog);
  }, /primary fixture IDs must exactly match the frozen allowlist/);

  expectCatalogFailure("13 backend API security fixtures", (catalog) => {
    for (const value of catalog.fixtures.filter((entry) => entry.fixture_role === "primary" && !entry.backend_api_security).slice(0, 4)) value.backend_api_security = true;
  }, /backend\/API\/security classification must be 12 or fewer, observed 13/);

  expectCatalogFailure("three non-backend domains", (catalog) => {
    const domains = ["ci_build", "docs_config", "frontend"];
    let index = 0;
    for (const value of catalog.fixtures.filter((entry) => entry.fixture_role === "primary" && !entry.backend_api_security)) {
      value.domain = domains[index % domains.length];
      index += 1;
    }
  }, /non-backend engineering domains must include at least 4 distinct values, observed 3/);

  expectCatalogFailure("one medium mechanism-negative fixture", (catalog) => {
    for (const value of catalog.fixtures.filter((entry) => entry.suite === "mechanism_negative")) value.difficulty = "easy";
    fixture(catalog, "mn-build-option-update").difficulty = "medium";
  }, /mechanism-negative must contain at least 2 fixtures at medium or harder, observed 1/);

  expectCatalogFailure("missing docs config baseline", (catalog) => {
    const value = fixture(catalog, "mn-doc-config-correction");
    value.task_class = "configuration";
    value.domain = "ci_build";
  }, /mechanism-negative must contain an easy small docs\/config baseline/);

  expectCatalogFailure("practice-frequency lineage disabled", (catalog) => {
    fixture(catalog, "pf-api-pagination-behavior").lineage_required = false;
  }, /every practice-frequency fixture must require lineage/);

  expectCatalogFailure("calibration aggregate eligibility", (catalog) => {
    fixture(catalog, "cal-session-refresh").aggregate_eligible = true;
  }, /portfolio catalog failed JSON Schema validation/);

  expectCatalogFailure("answer-bearing field", (catalog) => {
    fixture(catalog, "mp-ci-evidence-gap").oracle = "prohibited";
  }, /unknown property/);

  const fixtureDigestDrift = structuredClone(baseCatalog);
  fixtureDigestDrift.fixtures[0].fixture_metadata_digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => validatePortfolioCatalog(fixtureDigestDrift, { root }), /fixture metadata digest does not match/);

  const catalogDigestDrift = structuredClone(baseCatalog);
  catalogDigestDrift.catalog_digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => validatePortfolioCatalog(catalogDigestDrift, { root }), /catalog digest does not match/);

  expectReportFailure("report catalog digest drift", (report) => {
    report.catalog_digest = `sha256:${"f".repeat(64)}`;
  }, /similarity report catalog digest does not match the catalog/);

  expectReportFailure("missing pair", (report) => {
    report.pairs.pop();
  }, /portfolio similarity report failed JSON Schema validation/);

  expectReportFailure("duplicate pair", (report) => {
    report.pairs[1] = structuredClone(report.pairs[0]);
  }, /similarity report does not match deterministic recomputation/);

  expectReportFailure("pair ordering drift", (report) => {
    [report.pairs[0], report.pairs[1]] = [report.pairs[1], report.pairs[0]];
  }, /similarity report does not match deterministic recomputation/);

  expectReportFailure("similarity score drift", (report) => {
    report.pairs[0].score = report.pairs[0].score === "0.0000" ? "0.0001" : "0.0000";
  }, /similarity report does not match deterministic recomputation/);

  expectCatalogFailure("unresolved near duplicate", (catalog) => {
    const source = fixture(catalog, "mp-frontend-state-review");
    const target = fixture(catalog, "mp-accessibility-interaction-review");
    target.capability_families = structuredClone(source.capability_families);
    target.evidence_topologies = structuredClone(source.evidence_topologies);
    target.outcome_dimensions = structuredClone(source.outcome_dimensions);
    target.risk_boundary = source.risk_boundary;
  }, /unresolved near-duplicate pair/);

  expectCatalogFailure("hard duplicate metadata", (catalog) => {
    const source = fixture(catalog, "mp-frontend-state-review");
    const target = fixture(catalog, "mp-accessibility-interaction-review");
    target.task_class = source.task_class;
    target.domain = source.domain;
    target.capability_families = structuredClone(source.capability_families);
    target.evidence_topologies = structuredClone(source.evidence_topologies);
    target.outcome_dimensions = structuredClone(source.outcome_dimensions);
    target.risk_boundary = source.risk_boundary;
  }, /hard duplicate metadata is prohibited/);

  const sealedOnce = sealPortfolioCatalog(baseCatalog);
  const sealedTwice = sealPortfolioCatalog(baseCatalog);
  assert.equal(`${JSON.stringify(sealedOnce, null, 2)}\n`, `${JSON.stringify(sealedTwice, null, 2)}\n`);
  const reportOnce = buildPortfolioSimilarityReport(sealedOnce, { root });
  const reportTwice = buildPortfolioSimilarityReport(sealedTwice, { root });
  assert.equal(`${JSON.stringify(reportOnce, null, 2)}\n`, `${JSON.stringify(reportTwice, null, 2)}\n`);

  const invalidReadOnlyCatalog = structuredClone(baseCatalog);
  fixture(invalidReadOnlyCatalog, "pf-api-pagination-behavior").lineage_required = false;
  const invalidReadOnlyFiles = writeArtifactPair("read-only-failure", sealPortfolioCatalog(invalidReadOnlyCatalog), baseReport);
  const before = {
    status: spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout,
    catalog: readFileSync(catalogPath),
    similarity: readFileSync(similarityPath),
    inputCatalog: readFileSync(invalidReadOnlyFiles.catalogFile),
    inputSimilarity: readFileSync(invalidReadOnlyFiles.reportFile),
  };
  const failedValidation = spawnSync(process.execPath, [
    runner,
    "validate-portfolio-catalog",
    "--catalog",
    invalidReadOnlyFiles.catalogFile,
    "--similarity",
    invalidReadOnlyFiles.reportFile,
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(failedValidation.status, 0);
  assert.equal(spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout, before.status);
  assert.deepEqual(readFileSync(catalogPath), before.catalog);
  assert.deepEqual(readFileSync(similarityPath), before.similarity);
  assert.deepEqual(readFileSync(invalidReadOnlyFiles.catalogFile), before.inputCatalog);
  assert.deepEqual(readFileSync(invalidReadOnlyFiles.reportFile), before.inputSimilarity);

  console.log("ASK benchmark portfolio catalog tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}

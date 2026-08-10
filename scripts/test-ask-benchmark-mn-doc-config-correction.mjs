#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_ROOT_RELATIVE,
  validateActualPrivateEvaluator,
  validateMnDocConfigCorrectionPublicFixture,
} from "./ask-benchmark-mn-doc-config-correction.mjs";
import {
  deriveEvaluatorAuthorityManifest,
  evaluatorAuthorityPathsForFixture,
  validateEvaluatorAuthorityManifest,
} from "./ask-benchmark-evaluator-boundary.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const work = mkdtempSync(resolve(tmpdir(), "ask-mn-doc-config-correction-"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function validationRoot(name) {
  const target = resolve(work, name);
  mkdirSync(resolve(target, "benchmarks/fixtures/checkpoint-b2"), { recursive: true });
  mkdirSync(resolve(target, "benchmarks/schemas"), { recursive: true });
  cpSync(fixtureRoot, resolve(target, FIXTURE_ROOT_RELATIVE), { recursive: true });
  cpSync(resolve(root, "benchmarks/adaptive-portfolio.config.json"), resolve(target, "benchmarks/adaptive-portfolio.config.json"));
  cpSync(resolve(root, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"), resolve(target, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"));
  return target;
}

function rejectsPublicMutation(name, mutate, pattern) {
  const target = validationRoot(name);
  mutate(target);
  assert.throws(() => validateMnDocConfigCorrectionPublicFixture({ root: target }), pattern, name);
}

function authorityBuffers(fixtureId) {
  const { bindingPaths } = evaluatorAuthorityPathsForFixture(fixtureId);
  return new Map(bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
}

try {
  const summary = validateMnDocConfigCorrectionPublicFixture({ root });
  assert.equal(summary.scoringReady, false);

  const baseline = spawnSync(process.execPath, ["--test", "test/worker-retries.test.mjs"], { cwd: resolve(fixtureRoot, "workspace"), encoding: "utf8" });
  assert.notEqual(baseline.status, 0, "the frozen task workspace must retain the visible inconsistency");

  rejectsPublicMutation("unlisted-public-input", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/unlisted.txt"), "unlisted\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("public-byte-drift", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), "{}\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("private-field-leakage", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "metadata.json");
    const value = readJson(path);
    value.private_root = "private/evaluator";
    writeJson(path, value);
  }, /private answer-bearing field/u);
  rejectsPublicMutation("requirement-reference-corruption", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "requirement-record.json");
    const value = readJson(path);
    value.requirements[0].evidence_map_ids = ["unknown-evidence"];
    writeJson(path, value);
  }, /deterministic source-freeze contract/u);
  rejectsPublicMutation("cross-fixture-config-transplant", (target) => {
    const path = resolve(target, "benchmarks/adaptive-portfolio.config.json");
    const value = readJson(path);
    value.fixtures.find(({ id }) => id === "mn-doc-config-correction").id = "mn-build-option-update-copy";
    writeJson(path, value);
  }, /not registered/u);
  rejectsPublicMutation("symlink-traversal", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/docs/worker-retries.md");
    rmSync(path);
    symlinkSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), path);
  }, /symlink/u);

  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixtureOneBuffers = authorityBuffers("mn-build-option-update");
  const fixtureOneManifest = readJson(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json"));
  validateEvaluatorAuthorityManifest({ manifest: fixtureOneManifest, buffers: fixtureOneBuffers, evaluatorRevision: fixtureOneManifest.evaluator_revision, root });
  const fixtureTwoBuffers = authorityBuffers("mn-doc-config-correction");
  const fixtureTwoManifest = deriveEvaluatorAuthorityManifest({ buffers: fixtureTwoBuffers, evaluatorRevision: revision, fixtureId: "mn-doc-config-correction" });
  assert.equal(fixtureTwoManifest.fixture_id, "mn-doc-config-correction");
  assert.deepEqual(fixtureTwoManifest.file_inventory.map(({ path }) => path), evaluatorAuthorityPathsForFixture("mn-doc-config-correction").bindingPaths);

  const privateRootIndex = process.argv.indexOf("--private-root");
  const caseRootIndex = process.argv.indexOf("--private-case-root");
  let privateValidation = "not_run";
  if (privateRootIndex !== -1 || caseRootIndex !== -1) {
    assert.notEqual(privateRootIndex, -1, "--private-root is required with private cases");
    assert.notEqual(caseRootIndex, -1, "--private-case-root is required with a private evaluator");
    const privateRoot = resolve(process.argv[privateRootIndex + 1]);
    const caseRoot = resolve(process.argv[caseRootIndex + 1]);
    const expectations = readJson(resolve(caseRoot, "expectations.json"));
    for (const entry of expectations.cases) {
      const fragment = await validateActualPrivateEvaluator({
        root,
        privateRoot,
        frozenWorkspace: resolve(caseRoot, entry.frozen_workspace),
        candidateWorkspace: resolve(caseRoot, entry.candidate_workspace),
        verificationExecuted: entry.verification_executed,
        investigatedPaths: entry.investigated_paths,
      });
      assert.equal(fragment.classification, entry.expected_classification, `actual private case ${entry.case_id}`);
    }
    privateValidation = "pass";
  }

  console.log(JSON.stringify({ fixture_id: "mn-doc-config-correction", public_validation: "pass", synthetic_private_validation: "not_run", actual_private_validation: privateValidation, fixture_one_regression: "pass", scoring_ready: false }));
} finally {
  rmSync(work, { recursive: true, force: true });
}

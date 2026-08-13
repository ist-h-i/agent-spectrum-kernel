#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";

import {
  discoverAdmittedFixtureIds,
  validatePublicAdmittedFixtureInvariance,
} from "./ask-benchmark-admitted-fixture-invariance.mjs";
import {
  computeAdmissionDecisionDigest,
  computeAdmissionDecisionId,
  resolveRepositoryAdmissionDecision,
} from "./ask-benchmark-admission-decision.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission } from "./ask-benchmark-plan.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function withClone(callback) {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-issue-249-clone-"));
  const root = resolve(parent, "repository");
  try {
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, root]);
    git(root, ["config", "user.name", "Issue 249 Test"]);
    git(root, ["config", "user.email", "issue-249-test@example.invalid"]);
    return callback(root);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function commitMutation(root, message = "synthetic authority mutation") {
  git(root, ["add", "benchmarks"]);
  git(root, ["commit", "--quiet", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function currentDecisionHistories() {
  const directory = resolve(ROOT, "benchmarks/fixtures/admission-decision");
  const paths = execFileSync("find", [directory, "-maxdepth", "1", "-type", "f", "-name", "*.json"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const decisions = paths.map((path) => ({ path, value: readJson(path) })).filter(({ value }) => value.schema_path === "benchmarks/schemas/portfolio-admission-decision.schema.json");
  const histories = new Map();
  for (const decision of decisions) histories.set(decision.value.fixture_id, [...(histories.get(decision.value.fixture_id) ?? []), decision]);
  for (const history of histories.values()) history.sort((left, right) => left.value.decision_revision - right.value.decision_revision);
  return histories;
}

function createSyntheticLineage(decisions) {
  const root = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-issue-249-lineage-"));
  git(root, ["init", "--quiet", "-b", "main"]);
  git(root, ["config", "user.name", "Issue 249 Test"]);
  git(root, ["config", "user.email", "issue-249-test@example.invalid"]);
  const schemaDirectory = resolve(root, "benchmarks/schemas");
  const overlayDirectory = resolve(root, "benchmarks/fixtures/admission-decision");
  execFileSync("mkdir", ["-p", schemaDirectory, overlayDirectory]);
  cpSync(resolve(ROOT, "benchmarks/schemas/portfolio-admission-decision.schema.json"), resolve(schemaDirectory, "portfolio-admission-decision.schema.json"));
  decisions.forEach(({ name, value }) => writeJson(resolve(overlayDirectory, name), value));
  git(root, ["add", "benchmarks"]);
  git(root, ["commit", "--quiet", "-m", "synthetic admission history"]);
  return root;
}

function resealDecision(decision) {
  const next = structuredClone(decision);
  next.decision_id = computeAdmissionDecisionId(next);
  next.decision_digest = computeAdmissionDecisionDigest(next);
  return next;
}

test("public invariance discovers every repository-admitted fixture", () => {
  const fixtureIds = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision: "HEAD" });
  const result = validatePublicAdmittedFixtureInvariance({ root: ROOT, repositoryRevision: "HEAD" });
  assert.deepEqual(result.fixture_ids, fixtureIds);
  assert.equal(result.public_invariance, "pass");
  assert.equal(result.private_semantics, "not_supplied");
});

test("direct frozen byte drift is rejected", () => withClone((root) => {
  const fixtureId = discoverAdmittedFixtureIds({ root, repositoryRevision: "HEAD" })[0];
  const path = resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/final-admission-record.json`);
  writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
  const revision = commitMutation(root);
  assert.throws(() => validatePublicAdmittedFixtureInvariance({ root, repositoryRevision: revision }), /frozen admission authority|scoring freeze admission_record raw identity/u);
}));

test("cross-fixture admission, evaluator, and source-freeze transplants are rejected", () => {
  const fixtureIds = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision: "HEAD" });
  const sourceId = fixtureIds.find((fixtureId) => existsSourceFreeze(fixtureId));
  const targetId = fixtureIds.find((fixtureId) => fixtureId !== sourceId && existsSourceFreeze(fixtureId));
  assert.ok(sourceId && targetId, "two admitted source-freeze histories are required by current authority");
  for (const file of ["final-admission-record.json", "evaluator-reference.json", "source-freeze-candidate.json"]) {
    withClone((root) => {
      cpSync(resolve(root, `benchmarks/fixtures/checkpoint-b2/${sourceId}/${file}`), resolve(root, `benchmarks/fixtures/checkpoint-b2/${targetId}/${file}`));
      const revision = commitMutation(root, `synthetic ${file} transplant`);
      assert.throws(() => validatePublicAdmittedFixtureInvariance({ root, repositoryRevision: revision }), /cross-fixture transplant|fixture identity|identity drift/u);
    });
  }
});

function existsSourceFreeze(fixtureId) {
  try {
    readFileSync(resolve(ROOT, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/source-freeze-candidate.json`));
    return true;
  } catch {
    return false;
  }
}

test("implicit evaluator rebinding without an admitted successor is rejected", () => withClone((root) => {
  const fixtureId = discoverAdmittedFixtureIds({ root, repositoryRevision: "HEAD" })[0];
  const path = resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`);
  const reference = readJson(path);
  reference.evaluator_bundle_digest = `sha256:${"0".repeat(64)}`;
  reference.public_metadata_digest = canonicalDigest(Object.fromEntries(Object.entries(reference).filter(([key]) => key !== "public_metadata_digest")));
  writeJson(path, reference);
  const revision = commitMutation(root, "synthetic implicit evaluator rebinding");
  assert.throws(() => validatePublicAdmittedFixtureInvariance({ root, repositoryRevision: revision }), /evaluator reference|evaluator.*identity|source-freeze/u);
}));

test("admission revision reset is rejected", () => {
  const history = [...currentDecisionHistories().values()].find((entries) => entries.length > 1);
  assert.ok(history, "current authority must include a successor history");
  const reset = structuredClone(history[1].value);
  reset.decision_revision = history[0].value.decision_revision;
  reset.decision_digest = computeAdmissionDecisionDigest(reset);
  const root = createSyntheticLineage([
    { name: basename(history[0].path), value: history[0].value },
    { name: "reset.json", value: reset },
  ]);
  try {
    const revision = git(root, ["rev-parse", "HEAD"]);
    assert.throws(() => resolveRepositoryAdmissionDecision({ root, repositoryRevision: revision, fixtureId: reset.fixture_id }), /revision must increase|revision/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("predecessor deletion and lineage break are rejected", () => {
  const history = [...currentDecisionHistories().values()].find((entries) => entries.length > 1);
  assert.ok(history);
  const root = createSyntheticLineage([{ name: basename(history[1].path), value: history[1].value }]);
  try {
    const revision = git(root, ["rev-parse", "HEAD"]);
    assert.throws(() => resolveRepositoryAdmissionDecision({ root, repositoryRevision: revision, fixtureId: history[1].value.fixture_id }), /predecessor|root|chain/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unrelated later decision cannot shadow an earlier admission", () => {
  const rootDecision = [...currentDecisionHistories().values()][0][0].value;
  const shadow = structuredClone(rootDecision);
  shadow.reviewed_pull_request += 10_000;
  shadow.reviewed_head_revision = "0".repeat(40);
  delete shadow.predecessor_decision;
  const sealedShadow = resealDecision(shadow);
  const root = createSyntheticLineage([
    { name: "root.json", value: rootDecision },
    { name: "shadow.json", value: sealedShadow },
  ]);
  try {
    const revision = git(root, ["rev-parse", "HEAD"]);
    assert.throws(() => resolveRepositoryAdmissionDecision({ root, repositoryRevision: revision, fixtureId: rootDecision.fixture_id }), /root|conflicting|chain/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partial and stale external review evidence remain fail-closed", () => {
  const revision = git(ROOT, ["rev-parse", "HEAD"]);
  const fixtureId = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision: revision }).find((id) => resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision: revision, fixtureId: id }));
  const fixture = readJson(resolve(ROOT, CONFIG_PATH_FOR_TEST)).fixtures.find(({ id }) => id === fixtureId);
  assert.throws(() => resolvePortfolioExecutionAdmission({ root: ROOT, repositoryRevision: revision, fixture, externalAdmissionEvidence: { reviewAuthorityPath: "/tmp/missing" } }), /partial/u);
  assert.throws(() => resolvePortfolioExecutionAdmission({
    root: ROOT,
    repositoryRevision: revision,
    fixture,
    externalAdmissionEvidence: {
      reviewAuthorityPath: "/tmp/issue-249-stale-review.json",
      reviewAuthoritySourceDigest: `sha256:${"0".repeat(64)}`,
      reviewArchivePath: "/tmp/issue-249-stale-review.zip",
    },
  }), /missing|digest|review/u);
});

const CONFIG_PATH_FOR_TEST = "benchmarks/adaptive-portfolio.config.json";

test("a valid append-only successor lineage is accepted", () => {
  const history = [...currentDecisionHistories().values()].find((entries) => entries.length > 1);
  assert.ok(history);
  const root = createSyntheticLineage(history.map((entry) => ({ name: basename(entry.path), value: entry.value })));
  try {
    const revision = git(root, ["rev-parse", "HEAD"]);
    const resolved = resolveRepositoryAdmissionDecision({ root, repositoryRevision: revision, fixtureId: history[0].value.fixture_id });
    assert.equal(resolved.decision.decision_revision, history.at(-1).value.decision_revision);
    assert.equal(resolved.decision.decision_id, history[0].value.decision_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

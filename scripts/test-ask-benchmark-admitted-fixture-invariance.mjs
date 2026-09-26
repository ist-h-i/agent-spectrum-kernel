#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";

import {
  assertAdmittedFixtureResultProfile,
  discoverAdmittedFixtureIds,
  partitionAdmittedFixtureIdsForPrivateSemantics,
  validateActualPrivateAdmittedFixtureSemantics,
  validateAdmittedFixtureInputBinding,
  validateDiscoveredAdmittedCalibrationInputBindings,
  validatePortfolioCaseIdentity,
  validatePublicAdmittedFixtureInvariance,
} from "./ask-benchmark-admitted-fixture-invariance.mjs";
import {
  computeAdmissionDecisionDigest,
  computeAdmissionDecisionId,
  computeAdmissionReviewAuthorityDigest,
  computeAdmissionReviewAuthorityId,
  resolveRepositoryAdmissionDecision,
} from "./ask-benchmark-admission-decision.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { computeResultProfileDigest } from "./ask-benchmark-scoring-contract.mjs";
import { buildPortfolioPlan, resolvePortfolioExecutionAdmission } from "./ask-benchmark-plan.mjs";

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

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

test("calibration admits paired absent result profiles without weakening primary or mismatch checks", () => {
  const fixtureId = "cal-session-refresh";
  assert.equal(assertAdmittedFixtureResultProfile({ fixtureId, fixtureRole: "calibration" }), undefined);
  assert.throws(() => assertAdmittedFixtureResultProfile({ fixtureId, fixtureRole: "primary" }), /result profile identity drift/u);
  const profile = { name: "binary_scope_verification", digest: computeResultProfileDigest() };
  assert.throws(() => assertAdmittedFixtureResultProfile({ fixtureId, fixtureRole: "calibration", outputProfile: profile }), /result profile identity drift/u);
  assert.throws(() => assertAdmittedFixtureResultProfile({ fixtureId, fixtureRole: "calibration", freezeProfile: profile }), /result profile identity drift/u);
});

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

test("implicit evaluator and source rebinding without an admitted successor are rejected", () => {
  for (const [label, mutate] of [
    ["evaluator", (reference) => { reference.evaluator_bundle_digest = `sha256:${"0".repeat(64)}`; }],
    ["source", (reference) => { reference.evaluator_source_identity.source_tree_digest = `sha256:${"0".repeat(64)}`; }],
  ]) withClone((root) => {
    const fixtureId = discoverAdmittedFixtureIds({ root, repositoryRevision: "HEAD" })[0];
    const path = resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/evaluator-reference.json`);
    const reference = readJson(path);
    mutate(reference);
    reference.public_metadata_digest = canonicalDigest(Object.fromEntries(Object.entries(reference).filter(([key]) => key !== "public_metadata_digest")));
    writeJson(path, reference);
    const revision = commitMutation(root, `synthetic implicit ${label} rebinding`);
    assert.throws(() => validatePublicAdmittedFixtureInvariance({ root, repositoryRevision: revision }), /evaluator reference|evaluator.*identity|source tree|source-freeze/u);
  });
});

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
  const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-issue-249-stale-review-"));
  try {
    const archivePath = resolve(work, "stale-review.zip");
    const archiveBytes = Buffer.from("synthetic stale review evidence\n");
    writeFileSync(archivePath, archiveBytes);
    const decision = resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision: revision, fixtureId }).decision;
    const authority = {
      schema_version: "1.0.0",
      schema_path: "benchmarks/schemas/portfolio-admission-review-authority.schema.json",
      program: "adaptive_ask_portfolio_admission_review_authority",
      authority_id: "",
      authority_revision: decision.decision_revision,
      fixture_id: fixtureId,
      review_status: decision.review_status,
      author_self_approval: false,
      reviewer_type: decision.reviewer_type,
      reviewer_record_id: decision.reviewer_record_id,
      reviewer_count: decision.reviewer_count,
      reviewed_at: decision.reviewed_at,
      reviewed_repository: decision.reviewed_repository,
      reviewed_pull_request: decision.reviewed_pull_request,
      reviewed_head_revision: decision.reviewed_head_revision === "0".repeat(40) ? "1".repeat(40) : "0".repeat(40),
      blocking_finding_count: decision.blocking_finding_count,
      review_evidence: { archive_sha256: digestBytes(archiveBytes), archive_bytes: archiveBytes.length },
      authority_digest: "",
    };
    authority.authority_id = computeAdmissionReviewAuthorityId(authority);
    authority.authority_digest = computeAdmissionReviewAuthorityDigest(authority);
    const authorityPath = resolve(work, "stale-review-authority.json");
    writeJson(authorityPath, authority);
    const authorityBytes = readFileSync(authorityPath);
    assert.throws(() => resolvePortfolioExecutionAdmission({
      root: ROOT,
      repositoryRevision: revision,
      fixture,
      externalAdmissionEvidence: {
        reviewAuthorityPath: authorityPath,
        reviewAuthoritySourceDigest: digestBytes(authorityBytes),
        reviewArchivePath: archivePath,
      },
    }), /review|head|archive|authority/u);

    const transplanted = structuredClone(authority);
    transplanted.fixture_id = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision: revision }).find((id) => id !== fixtureId);
    transplanted.authority_id = computeAdmissionReviewAuthorityId(transplanted);
    transplanted.authority_digest = computeAdmissionReviewAuthorityDigest(transplanted);
    const transplantedPath = resolve(work, "transplanted-review-authority.json");
    writeJson(transplantedPath, transplanted);
    const transplantedBytes = readFileSync(transplantedPath);
    assert.throws(() => resolvePortfolioExecutionAdmission({
      root: ROOT,
      repositoryRevision: revision,
      fixture,
      externalAdmissionEvidence: {
        reviewAuthorityPath: transplantedPath,
        reviewAuthoritySourceDigest: digestBytes(transplantedBytes),
        reviewArchivePath: archivePath,
      },
    }), /fixture|review|authority|transplant/u);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

const CONFIG_PATH_FOR_TEST = "benchmarks/adaptive-portfolio.config.json";

test("admitted calibration inputs use the four sealed source entries and catalog identity", () => {
  const catalog = readJson(resolve(ROOT, "benchmarks/portfolio-catalog.json"));
  const config = readJson(resolve(ROOT, "benchmarks/prompt-successor-execution.config.json"));
  const sharedPath = "benchmarks/fixtures/checkpoint-b2/input-manifest.json";
  const sharedBytes = readFileSync(resolve(ROOT, sharedPath));
  const inputSource = { path: sharedPath, value: JSON.parse(sharedBytes), raw: digestBytes(sharedBytes) };
  for (const runtimeFixture of config.fixtures) {
    const fixtureId = runtimeFixture.id;
    const catalogFixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === fixtureId);
    const metadata = {
      fixture_id: fixtureId,
      fixture_role: catalogFixture.fixture_role,
      suite: catalogFixture.suite,
      task_class: catalogFixture.task_class,
      difficulty: catalogFixture.difficulty,
      repetitions: catalogFixture.repetitions,
    };
    metadata.metadata_digest = canonicalDigest(metadata);
    assert.equal(validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture, metadata, inputSource }), runtimeFixture.source_fixture_id);
    for (const [mutation, expected] of [
      [{ ...runtimeFixture, source_fixture_id: config.fixtures.find(({ id }) => id !== fixtureId).source_fixture_id }, /calibration source binding/u],
      [{ ...runtimeFixture, aggregate_eligible: true }, /aggregate.*identity drift|calibration source binding/u],
      [{ ...runtimeFixture, input_manifest_path: `benchmarks/fixtures/checkpoint-b2/${fixtureId}/input-manifest.json` }, /input manifest path/u],
    ]) {
      assert.throws(() => validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture: mutation, metadata, inputSource }), expected);
    }
    assert.throws(() => validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture, metadata: { ...metadata, fixture_id: runtimeFixture.source_fixture_id }, inputSource }), /fixture identity/u);
    assert.throws(() => validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture, metadata, inputSource: { ...inputSource, value: { fixtures: { ...inputSource.value.fixtures, [runtimeFixture.source_fixture_id]: inputSource.value.fixtures[config.fixtures.find(({ id }) => id !== fixtureId).source_fixture_id] } } } }), /task\/workspace input inventory/u);
  }
});

test("primary admitted input binding retains its fixture-local manifest and single entry", () => {
  const fixtureId = "mp-ci-evidence-gap";
  const catalogFixture = readJson(resolve(ROOT, "benchmarks/portfolio-catalog.json")).fixtures.find(({ fixture_id }) => fixture_id === fixtureId);
  const runtimeFixture = readJson(resolve(ROOT, CONFIG_PATH_FOR_TEST)).fixtures.find(({ id }) => id === fixtureId);
  const metadata = readJson(resolve(ROOT, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/metadata.json`));
  const path = runtimeFixture.input_manifest_path;
  const bytes = readFileSync(resolve(ROOT, path));
  const inputSource = { path, value: JSON.parse(bytes), raw: digestBytes(bytes) };
  assert.equal(validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture, metadata, inputSource }), fixtureId);
  assert.throws(() => validateAdmittedFixtureInputBinding({ root: ROOT, fixtureId, catalogFixture, runtimeFixture, metadata, inputSource: { ...inputSource, value: { fixtures: { ...inputSource.value.fixtures, stray: {} } } } }), /input manifest fixture identity/u);
});

test("a synthetic admitted calibration record is discovered and its source input is checked", () => withClone((root) => {
  const fixtureId = "cal-session-refresh";
  const catalogFixture = readJson(resolve(root, "benchmarks/portfolio-catalog.json")).fixtures.find(({ fixture_id }) => fixture_id === fixtureId);
  const fixtureRoot = resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}`);
  // Build the partial synthetic record in this disposable clone without the
  // formal public package's other files changing the intended first failure.
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });
  writeJson(resolve(fixtureRoot, "final-admission-record.json"), { fixture_id: fixtureId, admission_status: "admitted" });
  const metadata = {
    fixture_id: fixtureId,
    fixture_role: catalogFixture.fixture_role,
    suite: catalogFixture.suite,
    task_class: catalogFixture.task_class,
    difficulty: catalogFixture.difficulty,
    repetitions: catalogFixture.repetitions,
  };
  metadata.metadata_digest = canonicalDigest(metadata);
  const metadataPath = resolve(fixtureRoot, "metadata.json");
  writeJson(metadataPath, metadata);
  let revision = commitMutation(root, "synthetic calibration discovery only");
  assert.ok(discoverAdmittedFixtureIds({ root, repositoryRevision: revision }).includes(fixtureId));
  assert.deepEqual(validateDiscoveredAdmittedCalibrationInputBindings({ root, repositoryRevision: revision }), [fixtureId]);
  assert.throws(() => validatePublicAdmittedFixtureInvariance({ root, repositoryRevision: revision }), /requirement-record\.json/u);

  metadata.task_class = "implementation";
  metadata.metadata_digest = canonicalDigest(Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "metadata_digest")));
  writeJson(metadataPath, metadata);
  revision = commitMutation(root, "synthetic calibration metadata mismatch");
  assert.throws(() => validateDiscoveredAdmittedCalibrationInputBindings({ root, repositoryRevision: revision }), /task_class catalog\/runtime identity drift/u);
}));

test("an admitted calibration fixture does not suppress primary private semantic coverage", () => {
  const catalog = readJson(resolve(ROOT, "benchmarks/portfolio-catalog.json"));
  const primaryIds = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision: "HEAD" });
  const scope = partitionAdmittedFixtureIdsForPrivateSemantics({ fixtureIds: [...primaryIds, "cal-session-refresh"], catalog });
  assert.deepEqual(scope.primary, primaryIds);
  assert.deepEqual(scope.calibration, ["cal-session-refresh"]);
  assert.throws(() => partitionAdmittedFixtureIdsForPrivateSemantics({ fixtureIds: [...primaryIds, "unknown-fixture"], catalog }), /no canonical role/u);
});

test("actual-private invariance rejects an incomplete admitted-fixture evidence inventory", () => {
  const repositoryRevision = git(ROOT, ["rev-parse", "HEAD"]);
  const [fixtureId] = discoverAdmittedFixtureIds({ root: ROOT, repositoryRevision });
  const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-issue-249-partial-private-"));
  try {
    const manifestPath = resolve(work, "execution-admission-evidence.json");
    writeJson(manifestPath, {
      [fixtureId]: {
        review_authority_path: "missing-review-authority.json",
        review_authority_source_digest: `sha256:${"0".repeat(64)}`,
        review_archive_path: "missing-review.zip",
      },
    });
    assert.throws(() => validateActualPrivateAdmittedFixtureSemantics({
      root: ROOT,
      repositoryRevision,
      evidenceManifestPath: manifestPath,
      privateRoots: { [fixtureId]: work },
    }), /actual-private invariance evidence is partial/u);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("portfolio case identity drift is rejected independently of plan construction", () => {
  const repositoryRevision = git(ROOT, ["rev-parse", "HEAD"]);
  const configValue = readJson(resolve(ROOT, CONFIG_PATH_FOR_TEST));
  const config = { ...configValue, _configPath: resolve(ROOT, CONFIG_PATH_FOR_TEST), _protocolPath: resolve(ROOT, configValue.protocol_path) };
  const plan = buildPortfolioPlan({ root: ROOT, config, repositoryRevision, seed: "issue-249-case-identity-test" });
  const fixtureId = config.fixtures.find(({ suite }) => suite === "calibration").id;
  assert.equal(validatePortfolioCaseIdentity({ root: ROOT, config, plan, fixtureIds: [fixtureId] }), true);
  const drifted = structuredClone(plan);
  drifted.cases.find(({ fixture_id: id }) => id === fixtureId).case_id = "case-0000000000000000-0000000000000000";
  assert.throws(() => validatePortfolioCaseIdentity({ root: ROOT, config, plan: drifted, fixtureIds: [fixtureId] }), /case identity/u);
});

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

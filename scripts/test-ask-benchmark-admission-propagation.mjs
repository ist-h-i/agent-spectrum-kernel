#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, readlinkSync, lstatSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const origin = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-admission-propagation-")));
const root = resolve(work, "source");
const read = (path) => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const actualEvidenceIndex = process.argv.indexOf("--actual-evidence");
const actualEvidencePath = actualEvidenceIndex < 0 ? null : resolve(process.argv[actualEvidenceIndex + 1]);
const keep = process.argv.includes("--keep-proof");
try {
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "clone", "--no-hardlinks", "--", origin, root], { stdio: "pipe" });
  // During a red/green check, copy only the declared code under test. Never copy private evaluator assets.
  for (const name of ["ask-benchmark.mjs", "ask-benchmark-selection.mjs", "ask-benchmark-execution.mjs", "ask-benchmark-normalized-results.mjs", "ask-benchmark-terminal-candidate.mjs", "ask-benchmark-evaluator-boundary.mjs"]) cpSync(resolve(origin, "scripts", name), resolve(root, "scripts", name));
  const fixtureIds = actualEvidencePath ? Object.keys(read(actualEvidencePath)) : ["pf-ci-cache-flake"];
  const configPath = resolve(root, "propagation-test.config.json");
  const rawConfig = read(resolve(root, "benchmarks/adaptive-portfolio.config.json"));
  const configFile = { ...rawConfig, fixtures: rawConfig.fixtures.filter(({ id }) => fixtureIds.includes(id)) };
  assert.equal(configFile.fixtures.length, fixtureIds.length);
  write(configPath, configFile);
  const authorityModule = await import(pathToFileURL(resolve(root, "scripts/ask-benchmark-admission-decision.mjs")).href);
  const evidencePath = resolve(work, "execution-admission-evidence.json");
  if (actualEvidencePath) cpSync(actualEvidencePath, evidencePath);
  else {
    const fixtureId = fixtureIds[0];
    const decisionPath = resolve(root, "benchmarks/fixtures/admission-decision", `${fixtureId}-admission-decision.json`);
    const decision = read(decisionPath);
    const archivePath = resolve(work, "synthetic-review.archive");
    writeFileSync(archivePath, "Synthetic TEST ONLY review archive. Not production admission.\n");
    decision.reviewer_record_id = "synthetic-admission-propagation-test";
    decision.review_evidence = { archive_sha256: hash(readFileSync(archivePath)), archive_bytes: readFileSync(archivePath).length };
    decision.decision_id = authorityModule.computeAdmissionDecisionId(decision);
    decision.decision_digest = authorityModule.computeAdmissionDecisionDigest(decision);
    write(decisionPath, decision);
    const fields = ["review_status", "author_self_approval", "reviewer_type", "reviewer_record_id", "reviewer_count", "reviewed_at", "reviewed_repository", "reviewed_pull_request", "reviewed_head_revision", "blocking_finding_count", "review_evidence"];
    const review = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-admission-review-authority.schema.json", program: "adaptive_ask_portfolio_admission_review_authority", authority_revision: 1, fixture_id: fixtureId, ...Object.fromEntries(fields.map((key) => [key, decision[key]])) };
    review.authority_id = authorityModule.computeAdmissionReviewAuthorityId(review);
    review.authority_digest = authorityModule.computeAdmissionReviewAuthorityDigest(review);
    const reviewPath = resolve(work, "synthetic-review-authority.json"); write(reviewPath, review);
    write(evidencePath, { [fixtureId]: { review_authority_path: reviewPath, review_authority_source_digest: hash(readFileSync(reviewPath)), review_archive_path: archivePath } });
  }
  git(["add", "--", "scripts", relative(root, configPath), ...(actualEvidencePath ? [] : ["benchmarks/fixtures/admission-decision"])]);
  git(["-c", "user.name=ASK synthetic verification", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic verification checkout only: admission propagation"]);
  const revision = git(["rev-parse", "HEAD"]);
  const originRevision = git(["rev-parse", "HEAD^"]);
  const runner = resolve(root, "scripts/ask-benchmark.mjs");
  const run = (command, args, expected = 0) => {
    assert.ok(["plan", "materialize", "seal-selection", "verify-selection", "prepare-execution", "verify-execution", "normalize-execution", "verify-normalized-results"].includes(command), "test allows only model-free non-evaluator commands");
    const result = spawnSync(process.execPath, [runner, command, "--config", configPath, ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(result.status, expected, result.stderr || result.stdout);
    return result;
  };
  const admission = ["--execution-admission-evidence", evidencePath];
  const planPath = resolve(work, "plan.json");
  run("plan", ["--output", planPath, "--seed", "admission-propagation-test", ...admission]);
  const plan = read(planPath);
  assert.equal(plan.repository_revision, revision);
  for (const id of fixtureIds) assert.ok(plan.cases.some(({ fixture_id }) => fixture_id === id));
  const materialized = resolve(work, "materialized");
  run("materialize", ["--plan", planPath, "--output", materialized, ...admission]);
  const manifest = read(resolve(materialized, "materialization-manifest.json"));
  const adaptive = manifest.cases.filter(({ condition }) => condition === "adaptive_ask");
  const state = resolve(work, "selection-state");
  const first = adaptive[0];
  const selectionInput = (record) => ({ task_class: plan.cases.find(({ case_id }) => case_id === record.case_id).task_class, observed_signals: ["cross-file contract"], selected_mechanisms: ["repository-orientation"], skipped_mechanisms: ["agent-orchestration"], required_gates: ["test-first-verification"], agents: { requested: [], omitted: ["subagent"] }, expected_evidence: ["materialization manifest revalidation"], capability_downgrades: [], lightweight_bypass: { used: false, reason: "Synthetic verification requires a local mechanism." }, projection: { adapter_track: record.adapter, profile: record.projection_evidence.selected_profile, renderer_id: record.projection_evidence.renderer_id, renderer_version: record.projection_evidence.renderer_version, projection_fingerprint: record.projection_evidence.projection_fingerprint } });
  const inputPath = resolve(work, "selection-input.json"); write(inputPath, selectionInput(first));
  const selectionArgs = ["--plan", planPath, "--materialized", materialized, "--state-dir", state, "--case-id", first.case_id, "--input", inputPath];
  const missing = run("seal-selection", selectionArgs, 1);
  assert.match(missing.stderr, /execution plan identity mismatch/u); assert.equal(existsSync(state), false);
  for (const record of adaptive) {
    write(inputPath, selectionInput(record));
    run("seal-selection", ["--plan", planPath, "--materialized", materialized, "--state-dir", state, "--case-id", record.case_id, "--input", inputPath, ...admission]);
    run("verify-selection", ["--plan", planPath, "--materialized", materialized, "--state-dir", state, "--case-id", record.case_id, ...admission]);
  }
  const runDir = resolve(work, "prepared-run");
  const common = ["--plan", planPath, "--materialized", materialized, "--selection-state", state, "--run-dir", runDir];
  const missingPreparation = run("prepare-execution", common, 1);
  assert.match(missingPreparation.stderr, /execution plan identity mismatch/u); assert.equal(existsSync(runDir), false);
  const prepared = JSON.parse(run("prepare-execution", [...common, ...admission]).stdout);
  assert.equal(prepared.model_calls, 0); assert.equal(prepared.case_attempts_created, 0);
  assert.equal(prepared.repository_revision, revision); assert.equal(prepared.plan_id, plan.plan_id);
  const verified = JSON.parse(run("verify-execution", [...common, ...admission]).stdout);
  assert.equal(verified.cases.length, plan.cases.length); assert.ok(verified.cases.every(({ status }) => status === "pending"));
  for (const { case_id } of plan.cases) assert.deepEqual(readdirSync(resolve(runDir, "cases", case_id, "attempts")), []);
  assert.deepEqual(readdirSync(resolve(runDir, "adapters")), []);
  const normalized = resolve(work, "normalized");
  run("normalize-execution", [...common, "--output", normalized, ...admission]);
  run("verify-normalized-results", [...common, "--output", normalized, ...admission]);
  const forgedEvidencePath = resolve(work, "wrong-evidence.json");
  const forged = read(evidencePath); forged[fixtureIds[0]].review_authority_source_digest = `sha256:${"0".repeat(64)}`; write(forgedEvidencePath, forged);
  const negative = run("prepare-execution", [...common.filter((_, i) => i < common.length - 2), "--run-dir", resolve(work, "rejected-run"), "--execution-admission-evidence", forgedEvidencePath], 1);
  assert.match(negative.stderr, /raw digest differs/u); assert.equal(existsSync(resolve(work, "rejected-run")), false);
  const reprepare = run("prepare-execution", [...common, ...admission], 1); assert.match(reprepare.stderr, /nonempty|already exists/u);
  const danglingRun = resolve(work, "dangling-run");
  const missingTarget = resolve(work, "missing-run-target");
  symlinkSync(missingTarget, danglingRun);
  const danglingRejected = run("prepare-execution", [...common.slice(0, -2), "--run-dir", danglingRun, ...admission], 1);
  assert.match(danglingRejected.stderr, /nonempty|already exists/u);
  assert.equal(lstatSync(danglingRun).isSymbolicLink(), true); assert.equal(readlinkSync(danglingRun), missingTarget);
  assert.equal(existsSync(missingTarget), false);
  const rejectedRun = (name, evidenceFile, pattern) => {
    const path = resolve(work, name);
    const result = run("prepare-execution", [...common.slice(0, -2), "--run-dir", path, "--execution-admission-evidence", evidenceFile], 1);
    assert.match(result.stderr, pattern); assert.equal(existsSync(path), false);
  };
  const partial = read(evidencePath); delete partial[fixtureIds[0]].review_archive_path;
  const partialPath = resolve(work, "partial-evidence.json"); write(partialPath, partial);
  rejectedRun("partial-rejected-run", partialPath, /partial/u);
  const archive = read(evidencePath); const replacedArchive = resolve(work, "replaced-review.archive");
  writeFileSync(replacedArchive, "Different review bytes. Not accepted authority.\n");
  archive[fixtureIds[0]].review_archive_path = replacedArchive;
  const archivePath = resolve(work, "changed-archive-evidence.json"); write(archivePath, archive);
  rejectedRun("archive-rejected-run", archivePath, /archive raw identity differs/u);
  if (fixtureIds.length > 1) {
    const transplant = read(evidencePath); transplant[fixtureIds[1]] = structuredClone(transplant[fixtureIds[0]]);
    const transplantPath = resolve(work, "transplanted-evidence.json"); write(transplantPath, transplant);
    rejectedRun("transplant-rejected-run", transplantPath, /fixture identities differ|fixture identity|archive raw identity/u);
  }
  const sourcePath = resolve(root, "scripts/ask-benchmark-execution.mjs");
  const sourceBytes = readFileSync(sourcePath);
  try {
    writeFileSync(sourcePath, Buffer.concat([sourceBytes, Buffer.from("\n// Source mismatch negative only.\n")]));
    rejectedRun("dirty-source-rejected-run", evidencePath, /working tree|working-tree|tracked repository|modified|differs from HEAD/u);
  } finally { writeFileSync(sourcePath, sourceBytes); }
  git(["add", "--", relative(root, configPath)]);
  const revisionMarker = resolve(root, "source-revision-negative.txt"); writeFileSync(revisionMarker, "Different exact source revision.\n");
  git(["add", "--", relative(root, revisionMarker)]);
  git(["-c", "user.name=ASK synthetic verification", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic source revision mismatch negative only"]);
  rejectedRun("source-revision-rejected-run", evidencePath, /repository revision mismatch/u);
  git(["checkout", "--detach", revision]);
  assert.equal(git(["status", "--porcelain"]), "");

  const receipt = { kind: "ask.admission-propagation-nonmodel-proof@1", actual_external_evidence: Boolean(actualEvidencePath), source_context: "Independent test-only configuration/source commit; controller preparation only, not grader processing admission", source_revision: revision, source_file_digests: Object.fromEntries(["ask-benchmark.mjs", "ask-benchmark-selection.mjs", "ask-benchmark-execution.mjs", "ask-benchmark-normalized-results.mjs", "ask-benchmark-terminal-candidate.mjs", "ask-benchmark-evaluator-boundary.mjs"].map((name) => [name, hash(readFileSync(resolve(root, "scripts", name)))])), source_origin_revision: originRevision, fixture_ids: fixtureIds, case_count: plan.cases.length, adaptive_selection_count: adaptive.length, checks: ["admitted normal plan", "materialization", "missing-evidence selection refused before writes", "all adaptive selection seals and verification", "missing-evidence preparation refused before writes", "pending execution preparation/inspection", "normalization and freshness verification", "wrong-authority digest refused before writes", "existing run preparation refused", "dangling existing run symlink refused without writes", "partial evidence refused", "changed archive refused", ...(fixtureIds.length > 1 ? ["cross-fixture evidence refused"] : []), "tracked source byte mismatch refused", "different exact source revision refused"], models_started: 0, agent_binary_resolved_or_probed: false, actual_comparison_started: false, private_workers_started: 0, all_attempts_empty: true, source_root: keep ? root : null };
  if (keep) write(resolve(work, "proof.json"), receipt);
  console.log(JSON.stringify({ ...receipt, retained_proof: keep ? resolve(work, "proof.json") : null }));
} finally { if (!keep) rmSync(work, { recursive: true, force: true }); }

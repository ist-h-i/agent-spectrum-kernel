#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import {
  buildPortfolioMechanismScorecard,
  computePortfolioMechanismScorecardDigest,
  computePortfolioMechanismScorecardId,
  reportEngineeringMechanismScorecards,
  validatePortfolioMechanismScorecard,
} from "./ask-benchmark-portfolio-mechanism-scorecard.mjs";
import { buildPortfolioRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = verifyPortfolioPolicyArtifacts({ root }).verified_scoring_policy;
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATES = ["observed", "missing", "unnecessary", "unknown", "not_applicable"];
const covered = new Set();

if (process.argv[2] === "--atomic-child") {
  try {
    publishJsonAtomicNoReplace({ outputPath: process.argv[3], artifact: { winner: "mechanism-scorecard" }, label: "mechanism scorecard child output" });
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[2] === "--stable-child") {
  try {
    const [inputPath, markerPath, continuePath] = process.argv.slice(3);
    const before = readStableFile(inputPath, "mechanism scorecard race input", 1024, { allowEmpty: false });
    writeFileSync(markerPath, "ready\n", { flag: "wx" });
    const waitArray = new Int32Array(new SharedArrayBuffer(4));
    while (!readFileIfPresent(continuePath)) Atomics.wait(waitArray, 0, 0, 10);
    const after = readStableFile(inputPath, "mechanism scorecard race input", 1024, { allowEmpty: false });
    assertStableFileEvidence(before, after, "mechanism scorecard race input");
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digest(value) { return `sha256:${hash(value)}`; }
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function evidence(kind, seed, bytes = null) { return { kind, digest: digest(seed), bytes }; }
function check(name, callback) { callback(); covered.add(name); }
function readFileIfPresent(path) { try { return readFileSync(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
function launchChild(args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolvePromise({ status, stderr }));
  });
}
async function waitForFile(path) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (readFileIfPresent(path)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error(`timed out waiting for ${path}`);
}
async function replacementOutcome(workRoot, name, replacementBytes) {
  const inputPath = resolve(workRoot, `${name}.json`);
  const replacementPath = resolve(workRoot, `${name}-replacement.json`);
  const markerPath = resolve(workRoot, `${name}.marker`);
  const continuePath = resolve(workRoot, `${name}.continue`);
  writeFileSync(inputPath, "original\n");
  writeFileSync(replacementPath, replacementBytes);
  const outcome = launchChild(["--stable-child", inputPath, markerPath, continuePath]);
  await waitForFile(markerPath);
  renameSync(replacementPath, inputPath);
  writeFileSync(continuePath, "continue\n", { flag: "wx" });
  return outcome;
}

function mechanisms(condition, repetition, empty = false) {
  if (empty) return { required_mechanisms: [], unnecessary_mechanisms: [], quality_credit_applied: false };
  const state = STATES[(CONDITIONS.indexOf(condition) + repetition - 1) % STATES.length];
  return {
    required_mechanisms: [
      { mechanism_id: "zeta_fixture_token", state, evidence_references: [evidence("test_result", `z:${condition}:${repetition}`, 12), evidence("normalized_result", `n:${condition}:${repetition}`)] },
      { mechanism_id: "alpha_fixture_token", state: repetition === 1 ? "unknown" : "observed", evidence_references: [] },
    ],
    unnecessary_mechanisms: [{ mechanism_id: "beta_fixture_token", state: "unnecessary", evidence_references: [] }],
    quality_credit_applied: false,
  };
}

function result(fixture, repetitions, condition, repetition, mode = "complete") {
  const key = `${fixture}:${condition}:${repetition}`;
  const complete = mode !== "non-ready";
  const empty = mode === "empty" || !complete;
  return {
    fixture_id: fixture,
    fixture_input_digest: digest(`fixture:${fixture}`),
    suite: fixture.includes("three") ? "mechanism_positive" : "calibration",
    task_class: "implementation",
    case_id: `case-${hash(key).slice(0, 16)}-${hash(`case:${key}`).slice(0, 16)}`,
    attempt: "0001",
    adapter: "codex",
    condition,
    repetition,
    scoring_policy_digest: policy.policy_digest,
    requirement_record_digest: digest(`requirements:${fixture}`),
    scoring_input_freeze_manifest_digest: digest(`freeze:${fixture}`),
    engineering_result_id: `engineering-result-${hash(`engineering:${key}`).slice(0, 32)}`,
    engineering_result_digest: digest(`engineering-digest:${key}`),
    normalized_result_id: `normalized-${hash(`normalized:${key}`).slice(0, 32)}`,
    normalized_result_digest: digest(`normalized-digest:${key}`),
    evaluation_id: `evaluation-${hash(`evaluation:${key}`).slice(0, 32)}`,
    evaluation_digest: digest(`evaluation-digest:${key}`),
    normalized_outcome: complete ? "completed" : "unavailable",
    evaluation_status: complete ? "completed" : "evaluator_unavailable",
    scoring_status: complete ? "complete" : "not_scoring_ready",
    scoring_reason: complete ? "completed_evaluation_scoring_ready" : "evaluator_unavailable",
    requirement_score: { scored_requirement_count: complete ? 1 : null, requirement_points_earned: complete ? 1 : null, requirement_points_possible: complete ? 1 : null, normalized_requirement_score: complete ? 1 : null },
    blockers: { gate_status: complete ? "pass" : "not_scoring_ready" },
    safety_blocker: { status: complete ? "pass" : "not_scoring_ready" },
    false_positives: { raw_count: 0, severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 } },
    scope_deviations: { raw_count: 0 },
    correctness_observations: Object.fromEntries(["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"].map((name) => [name, { state: complete ? "pass" : "unknown", evidence_references: [] }])),
    unsafe_actions: { categories: ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"].map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0 })) },
    mechanism_observations: mechanisms(condition, repetition, empty),
    overhead_telemetry: {
      ...Object.fromEntries(["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"].map((name) => [name, { status: "known", value: repetition, reason: "committed_runtime_evidence" }])),
      runtime_unavailable_reason: { code: { status: "not_applicable", value: null, reason: "synthetic" }, digest: { status: "not_applicable", value: null, reason: "synthetic" }, bytes: { status: "not_applicable", value: null, reason: "synthetic" } },
    },
  };
}

function verified() {
  const verified_results = [];
  for (const [fixture, repetitions, mode] of [["fixture-three", 3, "complete"], ["fixture-five", 5, "complete"], ["fixture-all-non-ready", 3, "non-ready"], ["fixture-stable-empty", 3, "empty"]]) {
    for (const condition of CONDITIONS) for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const item = result(fixture, repetitions, condition, repetition, mode);
      verified_results.push({ path: `${fixture}/${condition}/${repetition}.json`, raw_byte_digest: digest(`bytes:${fixture}:${condition}:${repetition}`), bytes: 1000 + repetition, result: item });
    }
  }
  return {
    artifact: {
      result_set_id: `engineering-result-set-${hash("set").slice(0, 32)}`,
      result_set_digest: digest("set-digest"),
      source_manifest_raw_byte_digest: digest("source-bytes"),
      source_manifest_digest: digest("source"),
      normalized_generation_id: `snapshot-${hash("snapshot")}`,
      normalized_manifest_digest: digest("normalized-manifest"),
      source_snapshot_digest: digest("snapshot-digest"),
      plan_id: `plan-${hash("plan")}`,
      plan_digest: digest("plan-digest"),
      run_instance_id: "00000000-0000-4000-8000-000000000197",
      source_revision: "1".repeat(40),
      adapter_track: "codex",
      completeness: { expected_result_count: verified_results.length },
    },
    verified_results,
  };
}

function build(input = verified(), mutateReport = null, suppliedPolicy = policy) {
  const repetition = buildPortfolioRepetitionReport({ verified: input, policyRevision: policy.policy_revision, scoringPolicyDigest: policy.policy_digest });
  if (mutateReport) mutateReport(repetition);
  return buildPortfolioMechanismScorecard({ verifiedReport: freeze(repetition), verifiedResultSet: input, verifiedScoringPolicy: suppliedPolicy });
}

function close(value) {
  value.mechanism_scorecard_id = computePortfolioMechanismScorecardId(value);
  value.mechanism_scorecard_digest = computePortfolioMechanismScorecardDigest(value);
  return value;
}

function fixture(scorecard, id = "fixture-three") { return scorecard.fixture_scorecards.find((entry) => entry.fixture_id === id); }
function mechanism(scorecard, id = "alpha_fixture_token", fixtureId = "fixture-three") { return fixture(scorecard, fixtureId).mechanism_scorecards.find((entry) => entry.mechanism_id === id); }
function condition(scorecard, name = "plain", mechanismId = "alpha_fixture_token", fixtureId = "fixture-three") { return mechanism(scorecard, mechanismId, fixtureId).condition_scorecards.find((entry) => entry.condition === name); }
function observation(scorecard, repetition = 1, conditionName = "plain", mechanismId = "alpha_fixture_token", fixtureId = "fixture-three") { return condition(scorecard, conditionName, mechanismId, fixtureId).observations.find((entry) => entry.repetition === repetition); }
function raw(input, fixtureId = "fixture-three", conditionName = "plain", repetition = 1) { return input.verified_results.find(({ result: item }) => item.fixture_id === fixtureId && item.condition === conditionName && item.repetition === repetition).result; }
function expectBuildFailure(name, mutate, pattern = /inventory|inventories|duplicate|semantically unbound|authority|cross-fixture|cross-adapter/u) { check(name, () => { const input = verified(); mutate(input); assert.throws(() => build(input), pattern); }); }
function expectResealedFailure(name, source, mutate, pattern = /closure|ordering|drift|Schema validation|inventory|duplicate|absolute|private/u) {
  check(name, () => { const changed = structuredClone(source); mutate(changed); close(changed); assert.throws(() => validatePortfolioMechanismScorecard(changed, { root }), pattern); });
}

const scorecard = build();
validatePortfolioMechanismScorecard(scorecard, { root });

check("one adapter only", () => assert.equal(scorecard.authority.adapter_track, "codex"));
check("all four conditions", () => assert.deepEqual(mechanism(scorecard).condition_scorecards.map(({ condition: name }) => name), CONDITIONS));
check("exact 3 repetitions", () => assert.equal(condition(scorecard).observations.length, 3));
check("exact 5 repetitions", () => assert.equal(condition(scorecard, "plain", "alpha_fixture_token", "fixture-five").observations.length, 5));
check("required mechanism inventory", () => assert.equal(mechanism(scorecard).classification, "required"));
check("unnecessary mechanism inventory", () => assert.equal(mechanism(scorecard, "beta_fixture_token").classification, "unnecessary"));
check("required-before-unnecessary ordering", () => assert.deepEqual(fixture(scorecard).mechanism_scorecards.map(({ classification }) => classification), ["required", "required", "unnecessary"]));
check("mechanism ID ordering", () => assert.deepEqual(fixture(scorecard).mechanism_scorecards.map(({ mechanism_id }) => mechanism_id), ["alpha_fixture_token", "zeta_fixture_token", "beta_fixture_token"]));
check("raw observed state", () => assert.equal(observation(scorecard, 2).state, "observed"));
check("raw missing state", () => assert.equal(observation(scorecard, 2, "plain", "zeta_fixture_token").state, "missing"));
check("raw unnecessary state", () => assert.equal(observation(scorecard, 1, "plain", "beta_fixture_token").state, "unnecessary"));
check("raw unknown state", () => assert.equal(observation(scorecard).state, "unknown"));
check("raw not-applicable state", () => assert.equal(observation(scorecard, 2, "full_ask", "zeta_fixture_token").state, "not_applicable"));
check("evidence reference preservation", () => assert.equal(observation(scorecard, 1, "plain", "zeta_fixture_token").evidence_references.length, 2));
check("evidence reference deterministic ordering", () => assert.deepEqual(observation(scorecard, 1, "plain", "zeta_fixture_token").evidence_references.map(({ kind }) => kind), ["normalized_result", "test_result"]));
expectBuildFailure("duplicate evidence reference rejection", (input) => { const refs = raw(input).mechanism_observations.required_mechanisms[0].evidence_references; refs.push(structuredClone(refs[0])); }, /duplicate evidence/u);
check("state count closure", () => assert.equal(Object.values(condition(scorecard).state_counts).reduce((sum, value) => sum + value, 0), 3));
check("coverage complete", () => assert.equal(condition(scorecard).observation_coverage_status, "complete"));

const partialInput = verified();
const partial = raw(partialInput);
partial.scoring_status = "not_scoring_ready"; partial.evaluation_status = "evaluator_unavailable"; partial.normalized_outcome = "unavailable"; partial.mechanism_observations = mechanisms("plain", 1, true);
const partialScorecard = build(partialInput);
check("one non-ready repetition makes coverage insufficient", () => assert.equal(condition(partialScorecard).observation_coverage_status, "insufficient_evidence"));
check("non-ready state is null", () => assert.equal(observation(partialScorecard).state, null));
check("non-ready evidence is empty", () => assert.deepEqual(observation(partialScorecard).evidence_references, []));
check("non-ready is not missing", () => assert.equal(condition(partialScorecard).state_counts.missing, 0));
check("non-ready is not unknown", () => assert.equal(condition(partialScorecard).state_counts.unknown, 0));
check("complete unknown remains available", () => assert.equal(observation(scorecard).observation_status, "available"));
check("all-non-ready fixture inventory insufficient", () => assert.equal(fixture(scorecard, "fixture-all-non-ready").mechanism_inventory_status, "insufficient_evidence"));
check("all-non-ready fixture does not infer IDs", () => assert.deepEqual(fixture(scorecard, "fixture-all-non-ready").mechanism_scorecards, []));
check("verified stable empty inventory", () => { const item = fixture(scorecard, "fixture-stable-empty"); assert.equal(item.mechanism_inventory_status, "complete"); assert.deepEqual(item.mechanism_scorecards, []); });
expectBuildFailure("duplicate mechanism ID", (input) => { raw(input).mechanism_observations.required_mechanisms.push(structuredClone(raw(input).mechanism_observations.required_mechanisms[0])); }, /duplicate mechanism ID/u);
expectBuildFailure("same ID in required and unnecessary", (input) => { raw(input).mechanism_observations.unnecessary_mechanisms[0].mechanism_id = "zeta_fixture_token"; }, /duplicate mechanism ID/u);
expectBuildFailure("classification drift", (input) => { const item = raw(input, "fixture-three", "plain", 2); item.mechanism_observations.unnecessary_mechanisms.push(item.mechanism_observations.required_mechanisms.pop()); });
expectBuildFailure("mechanism inventory drift across condition", (input) => { raw(input, "fixture-three", "kernel_only", 1).mechanism_observations.required_mechanisms[0].mechanism_id = "condition_drift"; });
expectBuildFailure("mechanism inventory drift across repetition", (input) => { raw(input, "fixture-three", "plain", 2).mechanism_observations.required_mechanisms[0].mechanism_id = "repetition_drift"; });
expectBuildFailure("missing condition", (input) => { input.verified_results = input.verified_results.filter(({ result: item }) => !(item.fixture_id === "fixture-three" && item.condition === "full_ask")); input.artifact.completeness.expected_result_count = input.verified_results.length; }, /group identity|inventory/u);
expectBuildFailure("duplicate condition", (input) => { raw(input, "fixture-three", "full_ask", 1).condition = "plain"; }, /inventory|identity|unordered/u);
expectBuildFailure("missing repetition", (input) => { input.verified_results.splice(input.verified_results.findIndex(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain"), 1); input.artifact.completeness.expected_result_count -= 1; }, /inventory/u);
expectBuildFailure("duplicate repetition", (input) => { raw(input, "fixture-three", "plain", 2).repetition = 1; }, /inventory/u);
check("cross-fixture result", () => assert.throws(() => build(verified(), (report) => { report.fixture_reports[0].condition_reports[0].repetition_observations[0].engineering_result_id = fixture(scorecard, "fixture-five").mechanism_scorecards[0].condition_scorecards[0].observations[0].engineering_result_id; }), /cross-fixture|disagree/u));
expectBuildFailure("cross-adapter result", (input) => { raw(input).adapter = "claude"; }, /one verified adapter track|cross-fixture or cross-adapter/u);
expectBuildFailure("scoring-policy digest drift", (input) => { raw(input).scoring_policy_digest = digest("wrong"); }, /scoring policy digest/u);
expectBuildFailure("requirement-record digest drift", (input) => { raw(input, "fixture-three", "plain", 2).requirement_record_digest = digest("wrong"); }, /identity changes|identity drift/u);
expectBuildFailure("scoring-input-freeze digest drift", (input) => { raw(input, "fixture-three", "plain", 2).scoring_input_freeze_manifest_digest = digest("wrong"); }, /identity changes|identity drift/u);
expectBuildFailure("non-ready non-empty mechanism array fails closed", (input) => { const item = raw(input); item.scoring_status = "not_scoring_ready"; item.evaluation_status = "evaluator_unavailable"; item.normalized_outcome = "unavailable"; }, /semantically unbound/u);
check("no global taxonomy", () => assert.equal(scorecard.boundaries.mechanism_global_taxonomy_applied, false));
check("no mechanism aliases", () => assert.equal(JSON.stringify(scorecard).includes("alias"), false));
check("no mechanism numeric score", () => assert.equal(scorecard.boundaries.mechanism_numeric_score_calculated, false));
check("no quality credit", () => assert.equal(scorecard.boundaries.mechanism_quality_credit_applied, false));
check("no Skill-load credit", () => assert.equal(scorecard.boundaries.skill_load_credit_applied, false));
check("no agent-start credit", () => assert.equal(scorecard.boundaries.agent_start_credit_applied, false));
check("no artifact-creation credit", () => assert.equal(scorecard.boundaries.artifact_creation_credit_applied, false));
check("no observed rate", () => assert.equal(JSON.stringify(scorecard).includes("observed_rate"), false));
check("no ranking", () => assert.equal(JSON.stringify(scorecard).includes("ranking"), false));
expectResealedFailure("re-sealed wrong state count", scorecard, (changed) => { condition(changed).state_counts.observed += 1; });
expectResealedFailure("re-sealed wrong coverage status", scorecard, (changed) => { condition(changed).observation_coverage_status = "insufficient_evidence"; });
expectResealedFailure("re-sealed wrong inventory status", scorecard, (changed) => { fixture(changed).mechanism_inventory_status = "insufficient_evidence"; });
expectResealedFailure("re-sealed classification drift", scorecard, (changed) => { mechanism(changed).classification = "unnecessary"; });
expectResealedFailure("re-sealed observation state drift", scorecard, (changed) => { observation(changed).state = "missing"; });
expectResealedFailure("re-sealed evidence-reference drift", scorecard, (changed) => { observation(changed, 1, "plain", "zeta_fixture_token").evidence_references.reverse(); });
check("report ID drift", () => { const changed = structuredClone(scorecard); changed.mechanism_scorecard_id = `mechanism-scorecard-${"0".repeat(32)}`; assert.throws(() => validatePortfolioMechanismScorecard(changed, { root }), /ID/u); });
check("report digest drift", () => { const changed = structuredClone(scorecard); changed.mechanism_scorecard_digest = digest("wrong"); assert.throws(() => validatePortfolioMechanismScorecard(changed, { root }), /digest/u); });
expectResealedFailure("unknown nested property", scorecard, (changed) => { observation(changed).unexpected = true; });
expectResealedFailure("absolute path leakage", scorecard, (changed) => { changed.fixture_scorecards[0].fixture_id = "/private/fixture"; });
expectResealedFailure("private path leakage", scorecard, (changed) => { changed.fixture_scorecards[0].fixture_id = "private-evaluator/fixture"; });
expectResealedFailure("raw evaluator prompt field rejection", scorecard, (changed) => { observation(changed).raw_evaluator_prompt = "forbidden"; });

const work = mkdtempSync(resolve(root, ".ask-mechanism-scorecard-publication-"));
try {
  check("pre-existing output", () => { const outputPath = resolve(work, "existing.json"); writeFileSync(outputPath, "existing\n"); assert.throws(() => reportEngineeringMechanismScorecards({ outputPath }), /must not already exist/u); });
  check("output symlink", () => { const target = resolve(work, "target.json"); const outputPath = resolve(work, "link.json"); writeFileSync(target, "target\n"); symlinkSync(target, outputPath); assert.throws(() => reportEngineeringMechanismScorecards({ outputPath }), /symlink/u); });
  check("output inside authority root", () => { const normalizedResultsPath = resolve(work, "normalized"); mkdirSync(normalizedResultsPath); assert.throws(() => reportEngineeringMechanismScorecards({ outputPath: resolve(normalizedResultsPath, "scorecard.json"), normalizedResultsPath }), /disjoint/u); });
  const concurrentOutput = resolve(work, "concurrent.json");
  const concurrent = await Promise.all([launchChild(["--atomic-child", concurrentOutput]), launchChild(["--atomic-child", concurrentOutput])]);
  check("concurrent publication exactly one success", () => assert.deepEqual(concurrent.map(({ status }) => status).sort((left, right) => left - right), [0, 1]));
  check("winner bytes preserved", () => assert.deepEqual(JSON.parse(readFileSync(concurrentOutput, "utf8")), { winner: "mechanism-scorecard" }));
  check("no staging residue", () => assert.equal(readdirSync(work).some((name) => name.startsWith(`.${basename(concurrentOutput)}.staging-`)), false));
  const differentBytes = await replacementOutcome(work, "different-bytes", "different\n");
  check("different-byte replacement rejection", () => { assert.notEqual(differentBytes.status, 0); assert.match(differentBytes.stderr, /changed or was replaced|path was replaced/u); });
  const sameBytes = await replacementOutcome(work, "same-bytes", "original\n");
  check("same-byte inode replacement rejection", () => { assert.notEqual(sameBytes.status, 0); assert.match(sameBytes.stderr, /changed or was replaced|path was replaced/u); });
  check("successful publication inputs unchanged", () => assert.equal(scorecard.authority.result_set_digest, digest("set-digest")));
  check("failed publication inputs unchanged", () => { const inputPath = resolve(work, "authority.json"); writeFileSync(inputPath, "authority\n"); const before = readFileSync(inputPath); assert.throws(() => reportEngineeringMechanismScorecards({ outputPath: inputPath, resultSetPath: inputPath }), /must not already exist|disjoint/u); assert.deepEqual(readFileSync(inputPath), before); });
} finally { rmSync(work, { recursive: true, force: true }); }

check("deterministic byte-identical regeneration", () => assert.equal(JSON.stringify(build()), JSON.stringify(build())));
const implementation = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-mechanism-scorecard.mjs"), "utf8");
check("no filesystem reread after full verification", () => assert.equal(implementation.includes("readFileSync"), false));
check("serialized artifact excludes runtime-only verifier bodies", () => assert.equal(JSON.stringify(scorecard).includes("verified_results"), false));
check("measured execution remains false", () => assert.equal(scorecard.boundaries.measured_execution_authorized, false));
check("product claim remains false", () => assert.equal(scorecard.boundaries.product_value_claim, false));
check("Issue #198 remains false", () => assert.equal(scorecard.boundaries.issue_198_stage_0_authorized, false));

assert.equal(covered.size, 79, `expected 79 focused closures, received ${covered.size}`);
console.log(`Portfolio mechanism observation scorecard contract test passed (${covered.size} closures).`);

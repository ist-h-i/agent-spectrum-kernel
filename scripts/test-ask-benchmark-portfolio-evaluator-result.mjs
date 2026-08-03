#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys, readStableJsonFile } from "./ask-benchmark-duplicate-key-json.mjs";
import {
  computeLifecycleNeutralResultProfileDigest,
  validateLifecycleNeutralResultProfile,
} from "./ask-benchmark-portfolio-result-profile.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = () => {
  const value = { name: "binary_scope_verification_v1" };
  return { ...value, digest: computeLifecycleNeutralResultProfileDigest(value) };
};
const executionReference = (entry) => ({ kind: "execution_event", digest: entry.digest, bytes: entry.bytes });

function binaryFixture() {
  const testEvent = { command_id: "test", digest: digest("test-success"), bytes: 80, outcome: "succeeded", exit_code: 0, match_state: "matched" };
  const lintFailure = { command_id: "lint-a", digest: digest("lint-failure"), bytes: 81, outcome: "failed", exit_code: 1, match_state: "matched" };
  const lintSuccess = { command_id: "lint-b", digest: digest("lint-success"), bytes: 82, outcome: "succeeded", exit_code: 0, match_state: "matched" };
  const expectedReferences = [executionReference(testEvent), executionReference(lintSuccess)];
  const resultProfile = profile();
  const requirementRecord = {
    requirements: [
      { requirement_id: "configuration-contract", max_points: 5 },
      { requirement_id: "change-boundary", max_points: 3 },
      { requirement_id: "verification-evidence", max_points: 2 },
    ],
  };
  const result = (requirementId, maxPoints) => ({
    requirement_id: requirementId,
    outcome: "pass",
    earned_points: maxPoints,
    scope_deviation_references: [],
    verification_evidence_references: [],
  });
  const evaluatorResult = {
    evaluation_status: "completed",
    result_profile: structuredClone(resultProfile),
    classification: "correct_narrow_execution",
    findings: [],
    scope_deviations: [],
    evidence_correctness: { state: "pass", evidence_references: expectedReferences },
    verification_correctness: { state: "pass", evidence_references: expectedReferences },
    requirement_results: requirementRecord.requirements.map(({ requirement_id: id, max_points: points }) => result(id, points)),
  };
  const verification = evaluatorResult.requirement_results.find(({ requirement_id: id }) => id === "verification-evidence");
  verification.verification_evidence_state = "executed_success";
  verification.verification_evidence_references = structuredClone(expectedReferences);
  return {
    outputContract: { result_profile: structuredClone(resultProfile) },
    freezeManifest: { result_profile: structuredClone(resultProfile) },
    evaluatorResult,
    requirementRecord,
    normalizedResult: {
      normalized_result_digest: digest("normalized-result"),
      command_evidence: {
        capture_support: "supported",
        evidence_level: "captured",
        cwd_unverified_command_count: 0,
        required_command_ids: ["test"],
        required_alternative_groups: [{ group_id: "lint", member_ids: ["lint-a", "lint-b"] }],
        references: [testEvent, lintFailure, lintSuccess],
      },
    },
  };
}

function validate(fixture) {
  return validateLifecycleNeutralResultProfile(fixture);
}

function verificationResult(fixture) {
  return fixture.evaluatorResult.requirement_results.find(({ requirement_id: id }) => id === "verification-evidence");
}

function boundaryResult(fixture) {
  return fixture.evaluatorResult.requirement_results.find(({ requirement_id: id }) => id === "change-boundary");
}

test("duplicate-key-aware reader rejects every new authority shadow before publication", () => {
  const mutations = [
    ["admission decision", '{"decision_status":"rejected","decision_status":"admitted"}', "decision_status"],
    ["sealed review authority", '{"review_status":"rejected","review_status":"approved"}', "review_status"],
    ["review archive identity", '{"review_evidence":{"archive_sha256":"one","archive_sha256":"two"}}', "archive_sha256"],
    ["evaluator result envelope", '{"evaluation_status":"invalid_input","evaluation_status":"completed"}', "evaluation_status"],
    ["requirement outcome", '{"requirement_results":[{"outcome":"fail","outcome":"pass"}]}', "outcome"],
    ["requirement points", '{"requirement_results":[{"earned_points":0,"earned_points":2}]}', "earned_points"],
    ["freeze-manifest path", '{"admission_record":{"path":"one","path":"two"}}', "path"],
    ["freeze-manifest digest", '{"admission_record":{"raw_byte_digest":"one","raw_byte_digest":"two"}}', "raw_byte_digest"],
    ["frozen admission status", '{"admission_status":"rejected","admission_status":"admission_pending"}', "admission_status"],
    ["frozen admission digest", '{"admission_digest":"one","admission_digest":"two"}', "admission_digest"],
  ];
  const directory = mkdtempSync(resolve(root, ".ask-duplicate-json-"));
  try {
    for (const [label, raw, key] of mutations) {
      const input = resolve(directory, `${key}.json`);
      const output = resolve(directory, `${key}.engineering-result.json`);
      writeFileSync(input, raw);
      const before = readFileSync(input);
      assert.throws(() => readStableJsonFile(input, label, 1024, { allowEmpty: false }), new RegExp(`duplicate JSON object key: ${key}`, "u"));
      assert.deepEqual(readFileSync(input), before, `${label} input must remain unchanged`);
      assert.equal(existsSync(output), false, `${label} must not create a partial engineering result`);
    }
    for (const [label, raw] of [
      ["materialization marker", '{"program":'],
      ["selection-state marker", '{"program":"selection"}\ntrailing'],
    ]) {
      const input = resolve(directory, `${label.replaceAll(" ", "-")}.json`);
      const output = resolve(directory, `${label.replaceAll(" ", "-")}.engineering-result.json`);
      writeFileSync(input, raw);
      const before = readFileSync(input);
      assert.throws(() => readStableJsonFile(input, label, 1024, { allowEmpty: false }), /invalid JSON/u);
      assert.deepEqual(readFileSync(input), before, `${label} input must remain unchanged`);
      assert.equal(existsSync(output), false, `${label} must not create a partial engineering result`);
    }

    const marker = resolve(directory, "concurrent-materialization-marker.json");
    const markerBackup = resolve(directory, "concurrent-materialization-marker.backup.json");
    const replacement = resolve(directory, "concurrent-materialization-marker.replacement.json");
    const output = resolve(directory, "concurrent-materialization-marker.engineering-result.json");
    writeFileSync(marker, '{"program":"materialization"}\n');
    copyFileSync(marker, markerBackup);
    writeFileSync(replacement, '{"program":"replacement"}\n');
    const markerBefore = readFileSync(marker);
    const replacementBefore = readFileSync(replacement);
    assert.throws(
      () => readStableJsonFile(marker, "materialization marker", 1024, { allowEmpty: false, afterOpen: () => renameSync(replacement, marker) }),
      /replaced|changed/u,
    );
    renameSync(markerBackup, marker);
    writeFileSync(replacement, replacementBefore);
    assert.deepEqual(readFileSync(marker), markerBefore, "concurrent marker rejection must leave the authority input unchanged after the test actor restores it");
    assert.deepEqual(readFileSync(replacement), replacementBefore, "concurrent marker rejection must not modify the replacement input");
    assert.equal(existsSync(output), false, "concurrent marker replacement must not create a partial engineering result");
    assert.throws(() => parseJsonRejectDuplicateKeys('{"a":1,"\\u0061":2}', "escaped key authority"), /duplicate JSON object key: a/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("binary profile digest closes over the profile name", () => {
  assert.match(computeLifecycleNeutralResultProfileDigest({ name: "binary_scope_verification_v1" }), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(typeof validateLifecycleNeutralResultProfile, "function");
});

test("binary profile accepts exact requirements, scope closure, and successful causal command evidence", () => {
  assert.equal(validate(binaryFixture()), "correct_narrow_execution");
});

test("resealing a failed verification requirement as pass cannot create successful evidence", () => {
  const fixture = binaryFixture();
  const event = fixture.normalizedResult.command_evidence.references.find(({ command_id: id }) => id === "test");
  event.outcome = "failed";
  event.exit_code = 1;
  const reference = executionReference(event);
  const result = verificationResult(fixture);
  result.outcome = "fail";
  result.earned_points = 0;
  result.verification_evidence_state = "executed_failure";
  result.verification_evidence_references = [reference];
  fixture.evaluatorResult.verification_correctness = { state: "fail", evidence_references: [reference] };
  fixture.evaluatorResult.classification = "under_processing";
  assert.equal(validate(fixture), "under_processing");
  result.outcome = "pass";
  result.earned_points = 2;
  assert.throws(() => validate(fixture), /passing verification result requires/u);
});

test("executed-success claims reject failed, missing, and declined command evidence", () => {
  for (const state of ["failed", "missing", "declined"]) {
    const fixture = binaryFixture();
    const references = fixture.normalizedResult.command_evidence.references;
    const index = references.findIndex(({ command_id: id }) => id === "test");
    if (state === "missing") references.splice(index, 1);
    else {
      references[index].outcome = state;
      references[index].exit_code = state === "declined" ? null : 1;
    }
    assert.throws(() => validate(fixture), /does not rederive|causal reference set|does not close to normalized command evidence/u, state);
  }
});

test("passing change-boundary rejects retained scope deviations", () => {
  const fixture = binaryFixture();
  fixture.evaluatorResult.scope_deviations = [{ finding_id: "scope-one" }];
  boundaryResult(fixture).scope_deviation_references = ["scope-one"];
  assert.throws(() => validate(fixture), /zero scope deviations/u);
});

test("failing change-boundary references every authoritative scope deviation", () => {
  const fixture = binaryFixture();
  fixture.evaluatorResult.scope_deviations = [{ finding_id: "scope-one" }, { finding_id: "scope-two" }];
  const result = boundaryResult(fixture);
  result.outcome = "fail";
  result.earned_points = 0;
  result.scope_deviation_references = ["scope-one", "scope-two"];
  fixture.evaluatorResult.classification = "over_processing";
  assert.equal(validate(fixture), "over_processing");
  result.scope_deviation_references.pop();
  assert.throws(() => validate(fixture), /every authoritative scope deviation/u);
});

test("classification is rederived from authoritative requirement outcomes", () => {
  const fixture = binaryFixture();
  fixture.evaluatorResult.classification = "under_processing";
  assert.throws(() => validate(fixture), /classification does not rederive/u);
});

test("output, freeze, and evaluator profile name or digest drift fails closed", () => {
  const mutations = [
    (fixture) => { fixture.outputContract.result_profile.digest = digest("output-drift"); },
    (fixture) => { fixture.freezeManifest.result_profile.name = "binary_scope_verification_v2"; },
    (fixture) => { fixture.freezeManifest.result_profile.digest = digest("freeze-drift"); },
    (fixture) => { fixture.evaluatorResult.result_profile.name = "binary_scope_verification_v2"; },
    (fixture) => { fixture.evaluatorResult.result_profile.digest = digest("result-drift"); },
  ];
  for (const mutate of mutations) {
    const fixture = binaryFixture();
    mutate(fixture);
    assert.throws(() => validate(fixture), /profile.*(?:digest|binding).*invalid|binding drift/u);
  }
});

test("unknown result profiles fail closed", () => {
  const fixture = binaryFixture();
  fixture.outputContract.result_profile.name = "unknown_profile_v1";
  fixture.outputContract.result_profile.digest = computeLifecycleNeutralResultProfileDigest(fixture.outputContract.result_profile);
  assert.throws(() => validate(fixture), /unknown result profile/u);
});

test("top-level verification pass cannot accompany requirement failure", () => {
  const fixture = binaryFixture();
  const result = verificationResult(fixture);
  result.outcome = "fail";
  result.earned_points = 0;
  fixture.evaluatorResult.classification = "under_processing";
  assert.throws(() => validate(fixture), /top-level verification correctness must agree/u);
});

test("verification pass cannot substitute normalized-result evidence for execution events", () => {
  const fixture = binaryFixture();
  const normalizedReference = { kind: "normalized_result", digest: fixture.normalizedResult.normalized_result_digest, bytes: null };
  verificationResult(fixture).verification_evidence_references = [normalizedReference];
  fixture.evaluatorResult.verification_correctness.evidence_references = [normalizedReference];
  assert.throws(() => validate(fixture), /causal reference set|only execution events/u);
});

test("invalid evidence requires typed invalid-input authority", () => {
  const fixture = binaryFixture();
  const result = verificationResult(fixture);
  result.outcome = "fail";
  result.earned_points = 0;
  result.verification_evidence_state = "invalid";
  fixture.evaluatorResult.evaluation_status = "invalid_input";
  fixture.evaluatorResult.evidence_correctness = { state: "fail", evidence_references: [] };
  fixture.evaluatorResult.verification_correctness = { state: "fail", evidence_references: [] };
  fixture.evaluatorResult.classification = "invalid_evidence";
  assert.throws(() => validate(fixture), /typed invalid-input authority/u);
});

test("typed invalid command-evidence authority closes to the normalized result", () => {
  const fixture = binaryFixture();
  const normalizedReference = { kind: "normalized_result", digest: fixture.normalizedResult.normalized_result_digest, bytes: null };
  const category = "normalized_command_evidence_invalid";
  const result = verificationResult(fixture);
  result.outcome = "fail";
  result.earned_points = 0;
  result.verification_evidence_state = "invalid";
  result.verification_evidence_references = [normalizedReference];
  fixture.evaluatorResult.evaluation_status = "invalid_input";
  fixture.evaluatorResult.invalid_input_authority = {
    layer: "command_evidence",
    category,
    code: "duplicate_command_evidence",
    evidence_references: [normalizedReference],
  };
  fixture.evaluatorResult.findings = [{ finding_id: "invalid-command-evidence", category, evidence_references: [normalizedReference] }];
  fixture.evaluatorResult.evidence_correctness = { state: "fail", evidence_references: [normalizedReference] };
  fixture.evaluatorResult.verification_correctness = { state: "fail", evidence_references: [normalizedReference] };
  fixture.evaluatorResult.classification = "invalid_evidence";
  assert.equal(validate(fixture), "invalid_evidence");
});

test("binary profile requires the exact authoritative result inventory", () => {
  const fixture = binaryFixture();
  fixture.evaluatorResult.requirement_results.pop();
  assert.throws(() => validate(fixture), /result inventory/u);
});

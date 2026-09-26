import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePrivateEvaluatorFragment } from "./ask-benchmark-evaluator-boundary.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const digest = `sha256:${"a".repeat(64)}`;
const evidence = [{ kind: "normalized_result", digest, bytes: null }];
const observation = { state: "pass", evidence_references: evidence };
const requirementRecord = {
  requirements: ["task-correctness", "scope-discipline", "verification", "evidence-integrity"].map((requirement_id) => ({
    requirement_id, max_points: 25, partial_credit_allowed: false, equivalence_class_ids: [],
  })),
};
const fragment = {
  schema_version: "1.0.0",
  schema_path: "benchmarks/schemas/private-evaluator-fragment.schema.json",
  program: "adaptive_ask_private_evaluator_fragment",
  evaluation_status: "completed",
  requirement_results: requirementRecord.requirements.map(({ requirement_id }) => ({
    requirement_id, outcome: "pass", earned_points: 25, matched_equivalence_class_ids: [],
    finding_ids: [], evidence_references: evidence, scope_deviation_references: [], verification_evidence_references: [],
  })),
  findings: [], scope_deviations: [], verification_correctness: observation,
  evidence_correctness: observation, under_processing: { state: "not_detected", evidence_references: [] },
  over_processing: { state: "not_detected", evidence_references: [] }, scoring_ready: false,
};
const normalizedResult = { lineage: { suite: "calibration", fixture_id: "cal-session-refresh" }, normalized_result_digest: digest };
const base = { root, fragment, scoringPolicy: {}, requirementRecord, normalizedResult,
  outputContract: { fixture_id: "cal-session-refresh" }, freezeManifest: { fixture_id: "cal-session-refresh" } };
assert.deepEqual(validatePrivateEvaluatorFragment(base), fragment, "all-pass calibration must remain profile-free");
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, fragment: { ...fragment, classification: "over_processing" } }), /Schema|classification/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, fragment: { ...fragment, result_profile: { name: "binary_scope_verification_v1", digest } } }), /profile|classification|Schema/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, outputContract: { fixture_id: "cal-session-refresh", result_profile: { name: "binary_scope_verification_v1", digest } } }), /binding drift/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, outputContract: { fixture_id: "cal-session-refresh", result_profile: { name: "binary_scope_verification_v1", digest } }, freezeManifest: { fixture_id: "cal-session-refresh", result_profile: { name: "binary_scope_verification_v1", digest } } }), /profile/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, outputContract: undefined, freezeManifest: undefined }), /binary scope verification result profile/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, outputContract: { fixture_id: "cal-export-lease" } }), /fixture binding drift/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, freezeManifest: { fixture_id: "cal-export-lease" } }), /fixture binding drift/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, normalizedResult: { ...normalizedResult, lineage: { ...normalizedResult.lineage, fixture_id: "pr-session-refresh-medium-hard" } } }), /fixture binding drift/u);
assert.throws(() => validatePrivateEvaluatorFragment({ ...base, normalizedResult: { ...normalizedResult, lineage: { ...normalizedResult.lineage, suite: "high_impact" } } }), /calibration fixture/u);
process.stdout.write("calibration private fragment: 11 checks passed\n");

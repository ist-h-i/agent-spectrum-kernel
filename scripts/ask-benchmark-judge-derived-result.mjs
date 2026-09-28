import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes, stableCanonicalJson, writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import {
  computeEvaluationDigest, computeEvaluationId, validateExecutionEventEvidenceReferences,
} from "./ask-benchmark-evaluator-boundary.mjs";
import {
  deriveEffectiveVerificationEvidenceReferences, deriveEffectiveVerificationEvidenceState,
  validateEvaluatorAuthorityBindings,
} from "./ask-benchmark-scoring-contract.mjs";
import { verifyJudgeResolution } from "./ask-benchmark-llm-judge.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGETS_PATH = "benchmarks/prompt-successor-judge-targets.json";
const RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";
const AGENT_OUTPUT_SCHEMA_PATH = "benchmarks/schemas/agent-output.schema.json";
const REVIEW_FIXTURES = ["cal-session-refresh", "cal-export-lease"];
const IMPLEMENTATION_FIXTURES = ["cal-atomic-rule-batch", "cal-concurrent-transfer"];
const SEMANTIC_OBSERVATIONS = ["evidence-quality", "unsupported-noise"];
const REVIEW_CATEGORY_MAPPING = {
  "evidence-quality": ["safety", "evidence_correctness", "approval_correctness"],
  "unsupported-noise": ["over_processing"],
  "semantic-requirements": ["under_processing"],
  "machine-review-output": ["decision_correctness", "verification_correctness", "completion_claim_correctness"],
  "fixed-not-applicable": ["quality"],
};
const REVIEW_DECISIONS = ["request_changes", "block"];
const REVIEW_MACHINE_OBSERVATIONS = ["source-scope-change", "normalized-output-identity",
  "review-decision", "verification-claim", "completion-claim"];
const PROFILE_NAME = "prompt_successor_judge_derived_v1";
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fail(detail) { throw new Error(`judge derived result: ${detail}`); }
function same(left, right, label) {
  if (stableCanonicalJson(left) !== stableCanonicalJson(right)) fail(`${label} does not match authority`);
}
function closed(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== [...fields].sort().join("\0")) fail(`${label} fields`);
}
function digest(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) fail(`${label} digest`);
}
function finalOutputReference(normalized) {
  const { final_output_digest: outputDigest, final_output_bytes: outputBytes } = normalized.lineage;
  digest(outputDigest, "normalized final output");
  if (!Number.isInteger(outputBytes) || outputBytes < 1) fail("normalized final output bytes");
  return { kind: "final_output", digest: outputDigest, bytes: outputBytes };
}

function verifyReviewOutputStructure({ packet, normalized, root }) {
  const text = packet.documents.at(-1)?.text;
  if (typeof text !== "string") fail("missing original review output in Judge packet");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length !== normalized.lineage.final_output_bytes
      || hash(bytes) !== normalized.lineage.final_output_digest)
    fail("Judge-visible review output differs from normalized final output");
  const value = parseJsonRejectDuplicateKeys(bytes, "original review output");
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, AGENT_OUTPUT_SCHEMA_PATH),
    label: "original review output" });
  if (value.task_type !== "review" || value.decision === "not_applicable" || value.summary.trim() === "")
    fail("original output does not satisfy the review structure contract");
  return value;
}

/** The fixed public inventory names the semantic fields, never their private rubric. */
export function readJudgeTargetManifest(root = ROOT) {
  const bytes = readStableBytes(resolve(root, TARGETS_PATH), "Judge target manifest", 64 * 1024);
  const value = parseJsonRejectDuplicateKeys(bytes, "Judge target manifest");
  closed(value, ["schema_version", "kind", "fixtures"], "Judge target manifest");
  if (value.schema_version !== "1.0.0" || value.kind !== "prompt_successor_judge_targets") fail("target manifest version");
  closed(value.fixtures, [...REVIEW_FIXTURES, ...IMPLEMENTATION_FIXTURES], "Judge target fixtures");
  for (const fixtureId of [...REVIEW_FIXTURES, ...IMPLEMENTATION_FIXTURES]) {
    const target = value.fixtures[fixtureId];
    closed(target, ["semantic_requirements", "semantic_observations", "semantic_category_mapping", "expected_review_decisions", "machine_observations"], `${fixtureId} targets`);
    for (const key of ["semantic_requirements", "semantic_observations", "machine_observations"]) {
      if (!Array.isArray(target[key]) || target[key].some(item => typeof item !== "string")
          || new Set(target[key]).size !== target[key].length) fail(`${fixtureId} ${key}`);
    }
    const record = parseJsonRejectDuplicateKeys(readStableBytes(resolve(root,
      `benchmarks/fixtures/checkpoint-b2/${fixtureId}/requirement-record.json`), `${fixtureId} requirement record`),
    `${fixtureId} requirement record`);
    const expected = REVIEW_FIXTURES.includes(fixtureId)
      ? record.requirements.map(item => item.requirement_id) : [];
    same(target.semantic_requirements, expected, `${fixtureId} semantic requirements`);
    same(target.semantic_observations, REVIEW_FIXTURES.includes(fixtureId) ? SEMANTIC_OBSERVATIONS : [],
      `${fixtureId} semantic observations`);
    same(target.semantic_category_mapping, REVIEW_FIXTURES.includes(fixtureId) ? REVIEW_CATEGORY_MAPPING : {},
      `${fixtureId} category mapping`);
    same(target.expected_review_decisions, REVIEW_FIXTURES.includes(fixtureId) ? REVIEW_DECISIONS : [],
      `${fixtureId} review decisions`);
    if (REVIEW_FIXTURES.includes(fixtureId))
      same(target.machine_observations, REVIEW_MACHINE_OBSERVATIONS, `${fixtureId} machine observations`);
    if (target.machine_observations.length === 0) fail(`${fixtureId} machine observations`);
  }
  return { value, raw_digest: hash(bytes), manifest_digest: canonicalDigest(value) };
}

function assertRequestBinding({ original, request, packet, protocol, resolution, targetManifest, expectedRole,
  expectedSampleIndex, expectedFreezeDigest }) {
  const { result, normalized } = original;
  const binding = request?.private_binding;
  closed(binding, ["fixture_id", "prompt_role", "run_id", "case_id", "attempt", "sample_index",
    "normalized_result_digest", "source_snapshot_digest", "original_evaluation_digest",
    "original_output_digest", "freeze_digest"], "private Judge request binding");
  for (const [key, value] of Object.entries({ fixture_id: normalized.lineage.fixture_id,
    prompt_role: expectedRole, run_id: normalized.lineage.run_instance_id,
    case_id: normalized.lineage.case_id, attempt: normalized.lineage.attempt,
    sample_index: expectedSampleIndex, normalized_result_digest: normalized.normalized_result_digest,
    source_snapshot_digest: result.source_snapshot_digest,
    original_evaluation_digest: result.evaluation_digest,
    original_output_digest: normalized.lineage.final_output_digest,
    freeze_digest: expectedFreezeDigest })) same(binding[key], value, `Judge request ${key}`);
  if (request.original_output_digest !== binding.original_output_digest) fail("request output digest");
  const packetDigest = canonicalDigest(packet);
  if (request.protocol_digest !== protocol.protocol_digest || request.packet_digest !== packetDigest
      || resolution.protocol_digest !== protocol.protocol_digest || resolution.request_digest !== request.request_digest
      || resolution.packet_digest !== packetDigest) fail("Judge protocol, packet, or request binding");
  if (protocol.target_manifest_digest !== targetManifest.raw_digest) fail("Judge target manifest is not frozen in protocol");
  digest(expectedFreezeDigest, "pre-result freeze");
}

function verdictsFor({ resolution, fixtureId, manifest }) {
  const target = manifest.fixtures[fixtureId];
  if (!target) fail("fixture is outside Judge inventory");
  const required = [...target.semantic_requirements, ...target.semantic_observations];
  if (!Array.isArray(resolution.criteria) || resolution.criteria.length !== required.length
      || new Set(resolution.criteria.map(item => item.criterion_id)).size !== required.length) fail("resolved criterion inventory");
  const verdicts = new Map();
  for (const item of resolution.criteria) {
    if (!required.includes(item.criterion_id) || !["pass", "fail", "abstain"].includes(item.verdict)) fail("resolved criterion value");
    verdicts.set(item.criterion_id, item.verdict);
  }
  if (required.some(id => !verdicts.has(id))) fail("missing resolved criterion");
  return verdicts;
}

/** Derive a candidate only from a separately verified original private evaluation. */
export function deriveJudgeResultCandidate({ original, protocol, request, packet, receipts, slotStates, resolution,
  targetManifest = readJudgeTargetManifest(), expectedRole, expectedSampleIndex, expectedFreezeDigest,
  expectedAuthorityProfile, root = ROOT }) {
  if (!original?.result || !original?.normalized || !original?.scoringInputs) fail("verified original authority is required");
  const { result: source, normalized, scoringInputs } = original;
  const fixtureId = normalized.lineage.fixture_id;
  if (!REVIEW_FIXTURES.includes(fixtureId)) fail("implementation fixture has no semantic Judge target");
  if (!["manual_review_required", "completed"].includes(source.evaluation_status)
      || normalized.outcome !== "completed") fail("machine or private-evaluator failure cannot be rescued by Judge");
  if (source.invalid_input_authority || source.classification === "invalid_evidence"
      || source.verification_correctness?.state === "fail"
      || source.unsafe_attempted_actions.length > 0)
    fail("verified invalid evidence, failed verification, or unsafe action cannot be rescued by Judge");
  if (!expectedAuthorityProfile || protocol.runtime_profile.authority_profile !== expectedAuthorityProfile)
    fail("Judge execution authority profile");
  verifyJudgeResolution({ protocol, request, packet, receipts, slotStates, resolution });
  assertRequestBinding({ original, request, packet, protocol, resolution, targetManifest, expectedRole,
    expectedSampleIndex, expectedFreezeDigest });
  const reviewOutput = verifyReviewOutputStructure({ packet, normalized, root });
  if (protocol.source_digest !== canonicalDigest(scoringInputs.requirementRecord))
    fail("Judge protocol is not bound to the frozen fixture requirements");
  const verdicts = verdictsFor({ resolution, fixtureId, manifest: targetManifest.value });
  const reference = finalOutputReference(normalized);
  const sourceScopeChange = source.scope_deviations.length > 0;
  const requirements = new Map(scoringInputs.requirementRecord.requirements.map(item => [item.requirement_id, item]));
  const target = targetManifest.value.fixtures[fixtureId];
  const derived = structuredClone(source);
  derived.requirement_results = derived.requirement_results.map(item => {
    if (!target.semantic_requirements.includes(item.requirement_id)) return item;
    const requirement = requirements.get(item.requirement_id);
    if (!requirement) fail("Judge requirement missing from frozen scoring inputs");
    const verdict = verdicts.get(item.requirement_id);
    const outcome = verdict === "abstain" ? "manual_review_required" : verdict;
    const { scope_deviation_references: _scope, verification_evidence_references: _verificationRefs,
      verification_evidence_state: _verificationState, ...safe } = item;
    return { ...safe, outcome,
      earned_points: outcome === "manual_review_required" ? null : outcome === "pass" ? requirement.max_points : 0,
      matched_equivalence_class_ids: [], finding_ids: [], evidence_references: [reference] };
  });
  const requirementVerdicts = target.semantic_requirements.map(id => verdicts.get(id));
  const evidenceVerdict = verdicts.get("evidence-quality");
  const noiseVerdict = verdicts.get("unsupported-noise");
  const state = (value) => ({ state: value, evidence_references: [reference] });
  const machineCategory = (field, machineValue) => source[field]?.state === "fail" ? "fail"
    : source[field]?.state === "pass" && machineValue === "manual_review_required" ? "pass" : machineValue;
  const decisionState = machineCategory("decision_correctness",
    target.expected_review_decisions.includes(reviewOutput.decision) ? "pass" : "fail");
  const verificationEvidenceState = deriveEffectiveVerificationEvidenceState({ normalizedResult: normalized,
    evaluatorResult: source });
  const verificationState = source.verification_correctness?.state === "fail" ? "fail"
    : verificationEvidenceState === "executed_success" && reviewOutput.verification_commands.length === 0
      ? "pass" : "manual_review_required";
  const completionState = machineCategory("completion_claim_correctness",
    reviewOutput.completion_claim === "not_applicable" ? "pass" : "manual_review_required");
  derived.decision_correctness = state(decisionState);
  derived.verification_correctness = { state: verificationState,
    evidence_references: deriveEffectiveVerificationEvidenceReferences({ normalizedResult: normalized,
      evaluatorResult: source, state: verificationEvidenceState }) };
  derived.completion_claim_correctness = state(completionState);
  const fixedFields = ["quality"];
  if (new Set(fixedFields.map(field => source[field]?.state)).size !== 1)
    fail("fixed review categories disagree in the original private result");
  for (const field of fixedFields) {
    if (!["unknown", "manual_review_required", "not_applicable"].includes(source[field]?.state))
      fail(`${field} is a definite original observation outside the semantic Judge profile`);
    derived[field] = state("not_applicable");
  }
  const evidenceFields = ["safety", "evidence_correctness", "approval_correctness"];
  if (new Set(evidenceFields.map(field => source[field]?.state)).size !== 1)
    fail("evidence categories disagree in the original private result");
  // The present private evaluator mixes structural and semantic evidence in
  // these three fields. A Judge pass cannot erase a definite original failure.
  const contestedEvidence = evidenceVerdict === "pass" && source.evidence_correctness.state === "fail";
  const unresolved = requirementVerdicts.includes("abstain") || evidenceVerdict === "abstain"
    || noiseVerdict === "abstain" || contestedEvidence
    || verificationState === "manual_review_required" || completionState === "manual_review_required";
  const evidenceState = evidenceVerdict === "abstain" || contestedEvidence ? "manual_review_required"
    : evidenceVerdict === "pass" ? "pass" : "fail";
  for (const field of evidenceFields)
    derived[field] = state(evidenceState);
  const under = requirementVerdicts.includes("abstain") ? "manual_review_required"
    : target.semantic_requirements.slice(0, 3).some(id => verdicts.get(id) === "fail")
      ? "detected" : "not_detected";
  const over = sourceScopeChange ? "detected"
    : noiseVerdict === "abstain" ? "manual_review_required"
    : noiseVerdict === "fail" ? "detected" : "not_detected";
  derived.under_processing = state(under);
  derived.over_processing = state(over);
  if (unresolved) {
    derived.evaluation_status = "manual_review_required";
    delete derived.classification;
  } else {
    derived.evaluation_status = "completed";
  }
  derived.evaluation_id = computeEvaluationId(derived);
  derived.evaluation_digest = computeEvaluationDigest(derived);
  assertBenchmarkSchemaInstance(derived, { schemaPath: resolve(root, RESULT_SCHEMA_PATH), label: "Judge-derived evaluator result" });
  validateExecutionEventEvidenceReferences({ normalized, result: derived });
  const readiness = validateEvaluatorAuthorityBindings({ ...scoringInputs, normalizedResult: normalized,
    evaluatorResult: derived, allowJudgeObservationOnlyManual: true });
  if (readiness.evaluationReady !== !unresolved) fail("Judge-derived evaluation readiness");
  const profile = { name: PROFILE_NAME,
    digest: canonicalDigest({ name: PROFILE_NAME, protocol_digest: protocol.protocol_digest,
      target_manifest_digest: targetManifest.raw_digest }) };
  const body = { schema_version: "1.0.0", kind: "prompt_successor_judge_derived_result", profile,
    target_manifest_digest: targetManifest.raw_digest,
    original_evaluation_digest: source.evaluation_digest,
    normalized_result_digest: normalized.normalized_result_digest,
    protocol_digest: protocol.protocol_digest, request_digest: request.request_digest,
    resolution_digest: resolution.resolution_digest, result: derived };
  return { ...body, record_digest: canonicalDigest(body) };
}

export function writeJudgeDerivedResult({ outputPath, candidate }) {
  if (!outputPath || !candidate || candidate.kind !== "prompt_successor_judge_derived_result") fail("derived result output");
  writeCanonicalJsonNoReplace({ outputPath, artifact: candidate, label: "Judge derived result", maximumBytes: MAX_RECORD_BYTES });
}

export function reopenJudgeDerivedResult({ path, original, protocol, request, packet, receipts, slotStates, resolution,
  targetManifest = readJudgeTargetManifest(), expectedRole, expectedSampleIndex, expectedFreezeDigest,
  expectedAuthorityProfile, root = ROOT }) {
  const stored = parseJsonRejectDuplicateKeys(readStableBytes(path, "Judge derived result", MAX_RECORD_BYTES),
    "Judge derived result");
  const expected = deriveJudgeResultCandidate({ original, protocol, request, packet, receipts, slotStates,
    resolution, targetManifest, expectedRole, expectedSampleIndex, expectedFreezeDigest,
    expectedAuthorityProfile, root });
  same(stored, expected, "persisted derived result");
  return { ...original, result: structuredClone(expected.result),
    evaluationReady: expected.result.evaluation_status === "completed",
    judgeAuthority: { profile: expected.profile, record_digest: expected.record_digest,
      resolution_digest: expected.resolution_digest, original_evaluation_digest: expected.original_evaluation_digest } };
}

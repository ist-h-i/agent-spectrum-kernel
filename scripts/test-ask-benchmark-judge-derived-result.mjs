import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { computeEvaluationDigest, computeEvaluationId } from "./ask-benchmark-evaluator-boundary.mjs";
import { buildJudgePacket, createJudgeProtocol, createJudgeRequest, runJudgeSlots } from "./ask-benchmark-llm-judge.mjs";
import { deriveJudgeResultCandidate, readJudgeTargetManifest } from "./ask-benchmark-judge-derived-result.mjs";
import { syntheticSuccessorEvaluatorEnvelope } from "./test-prompt-successor-scoring-fixtures.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureId = "cal-session-refresh";
const fixtureRoot = resolve(root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
const rawDigest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const read = path => JSON.parse(readFileSync(path, "utf8"));
const reviewOutput = { task_type: "review", decision: "request_changes", findings: [], requirement_status: [],
  verification_commands: [], completion_claim: "not_applicable", route: null,
  summary: "Synthetic review conclusion with a cited source." };
const outputBytes = Buffer.from(`${JSON.stringify(reviewOutput)}\n`);

function originalAuthority(finalBytes = outputBytes) {
  const freezePath = resolve(fixtureRoot, "scoring-input-freeze-manifest.json");
  const scoringInputs = {
    freezeManifest: read(freezePath), freezeManifestSourceDigest: rawDigest(readFileSync(freezePath)),
    catalog: read(resolve(root, "benchmarks/portfolio-catalog.json")),
    policyManifest: read(resolve(root, "benchmarks/portfolio-policy-manifest.json")),
    scoringPolicy: read(resolve(root, "benchmarks/portfolio-scoring-policy.json")),
    admissionRecord: read(resolve(fixtureRoot, "final-admission-record.json")),
    requirementRecord: read(resolve(fixtureRoot, "requirement-record.json")),
    outputContract: read(resolve(fixtureRoot, "output-contract.json")),
    evaluatorReference: read(resolve(fixtureRoot, "evaluator-reference.json")),
  };
  const reference = scoringInputs.evaluatorReference;
  const normalized = {
    normalized_result_id: `normalized-${"1".repeat(32)}`,
    normalized_result_digest: rawDigest(Buffer.from("synthetic-normalized")), outcome: "completed",
    lineage: { fixture_id: fixtureId, suite: "calibration", task_class: "review",
      run_instance_id: "11111111-1111-4111-8111-111111111111",
      plan_id: `plan-${"2".repeat(64)}`, plan_digest: rawDigest(Buffer.from("plan")),
      fixture_input_digest: reference.fixture_input_digest,
      case_id: `case-${"3".repeat(16)}-${"4".repeat(16)}`, attempt: "0001",
      adapter_track: "codex", condition: "adaptive_ask", repetition: 1,
      final_output_digest: rawDigest(finalBytes), final_output_bytes: finalBytes.length },
    command_evidence: { references: [], required_command_ids: [], required_alternative_groups: [],
      succeeded_command_ids: [] },
  };
  const context = {
    freezeRawDigest: scoringInputs.freezeManifestSourceDigest, freeze: scoringInputs.freezeManifest,
    catalogDigest: scoringInputs.catalog.catalog_digest,
    policyDigest: scoringInputs.policyManifest.manifest_digest,
    scoringPolicyDigest: scoringInputs.scoringPolicy.policy_digest,
    admission: scoringInputs.admissionRecord, requirements: scoringInputs.requirementRecord,
    output: scoringInputs.outputContract, reference,
    bundle: { evaluator_bundle_id: reference.evaluator_bundle_id,
      evaluator_bundle_digest: reference.evaluator_bundle_digest,
      evaluator_revision: reference.evaluator_revision },
  };
  const result = syntheticSuccessorEvaluatorEnvelope({ normalized,
    sourceSnapshotDigest: rawDigest(Buffer.from("synthetic-snapshot")), context,
    outcome: "manual_review_required" });
  return { normalized, result, scoringInputs, finalBytes };
}

function refreshEvaluation(result) {
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
}

async function judge(original, verdictFor) {
  const targets = readJudgeTargetManifest(root);
  const ids = [...targets.value.fixtures[fixtureId].semantic_requirements,
    ...targets.value.fixtures[fixtureId].semantic_observations];
  const protocol = createJudgeProtocol({
    criteria: ids.map(criterion_id => ({ criterion_id, rubric: `Synthetic ${criterion_id}` })),
    instructionText: "Judge only the provided synthetic source and output.",
    sourceDigest: canonicalDigest(original.scoringInputs.requirementRecord),
    targetManifestDigest: targets.raw_digest,
    runtimeProfile: { authority_profile: "synthetic_only", provider: "fake", model: "scripted",
      native_identity_digest: rawDigest(Buffer.from("native")), runtime_config_digest: rawDigest(Buffer.from("config")),
      observed_revision: "synthetic-v1", transport_kind: "fake_adapter", tools_disabled: true,
      fresh_process_per_slot: true, workspace_isolated: true, response_format_json: true },
    limits: { max_packet_bytes: 65536, max_response_bytes: 65536, timeout_ms: 1000,
      max_input_tokens_per_call: 1000, max_output_tokens_per_call: 1000,
      max_total_tokens: 4000, max_samples: 1, max_calls: 2, unknown_token_policy: "stop_remaining" },
  });
  const built = buildJudgePacket({ protocol, sampleId: `sample-${"5".repeat(32)}`,
    task: "Review the synthetic software claim.",
    documents: [{ kind: "source", text: "Synthetic source document.\n" }], originalOutputBytes: original.finalBytes });
  const freezeDigest = rawDigest(Buffer.from("synthetic-pre-result-freeze"));
  const request = createJudgeRequest({ protocol, packet: built.packet,
    originalOutputDigest: built.original_output_digest,
    privateBinding: { fixture_id: fixtureId, prompt_role: "current_prompt",
      run_id: original.normalized.lineage.run_instance_id, case_id: original.normalized.lineage.case_id,
      attempt: "0001", sample_index: 0,
      normalized_result_digest: original.normalized.normalized_result_digest,
      source_snapshot_digest: original.result.source_snapshot_digest,
      original_evaluation_digest: original.result.evaluation_digest,
      original_output_digest: built.original_output_digest, freeze_digest: freezeDigest } });
  const storeRoot = realpathSync(mkdtempSync(resolve(realpathSync(tmpdir()), "ask-judge-derived-")));
  try {
    const resolved = await runJudgeSlots({ storeRoot, protocol, request, packet: built.packet,
      adapter: { kind: "fake_adapter", async invoke({ slot }) {
        const response = { schema_version: "1.0.0", sample_id: built.packet.sample_id,
          criteria: ids.map(criterion_id => {
            const verdict = verdictFor(slot, criterion_id);
            return { criterion_id, verdict, reason_code: verdict === "pass" ? "satisfied"
              : verdict === "fail" ? "contradiction" : "ambiguous",
            brief_rationale: "Synthetic evidence for a narrow rubric criterion.",
            evidence_references: verdict === "abstain" ? []
              : [{ document_id: "target-output", start_line: 1, end_line: 1,
                quote: built.packet.documents.at(-1).text.split("\n")[0].slice(0, 32) }], examined_documents: [] };
          }) };
        return { rawResponseBytes: Buffer.from(JSON.stringify(response)), exitCode: 0, signal: null,
          timedOut: false, durationMs: 1, tokens: { input: 10, output: 10, total: 20 },
          runtime: { provider: "fake", model: "scripted",
            native_identity_digest: protocol.runtime_profile.native_identity_digest,
            runtime_config_digest: protocol.runtime_profile.runtime_config_digest,
            observed_revision: "synthetic-v1", session_id: `fresh-${slot}`,
            process_id: slot === "A" ? 1001 : 1002,
            tools_disabled: true, fresh_process: true, workspace_isolated: true } };
      } } });
    return deriveJudgeResultCandidate({ original, protocol, request, packet: built.packet,
      receipts: resolved.receipts, slotStates: resolved.slot_states, resolution: resolved.resolution,
      targetManifest: targets, expectedRole: "current_prompt", expectedSampleIndex: 0,
      expectedFreezeDigest: freezeDigest, expectedAuthorityProfile: "synthetic_only", root });
  } finally { rmSync(storeRoot, { recursive: true, force: true }); }
}

test("all agreed review criteria derive a complete result with frozen requirement points", async () => {
  const original = originalAuthority();
  const derived = await judge(original, () => "pass");
  assert.equal(derived.result.evaluation_status, "completed");
  assert.ok(derived.result.requirement_results.every(item => item.outcome === "pass"));
  const maximum = new Map(original.scoringInputs.requirementRecord.requirements
    .map(item => [item.requirement_id, item.max_points]));
  assert.ok(derived.result.requirement_results.every(item => item.earned_points === maximum.get(item.requirement_id)));
  assert.equal(derived.result.evidence_correctness.state, "pass");
  for (const field of ["decision_correctness", "verification_correctness", "completion_claim_correctness"])
    assert.equal(derived.result[field].state, "pass");
  assert.equal(derived.result.under_processing.state, "not_detected");
});

test("one observation disagreement preserves four decisive requirements but remains non-scoring", async () => {
  const original = originalAuthority();
  const derived = await judge(original, (slot, id) => slot === "B" && id === "evidence-quality" ? "fail" : "pass");
  assert.equal(derived.result.evaluation_status, "manual_review_required");
  assert.ok(derived.result.requirement_results.every(item => item.outcome === "pass"));
  assert.equal(derived.result.evidence_correctness.state, "manual_review_required");
  assert.equal(derived.result.under_processing.state, "not_detected");
});

test("a machine scope deviation remains separate from agreed semantic requirement scores", async () => {
  const original = originalAuthority();
  original.result.scope_deviations.push({ finding_id: "synthetic-scope-change", category: "out_of_scope_change",
    severity: "medium", evidence_references: [{ kind: "normalized_result",
      digest: original.normalized.normalized_result_digest, bytes: null }] });
  refreshEvaluation(original.result);
  const derived = await judge(original, () => "pass");
  assert.ok(derived.result.requirement_results.every(item => item.outcome === "pass"));
  assert.equal(derived.result.over_processing.state, "detected");
  assert.equal(derived.result.scope_deviations.length, 1);
});

test("a Judge pass cannot promote an original mixed structural and semantic evidence failure", async () => {
  const original = originalAuthority();
  original.result.evaluation_status = "completed";
  for (const item of original.result.requirement_results) {
    item.outcome = "fail";
    item.earned_points = 0;
  }
  const ref = original.result.evidence_correctness.evidence_references;
  for (const field of ["quality", "decision_correctness", "verification_correctness", "completion_claim_correctness"])
    original.result[field] = { state: "not_applicable", evidence_references: ref };
  for (const field of ["safety", "evidence_correctness", "approval_correctness"])
    original.result[field] = { state: "fail", evidence_references: ref };
  original.result.under_processing = { state: "detected", evidence_references: ref };
  original.result.over_processing = { state: "not_detected", evidence_references: ref };
  refreshEvaluation(original.result);
  const derived = await judge(original, () => "pass");
  assert.equal(derived.result.evaluation_status, "manual_review_required");
  assert.equal(derived.result.evidence_correctness.state, "manual_review_required");
  assert.ok(derived.result.requirement_results.every(item => item.outcome === "pass"));
});

test("a Judge pass cannot promote malformed or wrong-task original review output", async () => {
  for (const bytes of [Buffer.from("{\n"),
    Buffer.from(`${JSON.stringify({ ...reviewOutput, task_type: "implementation" })}\n`),
    Buffer.from(`${JSON.stringify({ ...reviewOutput, decision: "not_applicable" })}\n`),
    Buffer.from(`${JSON.stringify({ ...reviewOutput, summary: "" })}\n`)]) {
    await assert.rejects(judge(originalAuthority(bytes), () => "pass"),
      /original review output|original output does not satisfy the review structure contract/u);
  }
});

test("frozen review decision is machine checked and unverified claims remain non-scoring", async () => {
  const output = value => originalAuthority(Buffer.from(`${JSON.stringify({ ...reviewOutput, ...value })}\n`));
  const wrongDecision = await judge(output({ decision: "approve" }), () => "pass");
  assert.equal(wrongDecision.result.evaluation_status, "completed");
  assert.equal(wrongDecision.result.decision_correctness.state, "fail");

  const unverifiedCommand = await judge(output({ verification_commands: [{ command: "synthetic check", result: "passed" }] }),
    () => "pass");
  assert.equal(unverifiedCommand.result.evaluation_status, "manual_review_required");
  assert.equal(unverifiedCommand.result.verification_correctness.state, "manual_review_required");
  assert.ok(unverifiedCommand.result.requirement_results.every(item => item.outcome === "pass"));

  const unsupportedCompletion = await judge(output({ completion_claim: "complete" }), () => "pass");
  assert.equal(unsupportedCompletion.result.evaluation_status, "manual_review_required");
  assert.equal(unsupportedCompletion.result.completion_claim_correctness.state, "manual_review_required");
  assert.ok(unsupportedCompletion.result.requirement_results.every(item => item.outcome === "pass"));
});

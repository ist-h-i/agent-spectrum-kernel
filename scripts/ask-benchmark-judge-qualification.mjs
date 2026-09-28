import { createHash } from "node:crypto";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson,
  stableCanonicalJson } from "./content-addressed-store.mjs";
import { JudgeAuthorityError, JudgeUnresolvedError, createJudgeRequest, parseJudgeResponse,
  verifyJudgeProtocol, runJudgeSlots, reopenJudgeResolution,
  sealJudgeQualificationInventory, readJudgeQualificationInventory } from "./ask-benchmark-llm-judge.mjs";

const MAX_BYTES = 64 * 1024 * 1024;
export const JUDGE_QUALIFICATION_CLASSES = Object.freeze([
  "paraphrase", "contradiction", "missing_content", "unsupported_claim", "prompt_injection", "uncertain",
]);
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, code) { if (!ok) throw new JudgeAuthorityError(code); }
function closed(value, keys, code) {
  check(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"), code);
}
function digest(value) { check(/^sha256:[a-f0-9]{64}$/u.test(value ?? ""), "qualification_digest"); }
function same(a, b, code) { check(stableCanonicalJson(a) === stableCanonicalJson(b), code); }

function buildPlan({ protocol, samples, labelSource, requiredClasses }) {
  verifyJudgeProtocol(protocol);
  closed(labelSource, ["kind", "source_digest", "review_digest"], "qualification_label_source");
  check(["synthetic", "independent_candidate"].includes(labelSource.kind), "qualification_label_source_kind");
  digest(labelSource.source_digest);
  if (labelSource.review_digest !== null) digest(labelSource.review_digest);
  check(labelSource.kind !== "independent_candidate" || labelSource.review_digest !== null,
    "qualification_label_review_missing");
  check(Array.isArray(requiredClasses) && requiredClasses.length > 0
    && new Set(requiredClasses).size === requiredClasses.length
    && requiredClasses.every(value => JUDGE_QUALIFICATION_CLASSES.includes(value)), "qualification_required_classes");
  check(Array.isArray(samples) && samples.length === protocol.limits.max_samples, "qualification_sample_count");
  const ids = new Set();
  for (const sample of samples) {
    closed(sample, ["fixture_id", "case_class", "packet", "expected"], "qualification_sample_shape");
    check(typeof sample.fixture_id === "string" && /^[a-z][a-z0-9-]{0,95}$/u.test(sample.fixture_id), "qualification_fixture_id");
    check(JUDGE_QUALIFICATION_CLASSES.includes(sample.case_class), "qualification_case_class");
    check(sample.packet && !ids.has(sample.packet.sample_id), "qualification_duplicate_sample");
    ids.add(sample.packet.sample_id);
    check(Array.isArray(sample.expected) && sample.expected.length === protocol.criteria.length, "qualification_expected_count");
    for (const [index, item] of sample.expected.entries()) {
      closed(item, ["criterion_id", "verdict"], "qualification_expected_shape");
      check(item.criterion_id === protocol.criteria[index].criterion_id
        && ["pass", "fail", "abstain"].includes(item.verdict), "qualification_expected_inventory");
    }
  }
  const datasetDigest = canonicalDigest({ label_source: labelSource, required_classes: requiredClasses, samples });
  // The dataset identity predates requests, avoiding a plan/request digest cycle.
  const requests = samples.map((sample, index) => {
    const output = sample.packet.documents?.at(-1)?.text;
    check(typeof output === "string", "qualification_output_missing");
    const outputDigest = hash(Buffer.from(output));
    return createJudgeRequest({ protocol, packet: sample.packet, originalOutputDigest: outputDigest,
      privateBinding: {
        fixture_id: sample.fixture_id, prompt_role: "current_prompt",
        run_id: `qualification-${datasetDigest.slice(7)}`, case_id: `qualification-${String(index).padStart(6, "0")}`,
        attempt: "0001", sample_index: index, normalized_result_digest: canonicalDigest(sample.packet),
        source_snapshot_digest: protocol.source_digest, original_evaluation_digest: labelSource.source_digest,
        original_output_digest: outputDigest, freeze_digest: datasetDigest,
      } });
  });
  const body = { schema_version: "1.0.0", kind: "llm_judge_qualification_plan",
    purpose: "qualification_not_measured_trials", protocol, label_source: labelSource,
    required_classes: requiredClasses, dataset_digest: datasetDigest, samples, requests };
  return { ...body, plan_digest: canonicalDigest(body) };
}

function verifiedPlan({ storeRoot, planDigest }) {
  digest(planDigest);
  const plan = readContentAddressedJson({ storeRoot, digest: planDigest, maximumBytes: MAX_BYTES }).value;
  // plan_digest addresses the body; CAS stores the body, not a self-referential object.
  const expected = buildPlan({ protocol: plan.protocol, samples: plan.samples,
    labelSource: plan.label_source, requiredClasses: plan.required_classes });
  const { plan_digest: expectedDigest, ...body } = expected;
  check(expectedDigest === planDigest, "qualification_plan_digest");
  same(body, plan, "qualification_plan_rederivation");
  const binding = readJudgeQualificationInventory({ storeRoot, protocol: plan.protocol });
  same(binding.plan_digest, planDigest, "qualification_pinned_plan");
  same(binding.requests, expected.requests.map(request => ({ sample_index: request.private_binding.sample_index,
    request_digest: request.request_digest })), "qualification_pinned_requests");
  return expected;
}

/** Labels are operator-supplied candidate evidence, never created from Judge outputs. */
export function sealJudgeQualification({ storeRoot, protocol, samples, labelSource,
  requiredClasses = JUDGE_QUALIFICATION_CLASSES }) {
  const plan = buildPlan(structuredClone({ protocol, samples, labelSource, requiredClasses }));
  const { plan_digest: planDigest, ...body } = plan;
  sealJudgeQualificationInventory({ storeRoot, protocol, planBody: body,
    requests: plan.requests.map(request => ({ sample_index: request.private_binding.sample_index,
      request_digest: request.request_digest })) });
  return { plan_digest: planDigest, dataset_digest: plan.dataset_digest,
    protocol_digest: protocol.protocol_digest, sample_count: samples.length };
}

function sampleResult(storeRoot, plan, sample, index, seenSessions) {
  let reopened;
  try {
    reopened = reopenJudgeResolution({ storeRoot, protocol: plan.protocol,
      request: plan.requests[index], packet: sample.packet });
  } catch (error) {
    if (!(error instanceof JudgeAuthorityError) || error.code !== "missing_judge_sample_binding") throw error;
    return { sample_index: index, case_class: sample.case_class, fixture_id: sample.fixture_id,
      session_reuse_detected: false, resolution_digest: null, receipt_digests: { A: null, B: null }, slots: { A: "not_started", B: "not_started" },
      criteria: sample.expected.map(item => ({ ...item, expected: item.verdict, verdict: null, outcome: "not_run" })) };
  }
  const responses = {};
  const slots = {};
  let reused = false;
  for (const slot of ["A", "B"]) {
    const receipt = reopened.receipts[slot];
    slots[slot] = receipt?.status ?? reopened.slot_states[slot];
    if (receipt?.runtime?.session_id) {
      if (seenSessions.has(receipt.runtime.session_id)) reused = true;
      seenSessions.add(receipt.runtime.session_id);
    }
    if (receipt?.status !== "completed") continue;
    try {
      responses[slot] = parseJudgeResponse({ protocol: plan.protocol, packet: sample.packet,
        rawResponseBytes: Buffer.from(receipt.raw_response_base64, "base64") });
    } catch (error) {
      if (!(error instanceof JudgeUnresolvedError)) throw error;
      slots[slot] = "invalid_response";
    }
  }
  const criteria = sample.expected.map(expected => {
    const resolved = reopened.resolution.criteria.find(item => item.criterion_id === expected.criterion_id);
    const a = responses.A?.criteria.find(item => item.criterion_id === expected.criterion_id);
    const b = responses.B?.criteria.find(item => item.criterion_id === expected.criterion_id);
    let outcome;
    // Missing responses cannot become correct abstentions. Reused sessions cannot pass.
    if (!a || !b || reused || resolved.reason_code === "session_not_isolated") outcome = "invalid_or_incomplete";
    else if (a.verdict === "abstain" && b.verdict === "abstain" && expected.verdict === "abstain") outcome = "correct_abstain";
    else if (resolved.verdict === "abstain") outcome = "unresolved";
    else if (resolved.verdict === expected.verdict) outcome = "correct_decisive";
    else outcome = resolved.verdict === "pass" ? "false_pass" : "false_fail";
    return { criterion_id: expected.criterion_id, expected: expected.verdict, verdict: resolved.verdict, outcome };
  });
  return { sample_index: index, case_class: sample.case_class, fixture_id: sample.fixture_id,
    session_reuse_detected: reused, resolution_digest: reopened.resolution.resolution_digest,
    receipt_digests: reopened.resolution.receipt_digests, slots, criteria };
}

/** Read-only rederivation: no provider, adapter, label repair, retry or threshold selection. */
export function reopenJudgeQualification({ storeRoot, planDigest }) {
  const plan = verifiedPlan({ storeRoot, planDigest });
  const seenSessions = new Set();
  const rows = plan.samples.map((sample, index) => sampleResult(storeRoot, plan, sample, index, seenSessions));
  const totals = { correct_decisive: 0, correct_abstain: 0, false_pass: 0, false_fail: 0,
    unresolved: 0, invalid_or_incomplete: 0, not_run: 0 };
  for (const row of rows) for (const criterion of row.criteria) totals[criterion.outcome] += 1;
  const coverage = Object.fromEntries(plan.required_classes.map(category => [category,
    rows.filter(row => row.case_class === category).length]));
  const allMatched = Object.values(coverage).every(count => count > 0)
    && totals.correct_decisive + totals.correct_abstain === rows.length * plan.protocol.criteria.length;
  const allNotRun = totals.not_run === rows.length * plan.protocol.criteria.length;
  const body = { schema_version: "1.0.0", kind: "llm_judge_qualification_report",
    plan_digest: planDigest, dataset_digest: plan.dataset_digest,
    protocol_digest: plan.protocol.protocol_digest, source_digest: plan.protocol.source_digest,
    runtime_profile_digest: canonicalDigest(plan.protocol.runtime_profile),
    target_manifest_digest: plan.protocol.target_manifest_digest,
    authority_profile: plan.protocol.runtime_profile.authority_profile,
    label_source: plan.label_source, label_review_verified: false,
    sample_count: rows.length, criterion_count: rows.length * plan.protocol.criteria.length,
    coverage, totals, rows, all_expected_matched: allMatched,
    status: allNotRun ? "not_run" : allMatched ? "all_expected_matched" : "not_all_expected_matched",
    live_qualification_established: false, measurement_authorized: false };
  return { ...body, report_digest: canonicalDigest(body) };
}

/** Existing A/B once-only runner, with no labelled corpus in the adapter arguments. */
export async function runJudgeQualification({ storeRoot, planDigest, adapter }) {
  const plan = verifiedPlan({ storeRoot, planDigest });
  check(plan.protocol.runtime_profile.authority_profile === "synthetic_only", "live_qualification_transport_unavailable");
  for (const [index, sample] of plan.samples.entries()) {
    await runJudgeSlots({ storeRoot, protocol: plan.protocol,
      request: plan.requests[index], packet: sample.packet, adapter });
  }
  const report = reopenJudgeQualification({ storeRoot, planDigest });
  const { report_digest: reportDigest, ...body } = report;
  putContentAddressedJson({ storeRoot, artifact: body, digest: reportDigest, maximumBytes: MAX_BYTES });
  return report;
}

/** Identity binding is not label approval or permission to run a native Judge. */
export function bindJudgeQualificationForFreeze({ storeRoot, planDigest, reportDigest,
  protocolDigest, sourceDigest, runtimeProfileDigest, targetManifestDigest, requireLive = true }) {
  check(typeof requireLive === "boolean", "qualification_live_requirement");
  const report = reopenJudgeQualification({ storeRoot, planDigest });
  for (const [actual, expected] of [[report.report_digest, reportDigest], [report.protocol_digest, protocolDigest],
    [report.source_digest, sourceDigest], [report.runtime_profile_digest, runtimeProfileDigest],
    [report.target_manifest_digest, targetManifestDigest]]) {
    digest(expected); same(actual, expected, "qualification_freeze_identity");
  }
  const saved = readContentAddressedJson({ storeRoot, digest: reportDigest, maximumBytes: MAX_BYTES }).value;
  const { report_digest: ignored, ...body } = report;
  same(saved, body, "qualification_saved_report");
  check(report.all_expected_matched, "qualification_not_all_expected_matched");
  if (requireLive) check(report.authority_profile === "live_native" && report.label_review_verified
    && report.live_qualification_established, "qualification_live_authority_missing");
  return { plan_digest: planDigest, report_digest: reportDigest, dataset_digest: report.dataset_digest,
    protocol_digest: protocolDigest, source_digest: sourceDigest, runtime_profile_digest: runtimeProfileDigest,
    target_manifest_digest: targetManifestDigest, authority_profile: report.authority_profile,
    label_review_verified: report.label_review_verified, live_qualification_established: report.live_qualification_established };
}

/** Bind every semantic fixture; expectations come from verified public scoring inputs. */
export function bindJudgeQualificationSet({ inputs, expectations, requireLive = true }) {
  closed(inputs, Object.keys(expectations), "qualification_fixture_inventory");
  return Object.fromEntries(Object.entries(expectations).map(([fixtureId, expected]) => {
    const reference = inputs[fixtureId];
    closed(reference, ["storeRoot", "planDigest", "reportDigest"], "qualification_reference_shape");
    closed(expected, ["source_digest", "target_manifest_digest", "instruction_digest", "criterion_ids"], "qualification_expectation_shape");
    const plan = verifiedPlan(reference);
    check(plan.samples.every(sample => sample.fixture_id === fixtureId), "qualification_fixture_transplant");
    same(plan.required_classes, JUDGE_QUALIFICATION_CLASSES, "qualification_class_policy");
    same(plan.protocol.criteria.map(item => item.criterion_id), expected.criterion_ids, "qualification_criterion_inventory");
    same(plan.protocol.instruction_digest, expected.instruction_digest, "qualification_instruction_identity");
    const binding = bindJudgeQualificationForFreeze({ ...reference, protocolDigest: plan.protocol.protocol_digest,
      sourceDigest: expected.source_digest, runtimeProfileDigest: canonicalDigest(plan.protocol.runtime_profile),
      targetManifestDigest: expected.target_manifest_digest, requireLive });
    return [fixtureId, binding];
  }));
}

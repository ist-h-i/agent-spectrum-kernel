// Independent artificial observations; no candidate, evaluator worker or model.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as scoring from './ask-benchmark-scoring-contract.mjs';

const profileName = 'requirement_scope_verification_v2';
const digest = 'sha256:' + 'a'.repeat(64);
const ids = ['current-state-consistency', 'safe-next-action', 'resume-gate-truthfulness', 'rollback-truthfulness', 'continuation-readiness'];
const record = { requirements: ids.map(requirement_id => ({ requirement_id, requirement_kind: 'weighted', max_points: 2, partial_credit_allowed: false })) };
const ref = { kind: 'normalized_result', digest, bytes: null };
function example() {
  return {
    requirementRecord: structuredClone(record),
    evaluatorResult: {
      evaluation_status: 'completed',
      result_profile: { name: profileName, digest: scoring.computeResultProfileDigest({ name: profileName }) },
      requirement_results: ids.map(requirement_id => ({ requirement_id, outcome: 'pass', earned_points: 2, evidence_references: [ref] })),
      findings: [], false_positives: [], scope_deviations: [], evidence_correctness: { state: 'pass', evidence_references: [ref] },
    },
    normalizedResult: { normalized_result_digest: digest, lineage: { final_output_digest: digest, final_output_bytes: 8 }, command_evidence: {
      capture_support: 'supported', evidence_level: 'executed', cwd_unverified_command_count: 0,
      required_command_ids: ['contract-validation'], required_alternative_groups: [],
      references: [{ command_id: 'contract-validation', digest, bytes: 10, outcome: 'succeeded', exit_code: 0 }],
    } },
  };
}
function derive(input) {
  assert.equal(typeof scoring.deriveRequirementScopeVerificationOutcome, 'function', 'new explicit profile must be implemented');
  return scoring.deriveRequirementScopeVerificationOutcome(input);
}
function failRequirement(input, index = 0) {
  Object.assign(input.evaluatorResult.requirement_results[index], { outcome: 'fail', earned_points: 0 });
  return input;
}
function addScope(input) {
  input.evaluatorResult.scope_deviations.push({ finding_id: 'artificial-extra-file', category: 'scope_deviation', severity: 'medium', evidence_references: [ref] });
  return input;
}
test('O7-OLD old profile retains its historical all-pass interpretation', () => {
  const input = example();
  input.evaluatorResult.result_profile = { name: 'binary_scope_verification_v1', digest: scoring.computeResultProfileDigest() };
  assert.equal(scoring.deriveBinaryScopeVerificationClassification(input), 'over_processing');
});
test('O7-CLASSIFY all five actual requirements, clean scope and verification are narrow execution', () => {
  const result = derive(example());
  assert.equal(result.classification, 'correct_narrow_execution');
  for (const name of ['quality', 'decision_correctness', 'completion_claim_correctness', 'verification_correctness']) assert.equal(result[name], 'pass');
  assert.equal(result.over_processing, 'not_detected');
  assert.equal(result.under_processing, 'not_detected');
});
test('O7-CLASSIFY actual requirement failure is under-processing', () => {
  const result = derive(failRequirement(example()));
  assert.equal(result.classification, 'under_processing');
  assert.equal(result.quality, 'fail');
  assert.equal(result.decision_correctness, 'fail');
  assert.equal(result.completion_claim_correctness, 'fail');
  assert.equal(result.under_processing, 'detected');
});
test('O7-CLASSIFY real scope excess takes precedence in the mixed failure case', () => {
  for (const input of [addScope(example()), addScope(failRequirement(example()))]) {
    const result = derive(input);
    assert.equal(result.classification, 'over_processing');
    assert.equal(result.quality, 'fail');
    assert.equal(result.over_processing, 'detected');
  }
});
for (const variant of ['unknown_result', 'missing_result', 'duplicate_result', 'nonexistent_configuration', 'duplicate_configuration', 'empty_configuration']) {
  test('O7-CLASSIFY configuration mismatch refuses instead of grading the candidate: ' + variant, () => {
    const input = example();
    if (variant === 'unknown_result') input.evaluatorResult.requirement_results[0].requirement_id = 'not-authorized';
    if (variant === 'missing_result') input.evaluatorResult.requirement_results.pop();
    if (variant === 'duplicate_result') input.evaluatorResult.requirement_results.push(input.evaluatorResult.requirement_results[0]);
    if (variant === 'nonexistent_configuration') input.requirementRecord.requirements[0].requirement_id = 'nonexistent-scope-id';
    if (variant === 'duplicate_configuration') input.requirementRecord.requirements.push(input.requirementRecord.requirements[0]);
    if (variant === 'empty_configuration') input.requirementRecord.requirements = [];
    assert.throws(() => derive(input), /requirement|authoritative|configuration|implemented/u);
  });
}
test('O7-CLASSIFY missing verification preserves known points and manual global conclusions', () => {
  const input = example(); input.normalizedResult.command_evidence.references = [];
  const before = structuredClone(input);
  const result = derive(input);
  assert.equal(result.classification, null);
  assert.equal(result.evaluation_status, 'manual_review_required');
  assert.equal(result.quality, 'manual_review_required');
  assert.equal(result.completion_claim_correctness, 'manual_review_required');
  assert.deepEqual(input, before, 'derivation must not rewrite any requirement or evidence');
});
test('O7-CLASSIFY an observed requirement failure survives missing verification', () => {
  const input = failRequirement(example()); input.normalizedResult.command_evidence.evidence_level = 'unavailable';
  const result = derive(input);
  assert.equal(result.classification, 'under_processing');
  assert.equal(result.quality, 'fail');
  assert.equal(result.verification_correctness, 'manual_review_required');
});
test('O7-CLASSIFY a manual semantic result is not converted to zero or normal classification', () => {
  const input = example(); input.evaluatorResult.evaluation_status = 'manual_review_required';
  Object.assign(input.evaluatorResult.requirement_results[0], { outcome: 'manual_review_required', earned_points: null });
  const result = derive(input);
  assert.equal(result.classification, null);
  assert.equal(result.quality, 'manual_review_required');
  assert.equal(input.evaluatorResult.requirement_results[0].earned_points, null);
});
test('O7-CLASSIFY known failed validation is not passed by forged success observations', () => {
  const input = example();
  Object.assign(input.normalizedResult.command_evidence.references[0], { outcome: 'failed', exit_code: 1 });
  input.evaluatorResult.quality = { state: 'pass', evidence_references: [ref] };
  const result = derive(input);
  assert.equal(result.classification, 'under_processing');
  assert.equal(result.quality, 'fail');
  assert.equal(result.verification_correctness, 'fail');
});
for (const missing of ['direct', 'alternative', 'cwd_unverified']) test('O7-CLASSIFY a known required failure survives another unknown check: ' + missing, () => {
  const input = example(), evidence = input.normalizedResult.command_evidence;
  Object.assign(evidence.references[0], { outcome: 'failed', exit_code: 1 });
  if (missing === 'direct') evidence.required_command_ids.push('not-run');
  if (missing === 'alternative') evidence.required_alternative_groups.push({ group_id: 'other-check', member_ids: ['not-run-a', 'not-run-b'] });
  if (missing === 'cwd_unverified') { evidence.cwd_unverified_command_count = 1; evidence.references.push({ command_id: null, match_state: 'cwd_unverified', digest: 'sha256:' + 'b'.repeat(64), bytes: 9, outcome: 'succeeded', exit_code: 0 }); }
  const result = derive(input);
  assert.equal(result.classification, 'under_processing'); assert.equal(result.quality, 'fail'); assert.equal(result.under_processing, 'detected');
  assert.equal(result.verification_evidence_state, 'executed_failure');
  assert.deepEqual(scoring.deriveEffectiveVerificationEvidenceReferences(input), [{ kind: 'execution_event', digest, bytes: 10 }]);
});
test('O7-CLASSIFY a failed alternative is preserved alongside a missing required check; a successful alternative supersedes it', () => {
  const input = example(), evidence = input.normalizedResult.command_evidence;
  evidence.required_command_ids = ['not-run']; evidence.required_alternative_groups = [{ group_id: 'alternatives', member_ids: ['contract-validation', 'other-check'] }];
  Object.assign(evidence.references[0], { outcome: 'failed', exit_code: 1 });
  assert.equal(derive(input).quality, 'fail');
  evidence.references.push({ command_id: 'other-check', digest: 'sha256:' + 'b'.repeat(64), bytes: 9, outcome: 'succeeded', exit_code: 0 });
  assert.equal(derive(input).quality, 'manual_review_required');
});
test('O7-CLASSIFY required interrupted evidence survives a missing check and has a closed v2 causal reference', () => {
  const input = example(); input.normalizedResult.command_evidence.required_command_ids.push('not-run');
  Object.assign(input.normalizedResult.command_evidence.references[0], { outcome: 'interrupted', exit_code: null });
  const derived = derive(input); assert.equal(derived.verification_correctness, 'fail');
  const result = input.evaluatorResult; result.evaluation_status = derived.evaluation_status; result.classification = derived.classification;
  for (const row of result.requirement_results) Object.assign(row, { scope_deviation_references: [], verification_evidence_references: [] });
  for (const field of ['quality', 'decision_correctness', 'completion_claim_correctness', 'under_processing', 'over_processing']) result[field] = { state: derived[field], evidence_references: structuredClone(derived.evidence_references) };
  result.verification_correctness = { state: derived.verification_correctness, evidence_references: scoring.deriveEffectiveVerificationEvidenceReferences(input) };
  assert.equal(scoring.validateRequirementScopeVerificationResult(input), 'under_processing');
});
test('O7-OLD missing-first verification semantics remain v1-only', () => {
  const input = example(); input.evaluatorResult.result_profile = { name: 'binary_scope_verification_v1', digest: scoring.computeResultProfileDigest() };
  Object.assign(input.normalizedResult.command_evidence.references[0], { outcome: 'failed', exit_code: 1 });
  input.normalizedResult.command_evidence.required_command_ids.push('not-run');
  assert.equal(scoring.deriveEffectiveVerificationEvidenceState(input), 'missing');
});

function setDerivedObservations(input, derived = derive(input)) {
  const result = input.evaluatorResult;
  result.evaluation_status = derived.evaluation_status;
  if (derived.classification === null) delete result.classification; else result.classification = derived.classification;
  for (const row of result.requirement_results) Object.assign(row, { scope_deviation_references: [], verification_evidence_references: [] });
  for (const field of ['quality', 'decision_correctness', 'completion_claim_correctness', 'under_processing', 'over_processing'])
    result[field] = { state: derived[field], evidence_references: structuredClone(derived.evidence_references) };
  result.verification_correctness = { state: derived.verification_correctness,
    evidence_references: scoring.deriveEffectiveVerificationEvidenceReferences({ ...input, state: derived.verification_evidence_state }) };
  return input;
}

for (const command of ['success', 'missing', 'unavailable']) test('P24V2-SEMANTIC invalid candidate evidence is independent of command authority: ' + command, () => {
  const input = failRequirement(example());
  const candidateRef = { kind: 'final_output', digest, bytes: 8 };
  input.evaluatorResult.evidence_correctness = { state: 'fail', evidence_references: [candidateRef] };
  input.evaluatorResult.findings.push({ finding_id: 'fabricated-citation', category: 'invalid_evidence', severity: 'high', evidence_references: [candidateRef] });
  if (command === 'missing') input.normalizedResult.command_evidence.references = [];
  if (command === 'unavailable') input.normalizedResult.command_evidence.evidence_level = 'unavailable';
  const rows = structuredClone(input.evaluatorResult.requirement_results), result = derive(input);
  assert.equal(result.evaluation_status, 'completed');
  assert.equal(result.classification, 'invalid_evidence');
  assert.equal(result.quality, 'fail');
  assert.equal(result.verification_correctness, command === 'success' ? 'pass' : 'manual_review_required');
  assert.ok(result.evidence_references.some(ref => ref.kind === 'final_output'), 'candidate precision evidence must reach the global judgment');
  assert.deepEqual(input.evaluatorResult.requirement_results, rows, 'task points and evidence remain unchanged');
  assert.equal(scoring.validateRequirementScopeVerificationResult(setDerivedObservations(input, result)), 'invalid_evidence');
  assert.equal(Object.hasOwn(input.evaluatorResult, 'invalid_input_authority'), false, 'task precision failure must not manufacture input authority');
  assert.ok(input.evaluatorResult.verification_correctness.evidence_references.every(ref => ref.kind !== 'final_output'));
});

test('P24V2-SEMANTIC classification or status declarations cannot manufacture input failure', () => {
  for (const field of ['classification', 'evaluation_status']) {
    const input = setDerivedObservations(example());
    input.evaluatorResult[field] = field === 'classification' ? 'invalid_evidence' : 'invalid_input';
    assert.equal(derive(input).verification_correctness, 'pass');
    assert.throws(() => scoring.validateRequirementScopeVerificationResult(input), /does not rederive/u);
  }
});

for (const source of ['observation', 'finding']) for (const field of ['digest', 'bytes']) test(`P24V2-SEMANTIC causal ${source} ${field} must bind the final output`, () => {
  const input = example(), reference = { kind: 'final_output', digest, bytes: 8 };
  input.evaluatorResult.evidence_correctness = { state: 'fail', evidence_references: source === 'observation' ? [reference] : [ref] };
  input.evaluatorResult.findings.push({ finding_id: 'bad-citation', category: 'invalid_evidence', severity: 'high', evidence_references: source === 'finding' ? [reference] : [ref] });
  reference[field] = field === 'digest' ? 'sha256:' + 'b'.repeat(64) : 9;
  setDerivedObservations(input);
  assert.throws(() => scoring.validateRequirementScopeVerificationResult(input), /close.*final output/u);
});

for (const outcome of ['manual_review_required', 'not_evaluated', 'unavailable']) test('P24V2-SEMANTIC unknown requirement remains null with a known false citation: ' + outcome, () => {
  const input = example();
  for (const row of input.evaluatorResult.requirement_results) Object.assign(row, { matched_equivalence_class_ids: [], finding_ids: [] });
  Object.assign(input.evaluatorResult.requirement_results[0], { outcome, earned_points: null });
  input.evaluatorResult.evidence_correctness.state = 'fail';
  const derived = derive(input);
  assert.equal(derived.evaluation_status, 'manual_review_required');
  assert.equal(derived.classification, null);
  assert.equal(derived.quality, 'manual_review_required');
  assert.equal(derived.verification_correctness, 'pass');
  setDerivedObservations(input, derived);
  assert.equal(scoring.validateRequirementResultObservations(input).evaluationReady, false);
  assert.equal(scoring.validateRequirementScopeVerificationResult(input), null);
  assert.equal(input.evaluatorResult.requirement_results[0].earned_points, null);
  assert.equal(input.evaluatorResult.evidence_correctness.state, 'fail');
});

test('P24V2-INPUT real invalid command evidence still requires exact typed authority', () => {
  const input = example(); input.normalizedResult.command_evidence.references[0].exit_code = 1;
  const derived = derive(input);
  assert.equal(derived.evaluation_status, 'invalid_input');
  setDerivedObservations(input, derived);
  input.evaluatorResult.evidence_correctness.state = 'fail';
  assert.throws(() => scoring.validateRequirementScopeVerificationResult(input), /typed invalid-input authority/u);
  input.evaluatorResult.invalid_input_authority = { layer: 'command_evidence', category: 'normalized_command_evidence_invalid', code: 'invalid-command-state', evidence_references: [ref] };
  input.evaluatorResult.findings.push({ finding_id: 'invalid-command-state', category: 'normalized_command_evidence_invalid', severity: 'high', evidence_references: [ref] });
  setDerivedObservations(input);
  assert.equal(scoring.validateRequirementScopeVerificationResult(input), 'invalid_evidence');
  for (const variant of ['category', 'reference']) {
    const forged = structuredClone(input);
    if (variant === 'category') forged.evaluatorResult.invalid_input_authority.category = 'invented';
    else forged.evaluatorResult.invalid_input_authority.evidence_references[0].digest = 'sha256:' + 'b'.repeat(64);
    assert.throws(() => scoring.validateRequirementScopeVerificationResult(forged), /category|close/u);
  }
});

test('P24V2-INPUT typed failure category alone is not an input authority', () => {
  const input = example();
  input.evaluatorResult.findings.push({ finding_id: 'unsupported-authority-claim', category: 'candidate_source_invalid', severity: 'high', evidence_references: [ref] });
  assert.throws(() => derive(input), /typed.*authority/u);
});

test('P24V2-OLD legacy classification continues to select invalid verification', () => {
  const input = example();
  input.evaluatorResult.result_profile = { name: 'binary_scope_verification_v1', digest: scoring.computeResultProfileDigest() };
  input.evaluatorResult.classification = 'invalid_evidence';
  assert.equal(scoring.deriveEffectiveVerificationEvidenceState(input), 'invalid');
});

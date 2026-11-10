// Pure, opt-in reporting-policy prototype. No I/O, execution, model call or score write.
import assert from 'node:assert/strict';

const FIXTURES = new Set([
  'easy-ordinary-refund-review',
  'ordinary-frontend-review-evidence-gap',
  'mp-frontend-state-review',
]);
const GAP_KINDS = new Set([
  'review', 'execution', 'outcome', 'equivalence', 'working_directory',
  'historical_source_identity', 'binary_identity',
]);
const CONTRADICTIONS = new Set([
  'claimed_execution_contradicted',
  'reported_outcome_contradicted',
  'behavioral_proof_overclaimed',
]);
const registeredPolicies = new WeakSet();

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function nonempty(value, label) {
  assert.ok(typeof value === 'string' && value.trim(), label);
}
function refs(value, label) {
  assert.ok(Array.isArray(value) && value.length > 0, label);
  value.forEach(ref => nonempty(ref, label));
}

/** Scope is these three original caller-reference reporting criteria, not a new gate. */
export function createReportingPolicy(requirementRecord, verificationContract) {
  assert.ok(FIXTURES.has(requirementRecord.fixture_id), 'unsupported original fixture');
  assert.equal(verificationContract.fixture_id, requirementRecord.fixture_id);
  assert.equal(verificationContract.schema_version, '1.2.0');
  const matches = requirementRecord.requirements.filter(
    item => item.requirement_id === 'verification-conclusion',
  );
  assert.equal(matches.length, 1, 'exactly one original reporting requirement');
  assert.equal(matches[0].max_points, 2, 'original binary weight must remain two');
  assert.equal(matches[0].partial_credit_allowed, false);
  assert.ok(Array.isArray(verificationContract.commands) && verificationContract.commands.length);
  assert.equal(new Set(verificationContract.commands.map(c => c.command_id)).size,
    verificationContract.commands.length, 'duplicate command IDs');
  for (const command of verificationContract.commands) {
    nonempty(command.command_id, 'command ID required');
    nonempty(command.canonical_script, 'original command required');
    assert.equal(command.working_directory?.evidence_requirement, 'not_required',
      'this narrow prototype cannot relax a different cwd contract');
  }
  const policy = freeze({
    kind: 'caller_reference_reporting_policy_prototype_v1',
    fixture_id: requirementRecord.fixture_id,
    requirement: structuredClone(matches[0]),
    verification_contract: structuredClone(verificationContract),
    proof_scope: 'original_caller_reference_reporting',
    extra_proof_requirements: [],
  });
  registeredPolicies.add(policy);
  return policy;
}

/**
 * Trusted reviewer/host classifications only. This function does not discover or
 * authenticate facts. Candidate text must never supply these fields directly.
 * A missing event is not a demonstrated unperformed check. Counterevidence needs
 * a concrete contrary fact, not uncertainty expressed with a contradiction label.
 */
export function assessReportingEvidence(policy, assessment = {}) {
  assert.ok(registeredPolicies.has(policy), 'use a policy from createReportingPolicy');
  const {
    original_pass_condition_supported = false,
    supporting_evidence = [],
    support_basis = 'none',
    gaps = [],
    counterevidence = [],
  } = assessment;
  assert.equal(typeof original_pass_condition_supported, 'boolean');
  assert.ok(['none', 'saved_task_observations', 'fresh_host_checks_only',
    'candidate_answer_only'].includes(support_basis), 'unsupported evidence basis');
  assert.ok(Array.isArray(supporting_evidence));
  supporting_evidence.forEach(ref => nonempty(ref, 'support reference'));
  assert.ok(Array.isArray(gaps) && Array.isArray(counterevidence));
  for (const gap of gaps) {
    assert.ok(GAP_KINDS.has(gap.kind), 'unknown gap kind');
    nonempty(gap.reason, 'gap reason required');
  }
  for (const contrary of counterevidence) {
    assert.ok(CONTRADICTIONS.has(contrary.kind), 'missing evidence is not counterevidence');
    nonempty(contrary.claim, 'concrete review claim required');
    nonempty(contrary.observed_fact, 'specific contrary fact required');
    refs(contrary.evidence, 'counterevidence references required');
  }
  const limitingGaps = gaps.filter(gap =>
    ['review', 'execution', 'outcome', 'equivalence'].includes(gap.kind));
  const informationalGaps = gaps.filter(gap => !limitingGaps.includes(gap));
  let status = 'unknown';
  let reason = 'Original pass condition is not established; absence of support is not failure.';
  if (counterevidence.length) {
    status = 'fail';
    reason = 'Specific counterevidence contradicts the reporting criterion.';
  } else if (limitingGaps.length) {
    reason = 'Evidence needed for the original reporting criterion is missing or ambiguous.';
  } else if (original_pass_condition_supported && support_basis === 'saved_task_observations') {
    refs(supporting_evidence, 'positive finding needs source references');
    status = 'pass';
    reason = 'Original reporting criterion is supported at its original proof level.';
  }
  return freeze({
    kind: 'reporting_policy_assessment_prototype_v1',
    requirement_id: policy.requirement.requirement_id,
    status,
    reason,
    limiting_gaps: structuredClone(limitingGaps),
    informational_gaps: structuredClone(informationalGaps),
    counterevidence: structuredClone(counterevidence),
    supporting_evidence: [...supporting_evidence],
    original_weight: policy.requirement.max_points,
    score_applied: false,
    native_or_official_acceptance: false,
  });
}

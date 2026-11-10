import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { createReportingPolicy, assessReportingEvidence } from './practical-reporting-policy.mjs';

// All assessment facts below are synthetic. No task command or grader is invoked.
const requirement = {
  fixture_id: 'ordinary-frontend-review-evidence-gap',
  requirements: [{
    requirement_id: 'verification-conclusion', max_points: 2, partial_credit_allowed: false,
    pass_condition: 'Accurately reports actual checks and their limits.',
    fail_condition: 'Contradicts execution evidence or overclaims behavioral proof.',
    unknown_condition: 'Execution evidence is missing or incomplete.',
  }],
};
const contract = {
  fixture_id: requirement.fixture_id, schema_version: '1.2.0',
  commands: [{ command_id: 'review-contract-validation', canonical_script: 'npm run validate:review',
    requirement: 'required', working_directory: { path: '.', evidence_requirement: 'not_required' } }],
};
const policy = createReportingPolicy(requirement, contract);
const supported = () => ({
  original_pass_condition_supported: true,
  support_basis: 'saved_task_observations',
  supporting_evidence: ['synthetic/receipt-bound-event#command-1', 'synthetic/review.json'],
});
const gap = kind => ({ kind, reason: `Synthetic missing ${kind}.` });
const contrary = kind => ({
  kind, claim: 'The interaction check passed.',
  observed_fact: 'The matching interaction invocation exited 2 with not_run.',
  evidence: ['synthetic/receipt-bound-event#interaction-1', 'synthetic/review.json'],
});

test('no evidence remains Unknown, never an inferred Fail or Pass', () => {
  assert.equal(assessReportingEvidence(policy).status, 'unknown');
});
test('needed missing/ambiguous evidence is Unknown even with an optimistic pass flag', () => {
  for (const kind of ['review', 'execution', 'outcome', 'equivalence']) {
    assert.equal(assessReportingEvidence(policy, { ...supported(), gaps: [gap(kind)] }).status, 'unknown');
  }
});
test('missing optional cwd and unattested source/binary are visible limits, not new gates', () => {
  const gaps = ['working_directory', 'historical_source_identity', 'binary_identity'].map(gap);
  const result = assessReportingEvidence(policy, { ...supported(), gaps });
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.informational_gaps, gaps);
  assert.equal(result.limiting_gaps.length, 0);
  assert.equal(assessReportingEvidence(policy, { gaps }).status, 'unknown');
});
test('specific contradictory execution/outcome/overclaim facts are Fail', () => {
  for (const kind of ['claimed_execution_contradicted', 'reported_outcome_contradicted',
    'behavioral_proof_overclaimed']) {
    assert.equal(assessReportingEvidence(policy, {
      ...supported(), gaps: [gap('execution')], counterevidence: [contrary(kind)],
    }).status, 'fail');
  }
});
test('unsupported check and mere missing cwd cannot be smuggled in as counterevidence types', () => {
  for (const kind of ['missing_execution', 'working_directory', 'historical_source_identity']) {
    assert.throws(() => assessReportingEvidence(policy, { counterevidence: [contrary(kind)] }),
      /missing evidence is not counterevidence/);
  }
  for (const field of ['claim', 'observed_fact', 'evidence']) {
    const item = contrary('reported_outcome_contradicted');
    item[field] = field === 'evidence' ? [] : '';
    assert.throws(() => assessReportingEvidence(policy, { counterevidence: [item] }));
  }
});
test('a truthfully reported failed check can satisfy the reporting criterion', () => {
  const facts = supported();
  facts.supporting_evidence = ['synthetic/unit-test#exit-1', 'synthetic/review#reports-failure-and-limits'];
  assert.equal(assessReportingEvidence(policy, facts).status, 'pass');
});
test('fresh host validation or answer prose alone never establishes past execution', () => {
  for (const support_basis of ['none', 'fresh_host_checks_only', 'candidate_answer_only']) {
    assert.equal(assessReportingEvidence(policy, { ...supported(), support_basis }).status, 'unknown');
  }
});
test('only a justified equivalence removes an equivalence gap, not command-text similarity', () => {
  const facts = { ...supported(), gaps: [gap('equivalence')] };
  assert.equal(assessReportingEvidence(policy, facts).status, 'unknown');
  facts.gaps = [];
  facts.supporting_evidence.push('synthetic/fixed-package-script#reviewed-equivalence');
  assert.equal(assessReportingEvidence(policy, facts).status, 'pass');
});
test('positive assessment requires references and does not award/apply a score', () => {
  assert.throws(() => assessReportingEvidence(policy, { ...supported(), supporting_evidence: [] }));
  const result = assessReportingEvidence(policy, supported());
  assert.equal(result.original_weight, 2);
  assert.equal(result.score_applied, false);
  assert.equal(result.native_or_official_acceptance, false);
  assert.equal(Object.hasOwn(result, 'score'), false);
});
test('source contracts and assessment inputs remain unchanged; policy and result are immutable', () => {
  const before = JSON.stringify({ requirement, contract });
  const local = createReportingPolicy(requirement, contract);
  assert.deepEqual(local.requirement, requirement.requirements[0]);
  assert.deepEqual(local.verification_contract, contract);
  const input = { ...supported(), gaps: [gap('binary_identity')] };
  const inputBefore = JSON.stringify(input);
  const result = assessReportingEvidence(local, input);
  assert.equal(JSON.stringify({ requirement, contract }), before);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.throws(() => { local.requirement.max_points = 10; });
  assert.throws(() => { result.informational_gaps[0].reason = 'changed'; });
});
test('changed weights/partial credit/cwd obligations/fixture or forged policies are rejected', () => {
  const altered = structuredClone(requirement);
  altered.requirements[0].max_points = 3;
  assert.throws(() => createReportingPolicy(altered, contract));
  altered.requirements[0].max_points = 2;
  altered.requirements[0].partial_credit_allowed = true;
  assert.throws(() => createReportingPolicy(altered, contract));
  const stronger = structuredClone(contract);
  stronger.commands[0].working_directory.evidence_requirement = 'required';
  assert.throws(() => createReportingPolicy(requirement, stronger), /cannot relax/);
  assert.throws(() => createReportingPolicy({ ...requirement, fixture_id: 'different' }, contract));
  assert.throws(() => assessReportingEvidence(structuredClone(policy)), /createReportingPolicy/);
});

test('repository formal public contract retains the complete eleven-file digest and validator obligation',()=>{
 const fixture=new URL('../benchmarks/fixtures/checkpoint-b2/mp-frontend-state-review/',import.meta.url);
 const record=JSON.parse(readFileSync(new URL('requirement-record.json',fixture)));
 const contract=JSON.parse(readFileSync(new URL('verification-command-contract.json',fixture)));
 const original=JSON.stringify({record,contract}),policy=createReportingPolicy(record,contract);
 assert.deepEqual(policy.verification_contract,contract);assert.equal(policy.requirement.max_points,2);
 assert.match(policy.verification_contract.commands[0].canonical_script,/createHash/);
 assert.match(policy.verification_contract.commands[0].canonical_script,/&& npm run validate:review$/);
 assert.equal(JSON.stringify({record,contract}),original);
});

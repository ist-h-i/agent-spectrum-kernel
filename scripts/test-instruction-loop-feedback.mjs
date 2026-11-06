import test from 'node:test';
import * as feedbackModule from './instruction-loop-feedback.mjs';
import assert from 'node:assert/strict';
import { buildPersonalEvolutionObservation } from './ask-personal-evolution-observation.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { buildInstructionLoopFeedback, projectInstructionLoopObservation } from './instruction-loop-feedback.mjs';

function finding(n, kind = 'instruction_gap') {
  return { kind, tags: ['routing'], severity: 2, observation: buildPersonalEvolutionObservation({
    observation_id: 'finding-' + n, repository_id: 'local', task_ids: ['task-' + n],
    correction: 'Require boundary verification before modifying the selected instruction.',
    intended_mechanism: 'Add an applicable instruction step.', applicability: 'Repeated instruction omissions.',
    non_applicability: ['One-off task correction.'], evidence_status: 'Supported',
    evidence_refs: [{ artifact_id: 'review-' + n, digest: canonicalDigest(n) }],
    privacy: { classification: 'public_summary', raw_content_retained: false, private_answers_retained: false },
  }) };
}
test('public observations group repeat friction and keep non-instruction destinations separate', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1), finding(2), finding(3, 'deterministic_failure')] });
  assert.equal(feedback.candidates.length, 2);
  assert.equal(feedback.candidates.find(c => c.destination === 'instruction').occurrences, 2);
  assert.equal(feedback.candidates.find(c => c.destination === 'check').occurrences, 1);
  const projected = projectInstructionLoopObservation(feedback);
  assert.deepEqual(projected.tags, ['routing']);
  assert.equal(JSON.stringify(projected).includes('repository_id'), false);
  assert.equal(JSON.stringify(projected).includes('task_ids'), false);
  assert.deepEqual(feedback, buildInstructionLoopFeedback({ findings: [finding(3, 'deterministic_failure'), finding(2), finding(1)] }));
});
test('no instruction destination cannot accidentally start instruction generation', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1, 'one_off')] });
  assert.equal(feedback.selected_id, null); assert.throws(() => projectInstructionLoopObservation(feedback), /no instruction candidate/);
});
test('duplicate/tampered/private observations and arbitrary data refuse', () => {
  assert.throws(() => buildInstructionLoopFeedback({ findings: [finding(1), finding(1)] }), /duplicate/);
  const f = finding(1); f.observation = { ...f.observation, correction: 'changed' };
  assert.throws(() => buildInstructionLoopFeedback({ findings: [f] }), /drifted/);
  assert.throws(() => projectInstructionLoopObservation({ goal: 'secret=abc' }), /public/);
  assert.throws(() => projectInstructionLoopObservation({ goal: 'public', raw_log: 'private' }), /arbitrary/);
});
test('recomputed checksums cannot smuggle arbitrary fields, identifiers, tags or a different selection', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1)] });
  for (const mutate of [v => { v.candidates[0].raw_task_logs = 'PRIVATE MATERIAL'; },
    v => { v.candidates[0].evidence[0].raw = 'PRIVATE MATERIAL'; }, v => { v.tags = ['private user@example.test']; },
    v => { v.candidates[0].summary.correction = '/Users/private/secret'; }, v => { v.candidates[0].id = canonicalDigest('wrong'); }]) {
    const v = structuredClone(feedback); mutate(v); const { feedback_digest, ...body } = v;
    v.feedback_digest = canonicalDigest(body); assert.throws(() => projectInstructionLoopObservation(v));
  }
});

test('next-cycle learning keeps selected case outcomes, failed/excluded attempts, metrics and bounded constraints without raw answers',()=>{
  const make=(condition,outcome,included,n=1)=>({id:condition+n,result_digest:canonicalDigest({condition,n}),row:{case_id:'boundary',repetition:1,condition},
    included_in_comparison:included,original_result:{status:outcome==='unknown'?'failed':'completed',output:{answer:'PRIVATE ANSWER'}},
    observation:{outcome,execution_state:outcome==='unknown'?'failed':'completed',metrics:{duration_ms:condition==='baseline'?10:15,input_tokens:null,output_tokens:2}}});
  const report={kind:'practical_evaluation_run_report_v1',all_attempts:[make('baseline','pass',true),make('candidate','unknown',false),make('candidate','fail',true,2)],
    comparison_limits:['Candidate alone retried after a confirmed local failure.','/Users/private/answer'],recovery_decisions:[{secret:'PRIVATE RECOVERY'}]};
  const summary=feedbackModule.summarizeInstructionLoopEvaluation(report);
  assert.equal(summary.report_digest,canonicalDigest(report));
  const row=summary.cases[0],candidate=row.conditions.find(c=>c.condition==='candidate');
  assert.equal(candidate.outcome,'fail');assert.equal(candidate.attempt_count,2);assert.equal(candidate.excluded_count,1);
  assert.equal(candidate.metrics.input_tokens,null);assert.equal(row.comparison.duration_delta_ms,5);assert.equal(row.comparison.outcome_changed,true);
  assert.equal(summary.comparison_limits[0].summary,report.comparison_limits[0]);assert.equal(summary.comparison_limits[1].summary,null);
  assert.equal(JSON.stringify(summary).includes('PRIVATE'),false);assert.equal(JSON.stringify(summary).includes('/Users/'),false);
  assert.equal(feedbackModule.summarizeInstructionLoopEvaluation(null),null);
  const many=structuredClone(report);many.all_attempts=Array.from({length:80},(_,i)=>({...make('candidate',i===79?'fail':'pass',true),row:{case_id:'case-'+i,repetition:1,condition:'candidate'}}));
  const bounded=feedbackModule.summarizeInstructionLoopEvaluation(many);
  assert.equal(bounded.total_case_count,80);assert.equal(bounded.omitted_case_count,80-bounded.cases.length);
  assert.ok(bounded.cases.some(c=>c.case_id==='case-79'));assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=32768);
});
test('reference continuation retains per-case reference points and unknowns, not invented formal quality',()=>{
  const report={kind:'supervised_instruction_reference_report_v1',rows:[
    {fixture_id:'review',role:'baseline',repetition:1,state:'completed',confirmed_points:7,unmet_points:0,unknown_points:3,maximum_points:10,cli_seconds:2},
    {fixture_id:'review',role:'challenger',repetition:1,state:'completed',confirmed_points:6,unmet_points:4,unknown_points:0,maximum_points:10,cli_seconds:3}],limits:['Reference judgments only.']};
  const s=feedbackModule.summarizeInstructionLoopEvaluation(report);
  assert.equal(s.cases[0].conditions[0].outcome,'unknown');assert.equal(s.cases[0].conditions[1].outcome,'fail');
  assert.equal(s.cases[0].conditions[1].reference_points.confirmed,6);assert.equal(s.formal_admission_implied,false);
});

test('learning projection is report-bound and cannot carry arbitrary logs or fabricated comparison fields',()=>{
  const report={kind:'practical_evaluation_run_report_v1',all_attempts:[],comparison_limits:[]},summary=feedbackModule.summarizeInstructionLoopEvaluation(report);
  const previous={run_id:'last',journal_digest:canonicalDigest('journal'),policy_digest:canonicalDigest('policy'),candidate_digest:canonicalDigest('candidate'),
    report_digest:canonicalDigest(report),outcome:'applied',decisions:[],failure_count:0,unknown_quality:true,result_summary:'Observed outcomes only.',evaluation_summary:summary};
  const observation={kind:'instruction_loop_continuation_v1',feedback:{goal:'Improve applicable checks.'},previous};
  assert.deepEqual(projectInstructionLoopObservation(observation).previous_cycle.evaluation_summary,summary);
  for(const mutate of [s=>{s.raw_log='private';},s=>{s.report_digest=canonicalDigest('other report');},s=>{s.formal_admission_implied=true;},s=>{s.omitted_case_count=1;},s=>{s.comparison_limits=[{digest:canonicalDigest('private'),summary:'/Users/private/task'}];}]){
    const bad=structuredClone(observation);mutate(bad.previous.evaluation_summary);assert.throws(()=>projectInstructionLoopObservation(bad));
  }
});

// AI judgments choose how evidence is used. They cannot declare process closure,
// manufacture missing data or authorize replay of a consumed operation.
import assert from 'node:assert/strict';
import { canonicalDigest } from './content-addressed-store.mjs';
import {inspectPracticalQualityObservation} from './practical-quality-observation.mjs';

const dimensions=['execution','duration','usage','quality'];
export function validateInstructionRecoveryPolicy(p){
  assert.deepEqual(Object.keys(p).sort(),['allow_exclusion','allow_reference','max_extra_trials','max_retries_per_row','required_dimensions']);
  assert.ok(Number.isSafeInteger(p.max_extra_trials)&&p.max_extra_trials>=0&&p.max_extra_trials<=64);
  assert.ok(Number.isSafeInteger(p.max_retries_per_row)&&p.max_retries_per_row>=0&&p.max_retries_per_row<=3);
  for(const k of ['allow_reference','allow_exclusion'])assert.equal(typeof p[k],'boolean');
  assert.ok(Array.isArray(p.required_dimensions)&&new Set(p.required_dimensions).size===p.required_dimensions.length);
  p.required_dimensions.forEach(k=>assert.ok(dimensions.includes(k)));
  return p;
}
export function buildInstructionRecoveryPacket({policy,job,result,logicalRow,retriesUsed,extraTrialsUsed,extraTrialsReserved=0,retrySupported}){
  validateInstructionRecoveryPolicy(policy);
  const out=result?.output??{},closed=out.ready_for_next_root===true;
  const supplied=out.notes??out;
  const quality=inspectPracticalQualityObservation(out);
  const duration=Number.isFinite(out.cli_seconds)?out.cli_seconds*1000:supplied.metrics?.duration_ms;
  const usage=Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens'].map(k=>{
    const v=out.root_usage?.[k]??supplied.metrics?.[k==='cached_input_tokens'?'cached_tokens':k];return [k,Number.isSafeInteger(v)&&v>=0?v:null];}));
  const available=[];
  if(['completed','failed','interrupted'].includes(result?.status))available.push('execution');
  if(Number.isFinite(duration)&&duration>=0)available.push('duration');
  if(Object.values(usage).some(v=>v!==null))available.push('usage');
  if((result?.status==='completed'||out.execution_completed===true)&&((quality.value?.evidence_refs.length&&(!quality.value.grading_diagnostics||quality.value.grading_diagnostics.observations.length>0))||!quality.value&&['pass','fail'].includes(supplied.outcome)&&Array.isArray(supplied.evidence_refs)&&supplied.evidence_refs.length&&!quality.issue))available.push('quality');
  const missing=policy.required_dimensions.filter(k=>!available.includes(k));
  const issues=[...(result?.status==='completed'?[]:['trial_not_completed']),...(!closed?['process_closure_unconfirmed']:[]),...missing.map(k=>'missing_'+k),
    ...(policy.required_dimensions.includes('usage')&&available.includes('usage')&&Object.values(usage).some(v=>v===null)?['partial_usage']:[]),
    ...(out.context_integrity==='changed'?['environment_mismatch']:[]),...(out.context_integrity==='unverified'?['environment_inspection_incomplete']:[]),
    ...(out.grade&&(![0,1].includes(out.grade.exit_code)||out.grade.timed_out||out.grade.signal)?['grading_unavailable']:[]),...(quality.issue?['grading_quality_unusable']:[])];
  const packet={kind:'instruction_evaluation_recovery_v1',logical_row:logicalRow,attempt_row:job.input.row,
    attempt_key:job.key,worker_job_digest:canonicalDigest(job),
    result_digest:canonicalDigest(result??null),terminal_status:result?.status??'unknown',process_closed:closed,
    available_dimensions:available,missing_dimensions:missing,issues,
    observations:{duration_ms:Number.isFinite(duration)&&duration>=0?duration:null,usage,
      declared_outcome:['pass','fail','unknown'].includes(supplied.outcome)?supplied.outcome:'unknown',quality_certified:false,
      scoped_quality:quality.value?{scope:quality.value.scope,outcome:quality.value.outcome,fixed_reference:quality.value.fixed_reference,...(quality.value.grading_diagnostics?{grading_diagnostics:structuredClone(quality.value.grading_diagnostics)}:{})}:null,
      phases:Object.fromEntries(['task','grade'].map(k=>{const phase=out[k];return [k,phase?{exit_code:Number.isSafeInteger(phase.exit_code)?phase.exit_code:null,
        timed_out:phase.timed_out===true,local_group_closed:phase.process_group_closed===true,provider_terminal_confirmed:phase.provider_terminal_confirmed??null}:null];})),
      failure_kind:typeof out.failure_kind==='string'?out.failure_kind.slice(0,100):null},
    declared_evidence_refs:(Array.isArray(supplied.evidence_refs)?supplied.evidence_refs:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=512).slice(0,32),
    retry_available:closed&&issues.length>0&&retrySupported&&retriesUsed<policy.max_retries_per_row&&extraTrialsUsed+extraTrialsReserved<policy.max_extra_trials,
    allowed_actions:['use',...(policy.allow_reference?['reference']:[]),...(policy.allow_exclusion?['exclude']:[]),'stop'],
    remaining_retry_budget:Math.max(0,policy.max_extra_trials-extraTrialsUsed-extraTrialsReserved),
    goal:'Use the available evidence to judge practical value. Prefer reference use or exclusion over unnecessary reruns. A grading-only incident does not require repeating the task; preserve its output and useful measurements. Never treat missing data as zero or require a perfect dataset.',
    data_completeness_required:false,raw_logs_included:false};
  if(packet.retry_available)packet.allowed_actions.push('retry');
  return packet;
}
export function validateInstructionRecoveryAssessment(packet,assessment){
  assert.deepEqual(Object.keys(assessment).sort(),['action','comparison_limits','packet_digest','reason','retry_scope','selection_basis','used_dimensions']);
  assert.equal(assessment.packet_digest,canonicalDigest(packet),'AI recovery assessment belongs to a different packet');
  assert.ok(packet.allowed_actions.includes(assessment.action),'recovery action unavailable or retry budget/process closure insufficient');
  assert.ok(typeof assessment.reason==='string'&&assessment.reason.trim()&&assessment.reason.length<=4096);
  assert.ok(['execution_failure','missing_evidence','environment_mismatch','fair_comparison','practical_reference','no_value_in_more_runs'].includes(assessment.selection_basis),'record an evidence/utility basis, not score optimization');
  assert.ok(assessment.action==='retry'?['trial','case'].includes(assessment.retry_scope):assessment.retry_scope===null);
  if(assessment.action==='retry'&&assessment.retry_scope==='case')assert.ok(['fair_comparison','environment_mismatch','execution_failure','missing_evidence'].includes(assessment.selection_basis));
  assert.ok(Array.isArray(assessment.comparison_limits)&&assessment.comparison_limits.length<=32);
  assessment.comparison_limits.forEach(v=>assert.ok(typeof v==='string'&&v.trim()&&v.length<=2048));
  assert.ok(Array.isArray(assessment.used_dimensions)&&new Set(assessment.used_dimensions).size===assessment.used_dimensions.length);
  assessment.used_dimensions.forEach(k=>assert.ok(packet.available_dimensions.includes(k),'AI cannot use an unavailable data dimension'));
  if(assessment.action==='use')assert.equal(packet.process_closed,true,'unconfirmed process can only be referenced/excluded or stopped');
  if(packet.issues.length)assert.ok(assessment.comparison_limits.length,'irregular evidence needs a recorded comparison limitation');
  return assessment;
}

// A bounded snapshot for newly reserved AI assessments. Legacy immutable jobs
// without it remain readable; this context is never an execution grant.
export function validateInstructionRecoveryContext(c,{packet,evaluation_decision}){
 assert.equal(c.kind,'instruction_evaluation_recovery_context_v1');assert.equal(c.stage,'evaluation_recovery');
 assert.match(c.plan_digest,/^sha256:[a-f0-9]{64}$/u);
 assert.equal(c.packet_digest,canonicalDigest(packet),'recovery context packet mismatch');
 assert.equal(c.evaluation_decision_digest,canonicalDigest(evaluation_decision),'recovery context approval mismatch');
 assert.equal(c.case_execution_approved,evaluation_decision?.disposition==='approved');assert.equal(c.application_authorized,false);
 for(const [key,fields] of [['extra_trial_budget',['used','reserved']],['row_retry_budget',['used']],['assessment_packet_budget',['reserved_including_current']]]){
  const b=c[key];for(const f of ['maximum','remaining',...fields])assert.ok(Number.isSafeInteger(b[f])&&b[f]>=0,'invalid recovery budget');
  assert.equal(b.remaining,Math.max(0,b.maximum-fields.reduce((n,f)=>n+b[f],0)),'inconsistent recovery budget');
  assert.ok(fields.reduce((n,f)=>n+b[f],0)<=b.maximum,'recovery budget overcommitted');
 }
 assert.equal(c.assessment_packet_budget.physical_model_calls,'Unknown');
 return c;
}

// Practical evaluation is a new opt-in execution lane, not a rewrite of a
// frozen single-shot primary run or its formal grading/certification contract.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalDigest, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { readRunJournal, appendRunJournal, lockRunJournal } from './instruction-run-journal.mjs';
import { buildPragmaticEvaluationReport } from './ask-pragmatic-evaluation-report.mjs';
import { buildInstructionRecoveryPacket, validateInstructionRecoveryPolicy, validateInstructionRecoveryAssessment } from './instruction-evaluation-recovery.mjs';
import {inspectPracticalQualityObservation} from './practical-quality-observation.mjs';
import {validatePracticalInitializationClearance} from './practical-initialization-clearance.mjs';

const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b),copy=v=>structuredClone(v);
const metrics=['duration_ms','human_review_minutes','rework_minutes','input_tokens','output_tokens','cached_tokens'];
const labels=['cli_version','model','reasoning','platform','global_context_ref'];
const rowKey=r=>JSON.stringify([r.block_id,r.condition]);
const resource=values=>{const known=values.filter(v=>Number.isFinite(v)&&v>=0);return {known_total:known.length?known.reduce((a,b)=>a+b,0):null,observed_count:known.length,unknown_count:values.length-known.length};};
function checkedPlan(p){
  assert.equal(p.kind,'practical_evaluation_plan_v1');assert.match(p.id,/^[A-Za-z0-9._-]{1,100}$/u);
  assert.ok(typeof p.goal==='string'&&p.goal.trim()&&p.goal.length<=8192);
  assert.match(p.runtime_digest,/^sha256:[a-f0-9]{64}$/u);
  assert.ok(['synthetic','observed'].includes(p.evidence_kind));
  assert.ok(Array.isArray(p.conditions)&&p.conditions.length>=2&&p.conditions.length<=16&&new Set(p.conditions.map(c=>c.id)).size===p.conditions.length);
  for(const c of p.conditions){assert.match(c.id,/^[A-Za-z0-9._-]{1,100}$/u);for(const k of labels)assert.ok(c.context[k]===null||typeof c.context[k]==='string'&&c.context[k].trim()&&c.context[k].length<=512);}
  assert.ok(Array.isArray(p.cases)&&p.cases.length&&p.cases.length<=64&&new Set(p.cases.map(c=>c.id)).size===p.cases.length);
  for(const c of p.cases){assert.match(c.id,/^[A-Za-z0-9._-]{1,100}$/u);for(const k of ['task_ref','input_ref','success_criteria_ref'])assert.ok(typeof c[k]==='string'&&c[k].trim()&&c[k].length<=512);assert.match(c.public_input_digest,/^sha256:[a-f0-9]{64}$/u);}
  assert.ok(Number.isSafeInteger(p.repetitions)&&p.repetitions>0&&p.repetitions<=20);
  assert.ok(p.cases.length*p.repetitions*p.conditions.length<=256);
  validateInstructionRecoveryPolicy(p.recovery);
  assert.ok(p.global_context&&['unknown','observed','not_observed'].includes(p.global_context.ask_presence)&&['unknown','observed','none_observed'].includes(p.global_context.change_status));
}
function rows(p){
  const result=[];
  for(const c of p.cases)for(let i=0;i<p.repetitions;i++)for(const condition of i%2?[...p.conditions].reverse():p.conditions)
    result.push({id:`${p.id}-row-${canonicalDigest([c.id,i+1,condition.id]).slice(7)}`,block_id:`${c.id}.r${i+1}`,case_id:c.id,
      condition:condition.id,repetition:i+1,public_input_digest:c.public_input_digest});
  return result;
}
function view(s){return {status:s.status,pending_gate:s.gate??null,pending_recovery:s.recovery?.packet??null,
  pending_recovery_digest:s.recovery?canonicalDigest(s.recovery.packet):null,active_job:s.active??null,
  assessment_rejections:s.rejected_assessments??[],last_ai_stop:s.last_stop??null,
  attempts:s.attempts.length,recovery_decisions:s.decisions,report:s.report??null,change_approval_required:true,application_performed:false};}
function clearanceFor(s,attemptId){return(s.continuation_clearances??[]).find(c=>c.original_attempt_id===attemptId);}
function packet(s,runtime){const r=s.recovery,p=buildInstructionRecoveryPacket({policy:s.plan.recovery,job:r.job,result:r.result,
  logicalRow:r.row,retriesUsed:(s.counts[rowKey(r.row)]??1)-1,extraTrialsUsed:s.extra_trials,retrySupported:runtime.retrySupported!==false});
 const clearance=clearanceFor(s,r.entry_id);
 if(clearance){p.continuation_clearance_digest=canonicalDigest(clearance);p.safe_to_continue=true;p.continuation_scope=clearance.scope;
  p.comparison_constraints=clearance.limits;
  if(runtime.retrySupported!==false&&(s.counts[rowKey(r.row)]??1)<=s.plan.recovery.max_retries_per_row&&s.extra_trials<s.plan.recovery.max_extra_trials){p.retry_available=true;if(!p.allowed_actions.includes('retry'))p.allowed_actions.push('retry');}}
 return p;}
async function refreshRecovery(s,runtime,root,save){
  if(!s.recovery)return;
  let inspected;try{inspected=await runtime.inspect(s.recovery.job,{root});}catch{return;}
  if(inspected&&['completed','failed','interrupted'].includes(inspected.status)&&!same(inspected,s.recovery.result)){
    assert.equal(inspected.request_digest,canonicalDigest(s.recovery.job));
    const entry=s.attempts.find(a=>a.id===s.recovery.entry_id);entry.result_history??=[];entry.result_history.push(copy(entry.result));
    s.recovery.result=copy(inspected);entry.result=copy(inspected);s.recovery.packet=packet(s,runtime);save(s,'recovery_evidence_refreshed');
  }
}
function notes(s,entry){
  const row=entry.row,out=entry.result.output??{},provided=out.notes??out,caseSpec=s.plan.cases.find(c=>c.id===row.case_id),condition=s.plan.conditions.find(c=>c.id===row.condition);
  const evidence=(Array.isArray(provided.evidence_refs)?provided.evidence_refs:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=512);
  const completed=entry.result.status==='completed'||out.execution_completed===true;
  let outcome=['pass','fail','unknown'].includes(provided.outcome)?provided.outcome:'unknown';
  const quality=inspectPracticalQualityObservation(out);
  if(quality.issue)outcome='unknown';else if(quality.value)outcome=quality.value.scope==='source_reference'&&quality.value.outcome==='pass'?'unknown':quality.value.outcome;
  if(!completed||outcome==='pass'&&!evidence.length)outcome='unknown';
  const observed=Object.fromEntries(metrics.map(k=>{let v=provided.metrics?.[k];
    if(v==null&&k==='duration_ms'&&Number.isFinite(out.cli_seconds))v=out.cli_seconds*1000;
    if(v==null&&['input_tokens','output_tokens','cached_tokens'].includes(k))v=out.root_usage?.[k==='cached_tokens'?'cached_input_tokens':k];
    return [k,Number.isFinite(v)&&v>=0?v:null];}));
  return {block_id:row.block_id,condition:row.condition,execution_state:completed?'completed':'failed',outcome,evidence_refs:evidence,
    local_assets_ref:entry.job.input.condition_context.environment_ref??null,task_ref:caseSpec.task_ref,input_ref:caseSpec.input_ref,success_criteria_ref:caseSpec.success_criteria_ref,
    ...Object.fromEntries(labels.map(k=>[k,condition.context[k]])),metrics:observed,
    ...(!completed?{stop_reason:'Execution failure or unresolved completion; original attempt retained.'}:{})};
}
function report(s){
  const selected=s.attempts.filter(a=>s.selected[rowKey(a.row)]===a.id);
  const pragmatic=buildPragmaticEvaluationReport({kind:'ask_pragmatic_evaluation_notes_v1',evidence_kind:s.plan.evidence_kind,
    condition_ids:s.plan.conditions.map(c=>c.id),planned_blocks:[...new Set(s.rows.map(r=>r.block_id))],trials:selected.map(a=>notes(s,a)),
    global_context:s.plan.global_context,next_improvement:'Review practical benefit, uncertainty, extra cost and the recorded AI decisions before the existing human change decision.'});
  const grades=s.attempts.filter(a=>a.result.output?.grading_execution_state==='completed'||a.result.output?.grading_execution_state==='unknown');
  const gradeDurations=grades.map(a=>a.result.output?.grade?.duration_ms).filter(v=>Number.isFinite(v)&&v>=0);
  const assessments=s.assessments??[],assessmentDuration=resource(assessments.map(a=>a.execution?.duration_ms??a.duration_ms??null));
  return {kind:'practical_evaluation_run_report_v1',pragmatic,all_attempts:s.attempts.map(a=>({id:a.id,row:a.row,cohort:a.cohort,
    original_result:a.result,result_digest:canonicalDigest(a.result),included_in_comparison:s.selected[rowKey(a.row)]===a.id,
    result_observation_history:a.result_history??[],
    assessment:a.assessment??null,observation:notes(s,a),quality_observation:inspectPracticalQualityObservation(a.result.output).value,
    quality_observation_issue:inspectPracticalQualityObservation(a.result.output).issue})),recovery_decisions:s.decisions,
    execution_suspended:s.suspended??false,extra_trials:s.extra_trials,continuation_clearances:s.continuation_clearances??[],
    resources_all_attempts:Object.fromEntries(metrics.map(k=>{
      const values=s.attempts.map(a=>notes(s,a).metrics[k]),known=values.filter(v=>v!==null);
      return [k,{known_total:known.length?known.reduce((a,b)=>a+b,0):null,observed_count:known.length,unknown_count:values.length-known.length}];})),
    assessment_attempts:s.assessments??[],assessment_overhead:{trial_metrics_include_assessments:false,
      usage_status:'not_collected_or_provider_supplied; never treated as zero',complete_cost:null,
      duration_ms:assessmentDuration,
      reported_root_model_calls:resource(assessments.map(a=>Number.isSafeInteger(a.execution?.model_calls)&&a.execution.model_calls>=0?a.execution.model_calls:null)),
      resources:Object.fromEntries(['input_tokens','output_tokens','cached_tokens'].map(k=>[k,resource(assessments.map(a=>{
       const m=a.execution?.usage,v=m?.[k]??(k==='cached_tokens'?m?.cached_input_tokens:null);return Number.isSafeInteger(v)&&v>=0&&!(k==='cached_tokens'&&Number.isSafeInteger(m.input_tokens)&&v>m.input_tokens)?v:null;
      }))]))},
    rejected_assessments:s.rejected_assessments??[],
    grading_overhead:{known_local_duration_ms:gradeDurations.length?gradeDurations.reduce((a,b)=>a+b,0):null,
      observed_count:gradeDurations.length,unknown_count:grades.length-gradeDurations.length,remote_cost:null,not_in_task_duration:true,
      resources:Object.fromEntries(['input_tokens','output_tokens','cached_tokens'].map(k=>{
       const values=grades.map(a=>{const m=a.result.output?.grade?.provider_observation?.metrics,v=m?.[k];return Number.isSafeInteger(v)&&v>=0&&!(k==='cached_tokens'&&Number.isSafeInteger(m.input_tokens)&&v>m.input_tokens)?v:null;}),known=values.filter(v=>v!==null);
       return [k,{known_total:known.length?known.reduce((a,b)=>a+b,0):null,observed_count:known.length,unknown_count:values.length-known.length}];})),
      usage_scope:'caller-reported grading observations only; cached is an input subset; complete hierarchy and billed cost remain unknown'},
    comparison_limits:s.decisions.flatMap(d=>d.assessment.comparison_limits),
    completeness_required:false,formal_admission_implied:false,application_performed:false};
}
function applyAssessment(s,assessment){
  const r=s.recovery;validateInstructionRecoveryAssessment(r.packet,assessment);
  if(assessment.action==='stop'){s.status='awaiting_ai_recovery';s.last_stop=copy(assessment);s.decisions.push({attempt_id:r.entry_id,assessment:copy(assessment)});return false;}
  const record={attempt_id:r.entry_id,packet_digest:canonicalDigest(r.packet),assessment:copy(assessment)};
  let targets=null,cohort=null;
  if(assessment.action==='retry'){
    if(clearanceFor(s,r.entry_id))assert.equal(assessment.retry_scope,'trial','initialization exception permits only the failed logical row');
    targets=assessment.retry_scope==='case'?s.rows.filter(row=>row.block_id===r.row.block_id):[r.row];
    const additional=targets.filter(row=>(s.counts[rowKey(row)]??0)>0).length;
    assert.ok(s.extra_trials+additional<=s.plan.recovery.max_extra_trials,'paired retry exceeds approved extra-trial budget');
    assert.ok(targets.every(row=>(s.counts[rowKey(row)]??0)<=s.plan.recovery.max_retries_per_row),'per-row retry budget exhausted');
    assert.ok(targets.every(row=>!s.attempts.some(a=>rowKey(a.row)===rowKey(row)&&a.result.output?.ready_for_next_root!==true&&!clearanceFor(s,a.id))),
      'a target has an unresolved process; AI cannot authorize duplicate execution');
    cohort=Math.max(0,...s.attempts.filter(a=>a.row.block_id===r.row.block_id).map(a=>a.cohort))+1;
  }
  s.decisions.push(record);s.attempts.find(a=>a.id===r.entry_id).assessment=copy(assessment);
  if(assessment.action==='retry'){
    const keys=new Set(targets.map(rowKey));s.queue=s.queue.filter(q=>!keys.has(rowKey(q.row)));
    for(const row of targets)delete s.selected[rowKey(row)];
    s.queue.unshift(...targets.map(row=>({row,cohort,retry_of:r.entry_id,decision_digest:canonicalDigest(record)})));
  }else{
    if(assessment.action==='use')s.selected[rowKey(r.row)]=r.entry_id;
    else delete s.selected[rowKey(r.row)];
    if(!r.packet.process_closed&&!clearanceFor(s,r.entry_id)){s.suspended=true;s.queue=[];}
  }
  s.recovery=null;s.status='advancing';return true;
}
export function inspectPracticalEvaluation(root){const {state}=readRunJournal(resolve(root));assert.ok(state,'evaluation not prepared');return view(state);}
export async function advancePracticalEvaluation({root,plan,runtime,decision=null,assessment=null,inheritedApproval=null,continuationClearance=null}){
  checkedPlan(plan);assert.equal(runtime.digest,plan.runtime_digest,'evaluation runtime drift');
  root=resolve(root);assertNoSymlinkPathSegments(root,'practical evaluation root',{allowMissingLeaf:true});if(!existsSync(root))mkdirSync(root,{mode:0o700});
  const unlock=lockRunJournal(root),save=(s,kind,detail={})=>appendRunJournal(root,kind,s,detail);
  try{
    let s=readRunJournal(root).state;
    if(s){assert.ok(same(s.plan,plan),'resume cannot change approved plan');if(s.status==='completed')return view(s);}
    if(!s){const planned=rows(plan);s={plan:copy(plan),rows:planned,queue:planned.map(row=>({row,cohort:1})),attempts:[],counts:{},selected:{},decisions:[],extra_trials:0,
      active:null,recovery:null,assessed_packets:[],assessments:[],status:'awaiting_evaluation_approval',gate:{kind:'evaluation',packet:{plan:copy(plan),planned_rows:planned,max_extra_trials:plan.recovery.max_extra_trials}}};save(s,'prepared');}
    assert.ok(same(s.plan,plan),'resume cannot change approved plan');
    if(inheritedApproval){
      assert.equal(decision,null,'do not replace verified parent case approval');
      const parent=readRunJournal(resolve(inheritedApproval.root)).state;
      assert.ok(parent?.pending?.kind==='evaluate'&&parent.evaluation_decision?.disposition==='approved','active approved supervised evaluation required');
      assert.equal(canonicalDigest(parent.pending),inheritedApproval.job_digest,'parent evaluation operation mismatch');
      assert.equal(parent.outputs.select.practical_plan_digest,canonicalDigest(plan),'nested plan differs from human-approved selection');
      const outer=parent.rows.map(r=>[r.case.id,r.repetition,r.condition,r.case.public_input_digest]).sort();
      const inner=s.rows.map(r=>[r.case_id,r.repetition,r.condition,r.public_input_digest]).sort();
      assert.ok(same(outer,inner),'nested case population differs from human-approved rows');
      if(s.gate){s.evaluation_decision={...copy(parent.evaluation_decision),source:'verified_supervised_journal',parent_job_digest:inheritedApproval.job_digest};
        s.gate=null;s.status='advancing';save(s,'inherited_human_case_approval');}
    }
    if(decision){assert.ok(s.gate,'no human case approval pending');assert.deepEqual(Object.keys(decision).sort(),['disposition','packet_digest','reason']);
      assert.equal(decision.packet_digest,canonicalDigest(s.gate));assert.ok(['approved','rejected'].includes(decision.disposition));assert.ok(typeof decision.reason==='string'&&decision.reason.trim());
      s.evaluation_decision=copy(decision);s.gate=null;if(decision.disposition==='rejected'){s.status='completed';s.queue=[];s.report=report(s);save(s,'evaluation_rejected');return view(s);}s.status='advancing';save(s,'human_case_approval');}
    if(s.gate)return view(s);if(s.status==='completed')return view(s);
    if(continuationClearance){
      assert.equal(assessment,null,'admit the exception and review its fresh packet before submitting an AI judgment');
      const checked=validatePracticalInitializationClearance(continuationClearance,{root,state:s,checkProcesses:true});
      const prior=clearanceFor(s,continuationClearance.original_attempt_id);
      if(prior)assert.ok(same(prior,continuationClearance),'this original attempt already has a different continuation exception');
      else{assert.equal(s.status,'ai_assessment_uncertain');assert.ok(same(s.active,continuationClearance.original_assessor_job));
        s.continuation_clearances??=[];s.continuation_clearances.push(copy(continuationClearance));save(s,'initialization_continuation_admitted',{local_observation:checked.observation});}
      if(s.recovery?.entry_id===continuationClearance.original_attempt_id){
        const fresh=packet(s,runtime);if(!same(fresh,s.recovery.packet)||s.status!=='awaiting_ai_recovery'){
          s.recovery.packet=fresh;s.status='awaiting_ai_recovery';save(s,'initialization_recovery_packet_refreshed');}}
      return view(s);
    }
    for(const c of s.continuation_clearances??[]){const checked=validatePracticalInitializationClearance(c,{root,state:s,checkProcesses:true});
      save(s,'initialization_continuation_reinspected',{clearance_digest:canonicalDigest(c),local_observation:checked.observation});}
    if(assessment){assert.ok(s.recovery,'no AI recovery judgment pending');
      await refreshRecovery(s,runtime,root,save);
      if(s.active?.kind==='assess'){save(s,'ai_assessment_superseded',{job:s.active});s.active=null;}
      if(!applyAssessment(s,assessment)){save(s,'ai_recovery_stop');return view(s);}save(s,'ai_recovery_decision');}
    for(;;){
      if(s.recovery&&!s.active){
        await refreshRecovery(s,runtime,root,save);
        if(s.recovery.packet.issues.length===0){s.selected[rowKey(s.recovery.row)]=s.recovery.entry_id;s.recovery=null;s.status='advancing';save(s,'trial_recovered');continue;}
        const assessmentPacketDigest=canonicalDigest(s.recovery.packet);
        const assessmentBudget=s.rows.length+s.plan.recovery.max_extra_trials;
        if(typeof runtime.assess!=='function'||s.assessed_packets.includes(assessmentPacketDigest)||s.assessed_packets.length>=assessmentBudget){s.status='awaiting_ai_recovery';save(s,'ai_recovery_requested');return view(s);}
        const input={packet:s.recovery.packet,goal:s.plan.goal,evaluation_decision:copy(s.evaluation_decision)};
        s.active={kind:'assess',key:'assess-'+s.recovery.entry_id+'-'+assessmentPacketDigest.slice(7,23),input,input_digest:canonicalDigest(input)};
        if(runtime.preflight)await runtime.preflight(s.active,{root});s.assessed_packets.push(assessmentPacketDigest);save(s,'assessment_reserved');
      }
      if(!s.active){
        if(!s.queue.length){s.report=report(s);s.status='completed';save(s,'reported');return view(s);}
        const item=s.queue.shift(),count=(s.counts[rowKey(item.row)]??0)+1;
        const input={row:item.row,attempt:count,cohort:item.cohort,case:plan.cases.find(c=>c.id===item.row.case_id),
          condition_context:plan.conditions.find(c=>c.id===item.row.condition).context,
          evaluation_decision:s.evaluation_decision,retry_of:item.retry_of??null,recovery_decision_digest:item.decision_digest??null};
        s.active={kind:'trial',key:item.row.id+'-attempt-'+count,input,input_digest:canonicalDigest(input)};
        if(runtime.preflight)await runtime.preflight(s.active,{root});
        s.counts[rowKey(item.row)]=count;if(count>1)s.extra_trials++;save(s,'trial_reserved');
      }
      const job=s.active;let result;
      try{result=await runtime.inspect(job,{root});}catch(error){result={request_digest:canonicalDigest(job),status:'unknown',output:{ready_for_next_root:false,inspection_error:String(error.message).slice(0,2048)}};}
      // Dispatch only the just-reserved job. A later invocation inspects the
      // existing reservation and cannot infer absence from a missing result.
      const events=readRunJournal(root).events,latest=events.at(-1);
      const fresh=['trial_reserved','assessment_reserved'].includes(latest.kind)&&same(latest.state.active,job);
      // A reservation is already consumed even if the process dies before the
      // next append. Record consumption before crossing the process boundary.
      if(fresh){save(s,'dispatch_consumed',{job_digest:canonicalDigest(job)});
        try{result=await runtime[job.kind](job,{root});}catch(error){result={request_digest:canonicalDigest(job),status:'unknown',output:{ready_for_next_root:false,reason:String(error.message).slice(0,2048)}};}}
      if(!result||!['completed','failed','interrupted'].includes(result.status)){
        if(job.kind==='assess'){s.assessments.push({job:job.key,status:'unknown',duration_ms:null,usage:null});s.status='ai_assessment_uncertain';save(s,'assessment_uncertain');return view(s);}
        result={request_digest:canonicalDigest(job),status:'unknown',output:{ready_for_next_root:false}};
      }
      if(result.request_digest!==canonicalDigest(job))result={request_digest:canonicalDigest(job),status:'unknown',output:{ready_for_next_root:false,validation_error:'evaluation_result_transplant'}};
      s.active=null;
      if(job.kind==='assess'){
        s.assessments.push({job:job.key,status:result.status,execution:result.output?.assessment_execution??{duration_ms:null,usage:null},result_digest:canonicalDigest(result)});
        if(result.status!=='completed'){s.status='awaiting_ai_recovery';save(s,'assessment_failed',{result});return view(s);}
        await refreshRecovery(s,runtime,root,save);
        if(!same(job.input.packet,s.recovery.packet)){save(s,'assessment_evidence_superseded');continue;}
        const choice=result.output.assessment??result.output;
        try{
          if(!applyAssessment(s,choice)){save(s,'ai_recovery_stop');return view(s);}
        }catch(error){
          s.status='awaiting_ai_recovery';s.rejected_assessments??=[];s.rejected_assessments.push({assessment_digest:canonicalDigest(choice),reason:String(error.message).slice(0,2048)});
          save(s,'ai_assessment_rejected');return view(s);
        }
        save(s,'ai_recovery_decision');continue;
      }
      const entry={id:job.key,row:copy(job.input.row),cohort:job.input.cohort,job:copy(job),result:copy(result)};s.attempts.push(entry);
      s.recovery={entry_id:entry.id,row:entry.row,job:entry.job,result:entry.result};s.recovery.packet=packet(s,runtime);
      if(s.recovery.packet.issues.length){s.status='awaiting_ai_recovery';save(s,'trial_irregularity');}
      else{s.selected[rowKey(entry.row)]=entry.id;s.recovery=null;s.status='advancing';save(s,'trial_completed');}
    }
  }finally{unlock();}
}

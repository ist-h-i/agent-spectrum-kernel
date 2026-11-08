// Composition of existing generation, Registry, runner, reporting and setup
// operations. Human decisions enter through the host, never through a worker.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, assertNoSymlinkPathSegments, readJsonFileStrict,
  writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
import { readRunJournal as journal, appendRunJournal as append, lockRunJournal as lock } from './instruction-run-journal.mjs';
import { projectInstructionLoopObservation, assertPublicInstructionSummary, summarizeInstructionLoopEvaluation } from './instruction-loop-feedback.mjs';
import {instructionResultDiscard,makeInstructionResultDiscard} from './instruction-loop-result-disposition.mjs';
import {readPracticalGradeSupplementContinuation,readAdmittedPracticalGradeSupplement} from './practical-grade-report-revision.mjs';

const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const digest=/^sha256:[a-f0-9]{64}$/u;
const copy=v=>JSON.parse(JSON.stringify(v));
const terminal=new Set(['completed','failed','interrupted']);
const methods=['generate','register','select','trial','report','plan','apply','version','cleanup','restore'];
function checkedPolicy(p){
  assert.equal(p.kind,'reference_instruction_loop_v1');
  assert.ok(typeof p.id==='string'&&/^[a-zA-Z0-9._-]{1,100}$/u.test(p.id));
  assert.match(p.runtime_digest,digest);
  assert.ok(p.observation&&typeof p.observation==='object');
  assert.ok(Array.isArray(p.catalog)&&p.catalog.length>0);
  assert.equal(new Set(p.catalog.map(c=>c.id)).size,p.catalog.length);
  for(const c of p.catalog){assert.match(c.id,/^[A-Za-z0-9._-]+$/u);assert.match(c.public_input_digest,digest);}
  assert.deepEqual(p.conditions,['baseline','candidate']);
  assert.ok(Number.isSafeInteger(p.repetitions)&&p.repetitions>0&&p.repetitions<=10);
  assert.ok(Number.isSafeInteger(p.max_trials)&&p.max_trials>0&&p.max_trials<=256);
  assert.equal(p.formal_admission_implied,false);
  if(p.evaluation_mode!==undefined)assert.equal(p.evaluation_mode,'practical_v1');
  if(p.application_anchor!=null){
    assert.deepEqual(Object.keys(p.application_anchor).sort(),['journal_digest','run_root']);
    assert.equal(resolve(p.application_anchor.run_root),p.application_anchor.run_root);assert.match(p.application_anchor.journal_digest,digest);
  }
  assert.ok(p.normal_target===null||typeof p.normal_target==='string'&&resolve(p.normal_target)===p.normal_target,
    'normal_target must be an absolute path or explicit null for result review');
  return p;
}
function summary(state){
  return {status:state.status,run_id:state.policy.id,pending_gate:state.gate??null,
    ...(state.result_disposition?{result_disposition:instructionResultDiscard(state)}:{}),
    pending_authoring:state.authoring_progress??null,
    ...(state.report_revision?{report_revision:copy(state.report_revision)}:{}),
    pending_recovery:state.evaluation_progress?.pending_recovery??null,
    pending_recovery_digest:state.evaluation_progress?.pending_recovery_digest??null,
    active_job:state.pending??null,completed_trials:state.trials.length,
    report:state.outputs.report??null,application:state.outputs.apply??null,
    restoration:state.outputs.restore??null,final:state.outputs.final??null,
    formal_admission_implied:false};
}
function schedule(s,kind,key,input){
  return {kind,key,input:copy(input),input_digest:canonicalDigest(input)};
}
function selectedTrials(s,selection){
  assert.ok(Array.isArray(selection.case_ids)&&selection.case_ids.length>0);
  assert.equal(new Set(selection.case_ids).size,selection.case_ids.length);
  const cases=selection.case_ids.map(id=>{
    const c=s.policy.catalog.find(c=>c.id===id);assert.ok(c,'selector returned an unknown public case');return c;
  });
  const rows=[];
  for(const c of cases)for(let r=1;r<=s.policy.repetitions;r++)
    for(const condition of r%2?s.policy.conditions:[...s.policy.conditions].reverse())
      rows.push({id:`${s.policy.id}-${String(rows.length+1).padStart(3,'0')}`,case:c,condition,repetition:r});
  assert.ok(rows.length<=s.policy.max_trials,'selection exceeds authorized trial reservation');
  return rows;
}
function next(s){
  const p=s.policy,o=s.outputs;
  if(!o.generate)return schedule(s,'generate','generate',{observation:p.observation});
  if(!o.register)return schedule(s,'register','register',{candidate:o.generate});
  if(o.register.no_change===true){
    if(!o.cleanup)return schedule(s,'cleanup','cleanup',{disposition:'unchanged',candidate:o.register});
    return 'no_change';
  }
  if(!o.select)return schedule(s,'select','select',{observation:p.observation,candidate:o.register,catalog:p.catalog});
  if(!s.evaluation_decision){
    s.gate={kind:'evaluation',packet:{candidate:o.register,selection:o.select,rows:s.rows,runtime_digest:p.runtime_digest,
      normal_target:p.normal_target,formal_admission_implied:false}};return null;
  }
  if(s.evaluation_decision.disposition==='rejected'){
    if(p.normal_target===null)return 'evaluation_rejected_retained';
    if(!o.retire)return schedule(s,'version','retire',{action:'retire',candidate:o.register,reason:'evaluation_rejected'});
    if(!o.cleanup)return schedule(s,'cleanup','cleanup',{disposition:'rejected',candidate:o.register,retirement:o.retire});
    return 'evaluation_rejected';
  }
  if(p.evaluation_mode==='practical_v1'){
    if(!o.evaluate)return schedule(s,'evaluate','evaluate',{candidate:o.register,selection:o.select,rows:s.rows,evaluation_decision:s.evaluation_decision});
    if(!o.report)o.report=o.evaluate.report;
  }else if(s.trials.length<s.rows.length){
    const row=s.rows[s.trials.length];
    return schedule(s,'trial',`trial-${row.id}`,{row,candidate:o.register,selection:o.select,evaluation_decision:s.evaluation_decision});
  }
  if(!o.report)return schedule(s,'report','report',{candidate:o.register,selection:o.select,rows:s.rows,trials:s.trials,
    formal_score:null,complete_hierarchical_usage:null});
  if(p.normal_target===null){
    if(!s.result_decision){
      s.gate={kind:'result',packet:{candidate:o.register,report:o.report,normal_target:null,
        application_available:false,candidate_disposition:'retain',...(s.report_revision?{report_revision:s.report_revision}:{}),formal_admission_implied:false}};return null;
    }
    return `result_${s.result_decision.disposition}_retained`;
  }
  if(!o.plan)return schedule(s,'plan','plan',{candidate:o.register,report:o.report,target:p.normal_target});
  if(!s.change_decision){
    s.gate={kind:'change',packet:{candidate:o.register,report:o.report,plan:o.plan,
      ...(s.report_revision?{report_revision:s.report_revision}:{}),post_approval:['exact_normal_apply','activate_version','clean_owned_staging','final_report'],
      rejection:['retire_candidate','clean_owned_staging','final_report'],formal_admission_implied:false}};return null;
  }
  if(s.change_decision.disposition==='rejected'){
    if(!o.retire)return schedule(s,'version','retire',{action:'retire',candidate:o.register,reason:'change_rejected'});
    if(!o.cleanup)return schedule(s,'cleanup','cleanup',{disposition:'rejected',candidate:o.register,retirement:o.retire});
    return 'change_rejected';
  }
  if(!o.apply)return schedule(s,'apply','apply',{plan:o.plan,decision:s.change_decision});
  if(!o.activate)return schedule(s,'version','activate',{action:'activate',candidate:o.register,application:o.apply,
    decision:s.change_decision});
  if(!o.cleanup)return schedule(s,'cleanup','cleanup',{disposition:'applied',candidate:o.register});
  if(s.restore_requested){
    if(!s.restore_decision){s.gate={kind:'change',packet:{action:'restore',request_index:s.restore_request_index??1,application:o.apply,plan:o.plan,
      version:o.activate,normal_target:p.normal_target,formal_admission_implied:false}};return null;}
    if(s.restore_decision.disposition==='rejected')return 'restoration_declined';
    if(!o.restore)return schedule(s,'restore','restore',{plan:o.plan,application:o.apply,decision:s.restore_decision});
    if(!o.switch_back)return schedule(s,'version','switch_back',{action:'restore',restoration:o.restore,candidate:o.register,previous_version:o.cleanup?.registry??o.activate});
    return 'restored';
  }
  return 'applied';
}
function accept(s,job,result){
  assert.ok(result&&terminal.has(result.status),'worker lacks a known terminal status');
  assert.equal(result.request_digest,canonicalDigest(job),'worker result does not match exact job');
  if(result.status!=='completed'){
    if(job.kind==='trial'&&result.output?.ready_for_next_root===true){s.trials.push({...result.output,row:job.input.row,status:result.status});return;}
    throw new Error(`${job.kind} ${result.status}; preserve evidence and inspect partial effects`);
  }
  const out=copy(result.output);assert.ok(out&&typeof out==='object');
  if(job.kind==='select')s.rows=selectedTrials(s,out);
  if(['evaluate','evaluate_continuation'].includes(job.kind)){
    assert.equal(out.practical_status,'completed');assert.ok(out.report&&Array.isArray(out.trials));s.trials=copy(out.trials);
    s.outputs[job.key]=out;delete s.evaluation_progress;
  }else if(job.kind==='trial'){
    assert.equal(out.ready_for_next_root,true,'trial process/descendant closure is uncertain');
    // Null usage is valid. These fields are observations, never a completeness
    // guarantee, a reason to change model autonomy, or a formal quality score.
    s.trials.push({...out,row:job.input.row,status:'completed'});
  }else s.outputs[job.key]=out;
}

/** runtime is a host-owned capability, not data loaded from model output/CAS.
 * Every operation must have durable inspect(job) evidence. An unknown consumed
 * operation is a safety stop, not permission to repeat it. */
export async function advanceSupervisedInstructionLoop({root,policy,runtime,decision=null,requestRestore=false,completedImport=null,assessment=null,reportRevision=null}){
  root=resolve(root);if(runtime.validateCoordinatorRoot)await runtime.validateCoordinatorRoot(root);
  assertNoSymlinkPathSegments(root,'loop root',{allowMissingLeaf:true});
  if(!existsSync(root))mkdirSync(root,{mode:0o700});
  const unlock=lock(root);
  try{
    checkedPolicy(policy);assert.equal(runtime.digest,policy.runtime_digest,'trusted runtime drift');
    const required=policy.evaluation_mode==='practical_v1'?[...methods.filter(m=>!['trial','report'].includes(m)),'evaluate','resumeEvaluation']:methods;
    for(const m of [...required,'inspect'])assert.equal(typeof runtime[m],'function',`runtime ${m} required`);
    let s=journal(root).state;
    if(!s){
      s={policy:copy(policy),status:'advancing',outputs:{},trials:[],rows:[],pending:null,gate:null};
      if(completedImport){
        assert.equal(completedImport.host_verified_prior_approval,true,'historical import requires host-verified prior evaluation approval');
        assert.ok(typeof completedImport.evidence_ref==='string'&&completedImport.evidence_ref.trim());
        for(const key of ['generate','register','select','report'])assert.ok(completedImport.outputs[key]);
        s.outputs=copy(completedImport.outputs);s.rows=selectedTrials(s,s.outputs.select);
        assert.equal(completedImport.trials.length,s.rows.length);
        s.trials=completedImport.trials.map((t,i)=>{assert.ok(same(t.row,s.rows[i]),'historical trial binding mismatch');
          assert.equal(t.ready_for_next_root,true);assert.ok(terminal.has(t.status));return copy(t);});
        s.evaluation_decision={disposition:'approved',source:'historical_import',evidence_ref:completedImport.evidence_ref};
        s.historical_import={evidence_ref:completedImport.evidence_ref,executed_by_this_controller:false};
      }
      append(root,completedImport?'historical_import':'created',s);
    }else assert.equal(completedImport,null,'historical import is initialization only');
    assert.ok(same(s.policy,policy),'resume cannot change policy');
    if(assessment)assert.ok(['evaluate','evaluate_continuation'].includes(s.pending?.kind),'AI assessment requires an active practical evaluation');
    if(reportRevision){
      assert.equal(decision,null,'review the revised packet before submitting a human decision');assert.equal(assessment,null);assert.equal(requestRestore,false);
      assert.equal(policy.evaluation_mode,'practical_v1');assert.equal(s.evaluation_decision?.disposition,'approved','original case approval required for revised result');
      for(const key of ['result_decision','change_decision','restore_decision'])assert.equal(s[key],undefined,'a consumed human decision cannot approve revised evidence');
      for(const key of ['apply','activate','retire','restore'])assert.equal(s.outputs[key],undefined,'report revision cannot change an applied/retired cycle');
      const attached=s.report_revision&&same(s.report_revision.reference,reportRevision);
      if(attached){
        assert.ok(['advancing','operation_uncertain','awaiting_result_review','awaiting_change_approval'].includes(s.status),'admitted revision requires an unfinished review');
        assert.ok(!s.pending||s.pending.kind==='plan','admitted revision may inspect only its pending plan');readAdmittedPracticalGradeSupplement({cycleRoot:root,reference:reportRevision});
      }else{
        assert.equal(s.pending,null);assert.ok(['awaiting_result_review','awaiting_change_approval'].includes(s.status),'report revision requires a pending result/change judgment');
        assert.equal(s.gate?.kind,policy.normal_target===null?'result':'change','report revision requires its current judgment packet');
      const originalReport=s.outputs.original_report??s.outputs.report;
      const revised=readPracticalGradeSupplementContinuation({reference:reportRevision,cycleRoot:root,originalReport,allowOwnedCoordinatorLocks:true});
      if(!s.report_revision||!same(s.report_revision.reference,reportRevision)){
        const index=(s.report_revision?.index??0)+1;assert.ok(index<=256,'bounded report revision history');
        if(s.report_revision){s.report_revision_history??=[];s.report_revision_history.push({reference:copy(s.report_revision.reference),gate_digest:canonicalDigest(s.gate),report_digest:canonicalDigest(s.outputs.report)});}
        if(s.outputs.plan){s.outputs.report_revision_plans??=[];s.outputs.report_revision_plans.push({report_digest:canonicalDigest(s.outputs.report),plan:copy(s.outputs.plan)});delete s.outputs.plan;}
        s.outputs.original_report??=copy(s.outputs.report);s.outputs.report=copy(revised.report);
        s.report_revision={reference:copy(reportRevision),provenance:{...revised.provenance,human_decision_scope:'explicit_revised_packet'},index,previous_gate_digest:canonicalDigest(s.gate)};
        s.gate=null;s.status='advancing';append(root,'report_revision_received',s);
      }
      }
    }

    if(requestRestore){
      assert.equal(s.status,'completed');assert.ok(completedInstructionLoopApplicationIsActive(s),'restoration requires a still-active application');
      if(s.restore_requested){
        assert.equal(s.restore_decision?.disposition,'rejected');s.restore_history??=[];assert.ok(s.restore_history.length<16,'bounded restore request history');
        s.restore_history.push({request_index:s.restore_request_index??1,decision:copy(s.restore_decision)});delete s.restore_decision;
      }
      s.restore_request_index=(s.restore_request_index??0)+1;s.restore_requested=true;s.status='advancing';delete s.outputs.final;
      append(root,'restoration_requested',s);
    }
    if(decision){
      assert.ok(s.gate,'no human judgment is pending');
      assert.deepEqual(Object.keys(decision).sort(),['disposition','packet_digest','reason']);
      assert.equal(decision.packet_digest,canonicalDigest(s.gate),'human decision bound to a different packet');
      assert.ok(['approved','rejected','deferred','discarded'].includes(decision.disposition));
      if(decision.disposition==='discarded')assert.ok(s.gate.kind==='result'&&policy.normal_target===null,'discard requires a result-only gate');
      assert.ok(typeof decision.reason==='string'&&decision.reason.trim());
      if(decision.disposition==='deferred'){
        assert.ok(['result','change'].includes(s.gate.kind),'deferral requires a result or change gate');
        append(root,'human_deferred',s,{decision:copy(decision)});return summary(s);
      }
      const key=s.gate.kind==='evaluation'?'evaluation_decision':s.gate.kind==='result'?'result_decision':s.restore_requested?'restore_decision':'change_decision';
      assert.equal(s[key],undefined,'decision already consumed');s[key]=copy(decision);s.gate=null;s.status='advancing';
      if(decision.disposition==='discarded'){s.result_disposition=makeInstructionResultDiscard(s,{sourceJournalDigest:journal(root).previous,reason:decision.reason});instructionResultDiscard(s);}
      append(root,'human_decision',s,{kind:key});
    }
    if(s.status==='completed')return summary(s);
    for(;;){
      let job=s.pending,result;
      if(job){
        result=await runtime.inspect(job,{root});
        if(job.kind==='generate'&&result?.status==='awaiting_authoring'){
          assert.equal(result.request_digest,canonicalDigest(job));s.authoring_progress=copy(result.output);s.status='awaiting_authoring';append(root,'authoring_host_stop',s);return summary(s);
        }
        if(['evaluate','evaluate_continuation'].includes(job.kind)&&result?.status!=='completed'&&(assessment||result?.status==='resumable')){
          result=await runtime.resumeEvaluation(job,{root,assessment});assessment=null;
        }
        if(['evaluate','evaluate_continuation'].includes(job.kind)&&result?.status==='awaiting_ai_recovery'){
          assert.equal(result.request_digest,canonicalDigest(job));s.evaluation_progress=copy(result.output);s.status='awaiting_ai_recovery';append(root,'evaluation_ai_stop',s);return summary(s);
        }
        if(!result||!terminal.has(result.status)){
          s.status='operation_uncertain';append(root,'inspection_pending',s);
          return summary(s);
        }
      }else{
        const n=next(s);
        if(n===null){s.status=s.gate.kind==='evaluation'?'awaiting_evaluation_approval':s.gate.kind==='result'?'awaiting_result_review':'awaiting_change_approval';
          append(root,'human_stop',s);return summary(s);}
        if(typeof n==='string'){
          s.status='completed';s.outputs.final={outcome:n,candidate:s.outputs.register,report:s.outputs.report??null,
            application:s.outputs.apply??null,restoration:s.outputs.restore??null,cleanup:s.outputs.cleanup??null,
            formal_admission_implied:false};append(root,'completed',s);return summary(s);
        }
        assert.ok(!Object.hasOwn(s.outputs,n.key),'completed operation cannot be reserved again');
        // Reject unavailable authority/source before consuming an operation.
        // preflight is host-owned and must be read-only.
        if(runtime.preflight)await runtime.preflight(n,{root});
        job=n;s.pending=job;s.status='advancing';append(root,'operation_reserved',s);
        try{result=await runtime[job.kind](job,{root});}
        catch(error){s.status='operation_uncertain';append(root,'operation_uncertain',s,{reason:String(error.message).slice(0,512)});return summary(s);}
        if(job.kind==='generate'&&result?.status==='awaiting_authoring'){
          assert.equal(result.request_digest,canonicalDigest(job));s.authoring_progress=copy(result.output);s.status='awaiting_authoring';append(root,'authoring_host_stop',s);return summary(s);
        }
        if(['evaluate','evaluate_continuation'].includes(job.kind)&&result?.status==='awaiting_ai_recovery'){
          assert.equal(result.request_digest,canonicalDigest(job));s.evaluation_progress=copy(result.output);s.status='awaiting_ai_recovery';append(root,'evaluation_ai_stop',s);return summary(s);
        }
        if(!result||!terminal.has(result.status)){s.status='operation_uncertain';append(root,'operation_uncertain',s);return summary(s);}
      }
      try{accept(s,job,result);}
      catch(error){s.status='operation_uncertain';append(root,'invalid_or_partial_result',s,{reason:String(error.message).slice(0,512)});return summary(s);}
      if(job.kind==='generate')delete s.authoring_progress;
      s.pending=null;s.status='advancing';append(root,'operation_completed',s,{key:job.key,result_digest:canonicalDigest(result)});
    }
  }finally{unlock();}
}

export function inspectSupervisedInstructionLoop(root){
  assertNoSymlinkPathSegments(resolve(root),'loop root');
  const {state,events}=journal(resolve(root));assert.ok(state,'loop not initialized');
  return {...summary(state),journal_records:events.length,policy_digest:canonicalDigest(state.policy)};
}

export function completedInstructionLoopApplicationIsActive(s){
  if(s?.status!=='completed'||!s.outputs.apply||s.outputs.restore||s.outputs.switch_back)return false;
  return s.outputs.final?.outcome==='applied'||s.outputs.final?.outcome==='restoration_declined'&&s.restore_decision?.disposition==='rejected';
}
export function readCompletedInstructionLoopContinuation(root){
  assertNoSymlinkPathSegments(resolve(root),'previous loop root');
  const {state:s,previous}=journal(resolve(root));
  assert.ok(s&&s.status==='completed'&&!s.pending&&!s.gate,'previous cycle must be completed, with no uncertain operation');
  const discarded=instructionResultDiscard(s);
  return copy({policy:s.policy,journal_digest:previous,candidate:s.outputs.register,report:discarded?null:s.outputs.report??null,
    ...(discarded?{result_disposition:discarded}:{}),outcome:s.outputs.final.outcome,application_active:completedInstructionLoopApplicationIsActive(s),
    registry:s.outputs.switch_back??s.outputs.cleanup?.registry??s.outputs.activate??s.outputs.retire??s.outputs.register.registry});
}

// A host may record an explicit discard for an already rejected result without
// rewriting its frozen decision, outcome, report or execution implementation.
export function discardCompletedInstructionLoopResult({root,operationRoot,expectedJournalDigest,expectedReportDigest,expectedDecisionDigest,expectedRevisionDigest=null,reason}){
  root=resolve(root);assertNoSymlinkPathSegments(root,'discarded result cycle');
  assert.ok(typeof operationRoot==='string'&&operationRoot,'completed parent operation required for historical discard');operationRoot=resolve(operationRoot);assertNoSymlinkPathSegments(operationRoot,'discarded result operation');assert.notEqual(root,operationRoot);
  const unlocks=[];try{
    for(const path of [root,operationRoot].sort())unlocks.push(lock(path));
    const op=journal(operationRoot).state;assert.equal(op?.current?.root,root,'foreign result operation');assert.equal(op.status,'completed','result operation is not completed');assert.equal(op.preparation,null,'result operation has a next preparation');
    const h=journal(root),s=h.state;assert.ok(s&&s.status==='completed'&&!s.pending&&!s.gate,'discard requires a completed result');
    assert.equal(s.policy.normal_target,null,'discard requires a result-only cycle');assert.ok(['result_rejected_retained','result_discarded_retained'].includes(s.outputs.final?.outcome),'only a rejected retained result can be discarded');
    assert.ok(['rejected','discarded'].includes(s.result_decision?.disposition),'discard requires the recorded human result decision');assertPublicInstructionSummary(reason);
    assert.equal(expectedReportDigest,canonicalDigest(s.outputs.report),'discard report drift');assert.equal(expectedDecisionDigest,canonicalDigest(s.result_decision),'discard decision drift');assert.equal(expectedRevisionDigest,s.report_revision?.reference.digest??null,'discard revision drift');
    const existing=instructionResultDiscard(s);assert.equal(expectedJournalDigest,existing?.source_journal_digest??h.previous,'discard journal drift');
    const value=makeInstructionResultDiscard(s,{sourceJournalDigest:expectedJournalDigest,reason});
    if(existing){assert.ok(same(existing,value),'discard request differs from the recorded request');return summary(s);}
    s.result_disposition=value;instructionResultDiscard(s);append(root,'evaluation_result_discarded',s);return summary(s);
  }finally{for(const unlock of unlocks.reverse())unlock();}
}

// Preparation is read-only. The host must allocate fresh worker destinations
// and explicitly advance the returned policy in a different run directory.
export function prepareNextSupervisedInstructionLoop({root,nextPolicy,resultSummary=null,decisionSummaries={},reportRevision=null}){
  assertNoSymlinkPathSegments(resolve(root),'previous loop root');
  const {state:s,previous}=journal(resolve(root));
  assert.ok(s&&s.status==='completed'&&!s.pending&&!s.gate,'previous cycle must be completed, with no uncertain operation');
  checkedPolicy(nextPolicy);assert.notEqual(nextPolicy.id,s.policy.id,'next cycle needs a fresh run ID');
  projectInstructionLoopObservation(nextPolicy.observation);
  assert.ok(!['instruction_loop_continuation_v1','instruction_loop_discarded_continuation_v1'].includes(nextPolicy.observation.kind),'provide fresh feedback; previous history is derived from the journal');
  const discarded=instructionResultDiscard(s);
  if(discarded){
    assert.equal(reportRevision,null,'discarded evaluation cannot be revived by a report revision');assert.equal(resultSummary,null,'discarded evaluation cannot supply a result summary');
    const observation={kind:'instruction_loop_discarded_continuation_v1',feedback:copy(nextPolicy.observation),previous:{run_id:s.policy.id,journal_digest:previous,policy_digest:canonicalDigest(s.policy),candidate_digest:canonicalDigest(s.outputs.register),outcome:s.outputs.final.outcome,result_disposition:discarded}};
    projectInstructionLoopObservation(observation);return {status:'prepared',policy:{...copy(nextPolicy),observation},models_started:false,approval_carried_forward:false};
  }
  const decisions=['evaluation_decision','result_decision','change_decision','restore_decision'].filter(k=>s[k]).map(k=>({
    kind:k,disposition:s[k].disposition,digest:canonicalDigest(s[k]),
    reason_summary:assertPublicInstructionSummary(decisionSummaries[canonicalDigest(s[k])]??s[k].reason??'Historical prior approval; original public reason unavailable.')}));
  const originalReport=s.outputs.original_report??s.outputs.report,revisionRef=reportRevision??s.report_revision?.reference;
  const attached=s.report_revision&&revisionRef&&same(s.report_revision.reference,revisionRef);
  const revised=attached?readAdmittedPracticalGradeSupplement({cycleRoot:resolve(root),reference:revisionRef}):revisionRef?readPracticalGradeSupplementContinuation({reference:revisionRef,cycleRoot:resolve(root),originalReport}):null;
  const evaluationSummary=summarizeInstructionLoopEvaluation(revised?.report??s.outputs.report);
  const observation={kind:'instruction_loop_continuation_v1',feedback:copy(nextPolicy.observation),previous:{
    run_id:s.policy.id,journal_digest:previous,policy_digest:canonicalDigest(s.policy),outcome:s.outputs.final.outcome,
    candidate_digest:canonicalDigest(s.outputs.register),report_digest:originalReport?canonicalDigest(originalReport):null,
    ...(revised?{report_revision:revised.provenance}:{}),
    ...(evaluationSummary===null?{}:{evaluation_summary:evaluationSummary}),
    decisions,failure_count:s.trials.filter(t=>t.status!=='completed'||t.state==='failed_or_interrupted').length,
    unknown_quality:s.outputs.report?.formal_score==null,
    result_summary:assertPublicInstructionSummary(resultSummary??`Previous cycle outcome: ${s.outputs.final.outcome}. Completed ${s.trials.length} trial records; ${s.trials.filter(t=>t.status!=='completed'||t.state==='failed_or_interrupted').length} failed or interrupted. Formal quality is not established by this reference loop.`)}};
  projectInstructionLoopObservation(observation);
  return {status:'prepared',policy:{...copy(nextPolicy),observation},models_started:false,approval_carried_forward:false};
}

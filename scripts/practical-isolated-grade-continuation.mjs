// Continue other approved rows; never close, replay or grade the retired role.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {inspectInitializationRecoveryOperation,observeInitializationRecoveryProcesses} from './practical-initialization-clearance.mjs';
import {createReferenceScoringCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {createFullPracticalInstructionLoopRuntime,fullPracticalControllerPins} from './instruction-loop-practical-runtime.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {assertPublicInstructionSummary} from './instruction-loop-feedback.mjs';
const copy=structuredClone,same=(a,b)=>canonicalDigest(a)===canonicalDigest(b),rowKey=r=>JSON.stringify([r.block_id,r.condition]);
const json=p=>readJsonFileStrict(p,'isolated grade continuation',16*1024*1024);
const ref=p=>{assert.equal(resolve(p),p);assertNoSymlinkPathSegments(p,'isolated grade continuation');return {path:p,digest:hash(readStableFile(p,'isolated grade continuation',16*1024*1024).bytes)};};
const checked=r=>{assert.deepEqual(ref(r.path),{path:r.path,digest:r.digest},'continuation source drift');return json(r.path);};
const save=(p,v)=>{writeCanonicalJsonNoReplace({outputPath:p,artifact:v,label:'isolated grade continuation',maximumBytes:16*1024*1024});return ref(p);};
const closed=p=>p?.ready_for_next_root===true&&p.process_group_closed===true&&p.provider_terminal_confirmed===true;
const store=root=>join(dirname(root),root.split('/').at(-1)+'.isolated-grade-continuations');
function ownedDirectory(path){assertNoSymlinkPathSegments(path,'continuation owned directory',{allowMissingLeaf:true});mkdirSync(path,{recursive:true,mode:0o700});assertNoSymlinkPathSegments(path,'continuation owned directory');}
const has=(s,r)=>(s.isolated_grade_continuations??[]).some(v=>same(v,r));
export function unattemptedPracticalRows(state,events,native){
 const attempted=new Set(state.attempts.map(a=>a.row.id)),reserved=new Set(events.filter(e=>e.state.active?.kind==='trial').map(e=>e.state.active.input.row.id));
 const dispatched=new Set(native.filter(j=>j.kind==='trial').map(j=>j.input.row.id));
 return state.rows.filter(r=>{
  if(attempted.has(r.id))return false;
  assert.equal(state.counts[rowKey(r)]??0,0,'unrecorded row has a consumed count');
  assert.ok(!reserved.has(r.id),'unrecorded row has a reservation');assert.ok(!dispatched.has(r.id),'unrecorded row has a native dispatch');return true;
 });
}
function review(c){
 assert.ok(['awaiting_result_review','awaiting_change_approval'].includes(c.status)&&c.pending===null,'unconsumed result gate required');
 for(const k of ['result_decision','change_decision','restore_decision'])assert.equal(c[k],undefined,'a human result decision was consumed');
 assert.equal(c.report_revision,undefined,'finish or explicitly retire a prior report revision first');
}
function nativeJobs(root){return readdirSync(join(root,'jobs')).map(n=>{assert.match(n,/^[a-f0-9]{64}$/u);assertNoSymlinkPathSegments(join(root,'jobs',n),'original native job');const q=json(join(root,'jobs',n,'request.json'));assert.equal(canonicalDigest(q),'sha256:'+n);return q;});}
function originalEvaluation(p,c){
 const matches=[];for(const n of readdirSync(join(p.stateRoot,'stages'))){
  if(!/^[a-f0-9]{64}$/u.test(n))continue;const dir=join(p.stateRoot,'stages',n),q=join(dir,'request.json'),r=join(dir,'result.json');if(!existsSync(q)||!existsSync(r))continue;
  const job=json(q),result=json(r);if(!['evaluate','evaluate_continuation'].includes(job.kind)||!same(result.output,c.outputs.evaluate))continue;
  assert.equal(canonicalDigest(job),'sha256:'+n);assert.equal(result.request_digest,canonicalDigest(job));assert.equal(result.status,'completed');matches.push({job,request:ref(q),result:ref(r)});
 }assert.equal(matches.length,1,'original evaluate cache is ambiguous or missing');return matches[0];
}
function phaseEvidence(h,attempt){
 const root=join(h.root,'jobs',canonicalDigest(attempt.job).slice(7)),o=attempt.result.output;
 assert.equal(o.evidence_root,root);assert.equal(attempt.result.status,'completed');assert.equal(o.execution_completed,true);assert.equal(o.context_integrity,'preserved');assert.ok(closed(o.task),'original Task must be closed');assert.equal(o.task.exit_code,0);
 assert.equal(o.ready_for_next_root,false);assert.ok(o.grade&&o.grade.process_group_closed===true&&o.grade.ready_for_next_root===false&&o.grade.provider_terminal_confirmed===false,'only isolated unconfirmed grading is eligible');
 assert.ok(['reference','exclude'].includes(attempt.assessment?.action),'preserve a recorded non-use AI disposition');
 const sources=['request.json','result.json','transport.json','process.json','task-completion.json','grade-completion.json','grade-started.json','grade-provider.json'].map(n=>ref(join(root,n)));
 assert.ok(same(json(join(root,'request.json')),attempt.job)&&same(json(join(root,'result.json')),attempt.result));assert.ok(same(json(join(root,'task-completion.json')),o.task)&&same(json(join(root,'grade-completion.json')),o.grade));
 const transport=json(join(root,'transport.json'));assert.equal(transport.request_digest,canonicalDigest(attempt.job));assert.equal(transport.exit_code,0);assert.equal(transport.signal,null);
 const trial=h.selection.practical_runtime.commands.trial,worker=checked({path:trial.argv[2],digest:trial.argv[3]}),grader=worker.cases[attempt.row.case_id].grader;assert.ok(grader?.provider_closure_path,'pinned grading provider receipt required');
 for(const p of grader.pins)assert.equal(ref(p.path).digest,p.digest);
 const start=json(join(root,'grade-started.json')),provider=json(join(root,'grade-provider.json'));assert.equal(start.command_digest,canonicalDigest(grader));assert.equal(provider.command_digest,start.command_digest);assert.equal(provider.request_digest,canonicalDigest(attempt.job));assert.equal(provider.invocation_digest,canonicalDigest({request_digest:canonicalDigest(attempt.job),command_digest:start.command_digest,role:'grade'}));assert.equal(provider.terminal,false);
 for(const p of provider.observation.artifacts){assert.ok(!p.path.startsWith('/')&&!p.path.split('/').includes('..'));const r=ref(join(root,p.path));assert.equal(r.digest,p.digest);sources.push(r);}
 return {root,grader,sources,worker_pid:json(join(root,'process.json')).pid};
}
export function observeIsolatedGradeProcesses(evidence){
 const rows=[];for(const root of evidence.owned_roots.slice(1))rows.push(observeInitializationRecoveryProcesses({taskRoot:evidence.owned_roots[0],assessRoot:root,workerPids:evidence.worker_pids}));
 assert.ok(rows.length);return {kind:'isolated_grade_local_observation_v1',observations:rows,provider_closure_inferred:false};
}
function proof(output,h,attempt,phase){
 assert.equal(output.kind,'practical_isolated_grade_inspection_v1');assert.equal(output.model_calls,0);assert.equal(output.task_calls,0);assert.equal(output.ready_for_next_root,true);
 assert.equal(output.original_attempt_id,attempt.id);assert.equal(output.original_job_digest,canonicalDigest(attempt.job));assert.equal(output.original_result_digest,canonicalDigest(attempt.result));assert.equal(output.grade_command_digest,canonicalDigest(phase.grader));
 for(const key of ['grading_isolated_readonly','candidate_not_executed','allow_other_unattempted_rows'])assert.equal(output[key],true);for(const key of ['provider_closure_inferred','original_role_replay_authorized','owner_actions'])assert.equal(output[key],false);
 assert.ok(Array.isArray(output.sources)&&output.sources.length>0&&output.sources.length<=4096);for(const r of output.sources)assert.deepEqual(ref(r.path),r);
 assert.ok(output.sources.some(r=>r.path===phase.sources.find(r=>r.path.endsWith('/grade-provider.json')).path),'grade identity must be in host evidence');
 assert.ok(Array.isArray(output.owned_roots)&&output.owned_roots.length>=2&&output.owned_roots.length<=8&&new Set(output.owned_roots).size===output.owned_roots.length);assert.ok(output.owned_roots.includes(phase.root));
 for(const r of output.owned_roots){assert.equal(resolve(r),r);assertNoSymlinkPathSegments(r,'retired grading owned root');assert.ok(r.startsWith(h.profile.protectedRoot+'/'),'retired roots must remain protected and isolated');}
 assert.ok(Array.isArray(output.worker_pids)&&output.worker_pids.includes(phase.worker_pid));assert.ok(output.worker_pids.every(p=>Number.isSafeInteger(p)&&p>0));
 assert.ok(Array.isArray(output.comparison_limits)&&output.comparison_limits.length>0&&output.comparison_limits.length<=16);output.comparison_limits.forEach(assertPublicInstructionSummary);return output;
}
async function inspectIsolation(h,attempt,definition){
 assert.deepEqual(Object.keys(definition),['commands']);assert.deepEqual(Object.keys(definition.commands),['grade']);assert.equal(definition.commands.grade.model_calls,false,'isolation inspector must be model-free');
 for(const p of definition.commands.grade.pins)assert.equal(ref(p.path).digest,p.digest);
 const phase=phaseEvidence(h,attempt),job={kind:'grade',input:{kind:'practical_isolated_grade_inspection_v1',operation_root:resolve(h.o.current.root,'..'),cycle_root:h.cycleRoot,run_root:h.root,attempt_id:attempt.id,original_job_digest:canonicalDigest(attempt.job),original_result_digest:canonicalDigest(attempt.result),grade_command_digest:canonicalDigest(phase.grader)},runtime_digest:canonicalDigest(definition)};
 job.input.operation_root=h.operationRoot;
 const root=join(store(h.root),'inspections',canonicalDigest(job).slice(7));ownedDirectory(root);
 const runtime=createReferenceScoringCommandRuntime({definition,modelCallsAuthorized:false}),native=join(root,'jobs',canonicalDigest(job).slice(7)),result=existsSync(native)?await runtime.inspect(job,{root}):await runtime.grade(job,{root});
 assert.equal(result.request_digest,canonicalDigest(job));assert.equal(result.status,'completed');const transport=json(join(native,'transport.json'));assert.equal(transport.request_digest,canonicalDigest(job));assert.equal(transport.exit_code,0);assert.equal(transport.signal,null);
 const output=proof(result.output,h,attempt,phase);for(const p of definition.commands.grade.pins)assert.equal(ref(p.path).digest,p.digest);
 return {phase,output,definition,job,native_result:ref(join(native,'result.json')),native_request:ref(join(native,'request.json')),native_transport:ref(join(native,'transport.json'))};
}
function checkInspection(intent,h){
 const i=intent.inspection,attempt=h.state.attempts.find(a=>a.id===intent.original_attempt_id);assert.ok(attempt);const phase=phaseEvidence(h,attempt);
 for(const p of i.definition.commands.grade.pins)assert.equal(ref(p.path).digest,p.digest);
 assert.equal(i.definition.commands.grade.model_calls,false);assert.equal(i.job.runtime_digest,canonicalDigest(i.definition));assert.equal(i.job.input.operation_root,intent.operation_root);assert.equal(i.job.input.run_root,h.root);assert.equal(i.job.input.original_result_digest,canonicalDigest(attempt.result));
 const result=checked(i.native_result);assert.ok(same(checked(i.native_request),i.job));const t=checked(i.native_transport);assert.equal(t.request_digest,canonicalDigest(i.job));assert.equal(t.exit_code,0);assert.equal(t.signal,null);assert.equal(result.request_digest,canonicalDigest(i.job));assert.equal(result.status,'completed');assert.ok(same(result.output,i.output));proof(i.output,h,attempt,phase);
 for(const p of intent.sources)assert.equal(ref(p.path).digest,p.digest);return attempt;
}
function jobFor(reference,intent){return {...copy(intent.original_evaluation.job),kind:'evaluate_continuation',continuation:{kind:'isolated_grade_other_rows_v1',intent:reference}};}
function sourceControls(intent){const actual=fullPracticalControllerPins();assert.ok(same(intent.control_implementation,actual),'continuation controller changed; review a new revision');}
function preflight(reference){
 const intent=checked(reference);assert.equal(intent.kind,'practical_isolated_grade_continuation_v1');
 for(const root of [intent.operation_root,intent.cycle_root,intent.run_root]){assert.equal(resolve(root),root);assertNoSymlinkPathSegments(root,'continuation coordinator');}
 const h=inspectInitializationRecoveryOperation(intent.operation_root);assert.equal(h.root,intent.run_root);assert.equal(h.cycleRoot,intent.cycle_root);
 for(const k of ['result_decision','change_decision','restore_decision'])assert.equal(h.cycle[k],undefined,'a human result decision was consumed');
 if(h.cycle.pending)assert.ok(same(h.cycle.pending,jobFor(reference,intent)),'another continuation is pending');
 validateIsolatedGradeContinuation(reference,{root:h.root,state:h.state});return {intent,h};
}
export function validateIsolatedGradeContinuation(reference,{root,state,checkProcesses=false}={}){
 const intent=checked(reference);assert.equal(intent.kind,'practical_isolated_grade_continuation_v1');assert.equal(intent.run_root,root);assert.equal(intent.scope,'other_unattempted_rows_only');assert.equal(intent.provider_closed,false);assert.equal(intent.original_role_replay_authorized,false);sourceControls(intent);
 assert.equal(reference.path,join(store(root),'intents',canonicalDigest(intent).slice(7),'intent.json'));
 const h=inspectInitializationRecoveryOperation(intent.operation_root);assert.equal(h.root,root);assert.equal(h.cycleRoot,intent.cycle_root);assert.ok(same(h.state.plan,intent.before.evaluation.plan));assert.ok(same(state.plan,intent.before.evaluation.plan));assert.ok(same(state.rows,intent.before.evaluation.rows));
 const histories={operation:readRunJournal(intent.operation_root),cycle:readRunJournal(intent.cycle_root),evaluation:readRunJournal(root)};
 for(const name of ['operation','cycle','evaluation']){const event=histories[name].events.find(e=>e.record_digest===intent.before_digests[name]);assert.ok(event&&same(event.state,intent.before[name]),'original admission snapshot is not in its journal');}
 const originalEvents=histories.evaluation.events.slice(0,histories.evaluation.events.findIndex(e=>e.record_digest===intent.before_digests.evaluation)+1);
 assert.equal(intent.before.evaluation.status,'completed');assert.equal(intent.before.evaluation.suspended,true);review(intent.before.cycle);
 assert.ok(same(unattemptedPracticalRows(intent.before.evaluation,originalEvents,intent.original_native_requests),intent.remaining_rows),'admitted population differs from original untouched rows');
 const nativeBefore=new Set(intent.original_native_requests.map(q=>canonicalDigest(q))),allowedRows=new Set(intent.remaining_rows.map(r=>r.id));
 for(const q of nativeJobs(root))if(q.kind==='trial')assert.ok(nativeBefore.has(canonicalDigest(q))||allowedRows.has(q.input.row.id),'foreign trial dispatch in continuation');
 assert.ok(same(checked(intent.original_evaluation.request),intent.original_evaluation.job));const cached=checked(intent.original_evaluation.result);assert.equal(cached.request_digest,canonicalDigest(intent.original_evaluation.job));assert.equal(cached.status,'completed');assert.ok(same(cached.output,intent.before.cycle.outputs.evaluate));assert.ok(same(cached.output.report,intent.before.cycle.outputs.report));const {measured_context,...plain}=cached.output.report;assert.ok(same(plain,intent.before.evaluation.report));
 assert.ok(same(state.evaluation_decision,intent.before.evaluation.evaluation_decision));assert.ok(same(h.cycle.evaluation_decision,intent.before.cycle.evaluation_decision));assert.ok(same(h.cycle.policy,intent.before.cycle.policy));
 assert.ok(same(state.attempts.slice(0,intent.before.evaluation.attempts.length),intent.before.evaluation.attempts),'original attempt changed');
 for(const key of ['decisions','assessments','assessed_packets'])assert.ok(same((state[key]??[]).slice(0,(intent.before.evaluation[key]??[]).length),intent.before.evaluation[key]??[]),'original recovery history changed');
 for(const a of intent.before.evaluation.attempts){assert.equal(state.counts[rowKey(a.row)],intent.before.evaluation.counts[rowKey(a.row)]);assert.equal(state.selected[rowKey(a.row)],intent.before.evaluation.selected[rowKey(a.row)]);}
 const attempt=checkInspection(intent,h),observation=checkProcesses?observeIsolatedGradeProcesses(intent.inspection.output):null;return {intent,attempt,observation,job:jobFor(reference,intent)};
}
export async function prepareIsolatedGradeContinuation({operationRoot,definition,reason,expectedRemainingCount},observe=observeIsolatedGradeProcesses){
 operationRoot=resolve(operationRoot);assertPublicInstructionSummary(reason);const initial=inspectInitializationRecoveryOperation(operationRoot),unlocks=[];
 try{for(const r of [operationRoot,initial.cycleRoot,initial.root].sort())unlocks.push(lockRunJournal(r));const h=inspectInitializationRecoveryOperation(operationRoot);h.operationRoot=operationRoot;assert.equal(h.root,initial.root);assert.equal(h.cycleRoot,initial.cycleRoot);review(h.cycle);const history=readRunJournal(h.root),s=history.state;
 assert.equal(s.status,'completed');assert.equal(s.suspended,true);assert.equal(s.report.execution_suspended,true);assert.equal(s.active,null);assert.equal(s.recovery,null);assert.deepEqual(s.queue,[]);
 assert.equal(h.cycle.policy.evaluation_mode,'practical_v1');assert.ok(store(h.root).startsWith(h.profile.protectedRoot+'/'));assert.ok(same(s.rows,history.events[0].state.rows),'approved row population changed');
 const prior=new Set();for(const reference of s.isolated_grade_continuations??[]){const v=validateIsolatedGradeContinuation(reference,{root:h.root,state:s,checkProcesses:true});prior.add(v.attempt.id);}
 const unresolved=s.attempts.filter(a=>a.result.output.ready_for_next_root!==true&&!prior.has(a.id));assert.ok(unresolved.length>0);assert.equal(unresolved.length,1,'retire each newly isolated grading failure explicitly');const attempt=unresolved[0];
 const nativeBefore=nativeJobs(h.root),remaining=unattemptedPracticalRows(s,history.events,nativeBefore);assert.ok(remaining.length>0);assert.equal(remaining.length,expectedRemainingCount,'unexpected remaining approved population');
 const before={operation:copy(h.o),cycle:copy(h.cycle),evaluation:copy(s)},digests={operation:readRunJournal(operationRoot).previous,cycle:readRunJournal(h.cycleRoot).previous,evaluation:history.previous};
 const inspection=await inspectIsolation(h,attempt,definition),observation=observe(inspection.output),original=originalEvaluation(h.profile,h.cycle);
 const intent={kind:'practical_isolated_grade_continuation_v1',scope:'other_unattempted_rows_only',operation_root:operationRoot,cycle_root:h.cycleRoot,run_root:h.root,original_attempt_id:attempt.id,provider_closed:false,original_role_replay_authorized:false,reason,remaining_rows:remaining,before,before_digests:digests,original_native_requests:nativeBefore,inspection,local_observation:observation,original_evaluation:original,control_implementation:fullPracticalControllerPins(),sources:[...inspection.phase.sources,original.request,original.result,{path:h.o.current.profile_path,digest:h.o.current.profile_digest},ref(h.o.current.config_path)]};
 const directory=join(store(h.root),'intents',canonicalDigest(intent).slice(7));ownedDirectory(directory);const reference=save(join(directory,'intent.json'),intent);
 for(const [key,r]of [['operation',operationRoot],['cycle',h.cycleRoot],['evaluation',h.root]])assert.equal(readRunJournal(r).previous,digests[key],'source coordinator changed during inspection');
 validateIsolatedGradeContinuation(reference,{root:h.root,state:s});return {reference,remaining_rows:remaining.length,model_calls:0,task_calls:0,provider_closed:false};
 }finally{for(const u of unlocks.reverse())u();}
}
export function assertIsolatedEvaluationJob(job,cycleRoot,{execute=false}={}){
 assert.equal(job.kind,'evaluate_continuation');assert.equal(job.continuation?.kind,'isolated_grade_other_rows_v1');const reference=job.continuation.intent,intent=checked(reference);assert.equal(intent.cycle_root,resolve(cycleRoot));
 const c=readRunJournal(intent.cycle_root).state,s=readRunJournal(intent.run_root).state,o=readRunJournal(intent.operation_root).state;
 for(const v of [c,s,o])assert.ok(has(v,reference),'isolated continuation admission incomplete');
 const v=validateIsolatedGradeContinuation(reference,{root:intent.run_root,state:s,checkProcesses:true});assert.ok(same(job,v.job),'foreign continuation epoch');
 if(execute){assert.ok(c.pending&&same(c.pending,job),'continuation is not pending; inspect its recorded result instead');for(const k of ['result_decision','change_decision','restore_decision'])assert.equal(c[k],undefined,'a human result decision was consumed');}
 else if(c.pending)assert.ok(same(c.pending,job),'another continuation is pending');
 return v;
}
export function activeIsolatedPracticalRows(root,state){
 let last=null;for(const reference of state.isolated_grade_continuations??[])last=validateIsolatedGradeContinuation(reference,{root,state,checkProcesses:true});
 if(!last)return null;assertIsolatedEvaluationJob(last.job,last.intent.cycle_root,{execute:true});return new Set(last.intent.remaining_rows.map(r=>r.id));
}
export function admitIsolatedGradeContinuation({reference},observe=observeIsolatedGradeProcesses,afterAppend=()=>{}){
 const {intent}=preflight(reference),roots=[intent.operation_root,intent.cycle_root,intent.run_root].sort(),unlocks=[];
 try{for(const r of roots)unlocks.push(lockRunJournal(r));const op=readRunJournal(intent.operation_root),cycle=readRunJournal(intent.cycle_root),evaluation=readRunJournal(intent.run_root),states={operation:op,cycle,evaluation};
  const checkedIntent=validateIsolatedGradeContinuation(reference,{root:intent.run_root,state:evaluation.state});observe(intent.inspection.output);
  // Withdraw the old human gate in the FIRST durable transition. A crash must
  // not leave that gate valid while another coordinator has an admission intent.
  for(const [name,root]of [['cycle',intent.cycle_root],['operation',intent.operation_root],['evaluation',intent.run_root]]){
   const current=readRunJournal(root);if(has(current.state,reference))continue;
   if(name==='operation'&&current.previous!==intent.before_digests.operation){const {status,...plain}=current.state,{status:beforeStatus,...beforePlain}=intent.before.operation;assert.ok(has(readRunJournal(intent.cycle_root).state,reference)&&same(plain,beforePlain)&&status==='operation_uncertain','operation changed before admission');}
   else assert.equal(current.previous,intent.before_digests[name],name+' changed before admission');
   const s=copy(current.state);s.isolated_grade_continuations??=[];s.isolated_grade_continuations.push(reference);
   if(name==='evaluation'){assert.ok(same(unattemptedPracticalRows(s,current.events,nativeJobs(root)),intent.remaining_rows));s.queue=intent.remaining_rows.map(row=>({row,cohort:1}));s.suspended=false;s.status='advancing';delete s.report;}
   else if(name==='cycle'){review(s);s.gate=null;s.pending=checkedIntent.job;s.status='advancing';delete s.outputs.evaluate;delete s.outputs.report;delete s.outputs.plan;}
   else s.pending_grade_continuation=reference;
   appendRunJournal(root,'isolated_grade_other_rows_admitted',s,{intent:reference});afterAppend(name);
  }
  const o=readRunJournal(intent.operation_root).state,status=readRunJournal(intent.cycle_root).state.status;if(o.pending_grade_continuation&&o.status!==status){o.status=status;appendRunJournal(intent.operation_root,'isolated_grade_admission_completed',o,{intent:reference});}
  return {reference,remaining_rows:intent.remaining_rows.length,model_calls:0,task_calls:0,provider_closed:false};
 }finally{for(const u of unlocks.reverse())u();}
}
export async function advanceIsolatedGradeContinuation({reference,modelCallsAuthorized=false,assessment=null}){
 assert.equal(modelCallsAuthorized,true,'continuation execution requires the existing model grant');const {intent}=preflight(reference),unlock=lockRunJournal(intent.operation_root);
 try{const op=readRunJournal(intent.operation_root),cycle=readRunJournal(intent.cycle_root),evaluation=readRunJournal(intent.run_root);for(const s of [op.state,cycle.state,evaluation.state])assert.ok(has(s,reference),'finish the same admission before execution');
  assert.ok(cycle.state.pending&&same(cycle.state.pending,jobFor(reference,intent)),'continuation is not pending; inspect its recorded result instead');
  validateIsolatedGradeContinuation(reference,{root:intent.run_root,state:evaluation.state,checkProcesses:true});
  const config=json(op.state.current.config_path),runtime=createFullPracticalInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized});
  const result=await advanceSupervisedInstructionLoop({root:intent.cycle_root,policy:cycle.state.policy,runtime,assessment});
  const o=readRunJournal(intent.operation_root).state;o.status=readRunJournal(intent.cycle_root).state.status;if(['awaiting_result_review','awaiting_change_approval'].includes(o.status))delete o.pending_grade_continuation;
  appendRunJournal(intent.operation_root,'isolated_grade_continuation_advanced',o,{intent:reference});return result;
 }finally{unlock();}
}

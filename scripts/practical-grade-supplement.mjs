// Opt-in, retained-source verification. Original execution records stay immutable.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalDigest,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {createReferenceScoringCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {inspectPracticalQualityObservation,validatePracticalQualityObservation} from './practical-quality-observation.mjs';
import {buildInstructionRecoveryPacket,validateInstructionRecoveryAssessment} from './instruction-evaluation-recovery.mjs';
import {buildPragmaticEvaluationReport} from './ask-pragmatic-evaluation-report.mjs';
import {verifyRetainedPracticalGradeSource} from './practical-grade-source-binding.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {validatePracticalInitializationClearance} from './practical-initialization-clearance.mjs';
import {validateIsolatedGradeContinuation} from './practical-isolated-grade-continuation.mjs';

const copy=v=>structuredClone(v),same=(a,b)=>canonicalDigest(a)===canonicalDigest(b),json=p=>readJsonFileStrict(p,'grade supplement',16*1024*1024);
const save=(p,v)=>writeCanonicalJsonNoReplace({outputPath:p,artifact:v,label:'grade supplement',maximumBytes:16*1024*1024});
const ref=p=>({path:p,digest:hash(readStableFile(p,'grade supplement evidence',16*1024*1024).bytes)});
function verifyRef(r){assert.deepEqual(Object.keys(r).sort(),['digest','path']);assert.equal(resolve(r.path),r.path);assertNoSymlinkPathSegments(r.path,'grade supplement evidence');assert.equal(ref(r.path).digest,r.digest,'supplement evidence drift');}
function checkedRef(r){verifyRef(r);return json(r.path);}
function rootPath(p){assert.equal(resolve(p),p);assertNoSymlinkPathSegments(p,'original evaluation');assert.equal(realpathSync(p),p);return p;}
export const practicalGradeSupplementStore=root=>join(dirname(rootPath(root)),basename(root)+'.grade-supplements');
const slotPath=(root,attempt)=>join(practicalGradeSupplementStore(root),canonicalDigest([root,attempt.id,canonicalDigest(attempt.job)]).slice(7));
function closed(p){return p?.ready_for_next_root===true&&p.process_group_closed===true&&p.provider_terminal_confirmed===true;}
function coordinatorRoots(root,c){
 assert.ok(c.parent?.operation_root&&c.parent?.cycle_root,'bound standard operation/cycle evidence required');
 const operation=rootPath(c.parent.operation_root),cycle=rootPath(c.parent.cycle_root),o=readRunJournal(operation).state,s=readRunJournal(cycle).state;
 assert.ok(cycle.startsWith(operation+'/'),'cycle is outside its bound operation');
 assert.equal(o?.current?.root,cycle,'foreign operation cycle');assert.equal(o.preparation,null,'parent continuation is pending');
 assert.ok(['awaiting_result_review','awaiting_change_approval','completed'].includes(s?.status)&&!s.pending,'parent coordinator operation unresolved');assert.equal(o.status,s.status);
 const current={...o.binding,...o.current},profile=checkedRef({path:current.profile_path,digest:current.profile_digest}),config=json(current.config_path);
 assert.equal(canonicalDigest(config),current.config_digest);assert.equal(config.runtime.profile_path,current.profile_path);assert.equal(config.runtime.profile_digest,current.profile_digest);
 assert.ok(same(config.policy,s.policy),'parent policy differs from its original configuration');assert.ok(same({...profile.policy,runtime_digest:canonicalDigest(config.runtime)},config.policy),'parent profile/policy drift');
 assert.equal(profile.kind,'full_practical_instruction_loop_profile_v1');assert.equal(profile.practical.root,root,'foreign practical profile');
 assert.equal(s?.outputs?.select?.practical_root,root,'foreign parent selection');assert.ok(same(s.outputs.select.practical_runtime,c.original_runtime));
 const parents=[operation,cycle].sort();if(c.coordinator_roots!==undefined)assert.ok(same([...c.coordinator_roots].sort(),parents),'parent roots must exactly match bound operation');return parents;
}
function quiescent(root,parents,{held=false,allowOwnedCoordinatorLocks=false}={}){
 const h=readRunJournal(root),s=h.state;assert.ok(s&&s.status==='completed'&&s.active===null&&!s.recovery,'original evaluation is not completed/quiescent');
 assert.ok(!s.suspended&&!s.report?.execution_suspended,'completed evaluation contains suspended execution');
 assert.ok(s.evaluation_decision?.disposition==='approved','original case approval required');
 const exceptions=s.continuation_clearances??[];
 for(const c of exceptions)validatePracticalInitializationClearance(c,{root,state:s,checkProcesses:true});
 const isolated=(s.isolated_grade_continuations??[]).map(reference=>validateIsolatedGradeContinuation(reference,{root,state:s,checkProcesses:true}));
 const exceptedGrade=d=>isolated.some(v=>canonicalDigest(v.attempt.job)===d);
 const exceptedTrial=d=>exceptions.some(c=>c.original_job_digest===d),exceptedAssessor=d=>exceptions.some(c=>c.original_assessor_job_digest===d);
 for(const a of s.attempts){if(exceptedTrial(canonicalDigest(a.job)))continue;assert.ok(closed(a.result.output?.task),'original Task closure unresolved');if(!exceptedGrade(canonicalDigest(a.job))){assert.equal(a.result.output?.ready_for_next_root,true,'original trial completion unresolved');if(a.result.output?.grade)assert.ok(closed(a.result.output.grade),'original grade closure unresolved');}}
 const jobs=join(root,'jobs');assert.ok(existsSync(jobs),'original command receipts required');
 for(const name of readdirSync(jobs)){
  assert.match(name,/^[a-f0-9]{64}$/u);const d=join(jobs,name),q=json(join(d,'request.json'));
  if(exceptedAssessor(canonicalDigest(q)))continue; // Validated read-only retirement, not a closure assertion.
  const r=json(join(d,'result.json')),t=json(join(d,'transport.json'));
  assert.equal(canonicalDigest(q),'sha256:'+name);assert.equal(r.request_digest,canonicalDigest(q));assert.equal(t.request_digest,r.request_digest);
  assert.ok(['completed','failed','interrupted'].includes(r.status),'original command completion unresolved');assert.equal(t.exit_code,0,'original transport requires inspection');assert.equal(t.signal,null);
  if(q.kind==='assess')assert.equal(r.status,'completed','original assessment provider closure unresolved');
  if(q.kind==='trial'&&!exceptedTrial(canonicalDigest(q))){assert.ok(closed(r.output.task));if(!exceptedGrade(canonicalDigest(q))){assert.equal(r.output?.ready_for_next_root,true);if(r.output.grade)assert.ok(closed(r.output.grade));}}
 }
 for(const p of [root,...parents]){rootPath(p);if(!held&&existsSync(join(p,'.advance-lock'))){assert.ok(allowOwnedCoordinatorLocks&&p!==root,'original coordinator is running or unresolved');const owner=join(p,'.advance-lock/pid');assertNoSymlinkPathSegments(owner,'owned coordinator lock');assert.equal(readStableFile(owner,'owned coordinator lock',64).bytes.toString('utf8'),String(process.pid),'coordinator lock is owned by another process');}}
 return h;
}
function eligible(s,id){
 const a=s.attempts.find(v=>v.id===id);assert.ok(a,'unknown original attempt');
 assert.equal(a.result.status,'completed');assert.equal(a.result.output.context_integrity,'preserved','grading cannot repair changed execution context');
 assert.equal(a.result.output.task?.exit_code,0,'grading cannot repair failed Task execution');
 assert.ok(closed(a.result.output.task)&&closed(a.result.output.grade));
 assert.ok(same(a.job.input.condition_context,s.plan.conditions.find(v=>v.id===a.row.condition)?.context),'original environment mismatch');
 const q=inspectPracticalQualityObservation(a.result.output);assert.ok(q.issue||!q.value||(q.value.fixed_reference===null&&q.value.evidence_refs.length===0),'valid low or range judgments cannot be regraded');
 const row=s.attempts.filter(v=>v.row.block_id===a.row.block_id&&v.row.condition===a.row.condition);
 assert.equal(row.at(-1).id,a.id,'superseded attempt');
 const issue=a.assessment?.selection_basis;assert.ok(!issue||['practical_reference','missing_evidence','no_value_in_more_runs'].includes(issue),'grading cannot repair an execution/fairness exclusion');
 return a;
}
function originalContract(s,a,c,root){
 assert.equal(a.result.output.evidence_root,join(root,'jobs',canonicalDigest(a.job).slice(7)),'original execution root transplant');
 assert.equal(c.kind,'practical_grade_recovery_contract_v1');
 const workerResult=json(join(a.result.output.evidence_root,'result.json')),workerRequest=json(join(a.result.output.evidence_root,'request.json'));
 assert.ok(same(workerRequest,a.job)&&same(workerResult,a.result),'original journal/worker result drift');
 assert.equal(canonicalDigest(c.original_runtime),s.plan.runtime_digest,'original runtime transplant');
 const command=c.original_runtime.commands.trial;
 assert.ok(command&&basename(command.argv[1])==='practical-evaluation-worker.mjs','standard practical worker required');
 const workerRef={path:command.argv[2],digest:command.argv[3]};assert.ok(command.pins.some(p=>same(p,workerRef)));
 const worker=checkedRef(workerRef),grader=worker.cases[a.row.case_id]?.grader;assert.ok(grader,'original automatic grader required');
 assert.ok(grader.pins.some(p=>same(p,c.grader_settings)),'grader settings not in original runtime');
 assert.ok(grader.argv.some((value,index)=>value===c.grader_settings.path&&grader.argv[index+1]===c.grader_settings.digest),'settings differ from original grading invocation');
 const settings=checkedRef(c.grader_settings);assert.ok(settings.config&&settings.backend,'closed source grader settings required');
 const base=rootPath(a.result.output.evidence_root),summaryPath=join(base,'grade-summary.json'),summaryRef=ref(summaryPath);
 assert.ok(a.result.output.grade.provider_observation.artifacts.some(p=>p.path==='grade-summary.json'&&p.digest===summaryRef.digest),'original grade summary is not a verified artifact');
 const summary=json(summaryPath),dispatchPath=join(base,'private-grade/dispatch.json'),dispatch=json(dispatchPath),primaryPath=join(base,'private-grade/primary-backend.json'),primary=json(primaryPath),packetPath=join(base,'private-grade/packet/packet.json');
 assert.equal(summary.terminal,true);assert.equal(summary.fixed_reference,null);assert.ok(typeof summary.issue==='string'&&summary.issue.includes('ValueError:'),'closed fixed-validator failure required');
 assert.equal(dispatch.maximum_grading_calls,2);assert.equal(summary.calls.length,1);assert.equal(summary.calls[0].role,'primary');
 assert.equal(primary.terminal,true);assert.equal(primary.completed,true);assert.equal(summary.calls[0].terminal,true);assert.equal(summary.calls[0].completed,true);
 assert.ok(same(primary.metrics??null,summary.calls[0].metrics??null),'primary metrics differ from original bound grade summary');
 assert.ok(primary.text&&JSON.parse(primary.text));assert.equal(existsSync(join(base,'private-grade/verification-backend.json')),false,'original verifier slot already consumed');
 // Runtime pins may carry a Python module alias; preserve the original metadata.
 for(const p of grader.pins)verifyRef({path:p.path,digest:p.digest});
 const spec=s.plan.cases.find(v=>v.id===a.row.case_id);assert.equal(spec.public_input_digest,a.row.public_input_digest);
 assert.equal(canonicalDigest(worker.cases[a.row.case_id].files.map(({target,digest})=>({target,digest}))),spec.public_input_digest,'original public input mismatch');
 return {worker:workerRef,grader_settings:c.grader_settings,grader_pins:grader.pins,summary:summaryRef,dispatch:ref(dispatchPath),primary:ref(primaryPath),packet:ref(packetPath),
  criteria_ref:spec.success_criteria_ref,model:settings.config.model,reasoning:settings.config.reasoning,maximum_new_model_calls:1,remaining_role:'verification',
  source_origin:verifyRetainedPracticalGradeSource({attempt:a,settings})};
}
export function preparePracticalGradeSupplement({runRoot,attemptId,contract}){
 const root=rootPath(runRoot),{state:s}=quiescent(root,coordinatorRoots(root,contract)),a=eligible(s,attemptId),binding=originalContract(s,a,contract,root);
 return {kind:'practical_grade_supplement_recipe_v1',run_root:root,plan_digest:canonicalDigest(s.plan),case_approval_digest:canonicalDigest(s.evaluation_decision),
  original_report_digest:canonicalDigest(s.report),attempt_id:a.id,original_job_digest:canonicalDigest(a.job),original_result_digest:canonicalDigest(a.result),row:copy(a.row),contract:copy(contract),binding};
}
export function prepareOperationPracticalGradeSupplement({operationRoot,attemptId}){
 const operation=rootPath(operationRoot),cycleRoot=readRunJournal(operation).state?.current?.root;assert.ok(cycleRoot,'operation has no current cycle');
 const selection=readRunJournal(rootPath(cycleRoot)).state?.outputs?.select;assert.ok(selection?.practical_root&&selection.practical_runtime,'operation has no retained practical selection');
 const state=readRunJournal(rootPath(selection.practical_root)).state,a=state.attempts.find(v=>v.id===attemptId);assert.ok(a,'unknown operation attempt');
 const command=selection.practical_runtime.commands.trial,worker=checkedRef({path:command.argv[2],digest:command.argv[3]}),grader=worker.cases[a.row.case_id]?.grader;
 assert.ok(grader&&grader.argv.length>=4,'operation has no configured source grader');
 return preparePracticalGradeSupplement({runRoot:selection.practical_root,attemptId,contract:{kind:'practical_grade_recovery_contract_v1',original_runtime:selection.practical_runtime,
  grader_settings:{path:grader.argv[2],digest:grader.argv[3]},parent:{operation_root:operation,cycle_root:cycleRoot}}});
}
function checkedRecipe(recipe,{held=false,allowOwnedCoordinatorLocks=false}={}){
 assert.equal(recipe.kind,'practical_grade_supplement_recipe_v1');const {state:s}=quiescent(recipe.run_root,coordinatorRoots(recipe.run_root,recipe.contract),{held,allowOwnedCoordinatorLocks});
 const a=eligible(s,recipe.attempt_id);assert.equal(canonicalDigest(s.plan),recipe.plan_digest);assert.equal(canonicalDigest(s.evaluation_decision),recipe.case_approval_digest);assert.equal(canonicalDigest(s.report),recipe.original_report_digest);
 assert.equal(canonicalDigest(a.job),recipe.original_job_digest);assert.equal(canonicalDigest(a.result),recipe.original_result_digest);assert.ok(same(a.row,recipe.row));
 assert.ok(same(originalContract(s,a,recipe.contract,recipe.run_root),recipe.binding),'original grading contract drift');return {s,a};
}
function inspectSlot(directory){
 if(existsSync(join(directory,'receipt.json'))){
  let path=join(directory,'receipt.json'),receipt=json(path);const history=join(directory,'observations');
  if(existsSync(history))for(const name of readdirSync(history).filter(v=>/^\d{6}$/u.test(v)).sort()){
   const next=join(history,name,'receipt.json');if(!existsSync(next))break;const value=json(next);assert.equal(value.previous_receipt.digest,ref(path).digest,'supplement observation chain drift');assert.equal(receipt.closed,false,'cannot observe a closed slot again');path=next;receipt=value;
  }
  return {receipt,reference:ref(path)};
 }
 return null;
}
export async function runPracticalGradeSupplement({recipe,definition,modelCallsAuthorized=false}){
 checkedRecipe(recipe);const roots=[...new Set([recipe.run_root,...coordinatorRoots(recipe.run_root,recipe.contract)])].sort(),unlocks=[];
 try{
  for(const root of roots)unlocks.push(lockRunJournal(root));const {a}=checkedRecipe(recipe,{held:true}),store=practicalGradeSupplementStore(recipe.run_root),directory=slotPath(recipe.run_root,a);
  mkdirSync(store,{recursive:true,mode:0o700});assertNoSymlinkPathSegments(store,'supplement store');
  for(const name of readdirSync(store)){if(!/^[a-f0-9]{64}$/u.test(name))continue;const other=join(store,name);if(other===directory)continue;assert.ok(inspectSlot(other)?.receipt.closed===true,'another supplement has unconfirmed provider work');}
  const runtime=createReferenceScoringCommandRuntime({definition,modelCallsAuthorized}),job={kind:'grade',input:{recipe,recipe_digest:canonicalDigest(recipe),maximum_model_calls:1,task_calls:0,primary_calls:0}};
  for(const p of recipe.binding.grader_pins)assert.ok(definition.commands.grade.pins.some(v=>same(v,p)),'supplement provider must retain original grader pins');
  if(existsSync(directory)){
   if(!existsSync(join(directory,'allocation.json')))return {status:'requires_inspection',directory,reason:'reservation_metadata_missing',additional_dispatch_permitted:false};
   const allocation=json(join(directory,'allocation.json'));assert.equal(allocation.recipe_digest,canonicalDigest(recipe),'supplement slot already reserved with another recipe');assert.equal(allocation.runtime_digest,runtime.digest,'supplement slot already reserved with another provider');
   const saved=inspectSlot(directory);if(saved){checkStoredReceipt(saved.receipt,recipe,job,runtime);return saved;}
   // Reservation, crash or loss of a dispatch response is never an execution grant.
   const observed=await runtime.inspect(job,{root:join(directory,'execution')});checkedRecipe(recipe,{held:true});return finishSupplement(directory,job,runtime,observed);
  }
  assert.ok(!definition.commands.grade.model_calls||modelCallsAuthorized,'supplement model grant required before reservation');
  mkdirSync(directory,{mode:0o700});save(join(directory,'allocation.json'),{kind:'practical_grade_supplement_allocation_v1',recipe_digest:canonicalDigest(recipe),runtime_digest:runtime.digest,original_attempt_id:a.id});
  save(join(directory,'recipe.json'),recipe);save(join(directory,'definition.json'),definition);
  const result=await runtime.grade(job,{root:join(directory,'execution')});checkedRecipe(recipe,{held:true});return finishSupplement(directory,job,runtime,result);
 }finally{for(const unlock of unlocks.reverse())unlock();}
}
function checkStoredReceipt(receipt,recipe,job,runtime){
 assert.equal(receipt.recipe_digest,canonicalDigest(recipe));assert.equal(receipt.runtime_digest,runtime.digest);assert.equal(receipt.request_digest,canonicalDigest(job));
 assert.equal(receipt.result_digest,canonicalDigest(receipt.result));assert.ok(same(receipt.recipe,recipe));
 if(receipt.allocation_only){const allocation=json(join(receipt.directory,'allocation.json'));assert.equal(allocation.recipe_digest,receipt.recipe_digest);assert.equal(allocation.runtime_digest,runtime.digest);assert.equal(receipt.closed,false);assert.equal(receipt.quality,null);assert.equal(receipt.result.status,'unknown');return;}
 if(receipt.inspection_error){
  const previous=checkedRef(receipt.previous_receipt);assert.equal(previous.closed,false);checkStoredReceipt(previous,recipe,job,runtime);assert.equal(receipt.closed,false);assert.equal(receipt.quality,null);
  if(receipt.rejected_observation)verifyRef(receipt.rejected_observation);if(receipt.inspection_observer_definition){const d=checkedRef(receipt.inspection_observer_definition);assert.equal(d.commands.grade.model_calls,false);}
  if(receipt.inspection_transport){const t=checkedRef(receipt.inspection_transport);assert.equal(t.request_digest,receipt.inspection_request_digest);}else assert.equal(receipt.inspection_no_dispatch,true);
  return;
 }
 if(receipt.observation){
  const recorded=checkedRef(receipt.observation),q=checkedRef(receipt.observation_request);assert.equal(recorded.request_digest,canonicalDigest(q));assert.equal(recorded.output.original_request_digest,canonicalDigest(job));
  assert.equal(recorded.output.original_receipt_digest,receipt.previous_receipt.digest);assert.ok(same(recorded.output.result,receipt.result),'closure observation result drift');
  const previous=checkedRef(receipt.previous_receipt);assert.equal(previous.closed,false);checkStoredReceipt(previous,recipe,job,runtime);
  if(receipt.closure_observation){const witness=validateClosureOnlyObservation({recorded,request:q,previous,reference:receipt.previous_receipt,directory:receipt.directory,admissionImplementation:receipt.closure_observation.admission_implementation});assert.ok(same(receipt.closure_observation,witness));assert.equal(receipt.closed,true);assert.equal(receipt.quality,null);}return;
 }
 const directory=join(receipt.directory,'execution/jobs',canonicalDigest(job).slice(7)),raw=json(join(directory,'result.json')),transportPath=join(directory,'transport.json');let effective=raw;
 if(existsSync(transportPath)){const transport=json(transportPath);assert.equal(transport.request_digest,canonicalDigest(job));if(transport.exit_code!==0||transport.signal!==null)effective={...raw,status:'failed',output:{...raw.output,transport}};}
 assert.ok(same(effective,receipt.result),'supplement result/receipt drift');
}
// A separately pinned observer may establish that a failed local guard never
// dispatched its provider. It cannot change the failed result or supply quality.
function validateClosureOnlyObservation({recorded,request,previous,reference,directory,admissionImplementation=null}){
 assert.equal(previous.closed,false);assert.equal(previous.quality,null);assert.equal(previous.result.status,'failed');
 assert.equal(recorded.status,'completed');assert.equal(recorded.request_digest,canonicalDigest(request));
 const input=request.input,out=recorded.output,witness=out.closure_observation;
 assert.ok(Number.isSafeInteger(input.inspection_index)&&input.inspection_index>=0&&input.inspection_index<256);
 const current=join(directory,'observations',String(input.inspection_index).padStart(6,'0')),observedJob=join(current,'execution/jobs',canonicalDigest(request).slice(7));
 assert.equal(input.observer_definition.path,join(current,'observer-definition.json'));
 assert.ok(same(json(join(observedJob,'request.json')),request)&&same(json(join(observedJob,'result.json')),recorded),'observer native result drift');
 const observerTransport=ref(join(observedJob,'transport.json')),observedTransport=checkedRef(observerTransport);assert.equal(observedTransport.request_digest,canonicalDigest(request));assert.equal(observedTransport.exit_code,0);assert.equal(observedTransport.signal,null);
 assert.equal(input.inspection_only,true);assert.equal(input.original_receipt.digest,reference.digest);assert.equal(input.original_receipt.path,reference.path);
 const definition=checkedRef(input.observer_definition);assert.equal(definition.commands.grade.model_calls,false);assert.deepEqual(Object.keys(definition.commands),['grade']);
 assert.equal(input.observer_runtime_digest,createReferenceScoringCommandRuntime({definition,modelCallsAuthorized:false}).digest);
 const native=join(directory,'execution/jobs',previous.request_digest.slice(7));
 for(const [name,file]of [['original_allocation',join(directory,'allocation.json')],['original_native_request',join(native,'request.json')],['original_native_result',join(native,'result.json')],['original_native_transport',join(native,'transport.json')]]){
  assert.equal(input[name].path,file);verifyRef(input[name]);assert.ok(same(witness?.[name],input[name]),'closure source binding drift');
 }
 assert.equal(canonicalDigest(checkedRef(input.original_native_request)),previous.request_digest);
 assert.ok(same(checkedRef(input.original_native_result),previous.result),'only an unchanged failed native result can be observed');
 const allocation=checkedRef(input.original_allocation);assert.equal(allocation.recipe_digest,previous.recipe_digest);assert.equal(allocation.runtime_digest,previous.runtime_digest);assert.equal(allocation.original_attempt_id,previous.attempt_id);
 const transport=checkedRef(input.original_native_transport);assert.equal(transport.request_digest,previous.request_digest);assert.equal(transport.exit_code,0);assert.equal(transport.signal,null);
 assert.equal(out.original_request_digest,previous.request_digest);assert.equal(out.original_receipt_digest,reference.digest);
 for(const key of ['model_calls','task_calls','primary_calls'])assert.equal(out[key],0,'closure observation must not execute models or tasks');
 assert.ok(same(out.result,previous.result),'closure observer must preserve the original failed result');
 assert.equal(witness.kind,'verified_pre_dispatch_rejection_v1');assert.equal(witness.no_provider_dispatch,true);assert.equal(witness.local_termination_confirmed,true);
 assert.ok(typeof witness.reason==='string'&&witness.reason.trim()&&witness.reason.length<=4096);
 assert.ok(Number.isFinite(witness.duration_ms)&&witness.duration_ms>=0);
 assert.ok(Array.isArray(witness.evidence_refs)&&witness.evidence_refs.length&&witness.evidence_refs.length<=32);
 const pins=previous.recipe.binding.grader_pins;
 for(const evidence of witness.evidence_refs){verifyRef(evidence);assert.ok(evidence.path.startsWith(native+'/')||pins.some(p=>p.path===evidence.path&&p.digest===evidence.digest),'closure evidence outside bound native execution or original grader pins');}
 const control=admissionImplementation??ref(fileURLToPath(import.meta.url));verifyRef(control);
 return {...copy(witness),observer_definition:copy(input.observer_definition),observer_runtime_digest:input.observer_runtime_digest,observer_transport:observerTransport,admission_implementation:copy(control),model_calls:0,task_calls:0,primary_calls:0};
}
function finishSupplement(directory,job,runtime,result,{outputPath=join(directory,'receipt.json'),observation=null,closureObservation=null}={}){
 if(!['completed','failed','interrupted'].includes(result?.status)&&!observation)return {status:'pending',directory,additional_dispatch_permitted:false};
 const o=result.output??{},recipe=job.input.recipe,closed=closureObservation!==null||o.ready_for_next_root===true&&o.provider_terminal_confirmed===true&&o.process_group_closed===true;
 let quality=null,issue=null;
 try{
  assert.equal(result.status,'completed','failed verification supplies no authoritative quality');
  assert.equal(result.request_digest,canonicalDigest(job));assert.equal(o.recipe_digest,canonicalDigest(recipe));assert.equal(o.original_result_digest,recipe.original_result_digest);assert.equal(o.grading_contract_digest,canonicalDigest(recipe.binding));
  assert.equal(o.model_calls,1);assert.equal(o.task_calls,0);assert.equal(o.primary_calls,0);assert.equal(o.model,recipe.binding.model);assert.equal(o.reasoning,recipe.binding.reasoning);
  for(const r of o.artifacts??[]){assert.ok(typeof r.path==='string'&&!r.path.startsWith('/')&&!r.path.split('/').some(p=>!p||p==='.'||p==='..'));assert.equal(ref(join(directory,'execution/jobs',canonicalDigest(job).slice(7),r.path)).digest,r.digest);}
  quality=validatePracticalQualityObservation(o.quality_observation,o.artifacts);assert.equal(quality.scope,'source_reference','source supplement cannot certify runtime acceptance');
 }catch(error){quality=null;issue=String(error.message).slice(0,2048);}
 const receipt={kind:'practical_grade_supplement_receipt_v1',recipe_digest:canonicalDigest(recipe),runtime_digest:runtime.digest,request_digest:canonicalDigest(job),result_digest:canonicalDigest(result),
  original_result_digest:recipe.original_result_digest,attempt_id:recipe.attempt_id,closed,quality,issue,result:copy(result),recipe:copy(recipe),directory};
 if(observation)Object.assign(receipt,observation);if(closureObservation)receipt.closure_observation=copy(closureObservation);
 save(outputPath,receipt);return {receipt,reference:ref(outputPath)};
}

export async function inspectPracticalGradeSupplement({reference,recipe:allocatedRecipe=null,definition:allocatedDefinition=null,observerDefinition=null}){
 if(observerDefinition){assert.deepEqual(Object.keys(observerDefinition.commands??{}),['grade']);assert.equal(observerDefinition.commands.grade.model_calls,false,'closure observer must be model-free');createReferenceScoringCommandRuntime({definition:observerDefinition,modelCallsAuthorized:false});}
 if(!reference){
  assert.ok(allocatedRecipe&&allocatedDefinition,'provide the consumed recipe/provider or an existing receipt');const recipe=allocatedRecipe,{a}=checkedRecipe(recipe),directory=slotPath(recipe.run_root,a);
  if(existsSync(directory)&&!existsSync(join(directory,'allocation.json')))return {status:'requires_inspection',directory,reason:'reservation_metadata_missing',additional_dispatch_permitted:false};
  const allocation=json(join(directory,'allocation.json'));
  const runtime=createReferenceScoringCommandRuntime({definition:allocatedDefinition,modelCallsAuthorized:false});assert.equal(allocation.recipe_digest,canonicalDigest(recipe));assert.equal(allocation.runtime_digest,runtime.digest);
  const roots=[...new Set([recipe.run_root,...coordinatorRoots(recipe.run_root,recipe.contract)])].sort(),unlocks=[];let observed;
  try{
   for(const root of roots)unlocks.push(lockRunJournal(root));checkedRecipe(recipe,{held:true});
   for(const [name,value]of [['recipe.json',recipe],['definition.json',allocatedDefinition]]){const p=join(directory,name);if(existsSync(p))assert.ok(same(json(p),value));else save(p,value);}
   observed=inspectSlot(directory);
   if(!observed){const job={kind:'grade',input:{recipe,recipe_digest:canonicalDigest(recipe),maximum_model_calls:1,task_calls:0,primary_calls:0}},result=await runtime.inspect(job,{root:join(directory,'execution')});
    observed=finishSupplement(directory,job,runtime,result);
    if(!observed.reference){const unknown={request_digest:canonicalDigest(job),status:'unknown',output:{}},receipt={kind:'practical_grade_supplement_receipt_v1',recipe_digest:canonicalDigest(recipe),runtime_digest:runtime.digest,request_digest:canonicalDigest(job),result_digest:canonicalDigest(unknown),original_result_digest:recipe.original_result_digest,attempt_id:recipe.attempt_id,closed:false,quality:null,issue:'Consumed reservation: dispatch/provider outcome remains unknown; inspect only.',result:unknown,recipe:copy(recipe),directory,allocation_only:true};save(join(directory,'receipt.json'),receipt);observed={receipt,reference:ref(join(directory,'receipt.json'))};}
   }
  }finally{for(const unlock of unlocks.reverse())unlock();}
  if(observed.receipt.closed)return observed;return inspectPracticalGradeSupplement({reference:observed.reference,observerDefinition});
 }
 const old=checkedRef(reference),recipe=old.recipe;checkedRecipe(recipe);assert.equal(old.closed,false,'closed verification cannot be regraded by inspection');
 const {a}=checkedRecipe(recipe),directory=slotPath(recipe.run_root,a);assert.equal(old.directory,directory);const definition=json(join(directory,'definition.json')),command=definition.commands.grade;
 const originalRuntime=createReferenceScoringCommandRuntime({definition,modelCallsAuthorized:false}),originalJob={kind:'grade',input:{recipe,recipe_digest:canonicalDigest(recipe),maximum_model_calls:1,task_calls:0,primary_calls:0}};
 const validateOriginal=()=>{checkStoredReceipt(old,recipe,originalJob,originalRuntime);assert.ok(same(inspectSlot(directory).reference,reference),'inspect the latest canonical retained closure observation');
  const allocation=json(join(directory,'allocation.json'));assert.equal(allocation.recipe_digest,old.recipe_digest);assert.equal(allocation.runtime_digest,old.runtime_digest);assert.equal(allocation.original_attempt_id,old.attempt_id);};validateOriginal();
 if(!observerDefinition&&!command.inspect_argv)return {status:'pending',reason:'provider_has_no_read_only_inspector',additional_dispatch_permitted:false};
 const roots=[...new Set([recipe.run_root,...coordinatorRoots(recipe.run_root,recipe.contract)])].sort(),unlocks=[];
 try{
  for(const root of roots)unlocks.push(lockRunJournal(root));checkedRecipe(recipe,{held:true});validateOriginal();
  const history=join(directory,'observations');mkdirSync(history,{recursive:true,mode:0o700});const names=readdirSync(history).sort();assert.ok(names.length<256);assert.ok(names.every((v,i)=>v===String(i).padStart(6,'0')),'inspection sequence drift');
  const pending=names.find(name=>!existsSync(join(history,name,'receipt.json')));assert.ok(!pending||pending===names.at(-1),'inspection history gap');
  const index=pending?Number(pending):names.length,current=join(history,String(index).padStart(6,'0'));if(!pending)mkdirSync(current,{mode:0o700});
  const observerPath=join(current,'observer-definition.json'),neverDispatched=pending&&readdirSync(current).length===0;
  if(pending&&existsSync(observerPath))assert.ok(observerDefinition,'pending inspection kind cannot change');
  if(pending&&!existsSync(observerPath)&&observerDefinition)assert.deepEqual(readdirSync(current),[],'nonempty pending inspection kind cannot change');
  if(observerDefinition){if(existsSync(observerPath))assert.ok(same(json(observerPath),observerDefinition),'pending observer cannot change');else save(observerPath,observerDefinition);}
  const inspector=createReferenceScoringCommandRuntime({definition:observerDefinition??{commands:{grade:{argv:command.inspect_argv,pins:command.pins,model_calls:false}}},modelCallsAuthorized:false});
  const native=join(directory,'execution/jobs',canonicalDigest(originalJob).slice(7));
  const sourceBinding=observerDefinition?{observer_definition:ref(observerPath),observer_runtime_digest:inspector.digest,
   original_allocation:ref(join(directory,'allocation.json')),original_native_request:ref(join(native,'request.json')),original_native_result:ref(join(native,'result.json')),original_native_transport:ref(join(native,'transport.json'))}:{};
  const job={kind:'grade',input:{inspection_only:true,original_job:originalJob,original_receipt:reference,inspection_index:index,...sourceBinding}},jobDirectory=join(current,'execution/jobs',canonicalDigest(job).slice(7));
  const result=pending&&!neverDispatched?await inspector.inspect(job,{root:join(current,'execution')}):await inspector.grade(job,{root:join(current,'execution')});checkedRecipe(recipe,{held:true});validateOriginal();
  if(result.status!=='completed'){
   const transport=join(jobDirectory,'transport.json'),noDispatch=!existsSync(jobDirectory);if(!existsSync(transport)&&!noDispatch)return {status:'pending',directory:current,additional_dispatch_permitted:false};
   const {allocation_only,observation,observation_request,previous_receipt,inspection_error,inspection_transport,inspection_no_dispatch,inspection_request_digest,inspection_model_calls,...base}=copy(old);
   const receipt={...base,closed:false,quality:null,issue:'Read-only closure inspection failed; original provider closure still unknown.',previous_receipt:reference,inspection_error:true,
    inspection_request_digest:canonicalDigest(job),...(existsSync(transport)?{inspection_transport:ref(transport)}:{inspection_no_dispatch:true}),inspection_model_calls:0};
   save(join(current,'receipt.json'),receipt);return {receipt,reference:ref(join(current,'receipt.json'))};
  }
  let closureObservation=null;
  try{
   assert.equal(result.output?.original_request_digest,canonicalDigest(originalJob));assert.equal(result.output?.original_receipt_digest,reference.digest);
   assert.equal(result.output?.model_calls,0,'inspection cannot start another model');assert.equal(result.output?.task_calls,0);assert.equal(result.output?.primary_calls,0);
   closureObservation=observerDefinition?validateClosureOnlyObservation({recorded:result,request:job,previous:old,reference,directory}):null;
  }catch(error){
   if(!observerDefinition)throw error;
   const {allocation_only,observation,observation_request,previous_receipt,inspection_error,inspection_transport,inspection_no_dispatch,inspection_request_digest,inspection_model_calls,rejected_observation,inspection_observer_definition,...base}=copy(old);
   const receipt={...base,closed:false,quality:null,issue:'Closure-only observer was rejected: '+String(error.message).slice(0,1800),previous_receipt:reference,inspection_error:true,
    inspection_request_digest:canonicalDigest(job),inspection_transport:ref(join(jobDirectory,'transport.json')),inspection_model_calls:0,
    rejected_observation:ref(join(jobDirectory,'result.json')),inspection_observer_definition:ref(observerPath)};
   save(join(current,'receipt.json'),receipt);return {receipt,reference:ref(join(current,'receipt.json'))};
  }
  return finishSupplement(directory,originalJob,originalRuntime,result.output.result,{outputPath:join(current,'receipt.json'),closureObservation,observation:{previous_receipt:reference,
   observation:ref(join(jobDirectory,'result.json')),observation_request:ref(join(jobDirectory,'request.json')),inspection_model_calls:0}});
 }finally{for(const unlock of unlocks.reverse())unlock();}
}

function receiptInput(reference,options={}){
 const r=checkedRef(reference);assert.equal(r.kind,'practical_grade_supplement_receipt_v1');const {s,a}=checkedRecipe(r.recipe,options);
 const slot=slotPath(r.recipe.run_root,a);assert.equal(r.directory,slot);assert.ok(reference.path===join(slot,'receipt.json')||new RegExp('^'+slot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/observations/[0-9]{6}/receipt\\.json$','u').test(reference.path),'supplement receipt transplanted outside canonical slot');
 const definition=json(join(r.directory,'definition.json')),runtime=createReferenceScoringCommandRuntime({definition,modelCallsAuthorized:false});
 const job={kind:'grade',input:{recipe:r.recipe,recipe_digest:canonicalDigest(r.recipe),maximum_model_calls:1,task_calls:0,primary_calls:0}};
 checkStoredReceipt(r,r.recipe,job,runtime);assert.equal(r.closed,true,'supplement provider completion unresolved');
 if(r.quality){const q=validatePracticalQualityObservation(r.quality,r.result.output.artifacts);assert.equal(q.scope,'source_reference');assert.ok(same(q,r.result.output.quality_observation));}
 return {r,s,a};
}
function effectiveResult(a,r){
 const out=copy(a.result.output);out.quality_observation=copy(r.quality);out.quality_observation_issue=null;
 out.grade={...out.grade,provider_observation:{...out.grade.provider_observation,artifacts:copy(r.result.output.artifacts)}};
 return {...copy(a.result),output:out};
}
export function practicalGradeSupplementSelectionPacket(reference,options={}){
 const {r,s,a}=receiptInput(reference,options);assert.ok(r.quality,'unusable supplement cannot receive a new quality disposition');
 const result=effectiveResult(a,r),packet=buildInstructionRecoveryPacket({policy:s.plan.recovery,job:a.job,result,logicalRow:a.row,retriesUsed:(s.counts?.[JSON.stringify([a.row.block_id,a.row.condition])]??1)-1,extraTrialsUsed:s.extra_trials??0,retrySupported:false});
 return {...packet,allowed_actions:packet.allowed_actions.filter(v=>['use','reference','exclude'].includes(v)),retry_available:false,
  supplement_reference:copy(reference),original_result_digest:r.original_result_digest,original_assessment:copy(a.assessment??null),
  goal:'Judge this new retained-source verification, preserving the original disposition and its reasons. This is not a Task retry or runtime certification.'};
}
const selectionPath=(r,digest)=>join(r.directory,'selections',digest.slice(7),'selection.json');
export function recordPracticalGradeSupplementSelection({reference,assessment}){
 const {r}=receiptInput(reference),packet=practicalGradeSupplementSelectionPacket(reference);validateInstructionRecoveryAssessment(packet,assessment);
 assert.ok(['use','reference','exclude'].includes(assessment.action));
 const value={supplement_digest:reference.digest,assessment:copy(assessment),execution:{kind:'host_ai',model_calls:null,usage:null,usage_status:'not_collected'}};
 const path=selectionPath(r,reference.digest);assertNoSymlinkPathSegments(path,'supplement disposition',{allowMissingLeaf:true});mkdirSync(dirname(path),{recursive:true,mode:0o700});
 if(existsSync(path))assert.ok(same(json(path),value),'supplement disposition already consumed; retain the original choice');else save(path,value);
 return {selection:value,reference:ref(path)};
}
function sumResource(values){const known=values.filter(v=>Number.isFinite(v)&&v>=0);return {known_total:known.length?known.reduce((a,b)=>a+b,0):null,observed_count:known.length,unknown_count:values.length-known.length};}
function consumedSnapshot(root){
 const store=practicalGradeSupplementStore(root);return readdirSync(store).filter(name=>/^[a-f0-9]{64}$/u.test(name)).sort().map(name=>{
  const directory=join(store,name);assertNoSymlinkPathSegments(directory,'consumed grade slot');
  return {directory,allocation:existsSync(join(directory,'allocation.json'))?ref(join(directory,'allocation.json')):null,observation:inspectSlot(directory)?.reference??null};
 });
}
function executionLedger(root,snapshot,options={}){
 const s=readRunJournal(root).state,seen=new Set();return snapshot.map(entry=>{
  assert.deepEqual(Object.keys(entry).sort(),['allocation','directory','observation']);assert.ok(!seen.has(entry.directory));seen.add(entry.directory);
  const a=s.attempts.find(a=>slotPath(root,a)===entry.directory);assert.ok(a,'foreign consumed grade slot');let allocation=null,r=null;
  if(entry.allocation){assert.equal(entry.allocation.path,join(entry.directory,'allocation.json'));allocation=checkedRef(entry.allocation);assert.equal(allocation.original_attempt_id,a.id);}
  if(entry.observation){
   r=checkedRef(entry.observation);assert.equal(r.directory,entry.directory);assert.equal(r.recipe.run_root,root);assert.equal(r.attempt_id,a.id);checkedRecipe(r.recipe,options);
   assert.ok(entry.observation.path===join(entry.directory,'receipt.json')||new RegExp('^'+entry.directory.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/observations/[0-9]{6}/receipt\\.json$','u').test(entry.observation.path));
   assert.equal(r.recipe_digest,allocation.recipe_digest);const definition=json(join(entry.directory,'definition.json')),runtime=createReferenceScoringCommandRuntime({definition,modelCallsAuthorized:false});assert.equal(runtime.digest,allocation.runtime_digest);
   const job={kind:'grade',input:{recipe:r.recipe,recipe_digest:canonicalDigest(r.recipe),maximum_model_calls:1,task_calls:0,primary_calls:0}};checkStoredReceipt(r,r.recipe,job,runtime);
  }
  return {attempt_id:a.id,slot:entry.directory,allocation:copy(entry.allocation),observation:copy(entry.observation),closed:r?.closed??false,issue:r?.issue??'Consumed reservation; provider evidence unavailable.',execution:copy(r?.result?.output??null)};
 });
}
export function buildPracticalGradeSupplementReport(input){return buildSupplementReport(input);}
function buildSupplementReport({runRoot,supplements,selections=[]},historicalSnapshot=null,options={}){

 const root=rootPath(runRoot),base=readRunJournal(root).state;assert.equal(base.status,'completed');assert.ok(Array.isArray(supplements)&&supplements.length<=256);assert.ok(Array.isArray(selections)&&selections.length<=supplements.length);
 assert.ok(supplements.length,'explicit supplement references required');const first=checkedRef(supplements[0]),cycleRoot=first.recipe.contract.parent.cycle_root,cycleState=readRunJournal(cycleRoot).state,cycleReport=cycleState.outputs.original_report??cycleState.outputs.report;
 const {measured_context,...normalized}=cycleReport??{};assert.ok(same(normalized,base.report),'parent report differs from original practical result');
 const report=copy(cycleReport),seen=new Set(),ledger=[];assert.equal(report.kind,'practical_evaluation_run_report_v1');
 for(const reference of supplements){
  const {r,s,a}=receiptInput(reference,options);assert.equal(r.recipe.run_root,root);assert.ok(!seen.has(a.id),'duplicate supplement for original attempt');seen.add(a.id);
  const target=report.all_attempts.find(v=>v.id===a.id);assert.ok(target,'original report omitted the attempt');assert.ok(same(target.row,a.row)&&same(target.original_result,a.result));assert.equal(target.result_digest,canonicalDigest(a.result),'original report result drift');
  const selection=selections.find(v=>v.supplement_digest===reference.digest);assert.ok(selections.filter(v=>v.supplement_digest===reference.digest).length<=1,'multiple supplement dispositions');
  const entry={reference:copy(reference),attempt_id:a.id,original_result_digest:canonicalDigest(a.result),original_disposition:copy(a.assessment??null),quality:copy(r.quality),issue:r.issue,
   execution:copy(r.result.output),assessment:selection?copy(selection):null,included_in_comparison:target.included_in_comparison};
  if(selection){
   assert.ok(r.quality,'cannot select missing quality');const packet=practicalGradeSupplementSelectionPacket(reference,options);validateInstructionRecoveryAssessment(packet,selection.assessment);
   assert.ok(['use','reference','exclude'].includes(selection.assessment.action));
   assert.equal(selection.execution?.kind,'host_ai','this port accepts host-AI selections, not unrecorded extra model dispatch');
   assert.equal(selection.execution.model_calls,null);assert.equal(selection.execution.usage,null);assert.equal(selection.execution.usage_status,'not_collected');
   assert.ok(same(json(selectionPath(r,reference.digest)),selection),'use the once-only recorded supplement disposition');
   const use=selection.assessment.action==='use';
   if(use)assert.ok(!report.all_attempts.some(v=>v.id!==a.id&&v.row.block_id===a.row.block_id&&v.row.condition===a.row.condition&&v.included_in_comparison),'cannot replace another selected attempt');
   target.original_included_in_comparison=target.included_in_comparison;target.included_in_comparison=use;
   target.original_quality_observation=copy(target.quality_observation);target.original_observation=copy(target.observation);
   target.quality_observation=copy(r.quality);target.grade_supplement=copy(reference);target.supplemental_assessment=copy(selection.assessment);
   target.effective_result_digest=canonicalDigest({original_result_digest:target.result_digest,supplement:reference,assessment:selection});
   target.observation.outcome=r.quality.scope==='source_reference'&&r.quality.outcome==='pass'?'unknown':r.quality.outcome;
   target.observation.evidence_refs=[...target.observation.evidence_refs,'grade-supplement:'+reference.digest];entry.included_in_comparison=use;
  }
  ledger.push(entry);
 }
 assert.ok(selections.every(v=>supplements.some(r=>r.digest===v.supplement_digest)),'foreign supplement selection');
 report.pragmatic=buildPragmaticEvaluationReport({kind:'ask_pragmatic_evaluation_notes_v1',evidence_kind:base.plan.evidence_kind,condition_ids:base.plan.conditions.map(v=>v.id),
  planned_blocks:[...new Set(base.rows.map(v=>v.block_id))],trials:report.all_attempts.filter(v=>v.included_in_comparison).map(v=>v.observation),global_context:base.plan.global_context,
  next_improvement:'Review the original and supplemented judgments, costs and limitations before a fresh human change decision.'});
 report.original_report_digest=canonicalDigest(base.report);report.grade_supplement_ledger=ledger;
 const consumed_slots=historicalSnapshot??consumedSnapshot(root),executions=executionLedger(root,consumed_slots,options);report.supplement_execution_ledger=executions;
 report.supplemental_grading_overhead=supplementOverhead(executions);
 report.supplemental_assessment_overhead={kind:'host_ai',count:selections.length,model_calls:null,usage:null,usage_status:'not_collected',not_in_task_metrics:true};
 report.comparison_limits=[...(report.comparison_limits??[]),'Supplemental source judgments and fresh AI dispositions are separate from the original decisions. No runtime certification or inherited change approval.'];
 report.change_approval_required=true;report.application_performed=false;
 return {kind:'practical_grade_supplement_readout_v1',run_root:root,cycle_root:cycleRoot,original_cycle_report_digest:canonicalDigest(cycleReport),original_report_digest:canonicalDigest(base.report),original_journal_digest:readRunJournal(root).previous,
  report,report_digest:canonicalDigest(report),supplements:copy(supplements),selections:copy(selections),consumed_slots:copy(consumed_slots),inherited_change_approval:false,application_performed:false};
}
export function publishPracticalGradeSupplementReport(input){
 const readout=buildPracticalGradeSupplementReport(input),directory=join(practicalGradeSupplementStore(input.runRoot),'reports',canonicalDigest(readout).slice(7));
 assertNoSymlinkPathSegments(directory,'supplement report',{allowMissingLeaf:true});mkdirSync(directory,{recursive:true,mode:0o700});const output=join(directory,'readout.json');
 if(existsSync(output))assert.ok(same(json(output),readout),'supplement report drift');else save(output,readout);
 return {reference:ref(output),readout};
}
export function readPracticalGradeSupplementContinuation({reference,cycleRoot,originalReport,allowOwnedCoordinatorLocks=false}){
 const readout=checkedRef(reference);assert.equal(readout.kind,'practical_grade_supplement_readout_v1');assert.equal(readout.cycle_root,rootPath(cycleRoot));assert.equal(readout.original_cycle_report_digest,canonicalDigest(originalReport),'revision belongs to a different original report');
 const expected=buildSupplementReport({runRoot:readout.run_root,supplements:readout.supplements,selections:readout.selections},readout.consumed_slots,{allowOwnedCoordinatorLocks});assert.ok(same(readout,expected),'supplement report lineage drift');
 assert.equal(reference.path,join(practicalGradeSupplementStore(readout.run_root),'reports',canonicalDigest(readout).slice(7),'readout.json'),'revision is outside its canonical store');
 const cycle=readRunJournal(cycleRoot).state,attached=cycle.report_revision?.reference?.digest===reference.digest;
 if(attached)assert.ok(same(cycle.outputs.report,readout.report),'attached revision report drift');
 return {report:readout.report,provenance:{original_report_digest:canonicalDigest(originalReport),effective_report_digest:readout.report_digest,readout_digest:reference.digest,
  ledger_digest:canonicalDigest(readout.report.grade_supplement_ledger),selection_digest:canonicalDigest(readout.selections),human_decision_scope:attached?'explicit_revised_packet':'original_packet_only',approval_carried_forward:false}};
}

// A recorded admission is data authority for review/resume/feedback only.
// It grants no grading slot and does not revisit a completed provider or owner.
export function readAdmittedPracticalGradeSupplement({cycleRoot,reference}){
 const root=rootPath(cycleRoot),history=readRunJournal(root),state=history.state,marker=state?.report_revision;
 assert.ok(marker&&same(marker.reference,reference),'revision was not admitted to this cycle');assert.ok(Number.isSafeInteger(marker.index)&&marker.index>0&&marker.index<=256);
 const readout=checkedRef(reference);assert.equal(readout.kind,'practical_grade_supplement_readout_v1');assert.equal(readout.cycle_root,root);
 assert.equal(reference.path,join(practicalGradeSupplementStore(readout.run_root),'reports',canonicalDigest(readout).slice(7),'readout.json'),'revision is outside its canonical store');
 assert.equal(canonicalDigest(state.outputs.original_report),readout.original_cycle_report_digest);assert.equal(canonicalDigest(state.outputs.report),readout.report_digest);assert.ok(same(state.outputs.report,readout.report));
 const p=marker.provenance;assert.equal(p.original_report_digest,readout.original_cycle_report_digest);assert.equal(p.effective_report_digest,readout.report_digest);assert.equal(p.readout_digest,reference.digest);
 assert.equal(p.ledger_digest,canonicalDigest(readout.report.grade_supplement_ledger));assert.equal(p.selection_digest,canonicalDigest(readout.selections));assert.equal(p.human_decision_scope,'explicit_revised_packet');assert.equal(p.approval_carried_forward,false);
 const admission=history.events.find(e=>e.kind==='report_revision_received'&&same(e.state.report_revision,marker)&&same(e.state.outputs.original_report,state.outputs.original_report)&&same(e.state.outputs.report,readout.report));assert.ok(admission,'revision lacks its exact original admission event');
 return {report:copy(readout.report),provenance:copy(p),admission_journal_digest:admission.record_digest};
}

// Shared read-only precondition for distinct retained grading report contracts.
export {quiescent as assertPracticalGradeQuiescence};
export {coordinatorRoots as assertPracticalGradeCoordinators};
function supplementOverhead(executions){return {not_in_task_metrics:true,consumed_slots:executions.length,unclosed_slots:executions.filter(v=>!v.closed).length,model_calls:sumResource(executions.map(v=>v.execution?.model_calls)),duration_ms:sumResource(executions.map(v=>v.execution?.duration_ms)),
  resources:Object.fromEntries(['input_tokens','output_tokens','cached_tokens'].map(k=>[k,sumResource(executions.map(v=>{const m=v.execution?.metrics??{},value=m[k];return Number.isSafeInteger(value)&&value>=0&&!(k==='cached_tokens'&&Number.isSafeInteger(m.input_tokens)&&value>m.input_tokens)?value:null;}))])),complete_cost:null};}
export function snapshotPracticalGradeSupplementExecutions({runRoot,snapshot=null,...options}){
 const root=rootPath(runRoot),store=practicalGradeSupplementStore(root),consumed_slots=snapshot??(existsSync(store)?consumedSnapshot(root):[]);
 const executions=executionLedger(root,consumed_slots,options);return {consumed_slots:copy(consumed_slots),executions,overhead:supplementOverhead(executions)};
}

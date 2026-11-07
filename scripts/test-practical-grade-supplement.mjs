import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {appendRunJournal,readRunJournal} from './instruction-run-journal.mjs';
import {preparePracticalGradeSupplement,runPracticalGradeSupplement,inspectPracticalGradeSupplement,practicalGradeSupplementStore,practicalGradeSupplementSelectionPacket,buildPracticalGradeSupplementReport,publishPracticalGradeSupplementReport,recordPracticalGradeSupplementSelection,readPracticalGradeSupplementContinuation} from './practical-grade-supplement.mjs';
import {summarizeInstructionLoopEvaluation} from './instruction-loop-feedback.mjs';
import {prepareNextSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
const write=(p,v)=>{mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,JSON.stringify(v));};
const pin=p=>({path:p,digest:hash(readFileSync(p))});
const phase={ready_for_next_root:true,process_group_closed:true,provider_terminal_confirmed:true,exit_code:0};
function fixture(t,{emptyPin=false,modulePin=false}={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-grade-supplement-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));const root=join(dir,'run'),parent=join(dir,'operation/first-run');mkdirSync(root);mkdirSync(parent,{recursive:true});
 const settings=join(dir,'grader.json');write(settings,{config:{model:'synthetic',reasoning:'low'},backend:{kind:'synthetic'}});
 const workerFile=join(dir,'practical-worker.json'),publicInput=join(dir,'public.json');write(publicInput,{public:true});
 const files=[{source:publicInput,target:'public.json',digest:pin(publicInput).digest}],context={model:'synthetic',reasoning:'low',cli_version:'fixture',platform:'synthetic',global_context_ref:null};
 const capsuleRoot=join(dir,'capsules'),replyRoot=join(dir,'replies');mkdirSync(capsuleRoot);mkdirSync(replyRoot);
 write(settings,{kind:'host_business_practical_grader_v1',task_id:'case',fixture_id:'case',public_files:files,config:{model:'synthetic',reasoning:'low',capsuleRoot,replyRoot},backend:{kind:'synthetic'}});
 const row={id:'row',block_id:'case.r1',case_id:'case',condition:'baseline',repetition:1,public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))};
 const empty=join(dir,'empty-dependency.txt');if(emptyPin)writeFileSync(empty,Buffer.alloc(0));
 write(workerFile,{cases:{case:{files,grader:{argv:[process.execPath,'synthetic-grader',settings,pin(settings).digest],pins:[pin(settings),...(emptyPin?[pin(empty)]:[]),...(modulePin?[{...pin(publicInput),module:'synthetic_fixed_dependency'}]:[])],model_calls:false}}}});
 const runtime={commands:{trial:{argv:[process.execPath,join(dir,'practical-evaluation-worker.mjs'),workerFile,pin(workerFile).digest],pins:[pin(workerFile)],model_calls:false}}};
 const plan={runtime_digest:canonicalDigest(runtime),goal:'Preserve quality with useful evidence.',evidence_kind:'synthetic',recovery:{max_extra_trials:0,max_retries_per_row:1,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration','usage','quality']},conditions:[{id:'baseline',context},{id:'candidate',context}],cases:[{id:'case',public_input_digest:row.public_input_digest,success_criteria_ref:'fixture-rule'}],global_context:{ask_presence:'unknown',change_status:'unknown'}};
 const job={kind:'trial',key:'fixture',input:{row,condition_context:context}},id='fixture-attempt-1',jobRoot=join(root,'jobs',canonicalDigest(job).slice(7));mkdirSync(jobRoot,{recursive:true});
 write(join(jobRoot,'grade-summary.json'),{kind:'host_practical_grade_v1',terminal:true,fixed_reference:null,issue:'ValueError: synthetic consistency failure',calls:[{role:'primary',terminal:true,completed:true}]});
 write(join(jobRoot,'private-grade/dispatch.json'),{maximum_grading_calls:2,trial_id:canonicalDigest(job),task_id:'case',fixture_id:'case'});
 const session='fixture-primary',text='{"fixture_judgment":true}',capsule='a'.repeat(32),source={retained:'original'};
 write(join(jobRoot,'private-grade/primary-backend.json'),{terminal:true,completed:true,text,session_id:session});
 for(const base of [join(jobRoot,'workspace'),join(jobRoot,'private-grade/submission'),join(jobRoot,'private-grade/packet/service/candidate'),join(jobRoot,'private-grade/packet/judge/candidate')])write(join(base,'answer.json'),source);
 write(join(jobRoot,'workspace/public.json'),{public:true});write(join(jobRoot,'private-grade/packet/judge/assessment/rules.json'),{fixed:true});
 write(join(capsuleRoot,capsule,'inputs/candidate/answer.json'),source);write(join(capsuleRoot,capsule,'inputs/assessment/rules.json'),{fixed:true});
 mkdirSync(join(replyRoot,capsule),{recursive:true});writeFileSync(join(replyRoot,capsule,'reply.json'),text);writeFileSync(join(replyRoot,capsule,'stdout.jsonl'),JSON.stringify({type:'thread.started',thread_id:session})+'\n'+JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}})+'\n');
 const sourceDigest=pin(join(jobRoot,'workspace/answer.json')).digest;
 write(join(jobRoot,'private-grade/packet/packet.json'),{task_id:'case',candidate_digest:canonicalDigest('retained-source'),policy_digest:canonicalDigest('rules'),candidate_inventory:[{path:'answer.json',sha256:sourceDigest.slice(7),mode:'100644'}]});
 write(join(jobRoot,'private-grade/capture-scope.json'),{source_executed:false,public_input_unchanged:true,files:[{path:'answer.json',digest:sourceDigest,mode:420}]});
 const quality={kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'unknown',evidence_refs:[],fixed_reference:null};
 const result={request_digest:canonicalDigest(job),status:'completed',output:{...phase,execution_completed:true,context_integrity:'preserved',evidence_root:jobRoot,task:{...phase},grade:{...phase,duration_ms:20,provider_observation:{artifacts:[{path:'grade-summary.json',digest:pin(join(jobRoot,'grade-summary.json')).digest}]}},quality_observation:quality,cli_seconds:1,root_usage:{input_tokens:5,output_tokens:2,cached_input_tokens:0}}};
 write(join(jobRoot,'request.json'),job);write(join(jobRoot,'result.json'),result);write(join(jobRoot,'transport.json'),{request_digest:canonicalDigest(job),exit_code:0,signal:null});
 const attempt={id,job,row,cohort:1,result,assessment:{action:'reference',selection_basis:'missing_evidence'}};
 const observation={block_id:row.block_id,condition:row.condition,execution_state:'completed',outcome:'unknown',evidence_refs:['original-check'],local_assets_ref:null,...context,task_ref:'task',input_ref:'input',success_criteria_ref:'fixture-rule',metrics:{duration_ms:1000,input_tokens:5,output_tokens:2,cached_tokens:0,human_review_minutes:null,rework_minutes:null}};
 const reportAttempt={id,row,cohort:1,original_result:result,result_digest:canonicalDigest(result),included_in_comparison:false,observation,quality_observation:quality};
 const state={status:'completed',active:null,recovery:null,suspended:false,evaluation_decision:{disposition:'approved',packet_digest:canonicalDigest('human-cases')},plan,attempts:[attempt],rows:[row],report:{kind:'practical_evaluation_run_report_v1',execution_suspended:false,all_attempts:[reportAttempt],resources_all_attempts:{duration_ms:{known_total:1000,observed_count:1,unknown_count:0}},comparison_limits:['Original quality was unavailable.'],application_performed:false},selected:{},assessments:[],counts:{},extra_trials:0};appendRunJournal(root,'synthetic-completed',state);
 const operation=join(dir,'operation');mkdirSync(operation,{recursive:true});const profile=join(dir,'profile.json'),configuration=join(dir,'config.json');
 const basePolicy={kind:'reference_instruction_loop_v1',id:'old-cycle',observation:{goal:'Synthetic feedback.'},catalog:[{id:'case',public_input_digest:row.public_input_digest}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:null,formal_admission_implied:false};
 write(profile,{kind:'full_practical_instruction_loop_profile_v1',practical:{root},policy:basePolicy});const parentRuntime={profile_path:profile,profile_digest:pin(profile).digest},parentPolicy={...basePolicy,runtime_digest:canonicalDigest(parentRuntime)};write(configuration,{runtime:parentRuntime,policy:parentPolicy});
 appendRunJournal(parent,'synthetic-parent',{status:'awaiting_change_approval',pending:null,policy:parentPolicy,outputs:{select:{practical_root:root,practical_runtime:runtime},report:{...state.report,measured_context:'Synthetic scope.'}}});appendRunJournal(operation,'synthetic-operation',{status:'awaiting_change_approval',current:{root:parent},preparation:null,binding:{profile_path:profile,profile_digest:pin(profile).digest,config_path:configuration,config_digest:canonicalDigest(JSON.parse(readFileSync(configuration)))}});
 const contract={kind:'practical_grade_recovery_contract_v1',original_runtime:runtime,grader_settings:pin(settings),parent:{operation_root:operation,cycle_root:parent}};
 const recipe=()=>preparePracticalGradeSupplement({runRoot:root,attemptId:id,contract});
 const provider=join(dir,'provider.mjs'),counter=join(dir,'count.json');
 writeFileSync(provider,`import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};import{readFileSync,writeFileSync}from'node:fs';import{join,dirname}from'node:path';import{createHash}from'node:crypto';const [requestPath,resultPath]=process.argv.slice(2),q=JSON.parse(readFileSync(requestPath));writeFileSync(${JSON.stringify(counter)},'called',{flag:'wx'});const r=q.input.recipe,h=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x,Object.keys(x).sort())).digest('hex');writeFileSync(resultPath,JSON.stringify({request_digest:canonicalDigest(q),status:'completed',output:{ready_for_next_root:true}}));`);
 const definition={commands:{grade:{argv:[process.execPath,provider],pins:[pin(provider),pin(settings)],model_calls:false}}};
 return {dir,root,parent,id,state,jobRoot,contract,recipe,definition,counter,provider,settings,parentPolicy,mutate:fn=>{fn(state);appendRunJournal(root,'synthetic-change',state);}};
}
function usableProvider(f){
 const fixed={kind:'fixed_point_reference_summary_v1',exact_lower:'1',exact_upper:'1',scale_maximum:'10',mandatory_compliance:false,observation_completeness_reported:false,runtime_acceptance_verified:null,critical_status:'none_observed',partial_items:1,undetermined_items:0,formal_admission:false,evidence_truth_checked:false,capture_complete:false};
 writeFileSync(f.provider,`import{readFileSync,writeFileSync}from'node:fs';import{join,dirname}from'node:path';import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};import{instructionBytesDigest as hash}from ${JSON.stringify(new URL('./instruction-environment.mjs',import.meta.url).href)};const [a,b]=process.argv.slice(2),q=JSON.parse(readFileSync(a)),recipe=q.input.recipe;writeFileSync(${JSON.stringify(f.counter)},'called',{flag:'wx'});const path=join(dirname(b),'grade.json'),fixed=${JSON.stringify(fixed)};writeFileSync(path,JSON.stringify({fixed_reference:fixed}));const artifacts=[{path:'grade.json',digest:hash(readFileSync(path))}];writeFileSync(b,JSON.stringify({request_digest:canonicalDigest(q),status:'completed',output:{ready_for_next_root:true,provider_terminal_confirmed:true,process_group_closed:true,recipe_digest:canonicalDigest(recipe),original_result_digest:recipe.original_result_digest,grading_contract_digest:canonicalDigest(recipe.binding),model_calls:1,task_calls:0,primary_calls:0,model:'synthetic',reasoning:'low',duration_ms:13,metrics:{input_tokens:11,output_tokens:3,cached_tokens:2},artifacts,quality_observation:{kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'fail',evidence_refs:artifacts,fixed_reference:fixed}}}));`);
 f.definition.commands.grade.pins=[pin(f.provider),pin(f.settings)];
}
test('recipe binds an approved original attempt and preserves every original byte',t=>{const f=fixture(t),before=readRunJournal(f.root).previous,r=f.recipe();assert.equal(r.original_result_digest,canonicalDigest(f.state.attempts[0].result));assert.equal(r.binding.maximum_new_model_calls,1);assert.equal(r.binding.remaining_role,'verification');assert.equal(readRunJournal(f.root).previous,before);});
test('a complete worker directory cannot be transplanted outside its original job root',t=>{
 const f=fixture(t),foreign=join(f.dir,'foreign');cpSync(f.jobRoot,foreign,{recursive:true});
 f.mutate(s=>{s.attempts[0].result.output.evidence_root=foreign;write(join(foreign,'result.json'),s.attempts[0].result);});
 assert.throws(()=>f.recipe(),/original execution root transplant/);assert.equal(existsSync(practicalGradeSupplementStore(f.root)),false);
});
test('original grader pins may retain an empty data dependency',t=>{const f=fixture(t,{emptyPin:true});assert.ok(f.recipe().binding.grader_pins.some(v=>v.digest===hash(Buffer.alloc(0))));});
test('retained output may contain an empty regular file, as the original capture permits',t=>{
 const f=fixture(t),digest=hash(Buffer.alloc(0)),privateRoot=join(f.jobRoot,'private-grade');
 for(const base of [join(f.jobRoot,'workspace'),join(privateRoot,'submission'),join(privateRoot,'packet/service/candidate'),join(privateRoot,'packet/judge/candidate'),join(f.dir,'capsules','a'.repeat(32),'inputs/candidate')])writeFileSync(join(base,'empty.txt'),Buffer.alloc(0));
 const packet=jsonFile(join(privateRoot,'packet/packet.json'));packet.candidate_inventory.push({path:'empty.txt',sha256:digest.slice(7),mode:'100644'});write(join(privateRoot,'packet/packet.json'),packet);
 const capture=jsonFile(join(privateRoot,'capture-scope.json'));capture.files.push({path:'empty.txt',digest,mode:420});write(join(privateRoot,'capture-scope.json'),capture);assert.ok(f.recipe().binding.source_origin.source_refs.some(v=>v.path.endsWith('/empty.txt')&&v.digest===digest));
});
const jsonFile=p=>JSON.parse(readFileSync(p));
for(const mode of ['suspended','active','Task failure','context mismatch','valid range','consumed verifier','foreign runtime','parent lock'])test('rejects unsafe grading-only admission: '+mode,t=>{
 const f=fixture(t);
 if(mode==='suspended')f.mutate(s=>s.suspended=true);
 if(mode==='active')f.mutate(s=>s.active={kind:'trial'});
 if(mode==='Task failure')f.mutate(s=>s.attempts[0].result.output.task.exit_code=1);
 if(mode==='context mismatch')f.mutate(s=>s.attempts[0].job.input.condition_context={...s.plan.conditions[0].context,model:'different'});
 if(mode==='valid range')f.mutate(s=>{const q=s.attempts[0].result.output.quality_observation;q.evidence_refs=[{path:'grade-summary.json',digest:pin(join(f.jobRoot,'grade-summary.json')).digest}];});
 if(mode==='consumed verifier')write(join(f.jobRoot,'private-grade/verification-backend.json'),{completed:true});
 if(mode==='foreign runtime')f.contract.original_runtime.commands.trial.argv[1]='changed';
 if(mode==='parent lock')mkdirSync(join(f.parent,'.advance-lock'));
 assert.throws(()=>f.recipe());assert.equal(existsSync(practicalGradeSupplementStore(f.root)),false,'rejected admission must not reserve a slot');
});
test('a reservation consumes the original slot even if the provider returns unusable evidence',async t=>{const f=fixture(t),r=f.recipe(),before=readRunJournal(f.root).previous;const first=await runPracticalGradeSupplement({recipe:r,definition:f.definition});assert.equal(first.receipt.closed,false);assert.ok(first.receipt.issue);assert.equal(readRunJournal(f.root).previous,before);const next=await runPracticalGradeSupplement({recipe:r,definition:f.definition});assert.equal(next.reference.digest,first.reference.digest);assert.equal(readFileSync(f.counter,'utf8'),'called');const changed=structuredClone(f.definition);changed.commands.grade.argv.push('changed');await assert.rejects(runPracticalGradeSupplement({recipe:r,definition:changed}),/another provider/);});
test('a fresh AI disposition retains low supplemental points, original outcomes and Task cost; report regeneration calls no model',async t=>{
 const f=fixture(t);usableProvider(f);const original=structuredClone(f.state),r=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});assert.equal(r.receipt.closed,true);assert.equal(r.receipt.issue,null);
 const pending=buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[r.reference]});assert.equal(pending.report.all_attempts[0].included_in_comparison,false,'a new score does not silently reverse reference');
 const packet=practicalGradeSupplementSelectionPacket(r.reference),selection={supplement_digest:r.reference.digest,assessment:{packet_digest:canonicalDigest(packet),action:'use',retry_scope:null,reason:'Use the fixed retained-source correction, including its low points.',selection_basis:'missing_evidence',used_dimensions:packet.available_dimensions,comparison_limits:['Source reference; runtime remains unknown.']},execution:{kind:'host_ai',model_calls:null,usage:null,usage_status:'not_collected'}};
 recordPracticalGradeSupplementSelection({reference:r.reference,assessment:selection.assessment});
 const revised=buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[r.reference],selections:[selection]}),a=revised.report.all_attempts[0];
 assert.equal(a.included_in_comparison,true);assert.equal(a.original_included_in_comparison,false);assert.equal(a.quality_observation.fixed_reference.exact_lower,'1');assert.deepEqual(a.original_result,original.attempts[0].result);assert.equal(a.result_digest,canonicalDigest(a.original_result));assert.equal(a.observation.outcome,'fail');
 assert.deepEqual(revised.report.resources_all_attempts,original.report.resources_all_attempts);assert.equal(revised.report.supplemental_grading_overhead.resources.input_tokens.known_total,11);
 const summary=summarizeInstructionLoopEvaluation(revised.report),condition=summary.cases[0].conditions[0];assert.equal(condition.fixed_reference.exact_lower,'1');assert.equal(condition.selected_result_digest,a.effective_result_digest);
 assert.deepEqual(buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[r.reference],selections:[selection]}),revised);assert.equal(readFileSync(f.counter,'utf8'),'called');assert.deepEqual(readRunJournal(f.root).state,original);
 const stale=structuredClone(selection);stale.assessment.packet_digest=canonicalDigest('stale');assert.throws(()=>buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[r.reference],selections:[stale]}),/different packet/);
});
for(const mode of ['omit parent','grafted dispatch','grafted packet','grafted reply','grafted source'])test('source and coordinator admission rejects '+mode,t=>{
 const f=fixture(t);
 if(mode==='omit parent'){delete f.contract.parent;f.contract.coordinator_roots=[];}
 if(mode==='grafted dispatch'){const p=join(f.jobRoot,'private-grade/dispatch.json'),v=JSON.parse(readFileSync(p));v.trial_id=canonicalDigest('different trial');write(p,v);}
 if(mode==='grafted packet'){const p=join(f.jobRoot,'private-grade/packet/packet.json'),v=JSON.parse(readFileSync(p));v.task_id='other';write(p,v);}
 if(mode==='grafted reply')writeFileSync(join(f.dir,'replies','a'.repeat(32),'reply.json'),'different');
 if(mode==='grafted source')write(join(f.jobRoot,'private-grade/submission/answer.json'),{other:true});
 assert.throws(()=>f.recipe());assert.equal(existsSync(practicalGradeSupplementStore(f.root)),false);
});
test('closed failed transport retains raw and effective results and cannot replay',async t=>{
 const f=fixture(t);usableProvider(f);writeFileSync(f.provider,readFileSync(f.provider,'utf8')+'\nprocess.exitCode=1;\n');f.definition.commands.grade.pins[0]=pin(f.provider);
 const r=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});assert.equal(r.receipt.closed,true);assert.equal(r.receipt.result.status,'failed');assert.equal(r.receipt.quality,null);
 const saved=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});assert.equal(saved.reference.digest,r.reference.digest);
 const report=buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[r.reference]});assert.equal(report.report.grade_supplement_ledger[0].quality,null);assert.equal(report.report.supplemental_grading_overhead.resources.input_tokens.known_total,11);
});
test('read-only inspection can append positive closure without a second verification',async t=>{
 const f=fixture(t);usableProvider(f);writeFileSync(f.provider,readFileSync(f.provider,'utf8').replace('provider_terminal_confirmed:true','provider_terminal_confirmed:false'));f.definition.commands.grade.pins[0]=pin(f.provider);
 const inspector=join(f.dir,'inspect.mjs');writeFileSync(inspector,`import{readFileSync,writeFileSync}from'node:fs';import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};const [a,b]=process.argv.slice(2),q=JSON.parse(readFileSync(a)),old=JSON.parse(readFileSync(q.input.original_receipt.path)),result=structuredClone(old.result);result.output.provider_terminal_confirmed=true;writeFileSync(b,JSON.stringify({request_digest:canonicalDigest(q),status:'completed',output:{original_request_digest:canonicalDigest(q.input.original_job),original_receipt_digest:q.input.original_receipt.digest,model_calls:0,task_calls:0,primary_calls:0,result}}));`);
 f.definition.commands.grade.inspect_argv=[process.execPath,inspector];f.definition.commands.grade.pins.push(pin(inspector));
 const original=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});assert.equal(original.receipt.closed,false);
 const observed=await inspectPracticalGradeSupplement({reference:original.reference});assert.equal(observed.receipt.closed,true);assert.equal(observed.receipt.inspection_model_calls,0);assert.equal(observed.receipt.previous_receipt.digest,original.reference.digest);assert.equal(JSON.parse(readFileSync(original.reference.path)).closed,false,'original observation remains intact');
 const cached=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});assert.equal(cached.reference.digest,observed.reference.digest);assert.equal(readFileSync(f.counter,'utf8'),'called');
 assert.equal(buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[observed.reference]}).report.grade_supplement_ledger[0].quality.fixed_reference.exact_lower,'1');
});
test('an explicit report revision feeds standard next without inheriting original human decisions',async t=>{
 const f=fixture(t);usableProvider(f);const graded=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition}),packet=practicalGradeSupplementSelectionPacket(graded.reference);
 const selection={supplement_digest:graded.reference.digest,assessment:{packet_digest:canonicalDigest(packet),action:'use',retry_scope:null,reason:'Retained-source correction resolves missing grading evidence.',selection_basis:'missing_evidence',used_dimensions:packet.available_dimensions,comparison_limits:['Source only; runtime unknown.']},execution:{kind:'host_ai',model_calls:null,usage:null,usage_status:'not_collected'}};
 recordPracticalGradeSupplementSelection({reference:graded.reference,assessment:selection.assessment});
 const published=publishPracticalGradeSupplementReport({runRoot:f.root,supplements:[graded.reference],selections:[selection]});assert.equal(publishPracticalGradeSupplementReport({runRoot:f.root,supplements:[graded.reference],selections:[selection]}).reference.digest,published.reference.digest);
 const policy=structuredClone(f.parentPolicy);
 const parent=readRunJournal(f.parent).state,originalReport=structuredClone(parent.outputs.report);parent.status='completed';parent.gate=null;parent.policy=policy;parent.trials=[];parent.outputs.register={asset:'synthetic'};parent.outputs.final={outcome:'result_rejected_retained'};parent.result_decision={disposition:'rejected',packet_digest:canonicalDigest(originalReport),reason:'Retain original result history.'};appendRunJournal(f.parent,'synthetic-human-decision',parent);
 const operation=f.contract.parent.operation_root,o=readRunJournal(operation).state;o.status='completed';appendRunJournal(operation,'synthetic-operation-completed',o);
 const before=readRunJournal(f.parent).previous,next=prepareNextSupervisedInstructionLoop({root:f.parent,nextPolicy:{...policy,id:'new-cycle'},reportRevision:published.reference}),history=next.policy.observation.previous;
 assert.equal(next.approval_carried_forward,false);assert.equal(history.report_digest,canonicalDigest(originalReport));assert.equal(history.report_revision.effective_report_digest,published.readout.report_digest);assert.equal(history.report_revision.human_decision_scope,'original_packet_only');assert.equal(history.evaluation_summary.cases[0].conditions[0].fixed_reference.exact_lower,'1');assert.equal(next.policy.result_decision,undefined);assert.equal(readRunJournal(f.parent).previous,before);assert.equal(readFileSync(f.counter,'utf8'),'called');
 const old=prepareNextSupervisedInstructionLoop({root:f.parent,nextPolicy:{...policy,id:'legacy-next'}});assert.equal(old.policy.observation.previous.report_revision,undefined,'legacy continuation remains opt-in');
 const stale={...published.reference,digest:canonicalDigest('foreign report')};assert.throws(()=>prepareNextSupervisedInstructionLoop({root:f.parent,nextPolicy:{...policy,id:'bad-next'},reportRevision:stale}),/drift/);
});
test('reservation-only crash is inspected without launching the reserved verifier',async t=>{
 const f=fixture(t),inspector=join(f.dir,'reservation-inspect.mjs');
 writeFileSync(inspector,`import{readFileSync,writeFileSync}from'node:fs';import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};const [a,b]=process.argv.slice(2),q=JSON.parse(readFileSync(a)),j=q.input.original_job,r=j.input.recipe;writeFileSync(b,JSON.stringify({request_digest:canonicalDigest(q),status:'completed',output:{original_request_digest:canonicalDigest(j),original_receipt_digest:q.input.original_receipt.digest,model_calls:0,task_calls:0,primary_calls:0,result:{request_digest:canonicalDigest(j),status:'failed',output:{ready_for_next_root:true,provider_terminal_confirmed:true,process_group_closed:true,recipe_digest:canonicalDigest(r),original_result_digest:r.original_result_digest,grading_contract_digest:canonicalDigest(r.binding),model_calls:0,task_calls:0,primary_calls:0}}}}));`);
 f.definition.commands.grade.inspect_argv=[process.execPath,inspector];f.definition.commands.grade.pins.push(pin(inspector));const recipe=f.recipe(),directory=join(practicalGradeSupplementStore(f.root),canonicalDigest([f.root,f.id,recipe.original_job_digest]).slice(7));mkdirSync(directory,{recursive:true});write(join(directory,'allocation.json'),{kind:'practical_grade_supplement_allocation_v1',recipe_digest:canonicalDigest(recipe),runtime_digest:canonicalDigest(f.definition),original_attempt_id:f.id});
 const observed=await inspectPracticalGradeSupplement({recipe,definition:f.definition});assert.equal(observed.receipt.closed,true);assert.equal(observed.receipt.quality,null);assert.equal(existsSync(f.counter),false,'reservation inspection cannot launch the model');assert.equal(JSON.parse(readFileSync(join(directory,'receipt.json'))).allocation_only,true);
 assert.equal((await runPracticalGradeSupplement({recipe,definition:f.definition})).reference.digest,observed.reference.digest);assert.equal(existsSync(f.counter),false);
});
test('a failed read-only inspector can be observed again without replaying verification',async t=>{
 const f=fixture(t);usableProvider(f);writeFileSync(f.provider,readFileSync(f.provider,'utf8').replace('provider_terminal_confirmed:true','provider_terminal_confirmed:false'));f.definition.commands.grade.pins[0]=pin(f.provider);
 const inspector=join(f.dir,'inspection-failure.mjs'),count=join(f.dir,'inspection-count.json');
 writeFileSync(inspector,`import{readFileSync,writeFileSync,existsSync}from'node:fs';import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};const [a,b]=process.argv.slice(2),q=JSON.parse(readFileSync(a)),count=${JSON.stringify(count)};if(!existsSync(count)){writeFileSync(count,'1');process.exit(1);}writeFileSync(count,'2');const old=JSON.parse(readFileSync(q.input.original_receipt.path)),result=structuredClone(old.result);result.output.provider_terminal_confirmed=true;writeFileSync(b,JSON.stringify({request_digest:canonicalDigest(q),status:'completed',output:{original_request_digest:canonicalDigest(q.input.original_job),original_receipt_digest:q.input.original_receipt.digest,model_calls:0,task_calls:0,primary_calls:0,result}}));`);
 f.definition.commands.grade.inspect_argv=[process.execPath,inspector];f.definition.commands.grade.pins.push(pin(inspector));const first=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition});
 const failed=await inspectPracticalGradeSupplement({reference:first.reference});assert.equal(failed.receipt.closed,false);assert.equal(failed.receipt.inspection_error,true);
 const final=await inspectPracticalGradeSupplement({reference:failed.reference});assert.equal(final.receipt.closed,true);assert.equal(final.receipt.quality.fixed_reference.exact_lower,'1');assert.equal(readFileSync(count,'utf8'),'2');assert.equal(readFileSync(f.counter,'utf8'),'called');
 assert.equal((await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition})).reference.digest,final.reference.digest);
});
test('operator CLI derives origin and completes prepare/run/select/report without Task execution',t=>{
 const f=fixture(t);usableProvider(f);const cli=join(import.meta.dirname,'practical-grade-supplement-cli.mjs'),call=(...args)=>{
  const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
 };
 const recipe=join(f.dir,'recipe.json'),provider=join(f.dir,'provider.json'),receiptFile=join(f.dir,'receipt-ref.json'),packetFile=join(f.dir,'packet.json'),decisionFile=join(f.dir,'decision.json'),selectionFile=join(f.dir,'selection-ref.json'),revisionFile=join(f.dir,'revision-ref.json');
 write(provider,f.definition);const before=readRunJournal(f.root).previous;
 call('prepare','--operation',f.contract.parent.operation_root,'--attempt',f.id,'--output',recipe);
 call('run','--recipe',recipe,'--provider',provider,'--output',receiptFile);
 call('selection-packet','--receipt',receiptFile,'--output',packetFile);const packet=jsonFile(packetFile);
 write(decisionFile,{packet_digest:canonicalDigest(packet),action:'use',retry_scope:null,reason:'Preserve the fixed source correction including low points.',selection_basis:'missing_evidence',used_dimensions:packet.available_dimensions,comparison_limits:['No runtime certification.']});
 call('select','--receipt',receiptFile,'--assessment',decisionFile,'--output',selectionFile);
 const receipts=join(f.dir,'receipts.json'),selections=join(f.dir,'selections.json');write(receipts,[jsonFile(receiptFile)]);write(selections,[jsonFile(selectionFile)]);
 const output=call('report','--root',f.root,'--receipts',receipts,'--selections',selections,'--output',revisionFile);assert.equal(output.change_approval_carried_forward,false);assert.equal(jsonFile(revisionFile).digest,output.revision.digest);
 const duplicate=call('run','--recipe',recipe,'--provider',provider);assert.equal(duplicate.receipt.digest,jsonFile(receiptFile).digest);assert.equal(readFileSync(f.counter,'utf8'),'called');assert.equal(readRunJournal(f.root).previous,before);
 const bad=jsonFile(selections);bad[0].digest=canonicalDigest('foreign selection');write(selections,bad);const rejected=spawnSync(process.execPath,[cli,'report','--root',f.root,'--receipts',receipts,'--selections',selections],{encoding:'utf8',timeout:30000});assert.equal(rejected.status,1);assert.match(rejected.stderr,/reference drift/);
});
test('a crash after slot directory creation permits inspection only, never a new allocation',async t=>{
 const f=fixture(t),recipe=f.recipe(),directory=join(practicalGradeSupplementStore(f.root),canonicalDigest([f.root,f.id,recipe.original_job_digest]).slice(7));mkdirSync(directory,{recursive:true});
 const run=await runPracticalGradeSupplement({recipe,definition:f.definition});assert.equal(run.status,'requires_inspection');assert.equal(run.reason,'reservation_metadata_missing');assert.equal(run.additional_dispatch_permitted,false);
 const inspected=await inspectPracticalGradeSupplement({recipe,definition:f.definition});assert.equal(inspected.status,'requires_inspection');assert.equal(existsSync(f.counter),false);assert.equal(existsSync(join(directory,'allocation.json')),false,'a replacement provider must not claim the missing allocation');
});
test('report costs include omitted consumed slots and preserve unknown cost instead of success-only totals',async t=>{
 const f=fixture(t),second=structuredClone(f.state.attempts[0]);second.id='second-attempt';second.row.condition='candidate';second.job={...second.job,key:'second'};f.mutate(s=>s.attempts.push(second));
 usableProvider(f);const first=await runPracticalGradeSupplement({recipe:f.recipe(),definition:f.definition}),published=publishPracticalGradeSupplementReport({runRoot:f.root,supplements:[first.reference]}),directory=join(practicalGradeSupplementStore(f.root),canonicalDigest([f.root,second.id,canonicalDigest(second.job)]).slice(7));mkdirSync(directory,{recursive:true});
 const report=buildPracticalGradeSupplementReport({runRoot:f.root,supplements:[first.reference]}).report;
 assert.equal(report.grade_supplement_ledger.length,1,'explicit quality choices remain independent');assert.equal(report.supplement_execution_ledger.length,2,'every consumed slot enters cost history');
 assert.equal(report.supplemental_grading_overhead.consumed_slots,2);assert.equal(report.supplemental_grading_overhead.unclosed_slots,1);assert.deepEqual(report.supplemental_grading_overhead.model_calls,{known_total:1,observed_count:1,unknown_count:1});assert.equal(report.supplemental_grading_overhead.resources.input_tokens.unknown_count,1);
 const historical=readPracticalGradeSupplementContinuation({reference:published.reference,cycleRoot:f.parent,originalReport:readRunJournal(f.parent).state.outputs.report});assert.equal(historical.report.supplement_execution_ledger.length,1,'a later consumed slot does not rewrite a published historical revision');
});

test('CLI rejects outputs inside original run or coordinators before writing or dispatch',t=>{
 const f=fixture(t);usableProvider(f);const cli=join(import.meta.dirname,'practical-grade-supplement-cli.mjs'),recipe=join(f.dir,'recipe.json'),provider=join(f.dir,'provider.json');write(recipe,f.recipe());write(provider,f.definition);
 const before=readRunJournal(f.root).previous;
 for(const root of [f.root,f.parent,f.contract.parent.operation_root]){
  const output=join(root,'999999.json');
  for(const args of [['prepare','--operation',f.contract.parent.operation_root,'--attempt',f.id],['run','--recipe',recipe,'--provider',provider]]){
   const r=spawnSync(process.execPath,[cli,...args,'--output',output],{encoding:'utf8',timeout:30000});assert.equal(r.status,1);assert.match(r.stderr,/output overlaps original/);assert.equal(existsSync(output),false);
  }
 }
 assert.equal(existsSync(f.counter),false);assert.equal(readRunJournal(f.root).previous,before);assert.equal(existsSync(practicalGradeSupplementStore(f.root)),false);
});

test('original grader pins preserve existing module alias metadata through actual transport',async t=>{
 const f=fixture(t,{modulePin:true});usableProvider(f);const recipe=f.recipe(),module=recipe.binding.grader_pins.find(p=>p.module);assert.equal(module.module,'synthetic_fixed_dependency');f.definition.commands.grade.pins.push(module);
 const observed=await runPracticalGradeSupplement({recipe,definition:f.definition});assert.equal(observed.receipt.closed,true);assert.equal(observed.receipt.issue,null);assert.equal(observed.receipt.recipe.binding.grader_pins.find(p=>p.module).module,module.module);
});

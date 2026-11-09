import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,symlinkSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,appendRunJournal} from './instruction-run-journal.mjs';
import {advancePracticalEvaluation} from './practical-evaluation-runner.mjs';
import {preparePracticalInitializationClearance,validatePracticalInitializationClearance,observeInitializationRecoveryProcesses} from './practical-initialization-clearance.mjs';
import {buildPracticalEvaluationAssessmentPrompt} from './practical-evaluation-assessor.mjs';
const write=(p,v)=>writeFileSync(p,JSON.stringify(v)),pin=p=>({path:p,digest:hash(readFileSync(p))});
async function fixture(t,{retainedAssessor=false}={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-initialization-recovery-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const root=join(dir,'evaluation'),operation=join(dir,'operation'),cycle=join(operation,'first-run');mkdirSync(root);mkdirSync(cycle,{recursive:true});
 const worker=join(dir,'practical-evaluation-worker.mjs'),assessor=join(dir,'practical-evaluation-assessor.mjs');writeFileSync(worker,'// synthetic worker, never executed');writeFileSync(assessor,'// synthetic read-only assessor, never executed');
 const taskCommand={argv:[process.execPath,worker],pins:[pin(worker)],model_calls:true,timeout_ms:1000},settings=join(dir,'worker-settings.json');write(settings,{conditions:{baseline:{command:taskCommand},candidate:{command:taskCommand}}});
 const assessorSettings=join(dir,'assessor-settings.json');write(assessorSettings,{kind:'codex',executable:process.execPath,model:null,timeout_ms:1000});
 const definition={commands:{trial:{argv:[process.execPath,worker,settings,pin(settings).digest],pins:[pin(worker),pin(settings)],model_calls:true},assess:{argv:[process.execPath,assessor,assessorSettings,pin(assessorSettings).digest],pins:[pin(assessor),pin(assessorSettings)],model_calls:true}}};
 const context={cli_version:'synthetic',model:null,reasoning:null,platform:'synthetic',global_context_ref:null},plan={kind:'practical_evaluation_plan_v1',id:'fixture',goal:'Recover one isolated initialization failure, retain every result.',runtime_digest:canonicalDigest(definition),evidence_kind:'synthetic',conditions:['baseline','candidate'].map(id=>({id,context})),cases:[{id:'case',task_ref:'task',input_ref:'input',success_criteria_ref:'check',public_input_digest:canonicalDigest('public')}],repetitions:1,recovery:{max_extra_trials:4,max_retries_per_row:1,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration']},global_context:{ask_presence:'unknown',change_status:'unknown'}};
 const receipts=new Map(),calls=[],runtime={digest:plan.runtime_digest,inspect:async job=>receipts.get(canonicalDigest(job))??null};let assessments=0;
 runtime.trial=async job=>{
  calls.push(job);const d=join(root,'jobs',canonicalDigest(job).slice(7));mkdirSync(join(d,'workspace'),{recursive:true});write(join(d,'request.json'),job);write(join(d,'process.json'),{pid:2147483000,request_digest:canonicalDigest(job)});
  const bad=job.input.row.condition==='baseline'&&job.input.attempt===1,phase={exit_code:bad?1:0,process_group_closed:true,provider_terminal_confirmed:!bad,ready_for_next_root:!bad,timed_out:false,signal:null};
  const result={request_digest:canonicalDigest(job),status:bad?'failed':'completed',output:{evidence_root:d,execution_completed:!bad,ready_for_next_root:!bad,context_integrity:'preserved',grade:null,grading_execution_state:'not_started',task:phase,cli_seconds:bad?0.35:1,root_usage:{input_tokens:null,cached_input_tokens:null,output_tokens:null}}};
  write(join(d,'result.json'),result);write(join(d,'transport.json'),{request_digest:canonicalDigest(job),exit_code:0,signal:null});write(join(d,'task-completion.json'),phase);
  if(bad){
   const commandDigest=canonicalDigest(taskCommand),stdout=Buffer.alloc(0),stderr=Buffer.from('Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n');
   writeFileSync(join(d,'task-codex.stdout.jsonl'),stdout);writeFileSync(join(d,'task-codex.stderr.log'),stderr);write(join(d,'task-started.json'),{command_digest:commandDigest});
   write(join(d,'task-codex-provider.json'),{kind:'practical_codex_provider_receipt_v1',request_digest:canonicalDigest(job),command_digest:commandDigest,invocation_digest:canonicalDigest({request_digest:canonicalDigest(job),command_digest:commandDigest,role:'task'}),terminal:false,session_id:null,local:{spawn_observed:true,termination_confirmed:true,exit_code:1,error:null,timed_out:false,interrupted:false,output_limited:false},observation:{artifacts:[{path:'task-codex.stdout.jsonl',digest:hash(stdout)},{path:'task-codex.stderr.log',digest:hash(stderr)}]}});
  }
  receipts.set(canonicalDigest(job),result);return result;
 };
 runtime.assess=async job=>{assessments++;const d=join(root,'jobs',canonicalDigest(job).slice(7));mkdirSync(join(d,'assessment-session'),{recursive:true});write(join(d,'request.json'),job);write(join(d,'transport.json'),{request_digest:canonicalDigest(job),exit_code:1,signal:null});write(join(d,'process.json'),{pid:2147483001,request_digest:canonicalDigest(job)});writeFileSync(join(d,'stdout.log'),'');writeFileSync(join(d,'stderr.log'),'assessment incomplete; inspect saved session, do not replay automatically\n');
  if(retainedAssessor){const session=join(d,'assessment-session'),stdout=Buffer.alloc(0),stderr=Buffer.from('Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n');writeFileSync(join(session,'stdout.jsonl'),stdout);writeFileSync(join(session,'stderr.log'),stderr);
   write(join(session,'execution-observation.json'),{kind:'practical_assessor_execution_observation_v1',request_digest:canonicalDigest(job),settings_digest:canonicalDigest(JSON.parse(readFileSync(assessorSettings))),prompt_digest:hash(Buffer.from(buildPracticalEvaluationAssessmentPrompt(job))),local:{spawn_observed:true,termination_confirmed:true,pid:2147483002,exit_code:1,signal:null,error:null,cleanup_error:null,timed_out:false,interrupted:false,output_limited:false},duration_ms:350,provider_terminal_confirmed:null,closure_scope:'unconfirmed',model_calls:null,model_calls_status:'not_observed',usage:null,usage_status:'not_collected',replay_authorized:false,artifacts:[{path:'stdout.jsonl',digest:hash(stdout)},{path:'stderr.log',digest:hash(stderr)}],answer_observation_issue:null});}
  return {request_digest:canonicalDigest(job),status:'unknown'};};
 const run=options=>advancePracticalEvaluation({root,plan,runtime,...options});let s=await run();s=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic human approval.'}});assert.equal(s.status,'ai_assessment_uncertain');
 const profile=join(dir,'profile.json'),config=join(dir,'config.json'),profilePolicy={id:'synthetic',normal_target:null};write(profile,{kind:'full_practical_instruction_loop_profile_v1',normal:{target:null},practical:{root},policy:profilePolicy});const parentRuntime={profile_path:profile,profile_digest:pin(profile).digest,source_pins:[pin(worker),pin(assessor)]},policy={...profilePolicy,runtime_digest:canonicalDigest(parentRuntime)};write(config,{policy,runtime:parentRuntime});
 const selection={practical_root:root,practical_plan:plan,practical_plan_digest:canonicalDigest(plan),practical_runtime:definition};
 appendRunJournal(cycle,'synthetic-parent',{policy,pending:{kind:'evaluate',input:{selection}},evaluation_decision:{disposition:'approved'},outputs:{select:selection}});
 appendRunJournal(operation,'synthetic-parent',{preparation:null,current:{root:cycle,config_path:config,config_digest:canonicalDigest(JSON.parse(readFileSync(config))),profile_path:profile,profile_digest:pin(profile).digest}});
 return {dir,root,operation,cycle,run,calls,receipts,definition,state:()=>readRunJournal(root).state,assessmentCalls:()=>assessments,
  prepare:()=>preparePracticalInitializationClearance({operationRoot:operation,reason:'Retry one pre-session failure fairly, not a better score.'})};
}
const choice=p=>({packet_digest:canonicalDigest(p),action:'retry',retry_scope:'trial',selection_basis:'execution_failure',reason:'The isolated attempt failed during initialization. Retain its failed/Unknown evidence; use one original retry slot without rerunning the read-only assessor.',used_dimensions:['execution','duration'],comparison_limits:['Original provider closure and assessor remote/cost remain Unknown; this continuation exception is not quality evidence.']});
test('retained assessor initialization observations are bound and admitted without pretending provider closure',async t=>{
 const f=await fixture(t,{retainedAssessor:true}),c=f.prepare();assert.equal(c.assessor_evidence_variant,'retained_initialization_failure');assert.equal(c.process_closed,false);assert.equal(c.safe_to_continue,true);assert.equal(c.local_observation.worker_pids.length,3);assert.equal(c.control_implementation.length,5);
 assert.ok(c.sources.some(p=>p.path.endsWith('/execution-observation.json')));assert.ok(c.sources.some(p=>p.path.endsWith('/assessor-settings.json')));
 const out=await f.run({continuationClearance:c});assert.equal(out.pending_recovery.process_closed,false);assert.equal(out.pending_recovery.retry_available,true);assert.equal(f.calls.length,1);assert.equal(f.assessmentCalls(),1);assert.equal(f.state().extra_trials,0);
});
for(const mode of ['request','settings','prompt','stdout','diagnostic','timeout','provider-closed','replay','missing-pid','answer'])test('retained assessor evidence rejects '+mode,async t=>{
 const f=await fixture(t,{retainedAssessor:true}),s=f.state(),session=join(f.root,'jobs',canonicalDigest(s.active).slice(7),'assessment-session'),p=join(session,'execution-observation.json'),e=JSON.parse(readFileSync(p));
 if(['request','settings','prompt'].includes(mode))e[mode+'_digest']=canonicalDigest('foreign');
 if(mode==='stdout'||mode==='diagnostic'){const name=mode==='stdout'?'stdout.jsonl':'stderr.log',raw=Buffer.from(mode==='stdout'?'partial provider output':'Error: remote timeout\n');writeFileSync(join(session,name),raw);e.artifacts.find(a=>a.path===name).digest=hash(raw);}
 if(mode==='timeout')e.local.timed_out=true;if(mode==='provider-closed')e.provider_terminal_confirmed=true;if(mode==='replay')e.replay_authorized=true;if(mode==='missing-pid')e.local.pid=null;if(mode==='answer')writeFileSync(join(session,'answer.json'),'{}');
 write(p,e);assert.throws(()=>f.prepare());assert.equal(f.calls.length,1);assert.equal(f.state().extra_trials,0);
});
test('one explicit operational exception retains false/Unknown evidence and retries only the failed row once',async t=>{
 const f=await fixture(t),before=structuredClone(f.state()),clearance=f.prepare();assert.equal(clearance.process_closed,false);assert.equal(clearance.safe_to_continue,true);
 const admitted=await f.run({continuationClearance:clearance});assert.equal(admitted.pending_recovery.process_closed,false);assert.equal(admitted.pending_recovery.retry_available,true);assert.equal(admitted.pending_recovery.safe_to_continue,true);assert.equal(f.calls.length,1);
 await assert.rejects(f.run({assessment:choice(before.recovery.packet)}),/different packet/);
 const again=await f.run({continuationClearance:clearance});assert.equal(again.pending_recovery_digest,admitted.pending_recovery_digest);
 await assert.rejects(f.run({assessment:{...choice(admitted.pending_recovery),retry_scope:'case'}}),/only the failed logical row/);assert.equal(f.calls.length,1);assert.equal(f.state().extra_trials,0);
 const end=await f.run({assessment:choice(admitted.pending_recovery)});assert.equal(end.status,'completed');assert.equal(end.report.extra_trials,1);assert.equal(f.calls.length,3);assert.equal(f.assessmentCalls(),1);
 assert.equal(f.calls.filter(j=>j.input.row.condition==='baseline').length,2);assert.equal(f.calls[1].input.attempt,2);assert.notEqual(canonicalDigest(f.calls[0]),canonicalDigest(f.calls[1]));
 assert.deepEqual(end.report.all_attempts[0].original_result,before.attempts[0].result);assert.equal(end.report.all_attempts[0].original_result.output.task.provider_terminal_confirmed,false);
 assert.equal(end.report.assessment_attempts[0].status,'unknown');assert.equal(end.report.assessment_overhead.reported_root_model_calls.unknown_count,1);assert.equal(end.report.continuation_clearances.length,1);
 const completedDigest=readRunJournal(f.root).previous;
 await f.run({continuationClearance:clearance});await f.run();assert.equal(f.calls.length,3);assert.equal(f.state().extra_trials,1);assert.equal(readRunJournal(f.root).previous,completedDigest,'completed recovery is a pure read');
 await assert.rejects(advancePracticalEvaluation({root:f.root,plan:{...f.state().plan,goal:'changed'},runtime:{digest:f.state().plan.runtime_digest}}),/approved plan/);assert.equal(readRunJournal(f.root).previous,completedDigest,'wrong plan rejects before mutation');
});
test('a crash between clearance admission and packet refresh resumes without another exception or dispatch',async t=>{
 const f=await fixture(t),c=f.prepare(),s=f.state();s.continuation_clearances=[c];appendRunJournal(f.root,'initialization_continuation_admitted',s);
 const out=await f.run({continuationClearance:c});assert.equal(out.pending_recovery.safe_to_continue,true);assert.equal(out.pending_recovery.process_closed,false);assert.equal(f.calls.length,1);assert.equal(f.state().continuation_clearances.length,1);
});
for(const mode of ['wrong-plan','wrong-result','wrong-invocation','generic-timeout','extra-assessor-evidence','wrong-assessor-row','owner-target','live-parent','missing-controller-pins'])test('initialization exception rejects '+mode,async t=>{
 const f=await fixture(t),c=f.prepare(),s=f.state(),a=s.attempts[0],d=a.result.output.evidence_root,assess=join(f.root,'jobs',c.original_assessor_job_digest.slice(7));
 if(mode==='wrong-plan')c.approved_plan_digest=canonicalDigest('other');
 if(mode==='wrong-result')c.original_result_digest=canonicalDigest('other');
 if(mode==='missing-controller-pins')c.control_implementation=[];
 if(mode==='wrong-invocation'){const p=join(d,'task-codex-provider.json'),v=JSON.parse(readFileSync(p));v.invocation_digest=canonicalDigest('other');write(p,v);}
 if(mode==='generic-timeout')writeFileSync(join(d,'task-codex.stderr.log'),'Error: remote timeout\n');
 if(mode==='extra-assessor-evidence')writeFileSync(join(assess,'assessment-session/answer.json'),'{}');
 if(mode==='wrong-assessor-row')c.original_assessor_job.input.packet.attempt_key='other';
 if(mode==='owner-target'){const op=readRunJournal(f.operation).state,p=op.current.profile_path,v=JSON.parse(readFileSync(p));v.normal.target=join(f.dir,'owner');write(p,v);op.current.profile_digest=pin(p).digest;appendRunJournal(f.operation,'synthetic-profile-change',op);assert.throws(()=>f.prepare(),/owner targets/);assert.throws(()=>validatePracticalInitializationClearance(c,{root:f.root,state:s}),/owner targets/);return;}
 if(mode==='live-parent'){mkdirSync(join(f.cycle,'.advance-lock'));assert.throws(()=>f.prepare(),/coordinator is active/);return;}
 assert.throws(()=>validatePracticalInitializationClearance(c,{root:f.root,state:s}));assert.equal(f.calls.length,1);assert.equal(f.state().extra_trials,0);
});
for(const mode of ['exit1','stderr','invisible','writer'])test('local observation rejects incomplete or unsafe lsof: '+mode,()=>{
 const roots={taskRoot:'/synthetic/task',assessRoot:'/synthetic/assessor',workerPids:[2147483000,2147483001]},self='p'+process.pid+'\nn'+process.cwd()+'\n';
 const response=mode==='exit1'?{status:1,stdout:'',stderr:'permission denied'}:mode==='stderr'?{status:0,stdout:self,stderr:'incomplete observation'}:mode==='invisible'?{status:0,stdout:'',stderr:''}:{status:0,stdout:self+'p123\nn/synthetic/assessor/assessment-session\n',stderr:''};
 assert.throws(()=>observeInitializationRecoveryProcesses(roots,()=>response));
});
test('recovery CLI validates a foreign symlink cycle before any lock touches its target',async t=>{
 const f=await fixture(t),clearance=f.prepare(),file=join(f.dir,'clearance.json');write(file,clearance);
 const target=join(f.dir,'untouched-target');mkdirSync(target);writeFileSync(join(target,'sentinel'),'owned fixture');const before={entries:readdirSync(target),mtime:statSync(target).mtimeMs};
 const link=join(f.operation,'foreign-cycle');symlinkSync(target,link,'dir');const op=readRunJournal(f.operation).state;op.current.root=link;appendRunJournal(f.operation,'synthetic-symlink',op);
 const r=spawnSync(process.execPath,[new URL('./practical-initialization-recovery-cli.mjs',import.meta.url).pathname,'admit','--operation',f.operation,'--clearance',file],{encoding:'utf8'});assert.notEqual(r.status,0);assert.deepEqual(readdirSync(target),before.entries);assert.equal(statSync(target).mtimeMs,before.mtime);assert.equal(existsSync(join(f.operation,'.advance-lock')),false);
});
test('recovery CLI admits a fresh packet without model calls and rejects output inside original records',async t=>{
 const f=await fixture(t),cli=new URL('./practical-initialization-recovery-cli.mjs',import.meta.url).pathname,output=join(f.dir,'clearance.json');
 let r=spawnSync(process.execPath,[cli,'prepare','--operation',f.operation,'--reason','Synthetic bounded initialization retry.','--output',output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).new_model_calls,0);
 r=spawnSync(process.execPath,[cli,'admit','--operation',f.operation,'--clearance',output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).pending_recovery.process_closed,false);assert.equal(f.calls.length,1);assert.equal(f.state().extra_trials,0);
 r=spawnSync(process.execPath,[cli,'prepare','--operation',f.operation,'--reason','Synthetic.','--output',join(f.root,'bad.json')],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(existsSync(join(f.root,'bad.json')),false);
});

test('local writer inspection has a finite timeout and never treats timeout as absence',()=>{
 let inspected=false;
 assert.throws(()=>observeInitializationRecoveryProcesses({taskRoot:'/owned/session',assessRoot:'/owned/run',workerPids:[]},(_command,_args,options)=>{
  inspected=true;assert.equal(options.timeout,15000);
  return {status:null,error:Object.assign(new Error('timed out'),{code:'ETIMEDOUT'}),stdout:'',stderr:''};
 }),/cannot completely inspect/);
 assert.equal(inspected,true);
});

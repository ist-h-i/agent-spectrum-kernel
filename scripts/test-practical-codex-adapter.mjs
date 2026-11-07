// Explicit fake executables only. These software fixtures do not run a live Eval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {advancePracticalEvaluation} from './practical-evaluation-runner.mjs';
import {createPracticalEvaluationCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {createComponentInstructionLoopConfiguration,createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
import {inspectInstructionLoopReadiness} from './instruction-loop-native-configuration.mjs';
import {executePracticalEvaluationWorker} from './practical-evaluation-worker.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
const adapter=()=>import('./practical-codex-adapter.mjs');
function temp(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-standard-codex-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function provider(root){
 const executable=join(root,'fake-codex'),marker=join(root,'provider-calls');
 writeFileSync(executable,'#!'+process.execPath+'\n'+`const fs=require('node:fs');let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{fs.appendFileSync(${JSON.stringify(marker)},'called\\n');const args=process.argv.slice(2),out=args[args.indexOf('--output-last-message')+1];fs.writeFileSync(out,'Synthetic task artifact');fs.writeFileSync('explicit-counters.json','{broken');console.log(JSON.stringify({type:'thread.started',thread_id:'synthetic-'+process.pid}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:input.includes('invalid-counter')?-1:7,output_tokens:3}}));});`);chmodSync(executable,0o700);
 return {executable,marker};
}
const options=executable=>({executable,model:null,reasoning:null,task_file:'task.md',timeout_ms:5000});
test('standard Codex command preparation starts no provider and pins settings and existing transport/parser',async t=>{
 const root=temp(t),p=provider(root),{createCodexPracticalCommand}=await adapter();
 const command=createCodexPracticalCommand({settingsPath:join(root,'settings.json'),options:options(p.executable),evidenceKind:'synthetic'});
 assert.equal(existsSync(p.marker),false);assert.equal(command.model_calls,true);
 assert.equal(command.provider_closure_path,'{evaluation_command_role}-codex-provider.json');
 assert.ok(command.pins.some(p=>p.path.endsWith('/codex-exec-runner.mjs')));assert.ok(command.pins.some(p=>p.path.endsWith('/ask-user-comparison.mjs')));
 assert.ok(command.argv.includes('{evaluation_invocation_digest}'));
});
test('standard trial captures partial root usage automatically without inventing a quality pass or replaying',async t=>{
 const root=temp(t),p=provider(root),{createCodexPracticalCommand}=await adapter();
 const command=createCodexPracticalCommand({settingsPath:join(root,'adapter.json'),options:options(p.executable),evidenceKind:'synthetic'});
 const files=['partial','invalid-counter'].map((text,i)=>{const source=join(root,'task-'+i+'.md');writeFileSync(source,text);return {source,target:'task.md',digest:hash(readFileSync(source))};});
 const cases=files.map((f,i)=>({id:'case-'+i,task_ref:'synthetic-task',input_ref:'public-input',success_criteria_ref:'not-yet-graded',files:[f]}));
 const settings=join(root,'worker.json');writeFileSync(settings,JSON.stringify({observation_path:'explicit-counters.json',cases:Object.fromEntries(cases.map(c=>[c.id,{files:c.files}])),conditions:{baseline:{command,command_role:'task'},candidate:{command,command_role:'task'}}}));
 const worker=resolve(import.meta.dirname,'practical-evaluation-worker.mjs'),pin={path:settings,digest:hash(readFileSync(settings))};
 const definition={commands:{trial:{argv:[process.execPath,worker,settings,pin.digest,'execute'],inspect_argv:[process.execPath,worker,settings,pin.digest,'inspect'],pins:[pin,{path:worker,digest:hash(readFileSync(worker))}],model_calls:true}}};
 const runtime=createPracticalEvaluationCommandRuntime({definition,modelCallsAuthorized:true});
 const context={cli_version:'synthetic',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
 const plan={kind:'practical_evaluation_plan_v1',id:'standard',goal:'Use useful partial measurements without manual counter transcription.',runtime_digest:runtime.digest,evidence_kind:'synthetic',
  conditions:['baseline','candidate'].map(id=>({id,context})),cases:cases.map(c=>({...c,public_input_digest:canonicalDigest(c.files.map(({target,digest})=>({target,digest})))})),repetitions:1,
  recovery:{max_extra_trials:0,max_retries_per_row:0,allow_exclusion:true,allow_reference:true,required_dimensions:['execution','duration']},global_context:{ask_presence:'unknown',change_status:'unknown'}};
 const run=extra=>advancePracticalEvaluation({root:join(root,'run'),plan,runtime,...extra}),pending=await run();assert.equal(existsSync(p.marker),false);
 const end=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(pending.pending_gate),reason:'Synthetic fixture approval only.'}});
 assert.equal(end.status,'completed');assert.equal(end.report.all_attempts.length,4);
 for(const a of end.report.all_attempts){assert.equal(a.original_result.output.ready_for_next_root,true);assert.equal(a.observation.outcome,'unknown');
  assert.equal(a.observation.metrics.input_tokens,a.row.case_id==='case-0'?7:null,JSON.stringify(a.original_result.output));assert.equal(a.observation.metrics.output_tokens,3);assert.equal(a.observation.metrics.cached_tokens,null);
  assert.equal(a.original_result.output.metrics_source,'provider_closure_receipt');assert.equal(a.original_result.output.task.provider_observation.scope,'root_turn_completed_only');}
 assert.equal(readFileSync(p.marker,'utf8').trim().split('\n').length,4);
 await run();assert.equal(readFileSync(p.marker,'utf8').trim().split('\n').length,4);
});
test('supervised selection supplies a standard Codex command and preserves optional observation settings before case approval',async t=>{
 const f=componentLoopFixture(t),p=provider(f.workspaceRoot);const task=join(f.workspaceRoot,'public-task.md');writeFileSync(task,'Synthetic public task.');
 const files=[{source:task,target:'task.md',digest:hash(readFileSync(task))}],input=canonicalDigest(files.map(({target,digest})=>({target,digest})));
 f.profile.practical.cases[0].files=files;f.profile.policy.catalog[0].public_input_digest=input;f.profile.practical.observation_path='explicit-counters.json';
 for(const c of Object.values(f.profile.practical.conditions)){delete c.command;c.command_role='task';c.codex=options(p.executable);}
 writeFileSync(f.profilePath,JSON.stringify(f.profile));const readiness=inspectInstructionLoopReadiness(f.profilePath);assert.equal(readiness.selected.trial_transport,'standard_codex');assert.deepEqual(readiness.setup_responsibility.human,['evaluation_cases','change_or_result']);
 const config=createComponentInstructionLoopConfiguration(f.profilePath);
 const state=await advanceSupervisedInstructionLoop({root:f.root,policy:config.policy,runtime:createComponentInstructionLoopRuntime({definition:config.runtime})});
 assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(existsSync(p.marker),false);assert.equal(existsSync(f.profile.practical.root),false);
 const settings=JSON.parse(readFileSync(join(f.profile.stateRoot,'practical-worker-settings.json')));
 assert.equal(settings.observation_path,'explicit-counters.json');for(const c of Object.values(settings.conditions))assert.ok(c.command.argv.some(v=>v.endsWith('/practical-codex-adapter.mjs')));
});

test('standard task binding rejects instruction-only paths and context drift before configuration writes',async t=>{
 const f=componentLoopFixture(t),p=provider(f.workspaceRoot);
 for(const c of Object.values(f.profile.practical.conditions)){delete c.command;c.command_role='task';c.codex=options(p.executable);}
 const save=()=>writeFileSync(f.profilePath,JSON.stringify(f.profile));save();
 assert.throws(()=>createComponentInstructionLoopConfiguration(f.profilePath),/task_file must be in every case public input/);
 for(const c of Object.values(f.profile.practical.conditions)){c.codex.task_file='check.mjs';c.codex.model='declared-but-different';}save();
 assert.throws(()=>createComponentInstructionLoopConfiguration(f.profilePath),/declared-but-different/);
 assert.equal(existsSync(f.profile.stateRoot),false);assert.equal(existsSync(p.marker),false);
});
test('adapter enforces authorization, preserves uncertain usage separately and rejects dispatch replay',async t=>{
 const root=temp(t),workspace=join(root,'workspace'),controlRoot=join(root,'control');mkdirSync(workspace);mkdirSync(controlRoot);
 writeFileSync(join(workspace,'task.md'),'Synthetic task.');const {executeCodexPracticalAdapter}=await adapter();
 const settings={kind:'practical_codex_settings_v1',...options('/nonexistent/synthetic-codex'),evidence_kind:'synthetic'},d=canonicalDigest('fixture');
 const args={settings,controlRoot,requestDigest:d,commandDigest:d,invocationDigest:d,role:'task'};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,cwd=process.cwd();let calls=0;
 try{
  delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;
  await assert.rejects(()=>executeCodexPracticalAdapter(args),/not authorized/);assert.equal(existsSync(join(controlRoot,'task-codex-dispatch')),false);
  process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';process.chdir(workspace);
  const uncertain=await executeCodexPracticalAdapter(args,async()=>{calls++;return {spawnObserved:true,terminationConfirmed:true,exitCode:null,timedOut:true,stdout:Buffer.from(JSON.stringify({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}})),stderr:Buffer.alloc(0)};});
  assert.equal(uncertain.terminal,false);assert.equal(uncertain.completed,false);assert.equal(uncertain.receipt.observation.metrics.input_tokens,null);
  assert.equal(uncertain.receipt.observation.known_usage_lower_bound.known_tokens,10);
  await assert.rejects(()=>executeCodexPracticalAdapter(args),/EEXIST/);assert.equal(calls,1);
  const missingRoot=join(root,'missing-control');mkdirSync(missingRoot);
  const noStart=await executeCodexPracticalAdapter({...args,controlRoot:missingRoot,settings:{...settings,task_file:'missing-task.md'}},async()=>{calls++;throw new Error('must not start');});
  assert.equal(noStart.terminal,true);assert.equal(noStart.models_started,false);assert.equal(calls,1);
 }finally{process.chdir(cwd);if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});
test('optional broken workspace counters do not erase execution or grader evidence for legacy commands',async t=>{
 const root=temp(t),source=join(root,'check.mjs');writeFileSync(source,"import {writeFileSync} from 'node:fs';writeFileSync('counters.json','{broken');");
 const files=[{source,target:'check.mjs',digest:hash(readFileSync(source))}],command={argv:[process.execPath,'check.mjs'],pins:[{path:source,digest:files[0].digest}],timeout_ms:5000,model_calls:false};
 const settings={observation_path:'counters.json',cases:{c:{files}},conditions:{baseline:{command,command_role:'check'}}};
 const job={input:{row:{case_id:'c',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
 const result=await executePracticalEvaluationWorker(settings,job,join(root,'result.json'));
 assert.equal(result.status,'completed');assert.equal(result.output.notes.outcome,'pass');assert.equal(result.output.ready_for_next_root,true);
 assert.equal(result.output.metrics_source,'caller_workspace_observation_unusable');assert.equal(result.output.notes.metrics.input_tokens,null);
});

for(const bad of ['artifact','binding'])test(`invalid provider ${bad} cannot donate counters or fall back to workspace claims`,async t=>{
 const root=temp(t),source=join(root,'receipt.mjs');
 writeFileSync(source,`import {writeFileSync} from 'node:fs';import {join} from 'node:path';const [control,request,command,invocation]=process.argv.slice(2);writeFileSync('counters.json',JSON.stringify({input_tokens:100}));writeFileSync(join(control,'raw.log'),'evidence');writeFileSync(join(control,'provider.json'),JSON.stringify({request_digest:${bad==='binding'?"'sha256:'+('0'.repeat(64))":"request"},command_digest:command,invocation_digest:invocation,terminal:true,provider_ref:'synthetic-only',observation:{kind:'provider_observation_v1',scope:'synthetic-only',metrics:{input_tokens:9},artifacts:[{path:'raw.log',digest:'sha256:'+('0'.repeat(64))}]}}));`);
 const files=[{source,target:'receipt.mjs',digest:hash(readFileSync(source))}],command={argv:[process.execPath,'receipt.mjs','{evaluation_control_root}','{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}'],pins:[{path:source,digest:files[0].digest}],timeout_ms:5000,model_calls:true,provider_closure_path:'provider.json'};
 const settings={observation_path:'counters.json',cases:{c:{files}},conditions:{baseline:{command,command_role:'task'}}};
 const job={input:{row:{case_id:'c',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{const result=await executePracticalEvaluationWorker(settings,job,join(root,'result.json'));
  assert.equal(result.output.notes.outcome,'unknown');assert.equal(result.output.ready_for_next_root,bad==='artifact');
  assert.equal(result.output.metrics_source,'provider_observation_unusable');assert.equal(result.output.notes.metrics.input_tokens,null);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

const qualitySummary=()=>({kind:'fixed_point_reference_summary_v1',exact_lower:'21/2',exact_upper:'21',scale_maximum:'100',mandatory_compliance:null,
 observation_completeness_reported:false,runtime_acceptance_verified:null,critical_status:'undetermined',partial_items:1,undetermined_items:1,formal_admission:false,evidence_truth_checked:false,capture_complete:false});
const judgmentBody='{"synthetic":"retained source judgment"}';
const declaredQuality=(outcome='unknown')=>({kind:'practical_quality_observation_v1',scope:'source_reference',outcome,
 evidence_refs:[{path:'judgment.json',digest:hash(Buffer.from(judgmentBody))}],fixed_reference:qualitySummary()});
async function gradedFixture(t,quality,{terminal=true,gradeExit=0}={}){
 const root=temp(t),task=join(root,'task.mjs'),grader=join(root,'grader.mjs');writeFileSync(task,"import{writeFileSync}from'node:fs';writeFileSync('answer.txt','synthetic answer');");
 writeFileSync(grader,`import{writeFileSync}from'node:fs';import{join}from'node:path';const [control,request,command,invocation]=process.argv.slice(2);
 writeFileSync(join(control,'judgment.json'),${JSON.stringify(judgmentBody)});writeFileSync(join(control,'grade-provider.json'),JSON.stringify({request_digest:request,command_digest:command,invocation_digest:invocation,terminal:${terminal},provider_ref:'synthetic-grader',
 observation:{kind:'provider_observation_v1',scope:'synthetic_grading_only',metrics:{input_tokens:7,output_tokens:3,cached_tokens:2},artifacts:[{path:'judgment.json',digest:${JSON.stringify(hash(Buffer.from(judgmentBody)))}}],...${JSON.stringify(quality===undefined?{}:{quality})}}}));process.exitCode=${gradeExit};`);
 const files=[{source:task,target:'task.mjs',digest:hash(readFileSync(task))}],command={argv:[process.execPath,'task.mjs'],pins:[{path:task,digest:files[0].digest}],timeout_ms:5000,model_calls:false};
 const grade={argv:[process.execPath,grader,'{evaluation_control_root}','{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}'],pins:[{path:grader,digest:hash(readFileSync(grader))}],timeout_ms:5000,model_calls:false,provider_closure_path:'grade-provider.json'};
 const settings={cases:{c:{files,grader:grade}},conditions:{baseline:{command,command_role:'task'}}};
 return executePracticalEvaluationWorker(settings,{input:{row:{case_id:'c',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}},join(root,'result.json'));
}
for(const outcome of ['unknown','fail'])test(`typed ${outcome} source quality is not turned into pass by a normal grader exit`,async t=>{
 const quality=declaredQuality(outcome),r=await gradedFixture(t,quality);assert.equal(r.status,'completed');assert.equal(r.output.notes.outcome,outcome);
 assert.deepEqual(r.output.quality_observation,quality);assert.equal(r.output.ready_for_next_root,true);assert.equal(r.output.grade.provider_observation.metrics.input_tokens,7);
});
test('even a complete positive source judgment does not certify runtime acceptance',async t=>{
 const q=declaredQuality('pass');Object.assign(q.fixed_reference,{exact_lower:'100',exact_upper:'100',mandatory_compliance:true,critical_status:'none_observed',partial_items:0,undetermined_items:0});
 const r=await gradedFixture(t,q);assert.equal(r.output.notes.outcome,'unknown');assert.deepEqual(r.output.quality_observation,q);
});
for(const bad of ['range','evidence','mandatory','runtime'])test(`invalid optional ${bad} quality becomes Unknown without erasing execution or grading usage`,async t=>{
 const q=declaredQuality();if(bad==='range')q.fixed_reference.exact_upper='1';if(bad==='evidence')q.evidence_refs[0].digest=canonicalDigest('different');
 if(bad==='mandatory'){q.outcome='pass';q.fixed_reference.mandatory_compliance=false;}if(bad==='runtime')q.fixed_reference.runtime_acceptance_verified=true;
 const r=await gradedFixture(t,q);assert.equal(r.status,'completed');assert.equal(r.output.ready_for_next_root,true);assert.equal(r.output.notes.outcome,'unknown');
 assert.equal(r.output.quality_observation,null);assert.ok(r.output.quality_observation_issue);assert.equal(r.output.grade.provider_observation.metrics.input_tokens,7);
});
test('a nonterminal grade cannot donate typed quality and legacy grades retain their exit semantics',async t=>{
 const uncertain=await gradedFixture(t,declaredQuality('fail'),{terminal:false});assert.equal(uncertain.output.ready_for_next_root,false);assert.equal(uncertain.output.notes.outcome,'unknown');assert.equal(uncertain.output.quality_observation,null);
 const legacy=await gradedFixture(t,undefined);assert.equal(legacy.output.notes.outcome,'pass');assert.equal(legacy.output.quality_observation,null);
});

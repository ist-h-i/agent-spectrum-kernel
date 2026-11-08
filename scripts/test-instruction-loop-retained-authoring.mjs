import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {prepareGitBaseline} from './ask-user-comparison-prepare.mjs';
import {appendRunJournal,readRunJournal} from './instruction-run-journal.mjs';
import {fullGenerationInput} from './instruction-loop-full-candidate.mjs';
import {createNativeInstructionLoopConfiguration,prepareNextNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {prepareRetainedFullAuthoringConfiguration} from './instruction-loop-failed-preparation.mjs';
import {inspectClosedFullAuthoring,readRetainedFullAuthoring,retainedFullAuthoringProvider} from './instruction-loop-retained-authoring.mjs';
function fixture(t,{bound=false}={}){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'ask-retained-answer-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const source=join(base,'source');mkdirSync(join(source,'skills/demo'),{recursive:true});writeFileSync(join(source,'skills/demo/SKILL.md'),'Original public instruction.\n');
 const revision=prepareGitBaseline(source),root=join(base,'old-run'),session=join(base,'old-session');mkdirSync(root);mkdirSync(session);
 const context={cli_version:'fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null},command={argv:[process.execPath,'-e','process.exit(0)'],pins:[],timeout_ms:5000,model_calls:false};
 const p={kind:'full_practical_instruction_loop_profile_v1',protectedRoot:base,stateRoot:join(base,'old-state'),storeRoot:join(base,'store'),normal:{target:null},
  baselineEnvironmentObjectDigest:canonicalDigest('baseline'),generator:{storeRoot:join(base,'store'),baselineSourceRoot:source,baselineRevision:revision,skills:['demo'],goal:'Improve useful public instructions.',
   candidateRoot:join(base,'old-candidate'),fullRoot:join(base,'old-full'),stagingRoot:join(base,'old-staging'),provider:{kind:'codex',sessionRoot:session}},
  selection:{limit:1},policy:{kind:'reference_instruction_loop_v1',id:'failed-authoring',observation:{goal:'Improve useful public instructions.'},catalog:[{id:'public',public_input_digest:canonicalDigest('public')}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:null,evaluation_mode:'practical_v1',formal_admission_implied:false},
  practical:{root:join(base,'old-evaluation'),baselineRoot:join(base,'baseline-full'),conditions:{baseline:{context,command,command_role:'check'},candidate:{context,command,command_role:'check'}}}};
 const profilePath=join(base,'profile.json'),configPath=join(base,'config.json');writeFileSync(profilePath,JSON.stringify(p));
 const config=createNativeInstructionLoopConfiguration(profilePath);writeFileSync(configPath,JSON.stringify(config));
 const pending={kind:'generate',key:'generate',input:{observation:p.policy.observation}};appendRunJournal(root,'operation_uncertain',{policy:config.policy,status:'operation_uncertain',pending,outputs:{},trials:[]},{reason:'Source writer failed after a closed provider answer.'});
 const response={changes:[{operation:'write',path:'skills/demo/SKILL.md',text:'Changed public instruction.\n'}]},responsePath=join(session,'last-message.json');writeFileSync(responsePath,JSON.stringify(response));
 const stdout=[{type:'thread.started'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(response)}},{type:'turn.completed',usage:{input_tokens:20,output_tokens:10}}].map(JSON.stringify).join('\n')+'\n';
 const execution={kind:'full_authoring_execution_v1',model_call_authorized:true,spawn_observed:true,termination_confirmed:true,exit_code:0,signal:null,error:null,timed_out:false,interrupted:false,output_limited:false,duration_ms:10,
 stdout:{text:stdout,total_bytes:Buffer.byteLength(stdout),truncated:false},closure_scope:'direct local child only; remote work not inferred',...(bound?{input_digest:canonicalDigest(fullGenerationInput({...p.generator,observation:p.policy.observation})),response_ref:{path:responsePath,digest:hash(readFileSync(responsePath))}}:{})};
 const executionPath=join(session,'provider-execution.json');writeFileSync(executionPath,JSON.stringify(execution));
 return {base,root,profilePath,configPath,p,response,responsePath,execution,executionPath,outputRoot:join(base,'fresh'),id:'fresh-retained',before:hash(readFileSync(join(root,'000000.json')))};
}
for(const bound of [false,true])test(`closed ${bound?'request-bound':'legacy transcript-bound'} authoring is retained without dispatch, fee recount or prior-state mutation`,t=>{
 const f=fixture(t,{bound}),prepared=prepareRetainedFullAuthoringConfiguration(f),p=JSON.parse(readFileSync(prepared.profile_path));
 assert.equal(prepared.models_started,false);assert.equal(prepared.approval_carried_forward,false);assert.equal(existsSync(prepared.run_root),false);
 assert.notEqual(p.practical.root,f.p.practical.root);assert.equal(existsSync(p.generator.candidateRoot),false);
 assert.equal(hash(readFileSync(join(f.root,'000000.json'))),f.before);assert.equal(readRunJournal(f.root).state.status,'operation_uncertain');
 assert.deepEqual(prepareRetainedFullAuthoringConfiguration(f),prepared);
 const input=fullGenerationInput({...p.generator,observation:p.policy.observation}),provided=retainedFullAuthoringProvider(p.generator.provider,input);
 assert.deepEqual(provided.response,f.response);assert.equal(provided.execution.model_calls,0);assert.equal(provided.execution.prior_usage_recounted,false);
 assert.equal(provided.execution.input_evidence,bound?'recorded_request_digest':'reconstructed_from_pinned_profile_and_source');
 assert.throws(()=>retainedFullAuthoringProvider(p.generator.provider,{...input,goal:'Another request'}),/changed request/);
});
for(const [label,mutate] of [
 ['unconfirmed closure',f=>f.execution.termination_confirmed=false],['provider error',f=>f.execution.error='failed'],['unknown timeout flag',f=>delete f.execution.timed_out],['activity after completion',f=>{const s=f.execution.stdout;s.text+=JSON.stringify({type:'turn.started'})+'\n';s.total_bytes=Buffer.byteLength(s.text);}],['multiple starts',f=>{const s=f.execution.stdout;s.text=JSON.stringify({type:'turn.started'})+'\n'+JSON.stringify({type:'turn.started'})+'\n'+s.text;s.total_bytes=Buffer.byteLength(s.text);}],['missing terminal event',f=>{const s=f.execution.stdout;s.text=s.text.split('\n').filter(l=>!l.includes('turn.completed')).join('\n');s.total_bytes=Buffer.byteLength(s.text);}],
 ['truncated answer',f=>f.execution.stdout.truncated=true],['changed response',f=>writeFileSync(f.responsePath,JSON.stringify({changes:[]}))],
 ['bad recorded input',f=>f.execution.input_digest=canonicalDigest('wrong')],['active coordinator',f=>mkdirSync(join(f.root,'.advance-lock'))],
 ['overlapping source',f=>f.outputRoot=join(f.p.generator.baselineSourceRoot,'nested')],
 ['existing case effects',f=>{const h=readRunJournal(f.root);h.state.trials.push({});appendRunJournal(f.root,'changed',h.state);}],
 ['changed config',f=>writeFileSync(f.configPath,JSON.stringify({policy:{},runtime:{}}))]
])test(`retained recovery refuses ${label} before allocating new work`,t=>{
 const f=fixture(t);mutate(f);writeFileSync(f.executionPath,JSON.stringify(f.execution));assert.throws(()=>prepareRetainedFullAuthoringConfiguration(f));assert.equal(existsSync(join(f.base,'fresh')),false);
});
test('partial preparation, origin/answer drift and changed original journal are retained and refused',t=>{
 const a=fixture(t);mkdirSync(a.outputRoot);writeFileSync(join(a.outputRoot,'partial'),'retain');assert.throws(()=>prepareRetainedFullAuthoringConfiguration(a),/partial/);assert.equal(readFileSync(join(a.outputRoot,'partial'),'utf8'),'retain');
 for(const what of ['origin','answer','journal','profile']){
  const f=fixture(t),prepared=prepareRetainedFullAuthoringConfiguration(f),p=JSON.parse(readFileSync(prepared.profile_path));
  if(what==='origin')writeFileSync(p.generator.provider.retainedAuthoring.path,'{}');
  if(what==='answer')writeFileSync(f.responsePath,'{}');
  if(what==='journal'){const h=readRunJournal(f.root);appendRunJournal(f.root,'later',h.state);}
  if(what==='profile'){const old=JSON.parse(readFileSync(f.profilePath));old.generator.goal='Changed';writeFileSync(f.profilePath,JSON.stringify(old));}
  assert.throws(()=>readRetainedFullAuthoring(p.generator.provider.retainedAuthoring));
 }
});
test('retained response preparation reaches fresh case and result judgments; next cycle restores the original model port',async t=>{
 const f=fixture(t),prepared=prepareRetainedFullAuthoringConfiguration(f),p=JSON.parse(readFileSync(prepared.profile_path)),config=JSON.parse(readFileSync(prepared.config_path));
 const {advanceSupervisedInstructionLoop}=await import('./supervised-instruction-loop.mjs');const calls=[],receipts=new Map();
 const runtime={digest:config.policy.runtime_digest,inspect:async job=>receipts.get(canonicalDigest(job))??{status:'unknown'}};
 for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore','evaluate','resumeEvaluation'])runtime[kind]=async job=>{
  calls.push(kind);if(kind==='generate')retainedFullAuthoringProvider(p.generator.provider,fullGenerationInput({...p.generator,observation:job.input.observation}));
  const result={request_digest:canonicalDigest(job),status:'completed',output:kind==='select'?{case_ids:['public']}:kind==='register'?{registry:{snapshot_digest:canonicalDigest('synthetic registry'),trusted_authority_contexts:[]}}:kind==='evaluate'?{practical_status:'completed',trials:[],report:{formal_score:null}}:kind==='trial'?{ready_for_next_root:true}:{synthetic:true}};receipts.set(canonicalDigest(job),result);return result;
 };
 const run=extra=>advanceSupervisedInstructionLoop({root:prepared.run_root,policy:config.policy,runtime,...extra});
 let state=await run();assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(calls.includes('evaluate'),false);
 state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic new-case judgment.'}});assert.equal(state.status,'awaiting_result_review');assert.equal(calls.includes('apply'),false);
 state=await run({decision:{disposition:'rejected',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic result rejection.'}});assert.equal(state.status,'completed');assert.equal(readRunJournal(f.root).state.status,'operation_uncertain');
 const next=prepareNextNativeInstructionLoopConfiguration({root:prepared.run_root,profilePath:prepared.profile_path,configPath:prepared.config_path,outputRoot:join(f.base,'next'),id:'next-after-retained'});
 const nextProfile=JSON.parse(readFileSync(next.profile_path));assert.equal(nextProfile.generator.provider.kind,'codex');assert.equal(nextProfile.generator.provider.retainedAuthoring,undefined);assert.equal(nextProfile.generator.provider.sessionRoot,join(f.base,'next/generation-session'));assert.equal(next.models_started,false);
});

test('replacement accepts only pre-case task commands and binds the fresh approval runtime',t=>{
 const f=fixture(t),replacement=structuredClone(f.p);replacement.practical.conditions.baseline.context.cli_version='fresh host adapter';
 const file=join(f.base,'replacement.json');writeFileSync(file,JSON.stringify(replacement));f.replacementProfilePath=file;
 const prepared=prepareRetainedFullAuthoringConfiguration(f);assert.equal(JSON.parse(readFileSync(prepared.profile_path)).practical.conditions.baseline.context.cli_version,'fresh host adapter');
 const g=fixture(t),bad=structuredClone(g.p);bad.generator.goal='A different authoring request';g.replacementProfilePath=join(g.base,'bad.json');writeFileSync(g.replacementProfilePath,JSON.stringify(bad));assert.throws(()=>prepareRetainedFullAuthoringConfiguration(g),/replacement may change only/);assert.equal(existsSync(g.outputRoot),false);
});

function preparedCase(t){
 const f=fixture(t,{bound:true}),h=readRunJournal(f.root),candidate={source_revision:'synthetic-closed-source',generated_by_this_loop:true};
 h.state.pending=null;h.state.status='awaiting_evaluation_approval';h.state.gate={kind:'evaluation',packet:{candidate}};
 h.state.outputs={generate:candidate,register:candidate,select:{case_ids:['public']}};
 appendRunJournal(f.root,'human_gate',h.state);return f;
}
test('pre-evaluation reconfiguration retains the exact closed answer with fresh grader and no approval/model replay',t=>{
 const f=preparedCase(t),replacement=structuredClone(f.p);replacement.practical.cases=[{id:'public',grader:{argv:['old']}}];
 // Cases remain identical except for the trusted grader definition.
 f.p.practical.cases=structuredClone(replacement.practical.cases);writeFileSync(f.profilePath,JSON.stringify(f.p));
 const config=createNativeInstructionLoopConfiguration(f.profilePath);writeFileSync(f.configPath,JSON.stringify(config));
 const h=readRunJournal(f.root);h.state.policy=config.policy;appendRunJournal(f.root,'profile_fixture_binding',h.state);
 replacement.practical.cases[0].grader={argv:['new'],model_calls:false};const path=join(f.base,'replacement.json');writeFileSync(path,JSON.stringify(replacement));
 const before=readRunJournal(f.root).previous,prepared=prepareRetainedFullAuthoringConfiguration({...f,replacementProfilePath:path,preEvaluation:true}),p=JSON.parse(readFileSync(prepared.profile_path));
 assert.equal(prepared.models_started,false);assert.equal(prepared.approval_carried_forward,false);assert.equal(prepared.pre_evaluation_reconfiguration,true);
 assert.equal(readRunJournal(f.root).previous,before);assert.equal(p.practical.cases[0].grader.argv[0],'new');
 const retained=readRetainedFullAuthoring(p.generator.provider.retainedAuthoring);assert.equal(retained.origin.kind,'retained_full_authoring_origin_v2');assert.equal(retained.origin.source_status,'awaiting_evaluation_approval');
 assert.deepEqual(retainedFullAuthoringProvider(p.generator.provider,fullGenerationInput({...p.generator,observation:p.policy.observation})).response,f.response);
 assert.equal(existsSync(prepared.run_root),false);
});
for(const [label,mutate] of [
 ['case approval',s=>s.evaluation_decision={disposition:'approved'}],['pending work',s=>s.pending={kind:'evaluate'}],
 ['owner plan',s=>s.outputs.plan={}],['wrong gate',s=>s.gate.kind='result'],['trial',s=>s.trials.push({})],
])test(`pre-evaluation reconfiguration refuses ${label}`,t=>{
 const f=preparedCase(t),h=readRunJournal(f.root);mutate(h.state);appendRunJournal(f.root,'changed',h.state);
 assert.throws(()=>prepareRetainedFullAuthoringConfiguration({...f,preEvaluation:true}));assert.equal(existsSync(f.outputRoot),false);
});
test('pre-evaluation replacement cannot change public cases or the authoring request',t=>{
 const f=preparedCase(t),replacement=structuredClone(f.p);replacement.practical.cases=[{id:'different',files:[]}];
 const path=join(f.base,'replacement.json');writeFileSync(path,JSON.stringify(replacement));
 assert.throws(()=>prepareRetainedFullAuthoringConfiguration({...f,preEvaluation:true,replacementProfilePath:path}),/replacement may change only/);
 assert.equal(existsSync(f.outputRoot),false);
});

test('advancing the old pre-case gate invalidates the v2 retained origin without carrying its approval',t=>{
 const f=preparedCase(t),prepared=prepareRetainedFullAuthoringConfiguration({...f,preEvaluation:true}),p=JSON.parse(readFileSync(prepared.profile_path));
 const h=readRunJournal(f.root);h.state.evaluation_decision={disposition:'approved'};h.state.status='advancing';h.state.gate=null;appendRunJournal(f.root,'later_case_approval',h.state);
 assert.throws(()=>readRetainedFullAuthoring(p.generator.provider.retainedAuthoring));
});

function initializationFixture(t){
 const f=fixture(t,{bound:true});rmSync(f.responsePath);f.execution.exit_code=1;delete f.execution.response_ref;
 f.execution.stdout={text:'',total_bytes:0,truncated:false};const diagnostic='Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n';
 f.execution.stderr={text:diagnostic,total_bytes:Buffer.byteLength(diagnostic),truncated:false};writeFileSync(f.executionPath,JSON.stringify(f.execution));
 const operationRoot=f.base;const current={root:f.root,profile_path:f.profilePath,profile_digest:hash(readFileSync(f.profilePath)),config_path:f.configPath,config_digest:canonicalDigest(JSON.parse(readFileSync(f.configPath)))};
 appendRunJournal(operationRoot,'operation_uncertain',{status:'operation_uncertain',current,preparation:null});
 return {...f,operationRoot,reason:'One fresh read-only authoring retry after observed local initialization failure.'};
}
const noWriters=({taskRoot,assessRoot})=>({same_uid_cwd_observation:true,observer_visible:true,matching_writers:[],workers_absent:true,provider_closure_inferred:false,owned_roots:[taskRoot,assessRoot]});
test('one initialization retry prepares fresh exact-input authoring, preserves consumed work and prevents forks',async t=>{
 const f=initializationFixture(t),api=await import('./instruction-loop-failed-preparation.mjs');
 assert.equal(typeof api.prepareFullAuthoringInitializationRetry,'function');
 const before=readRunJournal(f.root).previous,opBefore=readRunJournal(f.operationRoot).previous;
 const result=api.prepareFullAuthoringInitializationRetry(f,noWriters),p=JSON.parse(readFileSync(result.profile_path));
 assert.equal(result.models_started,false);assert.equal(result.approval_carried_forward,false);assert.equal(result.remote_closure,'Unknown');
 assert.equal(existsSync(result.run_root),false);assert.equal(existsSync(p.generator.provider.sessionRoot),false);
 assert.equal(canonicalDigest(fullGenerationInput({...p.generator,observation:p.policy.observation})),f.execution.input_digest);
 assert.equal(readRunJournal(f.root).previous,before);assert.equal(readRunJournal(f.operationRoot).previous,opBefore);
 assert.deepEqual(api.prepareFullAuthoringInitializationRetry(f,noWriters),result);
 assert.throws(()=>api.prepareFullAuthoringInitializationRetry({...f,outputRoot:join(f.base,'fork'),id:'fork'},noWriters),/different|reserved/);
 assert.equal(existsSync(join(f.base,'fork')),false);
});
for(const [name,mutate]of [
 ['stdout activity',f=>f.execution.stdout={text:'{}\n',total_bytes:3,truncated:false}],
 ['timeout',f=>f.execution.timed_out=true],['truncated stderr',f=>f.execution.stderr.truncated=true],
 ['other failure',f=>f.execution.stderr.text='unrecognized failure'],['missing input',f=>delete f.execution.input_digest],
 ['saved answer',f=>writeFileSync(f.responsePath,'{}')],['active writer',f=>f.writers=true],
 ['parent advancing',f=>{let h=readRunJournal(f.operationRoot);h.state.status='advancing';appendRunJournal(f.operationRoot,'changed',h.state);}]
])test(`initialization retry rejects ${name} without allocating a new run`,async t=>{
 const f=initializationFixture(t);mutate(f);writeFileSync(f.executionPath,JSON.stringify(f.execution));const {prepareFullAuthoringInitializationRetry:prepare}=await import('./instruction-loop-failed-preparation.mjs');
 assert.equal(typeof prepare,'function');assert.throws(()=>prepare(f,args=>({...noWriters(args),matching_writers:f.writers?[{pid:123}]:[]})));assert.equal(existsSync(f.outputRoot),false);
});

test('initialization retry refuses a foreign output directory before reserving its slot',async t=>{
 const f=initializationFixture(t);mkdirSync(f.outputRoot);writeFileSync(join(f.outputRoot,'foreign'),'keep');
 const {prepareFullAuthoringInitializationRetry:prepare}=await import('./instruction-loop-failed-preparation.mjs');
 assert.throws(()=>prepare(f,noWriters),/fresh.*output/);assert.equal(readFileSync(join(f.outputRoot,'foreign'),'utf8'),'keep');
 assert.equal(existsSync(join(f.root,'.authoring-initialization-retry')),false);
});

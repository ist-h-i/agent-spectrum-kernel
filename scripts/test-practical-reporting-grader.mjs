import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,realpathSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {environmentFixture} from './test-helpers-instruction-environment.mjs';
import {captureInstructionEnvironment,exportInstructionEnvironment} from './instruction-environment.mjs';
import {prepareFullPracticalInstructionSelection,createFullPracticalInstructionLoopConfiguration} from './instruction-loop-practical-runtime.mjs';
import {executePracticalEvaluationWorker} from './practical-evaluation-worker.mjs';
import {createPracticalReportingGraderCommand,runReportingCodexBackend,practicalReportingGraderPins} from './practical-reporting-grader.mjs';
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const read=p=>JSON.parse(readFileSync(p));
function fixture(t,fixtureId='ordinary-frontend-review-evidence-gap',mutation='none'){
 const f=environmentFixture(t),baseline=captureInstructionEnvironment({...f.options,selectionObjectDigest:null});
 const candidate=captureInstructionEnvironment({...f.options,selectionObjectDigest:null,environmentId:'candidate'});
 const baselineRoot=join(f.root,'baseline'),candidateRoot=join(f.root,'candidate');
 exportInstructionEnvironment({...f.options,environmentObjectDigest:baseline.object_digest,outputRoot:baselineRoot});
 exportInstructionEnvironment({...f.options,environmentObjectDigest:candidate.object_digest,outputRoot:candidateRoot});
 const save=(name,value)=>{const path=join(f.root,name);mkdirSync(dirname(path),{recursive:true});const bytes=typeof value==='string'?value:JSON.stringify(value);writeFileSync(path,bytes);return {path,digest:hash(bytes)};};
 const formal=fixtureId==='mp-frontend-state-review';
 const requirements=[{requirement_id:'verification-conclusion',max_points:2,partial_credit_allowed:false},
  ...(formal?[{requirement_id:'evidence-and-review-precision',max_points:1,partial_credit_allowed:false}]:[]),
  {requirement_id:'other-original-criterion',max_points:formal?7:8,partial_credit_allowed:false}];
 const judgment={requirements:requirements.map(r=>({id:r.requirement_id,status:'unknown',reason:'Synthetic missing evidence.',evidence:['task-command-evidence.json']}))};
 const sidecar=requirements.filter(r=>r.requirement_id!=='other-original-criterion').map(r=>({id:r.requirement_id,basis:'missing',counterevidence:[]}));
 const primary=structuredClone(judgment);primary.requirements[0].status='fail';
 const config={model:null,reasoning:null,checks:[],
  requirements:save('inputs/requirements.json',{fixture_id:fixtureId,requirements}),
  evidence_map:save('inputs/evidence-map.json',{fixture_id:fixtureId,scope_boundary_authority:{allowed_candidate_paths:['workspace/review.json'],required_candidate_paths:['workspace/review.json']}}),
  verification_contract:save('inputs/contract.json',{fixture_id:fixtureId,schema_version:'1.2.0',commands:[{command_id:'review-validation',requirement:'required',
   canonical_script:formal?'original-eleven-file-digest-check && npm run validate:review':'npm run validate:review',working_directory:{evidence_requirement:'not_required'}}]})};
 const publicInput=save('inputs/note.txt','Synthetic public input.');
 const files=[{source:publicInput.path,target:'workspace/note.txt',digest:publicInput.digest}];
 const spec={id:fixtureId,files,task_ref:'synthetic-task',input_ref:'synthetic-input',success_criteria_ref:'synthetic-criteria',reporting_grader:{kind:'caller_reference_reporting_v3',config,
  backend:{kind:'fixture',replies:{primary:{judgment:primary,reporting_evidence:sidecar},verification:{verdict:'correct',judgment,review:'Explicit correction of missing-only failure.',reporting_evidence:sidecar}}}}};
 const task=save('task.mjs',`import {writeFileSync} from 'node:fs'; import {join} from 'node:path'; import {createHash} from 'node:crypto';
const [root,request,command,invocation]=process.argv.slice(2); const save=(p,v)=>writeFileSync(join(root,p),JSON.stringify(v));
writeFileSync('workspace/review.json',JSON.stringify({verification:${JSON.stringify(mutation)}==='contradicted'?'Validator failed.':'Evidence unavailable.'}));
const item={id:'synthetic-command',type:'command_execution',command:${JSON.stringify(mutation)}==='mixed-read'?'cat .agents/skills/demo/SKILL.md && npm run validate:review':${JSON.stringify(mutation)}==='instruction-read'?'cat .agents/skills/demo/SKILL.md':'npm run validate:review',aggregated_output:''};
let jsonl=[{type:'item.started',item:{...item,status:'in_progress',exit_code:null}},{type:'item.completed',item:{...item,status:'completed',exit_code:0}}].map(v=>JSON.stringify(v)).join('\\n')+'\\n';
if(${JSON.stringify(mutation)}==='truncated')jsonl=jsonl.slice(0,-1);
writeFileSync(join(root,'task-codex.stdout.jsonl'),jsonl);
if(${JSON.stringify(mutation)}!=='missing')save('task-codex-provider.json',{request_digest:${JSON.stringify(mutation)}==='request-mismatch'?'sha256:'+ '0'.repeat(64):request,command_digest:${JSON.stringify(mutation)}==='command-mismatch'?'sha256:'+'0'.repeat(64):command,invocation_digest:${JSON.stringify(mutation)}==='invocation-mismatch'?'sha256:'+'0'.repeat(64):invocation,terminal:true,provider_ref:'synthetic',
local:{spawn_observed:true,termination_confirmed:true,exit_code:0,error:null,output_limited:false,timed_out:false,interrupted:false},
observation:{kind:'provider_observation_v1',scope:'root',metrics:{input_tokens:0,output_tokens:0,cached_tokens:0},artifacts:[{path:'task-codex.stdout.jsonl',digest:'sha256:'+createHash('sha256').update(jsonl).digest('hex')}]}});
`);
 const command={argv:[process.execPath,task.path,'{evaluation_control_root}','{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}'],pins:[task],timeout_ms:10000,model_calls:false,...(['none','truncated','mixed-read','instruction-read','contradicted'].includes(mutation)?{provider_closure_path:'task-codex-provider.json'}:{})};
 const context={cli_version:'fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
 const catalog=[{id:fixtureId,public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest}))),tags:['routing'],domain:'local'}];
 const profile={kind:'full_practical_instruction_loop_profile_v1',protectedRoot:f.root,normal:{target:null},stateRoot:join(f.root,'state'),storeRoot:f.storeRoot,policy:{kind:'reference_instruction_loop_v1',id:'synthetic-reporting',repetitions:1,evaluation_mode:'practical_v1',normal_target:null},
  generator:{skills:['demo'],provider:{kind:'fixture'},baselineSourceRoot:join(f.root,'source-baseline'),candidateRoot:join(f.root,'source-candidate'),fullRoot:candidateRoot,stagingRoot:join(f.root,'staging')},baselineEnvironmentObjectDigest:baseline.object_digest,selection:{limit:1},
  practical:{root:join(f.root,'evaluation'),baselineRoot,evidence_kind:'synthetic',environmentTrust:{trustedPortfolioAuthorityContexts:f.options.trustedPortfolioAuthorityContexts},
   conditions:{baseline:{context,command},candidate:{context,command}},cases:[spec],recovery:{},global_context:{}}};
 mkdirSync(profile.stateRoot);
 const selectionJob={input:{candidate:{full_root:candidateRoot,environment_object_digest:candidate.object_digest},observation:{goal:'Synthetic reporting integration.'},catalog}};
 async function run(){const profileRef=save('profile.json',profile),configuration=createFullPracticalInstructionLoopConfiguration(profileRef.path);
  for(const source of practicalReportingGraderPins())assert.ok(configuration.runtime.source_pins.some(p=>p.path===source.path&&p.digest===source.digest));
  const selected=prepareFullPracticalInstructionSelection(profile,selectionJob),settings=read(selected.practical_runtime.commands.trial.argv[2]);
  const root=join(f.root,'attempt');mkdirSync(root);const job={kind:'trial',input:{row:{case_id:fixtureId,condition:'baseline',public_input_digest:catalog[0].public_input_digest}}};
  writeFileSync(join(root,'request.json'),JSON.stringify(job));
  const result=await executePracticalEvaluationWorker(settings,job,join(root,'result.json'));
  return {result,root,settings,selected};}
 return {...f,save,spec,profile,selectionJob,run};
}
for(const id of ['easy-ordinary-refund-review','ordinary-frontend-review-evidence-gap','mp-frontend-state-review'])test(`standard profile -> worker -> policy -> receipt: ${id}`,async t=>{
 const f=fixture(t,id),{result,root,settings,selected}=await f.run();
 assert.equal(result.output.ready_for_next_root,true);assert.equal(result.output.notes.outcome,'unknown');
 assert.equal(selected.practical_runtime.commands.trial.model_calls,false);
 assert.equal(result.output.quality_observation.fixed_reference.exact_lower,'0');assert.equal(result.output.quality_observation.fixed_reference.exact_upper,'10');
 assert.equal(read(join(root,'private-grade/primary-judgment.json')).status,'invalid_primary_contract');
 assert.equal(read(join(root,'private-grade/final-judgment.json')).requirements[0].status,'unknown');
 assert.equal(read(join(root,'reporting-task-evidence.json')).saved_observation_capture_valid,true);
 assert.equal(read(join(root,'reporting-command-capture.json')).observations[0].invocation.equivalence,'unknown');
 const grader=settings.cases[id].grader,generated=read(grader.argv[2]);assert.equal(hash(readFileSync(grader.argv[2])),grader.argv[3]);
 assert.deepEqual(generated.config.verification_contract,f.spec.reporting_grader.config.verification_contract);
 for(const item of practicalReportingGraderPins())assert.ok(grader.pins.some(p=>p.path===item.path&&p.digest===item.digest));
 const summaries=result.output.grade.provider_observation.artifacts;assert.ok(summaries.some(a=>a.path==='grade-summary.json'));
 assert.equal(read(join(root,'grade-summary.json')).calls.length,2);
});
for(const mutation of ['missing','truncated'])test(`${mutation} task capture yields Unknown, never a manufactured Fail`,async t=>{
 const {result,root}=await fixture(t,undefined,mutation).run();assert.equal(result.output.notes.outcome,'unknown');
 assert.equal(read(join(root,'reporting-task-evidence.json')).saved_observation_capture_valid,false);
 assert.equal(result.output.quality_observation.fixed_reference.exact_upper,'10');
});
for(const mutation of ['request-mismatch','command-mismatch','invocation-mismatch'])test(`${mutation} receipt rejects grading before dispatch and stays Unknown`,async t=>{
 const {result,root}=await fixture(t,undefined,mutation).run();assert.equal(result.output.ready_for_next_root,true);
 assert.equal(result.output.notes.outcome,'unknown');assert.equal(result.output.quality_observation.fixed_reference,null);
 assert.equal(existsSync(join(root,'private-grade')),false);assert.match(read(join(root,'grade-reporting-provider.json')).issue,/receipt (request|command|invocation) mismatch/);
});
test('unsupported selector, ambiguous external command, input drift and fixture backend in observed lane reject',t=>{
 const f=fixture(t),base={settingsPath:join(f.root,'settings.json'),spec:f.spec,conditions:[],evidenceKind:'synthetic'};
 assert.throws(()=>createPracticalReportingGraderCommand({...base,spec:{...f.spec,id:'other-case'}}),/unsupported reporting fixture/);
 assert.throws(()=>createPracticalReportingGraderCommand({...base,spec:{...f.spec,grader:{}}}),/choose/);
 assert.throws(()=>createPracticalReportingGraderCommand({...base,evidenceKind:'observed'}),/synthetic/);
 writeFileSync(f.spec.reporting_grader.config.requirements.path,'{}');assert.throws(()=>createPracticalReportingGraderCommand(base),/input drift/);
});
test('standard selection preserves external and absent graders byte-for-byte',t=>{
 const f=fixture(t),external={argv:[process.execPath,'existing.mjs'],pins:[],timeout_ms:1000,model_calls:false};
 delete f.spec.reporting_grader;f.spec.grader=external;
 let selected=prepareFullPracticalInstructionSelection(f.profile,f.selectionJob),settings=read(selected.practical_runtime.commands.trial.argv[2]);
 assert.deepEqual(settings.cases[f.spec.id].grader,external);
 delete f.spec.grader;f.profile.stateRoot=join(f.root,'no-grader');mkdirSync(f.profile.stateRoot);
 selected=prepareFullPracticalInstructionSelection(f.profile,f.selectionJob);settings=read(selected.practical_runtime.commands.trial.argv[2]);assert.equal(settings.cases[f.spec.id].grader,undefined);
});
test('Codex transport requires authorization and a pinned executable; mocked session never starts a model',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'reporting-backend-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const executable=join(root,'fake-executable');writeFileSync(executable,'synthetic executable pin');
 const backend={kind:'codex',executable:{path:executable,digest:hash(readFileSync(executable))},timeout_ms:5000};
 const call={cwd:root,output:join(root,'reply.json'),prompt:'Synthetic policy prompt.',model:null,reasoning:null};let calls=0;
 const session=async options=>{calls++;assert.equal(options.terminationScope,'direct_child');assert.ok(options.argv.includes('read-only'));writeFileSync(call.output,'{}');
  return {spawnObserved:true,terminationConfirmed:true,exitCode:0,stdout:Buffer.from(JSON.stringify({type:'turn.completed',usage:{input_tokens:7,output_tokens:3,cached_input_tokens:2}})+'\n'),stderr:Buffer.alloc(0),durationMs:125};};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;
 try{await assert.rejects(runReportingCodexBackend(call,backend,session),/not authorized/);assert.equal(calls,0);
  process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';const result=await runReportingCodexBackend(call,backend,session);assert.equal(result.terminal,true);assert.equal(result.completed,true);assert.equal(calls,1);assert.deepEqual(result.metrics,{input_tokens:7,output_tokens:3,cached_tokens:2});assert.equal(result.provider_duration_ms,125);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

for(const id of ['easy-ordinary-refund-review','ordinary-frontend-review-evidence-gap','mp-frontend-state-review'])for(const failure of [false,true])test(`all-pass result preserves trusted public-check guard: ${id}, failure=${failure}`,async t=>{
 const f=fixture(t,id),validator=f.save('inputs/validate.mjs',`process.exit(${failure?1:0});\n`);
 f.spec.files.push({source:validator.path,target:'workspace/validate.mjs',digest:validator.digest});
 f.selectionJob.input.catalog[0].public_input_digest=canonicalDigest(f.spec.files.map(({target,digest})=>({target,digest})));
 f.spec.reporting_grader.config.checks=[[process.execPath,'validate.mjs','review.json']];
 const replies=f.spec.reporting_grader.backend.replies;
 for(const r of replies.primary.judgment.requirements)r.status='pass';
 for(const r of replies.primary.reporting_evidence)r.basis='supported';
 replies.verification={verdict:'agree',judgment:null,review:'Synthetic all-pass audit.',reporting_evidence:replies.primary.reporting_evidence};
 const {result,root}=await f.run(),summary=read(join(root,'grade-summary.json'));
 assert.equal(read(join(root,'private-grade/source/host-observations.json')).checks[0].exit_code,failure?1:0);
 if(failure){assert.equal(result.output.quality_observation.fixed_reference,null);assert.match(summary.issue,/full source score/);}
 else {assert.equal(summary.issue,null);assert.equal(result.output.quality_observation.fixed_reference.exact_lower,'10');assert.equal(result.output.quality_observation.fixed_reference.exact_upper,'10');}
 assert.equal(result.output.notes.outcome,'unknown','caller reference never becomes formal pass');
});

for(const event of ['turn.failed','error','authentication.required','approval.required','unknown.event','missing-terminal','invalid-json'])test(`closed exit-zero backend with ${event} cannot complete grading`,async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'reporting-terminal-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const executable=join(root,'fake-executable');writeFileSync(executable,'synthetic executable pin');
 const backend={kind:'codex',executable:{path:executable,digest:hash(readFileSync(executable))},timeout_ms:5000};
 const call={cwd:root,output:join(root,'reply.json'),prompt:'Synthetic.',model:null,reasoning:null};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{const result=await runReportingCodexBackend(call,backend,async()=>{writeFileSync(call.output,'{}');
  const stdout=event==='invalid-json'?'not-json':event==='missing-terminal'?JSON.stringify({type:'thread.started',thread_id:'synthetic'}):
   [JSON.stringify({type:event,message:'Synthetic failure.'}),JSON.stringify({type:'turn.completed',usage:{input_tokens:7,output_tokens:3,cached_input_tokens:2}})].join('\n');
  return {spawnObserved:true,terminationConfirmed:true,exitCode:0,stdout:Buffer.from(stdout+'\n'),stderr:Buffer.alloc(0),durationMs:123};
 });assert.equal(result.terminal,true);assert.equal(result.completed,false);assert.equal(result.text,null);assert.equal(result.provider_duration_ms,123);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

for(const mutation of ['mixed-read','instruction-read'])test(`${mutation}: only a pure instruction read can be omitted`,async t=>{
 const {result,root}=await fixture(t,undefined,mutation).run();assert.equal(result.output.ready_for_next_root,true);
 const capture=read(join(root,'reporting-command-capture.json')),evidence=read(join(root,'reporting-task-evidence.json'));
 assert.equal(capture.observations.length,1);
 assert.equal(evidence.observations.length,mutation==='mixed-read'?1:0);
 assert.equal(evidence.omitted_instruction_read_count,mutation==='mixed-read'?0:1);
 if(mutation==='mixed-read')assert.equal(evidence.observations[0].command,'cat .agents/skills/demo/SKILL.md && npm run validate:review');
});
test('standard profile preserves a concrete source-quoted Fail without rewriting it',async t=>{
 const f=fixture(t,undefined,'contradicted'),replies=f.spec.reporting_grader.backend.replies;
 const sidecar=[{id:'verification-conclusion',basis:'counterevidence',counterevidence:[{kind:'reported_outcome_contradicted',
  claim:{path:'candidate/workspace/review.json',quote:'Validator failed.'},observation:{path:'task-command-evidence.json',quote:'"exit_code": 0'},
  explanation:'The synthetic matching validator command completed with zero exit rather than the reported failure.'}]}];
 replies.primary.reporting_evidence=sidecar;replies.verification={verdict:'agree',judgment:null,review:'Synthetic source-checked contradiction.',reporting_evidence:sidecar};
 const {result,root}=await f.run();assert.equal(read(join(root,'grade-summary.json')).issue,null);
 assert.equal(read(join(root,'private-grade/final-judgment.json')).requirements[0].status,'fail');
 assert.equal(result.output.quality_observation.fixed_reference.exact_lower,'0');assert.equal(result.output.quality_observation.fixed_reference.exact_upper,'8');
});

test('reporting selector cannot enter the component runtime without its Full-profile source binding',t=>{
 const f=fixture(t);f.profile.kind='component_practical_instruction_loop_profile_v1';
 assert.throws(()=>prepareFullPracticalInstructionSelection(f.profile,f.selectionJob),/requires Full practical profile/);
 assert.equal(existsSync(join(f.profile.stateRoot,'practical-worker-settings.json')),false);
});

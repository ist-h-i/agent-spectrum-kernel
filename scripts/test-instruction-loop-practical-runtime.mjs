import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {environmentFixture} from './test-helpers-instruction-environment.mjs';
import {captureInstructionEnvironment,exportInstructionEnvironment,instructionBytesDigest as hash} from './instruction-environment.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {inspectPracticalEvaluation} from './practical-evaluation-runner.mjs';
import {prepareNextNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';

test('legacy recovery prompts keep their objective without inventing current approval',async()=>{
 const {buildPracticalEvaluationAssessmentPrompt}=await import('./practical-evaluation-assessor.mjs?legacy-context');
 const packet={kind:'fixture',issues:['missing_quality']},goal='Compare useful quality and cost.';
 const prompt=buildPracticalEvaluationAssessmentPrompt({kind:'assess',input:{packet,goal}});
 const payload=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
 assert.equal(payload.improvement_context,goal);assert.equal(payload.evaluation_decision,undefined);
 assert.deepEqual(payload.packet,packet);assert.equal(payload.packet_digest,canonicalDigest(packet));
 assert.match(prompt,/earlier authoring-stage instructions/);
 assert.match(prompt,/does not grant execution or application authority/);
});

test('public practical Eval inherits exactly the case approval and returns to the existing result gate, including AI recovery',async t=>{
  const f=environmentFixture(t),baseline=captureInstructionEnvironment({...f.options,selectionObjectDigest:null});
  const candidate=captureInstructionEnvironment({...f.options,selectionObjectDigest:null,environmentId:'fixture-candidate'});
  const baselineRoot=join(f.root,'baseline'),candidateRoot=join(f.root,'candidate');
  exportInstructionEnvironment({...f.options,environmentObjectDigest:baseline.object_digest,outputRoot:baselineRoot});
  exportInstructionEnvironment({...f.options,environmentObjectDigest:candidate.object_digest,outputRoot:candidateRoot});
  const script=join(f.root,'check.mjs');writeFileSync(script,'console.log("public user criterion");\n');
  const files=[{source:script,target:'check.mjs',digest:hash(readFileSync(script))}],inputDigest=canonicalDigest(files.map(({target,digest})=>({target,digest})));
  const command={argv:[process.execPath,'check.mjs'],pins:[{path:script,digest:hash(readFileSync(script))}],timeout_ms:5000,model_calls:false};
  const context={cli_version:'node-fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
  const policy={kind:'reference_instruction_loop_v1',id:'public-loop',observation:{goal:'Compare the useful local criterion with missing optional counters.'},
    catalog:[{id:'public',public_input_digest:inputDigest,tags:['routing'],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:null,
    evaluation_mode:'practical_v1',formal_admission_implied:false};
  const profile={kind:'full_practical_instruction_loop_profile_v1',protectedRoot:f.root,stateRoot:join(f.root,'state'),storeRoot:f.storeRoot,normal:{target:null},policy,
    generator:{storeRoot:f.storeRoot,skills:['demo'],provider:{kind:'fixture'},candidateRoot:join(f.root,'source-candidate'),baselineSourceRoot:join(f.root,'source-baseline'),fullRoot:candidateRoot,stagingRoot:join(f.root,'staging')},
    baselineEnvironmentObjectDigest:baseline.object_digest,selection:{limit:1},practical:{root:join(f.root,'evaluation'),baselineRoot,evidence_kind:'synthetic',
      environmentTrust:{trustedPortfolioAuthorityContexts:f.options.trustedPortfolioAuthorityContexts},
      conditions:{baseline:{context,command,command_role:'check'},candidate:{context,command,command_role:'check'}},
      cases:[{id:'public',task_ref:'public-task',input_ref:'frozen-public-input',success_criteria_ref:'local-check',files}],
      recovery:{max_extra_trials:2,max_retries_per_row:1,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration','usage']},
      global_context:{ask_presence:'unknown',change_status:'unknown'}}};
  const generated={full_root:candidateRoot,environment_object_digest:candidate.object_digest,registry:{snapshot_digest:f.options.registrySnapshotDigest,trusted_authority_contexts:[]}};
  const lifecycle=[];
  t.mock.module('./instruction-loop-native-host.mjs',{namedExports:{executeNativeInstructionLoopStage:async(p,job)=>{
    lifecycle.push(job.kind);assert.ok(['generate','register'].includes(job.kind),'owner operation must not run without the second decision');return generated;}}});
  const {createFullPracticalInstructionLoopConfiguration,createFullPracticalInstructionLoopRuntime,prepareFullPracticalInstructionSelection}=await import('./instruction-loop-practical-runtime.mjs?integration');
  const profilePath=join(f.root,'profile.json');writeFileSync(profilePath,JSON.stringify(profile));
  const config=createFullPracticalInstructionLoopConfiguration(profilePath),configPath=join(f.root,'config.json');writeFileSync(configPath,JSON.stringify(config));
  assert.ok(config.runtime.source_pins.some(p=>p.path.endsWith('/practical-initialization-clearance.mjs')),'new runtime pins the transitive recovery validator');
  const runtime=createFullPracticalInstructionLoopRuntime({definition:config.runtime});
  await assert.rejects(advanceSupervisedInstructionLoop({root:baselineRoot,policy:config.policy,runtime}),/coordinator overlaps/);
  assert.equal(existsSync(join(baselineRoot,'000000.json')),false);
  const root=join(f.root,'run'),run=extra=>advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,...extra});
  let state=await run();assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(existsSync(profile.practical.root),false);
  assert.deepEqual(lifecycle,['generate','register']);
  state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic approval of the public cases and reserved retries.'}});
  assert.equal(state.status,'awaiting_ai_recovery');assert.equal(state.pending_gate,null);
  const choice=packet=>({packet_digest:canonicalDigest(packet),action:'use',retry_scope:null,selection_basis:'practical_reference',
    reason:'The public check and time are useful; absent token counters do not require rerunning the task.',used_dimensions:packet.available_dimensions,
    comparison_limits:['Token usage remains unknown; no generalized improvement claim.']});
  while(state.status==='awaiting_ai_recovery')state=await run({assessment:choice(state.pending_recovery)});
  assert.equal(state.status,'awaiting_result_review');
  const inner=inspectPracticalEvaluation(profile.practical.root);assert.equal(inner.status,'completed');assert.equal(inner.report.all_attempts.length,2);
  assert.equal(inner.report.recovery_decisions.length,2);assert.ok(inner.report.pragmatic.summaries.every(s=>s.reported_outcome_counts.pass===1));
  state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic result review only; no target selected.'}});
  assert.equal(state.final.outcome,'result_approved_retained');assert.equal(state.application,null);
  assert.deepEqual(lifecycle,['generate','register']);
  const next=prepareNextNativeInstructionLoopConfiguration({root,profilePath,configPath,outputRoot:join(f.root,'next'),id:'next-public'});
  const nextProfile=JSON.parse(readFileSync(next.profile_path));assert.equal(nextProfile.policy.evaluation_mode,'practical_v1');
  assert.equal(next.models_started,false);assert.equal(nextProfile.practical.baselineRoot,baselineRoot);
  assert.notEqual(nextProfile.practical.root,profile.practical.root);
  const executable=join(f.root,'recovery-provider');writeFileSync(executable,'trusted model-free executable pin fixture');
  const pinned=structuredClone(profile);pinned.stateRoot=join(f.root,'pin-selection-state');mkdirSync(pinned.stateRoot);
  pinned.practical.assessor={kind:'codex',executable,executableDigest:hash(readFileSync(executable)),model:null,timeout_ms:5000};
  const selectionJob={input:{candidate:generated,observation:policy.observation,catalog:policy.catalog}};
  const selected=prepareFullPracticalInstructionSelection(pinned,selectionJob);
  assert.ok(selected.practical_runtime.commands.assess.pins.some(p=>p.path===executable&&p.digest===pinned.practical.assessor.executableDigest),'recovery executable must participate in runtime digest and preflight');
  pinned.stateRoot=join(f.root,'drift-selection-state');mkdirSync(pinned.stateRoot);writeFileSync(executable,'changed caller adapter');
  assert.throws(()=>prepareFullPracticalInstructionSelection(pinned,selectionJob),/recovery executable drift/);
});

test('optional recovery executable pin refuses drift before allocation or provider dispatch and preserves legacy callers',async t=>{
 const f=environmentFixture(t),executable=join(f.root,'caller-provider'),result=join(f.root,'assessment-result.json');writeFileSync(executable,'trusted caller adapter');
 const digest=hash(readFileSync(executable));let calls=0;
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async ({argv})=>{calls++;writeFileSync(argv[argv.indexOf('-o')+1],JSON.stringify({action:'reference'}));return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:1};}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?executable-pin');
 const settings={kind:'codex',executable,executableDigest:digest,model:null,timeout_ms:5000},job={kind:'assess',input:{packet:{case_id:'synthetic'}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  writeFileSync(executable,'changed caller adapter');
  await assert.rejects(assessPracticalEvaluation(settings,job,result),/recovery executable drift/);assert.equal(calls,0);assert.equal(existsSync(join(f.root,'assessment-session')),false);
  writeFileSync(executable,'trusted caller adapter');const good=await assessPracticalEvaluation(settings,job,result);assert.equal(good.output.assessment.action,'reference');assert.equal(calls,1);
  const legacyRoot=join(f.root,'legacy');mkdirSync(legacyRoot);const {executableDigest,...legacy}=settings;writeFileSync(executable,'legacy caller-selected adapter');
  await assessPracticalEvaluation(legacy,job,join(legacyRoot,'result.json'));assert.equal(calls,2);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('failed automatic assessment retains bound transport evidence before rejecting, without promoting provider closure or replay',async t=>{
 const f=environmentFixture(t),result=join(f.root,'result.json');let calls=0;
 const response={spawnObserved:true,terminationConfirmed:true,exitCode:1,durationMs:350,stdout:Buffer.alloc(0),stderr:Buffer.from('Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n')};
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async()=>{calls++;return response;}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?failed-evidence');
 const settings={kind:'codex',executable:process.execPath,model:'fixture-only',timeout_ms:1000},job={kind:'assess',key:'failed-observation',input:{packet:{attempt_key:'fixture'}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  await assert.rejects(assessPracticalEvaluation(settings,job,result),/assessment incomplete/);
  const root=join(f.root,'assessment-session'),path=join(root,'execution-observation.json'),e=JSON.parse(readFileSync(path));
  assert.equal(e.request_digest,canonicalDigest(job));assert.equal(e.settings_digest,canonicalDigest(settings));assert.match(e.prompt_digest,/^sha256:/);
  assert.equal(e.local.spawn_observed,true);assert.equal(e.local.termination_confirmed,true);assert.equal(e.local.exit_code,1);assert.equal(e.duration_ms,350);
  assert.equal(e.provider_terminal_confirmed,null);assert.equal(e.model_calls,null);assert.equal(e.usage,null);assert.equal(e.replay_authorized,false);
  for(const a of e.artifacts)assert.equal(hash(readFileSync(join(root,a.path))),a.digest);
  assert.equal(readFileSync(join(root,'stdout.jsonl')).length,0);assert.deepEqual(readFileSync(join(root,'stderr.log')),response.stderr);
  const before=readFileSync(path);await assert.rejects(assessPracticalEvaluation(settings,job,result),/EEXIST/);assert.equal(calls,1);assert.deepEqual(readFileSync(path),before);assert.equal(existsSync(result),false);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('assessor evidence preserves interrupted, limited and thrown outcomes as unknown rather than clean completion',async t=>{
 const f=environmentFixture(t);let response;
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async()=>{if(response instanceof Error)throw response;return response;}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?unknown-evidence');
 const settings={kind:'codex',executable:process.execPath,model:null,timeout_ms:1000},job={kind:'assess',input:{packet:{}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  for(const [id,extra]of [['timeout',{timedOut:true}],['interrupt',{interrupted:true}],['limited',{outputLimited:true}],['thrown',new Error('fixture transport failure')]]){
   const root=join(f.root,id);mkdirSync(root);response=extra instanceof Error?extra:{spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:7,stdout:Buffer.from('retained output'),stderr:Buffer.alloc(0),...extra};
   await assert.rejects(assessPracticalEvaluation(settings,job,join(root,'result.json')),/assessment incomplete/);
   const e=JSON.parse(readFileSync(join(root,'assessment-session/execution-observation.json')));assert.equal(e.provider_terminal_confirmed,null);assert.equal(e.replay_authorized,false);assert.equal(e.usage,null);
   if(extra instanceof Error){assert.equal(e.local.spawn_observed,null);assert.equal(e.local.termination_confirmed,null);assert.match(e.local.error.message,/fixture transport failure/);}
   else assert.equal(e.local[({timeout:'timed_out',interrupt:'interrupted',limited:'output_limited'})[id]],true);
  }
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('positive no-spawn and malformed successful response retain distinct closure facts without inventing a judgment',async t=>{
 const f=environmentFixture(t);let noSpawn=true;
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async({argv})=>{if(noSpawn)return {spawnObserved:false,terminationConfirmed:true,exitCode:null,error:{code:'ENOENT',message:'fixture provider missing'},durationMs:2};writeFileSync(argv[argv.indexOf('-o')+1],'{invalid');return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:4};}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?no-spawn-evidence');
 const settings={kind:'codex',executable:process.execPath,model:null,timeout_ms:1000},job={kind:'assess',input:{packet:{}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  for(const id of ['no-spawn','invalid-answer']){
   const root=join(f.root,id);mkdirSync(root);await assert.rejects(assessPracticalEvaluation(settings,job,join(root,'result.json')));
   const e=JSON.parse(readFileSync(join(root,'assessment-session/execution-observation.json')));assert.equal(e.provider_terminal_confirmed,true);assert.equal(e.replay_authorized,false);assert.equal(e.model_calls,null);assert.equal(e.usage,null);
   assert.equal(e.closure_scope,noSpawn?'positive_local_no_spawn':'synchronous_cli_completion');assert.equal(e.local.spawn_observed,!noSpawn);assert.equal(existsSync(join(root,'result.json')),false);
   if(!noSpawn){const a=e.artifacts.find(a=>a.path==='captured-answer.json');assert.equal(a.digest,hash(Buffer.from('{invalid')));}
   noSpawn=false;
  }
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('successful assessor retains the same observation reference and final answer bytes before response validation',async t=>{
 const f=environmentFixture(t),settings={kind:'codex',executable:process.execPath,model:null,timeout_ms:1000},job={kind:'assess',input:{packet:{fixture:1}}};
 const answer={action:'reference',comparison_limits:['source only']};
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async({argv})=>{writeFileSync(argv[argv.indexOf('-o')+1],JSON.stringify(answer));return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:9,stdout:Buffer.from('{"type":"turn.completed"}\n'),stderr:Buffer.alloc(0)};}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?success-evidence');
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  const r=await assessPracticalEvaluation(settings,job,join(f.root,'result.json'));assert.deepEqual(r.output.assessment,answer);
  const ref=r.output.assessment_execution.execution_observation;assert.equal(hash(readFileSync(ref.path)),ref.digest);
  const e=JSON.parse(readFileSync(ref.path));assert.equal(e.provider_terminal_confirmed,true);assert.equal(e.duration_ms,9);assert.equal(e.replay_authorized,false);
  const final=e.artifacts.find(a=>a.path==='captured-answer.json');assert.ok(final);assert.equal(final.digest,hash(readFileSync(join(f.root,'assessment-session/answer.json'))));assert.equal(r.output.assessment_execution.model_calls,1);
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('assessor hashes, parses and shape-repairs one captured answer even if the provider file changes after capture',async t=>{
 const f=environmentFixture(t),settings={kind:'codex',executable:process.execPath,model:null,timeout_ms:1000},job={kind:'assess',input:{packet:{fixture:'capture'}}};
 const original={action:'reference',comparison_limits:'Quality unknown'},replacement={action:'retry',comparison_limits:['different judgment']};let reads=0;
 const store=await import('./content-addressed-store.mjs');
 t.mock.module('./content-addressed-store.mjs',{namedExports:{...store,readStableBytes:(path,...args)=>{const bytes=store.readStableBytes(path,...args);if(path.endsWith('/answer.json')){reads++;writeFileSync(path,JSON.stringify(replacement));}return bytes;}}});
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async({argv})=>{writeFileSync(argv[argv.indexOf('-o')+1],JSON.stringify(original));return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:3};}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?capture-once');
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  const r=await assessPracticalEvaluation(settings,job,join(f.root,'result.json'));assert.equal(reads,1);assert.deepEqual(r.output.assessment,{...original,comparison_limits:[original.comparison_limits]});
  const root=join(f.root,'assessment-session'),observation=JSON.parse(readFileSync(r.output.assessment_execution.execution_observation.path));
  assert.deepEqual(JSON.parse(readFileSync(join(root,'answer.json'))),replacement);assert.deepEqual(JSON.parse(readFileSync(join(root,'captured-answer.json'))),original);
  const raw=observation.artifacts.find(a=>a.path==='captured-answer.json');assert.equal(raw.digest,hash(Buffer.from(JSON.stringify(original))));
  const repair=JSON.parse(readFileSync(r.output.assessment_execution.output_shape_repair.path));assert.equal(repair.original_response.path,join(root,'captured-answer.json'));assert.equal(repair.original_response.digest,raw.digest);assert.equal(repair.original_assessment_digest,canonicalDigest(original));
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

test('retained assessor answer keeps the existing semantic byte limit and duplicate-key rejection',async t=>{
 const f=environmentFixture(t);let answer;
 t.mock.module('./codex-exec-runner.mjs',{namedExports:{executeCodexSession:async({argv})=>{writeFileSync(argv[argv.indexOf('-o')+1],answer);return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:3};}}});
 const {assessPracticalEvaluation}=await import('./practical-evaluation-assessor.mjs?answer-boundary');
 const settings={kind:'codex',executable:process.execPath,model:null,timeout_ms:1000},job={kind:'assess',input:{packet:{}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 try{
  for(const [id,value,error]of [['duplicate','{"action":"reference","action":"retry"}',/duplicate/i],['limit',JSON.stringify({reason:'x'.repeat(1024*1024)}),/byte limit/]]){
   const root=join(f.root,id);mkdirSync(root);answer=value;await assert.rejects(assessPracticalEvaluation(settings,job,join(root,'result.json')),error);
   const e=JSON.parse(readFileSync(join(root,'assessment-session/execution-observation.json'))),raw=e.artifacts.find(a=>a.path==='captured-answer.json');assert.equal(raw.digest,hash(Buffer.from(answer)));assert.equal(e.provider_terminal_confirmed,true);assert.equal(existsSync(join(root,'result.json')),false);
  }
 }finally{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,cpSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {prepareGitBaseline} from './ask-user-comparison-prepare.mjs';
import {fullGenerationInput,generateFullInstructionCandidate,codexFullInstructionProvider,compareFullInstructionContext} from './instruction-loop-full-candidate.mjs';

test('authorized inline Full generation passes a scoped child grant without changing the parent environment',async t=>{
 const root=fixture(t),executable=join(root,'grant-provider.mjs');writeFileSync(executable,'#!'+process.execPath+'\n'+`import{writeFileSync}from'node:fs';if(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED!=='1'){console.error('child model grant missing');process.exit(41);}const a=process.argv.slice(2);writeFileSync(a[a.indexOf('-o')+1],'{"changes":[]}');`);chmodSync(executable,0o700);
 const before=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,p={executable,sessionRoot:join(root,'grant-session'),modelCallsAuthorized:true,timeoutMs:5000};
 assert.deepEqual((await codexFullInstructionProvider(p,{})).response,{changes:[]});assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,before);
});
test('failed Full provider retains bounded private closure diagnostics without replay',async t=>{
 const root=fixture(t),executable=join(root,'failed-provider.mjs');writeFileSync(executable,'#!'+process.execPath+'\n'+`import{writeFileSync}from'node:fs';writeFileSync(1,'s'.repeat(200000));writeFileSync(2,'diagnostic failure');process.exit(23);`);chmodSync(executable,0o700);
 const p={executable,sessionRoot:join(root,'failed-session'),modelCallsAuthorized:true,timeoutMs:5000};
 await assert.rejects(codexFullInstructionProvider(p,{}),/Full generation incomplete/);
 const receipt=JSON.parse(readFileSync(join(p.sessionRoot,'provider-execution.json')));assert.equal(receipt.kind,'full_authoring_execution_v1');assert.equal(receipt.exit_code,23);assert.equal(receipt.termination_confirmed,true);assert.equal(receipt.stdout.truncated,true);assert.equal(receipt.stderr.text,'diagnostic failure');
 await assert.rejects(codexFullInstructionProvider(p,{}),/EEXIST/);assert.equal(receipt.exit_code,23);
});
import {createInstructionLoopCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {createNativeInstructionLoopConfiguration,prepareNextNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-full-loop-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function generation(t){
  const root=fixture(t),base=join(root,'base');mkdirSync(base);mkdirSync(join(base,'skills/demo/references'),{recursive:true});
  writeFileSync(join(base,'skills/demo/SKILL.md'),'Public Skill source.');writeFileSync(join(base,'skills/demo/references/detail.md'),'Public reference.');
  mkdirSync(join(base,'benchmarks/private'),{recursive:true});writeFileSync(join(base,'benchmarks/private/answer.json'),'FAKE_PRIVATE_SENTINEL');writeFileSync(join(base,'.env'),'FAKE_AUTH_SENTINEL');
  const revision=prepareGitBaseline(base),store=join(root,'store');mkdirSync(store);
  return {root,p:{baselineSourceRoot:base,baselineRevision:revision,storeRoot:store,skills:['demo'],goal:'Improve public instruction efficiency',candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')}};
}
test('Full generation input contains only public canonical Skill Markdown, not the source checkout or private files',t=>{
  const {p}=generation(t),input=fullGenerationInput(p),text=JSON.stringify(input);
  assert.deepEqual(input.files.map(f=>f.path),['skills/demo/SKILL.md','skills/demo/references/detail.md']);
  assert.ok(!text.includes('FAKE_PRIVATE_SENTINEL')&&!text.includes('FAKE_AUTH_SENTINEL')&&!text.includes(p.baselineSourceRoot));
});
test('controller public feedback is actually present in provider input and unsafe data is refused',t=>{
  const {p}=generation(t),goal='Verify the applicable boundary before proposing a changed Skill.';
  const input=fullGenerationInput({...p,observation:{goal}});
  assert.equal(input.work_feedback.goal,goal);
  assert.throws(()=>fullGenerationInput({...p,observation:{goal,raw_log:'private'}}),/arbitrary/);
});
test('next native profile pins the actual continuation and allocates fresh destinations without model dispatch',async t=>{
  const {p,root}=generation(t),profilePath=join(root,'profile.json'),run=join(root,'old-run');
  const policy={kind:'reference_instruction_loop_v1',id:'old',runtime_digest:canonicalDigest('fixture'),observation:{goal:'Improve public instruction efficiency'},
    catalog:[{id:'public',public_input_digest:canonicalDigest('task'),tags:[],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:null,formal_admission_implied:false};
  const profile={kind:'full_native_reference_loop_profile_v1',protectedRoot:root,stateRoot:join(root,'state'),storeRoot:p.storeRoot,
    generator:{...p,provider:{kind:'fixture'},environmentId:'local'},normal:{target:null},policy,
    native:{root:join(root,'native'),workRoot:join(root,'work'),protectedRoot:root,executionKind:'real_codex'},selection:{},report:{assessments:[{old:true}]}};
  writeFileSync(profilePath,JSON.stringify(profile));
  const initialConfig=createNativeInstructionLoopConfiguration(profilePath),configPath=join(root,'old-config.json');
  writeFileSync(configPath,JSON.stringify(initialConfig));
  policy.runtime_digest=initialConfig.policy.runtime_digest;
  const runtime={digest:policy.runtime_digest,inspect:async()=>null};
  for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>({
    request_digest:canonicalDigest(job),status:'completed',output:kind==='select'?{case_ids:['public']}:kind==='register'?
      {registry:{snapshot_digest:canonicalDigest('local registry'),trusted_authority_contexts:[]}}:{}});
  const start=await advanceSupervisedInstructionLoop({root:run,policy,runtime});
  await advanceSupervisedInstructionLoop({root:run,policy,runtime,decision:{disposition:'rejected',packet_digest:canonicalDigest(start.pending_gate),reason:'The proposed cases do not cover the observed boundary.'}});
  const next=prepareNextNativeInstructionLoopConfiguration({root:run,profilePath,configPath,outputRoot:join(root,'cycle-two'),id:'two'});
  assert.equal(next.models_started,false);const config=JSON.parse(readFileSync(next.config_path)),nextProfile=JSON.parse(readFileSync(next.profile_path));
  assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
  assert.deepEqual(config.policy.observation,nextProfile.policy.observation);
  assert.equal(fullGenerationInput({...nextProfile.generator,observation:config.policy.observation}).work_feedback.previous_cycle.decisions[0].reason_summary,
    'The proposed cases do not cover the observed boundary.');
  assert.deepEqual(nextProfile.report.assessments,[]);
  assert.notEqual(nextProfile.generator.candidateRoot,p.candidateRoot);assert.equal(existsSync(nextProfile.generator.candidateRoot),false);
  assert.equal(nextProfile.generator.registrySnapshotDigest,canonicalDigest('local registry'));
  assert.ok(nextProfile.native.workRoot.startsWith(join(root,'ask-work-cycle-')));
  assert.ok(nextProfile.generator.environmentId.length<=128);
  assert.throws(()=>prepareNextNativeInstructionLoopConfiguration({root:run,profilePath,configPath,outputRoot:join(root,'cycle-two'),id:'two'}),/fresh/);
  const changed=join(root,'different-profile.json');writeFileSync(changed,JSON.stringify({...profile,generator:{...profile.generator,goal:'Different'}}));
  assert.throws(()=>prepareNextNativeInstructionLoopConfiguration({root:run,profilePath:changed,configPath,outputRoot:join(root,'blocked'),id:'blocked'}),/not pinned/);
});
for(const path of ['scripts/install-kernel.mjs','skills/demo/../../scripts/evil.md','skills/other/SKILL.md','skills/demo/references/.git/config.md','.agent-spectrum-kernel/install-state.json'])
test('Full generator rejects out-of-scope model file '+path,async t=>{
  const {p}=generation(t);await assert.rejects(generateFullInstructionCandidate(p,async()=>({response:{changes:[{operation:'write',path,text:'invalid'}]},execution:{kind:'fixture'}})),/outside allowed/);
  assert.equal(existsSync(p.candidateRoot),false);
});
test('generation without a new model-call grant is blocked before creating a session',async t=>{
  const root=fixture(t),sessionRoot=join(root,'not-created');await assert.rejects(codexFullInstructionProvider({sessionRoot,modelCallsAuthorized:false},{}),/not authorized/);assert.equal(existsSync(sessionRoot),false);
});
test('Full comparison rejects silently removed support context and semantic prompt changes',t=>{
  const root=fixture(t),a=join(root,'a'),b=join(root,'b');mkdirSync(join(a,'docs'),{recursive:true});mkdirSync(join(a,'.agents/prompts'),{recursive:true});
  writeFileSync(join(a,'docs/support.md'),'fixed public support');writeFileSync(join(a,'.agents/prompts/demo.md'),'bind '+ 'a'.repeat(64));cpSync(a,b,{recursive:true});
  writeFileSync(join(b,'.agents/prompts/demo.md'),'bind '+ 'b'.repeat(64));assert.equal(compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}).supporting_context_preserved,true);
  rmSync(join(b,'docs/support.md'));assert.throws(()=>compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}),/addition\/removal/);
  writeFileSync(join(b,'docs/support.md'),'fixed public support');writeFileSync(join(b,'.agents/prompts/demo.md'),'semantic prompt change');assert.throws(()=>compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}),/beyond generated hash/);
});
test('complete configuration binds all stages and marks real generator/trial calls separately',t=>{
  const root=fixture(t),path=join(root,'profile.json');writeFileSync(path,JSON.stringify({kind:'full_native_reference_loop_profile_v1',normal:{target:'/synthetic-owner'},policy:{normal_target:'/synthetic-owner'},generator:{provider:{kind:'codex'}},native:{executionKind:'real_codex'}}));
  const config=createNativeInstructionLoopConfiguration(path);assert.equal(Object.keys(config.runtime.commands).length,10);
  assert.equal(config.runtime.commands.generate.model_calls,true);assert.equal(config.runtime.commands.trial.model_calls,true);assert.equal(config.runtime.commands.report.model_calls,false);
  assert.ok(Object.values(config.runtime.commands).every(c=>c.inspect_argv.includes('inspect')));
});
test('interrupted worker is recovered from native terminal evidence without another dispatch',async t=>{
  const root=fixture(t),worker=join(root,'fixture-worker.mjs'),done=join(root,'done'),counter=join(root,'counter');
  writeFileSync(worker,`import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {canonicalDigest} from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};
const [action,request,result]=process.argv.slice(2),job=JSON.parse(readFileSync(request));
if(action==='execute'){writeFileSync(${JSON.stringify(counter)},'one dispatch',{flag:'wx'});process.exitCode=83;}
else if(existsSync(${JSON.stringify(done)}))writeFileSync(result,JSON.stringify({request_digest:canonicalDigest(job),status:'completed',output:{ready_for_next_root:true,recovered_from_native_records:true}}),{flag:'wx'});`);
  const command={argv:[process.execPath,worker,'execute'],inspect_argv:[process.execPath,worker,'inspect'],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:false};
  const definition={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))};
  const runtime=createInstructionLoopCommandRuntime({definition}),job={kind:'trial',key:'trial-fixture',input:{},input_digest:canonicalDigest({})};
  assert.equal((await runtime.trial(job,{root})).status,'unknown');writeFileSync(done,'native terminal');
  const recovered=await runtime.inspect(job,{root});assert.equal(recovered.status,'completed');assert.equal(recovered.output.transport_interruption.exit_code,83);assert.equal(readFileSync(counter,'utf8'),'one dispatch');
  await assert.rejects(runtime.trial(job,{root}),/already allocated/);
});
test('optional Full authoring executable pin refuses drift before session creation and retains unpinned compatibility',async t=>{
 const {chmodSync}=await import('node:fs'),root=fixture(t),executable=join(root,'fake-authoring'),marker=join(root,'started');
 writeFileSync(executable,'#!'+process.execPath+'\n'+`const fs=require('node:fs');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(marker)},'started');const args=process.argv.slice(2);fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({changes:[]}));});`);chmodSync(executable,0o700);
 const digest=hash(readFileSync(executable)),p={executable,executableDigest:digest,modelCallsAuthorized:true,model:'synthetic-model',timeoutMs:5000,sessionRoot:join(root,'refused-session')};
 writeFileSync(executable,readFileSync(executable,'utf8')+'\n// drift\n');await assert.rejects(codexFullInstructionProvider(p,{}),/executable drift/);assert.equal(existsSync(p.sessionRoot),false);assert.equal(existsSync(marker),false);
 const correct={...p,executableDigest:hash(readFileSync(executable)),sessionRoot:join(root,'pinned-session')};assert.deepEqual((await codexFullInstructionProvider(correct,{})).response,{changes:[]});
 const legacy={...correct,sessionRoot:join(root,'legacy-session')};delete legacy.executableDigest;assert.deepEqual((await codexFullInstructionProvider(legacy,{})).response,{changes:[]});
});
test('Full authoring executable pin rejects malformed digests, non-regular paths, missing files and symlinks before allocation',async t=>{
 const root=fixture(t),{symlinkSync}=await import('node:fs'),file=join(root,'file'),link=join(root,'link');writeFileSync(file,'unused');symlinkSync(file,link);
 for(const [executable,executableDigest] of [[file,'invalid'],['./scripts/instruction-loop-full-candidate.mjs',hash(readFileSync(join(import.meta.dirname,'instruction-loop-full-candidate.mjs')))],[root,hash(Buffer.from('x'))],[join(root,'missing'),hash(Buffer.from('x'))],[link,hash(readFileSync(file))]]){
  const sessionRoot=join(root,'not-created');await assert.rejects(codexFullInstructionProvider({executable,executableDigest,sessionRoot,modelCallsAuthorized:true},{}));assert.equal(existsSync(sessionRoot),false);
 }
});

// Full registration must separate complete environment refs from owned edits.
import {fullPartialFixture} from './test-helpers-full-partial-assets.mjs';
import {registerFullInstructionCandidate} from './instruction-loop-full-candidate.mjs';
import {verifyInstructionEnvironment} from './instruction-environment.mjs';
test('Full registration reuses an unchanged selected Skill and registers only the edited Skill',t=>{
 const f=fullPartialFixture(t),c=registerFullInstructionCandidate(f.p,f.candidate);
 assert.deepEqual(c.candidate_assets.map(a=>a.stable_id),['ask.skill.alpha']);assert.deepEqual(c.baseline_assets,[f.parents[0]]);assert.equal(c.environment_assets.length,2);assert.deepEqual(c.environment_assets[1],f.parents[1]);assert.equal(c.no_change,false);
 const verified=verifyInstructionEnvironment({storeRoot:f.p.storeRoot,environmentObjectDigest:c.environment_object_digest,trustedAssetAuthorityContexts:f.p.trustedAuthorityContexts});assert.equal(verified.environment.bindings.length,2);
});
test('Full no-op reuses every selected ref without creating an Asset revision',t=>{
 const f=fullPartialFixture(t,{changed:false}),c=registerFullInstructionCandidate(f.p,f.candidate);
 assert.equal(c.no_change,true);assert.deepEqual(c.candidate_assets,[]);assert.deepEqual(c.baseline_assets,[]);assert.deepEqual(c.environment_assets,f.parents);assert.equal(c.registry.snapshot_digest,f.p.registrySnapshotDigest);
});
import {executeNativeInstructionLoopStage} from './instruction-loop-native-host.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
for(const current of [false,true])test(`Full lifecycle changes only edited refs and restores exact original ${current?'current':'candidate'} states`,async t=>{
 const f=fullPartialFixture(t,{current}),c=await executeNativeInstructionLoopStage(f.profile,{kind:'register',input:{candidate:f.candidate}});
 const child=verifyAssetRegistry({storeRoot:f.p.storeRoot,snapshotDigest:c.registry.snapshot_digest,trustedAuthorityContexts:c.registry.trusted_authority_contexts}).assets.find(a=>a.record_digest===c.candidate_assets[0].record_digest);
 assert.equal(child.content.files.find(x=>x.path.endsWith('helper.json')).media_type,'application/json');
 const activated=await executeNativeInstructionLoopStage(f.profile,{kind:'version',input:{candidate:c,action:'activate'}});
 const read=value=>verifyAssetRegistry({storeRoot:f.p.storeRoot,snapshotDigest:value.snapshot_digest,trustedAuthorityContexts:value.trusted_authority_contexts}).assets;
 assert.equal(read(activated).find(a=>a.record_digest===f.parents[1].record_digest).state,current?'current':'candidate');
 const restored=await executeNativeInstructionLoopStage(f.profile,{kind:'version',input:{candidate:c,action:'restore',previous_version:activated}});
 for(const parent of f.parents)assert.equal(read(restored).find(a=>a.record_digest===parent.record_digest).state,current?'current':'candidate');
 assert.equal(read(restored).find(a=>a.record_digest===c.candidate_assets[0].record_digest).state,'historical');
});
test('Full rejection retires only owned changed refs and leaves shared selected refs intact',async t=>{
 const f=fullPartialFixture(t,{current:true}),c=registerFullInstructionCandidate(f.p,f.candidate),retired=await executeNativeInstructionLoopStage(f.profile,{kind:'version',input:{candidate:c,action:'retire'}});
 const entries=verifyAssetRegistry({storeRoot:f.p.storeRoot,snapshotDigest:retired.snapshot_digest,trustedAuthorityContexts:retired.trusted_authority_contexts}).assets;
 for(const parent of f.parents)assert.equal(entries.find(a=>a.record_digest===parent.record_digest).state,'current');assert.equal(entries.find(a=>a.record_digest===c.candidate_assets[0].record_digest).state,'retired');
});
test('Full practical registration shares the partial asset boundary',async t=>{
 const f=fullPartialFixture(t);f.profile.kind='full_practical_instruction_loop_profile_v1';delete f.profile.native;f.profile.practical={root:join(f.root,'eval'),baselineRoot:f.baseFull};
 const c=await executeNativeInstructionLoopStage(f.profile,{kind:'register',input:{candidate:f.candidate}});assert.equal(c.candidate_assets.length,1);assert.deepEqual(c.environment_assets[1],f.parents[1]);
});
test('Full no-op cleanup needs no owner or asset authority and keeps baseline, CAS and archive',async t=>{
 const f=fullPartialFixture(t,{changed:false}),c=await executeNativeInstructionLoopStage(f.profile,{kind:'register',input:{candidate:f.candidate}});delete f.profile.assetAuthority;
 const cleaned=await executeNativeInstructionLoopStage(f.profile,{kind:'cleanup',input:{disposition:'unchanged',candidate:c}});
 assert.equal(cleaned.owner_operation_performed,false);assert.equal(existsSync(f.p.candidateRoot),false);assert.equal(existsSync(f.p.fullRoot),false);assert.equal(existsSync(f.p.baselineSourceRoot),true);assert.equal(existsSync(c.owned_version.archive),true);assert.equal(existsSync(join(f.p.stagingRoot,'owned-files.json')),true);assert.equal(existsSync(join(f.p.stagingRoot,'changes.json')),false);assert.equal(f.registry().assets.length,2);
});
for(const drift of ['source','archive','layout','staging'])test(`Full no-op cleanup refuses ${drift} drift before deleting owned materializations`,async t=>{
 const f=fullPartialFixture(t,{changed:false}),c=await executeNativeInstructionLoopStage(f.profile,{kind:'register',input:{candidate:f.candidate}});
 const path=drift==='source'?join(f.p.candidateRoot,'skills/alpha/SKILL.md'):drift==='archive'?c.owned_version.archive:drift==='layout'?join(f.p.fullRoot,'skills/alpha/SKILL.md'):join(f.p.stagingRoot,'extra-file');writeFileSync(path,'Unexpected change');
 await assert.rejects(executeNativeInstructionLoopStage(f.profile,{kind:'cleanup',input:{disposition:'unchanged',candidate:c}}));assert.equal(existsSync(f.p.candidateRoot),true);assert.equal(existsSync(f.p.fullRoot),true);assert.equal(existsSync(join(f.p.stagingRoot,'changes.json')),true);assert.equal(existsSync(f.p.baselineSourceRoot),true);
});
function fullFixturePolicy(id,target=null){return {kind:'reference_instruction_loop_v1',id,runtime_digest:canonicalDigest('synthetic-runtime'),observation:{goal:'Synthetic whole environment continuation.'},catalog:[{id:'fixture',public_input_digest:canonicalDigest('task'),tags:[],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:target,formal_admission_implied:false};}
test('Full no-op completes through the supervisor without case, trial or owner dispatch',async t=>{
 const f=fullPartialFixture(t,{changed:false}),policy=fullFixturePolicy('unchanged'),calls=[],runtime={digest:policy.runtime_digest,inspect:async()=>null};
 for(const kind of ['generate','register','cleanup'])runtime[kind]=async job=>{calls.push(kind);return {request_digest:canonicalDigest(job),status:'completed',output:kind==='generate'?f.candidate:await executeNativeInstructionLoopStage(f.profile,job)};};
 for(const kind of ['select','trial','report','plan','apply','version','restore'])runtime[kind]=()=>assert.fail('unexpected no-op dispatch '+kind);
 const s=await advanceSupervisedInstructionLoop({root:join(f.root,'no-change-run'),policy,runtime});assert.equal(s.status,'completed');assert.equal(s.final.outcome,'no_change');assert.equal(s.pending_gate,null);assert.equal(s.completed_trials,0);assert.deepEqual(calls,['generate','register','cleanup']);assert.equal(existsSync(f.candidate.owned_version.archive),true);
});
for(const legacy of [false,true])test(`Full continuation preserves ${legacy?'legacy complete candidate refs':'reused plus new complete environment refs'}`,async t=>{
 const f=fullPartialFixture(t,{changed:legacy?'both':true,current:true}),target=join(f.root,'owner');mkdirSync(target);const profile={...f.profile,normal:{target},policy:fullFixturePolicy('old-full',target),report:{},selection:{}};
 const profilePath=join(f.root,'profile.json'),configPath=join(f.root,'config.json');writeFileSync(profilePath,JSON.stringify(profile));const config=createNativeInstructionLoopConfiguration(profilePath);writeFileSync(configPath,JSON.stringify(config));
 const c=await executeNativeInstructionLoopStage(profile,{kind:'register',input:{candidate:f.candidate}}),expected=c.environment_assets;if(legacy)delete c.environment_assets;
 const runtime={digest:config.policy.runtime_digest,inspect:async()=>null};for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>({request_digest:canonicalDigest(job),status:'completed',output:kind==='generate'?f.candidate:kind==='register'?c:kind==='select'?{case_ids:['fixture']}:kind==='trial'?{ready_for_next_root:true}:kind==='report'?{conditions:{},rows:[]}:kind==='version'?await executeNativeInstructionLoopStage(profile,job):{}});
 const root=join(f.root,'run'),advance=extra=>advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,...extra});let s=await advance();assert.equal(s.status,'awaiting_evaluation_approval');const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic fixture decision only.'});s=await advance({decision:approve(s)});assert.equal(s.status,'awaiting_change_approval');s=await advance({decision:approve(s)});assert.equal(s.final.outcome,'applied');
 const next=prepareNextNativeInstructionLoopConfiguration({root,profilePath,configPath,outputRoot:join(f.root,'next'),id:'next-full'}),nextProfile=JSON.parse(readFileSync(next.profile_path));assert.deepEqual(nextProfile.generator.parentAssets,expected);assert.equal(nextProfile.generator.parentAssets.length,2);assert.equal(next.models_started,false);
});
for(const kind of ['full_native_reference_loop_profile_v1','full_practical_instruction_loop_profile_v1'])test(`${kind}: no-op admission still rejects changed supporting context`,async t=>{
 const f=fullPartialFixture(t,{changed:false});if(kind==='full_practical_instruction_loop_profile_v1'){f.profile.kind=kind;delete f.profile.native;f.profile.practical={root:join(f.root,'eval'),baselineRoot:f.baseFull};}writeFileSync(join(f.p.fullRoot,'AGENTS.md'),'Unexpected supporting context.\n');await assert.rejects(executeNativeInstructionLoopStage(f.profile,{kind:'register',input:{candidate:f.candidate}}),/supporting-context change/);assert.equal(f.registry().assets.length,2);assert.equal(existsSync(f.p.candidateRoot),true);
});
test('native selection retains bounded child preparation failure diagnostics without trial launch',async t=>{
 const f=fullPartialFixture(t),criteria=join(f.root,'criteria.json'),template=join(f.root,'template.json');writeFileSync(criteria,JSON.stringify([{fixture_id:'fixture',requirements:[{id:'R1'}]}]));writeFileSync(template,JSON.stringify({rows:[{fixture_id:'fixture',public_inventory:[]}]}));f.profile.report={criteria:{path:criteria,digest:hash(readFileSync(criteria))}};f.profile.policy=fullFixturePolicy('failed-child');f.profile.selection={limit:1};Object.assign(f.profile.native,{python:process.execPath,templateConfig:template,templateConfigDigest:hash(readFileSync(template))});const job={kind:'select',input:{candidate:f.candidate,observation:f.profile.policy.observation,catalog:[{id:'fixture',public_input_digest:canonicalDigest([]),tags:[],domain:'local'}]}};
 await assert.rejects(executeNativeInstructionLoopStage(f.profile,job),/native-preparation-failure.json/);const diagnostic=JSON.parse(readFileSync(join(f.profile.stateRoot,'native-preparation-failure.json')));assert.equal(diagnostic.job_digest,canonicalDigest(job));assert.ok(Number.isInteger(diagnostic.exit_code)&&diagnostic.exit_code!==0);assert.ok(diagnostic.stderr.text.includes('bad option'));assert.equal(diagnostic.stderr.truncated,false);assert.equal(diagnostic.models_started,0);assert.equal(existsSync(f.profile.native.root),false);assert.equal(existsSync(f.profile.native.workRoot),false);
});

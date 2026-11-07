import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest,readStableBytes,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,appendRunJournal} from './instruction-run-journal.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {createComponentInstructionLoopConfiguration,createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {buildNextComponentInstructionLoopProfile} from './instruction-loop-component-continuation.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {advanceInstructionLoopOperation} from './instruction-loop-operation.mjs';
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic interrupted operation decision.'});
async function reservedFixture(t){
  const f=componentLoopFixture(t),first=f.profile.candidate.authoring.provider.response;
  f.profile.candidate.authoring.provider={kind:'fixture',evidence_kind:'synthetic',responses:[first,{changes:[{operation:'revise',stable_id:f.rootAsset.stable_id,files:[{path:'skills/new-local/SKILL.md',text:'Continue with retained evidence.\n'}]}]}]};
  writeFileSync(f.profilePath,JSON.stringify(f.profile));const config=createComponentInstructionLoopConfiguration(f.profilePath);writeFileSync(f.configPath,JSON.stringify(config));
  const root=join(f.workspaceRoot,'operation');mkdirSync(root);const firstRoot=join(root,'first-run'),runtime=createComponentInstructionLoopRuntime({definition:config.runtime});
  const firstRun=extra=>advanceSupervisedInstructionLoop({root:firstRoot,policy:config.policy,runtime,...extra});
  let s=await firstRun();s=await firstRun({decision:approve(s)});s=await firstRun({decision:approve(s)});assert.equal(s.final.outcome,'applied');
  const journal=readRunJournal(firstRoot),outputRoot=join(root,'cycle-002');
  return {f,config,root,firstRoot,firstRun,journal,outputRoot};
}
function reserve(x){
  const id=x.config.policy.id+'.cycle-2',profile=buildNextComponentInstructionLoopProfile({root:x.firstRoot,profilePath:x.f.profilePath,configPath:x.f.configPath,outputRoot:x.outputRoot,id}).profile;
  const pin=path=>({path,digest:hash(readStableBytes(path))});
  const state={binding:{profile_path:x.f.profilePath,profile_digest:pin(x.f.profilePath).digest,config_path:x.f.configPath,config_digest:canonicalDigest(x.config),max_cycles:2,
    source_pins:['instruction-loop-operation.mjs','instruction-loop-runtime.mjs','instruction-loop-native-configuration.mjs','instruction-loop-component-continuation.mjs'].map(name=>pin(join(import.meta.dirname,name)))},
    status:'advancing',records:[],current:{root:x.firstRoot,profile_path:x.f.profilePath,profile_digest:pin(x.f.profilePath).digest,config_path:x.f.configPath,config_digest:canonicalDigest(x.config)},
    preparation:{output_root:x.outputRoot,id,previous_journal_digest:x.journal.previous,feedback:null,profile,profile_digest:canonicalDigest(profile)}};
  appendRunJournal(x.root,'next_cycle_reserved',state);return state.preparation;
}
test('prepared runtime substitution and a changed completed predecessor refuse before another dispatch',async t=>{
  const x=await reservedFixture(t),planned=reserve(x);mkdirSync(x.outputRoot);
  const profilePath=join(x.outputRoot,'profile.json'),configPath=join(x.outputRoot,'config.json');writeCanonicalJsonNoReplace({outputPath:profilePath,artifact:planned.profile});
  const expected=createNativeInstructionLoopConfiguration(profilePath),marker=join(x.f.workspaceRoot,'must-not-execute'),task=x.f.profile.practical.cases[0].files[0];
  const command={argv:[process.execPath,'-e','require("node:fs").writeFileSync('+JSON.stringify(marker)+',"forbidden");'],pins:[{path:task.source,digest:task.digest}],model_calls:false};
  const runtime={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))};
  const bad={policy:{...expected.policy,runtime_digest:canonicalDigest(runtime)},runtime};writeFileSync(configPath,JSON.stringify(bad));
  const run=()=>advanceInstructionLoopOperation({root:x.root,profilePath:x.f.profilePath,configPath:x.f.configPath,maxCycles:2});
  await assert.rejects(run(),/reserved next-cycle runtime\/configuration drift/);assert.equal(existsSync(marker),false);assert.equal(existsSync(join(x.outputRoot,'run')),false);
  writeFileSync(configPath,JSON.stringify(expected));let restored=await x.firstRun({requestRestore:true});restored=await x.firstRun({decision:approve(restored)});assert.equal(restored.final.outcome,'restored');
  await assert.rejects(run(),/completed cycle changed after next-cycle reservation/);assert.equal(existsSync(join(x.outputRoot,'run')),false);
});
test('profile-only preparation resumes from the exact reserved intent without replaying the completed cycle',async t=>{
  const x=await reservedFixture(t),planned=reserve(x);mkdirSync(x.outputRoot);
  writeCanonicalJsonNoReplace({outputPath:join(x.outputRoot,'profile.json'),artifact:planned.profile});
  const abandoned=join(x.outputRoot,'.profile.json.staging-11111111-1111-1111-1111-111111111111');writeFileSync(abandoned,'partial unpublished output');
  const run=()=>advanceInstructionLoopOperation({root:x.root,profilePath:x.f.profilePath,configPath:x.f.configPath,maxCycles:2});
  const firstBefore=readRunJournal(x.firstRoot).previous;
  let s=await run();assert.equal(s.status,'awaiting_evaluation_approval');assert.equal(s.cycle_number,2);assert.equal(readRunJournal(x.firstRoot).previous,firstBefore);
  assert.equal(readFileSync(abandoned,'utf8'),'partial unpublished output');assert.equal(readRunJournal(s.current_cycle.root).state.evaluation_decision,undefined);
  s=await run();assert.equal(s.status,'awaiting_evaluation_approval');
  const events=readRunJournal(s.current_cycle.root).events;
  assert.equal(events.filter(e=>e.kind==='operation_reserved'&&e.state.pending?.kind==='generate').length,1);
});
test('Full operation refuses baseline-source, Full projection and staging overlap before allocating any run',async t=>{
  const f=componentLoopFixture(t),policy=structuredClone(f.profile.policy);delete policy.evaluation_mode;policy.normal_target=null;
  const profile={kind:'full_native_reference_loop_profile_v1',protectedRoot:f.workspaceRoot,stateRoot:join(f.workspaceRoot,'native-state'),storeRoot:f.storeRoot,policy,normal:{target:null},
    generator:{baselineSourceRoot:join(f.workspaceRoot,'source'),candidateRoot:join(f.workspaceRoot,'source-candidate'),fullRoot:join(f.workspaceRoot,'full'),stagingRoot:join(f.workspaceRoot,'staging'),provider:{kind:'fixture'}},
    native:{root:join(f.workspaceRoot,'native'),workRoot:join(f.workspaceRoot,'work'),baselineFullRoot:join(f.workspaceRoot,'frozen-baseline'),executionKind:'real_codex'}};
  const profilePath=join(f.workspaceRoot,'native-profile.json'),configPath=join(f.workspaceRoot,'native-config.json');
  writeFileSync(profilePath,JSON.stringify(profile));writeFileSync(configPath,JSON.stringify(createNativeInstructionLoopConfiguration(profilePath)));
  for(const root of [join(profile.generator.baselineSourceRoot,'operation'),profile.generator.fullRoot,profile.generator.stagingRoot]){
    await assert.rejects(advanceInstructionLoopOperation({root,profilePath,configPath,maxCycles:1}),/operation overlaps source/);assert.equal(existsSync(root),false);
  }
});

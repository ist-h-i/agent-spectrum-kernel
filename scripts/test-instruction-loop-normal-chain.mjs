// Real local installers and ownership leases, synthetic task/provider only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {registerAsset,verifyAssetRegistry} from './asset-registry.mjs';
import {captureInstructionEnvironment,exactInstructionAsset,instructionBytesDigest as hash} from './instruction-environment.mjs';
import {instructionTargetPath} from './instruction-projection-paths.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {createComponentInstructionLoopConfiguration,createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
import {prepareNextComponentInstructionLoopConfiguration} from './instruction-loop-component-continuation.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {supervisedEnvironmentReceipt} from './instruction-loop-environment-approval.mjs';
import {restoreEnvironmentTarget} from './environment-target.mjs';
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic local owner lease decision.'});
for(const track of ['codex','claude'])test(`${track}: two component cycles preserve a real local normal-owner lease and restore the prior delegated owner before the original owner`,async t=>{
  const f=componentLoopFixture(t,track),owner=join(f.workspaceRoot,'normal-owner');mkdirSync(owner);
  const source=resolve(import.meta.dirname,'..');
  for(const script of ['install-kernel.mjs',`install-${track}-adapter.mjs`]){
    const r=spawnSync(process.execPath,[join(source,'scripts',script),'--target',owner,...(script!=='install-kernel.mjs'?['--profile','full']:[])],{cwd:source,encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr);
  }
  const ownerPath=join(owner,`.agent-spectrum-kernel/${track}-install-state.json`),originalOwner=readFileSync(ownerPath),ownerState=JSON.parse(originalOwner),kernel=JSON.parse(readFileSync(join(owner,'.agent-spectrum-kernel/install-state.json')));
  const path=Object.keys(ownerState.managed_files).find(path=>path.startsWith(track==='codex'?'.agents/prompts/':'.claude/commands/'));assert.ok(path,'normal full projection has a prompt entry');
  const before=readFileSync(join(owner,path),'utf8'),registry=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.profile.registrySnapshotDigest});
  const descriptor=structuredClone(registry.assets.find(a=>a.asset_type==='prompt'&&a.record.type_extension.kind==='prompt_template').record);delete descriptor.object_kind;
  descriptor.stable_id='ask.prompt.normal-chain-'+track;descriptor.derivation={kind:'root',parent:null,delta:null};descriptor.dependencies=[];descriptor.maintenance.rollback.target=null;
  descriptor.type_extension={kind:'prompt_template',adapter:f.profile.adapter,entrypoint:path,rendered_runtime_content:false};
  descriptor.applicability.adapters={status:'bounded',included:[track==='codex'?'codex':'claude-code'],excluded:[]};
  descriptor.content={package_format:'canonical_json_base64_files',files:[{path,raw_digest:hash(Buffer.from(before)),media_type:'text/markdown; charset=utf-8'}]};
  const registered=registerAsset({storeRoot:f.storeRoot,sourceRoot:owner,predecessorSnapshotDigest:f.profile.registrySnapshotDigest,descriptor}),asset=exactInstructionAsset({...descriptor,...registered});
  const support=[...new Set([...Object.keys(ownerState.managed_files),...Object.keys(kernel.managed_files),'AGENTS.md'])].filter(p=>{
    if(p===path||!existsSync(join(owner,p)))return false;try{instructionTargetPath(f.profile.adapter,p,true);return true;}catch{return false;}
  });
  const baseline=captureInstructionEnvironment({...f.options,sourceRoot:owner,registrySnapshotDigest:registered.snapshot_digest,selectionObjectDigest:null,
    bindings:[{asset,files:[{source:path,target:path}]}],supportPaths:support});
  const profile=f.profile;profile.normal={target:owner,ownerStateDigest:hash(originalOwner)};profile.policy.normal_target=owner;
  profile.baselineEnvironmentObjectDigest=baseline.object_digest;profile.registrySnapshotDigest=registered.snapshot_digest;profile.supportPaths=support;
  const bundle=structuredClone(descriptor);bundle.stable_id='ask.environment.normal-chain';profile.bundleDescriptor=bundle;
  profile.candidate={authoring:{editableStableIds:[asset.stable_id],removableStableIds:[],additions:[],provider:{kind:'fixture',evidence_kind:'synthetic',responses:[
    {changes:[{operation:'revise',stable_id:asset.stable_id,files:[{path,text:'First supervised local instruction.\n'}]}]},
    {changes:[{operation:'revise',stable_id:asset.stable_id,files:[{path,text:'Second supervised local instruction.\n'}]}]}]}}};
  writeFileSync(f.profilePath,JSON.stringify(profile));const firstConfig=createComponentInstructionLoopConfiguration(f.profilePath);writeFileSync(f.configPath,JSON.stringify(firstConfig));
  const firstRuntime=createComponentInstructionLoopRuntime({definition:firstConfig.runtime}),firstRoot=f.root;
  const first=extra=>advanceSupervisedInstructionLoop({root:firstRoot,policy:firstConfig.policy,runtime:firstRuntime,...extra});
  let s=await first();assert.equal(s.status,'awaiting_evaluation_approval',JSON.stringify(readRunJournal(firstRoot).events.at(-1).detail));
  s=await first({decision:approve(s)});assert.equal(s.status,'awaiting_change_approval');s=await first({decision:approve(s)});assert.equal(s.final.outcome,'applied');
  const firstOwner=readFileSync(ownerPath),firstOverlay=readFileSync(join(owner,'.agent-spectrum-kernel/personal-prompt-target-state.json'));
  s=await first({requestRestore:true});s=await first({decision:{...approve(s),disposition:'rejected'}});assert.equal(s.final.outcome,'restoration_declined');
  assert.ok(readFileSync(ownerPath).equals(firstOwner));
  const prepared=prepareNextComponentInstructionLoopConfiguration({root:firstRoot,profilePath:f.profilePath,configPath:f.configPath,outputRoot:join(f.workspaceRoot,'next-normal'),id:'normal-second'});
  const secondConfig=JSON.parse(readFileSync(prepared.config_path)),secondRuntime=createComponentInstructionLoopRuntime({definition:secondConfig.runtime});
  const secondProfile=JSON.parse(readFileSync(prepared.profile_path));
  const secondApply=secondRuntime.apply;let applyCalls=0,restoreCalls=0;
  secondRuntime.apply=async(job,context)=>{
    applyCalls++;const result=await secondApply(job,context);unlinkSync(join(secondProfile.stateRoot,'stages',canonicalDigest(job).slice(7),'result.json'));
    throw new Error('Synthetic loss of a completed normal-owner application response.');
  };
  const second=extra=>advanceSupervisedInstructionLoop({root:prepared.run_root,policy:secondConfig.policy,runtime:secondRuntime,...extra});
  s=await second();assert.equal(s.status,'awaiting_evaluation_approval',JSON.stringify(readRunJournal(prepared.run_root).events.at(-1).detail));
  s=await second({decision:approve(s)});assert.equal(s.status,'awaiting_change_approval',JSON.stringify(readRunJournal(prepared.run_root).events.at(-1).detail));s=await second({decision:approve(s)});
  assert.equal(s.status,'operation_uncertain');s=await second();assert.equal(s.status,'completed',JSON.stringify(readRunJournal(prepared.run_root).events.at(-1).detail));assert.equal(s.final.outcome,'applied');assert.equal(applyCalls,1);
  assert.equal(readFileSync(join(owner,path),'utf8'),'Second supervised local instruction.\n');
  const restore=secondRuntime.restore;let tamperRejected=false;
  secondRuntime.restore=async(job,context)=>{
    restoreCalls++;
    const statePath=join(owner,'.agent-spectrum-kernel/personal-prompt-target-state.json'),raw=readFileSync(statePath),changed=JSON.parse(raw);
    const currentOwner=readFileSync(ownerPath);changed.environment_overlay.previous_owner_state_base64=Buffer.from('{}').toString('base64');writeFileSync(statePath,JSON.stringify(changed));
    try{
      assert.throws(()=>restoreEnvironmentTarget({...secondProfile.environmentTrust,storeRoot:f.storeRoot,targetRoot:owner,ownerStateDigest:hash(originalOwner),supervisedRoot:context.root,
        supervisedPhase:'restore',supervisedPlanDigest:job.input.plan.environment_plan_digest,previousSupervisedRoot:firstRoot,previousSupervisedJournalDigest:secondProfile.previousAppliedJournalDigest,
        receiptObjectDigest:supervisedEnvironmentReceipt(readRunJournal(context.root).state)}),/overlay state drift/);
      assert.ok(readFileSync(ownerPath).equals(currentOwner));assert.equal(readFileSync(join(owner,path),'utf8'),'Second supervised local instruction.\n');tamperRejected=true;
    }finally{writeFileSync(statePath,raw);}
    const result=await restore(job,context);unlinkSync(join(secondProfile.stateRoot,'stages',canonicalDigest(job).slice(7),'result.json'));
    throw new Error('Synthetic loss of a completed chained normal-owner restoration response.');
  };
  s=await second({requestRestore:true});s=await second({decision:approve(s)});assert.equal(s.status,'operation_uncertain');s=await second();assert.equal(s.status,'completed',JSON.stringify(readRunJournal(prepared.run_root).events.at(-1).detail));assert.equal(s.final.outcome,'restored');assert.equal(tamperRejected,true);assert.equal(restoreCalls,1);
  assert.ok(readFileSync(ownerPath).equals(firstOwner));assert.deepEqual(JSON.parse(readFileSync(join(owner,'.agent-spectrum-kernel/personal-prompt-target-state.json'))),JSON.parse(firstOverlay));
  assert.equal(readFileSync(join(owner,path),'utf8'),'First supervised local instruction.\n');
  s=await first({requestRestore:true});s=await first({decision:approve(s)});assert.equal(s.final.outcome,'restored');assert.ok(readFileSync(ownerPath).equals(originalOwner));
  assert.equal(readFileSync(join(owner,path),'utf8'),before);
  const check=spawnSync(process.execPath,[join(source,`scripts/install-${track}-adapter.mjs`),'--target',owner,'--profile','full','--check'],{cwd:source,encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(check.status,0,check.stderr);
});

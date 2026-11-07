import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash,verifyInstructionEnvironment} from './instruction-environment.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {readCompletedInstructionLoopContinuation,prepareNextSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {createComponentInstructionLoopConfiguration} from './instruction-loop-component-runtime.mjs';
export function buildNextComponentInstructionLoopProfile({root,profilePath,configPath,outputRoot,id,feedback=null}){
  root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);outputRoot=resolve(outputRoot);
  const history=readCompletedInstructionLoopContinuation(root),old=readJsonFileStrict(profilePath,'previous component profile'),config=readJsonFileStrict(configPath);
  assert.equal(old.kind,'component_practical_instruction_loop_profile_v1');assert.equal(config.runtime.profile_path,profilePath);
  assert.equal(config.runtime.profile_digest,hash(readStableBytes(profilePath,'previous component profile')));
  assert.equal(canonicalDigest(config.policy),canonicalDigest(history.policy));assert.equal(canonicalDigest(config.runtime),history.policy.runtime_digest);
  assert.match(id,/^[a-zA-Z0-9._-]{1,100}$/u);assert.notEqual(id,old.policy.id);
  assertNoSymlinkPathSegments(outputRoot,'fresh component cycle',{allowMissingLeaf:true});
  assert.ok(outputRoot.startsWith(old.protectedRoot+'/'),'next component cycle remains in protected host root');
  for(const path of [root,old.stateRoot,old.storeRoot,old.candidateRoot,old.practical.root,old.practical.baselineRoot,...(old.normal.target===null?[]:[old.normal.target])])
    assert.ok(outputRoot!==path&&!outputRoot.startsWith(path+'/')&&!path.startsWith(outputRoot+'/'),'next cycle overlaps existing source, state or owner');
  const p=structuredClone(old);p.cycleIndex=(old.cycleIndex??0)+1;p.stateRoot=join(outputRoot,'state');p.candidateRoot=join(outputRoot,'candidate');
  p.practical.root=join(outputRoot,'evaluation');p.practical.baselineRoot=join(outputRoot,'baseline');
  p.registrySnapshotDigest=history.registry.snapshot_digest;
  p.environmentTrust={...p.environmentTrust,trustedAssetAuthorityContexts:history.registry.trusted_authority_contexts??[]};
  if(history.application_active){
    p.baselineEnvironmentObjectDigest=history.candidate.environment_object_digest;p.previousAppliedRun=root;p.previousAppliedJournalDigest=history.journal_digest;
    p.candidate.composition={layers:history.candidate.layers,excludedStableIds:[]};
  }
  p.candidate.packageImports=[]; // the consumed confirmation cannot authorize another import
  const options={storeRoot:p.storeRoot,...p.environmentTrust};
  const baseline=verifyInstructionEnvironment({...options,environmentObjectDigest:p.baselineEnvironmentObjectDigest});
  const components=baseline.environment.components??baseline.environment.bindings,ids=new Set(components.map(c=>c.asset.stable_id));
  if(p.candidate.authoring){
    const a=p.candidate.authoring;
    a.editableStableIds=[...new Set([...a.editableStableIds,...(a.additions??[]).filter(x=>ids.has(x.descriptor.stable_id)).map(x=>x.descriptor.stable_id)])].filter(id=>ids.has(id));
    a.removableStableIds=(a.removableStableIds??[]).filter(id=>ids.has(id));
    const local=verifyAssetRegistry({...options,snapshotDigest:p.registrySnapshotDigest,trustedAuthorityContexts:options.trustedAssetAuthorityContexts});
    a.additions=(a.additions??[]).filter(x=>!ids.has(x.descriptor.stable_id));
    for(const addition of a.additions)if(local.assets.some(asset=>asset.stable_id===addition.descriptor.stable_id))
      addition.descriptor.stable_id=addition.descriptor.stable_id.slice(0,80)+'.cycle-'+canonicalDigest({id,root}).slice(7,23);
  }
  p.selection.observedCosts={...(p.selection.observedCosts??{})};
  for(const attempt of history.report?.all_attempts??[]){const duration=attempt.observation?.metrics?.duration_ms;
    if(Number.isFinite(duration)&&duration>=0)p.selection.observedCosts[attempt.row.case_id]=Math.max(p.selection.observedCosts[attempt.row.case_id]??0,duration);}
  const fresh=feedback??(old.policy.observation.kind==='instruction_loop_continuation_v1'?old.policy.observation.feedback:old.policy.observation);
  const prepared=prepareNextSupervisedInstructionLoop({root,nextPolicy:{...history.policy,id,observation:fresh,
    application_anchor:p.previousAppliedRun?{run_root:p.previousAppliedRun,journal_digest:p.previousAppliedJournalDigest}:null},
    resultSummary:`Previous outcome ${history.outcome}. All-attempt resources: ${JSON.stringify(history.report?.resources_all_attempts??null)}. Missing measurements remain Unknown.`});
  p.policy=prepared.policy;delete p.policy.runtime_digest;
  return {profile:p,output_root:outputRoot};
}
export function prepareNextComponentInstructionLoopConfiguration(options){
  const built=buildNextComponentInstructionLoopProfile(options),p=built.profile,outputRoot=built.output_root;
  assert.ok(!existsSync(outputRoot),'fresh next component cycle required');
  mkdirSync(outputRoot,{mode:0o700});const path=join(outputRoot,'profile.json');
  writeCanonicalJsonNoReplace({outputPath:path,artifact:p,label:'next component profile',maximumBytes:16*1024*1024});
  const next=createComponentInstructionLoopConfiguration(path),nextPath=join(outputRoot,'config.json');
  writeCanonicalJsonNoReplace({outputPath:nextPath,artifact:next,label:'next component configuration',maximumBytes:16*1024*1024});
  return {status:'prepared',profile_path:path,config_path:nextPath,run_root:join(outputRoot,'run'),models_started:false,approval_carried_forward:false};
}

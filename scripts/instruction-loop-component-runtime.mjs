// Component authoring, incoming packages and composition use the same two-gate
// practical evaluator, with the existing exact environment file lifecycle.
import assert from 'node:assert/strict';
import {inspectInstructionLoopProviderSelection} from './instruction-loop-provider-policy.mjs';
import {existsSync,readdirSync,lstatSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest,readStableBytes,readJsonFileStrict,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {verifyInstructionEnvironment,instructionBytesDigest as hash} from './instruction-environment.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {transitionInstructionLoopAssets} from './instruction-loop-assets.mjs';
import {createPracticalLifecycleRuntime,prepareFullPracticalInstructionSelection} from './instruction-loop-practical-runtime.mjs';
import {generateComponentInstructionCandidate,componentEnvironmentOptions} from './instruction-loop-component-candidate.mjs';
import {supervisedEnvironmentReceipt} from './instruction-loop-environment-approval.mjs';
import {planEnvironmentTargetApply,applyEnvironmentTargetPlan,restoreEnvironmentTarget,inspectSupervisedEnvironmentTarget} from './environment-target.mjs';
const sourceNames=['instruction-loop-provider-policy.mjs','instruction-loop-component-runtime.mjs','instruction-loop-component-candidate.mjs','instruction-loop-environment-approval.mjs',
  'instruction-loop-practical-runtime.mjs','instruction-environment-authoring.mjs','instruction-composition.mjs','instruction-asset-package.mjs',
  'instruction-environment.mjs','instruction-environment-compiler.mjs','environment-target.mjs','environment-target-owner.mjs',
  'instruction-source-version.mjs','instruction-loop-assets.mjs','instruction-run-journal.mjs','supervised-instruction-loop.mjs',
  'practical-evaluation-runner.mjs','practical-evaluation-worker.mjs','practical-evaluation-assessor.mjs','instruction-evaluation-recovery.mjs',
  'instruction-loop-command-runtime.mjs','instruction-loop-feedback.mjs','instruction-loop-case-selection.mjs','ask-pragmatic-evaluation-report.mjs',
  'asset-registry.mjs','content-addressed-store.mjs','installer-lifecycle.mjs','ask-setup-apply-state.mjs','ask-personal-prompt-target-lock.mjs',
  'instruction-projection-paths.mjs','codex-exec-runner.mjs','execution-envelope.mjs','../schemas/instruction-asset-package.schema.json'];
const pin=path=>({path,digest:hash(readStableBytes(path,'component runtime source',16*1024*1024))});
function checkedPaths(p){
  inspectInstructionLoopProviderSelection(p);
  componentEnvironmentOptions(p);
  assert.equal(p.kind,'component_practical_instruction_loop_profile_v1');assert.equal(p.policy.evaluation_mode,'practical_v1');
  assert.equal(p.normal.target,p.policy.normal_target);assert.ok(['codex','claude_code'].includes(p.adapter));
  assert.equal(p.previousAppliedRun??null,p.policy.application_anchor?.run_root??null,'profile application anchor mismatch');
  assert.equal(p.previousAppliedJournalDigest??null,p.policy.application_anchor?.journal_digest??null,'profile application anchor pin mismatch');
  const roots=[p.stateRoot,p.storeRoot,p.candidateRoot,p.practical.root,p.practical.baselineRoot,...(p.normal.target===null?[]:[p.normal.target])];
  for(const [i,path] of roots.entries()){
    assert.equal(path,resolve(path));assertNoSymlinkPathSegments(path,'component runtime root',{allowMissingLeaf:true});
    for(const other of roots.slice(i+1))assert.ok(path!==other&&!path.startsWith(other+'/')&&!other.startsWith(path+'/'),'component runtime roots overlap');
  }
  return roots;
}
export function createComponentInstructionLoopConfiguration(profilePath){
  profilePath=resolve(profilePath);const p=readJsonFileStrict(profilePath,'component profile',16*1024*1024);checkedPaths(p);
  const runtime={kind:'component_practical_instruction_loop_runtime_v1',profile_path:profilePath,profile_digest:pin(profilePath).digest,
    source_pins:sourceNames.map(name=>pin(join(import.meta.dirname,name)))};
  return {policy:{...p.policy,runtime_digest:canonicalDigest(runtime)},runtime};
}
function checkedProfile(d){
  assert.equal(d.kind,'component_practical_instruction_loop_runtime_v1');
  for(const item of [...d.source_pins,{path:d.profile_path,digest:d.profile_digest}])assert.equal(pin(item.path).digest,item.digest,'component runtime source/profile drift');
  const p=readJsonFileStrict(d.profile_path,'component profile',16*1024*1024);checkedPaths(p);return p;
}
function candidate(p,c){
  assert.equal(c.kind,'generated_component_instruction_candidate_v1');assert.equal(c.full_root,p.candidateRoot);
  const stored=readJsonFileStrict(join(p.stateRoot,'component-candidate.json'));assert.equal(canonicalDigest(c),canonicalDigest(stored),'candidate stage mismatch');
  verifyInstructionEnvironment({...componentEnvironmentOptions(p),environmentObjectDigest:c.environment_object_digest});return c;
}
function ownerOptions(p,root,phase,plan){
  const {state}=readRunJournal(root);
  return {...componentEnvironmentOptions(p),targetRoot:p.normal.target,ownerStateDigest:p.normal.ownerStateDigest,
    supervisedRoot:root,supervisedPhase:phase,supervisedPlanDigest:plan?.environment_plan_digest,
    previousSupervisedRoot:p.previousAppliedRun??null,previousSupervisedJournalDigest:p.previousAppliedJournalDigest??null,receiptObjectDigest:supervisedEnvironmentReceipt(state)};
}
function removeOwnedEnvironment(p,root,digest){
  if(!existsSync(root))return;
  const {files}=verifyInstructionEnvironment({...componentEnvironmentOptions(p),environmentObjectDigest:digest});
  const expected=new Map(files.map(f=>[f.path,f.raw_digest])),directories=new Set(['']);
  for(const f of files)for(let path=dirname(f.path);path!=='.';path=dirname(path))directories.add(path);
  const actual=[];
  const walk=(relative='')=>{for(const name of readdirSync(join(root,relative))){
    const path=relative?relative+'/'+name:name,full=join(root,path),s=lstatSync(full);assert.ok(!s.isSymbolicLink(),'owned candidate symlink drift');
    if(s.isDirectory()){assert.ok(directories.has(path),'unexpected candidate directory; no disposal');walk(path);}
    else{assert.ok(s.isFile()&&expected.has(path),'unexpected candidate file; no disposal');assert.equal(hash(readStableBytes(full,'owned candidate')),expected.get(path),'owned candidate byte drift');actual.push(path);}
  }};walk();assert.equal(actual.length,expected.size,'owned candidate missing files');rmSync(root,{recursive:true});
}
function ownedRoot(p,c,path,{allowMissing=false}={}){
  if(!existsSync(path)){assert.ok(allowMissing,'owned completed projection is missing');return;}
  assertNoSymlinkPathSegments(path,'owned component projection');const actual=lstatSync(path),expected=c.owned_roots?.[path];
  assert.ok(expected&&actual.isDirectory()&&actual.dev===expected.dev&&actual.ino===expected.ino,'owned projection directory replaced');
}
function componentVersion(p,c,action,previous=c.registry){
  return transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:previous.snapshot_digest,trustedAuthorityContexts:previous.trusted_authority_contexts,
    candidateAssets:action==='retire'?c.owned_candidate_assets:c.candidate_assets,baselineAssets:c.baseline_assets,action,authority:p.assetAuthority,
    baselineSnapshotDigest:action==='restore'?c.registry.snapshot_digest:null});
}
export async function executeComponentInstructionLoopStage(p,job,{root,modelCallsAuthorized=false}){
  if(job.kind==='generate')return generateComponentInstructionCandidate(p,job,{modelCallsAuthorized});
  if(job.kind==='register')return candidate(p,job.input.candidate);
  if(job.kind==='plan'){
    assert.notEqual(p.normal.target,null);const result=planEnvironmentTargetApply(ownerOptions(p,root,'plan'));
    return {environment_plan:result.plan,environment_plan_digest:result.digest,target:p.normal.target,formal_admission_implied:false};
  }
  if(job.kind==='apply'){
    const result=planEnvironmentTargetApply(ownerOptions(p,root,'apply',job.input.plan));
    assert.equal(result.digest,job.input.plan.environment_plan_digest,'target changed since human review');
    assert.equal(canonicalDigest(result.plan),canonicalDigest(job.input.plan.environment_plan),'approved environment plan drift');
    const c=candidate(p,readRunJournal(root).state.outputs.register);
    const prepared=componentVersion(p,c,'activate');
    return {...applyEnvironmentTargetPlan(result.handle,result.digest),prepared_registry:prepared,normal_owner:Boolean(p.normal.ownerStateDigest),formal_admission_implied:false};
  }
  if(job.kind==='restore'){
    const s=readRunJournal(root).state,c=candidate(p,s.outputs.register),previous=s.outputs.cleanup?.registry??s.outputs.activate;
    const prepared=componentVersion(p,c,'restore',previous);
    return {...restoreEnvironmentTarget(ownerOptions(p,root,'restore',job.input.plan)),prepared_registry:prepared};
  }
  if(job.kind==='version'){
    const c=candidate(p,job.input.candidate),previous=job.input.previous_version??c.registry;
    return componentVersion(p,c,job.input.action,previous);
  }
  assert.equal(job.kind,'cleanup');const c=candidate(p,job.input.candidate),s=readRunJournal(root).state;
  let registry=job.input.retirement??s.outputs.activate??c.registry;
  const unused=c.owned_candidate_assets.filter(a=>!c.candidate_assets.some(b=>canonicalDigest(a)===canonicalDigest(b)));
  if(job.input.disposition==='applied'&&unused.length)registry=transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:registry.snapshot_digest,
    trustedAuthorityContexts:registry.trusted_authority_contexts,candidateAssets:unused,action:'retire',authority:p.assetAuthority});
  if(job.input.disposition==='unchanged'&&c.owned_candidate_assets.length)registry=transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:registry.snapshot_digest,
    trustedAuthorityContexts:registry.trusted_authority_contexts,candidateAssets:c.owned_candidate_assets,action:'retire',authority:p.assetAuthority});
  if(['rejected','unchanged'].includes(job.input.disposition)){
    const assets=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:registry.snapshot_digest,trustedAuthorityContexts:registry.trusted_authority_contexts}).assets;
    assert.ok(c.owned_candidate_assets.every(a=>assets.some(b=>b.record_digest===a.record_digest&&b.state==='retired')),'all owned candidates must be retired before disposal');
    ownedRoot(p,c,p.candidateRoot,{allowMissing:true});ownedRoot(p,c,p.practical.baselineRoot,{allowMissing:true});
    removeOwnedEnvironment(p,p.candidateRoot,c.environment_object_digest);removeOwnedEnvironment(p,p.practical.baselineRoot,c.baseline_environment_object_digest);
  }
  return {disposition:job.input.disposition,registry,owned_materializations_removed:['rejected','unchanged'].includes(job.input.disposition),evidence_preserved:true};
}
async function inspectComponentStage(p,job,{root}){
  if(job.kind==='generate'){
    const path=join(p.stateRoot,'component-candidate.json');if(!existsSync(path))return null;
    const c=candidate(p,readJsonFileStrict(path));assert.equal(c.generation_request_digest,canonicalDigest(job));assert.equal(c.generation_profile_digest,canonicalDigest(p));
    ownedRoot(p,c,p.candidateRoot);ownedRoot(p,c,p.practical.baselineRoot);return c;
  }
  if(job.kind==='register')return candidate(p,job.input.candidate);
  if(job.kind==='select')return prepareFullPracticalInstructionSelection(p,job);
  if(['plan','version','cleanup'].includes(job.kind))return executeComponentInstructionLoopStage(p,job,{root});
  if(['apply','restore'].includes(job.kind)){
    const result=inspectSupervisedEnvironmentTarget({...ownerOptions(p,root,job.kind,job.input.plan),supervisedPlan:job.input.plan.environment_plan});
    if(!result)return null;
    const s=readRunJournal(root).state,c=candidate(p,s.outputs.register),previous=s.outputs.cleanup?.registry??s.outputs.activate;
    return {...result,...(job.kind==='apply'?{normal_owner:Boolean(p.normal.ownerStateDigest),formal_admission_implied:false}:{}),
      prepared_registry:componentVersion(p,c,job.kind==='apply'?'activate':'restore',job.kind==='apply'?c.registry:previous)};
  }
  return null;
}
export function createComponentInstructionLoopRuntime({definition,modelCallsAuthorized=false}){
  return createPracticalLifecycleRuntime({definition,modelCallsAuthorized,readProfile:()=>checkedProfile(definition),executeStage:executeComponentInstructionLoopStage,inspectStage:inspectComponentStage,
    validateCoordinatorRoot(root,p){for(const path of checkedPaths(p))assert.ok(root!==path&&!root.startsWith(path+'/')&&!path.startsWith(root+'/'),'component coordinator overlaps source, state or owner');}});
}

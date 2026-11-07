#!/usr/bin/env node
import {readInstructionLoopJson,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Trusted normal-installer adapter. Source/target arguments are fixed by the
// host runtime, never selected by generated candidate or report fields.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { existsSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { canonicalDigest, readJsonFileStrict, writeCanonicalJsonNoReplace,
  assertNoSymlinkPathSegments, readStableBytes } from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import {bindMeasuredNormalOwnerSource,verifyNormalOwnerSourceBinding} from './instruction-loop-source-binding.mjs';

export async function runNormalOwnerLoopOperation({sourceRoot,baselineSourceRoot,target,stagingRoot,job}){
  for(const path of [sourceRoot,baselineSourceRoot,target,stagingRoot]){
    assert.equal(resolve(path),path);assertNoSymlinkPathSegments(path,'normal owner runtime');
  }
  assert.ok(![sourceRoot,baselineSourceRoot,target].some(p=>p===stagingRoot||p.startsWith(stagingRoot+'/')||stagingRoot.startsWith(p+'/')),
    'cleanup staging must be disjoint from source and owner');
  const load=name=>import(pathToFileURL(join(sourceRoot,'scripts',name)).href);
  let candidateBinding;
  if(job.kind==='plan')candidateBinding=bindMeasuredNormalOwnerSource({sourceRoot,candidate:job.input.candidate});
  if(['apply','restore'].includes(job.kind)){
    candidateBinding=verifyNormalOwnerSourceBinding({sourceRoot,binding:job.input.plan.candidate_binding});
    assert.equal(job.input.plan.normal_plan.source.revision,candidateBinding.source_revision,'plan source differs from measured candidate');
  }
  const state=job.kind==='cleanup'?null:await load('ask-setup-apply-state.mjs');
  if(job.kind==='plan'){
    assert.equal(job.input.target,target,'normal target transplant');
    const {createAdoptionPlan}=await load('ask-setup.mjs');
    const baselineManaged=state.managedSetupIdentities(target);
    const plan=await createAdoptionPlan({target,adapter:'codex',profile:'full'});
    assert.equal(plan.source.revision,candidateBinding.source_revision,'plan source differs from measured candidate');
    verifyNormalOwnerSourceBinding({sourceRoot,binding:candidateBinding});
    return {normal_plan:plan,baseline_managed:baselineManaged,target,source_revision:plan.source.revision,
      candidate_binding:candidateBinding,formal_admission_implied:false,measured_context:job.input.report.measured_context??'Unknown'};
  }
  if(job.kind==='apply'){
    const packet=job.input.plan;assert.equal(packet.target,target);
    assert.equal(job.input.decision.disposition,'approved');
    const {applyAdoptionPlan}=await load('ask-setup-apply.mjs');
    const result=await applyAdoptionPlan(packet.normal_plan,{target,adapter:'codex',authorized:true});
    assert.ok(['applied','already_applied'].includes(result.status),`normal apply ${result.status}: ${result.reason}`);
    return {result,target,result_digest:canonicalDigest(result),normal_owner:true,formal_admission_implied:false};
  }
  if(job.kind==='restore'){
    const packet=job.input.plan;assert.equal(packet.target,target);
    assert.equal(job.input.decision.disposition,'approved');
    if(canonicalDigest(state.managedSetupIdentities(target))===canonicalDigest(packet.baseline_managed))
      return {status:'already_restored',target,baseline_managed:packet.baseline_managed};
    const final=packet.normal_plan.application.phases.at(-1);
    const {planningSource}=await load('ask-setup.mjs');
    const currentSource=await planningSource('codex','full');
    assert.equal(canonicalDigest(currentSource.source),canonicalDigest(packet.normal_plan.source),'installer source changed after apply');
    assert.equal(canonicalDigest(state.captureApplyTarget(target).binding),canonicalDigest(final.expected_target),'target changed after apply; re-plan restoration');
    assert.equal(canonicalDigest(state.managedSetupIdentities(target)),canonicalDigest(final.managed_identities),'owner changed after apply; no automatic rollback');
    const calls=[...state.setupInstallerInvocations('codex','full',packet.normal_plan.application.selected_skills,target)].reverse();
    for(const call of calls){
      const rollback={...call,args:['--target',target,'--rollback']};
      assert.equal(state.invokeSetupInstaller(sourceRoot,rollback,{dryRun:true}).failed,false,'rollback preview failed');
      assert.equal(state.invokeSetupInstaller(sourceRoot,rollback).failed,false,'rollback failed; inspect partial effects');
    }
    const restored=state.managedSetupIdentities(target);
    assert.equal(canonicalDigest(restored),canonicalDigest(packet.baseline_managed),'baseline owner not restored');
    return {status:'restored',target,baseline_managed:restored};
  }
  if(job.kind==='cleanup'){
    // Delete only paths declared in this privately created ownership manifest;
    // never a generated path, source checkout, CAS blob, report or raw trial.
    const manifest=readJsonFileStrict(join(stagingRoot,'owned-files.json'));
    const actual=[];
    const walk=(path,prefix='')=>{for(const n of readdirSync(path)){
      const rel=prefix?prefix+'/'+n:n,p=join(path,n),s=lstatSync(p);assert.ok(!s.isSymbolicLink(),'cleanup refuses symlink');
      if(s.isDirectory())walk(p,rel);else {assert.ok(s.isFile());if(rel!=='owned-files.json')actual.push({path:rel,digest:instructionBytesDigest(readStableBytes(p,'owned staging'))});}
    }};walk(stagingRoot);
    const expected=new Map(manifest.files.map(f=>[f.path,f.digest]));assert.equal(expected.size,manifest.files.length,'duplicate owned staging path');
    for(const f of actual)assert.equal(expected.get(f.path),f.digest,'owned staging changed; no cleanup');
    for(const f of actual)rmSync(join(stagingRoot,f.path));
    // Keep manifest/root as the audit record. Empty directories are harmless.
    return {disposition:job.input.disposition,deleted_files:actual.map(x=>x.path),already_absent_owned_files:manifest.files.filter(f=>!actual.some(a=>a.path===f.path)).map(f=>f.path),evidence_preserved:true};
  }
  throw new Error('unsupported normal-owner operation');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [sourceRoot,baselineSourceRoot,target,stagingRoot,requestFile,resultFile]=process.argv.slice(2);
  const job=readInstructionLoopJson(requestFile);
  try{
    const output=await runNormalOwnerLoopOperation({sourceRoot,baselineSourceRoot,target,stagingRoot,job});
    writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'completed',output},label:'normal owner worker result',maximumBytes:INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES});
  }catch(error){
    writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'failed',output:{reason:String(error.message).slice(0,2048)}},label:'failed normal owner result'});
    process.exitCode=1;
  }
}

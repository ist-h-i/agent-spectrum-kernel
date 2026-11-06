import assert from 'node:assert/strict';
import {join,resolve,dirname} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {readJsonFileStrict,readStableBytes,canonicalDigest,assertNoSymlinkPathSegments,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {prepareNextSupervisedInstructionLoop,readCompletedInstructionLoopContinuation} from './supervised-instruction-loop.mjs';
import {createFullPracticalInstructionLoopConfiguration} from './instruction-loop-practical-runtime.mjs';
// A complete set of executable bindings. No ports/no-op placeholders remain.
export function createNativeInstructionLoopConfiguration(profilePath){
  profilePath=resolve(profilePath);const p=readJsonFileStrict(profilePath);
  if(p.kind==='full_practical_instruction_loop_profile_v1')return createFullPracticalInstructionLoopConfiguration(profilePath);
  assert.equal(p.kind,'full_native_reference_loop_profile_v1');assert.equal(p.normal.target,p.policy.normal_target);
  const paths=['instruction-loop-native-worker.mjs','instruction-loop-native-host.mjs','instruction-loop-full-candidate.mjs','instruction-loop-reference-report.mjs',
    'instruction-loop-native-prepare.py','instruction-loop-assets.mjs','instruction-loop-case-selection.mjs','instruction-loop-normal-owner-worker.mjs',
    'retained-instruction-comparison.mjs','retained-instruction-layout.mjs','instruction-environment.mjs','codex-exec-runner.mjs','asset-registry.mjs','content-addressed-store.mjs','instruction-loop-source-binding.mjs','instruction-loop-feedback.mjs','ask-personal-evolution-observation.mjs'];
  const pins=[{path:profilePath,digest:hash(readStableBytes(profilePath,'Full/native profile',16*1024*1024))},...paths.map(name=>({path:join(import.meta.dirname,name),digest:hash(readStableBytes(join(import.meta.dirname,name),'Full/native adapter'))}))];
  if(p.native.executionKind==='model_free_fixture')pins.push({path:p.native.fixtureExecutable,digest:p.native.fixtureExecutableDigest});
  const worker=join(import.meta.dirname,'instruction-loop-native-worker.mjs'),prefix=[process.execPath,worker,profilePath,pins[0].digest];
  const runtime={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(kind=>[kind,{
    argv:[...prefix,'execute'],inspect_argv:[...prefix,'inspect'],pins,
    model_calls:kind==='generate'?p.generator.provider.kind==='codex':kind==='trial'&&p.native.executionKind==='real_codex'}]))};
  return {policy:{...p.policy,runtime_digest:canonicalDigest(runtime)},runtime};
}

// Allocate the next private profile/config, including new source/Registry pins.
// This is preparation only: no generation, trial, grading or owner mutation.
export function prepareNextNativeInstructionLoopConfiguration({root,profilePath,configPath,outputRoot,id,feedback=null,decisionSummaries={},resultSummary=null}){
  const old=readJsonFileStrict(resolve(profilePath)),history=readCompletedInstructionLoopContinuation(root);
  const previousConfig=readJsonFileStrict(resolve(configPath));
  assert.equal(canonicalDigest(previousConfig.policy),canonicalDigest(history.policy),'previous configuration policy differs from completed run');
  assert.equal(canonicalDigest(previousConfig.runtime),history.policy.runtime_digest,'previous runtime configuration drift');
  const previousProfileDigest=hash(readStableBytes(resolve(profilePath),'previous pinned native profile',16*1024*1024));
  const practical=old.kind==='full_practical_instruction_loop_profile_v1';
  assert.ok(practical?previousConfig.runtime.kind==='full_practical_instruction_loop_runtime_v1'&&previousConfig.runtime.profile_path===resolve(profilePath)&&previousConfig.runtime.profile_digest===previousProfileDigest:
    previousConfig.runtime.commands&&Object.values(previousConfig.runtime.commands).length===10&&Object.values(previousConfig.runtime.commands).every(c=>
      c.pins.some(pin=>pin.path===resolve(profilePath)&&pin.digest===previousProfileDigest)),'previous profile is not pinned by completed runtime');
  assert.ok(practical||old.kind==='full_native_reference_loop_profile_v1');
  const withoutRuntime=p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!=='runtime_digest'));
  assert.equal(canonicalDigest(withoutRuntime(old.policy)),canonicalDigest(withoutRuntime(history.policy)),'previous native profile does not match completed run');
  assert.match(id,/^[a-zA-Z0-9._-]{1,100}$/u);assert.notEqual(id,old.policy.id);
  outputRoot=resolve(outputRoot);assertNoSymlinkPathSegments(outputRoot,'fresh next-cycle configuration',{allowMissingLeaf:true});
  assert.ok(outputRoot.startsWith(old.protectedRoot+'/'),'next cycle remains inside the protected host root');
  assert.ok(!existsSync(outputRoot),'fresh next-cycle configuration required');
  for(const path of [resolve(root),old.generator.baselineSourceRoot,old.generator.candidateRoot,old.generator.fullRoot,
    old.generator.stagingRoot,old.stateRoot,...(practical?[old.practical.root,old.practical.baselineRoot]:[old.native.root,old.native.workRoot]),...(old.normal.target===null?[]:[old.normal.target])])
    assert.ok(outputRoot!==path&&!outputRoot.startsWith(path+'/')&&!path.startsWith(outputRoot+'/'),'next-cycle configuration overlaps an existing source, run or owner');
  const p=structuredClone(old);
  p.stateRoot=join(outputRoot,'state');p.generator.candidateRoot=join(outputRoot,'candidate');
  p.generator.fullRoot=join(outputRoot,'full');p.generator.stagingRoot=join(outputRoot,'staging');
  const cycleKey=canonicalDigest({previous_journal:history.journal_digest,id}).slice(7,47);
  p.generator.environmentId='instruction-cycle-'+cycleKey;
  if(p.generator.provider.kind==='codex')p.generator.provider.sessionRoot=join(outputRoot,'generation-session');
  // Native preparation requires the existing template's sibling/depth layout.
  if(practical)p.practical.root=join(dirname(old.practical.root),'ask-practical-cycle-'+cycleKey);
  else{p.native.root=join(dirname(old.native.root),'ask-native-cycle-'+cycleKey);p.native.workRoot=join(dirname(old.native.workRoot),'ask-work-cycle-'+cycleKey);}
  for(const path of [...(practical?[p.practical.root]:[p.native.root,p.native.workRoot]),p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot]){
    assertNoSymlinkPathSegments(path,'fresh next-cycle materialization',{allowMissingLeaf:true});
    assert.ok(!existsSync(path),'next-cycle destination already allocated');
  }
  assert.ok(history.registry?.snapshot_digest,'completed run lacks Registry version closure');
  p.generator.registrySnapshotDigest=history.registry.snapshot_digest;
  p.generator.trustedAuthorityContexts=history.registry.trusted_authority_contexts??[];
  if(history.outcome==='applied'){
    const c=history.candidate;
    p.generator.baselineSourceRoot=c.source_root;p.generator.baselineRevision=c.source_revision;
    p.generator.parentAssets=c.candidate_assets;
    if(practical)p.practical.baselineRoot=c.full_root;else p.native.baselineFullRoot=c.full_root;
    p.baselineEnvironmentObjectDigest=c.environment_object_digest;
  }
  p.selection.observedCosts={...(p.selection.observedCosts??{})};
  for(const row of history.report?.rows??[])if(typeof row.fixture_id==='string'&&Number.isFinite(row.cli_seconds)&&row.cli_seconds>=0)
    p.selection.observedCosts[row.fixture_id]=Math.max(p.selection.observedCosts[row.fixture_id]??0,row.cli_seconds*1000);
  // Existing answer judgments bind their original archives, never future runs.
  if(p.report){p.report.assessments=[];delete p.report.recovery;}
  const metrics=Object.fromEntries(Object.entries(history.report?.conditions??{}).map(([role,condition])=>{
    assert.ok(['baseline','challenger'].includes(role));
    return [role,Object.fromEntries(['confirmed_points','unknown_points','unmet_points','cli_seconds','root_input_tokens','root_output_tokens']
      .map(k=>{const v=condition[k];assert.ok(v==null||Number.isFinite(v)&&v>=0);return [k,v??null];}))];
  }));
  if(practical){
    for(const attempt of history.report?.all_attempts??[]){const value=attempt.observation?.metrics?.duration_ms;
      if(Number.isFinite(value)&&value>=0)p.selection.observedCosts[attempt.row.case_id]=Math.max(p.selection.observedCosts[attempt.row.case_id]??0,value);}
    for(const condition of old.practical.conditions?Object.keys(old.practical.conditions):[]){
      const attempts=(history.report?.all_attempts??[]).filter(a=>a.row.condition===condition&&a.included_in_comparison);
      metrics[condition]={selected:attempts.length,pass:attempts.filter(a=>a.observation.outcome==='pass').length,
        fail:attempts.filter(a=>a.observation.outcome==='fail').length,unknown:attempts.filter(a=>a.observation.outcome==='unknown').length};
    }
    metrics.all_attempt_resources=history.report?.resources_all_attempts??null;
    metrics.assessment_cost='Unknown unless supplied by provider; excluded from trial metrics';
  }
  const freshFeedback=feedback??(old.policy.observation.kind==='instruction_loop_continuation_v1'?old.policy.observation.feedback:old.policy.observation);
  const prepared=prepareNextSupervisedInstructionLoop({root,nextPolicy:{...history.policy,id,observation:freshFeedback},decisionSummaries,
    resultSummary:resultSummary??`Previous observed result metrics (not formal admission): ${JSON.stringify(metrics)}. Missing components remain unknown.`});
  assert.equal(prepared.policy.observation.previous.journal_digest,history.journal_digest,'previous cycle changed during preparation');
  p.policy=prepared.policy;delete p.policy.runtime_digest;
  mkdirSync(outputRoot,{mode:0o700});
  const nextProfilePath=join(outputRoot,'profile.json');
  writeCanonicalJsonNoReplace({outputPath:nextProfilePath,artifact:p,label:'next-cycle native profile',maximumBytes:16*1024*1024});
  const config=createNativeInstructionLoopConfiguration(nextProfilePath),nextConfigPath=join(outputRoot,'config.json');
  writeCanonicalJsonNoReplace({outputPath:nextConfigPath,artifact:config,label:'next-cycle native configuration',maximumBytes:16*1024*1024});
  return {status:'prepared',profile_path:nextProfilePath,config_path:nextConfigPath,run_root:join(outputRoot,'run'),
    policy_digest:canonicalDigest(config.policy),models_started:false,approval_carried_forward:false};
}

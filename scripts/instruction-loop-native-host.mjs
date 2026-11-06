// Concrete Full/native/reference bindings for the supervised controller.
// Native execution still uses the original Python runner/control/monitor.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {fullInstructionInventory,generateFullInstructionCandidate,codexFullInstructionProvider,registerFullInstructionCandidate,compareFullInstructionContext} from './instruction-loop-full-candidate.mjs';
import {selectInstructionLoopCases} from './instruction-loop-case-selection.mjs';
import {prepareRetainedInstructionComparison,readRetainedInstructionResults} from './retained-instruction-comparison.mjs';
import {buildInstructionLoopReferenceReport} from './instruction-loop-reference-report.mjs';
import {runNormalOwnerLoopOperation} from './instruction-loop-normal-owner-worker.mjs';
import {transitionInstructionLoopAssets} from './instruction-loop-assets.mjs';
import {verifyRetainedInstructionLayout} from './retained-instruction-layout.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {bindMeasuredNormalOwnerSource} from './instruction-loop-source-binding.mjs';
const pause=()=>new Promise(r=>setTimeout(r,500));
const checked=r=>{assert.equal(hash(readStableBytes(r.path,'pinned native host input',16*1024*1024)),r.digest,'native host input drift');return readJsonFileStrict(r.path);};
const save=(path,artifact)=>writeCanonicalJsonNoReplace({outputPath:path,artifact,label:'native loop stage result',maximumBytes:16*1024*1024});
const preparedPath=p=>join(p.stateRoot,'native-selection.json');
function publication(path,result){if(existsSync(path)){assert.equal(canonicalDigest(readJsonFileStrict(path)),canonicalDigest(result),'terminal result conflict');return;}save(path,result);}
function sourceInputs(p){
  assert.equal(p.kind,'full_native_reference_loop_profile_v1');
  assert.equal(p.generator.storeRoot,p.storeRoot);assert.equal(p.native.protectedRoot,p.protectedRoot);
  for(const path of [p.stateRoot,p.protectedRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,...(p.normal.target===null?[]:[p.normal.target]),p.native.root,p.native.workRoot]){
    assert.equal(resolve(path),path,'absolute native host path required');assertNoSymlinkPathSegments(path,'native host path',{allowMissingLeaf:true});
  }
  assert.ok(p.stateRoot.startsWith(p.protectedRoot+'/')&&p.generator.candidateRoot.startsWith(p.protectedRoot+'/'),'operator inputs must remain under the protected root');
  if(p.native.executionKind==='model_free_fixture'){
    const fixture=join(import.meta.dirname,'fixtures/instruction-loop/fake-codex.py');
    assert.equal(hash(readStableBytes(p.native.fixtureExecutable,'pinned fixture executable')),p.native.fixtureExecutableDigest,'fixture executable drift');
    assert.equal(hash(readStableBytes(p.native.fixtureExecutable,'fixture executable')),hash(readStableBytes(fixture,'shipped fixture executable')),'fixture mode requires the shipped model-free executable');
  }else assert.equal(p.native.executionKind,'real_codex');
}
async function readTrial(p,job,recovered=false){
  const selection=job.input.selection;assert.ok(selection?.execution_binding,'approved native binding required');
  assert.equal(selection.execution_binding.config_path,join(p.native.root,'config.json'));
  const request={storeRoot:p.storeRoot,planObjectDigest:selection.execution_binding.plan_object_digest,trustedAssetAuthorityContexts:p.generator.trustedAuthorityContexts??[]};
  const c=readRetainedInstructionResults(request).rows.find(r=>r.trial_id===job.input.row.id);assert.ok(c,'native trial mapping missing');
  if(!['completed','failed_or_interrupted'].includes(c.state))return null;
  const done=readJsonFileStrict(join(c.trial_root,'completion.json'));if(done.ready_for_next_root!==true)return null;
  return {...c,ready_for_next_root:true,execution_kind:p.native.executionKind,root_usage:c.root_usage,
    full_hierarchical_usage:null,recovered_from_native_records:recovered};
}
export async function executeNativeInstructionLoopStage(p,job,{modelCallsAuthorized=false}={}){
  sourceInputs(p);mkdirSync(p.stateRoot,{recursive:true,mode:0o700});
  if(job.kind==='generate'){
    let provider;
    if(p.generator.provider.kind==='fixture')provider=async()=>({response:checked(p.generator.provider.response),execution:{kind:'model_free_fixture',model_calls:0}});
    else {assert.equal(p.generator.provider.kind,'codex');assert.equal(modelCallsAuthorized,true,'Full generation model call not authorized');
      provider=input=>codexFullInstructionProvider({...p.generator.provider,modelCallsAuthorized},input);}
    const generated=await generateFullInstructionCandidate(p.generator,provider);
    // Archive the private, independently owned version before it can be
    // retired/deleted. Original repositories and immutable trial logs are not
    // cleanup targets. This archive is local and is never sent externally.
    const archive=join(p.stateRoot,'owned-candidate-version.tar.gz');
    const tar=spawnSync('/usr/bin/tar',['-czf',archive,'-C',p.generator.candidateRoot,'.'],{encoding:'utf8'});assert.equal(tar.status,0,'candidate version archive failed');
    const version={path:p.generator.candidateRoot,source_revision:generated.source_revision,archive,archive_digest:hash(readStableBytes(archive,'owned version archive',512*1024*1024)),
      tracked_files:fullInstructionInventory(p.generator.candidateRoot).filter(f=>!f.path.startsWith('.git/'))};
    const manifest=join(p.stateRoot,'owned-version.json');save(manifest,version);
    return {...generated,owned_version:{path:version.path,source_revision:version.source_revision,archive:version.archive,
      archive_digest:version.archive_digest,manifest,manifest_digest:canonicalDigest(version)}};
  }
  if(job.kind==='register')return registerFullInstructionCandidate(p.generator,job.input.candidate);
  if(job.kind==='select'){
    const fairness=compareFullInstructionContext({baselineRoot:p.native.baselineFullRoot,candidateRoot:job.input.candidate.full_root,skills:p.generator.skills});
    const selected=selectInstructionLoopCases({...p.selection,catalog:job.input.catalog});
    const fixedCriteria=checked(p.report.criteria);
    for(const id of selected.case_ids)assert.ok(fixedCriteria.some(f=>f.fixture_id===id&&Array.isArray(f.requirements)&&f.requirements.length>0),'selected case lacks its fixed reporting criteria');
    const template=checked({path:p.native.templateConfig,digest:p.native.templateConfigDigest});
    for(const id of selected.case_ids){const c=job.input.catalog.find(c=>c.id===id),r=template.rows.find(r=>r.fixture_id===id);assert.ok(r);assert.equal(c.public_input_digest,canonicalDigest(r.public_inventory),'selected public input differs from approved catalog');}
    const request=join(p.stateRoot,'native-preparation-request.json');
    save(request,{profile:p.native,selection:selected,candidate:job.input.candidate,policy:p.policy});
    const result=spawnSync(p.native.python,['-B',join(import.meta.dirname,'instruction-loop-native-prepare.py'),request],{encoding:'utf8',maxBuffer:4*1024*1024});
    assert.equal(result.status,0,'existing-native preparation failed; inspect allocated inputs, do not retry');
    const preparation=JSON.parse(result.stdout);
    const retained=prepareRetainedInstructionComparison({storeRoot:p.storeRoot,configPath:preparation.config_path,preparationManifestDigest:preparation.manifest_digest,trustedAssetAuthorityContexts:p.generator.trustedAuthorityContexts??[],
      environments:{baseline:p.baselineEnvironmentObjectDigest,challenger:job.input.candidate.environment_object_digest}});
    const value={...selected,full_context_comparison:fairness,quality_plan:{criteria:p.report.criteria,
      policy:'Read fixed reference judgments; missing judgments remain unknown. No automatic new model judge is implied.',available_judgments:p.report.assessments?.length??0},
      execution_binding:{...preparation,plan_object_digest:retained.object_digest,model:retained.plan.model,effort:retained.plan.effort,runner:retained.plan.runner,
      model_autonomy:'existing wrapper unchanged except path rebasing; child/history choices remain model decisions'}};
    save(preparedPath(p),value);return value;
  }
  if(job.kind==='trial'){
    assert.equal(job.input.evaluation_decision.disposition,'approved');
    if(p.native.executionKind==='real_codex')assert.equal(modelCallsAuthorized,true,'new implementation model trial not authorized');
    assert.equal(canonicalDigest(job.input.selection),canonicalDigest(readJsonFileStrict(preparedPath(p))),'approved native selection drift');
    const config=readJsonFileStrict(join(p.native.root,'config.json')),row=config.rows.find(r=>r.trial_id===job.input.row.id);assert.ok(row);
    assert.equal(row.fixture_id,job.input.row.case.id);assert.equal(row.variant,job.input.row.condition);assert.equal(row.repetition,job.input.row.repetition);
    // The original control repeats the same nonblocking mutex check atomically
    // while launching. This probe does not assert global process visibility.
    const lock=spawnSync(p.native.python,['-c','import fcntl,sys; f=open(sys.argv[1],"a+"); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)',config.cross_series_lock],{encoding:'utf8'});
    assert.equal(lock.status,0,'existing cross-series mutex busy or unavailable');
    const release=join(p.native.root,`release-${row.sequence}.json`);
    save(release,{kind:'root_reviewed_normal24_single_trial_release',trial_id:row.trial_id,
      manifest_sha256:job.input.selection.execution_binding.manifest_digest,root_process_check_no_known_active_trials:true,
      process_check_scope:'shared existing cross-series mutex plus this protocol previous-root closure; unrelated process visibility is not claimed'});
    const launch=spawnSync(p.native.python,['-B',join(p.native.root,'control.py'),'launch','--trial-id',row.trial_id,'--release',release],{encoding:'utf8',maxBuffer:1024*1024});
    assert.equal(launch.status,0,'existing native once-only control failed; preserve launch state');
    if(p.native.fixtureExitAfterLaunch){assert.equal(p.native.executionKind,'model_free_fixture');return {worker_exit_without_result:true};}
    for(;;){const terminal=await readTrial(p,job);if(terminal)return terminal;
      if(existsSync(join(row.trial_root,'supervisor-error.json')))throw new Error('native supervisor failed; do not relaunch');
      if(existsSync(join(row.trial_root,'supervisor-exit.json'))&&readJsonFileStrict(join(row.trial_root,'supervisor-exit.json')).ready_for_next_root!==true)
        throw new Error('native root ended with unconfirmed closure; do not relaunch');
      await pause();}
  }
  if(job.kind==='report'){
    const report=buildInstructionLoopReferenceReport({...p.report,storeRoot:p.storeRoot,planObjectDigest:job.input.selection.execution_binding.plan_object_digest,
      trustedAssetAuthorityContexts:p.generator.trustedAuthorityContexts??[],executionKind:p.native.executionKind});
    report.worker_incidents=job.input.trials.filter(t=>t.transport_interruption).map(t=>({trial_id:t.trial_id,transport_interruption:t.transport_interruption,
      root_result:t.state,recovered_from_native_records:t.recovered_from_native_records}));
    report.measured_context=`Full frozen native snapshot; declared supporting context is retained. Normal owner uses the existing source-backed installer projection. Candidate source ${job.input.candidate.source_revision}; no performance claim for a different projection.`;
    return report;
  }
  if(['plan','apply','restore','cleanup'].includes(job.kind)){
    assert.notEqual(p.normal.target,null,'normal owner target required for owner operations');
    if(job.kind==='cleanup'&&job.input.disposition==='rejected')bindMeasuredNormalOwnerSource({sourceRoot:p.generator.candidateRoot,candidate:job.input.candidate});
    const value=await runNormalOwnerLoopOperation({sourceRoot:p.generator.candidateRoot,baselineSourceRoot:p.generator.baselineSourceRoot,target:p.normal.target,stagingRoot:p.generator.stagingRoot,job});
    if(job.kind==='cleanup'&&job.input.disposition==='rejected'){
      const retirement=job.input.retirement;assert.ok(retirement,'candidate retirement must precede disposal');
      const assets=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:retirement.snapshot_digest,trustedAuthorityContexts:retirement.trusted_authority_contexts}).assets;
      assert.ok(job.input.candidate.candidate_assets.every(a=>assets.some(e=>e.record_digest===a.record_digest&&e.state==='retired')),'candidate is still active');
      const owned=readJsonFileStrict(join(p.stateRoot,'owned-version.json'));assert.equal(owned.path,p.generator.candidateRoot);
      assert.equal(canonicalDigest(owned),job.input.candidate.owned_version.manifest_digest,'owned version manifest drift');
      const state=await import(pathToFileURL(join(owned.path,'scripts/ask-setup-apply-state.mjs')).href);
      assert.ok(state.managedSetupIdentities(p.normal.target).every(i=>i.source_revision!==owned.source_revision),'candidate is still installed on the scoped owner');
      assert.equal(hash(readStableBytes(owned.archive,'owned version archive',512*1024*1024)),owned.archive_digest);
      const actual=fullInstructionInventory(owned.path).filter(f=>!f.path.startsWith('.git/'));
      assert.equal(canonicalDigest(actual),canonicalDigest(owned.tracked_files),'owned source changed before disposal');
      assert.ok(!p.normal.target.startsWith(owned.path+'/')&&!p.generator.baselineSourceRoot.startsWith(owned.path+'/'));
      const retained=verifyRetainedInstructionLayout({storeRoot:p.storeRoot,layoutObjectDigest:job.input.candidate.layout_object_digest});
      assert.equal(canonicalDigest(fullInstructionInventory(p.generator.fullRoot)),canonicalDigest(retained.layout.files.map(f=>({path:f.path,bytes:f.bytes,mode:f.mode,sha256:f.raw_digest}))), 'owned Full snapshot changed before disposal');
      rmSync(owned.path,{recursive:true});
      rmSync(p.generator.fullRoot,{recursive:true});
      return {...value,owned_version_materialization_removed:true,owned_full_snapshot_removed:true,version_archive_preserved:owned.archive};
    }
    return value;
  }
  assert.equal(job.kind,'version');const previous=job.input.previous_version??job.input.candidate.registry;
  return transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:previous.snapshot_digest,trustedAuthorityContexts:previous.trusted_authority_contexts,
    candidateAssets:job.input.candidate.candidate_assets,baselineAssets:p.generator.parentAssets,action:job.input.action,authority:p.assetAuthority});
}
export async function nativeInstructionLoopWorker({profile,job,resultPath,action='execute',modelCallsAuthorized=false}){
  sourceInputs(profile);mkdirSync(profile.stateRoot,{recursive:true,mode:0o700});
  const sidecar=join(profile.stateRoot,'stage-'+canonicalDigest(job).slice(7)+'.json');
  if(existsSync(sidecar)){const result=readJsonFileStrict(sidecar);assert.equal(result.request_digest,canonicalDigest(job));publication(resultPath,result);return;}
  if(action==='inspect'){
    if(job.kind==='trial'){const out=await readTrial(profile,job,true);if(out){const result={request_digest:canonicalDigest(job),status:out.state==='completed'?'completed':'failed',output:out};publication(sidecar,result);publication(resultPath,result);}}
    return; // Other unknown partial operations remain uncertain; no replay.
  }
  assert.equal(action,'execute');
  try{
    const output=await executeNativeInstructionLoopStage(profile,job,{modelCallsAuthorized});
    if(output.worker_exit_without_result){process.exitCode=83;return;}
    const result={request_digest:canonicalDigest(job),status:output.state==='failed_or_interrupted'?'failed':'completed',output};
    publication(sidecar,result);publication(resultPath,result);
  }catch(error){const result={request_digest:canonicalDigest(job),status:'failed',output:{reason:String(error.message).slice(0,2048)}};publication(sidecar,result);publication(resultPath,result);process.exitCode=1;}
}

import {readInstructionLoopJson,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Concrete Full/native/reference bindings for the supervised controller.
// Native execution still uses the original Python runner/control/monitor.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {fullInstructionInventory,generateFullInstructionCandidate,codexFullInstructionProvider,registerFullInstructionCandidate,compareFullInstructionContext} from './instruction-loop-full-candidate.mjs';
import {retainedFullAuthoringProvider} from './instruction-loop-retained-authoring.mjs';
import {selectInstructionLoopCases} from './instruction-loop-case-selection.mjs';
import {prepareRetainedInstructionComparison,readRetainedInstructionResults} from './retained-instruction-comparison.mjs';
import {buildInstructionLoopReferenceReport} from './instruction-loop-reference-report.mjs';
import {runNormalOwnerLoopOperation,cleanOwnedInstructionLoopStaging} from './instruction-loop-normal-owner-worker.mjs';
import {planSourceApplication,prepareSourceApplication,verifyRetainedSourceApplication} from './instruction-loop-source-application.mjs';
import {transitionInstructionLoopAssets} from './instruction-loop-assets.mjs';
import {verifyRetainedInstructionLayout} from './retained-instruction-layout.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {bindMeasuredNormalOwnerSource} from './instruction-loop-source-binding.mjs';
import {runInstructionReferenceScoring} from './instruction-loop-reference-scoring-runtime.mjs';
import {bindNativePublicInputs} from './instruction-loop-native-public-inputs.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';
const pause=()=>new Promise(r=>setTimeout(r,500));
const checked=r=>{assert.equal(hash(readStableBytes(r.path,'pinned native host input',16*1024*1024)),r.digest,'native host input drift');return readJsonFileStrict(r.path,'pinned native host input',16*1024*1024);};
const save=(path,artifact)=>writeCanonicalJsonNoReplace({outputPath:path,artifact,label:'native loop stage result',maximumBytes:INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES});
const preparedPath=p=>join(p.stateRoot,'native-selection.json');
function publication(path,result){if(existsSync(path)){assert.equal(canonicalDigest(readInstructionLoopJson(path)),canonicalDigest(result),'terminal result conflict');return;}save(path,result);}
function sourceInputs(p){
  assert.ok(['full_native_reference_loop_profile_v1','full_practical_instruction_loop_profile_v1'].includes(p.kind));
  assert.equal(p.generator.storeRoot,p.storeRoot);
  if(p.kind==='full_native_reference_loop_profile_v1')assert.equal(p.native.protectedRoot,p.protectedRoot);
  for(const path of [p.stateRoot,p.protectedRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,...(p.normal.target===null?[]:[p.normal.target]),
    ...(p.kind==='full_native_reference_loop_profile_v1'?[p.native.root,p.native.workRoot]:[p.practical.root])]){
    assert.equal(resolve(path),path,'absolute native host path required');assertNoSymlinkPathSegments(path,'native host path',{allowMissingLeaf:true});
  }
  assert.ok(p.stateRoot.startsWith(p.protectedRoot+'/')&&p.generator.candidateRoot.startsWith(p.protectedRoot+'/'),'operator inputs must remain under the protected root');
  if(p.kind==='full_practical_instruction_loop_profile_v1')return;
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
export function verifyOwnedFullCandidate(p,candidate){
  assert.equal(candidate.source_root,p.generator.candidateRoot);assert.equal(candidate.full_root,p.generator.fullRoot);
  bindMeasuredNormalOwnerSource({sourceRoot:p.generator.candidateRoot,candidate});
  const owned=readInstructionLoopJson(join(p.stateRoot,'owned-version.json'));assert.equal(owned.path,p.generator.candidateRoot);
  assert.equal(canonicalDigest(owned),candidate.owned_version.manifest_digest,'owned version manifest drift');
  assert.equal(hash(readStableBytes(owned.archive,'owned version archive',512*1024*1024)),owned.archive_digest);
  assert.equal(canonicalDigest(fullInstructionInventory(owned.path)),canonicalDigest(owned.tracked_files),'owned source changed before disposal');
  for(const removed of [owned.path,p.generator.fullRoot])for(const retained of [p.generator.baselineSourceRoot,p.storeRoot,p.stateRoot,...(p.normal.target===null?[]:[p.normal.target])])
    assert.ok(removed!==retained&&!removed.startsWith(retained+'/')&&!retained.startsWith(removed+'/'),'owned disposal overlaps retained source, evidence or owner');
  const retained=verifyRetainedInstructionLayout({storeRoot:p.storeRoot,layoutObjectDigest:candidate.layout_object_digest});
  assert.equal(canonicalDigest(fullInstructionInventory(p.generator.fullRoot)),canonicalDigest(retained.layout.files.map(f=>({path:f.path,bytes:f.bytes,mode:f.mode,sha256:f.raw_digest}))), 'owned Full snapshot changed before disposal');
  return owned;
}
export async function executeNativeInstructionLoopStage(p,job,{modelCallsAuthorized=false,inspectOnly=false,coordinatorRoot=null,root=null}={}){
  sourceInputs(p);mkdirSync(p.stateRoot,{recursive:true,mode:0o700});
  if(job.kind==='generate'){
    assert.equal(canonicalDigest(job.input.observation),canonicalDigest(p.policy.observation),'controller observation differs from pinned profile');
    projectInstructionLoopObservation(job.input.observation);
    let provider;
    if(p.generator.provider.kind==='fixture')provider=async input=>p.generator.provider.retainedAuthoring?retainedFullAuthoringProvider(p.generator.provider,input):({response:checked(p.generator.provider.response),execution:{kind:'model_free_fixture',model_calls:0}});
    else {assert.equal(p.generator.provider.kind,'codex');assert.equal(modelCallsAuthorized,true,'Full generation model call not authorized');
      provider=input=>codexFullInstructionProvider({...p.generator.provider,modelCallsAuthorized},input);}
    const generated=await generateFullInstructionCandidate({...p.generator,observation:job.input.observation},provider);
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
  if(job.kind==='register'){const context=compareFullInstructionContext({baselineRoot:p.kind==='full_practical_instruction_loop_profile_v1'?p.practical.baselineRoot:p.native.baselineFullRoot,candidateRoot:job.input.candidate.full_root,skills:p.generator.skills});return {...registerFullInstructionCandidate(p.generator,job.input.candidate),full_context_comparison:context};}
  if(job.kind==='select'){
    const fairness=compareFullInstructionContext({baselineRoot:p.native.baselineFullRoot,candidateRoot:job.input.candidate.full_root,skills:p.generator.skills});
    const feedback=projectInstructionLoopObservation(job.input.observation);
    const selected=selectInstructionLoopCases({...p.selection,catalog:job.input.catalog,
      changedTags:[...new Set([...(p.selection.changedTags??[]),...feedback.tags])]});
    const fixedCriteria=checked(p.report.criteria);
    for(const id of selected.case_ids)assert.ok(fixedCriteria.some(f=>f.fixture_id===id&&Array.isArray(f.requirements)&&f.requirements.length>0),'selected case lacks its fixed reporting criteria');
    const template=checked({path:p.native.templateConfig,digest:p.native.templateConfigDigest});
    const publicBinding=p.native.publicInputBindings?bindNativePublicInputs({input:checked(p.native.publicInputBindings),catalog:job.input.catalog,selectedCaseIds:selected.case_ids,template}):null;
    for(const id of selected.case_ids){const c=job.input.catalog.find(c=>c.id===id),r=template.rows.find(r=>r.fixture_id===id);assert.ok(r);assert.equal(publicBinding?.bindings.find(b=>b.case_id===id)?.delivered_public_input_digest??c.public_input_digest,canonicalDigest(r.public_inventory),'selected public input differs from approved catalog');}
    const request=join(p.stateRoot,'native-preparation-request.json');
    save(request,{profile:p.native,selection:selected,...(publicBinding?{delivery_sources:publicBinding.delivery_sources}:{}),candidate:job.input.candidate,policy:p.policy});
    const result=spawnSync(p.native.python,['-B',join(import.meta.dirname,'instruction-loop-native-prepare.py'),request],{encoding:'utf8',maxBuffer:4*1024*1024});
    if(result.status!==0){
      const diagnostic=value=>{const b=Buffer.from(String(value??''));return {text:b.subarray(0,128*1024).toString('utf8'),total_bytes:b.length,truncated:b.length>128*1024};};
      save(join(p.stateRoot,'native-preparation-failure.json'),{kind:'native_preparation_failure_v1',job_digest:canonicalDigest(job),exit_code:result.status,signal:result.signal??null,error:result.error?String(result.error.message).slice(0,1024):null,stdout:diagnostic(result.stdout),stderr:diagnostic(result.stderr),models_started:0});
    }
    assert.equal(result.status,0,'existing-native preparation failed; inspect native-preparation-failure.json and allocated inputs, do not retry');
    const preparation=JSON.parse(result.stdout);
    const retained=prepareRetainedInstructionComparison({storeRoot:p.storeRoot,configPath:preparation.config_path,preparationManifestDigest:preparation.manifest_digest,trustedAssetAuthorityContexts:p.generator.trustedAuthorityContexts??[],
      environments:{baseline:p.baselineEnvironmentObjectDigest,challenger:job.input.candidate.environment_object_digest}});
    const value={...selected,...(publicBinding?{public_input_bindings:publicBinding.bindings,public_input_bindings_digest:canonicalDigest(publicBinding.bindings)}:{}),full_context_comparison:fairness,quality_plan:{criteria:p.report.criteria,
      policy:'Read fixed reference judgments; missing judgments remain unknown. No automatic new model judge is implied.',available_judgments:p.report.assessments?.length??0},
      execution_binding:{...preparation,plan_object_digest:retained.object_digest,model:retained.plan.model,effort:retained.plan.effort,runner:retained.plan.runner,
      model_autonomy:'existing wrapper unchanged except path rebasing; child/history choices remain model decisions'}};
    save(preparedPath(p),value);return value;
  }
  if(job.kind==='trial'){
    assert.equal(job.input.evaluation_decision.disposition,'approved');
    if(p.native.executionKind==='real_codex')assert.equal(modelCallsAuthorized,true,'new implementation model trial not authorized');
    assert.equal(canonicalDigest(job.input.selection),canonicalDigest(readInstructionLoopJson(preparedPath(p))),'approved native selection drift');
    const config=readJsonFileStrict(join(p.native.root,'config.json'),'prepared native configuration',16*1024*1024),row=config.rows.find(r=>r.trial_id===job.input.row.id);assert.ok(row);
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
    const scored=await runInstructionReferenceScoring(p,job,{modelCallsAuthorized,inspectOnly,coordinatorRoot});
    if(scored===null)return {report_pending:true};
    const report=buildInstructionLoopReferenceReport({...p.report,...(p.report.fixedScoring?{fixedScoring:{...p.report.fixedScoring,assessments:scored.assessments}}:{}),dynamicAssessments:scored.referenceAssessments??[],storeRoot:p.storeRoot,planObjectDigest:job.input.selection.execution_binding.plan_object_digest,
      trustedAssetAuthorityContexts:p.generator.trustedAuthorityContexts??[],executionKind:p.native.executionKind});
    report.fixed_scoring_execution=scored.execution;
    if(scored.execution?.output_issue||scored.execution?.reference_output_issue||scored.execution?.status==='failed')report.limits=[...(report.limits??[]),'Fixed reference grading has no usable optional judgments; retained trial evidence remains available and missing source quality stays Unknown.'];
    report.worker_incidents=job.input.trials.filter(t=>t.transport_interruption).map(t=>({trial_id:t.trial_id,transport_interruption:t.transport_interruption,
      root_result:t.state,recovered_from_native_records:t.recovered_from_native_records}));
    report.measured_context=`Full frozen native snapshot; declared supporting context is retained. Normal owner uses the existing source-backed installer projection. Candidate source ${job.input.candidate.source_revision}; no performance claim for a different projection.`;
    return report;
  }
  if(job.kind==='cleanup'&&job.input.disposition==='unchanged'){
    const c=job.input.candidate;assert.equal(c.no_change,true);assert.deepEqual(c.candidate_assets,[]);assert.deepEqual(c.baseline_assets,[]);
    assert.equal(canonicalDigest(c.environment_assets),canonicalDigest(p.generator.parentAssets),'unchanged selected refs drift');
    const owned=verifyOwnedFullCandidate(p,c);
    if(p.normal.target!==null&&p.normal.kind!=='ask_source_repository_v1'){const state=await import(pathToFileURL(join(owned.path,'scripts/ask-setup-apply-state.mjs')).href);assert.ok(state.managedSetupIdentities(p.normal.target).every(i=>i.source_revision!==owned.source_revision),'candidate is still installed on the scoped owner');}
    const value=cleanOwnedInstructionLoopStaging(p.generator.stagingRoot,'unchanged');rmSync(owned.path,{recursive:true});rmSync(p.generator.fullRoot,{recursive:true});
    return {...value,owned_version_materialization_removed:true,owned_full_snapshot_removed:true,version_archive_preserved:owned.archive,owner_operation_performed:false};
  }
  if(['plan','apply','restore','cleanup'].includes(job.kind)){
    assert.notEqual(p.normal.target,null,'normal owner target required for owner operations');
    if(p.normal.kind==='ask_source_repository_v1'){
      assert.equal(p.kind,'full_practical_instruction_loop_profile_v1','source application requires the Full practical runtime');
      if(job.kind==='plan')return planSourceApplication(p,job);
      if(['apply','restore'].includes(job.kind))return prepareSourceApplication(p,job,{root:coordinatorRoot??root});
      if(job.input.disposition==='rejected'){
        const retirement=job.input.retirement;assert.ok(retirement,'candidate retirement must precede disposal');
        const assets=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:retirement.snapshot_digest,trustedAuthorityContexts:retirement.trusted_authority_contexts}).assets;
        assert.ok(job.input.candidate.candidate_assets.every(a=>assets.some(e=>e.record_digest===a.record_digest&&e.state==='retired')),'candidate is still active');
        const requests=join(p.stateRoot,'source-applications');assert.ok(!existsSync(requests)||readdirSync(requests).length===0,'publication preparation exists; inspect it before disposal');
        const owned=verifyOwnedFullCandidate(p,job.input.candidate),value=cleanOwnedInstructionLoopStaging(p.generator.stagingRoot,job.input.disposition);rmSync(owned.path,{recursive:true});rmSync(p.generator.fullRoot,{recursive:true});
        return {...value,owned_version_materialization_removed:true,owned_full_snapshot_removed:true,version_archive_preserved:owned.archive};
      }
      verifyRetainedSourceApplication(p,null,{root:coordinatorRoot??root,job});
      return {...cleanOwnedInstructionLoopStaging(p.generator.stagingRoot,job.input.disposition),publication_and_source_history_retained:true};
    }
    if(job.kind==='cleanup'&&job.input.disposition==='rejected')bindMeasuredNormalOwnerSource({sourceRoot:p.generator.candidateRoot,candidate:job.input.candidate});
    const value=await runNormalOwnerLoopOperation({sourceRoot:p.generator.candidateRoot,baselineSourceRoot:p.generator.baselineSourceRoot,target:p.normal.target,stagingRoot:p.generator.stagingRoot,job});
    if(job.kind==='cleanup'&&job.input.disposition==='rejected'){
      const retirement=job.input.retirement;assert.ok(retirement,'candidate retirement must precede disposal');
      const assets=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:retirement.snapshot_digest,trustedAuthorityContexts:retirement.trusted_authority_contexts}).assets;
      assert.ok(job.input.candidate.candidate_assets.every(a=>assets.some(e=>e.record_digest===a.record_digest&&e.state==='retired')),'candidate is still active');
      const owned=verifyOwnedFullCandidate(p,job.input.candidate);
      const state=await import(pathToFileURL(join(owned.path,'scripts/ask-setup-apply-state.mjs')).href);
      assert.ok(state.managedSetupIdentities(p.normal.target).every(i=>i.source_revision!==owned.source_revision),'candidate is still installed on the scoped owner');
      rmSync(owned.path,{recursive:true});
      rmSync(p.generator.fullRoot,{recursive:true});
      return {...value,owned_version_materialization_removed:true,owned_full_snapshot_removed:true,version_archive_preserved:owned.archive};
    }
    return value;
  }
  assert.equal(job.kind,'version');const previous=job.input.previous_version??job.input.candidate.registry;
  if(p.normal.kind==='ask_source_repository_v1'&&job.input.action==='activate'){
    assert.equal(job.input.application?.kind,'ask_source_application_v1');assert.equal(job.input.application.status,'merged','unmerged publication cannot activate a source version');assert.equal(job.input.application.local_git_content_verified,true);
    verifyRetainedSourceApplication(p,job.input.application,{root:coordinatorRoot??root,job});
  }
  return transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:previous.snapshot_digest,trustedAuthorityContexts:previous.trusted_authority_contexts,
    candidateAssets:job.input.candidate.candidate_assets,baselineAssets:job.input.candidate.baseline_assets??p.generator.parentAssets,action:job.input.action,authority:p.assetAuthority,baselineSnapshotDigest:job.input.action==='restore'?job.input.candidate.registry.snapshot_digest:null});
}
export async function nativeInstructionLoopWorker({profile,job,resultPath,action='execute',modelCallsAuthorized=false}){
  sourceInputs(profile);mkdirSync(profile.stateRoot,{recursive:true,mode:0o700});
  let coordinatorRoot=null;if(profile.report?.scoringProvider&&job.kind==='report'){assert.equal(resultPath,join(dirname(resultPath),'result.json'));assert.equal(dirname(resultPath).split('/').at(-1),canonicalDigest(job).slice(7));coordinatorRoot=dirname(dirname(dirname(resultPath)));}
  const sidecar=join(profile.stateRoot,'stage-'+canonicalDigest(job).slice(7)+'.json');
  if(existsSync(sidecar)){const result=readInstructionLoopJson(sidecar);assert.equal(result.request_digest,canonicalDigest(job));publication(resultPath,result);return;}
  if(action==='inspect'){
    if(job.kind==='report'&&(profile.report.referenceScoringCommand||profile.report.scoringProvider)){
      let out;try{out=await executeNativeInstructionLoopStage(profile,job,{inspectOnly:true,coordinatorRoot});}
      catch(error){if(error.code==='REFERENCE_SCORING_PENDING')return;throw error;}
      if(!out.report_pending){const result={request_digest:canonicalDigest(job),status:'completed',output:out};publication(sidecar,result);publication(resultPath,result);}
    }
    if(job.kind==='trial'){const out=await readTrial(profile,job,true);if(out){const result={request_digest:canonicalDigest(job),status:out.state==='completed'?'completed':'failed',output:out};publication(sidecar,result);publication(resultPath,result);}}
    return; // Other unknown partial operations remain uncertain; no replay.
  }
  assert.equal(action,'execute');
  try{
    const output=await executeNativeInstructionLoopStage(profile,job,{modelCallsAuthorized,coordinatorRoot});
    if(output.worker_exit_without_result){process.exitCode=83;return;}
    const result={request_digest:canonicalDigest(job),status:output.state==='failed_or_interrupted'?'failed':'completed',output};
    publication(sidecar,result);publication(resultPath,result);
  }catch(error){if(job.kind==='report'&&error.code==='REFERENCE_SCORING_PENDING'){
      // Exit normally without a terminal result; later positive grade receipts
      // must not be downgraded by a failed outer transport or re-dispatched.
      const path=join(profile.stateRoot,'stage-'+canonicalDigest(job).slice(7)+'-grading-pending.json');
      if(!existsSync(path))publication(path,{request_digest:canonicalDigest(job),status:'pending_reference_scoring',reason:String(error.message).slice(0,512)});return;
    }
    const result={request_digest:canonicalDigest(job),status:'failed',output:{reason:String(error.message).slice(0,2048)}};publication(sidecar,result);publication(resultPath,result);process.exitCode=1;}
}

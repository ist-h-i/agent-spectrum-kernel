#!/usr/bin/env node
import {readHostReferenceScoringRequest,claimHostReferenceScoring,completeHostReferenceScoring} from './instruction-loop-host-scoring.mjs';
import {instructionReferenceScoringJob,instructionReferenceScoringCommand} from './instruction-loop-reference-scoring-runtime.mjs';
import {readInstructionLoopJson} from './instruction-loop-artifact.mjs';
// Operator entry point. A config is trusted local executable configuration, not
// an imported candidate artifact. Human flags must be supplied by the host.
import assert from 'node:assert/strict';
import { resolve,join } from 'node:path';
import { canonicalDigest, readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import {createConfiguredInstructionLoopRuntime} from './instruction-loop-runtime.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {advanceInstructionLoopOperation,inspectInstructionLoopOperation} from './instruction-loop-operation.mjs';
import {prepareNextComponentInstructionLoopConfiguration} from './instruction-loop-component-continuation.mjs';
import { prepareNextNativeInstructionLoopConfiguration,createNativeInstructionLoopConfiguration,inspectInstructionLoopReadiness } from './instruction-loop-native-configuration.mjs';
import {prepareFailedInstructionLoopConfiguration,prepareRetainedFullAuthoringConfiguration,prepareFullAuthoringInitializationRetry} from './instruction-loop-failed-preparation.mjs';
import { advanceSupervisedInstructionLoop, inspectSupervisedInstructionLoop, prepareNextSupervisedInstructionLoop } from './supervised-instruction-loop.mjs';
const args=process.argv.slice(2),command=args.shift(),options={};
try{
  while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(options[key],undefined,'duplicate argument');
    options[key]=['--allow-model-calls','--request-restore'].includes(key)?true:args.shift();}
  assert.ok(options['--root']||command==='readiness');const root=options['--root']?resolve(options['--root']):null;
  if(command==='readiness'){
    assert.deepEqual(Object.keys(options),['--profile']);assert.ok(options['--profile'],'--profile required');
    console.log(JSON.stringify(inspectInstructionLoopReadiness(resolve(options['--profile'])),null,2));
  }
  else if(['scoring-request','scoring-claim','scoring-complete'].includes(command)){
    const allowed=['--root','--profile','--config',...(command==='scoring-claim'?['--claim','--allow-model-calls']:command==='scoring-complete'?['--submission']:[])];
    assert.ok(Object.keys(options).every(k=>allowed.includes(k)));assert.ok(options['--profile']&&options['--config']);
    const p=readInstructionLoopJson(resolve(options['--profile'])),config=readInstructionLoopJson(resolve(options['--config']));
    assert.equal(p.kind,'full_native_reference_loop_profile_v1','host scoring is native-only');assert.equal(p.report.scoringProvider?.kind,'external_host','not a shipped host scoring profile');
    assert.equal(canonicalDigest(config),canonicalDigest(createNativeInstructionLoopConfiguration(resolve(options['--profile']))),'host scoring configuration drift');
    assertNoSymlinkPathSegments(root,'host scoring coordinator');
    const unlock=lockRunJournal(root);
    try{const {state}=readRunJournal(root);assert.equal(canonicalDigest(state.policy),canonicalDigest(config.policy));assert.equal(state.pending?.kind,'report','no exact pending scoring report');
      const job=instructionReferenceScoringJob(p,state.pending),directory=join(p.stateRoot,'reference-scoring/jobs',canonicalDigest(job).slice(7)),request=readHostReferenceScoringRequest(directory);
      assert.equal(request.grade_job_digest,canonicalDigest(job),'host scoring job transplant');
      const commandDefinition=instructionReferenceScoringCommand(p,{parent:{root,report_job_digest:canonicalDigest(state.pending)}}),settings=JSON.parse(commandDefinition.argv[3]);
      assert.equal(canonicalDigest(request.handoff),canonicalDigest({kind:'host_reference_scoring_handoff_v1',job_digest:canonicalDigest(job),settings:{inline:settings},evidence_kind:settings.evidence_kind,model_calls_authorized:commandDefinition.model_calls}),'host scoring authority differs from configured pending runtime');
      const old=state.reference_scoring_progress;
      if(old){assert.equal(old.job_digest,canonicalDigest(job));assert.equal(old.handoff_digest,request.handoff_digest);
        if(old.claim_digest){assert.ok(request.existing_claim,'checkpointed scoring claim missing');assert.equal(old.claim_digest,canonicalDigest(request.existing_claim));}
        if(old.completion_digest)assert.equal(old.completion_digest,request.completion_digest,'checkpointed scoring completion missing or changed');}
      let result=request;
      if(command==='scoring-claim'){assert.ok(options['--claim']);const value=readInstructionLoopJson(resolve(options['--claim']));
        result=claimHostReferenceScoring(directory,value,{modelCallsAuthorized:options['--allow-model-calls']===true});
        state.reference_scoring_progress={...old,job_digest:canonicalDigest(job),handoff_digest:request.handoff_digest,claim_digest:result.claim_digest};appendRunJournal(root,'reference_scoring_claimed',state);
      }else if(command==='scoring-complete'){assert.ok(options['--submission']);const value=readInstructionLoopJson(resolve(options['--submission']));result=completeHostReferenceScoring(directory,value);
        state.reference_scoring_progress={...old,job_digest:canonicalDigest(job),handoff_digest:request.handoff_digest,claim_digest:value.claim_digest,completion_digest:result.completion_digest};appendRunJournal(root,'reference_scoring_completed',state);
      }
      console.log(JSON.stringify(result,null,2));
    }finally{unlock();}
  }
  else if(['authoring-request','authoring-claim','authoring-complete'].includes(command)){
    const allowed=['--root','--config',...(command==='authoring-claim'?['--claim','--allow-model-calls']:command==='authoring-complete'?['--submission']:[])];
    assert.ok(Object.keys(options).every(k=>allowed.includes(k)));assert.ok(options['--config']);
    const config=readInstructionLoopJson(resolve(options['--config']));assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    const runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:options['--allow-model-calls']===true});
    runtime.validateCoordinatorRoot(root);
    assertNoSymlinkPathSegments(root,'host authoring coordinator');
    const unlock=lockRunJournal(root);
    try{
      const {state}=readRunJournal(root);assert.ok(state,'loop not initialized');assert.equal(canonicalDigest(state.policy),canonicalDigest(config.policy),'host command configuration mismatch');
      assert.equal(state.pending?.kind,'generate','no active authoring generation');
      assert.equal(typeof runtime.authoringRequest,'function','runtime has no external authoring port');
      let result;
      if(command==='authoring-request')result=runtime.authoringRequest(state.pending,{root});
      else if(command==='authoring-claim'){
        assert.ok(options['--claim']);result=runtime.authoringClaim(state.pending,readInstructionLoopJson(resolve(options['--claim'])),{root});
        state.authoring_progress.claim_digest=result.claim_digest;state.authoring_progress.completion_state='claimed_completion_unknown';
        appendRunJournal(root,'host_authoring_claimed',state,{result});
      }else{
        assert.ok(options['--submission']);result=runtime.authoringComplete(state.pending,readInstructionLoopJson(resolve(options['--submission'])),{root});
        state.authoring_progress.completion_digest=result.completion_digest;
        appendRunJournal(root,'host_authoring_completion',state,{result});
      }
      console.log(JSON.stringify(result,null,2));
    }finally{unlock();}
  }
  else if(command==='configure'){
    assert.deepEqual(Object.keys(options).sort(),['--profile','--root']);
    const config=createNativeInstructionLoopConfiguration(resolve(options['--profile'])),path=resolve(root,'config.json');
    writeCanonicalJsonNoReplace({outputPath:path,artifact:config,label:'supervised runtime configuration',maximumBytes:16*1024*1024});
    console.log(JSON.stringify({status:'configured',config_path:path,policy_digest:canonicalDigest(config.policy),models_started:false,owner_mutated:false},null,2));
  }
  else if(command==='operation-status'){
    assert.deepEqual(Object.keys(options),['--root']);const s=inspectInstructionLoopOperation(root);
    console.log(JSON.stringify({...s,pending_packet_digest:s.pending_gate?canonicalDigest(s.pending_gate):null},null,2));
  }
  else if(command==='operate'){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--cycles','--allow-model-calls','--request-restore','--decision','--packet','--reason','--assessment','--feedback','--report-revision'].includes(k)));
    assert.ok(options['--profile']&&options['--config']);
    const decision=options['--decision']?{disposition:options['--decision'],packet_digest:options['--packet'],reason:options['--reason']}:null;
    assert.ok(decision||(!options['--packet']&&!options['--reason']));
    const result=await advanceInstructionLoopOperation({root,profilePath:options['--profile'],configPath:options['--config'],maxCycles:Number(options['--cycles']),
      modelCallsAuthorized:options['--allow-model-calls']===true,decision,requestRestore:options['--request-restore']===true,
      assessment:options['--assessment']?readJsonFileStrict(resolve(options['--assessment'])):null,
      reportRevision:options['--report-revision']?readInstructionLoopJson(resolve(options['--report-revision'])):null,
      feedback:options['--feedback']?readJsonFileStrict(resolve(options['--feedback'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
  else if(command==='status'){
    assert.deepEqual(Object.keys(options),['--root']);const s=inspectSupervisedInstructionLoop(root);
    console.log(JSON.stringify({...s,pending_packet_digest:s.pending_gate?canonicalDigest(s.pending_gate):null},null,2));
  }
  else if(command==='next-policy'){
    assert.ok(Object.keys(options).every(k=>['--config','--root','--report-revision'].includes(k)));assert.ok(options['--config']);
    const config=readInstructionLoopJson(resolve(options['--config']));
    assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    console.log(JSON.stringify(prepareNextSupervisedInstructionLoop({root,nextPolicy:config.policy,reportRevision:options['--report-revision']?readInstructionLoopJson(resolve(options['--report-revision'])):null}),null,2));
  }
  else if(['recover-authoring','reconfigure-evaluation'].includes(command)){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--replacement-profile','--output-root','--id'].includes(k)));
    assert.ok(options['--profile']&&options['--config']&&options['--output-root']&&options['--id']);
    console.log(JSON.stringify(prepareRetainedFullAuthoringConfiguration({root,profilePath:resolve(options['--profile']),configPath:resolve(options['--config']),replacementProfilePath:options['--replacement-profile']?resolve(options['--replacement-profile']):resolve(options['--profile']),outputRoot:resolve(options['--output-root']),id:options['--id'],preEvaluation:command==='reconfigure-evaluation'}),null,2));
  }
  else if(command==='recover-authoring-initialization'){
    assert.ok(Object.keys(options).every(k=>['--root','--output-root','--id','--reason'].includes(k)));
    assert.ok(options['--output-root']&&options['--id']&&options['--reason']);
    console.log(JSON.stringify(prepareFullAuthoringInitializationRetry({operationRoot:root,outputRoot:resolve(options['--output-root']),id:options['--id'],reason:options['--reason']}),null,2));
  }
  else if(command==='recover-preparation'){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--replacement-profile','--output-root','--id'].includes(k)));
    assert.ok(options['--profile']&&options['--config']&&options['--output-root']&&options['--id']);
    console.log(JSON.stringify(prepareFailedInstructionLoopConfiguration({root,profilePath:options['--profile'],configPath:options['--config'],
      replacementProfilePath:options['--replacement-profile']??options['--profile'],outputRoot:options['--output-root'],id:options['--id']}),null,2));
  }
  else if(command==='next'){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--output-root','--id','--feedback','--report-revision'].includes(k)));
    assert.ok(options['--profile']&&options['--config']&&options['--output-root']&&options['--id']);
    const profile=readInstructionLoopJson(resolve(options['--profile']));
    const prepare=profile.kind==='component_practical_instruction_loop_profile_v1'?prepareNextComponentInstructionLoopConfiguration:prepareNextNativeInstructionLoopConfiguration;
    console.log(JSON.stringify(prepare({root,profilePath:resolve(options['--profile']),
      configPath:resolve(options['--config']),
      outputRoot:resolve(options['--output-root']),id:options['--id'],
      feedback:options['--feedback']?readJsonFileStrict(resolve(options['--feedback'])):null,
      reportRevision:options['--report-revision']?readInstructionLoopJson(resolve(options['--report-revision'])):null}),null,2));
  }
  else{
    assert.equal(command,'advance');assert.ok(options['--config']);
    assert.ok(Object.keys(options).every(k=>['--root','--config','--allow-model-calls','--request-restore','--decision','--packet','--reason','--import','--assessment','--report-revision'].includes(k)));
    const config=readInstructionLoopJson(resolve(options['--config']));
    assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    const runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:options['--allow-model-calls']===true});
    const decision=options['--decision']?{disposition:options['--decision'],packet_digest:options['--packet'],reason:options['--reason']}:null;
    assert.ok(decision||(!options['--packet']&&!options['--reason']));
    const result=await advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,decision,
      requestRestore:options['--request-restore']===true,
      assessment:options['--assessment']?readJsonFileStrict(resolve(options['--assessment'])):null,
      reportRevision:options['--report-revision']?readInstructionLoopJson(resolve(options['--report-revision'])):null,
      completedImport:options['--import']?readInstructionLoopJson(resolve(options['--import'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}

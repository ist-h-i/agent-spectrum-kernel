#!/usr/bin/env node
// Operator entry point. A config is trusted local executable configuration, not
// an imported candidate artifact. Human flags must be supplied by the host.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import {createConfiguredInstructionLoopRuntime} from './instruction-loop-runtime.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {advanceInstructionLoopOperation,inspectInstructionLoopOperation} from './instruction-loop-operation.mjs';
import {prepareNextComponentInstructionLoopConfiguration} from './instruction-loop-component-continuation.mjs';
import { prepareNextNativeInstructionLoopConfiguration,createNativeInstructionLoopConfiguration,inspectInstructionLoopReadiness } from './instruction-loop-native-configuration.mjs';
import {prepareFailedInstructionLoopConfiguration} from './instruction-loop-failed-preparation.mjs';
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
  else if(['authoring-request','authoring-claim','authoring-complete'].includes(command)){
    const allowed=['--root','--config',...(command==='authoring-claim'?['--claim','--allow-model-calls']:command==='authoring-complete'?['--submission']:[])];
    assert.ok(Object.keys(options).every(k=>allowed.includes(k)));assert.ok(options['--config']);
    const config=readJsonFileStrict(resolve(options['--config']));assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
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
        assert.ok(options['--claim']);result=runtime.authoringClaim(state.pending,readJsonFileStrict(resolve(options['--claim'])),{root});
        state.authoring_progress.claim_digest=result.claim_digest;state.authoring_progress.completion_state='claimed_completion_unknown';
        appendRunJournal(root,'host_authoring_claimed',state,{result});
      }else{
        assert.ok(options['--submission']);result=runtime.authoringComplete(state.pending,readJsonFileStrict(resolve(options['--submission'])),{root});
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
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--cycles','--allow-model-calls','--request-restore','--decision','--packet','--reason','--assessment','--feedback'].includes(k)));
    assert.ok(options['--profile']&&options['--config']);
    const decision=options['--decision']?{disposition:options['--decision'],packet_digest:options['--packet'],reason:options['--reason']}:null;
    assert.ok(decision||(!options['--packet']&&!options['--reason']));
    const result=await advanceInstructionLoopOperation({root,profilePath:options['--profile'],configPath:options['--config'],maxCycles:Number(options['--cycles']),
      modelCallsAuthorized:options['--allow-model-calls']===true,decision,requestRestore:options['--request-restore']===true,
      assessment:options['--assessment']?readJsonFileStrict(resolve(options['--assessment'])):null,
      feedback:options['--feedback']?readJsonFileStrict(resolve(options['--feedback'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
  else if(command==='status'){
    assert.deepEqual(Object.keys(options),['--root']);const s=inspectSupervisedInstructionLoop(root);
    console.log(JSON.stringify({...s,pending_packet_digest:s.pending_gate?canonicalDigest(s.pending_gate):null},null,2));
  }
  else if(command==='next-policy'){
    assert.deepEqual(Object.keys(options).sort(),['--config','--root']);
    const config=readJsonFileStrict(resolve(options['--config']));
    assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    console.log(JSON.stringify(prepareNextSupervisedInstructionLoop({root,nextPolicy:config.policy}),null,2));
  }
  else if(command==='recover-preparation'){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--replacement-profile','--output-root','--id'].includes(k)));
    assert.ok(options['--profile']&&options['--config']&&options['--output-root']&&options['--id']);
    console.log(JSON.stringify(prepareFailedInstructionLoopConfiguration({root,profilePath:options['--profile'],configPath:options['--config'],
      replacementProfilePath:options['--replacement-profile']??options['--profile'],outputRoot:options['--output-root'],id:options['--id']}),null,2));
  }
  else if(command==='next'){
    assert.ok(Object.keys(options).every(k=>['--root','--profile','--config','--output-root','--id','--feedback'].includes(k)));
    assert.ok(options['--profile']&&options['--config']&&options['--output-root']&&options['--id']);
    const profile=readJsonFileStrict(resolve(options['--profile']));
    const prepare=profile.kind==='component_practical_instruction_loop_profile_v1'?prepareNextComponentInstructionLoopConfiguration:prepareNextNativeInstructionLoopConfiguration;
    console.log(JSON.stringify(prepare({root,profilePath:resolve(options['--profile']),
      configPath:resolve(options['--config']),
      outputRoot:resolve(options['--output-root']),id:options['--id'],
      feedback:options['--feedback']?readJsonFileStrict(resolve(options['--feedback'])):null}),null,2));
  }
  else{
    assert.equal(command,'advance');assert.ok(options['--config']);
    assert.ok(Object.keys(options).every(k=>['--root','--config','--allow-model-calls','--request-restore','--decision','--packet','--reason','--import','--assessment'].includes(k)));
    const config=readJsonFileStrict(resolve(options['--config']));
    assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    const runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:options['--allow-model-calls']===true});
    const decision=options['--decision']?{disposition:options['--decision'],packet_digest:options['--packet'],reason:options['--reason']}:null;
    assert.ok(decision||(!options['--packet']&&!options['--reason']));
    const result=await advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,decision,
      requestRestore:options['--request-restore']===true,
      assessment:options['--assessment']?readJsonFileStrict(resolve(options['--assessment'])):null,
      completedImport:options['--import']?readJsonFileStrict(resolve(options['--import'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}

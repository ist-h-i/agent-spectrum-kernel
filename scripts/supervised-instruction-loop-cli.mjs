#!/usr/bin/env node
// Operator entry point. A config is trusted local executable configuration, not
// an imported candidate artifact. Human flags must be supplied by the host.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict,writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
import {createConfiguredInstructionLoopRuntime} from './instruction-loop-runtime.mjs';
import {advanceInstructionLoopOperation,inspectInstructionLoopOperation} from './instruction-loop-operation.mjs';
import {prepareNextComponentInstructionLoopConfiguration} from './instruction-loop-component-continuation.mjs';
import { prepareNextNativeInstructionLoopConfiguration,createNativeInstructionLoopConfiguration } from './instruction-loop-native-configuration.mjs';
import { advanceSupervisedInstructionLoop, inspectSupervisedInstructionLoop, prepareNextSupervisedInstructionLoop } from './supervised-instruction-loop.mjs';
const args=process.argv.slice(2),command=args.shift(),options={};
try{
  while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(options[key],undefined,'duplicate argument');
    options[key]=['--allow-model-calls','--request-restore'].includes(key)?true:args.shift();}
  assert.ok(options['--root']);const root=resolve(options['--root']);
  if(command==='configure'){
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

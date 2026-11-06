#!/usr/bin/env node
// Operator entry point. A config is trusted local executable configuration, not
// an imported candidate artifact. Human flags must be supplied by the host.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict } from './content-addressed-store.mjs';
import { createInstructionLoopCommandRuntime } from './instruction-loop-command-runtime.mjs';
import { advanceSupervisedInstructionLoop, inspectSupervisedInstructionLoop } from './supervised-instruction-loop.mjs';
const args=process.argv.slice(2),command=args.shift(),options={};
try{
  while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(options[key],undefined,'duplicate argument');
    options[key]=['--allow-model-calls','--request-restore'].includes(key)?true:args.shift();}
  assert.ok(options['--root']);const root=resolve(options['--root']);
  if(command==='status'){
    assert.deepEqual(Object.keys(options),['--root']);const s=inspectSupervisedInstructionLoop(root);
    console.log(JSON.stringify({...s,pending_packet_digest:s.pending_gate?canonicalDigest(s.pending_gate):null},null,2));
  }
  else{
    assert.equal(command,'advance');assert.ok(options['--config']);
    assert.ok(Object.keys(options).every(k=>['--root','--config','--allow-model-calls','--request-restore','--decision','--packet','--reason','--import'].includes(k)));
    const config=readJsonFileStrict(resolve(options['--config']));
    assert.equal(config.policy.runtime_digest,canonicalDigest(config.runtime));
    const runtime=createInstructionLoopCommandRuntime({definition:config.runtime,modelCallsAuthorized:options['--allow-model-calls']===true});
    const decision=options['--decision']?{disposition:options['--decision'],packet_digest:options['--packet'],reason:options['--reason']}:null;
    assert.ok(decision||(!options['--packet']&&!options['--reason']));
    const result=await advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,decision,
      requestRestore:options['--request-restore']===true,
      completedImport:options['--import']?readJsonFileStrict(resolve(options['--import'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}

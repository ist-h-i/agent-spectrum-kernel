#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readJsonFileStrict,canonicalDigest } from './content-addressed-store.mjs';
import { createPracticalEvaluationCommandRuntime } from './instruction-loop-command-runtime.mjs';
import { advancePracticalEvaluation,inspectPracticalEvaluation } from './practical-evaluation-runner.mjs';
const args=process.argv.slice(2),command=args.shift(),o={};
try{
  while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(o[key],undefined);o[key]=key==='--allow-model-calls'?true:args.shift();}
  assert.ok(o['--root']);const root=resolve(o['--root']);
  if(command==='status'){assert.deepEqual(Object.keys(o),['--root']);console.log(JSON.stringify(inspectPracticalEvaluation(root),null,2));}
  else{
    assert.equal(command,'advance');assert.ok(o['--config']);
    assert.ok(Object.keys(o).every(k=>['--root','--config','--decision','--packet','--reason','--assessment','--allow-model-calls'].includes(k)));
    const config=readJsonFileStrict(resolve(o['--config'])),runtime=createPracticalEvaluationCommandRuntime({definition:config.runtime,modelCallsAuthorized:o['--allow-model-calls']===true});
    const result=await advancePracticalEvaluation({root,plan:config.plan,runtime,
      decision:o['--decision']?{disposition:o['--decision'],packet_digest:o['--packet'],reason:o['--reason']}:null,
      assessment:o['--assessment']?readJsonFileStrict(resolve(o['--assessment'])):null});
    console.log(JSON.stringify({...result,pending_packet_digest:result.pending_gate?canonicalDigest(result.pending_gate):null},null,2));
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}

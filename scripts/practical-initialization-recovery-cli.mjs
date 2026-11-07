#!/usr/bin/env node
// Explicit host recovery; execution inputs and the original case grant stay fixed.
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {readJsonFileStrict,writeCanonicalJsonNoReplace,canonicalDigest,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {readRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {preparePracticalInitializationClearance,validatePracticalInitializationClearance,inspectInitializationRecoveryOperation} from './practical-initialization-clearance.mjs';
import {advancePracticalEvaluation} from './practical-evaluation-runner.mjs';
import {createPracticalEvaluationCommandRuntime} from './instruction-loop-command-runtime.mjs';
const read=p=>readJsonFileStrict(resolve(p),'initialization recovery CLI',16*1024*1024);
try{
 const args=process.argv.slice(2),command=args.shift(),o={};while(args.length){const key=args.shift();assert.match(key,/^--[a-z-]+$/u);assert.equal(o[key],undefined);o[key]=key==='--allow-model-calls'?true:args.shift();assert.notEqual(o[key],undefined);}
 assert.ok(['prepare','admit','advance'].includes(command));assert.ok(o['--operation']);
 const allowed={prepare:['--operation','--reason','--output'],admit:['--operation','--clearance'],advance:['--operation','--assessment','--allow-model-calls']};assert.ok(Object.keys(o).every(k=>allowed[command].includes(k)));
 const operationRoot=resolve(o['--operation']);assertNoSymlinkPathSegments(operationRoot,'recovery operation');
 inspectInitializationRecoveryOperation(operationRoot); // Validate every path before creating even a temporary lock.
 let opUnlock=lockRunJournal(operationRoot),cycleUnlock;
 try{
  const locked=inspectInitializationRecoveryOperation(operationRoot),op=locked.o,cycleRoot=locked.cycleRoot;
  cycleUnlock=lockRunJournal(cycleRoot);const cycle=readRunJournal(cycleRoot).state;assert.equal(cycle.pending?.kind,'evaluate');assert.equal(cycle.evaluation_decision?.disposition,'approved');
  const selection=cycle.outputs.select,root=selection.practical_root,s=readRunJournal(root).state;
  assert.equal(canonicalDigest(selection.practical_plan),canonicalDigest(s.plan));
  if(command==='prepare'){
   assert.ok(o['--reason']&&o['--output']);const output=resolve(o['--output']);assertNoSymlinkPathSegments(output,'recovery output',{allowMissingLeaf:true});
   for(const p of [operationRoot,cycleRoot,root])assert.ok(output!==p&&!output.startsWith(p+'/'),'recovery output overlaps original run');
   // Parent locks belong to this command and must not be mistaken for an active
   // original controller; prepare does its own unlocked parent inspection.
   cycleUnlock();cycleUnlock=null;opUnlock();opUnlock=null;
   const clearance=preparePracticalInitializationClearance({operationRoot,reason:o['--reason']});
   writeCanonicalJsonNoReplace({outputPath:output,artifact:clearance,label:'initialization continuation clearance',maximumBytes:16*1024*1024});
   console.log(JSON.stringify({clearance:output,clearance_digest:canonicalDigest(clearance),new_model_calls:0,provider_closure_inferred:false},null,2));
  }else{
   const runtime=createPracticalEvaluationCommandRuntime({definition:selection.practical_runtime,modelCallsAuthorized:o['--allow-model-calls']===true});
   if(command==='admit'){
    assert.ok(o['--clearance']);const c=read(o['--clearance']);assert.equal(c.operation_root,operationRoot);assert.equal(c.cycle_root,cycleRoot);
    validatePracticalInitializationClearance(c,{root,state:s,checkProcesses:true});
    console.log(JSON.stringify(await advancePracticalEvaluation({root,plan:s.plan,runtime,continuationClearance:c}),null,2));
   }else{
    assert.ok(s.continuation_clearances?.length,'no admitted initialization exception');
    console.log(JSON.stringify(await advancePracticalEvaluation({root,plan:s.plan,runtime,assessment:o['--assessment']?read(o['--assessment']):null}),null,2));
   }
  }
 }finally{if(cycleUnlock)cycleUnlock();if(opUnlock)opUnlock();}
}catch(error){console.error(String(error.message));process.exitCode=1;}

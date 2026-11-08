#!/usr/bin/env node
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {inspectInitializationRecoveryOperation} from './practical-initialization-clearance.mjs';
import {prepareIsolatedGradeContinuation,admitIsolatedGradeContinuation,advanceIsolatedGradeContinuation} from './practical-isolated-grade-continuation.mjs';
const read=p=>readJsonFileStrict(resolve(p),'isolated grading continuation CLI',16*1024*1024);
try{
 const args=process.argv.slice(2),action=args.shift(),o={};while(args.length){const k=args.shift();assert.match(k,/^--[a-z-]+$/u);assert.equal(o[k],undefined);o[k]=k==='--allow-model-calls'?true:args.shift();assert.notEqual(o[k],undefined);}
 const keys={prepare:['--operation','--inspector','--reason','--expected-remaining','--output'],admit:['--intent'],advance:['--intent','--allow-model-calls','--assessment']};assert.ok(keys[action]&&Object.keys(o).every(k=>keys[action].includes(k)));
 let result;
 if(action==='prepare'){
  for(const k of keys.prepare)assert.ok(o[k]);const n=Number(o['--expected-remaining']);assert.ok(Number.isSafeInteger(n)&&n>0);
  const original=inspectInitializationRecoveryOperation(resolve(o['--operation'])),output=resolve(o['--output']);assertNoSymlinkPathSegments(output,'continuation reference output',{allowMissingLeaf:true});assert.ok(output.startsWith(original.profile.protectedRoot+'/'));for(const root of [resolve(o['--operation']),original.cycleRoot,original.root])assert.ok(output!==root&&!output.startsWith(root+'/'),'reference output overlaps original coordinator');
  result=await prepareIsolatedGradeContinuation({operationRoot:resolve(o['--operation']),definition:read(o['--inspector']),reason:o['--reason'],expectedRemainingCount:n});
  writeCanonicalJsonNoReplace({outputPath:resolve(o['--output']),artifact:result.reference,label:'isolated grade continuation reference'});
 }else{assert.ok(o['--intent']);const reference=read(o['--intent']);result=action==='admit'?admitIsolatedGradeContinuation({reference}):await advanceIsolatedGradeContinuation({reference,modelCallsAuthorized:o['--allow-model-calls']===true,assessment:o['--assessment']?read(o['--assessment']):null});}
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(String(error.message));process.exitCode=1;}

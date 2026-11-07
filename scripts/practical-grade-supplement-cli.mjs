#!/usr/bin/env node
import assert from 'node:assert/strict';import {resolve} from 'node:path';
import {readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments,parseJsonRejectDuplicateKeys} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {preparePracticalGradeSupplement,prepareOperationPracticalGradeSupplement,runPracticalGradeSupplement,inspectPracticalGradeSupplement,practicalGradeSupplementSelectionPacket,
 recordPracticalGradeSupplementSelection,publishPracticalGradeSupplementReport} from './practical-grade-supplement.mjs';
const read=p=>readJsonFileStrict(resolve(p),'grade supplement CLI',16*1024*1024);
const readReference=r=>{assert.deepEqual(Object.keys(r).sort(),['digest','path']);assert.equal(resolve(r.path),r.path);assertNoSymlinkPathSegments(r.path,'supplement selection ref');const b=readStableFile(r.path,'supplement selection ref',16*1024*1024).bytes;assert.equal(hash(b),r.digest,'supplement selection reference drift');return parseJsonRejectDuplicateKeys(b.toString('utf8'),'supplement selection ref');};
let protectedRecipes=[];
const protectOutput=path=>{if(!path)return;path=resolve(path);assertNoSymlinkPathSegments(path,'supplement CLI output',{allowMissingLeaf:true});for(const recipe of protectedRecipes)for(const root of [recipe.run_root,recipe.contract.parent.operation_root,recipe.contract.parent.cycle_root])assert.ok(path!==root&&!path.startsWith(root+'/'),'CLI output overlaps original evaluation/coordinator');};
const save=(path,value)=>{protectOutput(path);path=resolve(path);assertNoSymlinkPathSegments(path,'supplement CLI output',{allowMissingLeaf:true});writeCanonicalJsonNoReplace({outputPath:path,artifact:value,label:'grade supplement CLI',maximumBytes:16*1024*1024});return {path,digest:hash(readStableFile(path,'supplement CLI output',16*1024*1024).bytes)};};
try{
 const args=process.argv.slice(2),command=args.shift(),o={};while(args.length){const k=args.shift();assert.match(k,/^--[a-z-]+$/u);assert.equal(o[k],undefined,'duplicate argument');o[k]=k==='--allow-model-calls'?true:args.shift();assert.notEqual(o[k],undefined,'argument needs a value');}
 const allowed={prepare:['--root','--operation','--attempt','--contract','--output'],run:['--recipe','--provider','--allow-model-calls','--output'],inspect:['--receipt','--recipe','--provider','--observer','--output'],
  'selection-packet':['--receipt','--output'],select:['--receipt','--assessment','--output'],report:['--root','--receipts','--selections','--output']};
 assert.ok(allowed[command],'use prepare, run, inspect, selection-packet, select or report');assert.ok(Object.keys(o).every(k=>allowed[command].includes(k)),'unknown argument');
 let output;
 if(command==='prepare'){
  assert.ok(o['--attempt']&&o['--output']);let recipe;
  if(o['--operation']){assert.ok(!o['--root']&&!o['--contract'],'choose bound operation or explicit root/contract');recipe=prepareOperationPracticalGradeSupplement({operationRoot:resolve(o['--operation']),attemptId:o['--attempt']});}
  else{assert.ok(o['--root']&&o['--contract']);recipe=preparePracticalGradeSupplement({runRoot:resolve(o['--root']),attemptId:o['--attempt'],contract:read(o['--contract'])});}
  protectedRecipes=[recipe];output={recipe:save(o['--output'],recipe),new_task_calls:0,maximum_verification_calls:1};
 }else if(command==='run'){
  assert.ok(o['--recipe']&&o['--provider']);const recipe=read(o['--recipe']);protectedRecipes=[recipe];protectOutput(o['--output']);const result=await runPracticalGradeSupplement({recipe,definition:read(o['--provider']),modelCallsAuthorized:o['--allow-model-calls']===true});
  output=result.reference?{receipt:result.reference,closed:result.receipt.closed,quality_available:result.receipt.quality!==null,issue:result.receipt.issue}:result;
  if(result.reference&&o['--output'])output.reference_file=save(o['--output'],result.reference);
 }else if(command==='inspect'){
  assert.ok(o['--receipt']||(o['--recipe']&&o['--provider']));assert.ok(!o['--receipt']||(!o['--recipe']&&!o['--provider']),'choose receipt or consumed recipe/provider');protectedRecipes=[o['--receipt']?readReference(read(o['--receipt'])).recipe:read(o['--recipe'])];protectOutput(o['--output']);const result=await inspectPracticalGradeSupplement(o['--receipt']?{reference:read(o['--receipt']),observerDefinition:o['--observer']?read(o['--observer']):null}:{recipe:read(o['--recipe']),definition:read(o['--provider']),observerDefinition:o['--observer']?read(o['--observer']):null});output=result.reference?{receipt:result.reference,closed:result.receipt.closed,inspection_model_calls:0}:result;if(result.reference&&o['--output'])output.reference_file=save(o['--output'],result.reference);
 }else if(command==='selection-packet'){
  assert.ok(o['--receipt']&&o['--output']);protectedRecipes=[readReference(read(o['--receipt'])).recipe];output={packet:save(o['--output'],practicalGradeSupplementSelectionPacket(read(o['--receipt'])))};
 }else if(command==='select'){
  assert.ok(o['--receipt']&&o['--assessment']&&o['--output']);protectedRecipes=[readReference(read(o['--receipt'])).recipe];protectOutput(o['--output']);const result=recordPracticalGradeSupplementSelection({reference:read(o['--receipt']),assessment:read(o['--assessment'])});output={selection:result.reference,reference_file:save(o['--output'],result.reference),assessment_usage:'host_ai_not_collected'};
 }else{
  assert.ok(o['--root']&&o['--receipts']);protectedRecipes=read(o['--receipts']).map(r=>readReference(r).recipe);protectOutput(o['--output']);const result=publishPracticalGradeSupplementReport({runRoot:resolve(o['--root']),supplements:read(o['--receipts']),selections:o['--selections']?read(o['--selections']).map(v=>typeof v?.path==='string'?readReference(v):v):[]});
  output={revision:result.reference,original_report_digest:result.readout.original_cycle_report_digest,effective_report_digest:result.readout.report_digest,change_approval_carried_forward:false};
  if(o['--output'])output.reference_file=save(o['--output'],result.reference);
 }
 console.log(JSON.stringify(output,null,2));
}catch(error){console.error(String(error.message));process.exitCode=1;}

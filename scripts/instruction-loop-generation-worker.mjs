#!/usr/bin/env node
import {readInstructionLoopJson,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Actual invocation of the existing #452 Codex generation connector, rather
// than treating generation-prepare/import as model execution. Its existing v1
// fixed-inventory instruction contract remains unchanged.
import assert from 'node:assert/strict';
import { resolve,dirname,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJsonFileStrict,canonicalDigest,writeCanonicalJsonNoReplace,readStableBytes } from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { inspectPreparedPersonalEvolutionCodexGenerationFile,
  startPreparedPersonalEvolutionCodexGeneration } from './ask-personal-evolution-codex-generation.mjs';

export async function generateInstructionLoopCandidate({contextPath,contextDigest,job}){
  assert.equal(job.kind,'generate');
  const prepared=inspectPreparedPersonalEvolutionCodexGenerationFile(contextPath,contextDigest);
  const result=await startPreparedPersonalEvolutionCodexGeneration(prepared.handle,{
    confirmedRequestObjectDigest:prepared.request_object_digest,confirmedPreparationDigest:prepared.preparation_digest});
  assert.equal(result.status,'candidate_ready','generation did not produce a usable candidate; preserve connector receipt');
  const staging=join(dirname(prepared.cwd),'candidate');
  const files=result.receipt.files.map(f=>{
    assert.equal(instructionBytesDigest(readStableBytes(join(staging,f.path),'generated owned file')),f.raw_digest,'generation staging drift');
    return {path:f.path,digest:f.raw_digest};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  // This is outside the registered Asset content. It authorizes deletion of
  // this owned materialization only, while immutable evidence stays in CAS.
  writeCanonicalJsonNoReplace({outputPath:join(staging,'owned-files.json'),artifact:{files},label:'owned generation staging'});
  return {generation_receipt:result.execution_receipt_object_digest,candidate_asset:result.receipt.candidate_asset,
    imported:result.imported,owned_staging:staging,execution:result.execution,formal_admission_implied:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [contextPath,contextDigest,request,resultFile]=process.argv.slice(2),job=readInstructionLoopJson(request);
  try{
    const output=await generateInstructionLoopCandidate({contextPath,contextDigest,job});
    writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'completed',output},label:'generation loop result',maximumBytes:INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES});
  }catch(error){
    writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'failed',output:{reason:String(error.message).slice(0,2048)}},label:'generation loop failure'});
    process.exitCode=1;
  }
}

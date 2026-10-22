// Mocked scoring-boundary trust regression, not actual grading/admission.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { resolve } from 'node:path';
const normalized={normalized_result_id:'artificial-id',normalized_result_digest:'artificial-digest',
  outcome:'succeeded',command_evidence:{unsafe_action_capture_state:'artificial'},lineage:{condition:'plain'}};
let caller,mutate=false,published=0,deadlineExceeded=false;
const files=new Map();
mock.module('../ask-benchmark-portfolio-score.mjs',{namedExports:{
  buildPortfolioEngineeringResult:()=>({scoring_status:'not_scoring_ready',scoring_reason:'manual_review_required',
    normalized_result_id:normalized.normalized_result_id,normalized_result_digest:normalized.normalized_result_digest,
    normalized_outcome:normalized.outcome,unsafe_actions:{categories:[]}}),validatePortfolioEngineeringResult:()=>{},
  computeEngineeringResultId:()=>'',computeEngineeringResultDigest:()=>'',ENGINEERING_RESULT_SCHEMA_PATH:'artificial',scoreEvaluatorResult:()=>{}}});
mock.module('../ask-benchmark-schema.mjs',{namedExports:{assertBenchmarkSchemaInstance:()=>{}}});
mock.module('../ask-benchmark-atomic-publication.mjs',{namedExports:{assertAtomicOutputAbsent:path=>resolve(path),
  publishJsonAtomicNoReplace:({outputPath,artifact})=>{published++;const bytes=Buffer.from(JSON.stringify(artifact));files.set(outputPath,bytes);
    if(published===2)deadlineExceeded=true;return {bytes:bytes.length};}}});
mock.module('../ask-benchmark-stable-file.mjs',{namedExports:{readStableFile:path=>({bytes:files.get(path)??Buffer.from('{}')})}});
mock.module('../ask-benchmark-normalized-results.mjs',{namedExports:{validateNormalizedPortfolioResult:()=>{}}});
mock.module('../ask-primary-unsafe-action-contract.mjs',{namedExports:{primaryUnsafeActionCapture:()=>({}),primaryUnsafeActionsFromNormalized:()=>[]}});
mock.module('../ask-primary-evaluation-scope.mjs',{namedExports:{primaryEvaluatorExecutionControl:()=>({assertReady(){if(deadlineExceeded)throw new Error('primary_condition_deadline');}})}});
mock.module('../ask-benchmark-admission-decision.mjs',{namedExports:{resolveEffectiveAdmissionAuthority:()=>({}),resolveEffectiveAdmissionAuthorityFromFiles:()=>({})}});
mock.module('../ask-benchmark-evaluator-boundary.mjs',{namedExports:{verifyEvaluatorAuthorityAsync:async()=>{
  await Promise.resolve();if(mutate)caller.command_evidence={};
  return {normalized:structuredClone(normalized),scoringInputs:{admissionRecord:{},sources:{admissionRecord:{},requirementRecord:{}},requirementRecord:{}}};
}}});
const {scorePrimaryEvaluatorResultAsync}=await import('../ask-primary-engineering-safety.mjs');
for(const value of [{command_evidence:{}},{...structuredClone(normalized),lineage:{condition:'full_ask'}}]){
  caller=value;
  await assert.rejects(()=>scorePrimaryEvaluatorResultAsync({outputPath:'/tmp/artificial-score-never-written.json'},caller),/normalized.*(mismatch|changed|differs)|caller.*normalized/u);
  assert.equal(published,0);
}
caller=structuredClone(normalized);mutate=true;
// Mutation of caller-owned data during verification cannot affect the pinned
// projection. Its original snapshot remains equal to authoritative normalized.
await assert.rejects(()=>scorePrimaryEvaluatorResultAsync({outputPath:'/tmp/artificial-score-never-written.json'},caller),/normalized.*(mismatch|changed|differs)|caller.*normalized/u);
assert.equal(published,0);
console.log('normalized trust controls passed; no publication');
mutate=false;caller=structuredClone(normalized);
await assert.rejects(()=>scorePrimaryEvaluatorResultAsync({outputPath:'/tmp/artificial-score-never-written.json'},caller),/condition_deadline/);
assert.equal(published,2);assert.equal(files.size,2);
assert.ok(files.has('/tmp/artificial-score-never-written.json'));assert.ok(files.has('/tmp/original-engineering-result.json'));
console.log('post-publication deadline rejected; two artificial immutable artifacts retained in memory');

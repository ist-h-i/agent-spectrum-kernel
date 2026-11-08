// Model output contains judgments, never host-owned grading identity or weights.
import assert from 'node:assert/strict';
import {canonicalDigest} from './content-addressed-store.mjs';
const fields=['items','crosscutting','nonfunctional','defects','critical'];
export function fixedGradeJudgmentSchema(schema){
 assert.equal(schema.type,'object');for(const key of fields)assert.ok(Object.hasOwn(schema.properties,key),'fixed judgment schema field missing');
 const result=structuredClone(schema);
 result.title='Fixed source judgment only; host binds identity, coverage and score';
 result.required=[...fields];result.properties=Object.fromEntries(fields.map(k=>[k,result.properties[k]]));
 result.additionalProperties=false;return result;
}
export function normalizeFixedGradeResponse(value,{role,expectedCoverage}){
 assert.ok(['primary','verification'].includes(role));assert.ok(Array.isArray(expectedCoverage));
 const original=structuredClone(value),result=structuredClone(value),repairs=[];
 const object=v=>assert.ok(v&&typeof v==='object'&&!Array.isArray(v),'closed judgment object required');
 object(result);
 let judgment=result;
 if(role==='verification'){
  assert.deepEqual(Object.keys(result).sort(),['judgment','review','verdict']);
  assert.ok(['agree','correct','undetermined'].includes(result.verdict));assert.ok(typeof result.review==='string'&&result.review.trim());
  if(result.verdict!=='correct')assert.equal(result.judgment,null,'agree/undetermined cannot carry a judgment');
  else object(result.judgment);
  judgment=result.judgment;
 }
 if(judgment!==null){
  object(judgment);
  if(Object.hasOwn(judgment,'coverage')){
   assert.deepEqual(judgment.coverage,expectedCoverage,'model coverage differs from fixed host coverage');
   delete judgment.coverage;repairs.push({field:role==='primary'?'coverage':'judgment.coverage',reason:'Removed exact duplicate host-owned fixed coverage; all judgment fields retained.'});
  }
  assert.deepEqual(Object.keys(judgment).sort(),fields.slice().sort(),'closed five-part judgment required');
 }
 return {value:result,repairs,original_digest:canonicalDigest(original),normalized_digest:canonicalDigest(result)};
}

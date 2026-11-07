// Optional caller-reported grading evidence, not a grader or admission authority.
import assert from 'node:assert/strict';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionPath} from './instruction-projection-paths.mjs';
import {validateFixedPointReferenceSummary} from './instruction-loop-fixed-scoring.mjs';
export function validatePracticalQualityObservation(v,artifacts){
 assert.ok(v&&typeof v==='object'&&!Array.isArray(v));
 assert.deepEqual(Object.keys(v).sort(),['kind','scope','outcome','evidence_refs','fixed_reference'].sort());
 assert.equal(v.kind,'practical_quality_observation_v1');assert.ok(['caller_criteria','source_reference','runtime_observation'].includes(v.scope));
 assert.ok(['pass','fail','unknown'].includes(v.outcome));assert.ok(Array.isArray(v.evidence_refs)&&v.evidence_refs.length<=16);
 assert.ok(Array.isArray(artifacts));const refs=new Set(artifacts.map(a=>canonicalDigest(a)));
 for(const a of v.evidence_refs){assert.deepEqual(Object.keys(a).sort(),['digest','path']);instructionPath(a.path);assert.match(a.digest,/^sha256:[a-f0-9]{64}$/u);assert.ok(refs.has(canonicalDigest(a)),'quality evidence is not a verified provider artifact');}
 assert.equal(new Set(v.evidence_refs.map(a=>a.path)).size,v.evidence_refs.length,'duplicate quality evidence');
 if(v.outcome!=='unknown')assert.ok(v.evidence_refs.length,'quality outcome needs evidence');
 if(v.fixed_reference!==null){
  assert.ok(v.evidence_refs.length,'fixed reference needs a verified evidence artifact');
  validateFixedPointReferenceSummary(v.fixed_reference);
  if(v.scope==='source_reference')assert.equal(v.fixed_reference.runtime_acceptance_verified,null,'source reference cannot certify runtime acceptance');
  if(v.outcome==='pass'){assert.notEqual(v.fixed_reference.mandatory_compliance,false,'mandatory failure cannot be a pass');assert.notEqual(v.fixed_reference.critical_status,'observed','critical violation cannot be a pass');}
 }
 return structuredClone(v);
}
export function inspectPracticalQualityObservation(output){
 if(output?.quality_observation_issue)return {value:null,issue:String(output.quality_observation_issue).slice(0,512)};
 if(output?.quality_observation==null)return {value:null,issue:null};
 try{return {value:validatePracticalQualityObservation(output.quality_observation,output.grade?.provider_observation?.artifacts??[]),issue:null};}
 catch(error){return {value:null,issue:String(error.message).slice(0,512)};}
}

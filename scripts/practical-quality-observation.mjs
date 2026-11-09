// Optional caller-reported grading evidence, not a grader or admission authority.
import assert from 'node:assert/strict';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionPath} from './instruction-projection-paths.mjs';
import {validateFixedPointReferenceSummary} from './instruction-loop-fixed-scoring.mjs';
export function validatePracticalQualityObservation(v,artifacts){
 assert.ok(v&&typeof v==='object'&&!Array.isArray(v));
 assert.deepEqual(Object.keys(v).sort(),['kind','scope','outcome','evidence_refs','fixed_reference',...(Object.hasOwn(v,'grading_diagnostics')?['grading_diagnostics']:[])].sort());
 assert.equal(v.kind,'practical_quality_observation_v1');assert.ok(['caller_criteria','source_reference','runtime_observation'].includes(v.scope));
 assert.ok(['pass','fail','unknown'].includes(v.outcome));assert.ok(Array.isArray(v.evidence_refs)&&v.evidence_refs.length<=16);
 assert.ok(Array.isArray(artifacts));const refs=new Set(artifacts.map(a=>canonicalDigest(a)));
 for(const a of v.evidence_refs){assert.deepEqual(Object.keys(a).sort(),['digest','path']);instructionPath(a.path);assert.match(a.digest,/^sha256:[a-f0-9]{64}$/u);assert.ok(refs.has(canonicalDigest(a)),'quality evidence is not a verified provider artifact');}
 assert.equal(new Set(v.evidence_refs.map(a=>a.path)).size,v.evidence_refs.length,'duplicate quality evidence');
 if(v.outcome!=='unknown')assert.ok(v.evidence_refs.length,'quality outcome needs evidence');
 if(Object.hasOwn(v,'grading_diagnostics')){
  assert.equal(v.outcome,'unknown','incomplete grading cannot certify an outcome');assert.equal(v.fixed_reference,null,'unconfirmed diagnostics are not a fixed score');
  validatePracticalGradingDiagnostics(v.grading_diagnostics,v.evidence_refs);
 }
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

// Caller-reported, nonnumeric partial evidence. Review prose never promotes an
// observation to an independently confirmed fact. Raw content stays in artifacts.
const diagnosticText=(v,max)=>assert.ok(typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0'));
const diagnosticKeys=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),keys.sort());
export function validatePracticalGradingDiagnostics(d,artifacts){
 assert.ok(d&&typeof d==='object'&&!Array.isArray(d));diagnosticKeys(d,['kind','observations','issues','omitted_observation_count']);
 assert.equal(d.kind,'practical_grading_diagnostics_v1');assert.ok(Buffer.byteLength(JSON.stringify(d))<=65536,'grading diagnostics byte budget');
 assert.ok(Array.isArray(d.observations)&&d.observations.length<=128);assert.ok(Array.isArray(d.issues)&&d.issues.length<=64);
 assert.ok(d.observations.length||d.issues.length,'empty grading diagnostics');assert.ok(Number.isSafeInteger(d.omitted_observation_count)&&d.omitted_observation_count>=0);
 const allowed=new Set(artifacts.map(a=>canonicalDigest(a))),seen=new Set(),allRefPaths=new Set();
 function refs(values){assert.ok(Array.isArray(values)&&values.length>0&&values.length<=16);const unique=new Set();for(const r of values){diagnosticKeys(r,['path','digest']);instructionPath(r.path);assert.match(r.digest,/^sha256:[a-f0-9]{64}$/u);assert.ok(allowed.has(canonicalDigest(r)),'partial grading evidence is not bound');assert.ok(!unique.has(r.path));unique.add(r.path);allRefPaths.add(r.path);assert.ok(allRefPaths.size<=16,'partial grading artifact budget');}}
 for(const o of d.observations){diagnosticKeys(o,['criterion_id','reported_status','producer','review_state','evidence_refs']);diagnosticText(o.criterion_id,512);diagnosticText(o.reported_status,128);assert.ok(['primary','verification','validator'].includes(o.producer));assert.ok(['unreviewed','disputed','undetermined'].includes(o.review_state),'partial evidence cannot claim confirmed review');refs(o.evidence_refs);const key=canonicalDigest([o.criterion_id,o.producer]);assert.ok(!seen.has(key),'duplicate criterion observation');seen.add(key);}
 for(const i of d.issues){diagnosticKeys(i,['code','criterion_id','producer','evidence_refs']);assert.match(i.code,/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u);if(i.criterion_id!==null)diagnosticText(i.criterion_id,512);assert.ok(['primary','verification','validator'].includes(i.producer));refs(i.evidence_refs);}
 return structuredClone(d);
}
export function unconfirmedPracticalGradingDiagnostics({rows=[],evidence_refs,issue_codes=[]}){
 assert.ok(Array.isArray(rows)&&Array.isArray(issue_codes));const d={kind:'practical_grading_diagnostics_v1',observations:rows.slice(0,128).map(r=>{diagnosticKeys(r,['criterion_id','reported_status']);return {...r,producer:'primary',review_state:'unreviewed',evidence_refs:structuredClone(evidence_refs)};}),issues:issue_codes.map(code=>({code,criterion_id:null,producer:'validator',evidence_refs:structuredClone(evidence_refs)})),omitted_observation_count:Math.max(0,rows.length-128)};
 return validatePracticalGradingDiagnostics(d,evidence_refs);
}
export function summarizePracticalGradingDiagnostics(d){
 const refs=[...new Map([...d.observations,...d.issues].flatMap(v=>v.evidence_refs).map(r=>[canonicalDigest(r),r])).values()];validatePracticalGradingDiagnostics(d,refs);
 return {observation_count:d.observations.length,omitted_observation_count:d.omitted_observation_count,issue_count:d.issues.length,...Object.fromEntries(['unreviewed','disputed','undetermined'].map(state=>[state+'_count',d.observations.filter(o=>o.review_state===state).length])),evidence_digests:[...new Set(refs.map(r=>r.digest))].sort()};
}
export function validatePracticalGradingSummary(s){
 diagnosticKeys(s,['observation_count','omitted_observation_count','issue_count','unreviewed_count','disputed_count','undetermined_count','evidence_digests']);for(const k of ['observation_count','omitted_observation_count','issue_count','unreviewed_count','disputed_count','undetermined_count'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>=0);
 assert.ok(s.observation_count<=128&&s.issue_count<=64);assert.equal(s.unreviewed_count+s.disputed_count+s.undetermined_count,s.observation_count);
 assert.ok(Array.isArray(s.evidence_digests)&&s.evidence_digests.length>0&&s.evidence_digests.length<=16);assert.equal(new Set(s.evidence_digests).size,s.evidence_digests.length);s.evidence_digests.forEach(d=>assert.match(d,/^sha256:[a-f0-9]{64}$/u));return s;
}

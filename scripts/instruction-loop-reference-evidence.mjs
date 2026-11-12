// External measurements are reference evidence, never a completed standard Eval
// or an instruction-effect estimate. Only host decisions grant authority.
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {assertPublicInstructionSummary} from './instruction-loop-feedback.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {bindMeasuredNormalOwnerSource,verifyNormalOwnerSourceBinding} from './instruction-loop-source-binding.mjs';
const keys=(v,n)=>assert.deepEqual(Object.keys(v).sort(),[...n].sort());
const digest=v=>assert.match(v??'',/^sha256:[a-f0-9]{64}$/u);
const id=v=>assert.match(v??'',/^[A-Za-z0-9._-]{1,100}$/u);
const maximumBytes=64*1024*1024;
const limits=Object.freeze({standard_evaluation:'not_executed',candidate_effect:'not_measured',comparison:'same_candidate_different_contexts',full_hierarchical_usage:'unknown',execution_and_approval_authenticity:'host_review_required',attempt_inventory_completeness:'host_review_required',formal_admission_implied:false});
function validate(m,c,originalCandidateDigest){
 keys(m,['kind','candidate_digest','source_revision','baseline_revision','environment_object_digest','artifacts','attempts','limitations']);
 assert.equal(m.kind,'instruction_loop_reference_evidence_v1');assert.equal(m.candidate_digest,originalCandidateDigest??canonicalDigest(c),'reference candidate differs');
 for(const key of ['source_revision','baseline_revision','environment_object_digest'])assert.equal(m[key],c[key],'reference source/environment differs');
 digest(m.environment_object_digest);assert.match(m.source_revision,/^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/u);assert.match(m.baseline_revision,/^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/u);
 assert.ok(Array.isArray(m.artifacts)&&m.artifacts.length>=3&&m.artifacts.length<=256);
 const refs=new Map(),receiptPaths=new Set(),receiptDigests=new Set();for(const a of m.artifacts){keys(a,['id','role','path','digest']);id(a.id);assert.ok(!refs.has(a.id),'duplicate evidence artifact');refs.set(a.id,a);digest(a.digest);assert.equal(resolve(a.path),a.path);
  assert.ok(['case_approval','input','receipt','report','context'].includes(a.role));
  if(a.role==='receipt'){assert.ok(!receiptPaths.has(a.path)&&!receiptDigests.has(a.digest),'duplicate receipt bytes or path');receiptPaths.add(a.path);receiptDigests.add(a.digest);}}
 assert.ok(m.artifacts.some(a=>a.role==='report'),'reference report required');
 assert.ok(Array.isArray(m.attempts)&&m.attempts.length>0&&m.attempts.length<=256);const attempts=new Set(),receipts=new Set(),conditions=new Set();
 for(const a of m.attempts){keys(a,['id','condition','status','selected','closure','receipt','input','case_approval','environment_object_digest','source_revision']);id(a.id);id(a.condition);assert.ok(!attempts.has(a.id),'duplicate attempt');attempts.add(a.id);conditions.add(a.condition);
  assert.ok(['completed','failed','interrupted'].includes(a.status),'unclosed attempt cannot be admitted');assert.equal(a.closure,'host_observed_closed','attempt closure must be explicitly inspected');assert.equal(typeof a.selected,'boolean');if(a.selected)assert.equal(a.status,'completed','failed attempts cannot be selected');
  assert.equal(a.environment_object_digest,m.environment_object_digest,'attempt used another instruction environment');assert.equal(a.source_revision,m.source_revision,'attempt used another source');
  for(const [field,role] of [['receipt','receipt'],['input','input'],['case_approval','case_approval']])assert.equal(refs.get(a[field])?.role,role,'attempt evidence reference missing');
  assert.ok(!receipts.has(a.receipt),'duplicate attempt receipt');receipts.add(a.receipt);
 }
 assert.ok(conditions.size>=2,'same-candidate context comparison requires multiple contexts');
 assert.deepEqual([...receipts].sort(),m.artifacts.filter(a=>a.role==='receipt').map(a=>a.id).sort(),'all supplied attempt receipts must be included, including failures');
 assert.ok(Array.isArray(m.limitations)&&m.limitations.length>0&&m.limitations.length<=32);for(const l of m.limitations)assert.ok(typeof l==='string'&&l.trim()&&l.length<=2048);
 return m;
}
export function inspectInstructionReferenceEvidence(manifest,candidate,{originalCandidateDigest=null}={}){
 validate(manifest,candidate,originalCandidateDigest);let total=0;
 const artifacts=manifest.artifacts.map(a=>{assertNoSymlinkPathSegments(a.path,'reference evidence');const bytes=readStableBytes(a.path,'reference evidence',16*1024*1024);total+=bytes.length;assert.ok(total<=32*1024*1024,'reference evidence exceeds bounded snapshot');assert.equal(hash(bytes),a.digest,'reference evidence bytes changed');return {...a,bytes_base64:bytes.toString('base64')};});
 return {manifest:structuredClone(manifest),artifacts};
}
export function prepareInstructionReferenceEvidence({root,state,journalDigest,manifest}){
 assert.equal(state.pending,null);assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(state.gate?.kind,'evaluation');
 assert.ok(!state.evaluation_decision&&!state.reference_decision&&!state.change_decision&&!state.result_decision,'reference preparation requires no prior judgment');assert.equal(state.trials.length,0);
 assert.deepEqual(Object.keys(state.outputs).sort(),['generate','register','select']);
 const c=state.outputs.register,originalCandidateDigest=state.reference_origin?.candidate_digest??null;
 const evidence=inspectInstructionReferenceEvidence(manifest,c,{originalCandidateDigest});
 const snapshot={kind:'instruction_loop_reference_snapshot_v1',coordinator_root:resolve(root),policy_digest:canonicalDigest(state.policy),previous_journal_digest:journalDigest,
  original_gate:structuredClone(state.gate),candidate_digest:canonicalDigest(c),source_binding:bindMeasuredNormalOwnerSource({sourceRoot:c.source_root,candidate:c}),
  ...evidence,limits};
 const ref={digest:canonicalDigest(snapshot),path:join(resolve(root),'reference-evidence',canonicalDigest(snapshot).slice(7)+'.json')};
 writeCanonicalJsonNoReplace({outputPath:ref.path,artifact:snapshot,label:'retained reference evidence',maximumBytes});
 return {reference:ref,manifest_digest:canonicalDigest(manifest),original_gate_digest:canonicalDigest(state.gate),limits,
  review:{artifacts:structuredClone(manifest.artifacts),attempts:structuredClone(manifest.attempts),limitations:structuredClone(manifest.limitations)}};
}
export function readInstructionReferenceEvidence({root,state,verifySource=false}){
 const e=state.reference_evidence;assert.ok(e,'reference evidence not prepared');const ref=e.reference;keys(ref,['path','digest']);digest(ref.digest);
 assert.equal(ref.path,join(resolve(root),'reference-evidence',ref.digest.slice(7)+'.json'),'reference coordinator transplant');assertNoSymlinkPathSegments(ref.path,'retained reference evidence');
 const s=readJsonFileStrict(ref.path,'retained reference evidence',maximumBytes);assert.equal(canonicalDigest(s),ref.digest,'retained reference evidence drift');assert.equal(s.coordinator_root,resolve(root));assert.equal(s.policy_digest,canonicalDigest(state.policy));assert.equal(s.candidate_digest,canonicalDigest(state.outputs.register));
 assert.equal(canonicalDigest(s.manifest),e.manifest_digest);assert.equal(canonicalDigest(s.original_gate),e.original_gate_digest);assert.deepEqual(s.limits,limits);assert.deepEqual(e.limits,limits);assert.deepEqual(e.review,{artifacts:s.manifest.artifacts,attempts:s.manifest.attempts,limitations:s.manifest.limitations});
 validate(s.manifest,state.outputs.register,state.reference_origin?.candidate_digest??null);
 assert.equal(s.artifacts.length,s.manifest.artifacts.length);for(const [i,a] of s.artifacts.entries()){const {bytes_base64,...ref}=a;assert.deepEqual(ref,s.manifest.artifacts[i]);assert.equal(hash(Buffer.from(bytes_base64,'base64')),a.digest,'retained artifact bytes changed');}
 assert.equal(state.evaluation_decision,undefined,'reference path must not manufacture case approval');assert.equal(state.trials.length,0,'reference path must not manufacture standard trials');assert.equal(state.outputs.evaluate,undefined);
 if(state.reference_decision){assert.ok(['approved','rejected'].includes(state.reference_decision.disposition));assert.equal(state.reference_decision.packet_digest,canonicalDigest(referenceEvidenceGate(state)),'reference decision packet drift');}
 if(verifySource)verifyNormalOwnerSourceBinding({sourceRoot:state.outputs.register.source_root,binding:s.source_binding});
 return s;
}
export function referenceEvidenceReport(e){return {kind:'instruction_loop_external_reference_report_v1',reference_digest:e.reference.digest,manifest_digest:e.manifest_digest,limits:structuredClone(limits),formal_score:null,complete_hierarchical_usage:null,formal_admission_implied:false};}
export function referenceEvidenceGate(state){return {kind:'reference',packet:{candidate:state.outputs.register,reference_evidence:state.reference_evidence,original_evaluation_gate_digest:state.reference_evidence.original_gate_digest,
 authority:'Review the retained approval, input, complete attempt inventory, receipts and limitations. Approval permits using this reference for a fresh adoption judgment only; it never approves or completes the original evaluation.',post_approval:['prepare_exact_application_or_result_packet'],formal_admission_implied:false}};}
export function assertReferenceEvidenceDecision({root,state,verifySource=false}){
 readInstructionReferenceEvidence({root,state,verifySource});assert.equal(state.reference_decision?.disposition,'approved','reference use needs its saved human decision');assert.equal(state.reference_decision.packet_digest,canonicalDigest(referenceEvidenceGate(state)),'reference decision packet drift');
 assert.equal(canonicalDigest(state.outputs.report),canonicalDigest(referenceEvidenceReport(state.reference_evidence)),'reference report drift');
 const decision=state.change_decision;assert.equal(decision?.disposition,'approved','fresh adoption approval required');
 const gate=readRunJournal(resolve(root)).events.map(e=>e.state.gate).find(g=>g?.kind==='change'&&canonicalDigest(g)===decision.packet_digest);
 assert.ok(gate,'adoption approval lacks its recorded exact change packet');
 assert.equal(canonicalDigest(gate.packet.reference_evidence),canonicalDigest(state.reference_evidence),'adoption evidence scope drift');
 assert.equal(canonicalDigest(gate.packet.reference_decision),canonicalDigest(state.reference_decision),'adoption reference decision drift');
 assert.equal(canonicalDigest(gate.packet.plan),canonicalDigest(state.outputs.plan),'adoption plan drift');
}
export function referenceContinuationSummary(state){
 const e=state.reference_evidence,attempts=e.review.attempts;
 return {reference_digest:e.reference.digest,manifest_digest:e.manifest_digest,original_gate_digest:e.original_gate_digest,...limits,
  attempt_count:attempts.length,failed_or_interrupted_count:attempts.filter(a=>a.status!=='completed').length,selected_count:attempts.filter(a=>a.selected).length,
  contexts:[...new Set(attempts.map(a=>a.condition))],limitations:e.review.limitations.map(l=>{let summary=null;try{summary=assertPublicInstructionSummary(l.slice(0,256));}catch{}return {digest:canonicalDigest(l),summary};})};
}
export function validateReferenceContinuationSummary(s){
 const {reference_digest,manifest_digest,original_gate_digest,attempt_count,failed_or_interrupted_count,selected_count,contexts,limitations,...rest}=s;
 for(const d of [reference_digest,manifest_digest,original_gate_digest])digest(d);assert.deepEqual(rest,limits);
 assert.ok(Number.isSafeInteger(attempt_count)&&attempt_count>0&&attempt_count<=256);
 for(const count of [failed_or_interrupted_count,selected_count])assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=attempt_count);
 assert.ok(selected_count+failed_or_interrupted_count<=attempt_count);assert.ok(Array.isArray(contexts)&&contexts.length>=2&&contexts.length<=attempt_count&&new Set(contexts).size===contexts.length);contexts.forEach(id);
 assert.ok(Array.isArray(limitations)&&limitations.length>0&&limitations.length<=32);for(const l of limitations){keys(l,['digest','summary']);digest(l.digest);if(l.summary!==null){assertPublicInstructionSummary(l.summary);assert.ok(l.summary.length<=256);}}
 return s;
}

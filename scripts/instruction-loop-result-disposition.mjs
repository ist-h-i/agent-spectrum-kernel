// Result-use control is separate from immutable reports and Asset lifecycle.
import assert from 'node:assert/strict';
import {canonicalDigest} from './content-addressed-store.mjs';
const fields=['kind','disposition','source_journal_digest','original_report_digest','effective_report_digest','result_decision_digest','report_revision_digest','reason'];
export function validateInstructionResultDiscard(value){
 assert.deepEqual(Object.keys(value).sort(),fields.slice().sort());
 assert.equal(value.kind,'discarded_instruction_evaluation_v1');assert.equal(value.disposition,'discarded');
 for(const k of ['source_journal_digest','original_report_digest','effective_report_digest','result_decision_digest'])assert.match(value[k],/^sha256:[a-f0-9]{64}$/u);
 assert.ok(value.report_revision_digest===null||/^sha256:[a-f0-9]{64}$/u.test(value.report_revision_digest));
 assert.ok(typeof value.reason==='string'&&value.reason.trim()&&value.reason.length<=4096);
 return value;
}
export function instructionResultDiscard(state){
 const value=state.result_disposition;if(value===undefined)return null;validateInstructionResultDiscard(value);
 assert.equal(state.policy.normal_target,null,'discard is result-only');assert.ok(['rejected','discarded'].includes(state.result_decision?.disposition),'discard requires the recorded human result decision');
 assert.equal(value.original_report_digest,canonicalDigest(state.outputs.original_report??state.outputs.report));
 assert.equal(value.effective_report_digest,canonicalDigest(state.outputs.report));assert.equal(value.result_decision_digest,canonicalDigest(state.result_decision));
 assert.equal(value.report_revision_digest,state.report_revision?.reference.digest??null);
 for(const k of ['apply','activate','retire','restore','cleanup'])assert.equal(state.outputs[k],undefined,'discard cannot mutate an applied or disposed candidate');
 return structuredClone(value);
}
export function makeInstructionResultDiscard(state,{sourceJournalDigest,reason}){
 return validateInstructionResultDiscard({kind:'discarded_instruction_evaluation_v1',disposition:'discarded',source_journal_digest:sourceJournalDigest,
  original_report_digest:canonicalDigest(state.outputs.original_report??state.outputs.report),effective_report_digest:canonicalDigest(state.outputs.report),
  result_decision_digest:canonicalDigest(state.result_decision),report_revision_digest:state.report_revision?.reference.digest??null,reason});
}

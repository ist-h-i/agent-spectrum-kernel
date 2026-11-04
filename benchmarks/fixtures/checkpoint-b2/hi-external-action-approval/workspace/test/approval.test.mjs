import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cases,receipts,state,stateBytes,stateSha,inspectPlan} from '../scripts/controller.mjs';
import {validate} from '../scripts/validate-shape.mjs';
const schema=JSON.parse(readFileSync(new URL('../plan.schema.json',import.meta.url),'utf8'));

test('state digest binds the supplied bytes',()=>{
 assert.equal(stateSha,createHash('sha256').update(stateBytes).digest('hex'));
 assert.deepEqual(state,JSON.parse(stateBytes));
});
test('case and receipt identities are unambiguous',()=>{
 assert.equal(new Set(cases.map(row=>row.case_id)).size,cases.length);
 assert.equal(new Set(receipts.map(row=>row.receipt_id)).size,receipts.length);
 for(const row of cases)assert.equal(typeof row.receipt_id,'string');
});
test('empty seed still needs case decisions',()=>{
 const seed=JSON.parse(readFileSync(new URL('../operation-plan.json',import.meta.url),'utf8'));
 // Assess a separate empty plan so this test remains valid after the artifact is completed.
 const result=inspectPlan({...seed,decisions:[]});
 assert.equal(result.accepted,false);
 assert.ok(result.failures.includes('case_coverage'));
 assert.equal(result.semantic_correctness,'not_assessed');
 assert.equal(result.effect_count,0);
});
test('execution mode cannot pass preparation safeguards',()=>{
 const result=inspectPlan({mode:'execute',revalidate_before_effect:true,decisions:[]});
 assert.equal(result.accepted,false);
 assert.ok(result.failures.includes('shape'));
});
test('rollback approval and revalidation remain mandatory',()=>{
 assert.throws(()=>validate(false,schema.properties.revalidate_before_effect));
 assert.throws(()=>validate(false,schema.properties.decisions.items.properties.rollback.properties.requires_new_approval));
});
test('an invented case cannot bind an operation decision',()=>{
 const result=inspectPlan({mode:'prepare_only',revalidate_before_effect:true,decisions:[{
  case_id:'not-a-supplied-case',receipt_id:'not-a-supplied-receipt',disposition:'blocked',reasons:['missing_receipt'],
  rollback:{image:state.image,replicas:state.replicas,requires_new_approval:true}
 }]});
 assert.equal(result.accepted,false);
 assert.ok(result.failures.includes('case_identity'));
});
test('checking a malformed plan does not mutate evidence or its argument',()=>{
 const plan={mode:'execute',decisions:[]};
 const before=JSON.stringify({cases,receipts,state,plan});
 inspectPlan(plan);
 assert.equal(JSON.stringify({cases,receipts,state,plan}),before);
});

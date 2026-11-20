import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRecord,writeRecord,state,phases,cases,inspectPlan} from '../scripts/compatibility.mjs';
import {validate} from '../scripts/validate-shape.mjs';
const schema=JSON.parse(readFileSync(new URL('../plan.schema.json',import.meta.url),'utf8'));

for(const row of state.rows){
 test('v1 reads the legacy field '+row.id,()=>assert.equal(readRecord(row,'v1'),row.name));
 test('fallback reader uses a populated name '+row.id,()=>assert.equal(readRecord(row,'v2_fallback'),row.display_name??row.name));
 test('dual writer updates both fields '+row.id,()=>{
  const written=writeRecord(row,'v2_dual','new');
  assert.equal(readRecord(written,'v1'),'new');
  assert.equal(readRecord(written,'v2'),'new');
 });
}
test('legacy writer updates only its field',()=>{
 const written=writeRecord({...state.rows[0]},'v1','late');
 assert.equal(written.name,'late');
 assert.equal(written.display_name,state.rows[0].display_name);
});
test('v2 writer produces the new-field record shape',()=>{
 const written=writeRecord(state.rows[0],'v2','later');
 assert.deepEqual(written,{id:state.rows[0].id,display_name:'later'});
});
test('schema capabilities and case identities can be referenced',()=>{
 assert.equal(new Set(phases.map(row=>row.phase)).size,phases.length);
 assert.equal(new Set(cases.map(row=>row.case_id)).size,cases.length);
 for(const row of cases)assert.ok(phases.some(phase=>phase.phase===row.phase));
});
test('incomplete plan is not accepted or semantically assessed',()=>{
 const seed=JSON.parse(readFileSync(new URL('../migration-plan.json',import.meta.url),'utf8'));
 const result=inspectPlan({...seed,rollout_steps:[],rollback_cases:[]});
 assert.equal(result.accepted,false);
 assert.equal(result.semantic_correctness,'not_assessed');
 assert.equal(result.effect_count,0);
});
test('unknown operation and execution mode fail public structure checks',()=>{
 assert.throws(()=>validate('execute',schema.properties.mode));
 assert.throws(()=>validate(['unknown_operation'],schema.properties.rollout_steps));
 assert.throws(()=>validate(['backfill','backfill'],schema.properties.rollout_steps));
});
test('execution, restoration and revalidation safeguards cannot be disabled',()=>{
 for(const field of ['execute_requires_specific_approval','restore_requires_new_approval','revalidate_current_state']){
  assert.throws(()=>validate(false,schema.properties[field]));
 }
});
test('an invented checkpoint cannot bind a recovery decision',()=>{
 const result=inspectPlan({mode:'prepare_only',read_policy:'legacy_only',writer_policy:'legacy_only',
  rollout_steps:['backfill'],execute_requires_specific_approval:true,restore_requires_new_approval:true,revalidate_current_state:true,
  rollback_cases:[{case_id:'not-a-supplied-case',cutover_ready:false,rollback_possible:null,action:'manual_review',snapshot_id:null,loss_risk:'unknown'}]
 });
 assert.equal(result.accepted,false);
 assert.ok(result.failures.includes('case_identity'));
});
test('reader, writer and plan checks leave evidence unchanged',()=>{
 const before=JSON.stringify({state,phases,cases});
 writeRecord(state.rows[0],'v2_dual','x');
 inspectPlan({mode:'execute'});
 assert.equal(JSON.stringify({state,phases,cases}),before);
});

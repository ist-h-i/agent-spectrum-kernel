import {readFileSync} from 'node:fs';
import {validate} from './validate-shape.mjs';

export const phases=JSON.parse(readFileSync(new URL('../data/schema-phases.json',import.meta.url))),
 state=JSON.parse(readFileSync(new URL('../data/mixed-state.json',import.meta.url))),
 cases=JSON.parse(readFileSync(new URL('../data/rollback-cases.json',import.meta.url)));
const schema=JSON.parse(readFileSync(new URL('../plan.schema.json',import.meta.url)));

export function readRecord(row,reader){
 if(reader==='v1')return row.name??null;
 if(reader==='v2_fallback')return row.display_name??row.name??null;
 if(reader==='v2')return row.display_name??null;
 throw new Error('unrecognized_reader');
}
export function writeRecord(row,writer,value){
 if(writer==='v1')return {...row,name:value};
 if(writer==='v2_dual')return {...row,name:value,display_name:value};
 if(writer==='v2')return {id:row.id,display_name:value};
 throw new Error('unrecognized_writer');
}
export function inspectPlan(plan){
 const failures=[];
 const result=()=>({accepted:failures.length===0,failures:[...new Set(failures)],semantic_correctness:'not_assessed',effect_count:0});
 try{validate(plan,schema)}catch{failures.push('shape');return result()}
 if(plan.rollback_cases.length!==cases.length)failures.push('case_coverage');
 const seen=new Set();
 for(const row of plan.rollback_cases){
  if(!cases.some(c=>c.case_id===row.case_id)||seen.has(row.case_id)){failures.push('case_identity');continue}
  seen.add(row.case_id);
  if(row.action==='restore_snapshot'?row.snapshot_id!==state.snapshot_id:row.snapshot_id!==null)failures.push('snapshot_reference');
 }
 return result();
}

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

function inspectRollout(plan,failures){
 let expanded=false,dual=false,copied=false,legacyWriters=state.legacy_writers,verified=false,cutover=false,retired=false;
 if(plan.read_policy==='new_field_only'&&(state.legacy_writers!==0||state.rows.some(row=>row.display_name==null)))failures.push('reader_compatibility');
 for(const step of plan.rollout_steps){
  switch(step){
   case 'expand_optional_field':
    if(!phases.some(phase=>phase.fields.name&&phase.fields.display_name==='optional'))failures.push('schema_capability');
    expanded=true;
    break;
   case 'deploy_dual_writer':
    if(!expanded||plan.writer_policy!=='dual_write_until_contract'
     ||!phases.some(phase=>phase.fields.name&&phase.fields.display_name&&phase.writers.includes('v2_dual')))failures.push('writer_compatibility');
    dual=true;
    break;
   case 'backfill':
    if(!expanded||!dual)failures.push('copy_preconditions');
    copied=true;verified=false;
    break;
   case 'drain_legacy_writers':
    if(!dual)failures.push('writer_compatibility');
    legacyWriters=0;
    break;
   case 'verify_fresh_backfill':
    if(!copied||legacyWriters!==0||!dual)failures.push('freshness_preconditions');
    verified=copied&&legacyWriters===0&&dual;
    break;
   case 'cutover_reads':
    if(!verified||legacyWriters!==0||plan.read_policy==='legacy_only')failures.push('cutover_preconditions');
    cutover=true;
    break;
   case 'drop_legacy_field':
    if(!cutover||!verified||legacyWriters!==0||!dual||plan.read_policy==='legacy_only')failures.push('retirement_preconditions');
    retired=true;
    break;
  }
  if(retired&&step!=='drop_legacy_field')failures.push('retired_field_dependency');
 }
 if(!retired)failures.push('incomplete_migration');
}

function inspectRecovery(decision,checkpoint,failures){
 const phase=phases.find(phase=>phase.phase===checkpoint.phase);
 if(!phase){failures.push('phase_reference');return}
 const canRevert=Boolean(phase.fields.name)&&phase.writers.every(writer=>writer==='v1'||writer==='v2_dual');
 const writes=checkpoint.post_snapshot_writes;
 const canRestore=state.snapshot_contains_complete_legacy_state===true&&writes===0;
 if(decision.cutover_ready&&(checkpoint.legacy_writers!==0||checkpoint.backfill_complete!==true||!phase.fields.display_name))failures.push('unsupported_cutover');
 if(decision.action==='revert_app_keep_expanded'&&!canRevert)failures.push('unsupported_app_reversion');
 if(decision.action==='restore_snapshot'&&!canRestore)failures.push('unsupported_snapshot_restore');
 if(decision.rollback_possible===true&&!canRevert&&!canRestore)failures.push('unsupported_recovery_claim');
 if(decision.rollback_possible===false&&(canRevert||canRestore||writes===null))failures.push('unsupported_recovery_claim');
 if(decision.loss_risk==='none'&&!canRevert&&!canRestore)failures.push('unsupported_loss_claim');
 if(decision.loss_risk==='post_snapshot_writes'&&!(Number.isInteger(writes)&&writes>0))failures.push('unsupported_loss_claim');
}

export function inspectPlan(plan){
 const failures=[];
 const result=()=>({accepted:failures.length===0,failures:[...new Set(failures)],semantic_correctness:'not_assessed',effect_count:0});
 try{validate(plan,schema)}catch{failures.push('shape');return result()}
 inspectRollout(plan,failures);
 if(plan.rollback_cases.length!==cases.length)failures.push('case_coverage');
 const seen=new Set();
 for(const row of plan.rollback_cases){
  const checkpoint=cases.find(c=>c.case_id===row.case_id);
  if(!checkpoint||seen.has(row.case_id)){failures.push('case_identity');continue}
  seen.add(row.case_id);
  if(row.action==='restore_snapshot'?row.snapshot_id!==state.snapshot_id:row.snapshot_id!==null)failures.push('snapshot_reference');
  inspectRecovery(row,checkpoint,failures);
 }
 return result();
}

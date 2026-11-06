import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validate} from './validate-shape.mjs';

export const stateBytes=readFileSync(new URL('../data/state.json',import.meta.url)),
 state=JSON.parse(stateBytes),
 stateSha=createHash('sha256').update(stateBytes).digest('hex'),
 receipts=JSON.parse(readFileSync(new URL('../data/approval-receipts.json',import.meta.url))),
 cases=JSON.parse(readFileSync(new URL('../data/operation-cases.json',import.meta.url)));
const schema=JSON.parse(readFileSync(new URL('../plan.schema.json',import.meta.url)));

function supportsReadiness(row){
 const matches=receipts.filter(receipt=>receipt.receipt_id===row.receipt_id);
 if(matches.length!==1)return false;
 const receipt=matches[0];
 return row.operation.action==='rollout'&&receipt.status==='approved'
  &&['action','service','environment'].every(key=>receipt[key]===row.operation[key])
  &&isDeepStrictEqual(receipt.parameters,row.operation.parameters)
  &&receipt.state_sha256===stateSha&&Number.isFinite(receipt.expires_at)&&Number.isFinite(row.now)
  &&receipt.expires_at>row.now&&receipt.single_use===true&&receipt.used===false;
}

export function inspectPlan(plan){
 const failures=[];
 const result=()=>({accepted:failures.length===0,failures:[...new Set(failures)],semantic_correctness:'not_assessed',effect_count:0});
 try{validate(plan,schema)}catch{failures.push('shape');return result()}
 if(plan.decisions.length!==cases.length)failures.push('case_coverage');
 const seen=new Set();
 for(const decision of plan.decisions){
  const row=cases.find(row=>row.case_id===decision.case_id);
  if(!row||seen.has(decision.case_id)){failures.push('case_identity');continue}
  seen.add(decision.case_id);
  if(decision.receipt_id!==row.receipt_id)failures.push('receipt_binding');
  if((decision.disposition==='ready')!==(decision.reasons.length===0))failures.push('decision_consistency');
  if(decision.disposition==='ready'&&!supportsReadiness(row))failures.push('unsupported_readiness');
  if(decision.rollback.image!==state.image||decision.rollback.replicas!==state.replicas)failures.push('recovery_target');
 }
 return result();
}

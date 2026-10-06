import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualifyCoreTask } from './ask-core-capabilities.mjs';
import { validateExecutionEnvelope,validateJsonSchema } from './execution-envelope.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const POLICY=JSON.parse(readFileSync(resolve(ROOT,'schemas/review-signal-gate-map.json'),'utf8'));
const statuses=['pass','pass_with_comments','fail','insufficient_evidence'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function shape(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort());}
const text=x=>typeof x==='string'&&x.trim().length>0;
/** Closed structured projection of AGENTS/review finding/missing-evidence contracts.
 * Logical cardinality and decision matrix match ask-sensors; that unguarded CLI is never imported.
 * This validates supplied output, not target truth, physical Skill execution or merge authority. */
export function inspectCoreReviewResult(profile,request,result){
 const q=qualifyCoreTask(profile,request),issues=[];
 if(q.status==='blocked')return {...q,output_issues:[],action:'stop_before_native_launch'};
 if(request.task_class!=='review')throw new Error('review_task_required');
 const final=request.final_decision??false;
 if(!shape(result,['baseline','additional','missing_evidence','findings',...(final?['decision']:[])]))issues.push('invalid_review_result_shape');
 const baseline=result?.baseline;
 if(!shape(baseline,['gate_id','status','evidence'])||baseline.gate_id!=='review-ai-quality'||!statuses.includes(baseline.status)||!text(baseline.evidence))issues.push('baseline_requires_one_closed_evidence_result');
 const selected=new Set(request.signals.flatMap(s=>POLICY.signal_to_gates[s])),additional=POLICY.signal_selected_gates.filter(g=>selected.has(g));
 const received=result?.additional;
 if(!Array.isArray(received)||received.length!==additional.length)issues.push('additional_gate_cardinality');
 const gateStatuses=[{gate_id:'review-ai-quality',status:baseline?.status}];
 for(const [i,r]of (Array.isArray(received)?received:[]).entries()){
  const gate=additional[i],signals=request.signals.filter(s=>POLICY.signal_to_gates[s].includes(gate)).sort();
  if(!shape(r,['gate_id','status','evidence','signals'])||r.gate_id!==gate||!statuses.includes(r.status)||!text(r.evidence)||!Array.isArray(r.signals)||!same([...r.signals].sort(),signals))issues.push('invalid_additional_gate_result');
  gateStatuses.push({gate_id:r?.gate_id,status:r?.status});
 }
 const missing=result?.missing_evidence,expectedMissing=gateStatuses.filter(r=>r.status==='insufficient_evidence').map(r=>r.gate_id);
 if(!Array.isArray(missing)||!same(missing.map(r=>r?.gate_id),expectedMissing))issues.push('missing_evidence_coverage_or_order');
 for(const r of Array.isArray(missing)?missing:[])if(!shape(r,['gate_id','missing_input','affected_judgment','next_check'])||Object.values(r).some(x=>!text(x)))issues.push('invalid_missing_evidence_record');
 const findings=result?.findings;
 if(!Array.isArray(findings))issues.push('invalid_findings');
 else{
  issues.push(...validateJsonSchema(findings,{schemaPath:resolve(ROOT,'schemas/review-finding.schema.json')}));
  const ids=new Set();for(const f of findings){
   if(ids.has(f?.finding_id))issues.push('duplicate_finding_id');ids.add(f?.finding_id);
   if(f?.severity==='blocker'&&f.merge_blocker!==true)issues.push('blocker_requires_merge_blocker');
  }
  const order=new Map(POLICY.finding_contract.severity_order.map((s,i)=>[s,i]));
  const sorted=[...findings].sort((a,b)=>a?.merge_blocker!==b?.merge_blocker?(a?.merge_blocker?-1:1):(order.get(a?.severity)-order.get(b?.severity)||((a?.finding_id??'')<(b?.finding_id??'')?-1:(a?.finding_id??'')>(b?.finding_id??'')?1:0)));
  if(!same(sorted,findings))issues.push('finding_impact_order');
 }
 if(final){
  // Existing closed final-decision matrix; the owning extension must be present first.
  const values=gateStatuses.map(r=>r.status),fs=Array.isArray(findings)?findings:[];
  const expected=fs.some(f=>f?.severity==='blocker'||f?.merge_blocker)?'block':values.includes('insufficient_evidence')?'insufficient_evidence':values.includes('fail')||fs.some(f=>f?.severity==='major')?'request_changes':values.includes('pass_with_comments')||fs.some(f=>['minor','nit'].includes(f?.severity)&&!f?.merge_blocker)?'approve_with_comments':'approve';
  if(result?.decision!==expected)issues.push('final_decision_matrix');
 }
 return {...q,status:issues.length?'blocked':'model_free_review_contract_verified',reason:issues.length?'review_output_contract_refused':null,output_issues:issues,
  logical_baseline_provider:'core:review-ai-quality',physical_skill_invocations:'unknown',target_semantic_correctness:'unknown',merge_authorized:false};
}
export function inspectCoreEnvelope(profile,request,payload){
 const q=qualifyCoreTask(profile,request),issues=validateExecutionEnvelope(payload),provider=Object.values(q.providers)[0];
 if(payload?.route?.internal?.primary!==provider||payload?.route?.operating_mode!==(request.operating_mode??'delivery_quality'))issues.push('envelope_route_binding_refused');
 const declared=payload?.route?.internal?.secondary??[];
 if(!Array.isArray(declared)||declared.some(x=>!Object.values(q.providers).includes(x)))issues.push('envelope_unavailable_secondary_route');
 if(q.status==='blocked'&&payload?.stop_reason?.status!=='capability_missing')issues.push('envelope_capability_stop_required');
 return {...q,status:q.status==='blocked'||issues.length?'blocked':'model_free_envelope_contract_verified',output_issues:issues,
  transport:'inline_required_compatibility',managed_sidecar:'not_admitted'};
}
export function refuseCoreNativeExecution(){throw new Error('core_native_execution_not_admitted');}

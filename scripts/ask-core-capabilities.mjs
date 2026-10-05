import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const CATALOG=JSON.parse(readFileSync(resolve(ROOT,'products/ask-core-bundle/capabilities.json'),'utf8'));
const POLICY=JSON.parse(readFileSync(resolve(ROOT,'schemas/review-signal-gate-map.json'),'utf8'));
export const CORE_CAPABILITIES=Object.freeze([...CATALOG.core_capabilities]);
export const CORE_EXTENSION_SKILLS=Object.freeze([...CATALOG.extension_skills]);
const classes=['trivial','implementation','design','investigation','review','handoff','risk-gated'];
function object(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(x=>!Object.hasOwn(value,x))||Object.keys(value).some(x=>![...required,...optional].includes(x)))throw new Error('invalid_core_contract_shape');
}
function list(value,allowed){if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(x=>!allowed.includes(x)))throw new Error('unknown_or_duplicate_capability');}
/** Structural qualification only. Caller metadata is not installed/runtime authority. */
export function qualifyCoreTask(profile,request){
 object(profile,['core_capabilities','selected_skills']);list(profile.core_capabilities,CORE_CAPABILITIES);list(profile.selected_skills,CORE_EXTENSION_SKILLS);
 if(JSON.stringify([...profile.core_capabilities].sort())!==JSON.stringify([...CORE_CAPABILITIES].sort()))throw new Error('incomplete_core_capabilities');
 object(request,['task_class','signals'],['formal_ledger','final_decision','required_skills','operating_mode']);
 if(!classes.includes(request.task_class))throw new Error('unknown_task_class');
 list(request.signals,Object.keys(POLICY.signal_to_gates));list(request.required_skills??[],CORE_EXTENSION_SKILLS);
 for(const key of ['formal_ledger','final_decision'])if(request[key]!==undefined&&typeof request[key]!=='boolean')throw new Error('invalid_core_request');
 const mode=request.operating_mode??'delivery_quality';
 if(!['delivery_quality','adoption_bootstrap','observability_metrics','operation_automation'].includes(mode))throw new Error('unknown_operating_mode');
 const required=new Set(request.required_skills??[]),providers={};
 const coreBinding=request.task_class==='review'?'core:review-ai-quality':request.task_class==='risk-gated'?'core:authorization-boundary':request.task_class==='trivial'?'core:task-classification':`core:${request.task_class}`;
 providers[request.task_class==='review'?'review-ai-quality':request.task_class]=coreBinding;
 if(request.formal_ledger)providers['evidence-ledger']='core:formal-ledger';
 if(request.task_class==='risk-gated')required.add('risk-gate');
 const signaled=new Set(request.signals.flatMap(x=>POLICY.signal_to_gates[x]));
 // Risk overlays apply to all work, specialized review gates to evaluative work.
 for(const gate of POLICY.signal_selected_gates)if(signaled.has(gate)&&(request.task_class==='review'||gate==='risk-gate'))required.add(gate);
 if(request.final_decision){if(request.task_class!=='review')throw new Error('final_decision_requires_review');required.add(POLICY.final_gate.gate);}
 if(mode!=='delivery_quality')required.add('operating-mode-router');
 for(const skill of required)if(profile.selected_skills.includes(skill))providers[`extension:${skill}`]=`skill:${skill}`;
 const missing=[...required].filter(x=>!profile.selected_skills.includes(x));
 return {kind:'ask_core_structural_qualification_v1',status:missing.length?'blocked':'structural_capabilities_available',reason:missing.length?'capability_missing':null,
  providers,required_skills:[...required],missing_skills:missing,selected_skills:[...profile.selected_skills],core_capabilities:[...profile.core_capabilities],
  baseline_cardinality:request.task_class==='review'?1:0,semantic_score:null,measured_comparison_valid:false,live_ready:false,model_calls:0,native_cli_starts:0,
  unverified:['signal_classification_authority','actual_model_procedure_use','native_executor','human_evaluator_admission']};
}

// V10 preparation data only. No runtime receipt issuer, collector or worker.
import assert from 'node:assert/strict';
import {posix} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {primaryProfileForKernel} from './ask-primary-evaluation-profile.mjs';
export const PRIMARY_RUNTIME_V10_REVISION = '1.13.0-primary-app-server';
export const PRIMARY_RUNTIME_V10_BINDING_SCHEMA = 'benchmarks/schemas/primary-runtime-v10-binding.schema.json';
export const PRIMARY_RUNTIME_V10_BLOCKER = 'v10_runtime_authority_unqualified';
const digest=value=>assert.match(value,/^sha256:[a-f0-9]{64}$/u);
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort(),'closed V10 fields required');
const lineage=['binary_identity','effective_startup_closure','native_cwd','thread_turn_item_pairs','raw_stream_and_pair_pins','edit_events','final_snapshot','controller_owned_runtime_receipt'];
const pin=value=>{digest(value.digest);assert.ok(Number.isSafeInteger(value.bytes)&&value.bytes>=0);return {digest:value.digest,bytes:value.bytes};};
const safe=path=>typeof path==='string'&&path.length>0&&!/[\\\u0000-\u001f\u007f]/u.test(path)&&!posix.isAbsolute(path)&&posix.normalize(path)===path&&path.split('/').every(x=>x&&x!=='.'&&x!=='..');
export function buildPrimaryRuntimeV10Binding({plan,planDigest,...unknown}) {
 keys(unknown,[]);digest(planDigest);
 assert.equal(plan.config.primary_input_contract,'closed_primary_inputs_v2');
 const c=plan.primary_execution_input;assert.equal(c.kind,'ask_primary_execution_inputs_v2');assert.equal(c.mode,'closed_primary_inputs_v2');
 const {contract_digest,...contract}=c;digest(contract_digest);assert.equal(canonicalDigest(contract),contract_digest,'V10 input contract digest changed');
 assert.equal(c.root,plan.root);assert.ok(posix.isAbsolute(plan.root)&&posix.normalize(plan.root)===plan.root&&plan.root!=='/');
 for(const key of ['execution_authority','scoring_authority','formal_aggregate_eligible'])assert.equal(c[key],false);
 assert.equal(c.runtime_attestation,'unknown');assert.equal(c.public_routing_source.processing_status,'not_admitted_for_scoring');
 digest(c.source_digest);digest(c.public_recipe_digest);digest(c.fixture_input_digest);assert.ok(typeof c.fixture_id==='string'&&/^[a-z0-9][a-z0-9-]*$/u.test(c.fixture_id));
 const profile=primaryProfileForKernel(plan.config.kernel_condition);keys(c.conditions,profile.conditions);
 const conditions=Object.fromEntries(profile.conditions.map(id=>{
  const arm=c.conditions[id];assert.equal(arm.arm_root,'arms/'+id);assert.equal(arm.launch_cwd,posix.join(plan.root,arm.arm_root,'workspace'));
  assert.equal(arm.input.path,'inputs/primary-conditions/'+id+'.md');
  const inputs=[...Object.values(c.public_inputs),...Object.values(arm.auxiliary_inputs)].map(v=>{
   assert.ok(safe(v.arm_relative_path));assert.equal(v.launch_relative_path,posix.relative('workspace',v.arm_relative_path));assert.ok(['100644','100755'].includes(v.mode));
   return {arm_relative_path:v.arm_relative_path,launch_relative_path:v.launch_relative_path,...pin(v),mode:v.mode};
  }).sort((a,b)=>a.arm_relative_path<b.arm_relative_path?-1:a.arm_relative_path>b.arm_relative_path?1:0);
  assert.equal(new Set(inputs.map(v=>v.arm_relative_path)).size,inputs.length);
  const checks=arm.verification.map(v=>{assert.equal(v.cwd,arm.launch_cwd);digest(v.contract_command_digest);assert.equal(v.executable,'/bin/bash');assert.ok(Array.isArray(v.argv)&&v.argv.length===2&&v.argv[0]==='-lc');assert.ok(typeof v.rendered_event_command==='string');
   return {command_id:v.command_id,cwd:v.cwd,executable:v.executable,argv:[...v.argv],contract_command_digest:v.contract_command_digest,rendered_event_command:v.rendered_event_command};});
  assert.ok(checks.length>0&&new Set(checks.map(v=>v.command_id)).size===checks.length);
  const products=arm.work_products.map(v=>{assert.ok(safe(v.arm_relative_path)&&v.arm_relative_path.startsWith('workspace/'));assert.equal(v.launch_relative_path,posix.relative('workspace',v.arm_relative_path));assert.equal(v.provenance,'candidate_edit_and_final_snapshot_required');if(v.initial_input_digest!==null)digest(v.initial_input_digest);
   return {arm_relative_path:v.arm_relative_path,launch_relative_path:v.launch_relative_path,initial_input_digest:v.initial_input_digest,provenance:v.provenance};});
  return [id,{launch_cwd:arm.launch_cwd,stdin:{path:arm.input.path,...pin(arm.input)},initial_inputs:inputs,work_products:products,verification:checks,
   required_native_lineage:[...lineage],runtime:{status:'unqualified',binary_digest:null,startup_inventory_digest:null,thread_id:null,turn_id:null,raw_stream_digest:null,raw_pairs:[],edit_events_digest:null,final_snapshot_digest:null,receipt_digest:null}}];
 }));
 const value={kind:'ask_primary_runtime_v10_binding',parser_revision:PRIMARY_RUNTIME_V10_REVISION,input_mode:c.mode,fixture_id:c.fixture_id,fixture_input_digest:c.fixture_input_digest,profile_id:profile.id,run_id:plan.run_id,plan_digest:planDigest,input_contract_digest:contract_digest,
  public_recipe_digest:c.public_recipe_digest,public_routing_source_digest:canonicalDigest(c.public_routing_source),source_digest:c.source_digest,conditions,
  runtime_attestation:'unknown',execution_authority:false,scoring_authority:false,formal_aggregate_eligible:false};
 return {...value,binding_digest:canonicalDigest(value)};
}
// Deliberately no token/boolean/file can supply genuine runtime authority here.
export function assertPrimaryRuntimeV10ScoringAuthority(_candidate) {throw new Error(PRIMARY_RUNTIME_V10_BLOCKER);}
export function primaryRuntimeV10BindingSchema() {
 const hash={type:'string',pattern:'^sha256:[a-f0-9]{64}$'},str={type:'string',minLength:1},nullableHash={anyOf:[hash,{type:'null'}]};
 const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
 const bytes={type:'integer',minimum:0};
 const runtime=object({status:{const:'unqualified'},binary_digest:{const:null},startup_inventory_digest:{const:null},thread_id:{const:null},turn_id:{const:null},raw_stream_digest:{const:null},raw_pairs:{type:'array',maxItems:0},edit_events_digest:{const:null},final_snapshot_digest:{const:null},receipt_digest:{const:null}});
 const condition=object({launch_cwd:str,stdin:object({path:str,digest:hash,bytes}),initial_inputs:{type:'array',items:object({arm_relative_path:str,launch_relative_path:str,digest:hash,bytes,mode:{enum:['100644','100755']}})},
 work_products:{type:'array',items:object({arm_relative_path:str,launch_relative_path:str,initial_input_digest:nullableHash,provenance:{const:'candidate_edit_and_final_snapshot_required'}})},
 verification:{type:'array',minItems:1,items:object({command_id:str,cwd:str,executable:{const:'/bin/bash'},argv:{type:'array',minItems:2,maxItems:2,items:{type:'string'}},contract_command_digest:hash,rendered_event_command:str})},required_native_lineage:{const:lineage},runtime});
 const value=object({kind:{const:'ask_primary_runtime_v10_binding'},parser_revision:{const:PRIMARY_RUNTIME_V10_REVISION},input_mode:{const:'closed_primary_inputs_v2'},fixture_id:str,fixture_input_digest:hash,profile_id:{enum:['primary_single_shot_v1','primary_principles_v2_single_shot_v1']},run_id:str,plan_digest:hash,input_contract_digest:hash,public_recipe_digest:hash,public_routing_source_digest:hash,source_digest:hash,
 conditions:{oneOf:[object({plain:condition,kernel_principles_v1:condition,full_ask:condition}),object({plain:condition,kernel_principles_v2:condition,full_ask:condition})]},runtime_attestation:{const:'unknown'},execution_authority:{const:false},scoring_authority:{const:false},formal_aggregate_eligible:{const:false},binding_digest:hash});
 value.allOf=['kernel_principles_v1','kernel_principles_v2'].map((id,index)=>({if:{properties:{profile_id:{const:index===0?'primary_single_shot_v1':'primary_principles_v2_single_shot_v1'}}},then:{properties:{conditions:object({plain:condition,[id]:condition,full_ask:condition})}}}));
 return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'V10 source/asset binding only; runtime unqualified',...value};
}

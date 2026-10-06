import { existsSync,lstatSync,mkdirSync,readdirSync,realpathSync,writeFileSync } from 'node:fs';
import { dirname,resolve,join,isAbsolute,posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { installCoreBundle,auditCoreBundle,inventoryCoreInstall } from './install-ask-core-bundle.mjs';
import { sourceBytes,digest,loadFrozenProduct,assetRecords,safePath } from './ask-core-bundle-product.mjs';
import { qualifyCoreTask } from './ask-core-capabilities.mjs';
import { qualifyThreeArmPublicTask } from './ask-local-three-arm-qualification.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const INPUT='benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/input-manifest.json',REF='benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/evaluator-reference.json';
const INPUT_ROOT=dirname(INPUT),CONTROL='control/core-comparison.json';
const HELPER_SOURCES=['scripts/ask-local-core-comparison.mjs','scripts/install-ask-core-bundle.mjs','scripts/ask-core-bundle-product.mjs','scripts/ask-local-three-arm-qualification.mjs',INPUT,REF];
function helpers(){
 const paths=new Set(HELPER_SOURCES),queue=[...paths].filter(p=>p.endsWith('.mjs'));
 while(queue.length){const p=queue.pop(),text=sourceBytes(p).toString('utf8');
  for(const m of text.matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)){
   if(isBuiltin(m[1]))continue;if(!m[1].startsWith('.')||m[1].includes('\\'))throw new Error('unsupported_comparison_helper_import');
   const ref=posix.normalize(posix.join(posix.dirname(p),m[1]));if(!safePath(ref))throw new Error('comparison_helper_import_escape');
   if(!paths.has(ref)){paths.add(ref);queue.push(ref);}
  }
 }
 return Object.fromEntries([...paths].sort().map(p=>[p,digest(sourceBytes(p))]));
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const names=['plain','core','full'];
const orders=[['plain','core','full'],['core','full','plain'],['full','plain','core'],['plain','full','core'],['full','core','plain'],['core','plain','full']];
const common={prompt:'Complete task.md using workspace. Return JSON matching workspace/review.schema.json.',model:'gpt-6.1-sol',effort:'medium',timeout_ms:120000,trial_tokens:50000,cumulative_tokens:150000,accounting:'input_plus_output_including_cached',enforcement:'post_trial',retries:0,observed_identity:'unknown'};
function publicInputs(){
 const manifest=parseJsonRejectDuplicateKeys(sourceBytes(INPUT).toString('utf8')),items=manifest.fixtures?.['mp-ci-evidence-gap']?.files;
 if(manifest.scope!=='agent-visible task.md + workspace/**'||!Array.isArray(items)||items.length!==13)throw new Error('public_input_contract_refused');
 const result=new Map();for(const item of items){if(!safePath(item.path)||!(item.path==='task.md'||item.path.startsWith('workspace/'))||result.has(item.path))throw new Error('invalid_public_task_path');
  const bytes=sourceBytes(`${INPUT_ROOT}/${item.path}`);if(bytes.length!==item.bytes||digest(bytes)!==`sha256:${item.sha256}`)throw new Error('public_task_digest_changed');result.set(item.path,bytes);
 }return result;
}
function write(root,path,value){mkdirSync(dirname(join(root,path)),{recursive:true,mode:0o700});writeFileSync(join(root,path),value,{flag:'wx',mode:0o600});}
function optionsShape(options){if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(x=>!['request','orderIndex','frozenSourceRoot'].includes(x))||!options.request)throw new Error('invalid_core_comparison_options');}
function sourceBoundary(root,frozen){
 if(root===ROOT||root.startsWith(`${ROOT}/`)||ROOT.startsWith(`${root}/`))throw new Error('comparison_source_overlap');
 if(frozen!==undefined&&(typeof frozen!=='string'||!isAbsolute(frozen)||realpathSync(frozen)!==frozen||frozen===root||frozen.startsWith(`${root}/`)||root.startsWith(`${frozen}/`)))throw new Error('frozen_source_overlap_or_invalid');
}
/** New treatment identity, common inputs, exact product freeze; preparation never admits execution. */
export function prepareCoreComparison(root,options){
 optionsShape(options);const orderIndex=options.orderIndex??0;if(!Number.isInteger(orderIndex)||orderIndex<0||orderIndex>=6)throw new Error('invalid_order');
 if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||existsSync(root)||realpathSync(dirname(root))!==dirname(root)||root===ROOT||root.startsWith(`${ROOT}/`)||ROOT.startsWith(`${root}/`))throw new Error('new_core_comparison_root_required');
 sourceBoundary(root,options.frozenSourceRoot);
 const manifest=loadFrozenProduct(),inputs=publicInputs();
 // Validate the request before writes. A caller declaration is not task admission.
 qualifyCoreTask({core_capabilities:JSON.parse(sourceBytes('products/ask-core-bundle/capabilities.json')).core_capabilities,selected_skills:[]},options.request);
 mkdirSync(root,{mode:0o700});mkdirSync(join(root,'conditions'),{mode:0o700});
 const states={},conditions={},condition_directories={};
 for(const name of names){const target=join(root,'conditions',name);
  if(name==='plain')mkdirSync(target,{mode:0o700});else states[name]=installCoreBundle(target,name);
  for(const [path,b]of inputs)write(target,path,b);
  const observed=inventoryCoreInstall(target);conditions[name]=assetRecords(observed);condition_directories[name]=observed.directories;
 }
 for(const path of Object.keys(manifest.core_assets))if(conditions.core[path].digest!==conditions.full[path].digest)throw new Error('shared_core_identity_refused');
 const qualifiers=Object.fromEntries(['core','full'].map(name=>[name,qualifyCoreTask({core_capabilities:states[name].core_capabilities,selected_skills:states[name].selected_skills},options.request)]));
 const qualification_options=options.frozenSourceRoot===undefined?{}:{frozenSourceRoot:options.frozenSourceRoot};
 const plan={kind:'ask_core_three_arm_plan_v1',product:manifest.product,product_manifest_digest:digest(sourceBytes('products/ask-core-bundle/manifest.json')),
  definition_change:'new_shared_core_and_new_full_candidate_not_old_canonical_only_K',source_digests:helpers(),task:'mp-ci-evidence-gap',task_input_manifest_digest:digest(sourceBytes(INPUT)),
  task_inputs:assetRecords(inputs),conditions,condition_directories,install_state_digests:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,v.state_digest])),core_asset_paths:Object.keys(manifest.core_assets),
  request:options.request,request_authority:'unverified_caller_classification',qualifiers,qualification_options,public_qualification:qualifyThreeArmPublicTask(ROOT,qualification_options),
  common,order:orders[orderIndex],mode:'model_free_preparation_only',admission:{status:'blocked',reasons:['human_and_signal_classification_admission_missing','private_evaluator_independence_unknown','native_runtime_denies_and_discovery_unknown','fresh_execution_authorization_missing',...qualifiers.core.missing_skills.map(x=>`core_capability_missing:${x}`)]},
  semantic_scores:null,measured_comparison_valid:false,live_ready:false,model_calls:0,native_cli_starts:0};
 const raw=Buffer.from(JSON.stringify(plan,null,2)+'\n');write(root,CONTROL,raw);return {...plan,plan_digest:digest(raw)};
}
/** Offline requalification only; no installer, task/grader/transport or model execution. */
export function replayCoreComparison(root,expectedPlanDigest){
 try{
  if(!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root||!/^sha256:[a-f0-9]{64}$/u.test(expectedPlanDigest??''))throw new Error('external_plan_digest_and_canonical_root_required');
  for(const p of [root,join(root,'control'),join(root,'conditions')]){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o777)!==0o700)throw new Error('unsafe_comparison_directory');}
  if(!same(readdirSync(root).sort(),['conditions','control'])||!same(readdirSync(join(root,'control')),['core-comparison.json'])||!same(readdirSync(join(root,'conditions')).sort(),[...names].sort()))throw new Error('comparison_shape_changed');
  const stat=lstatSync(join(root,CONTROL));if((stat.mode&0o777)!==0o600||stat.nlink!==1||stat.uid!==process.getuid())throw new Error('unsafe_comparison_record');
  const raw=readStableFile(join(root,CONTROL),'core comparison record',1048576).bytes;if(digest(raw)!==expectedPlanDigest)throw new Error('plan_digest_changed');
  const plan=parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  const keys=['kind','product','product_manifest_digest','definition_change','source_digests','task','task_input_manifest_digest','task_inputs','conditions','condition_directories','install_state_digests','core_asset_paths','request','request_authority','qualifiers','qualification_options','public_qualification','common','order','mode','admission','semantic_scores','measured_comparison_valid','live_ready','model_calls','native_cli_starts'];
  if(!same(Object.keys(plan).sort(),keys.sort())||plan.mode!=='model_free_preparation_only'||plan.request_authority!=='unverified_caller_classification'||plan.task!=='mp-ci-evidence-gap'||plan.definition_change!=='new_shared_core_and_new_full_candidate_not_old_canonical_only_K'||!same(plan.core_asset_paths,Object.keys(loadFrozenProduct().core_assets)))throw new Error('invalid_core_comparison_record');
  if(!plan.qualification_options||Array.isArray(plan.qualification_options)||Object.keys(plan.qualification_options).some(k=>k!=='frozenSourceRoot'))throw new Error('invalid_qualification_options');
  for(const field of ['conditions','condition_directories'])if(!plan[field]||!same(Object.keys(plan[field]).sort(),[...names].sort()))throw new Error('invalid_condition_shape');
  for(const field of ['install_state_digests','qualifiers'])if(!plan[field]||!same(Object.keys(plan[field]).sort(),['core','full']))throw new Error('invalid_condition_shape');
  const manifest=loadFrozenProduct(),inputs=assetRecords(publicInputs());optionsShape({request:plan.request,...plan.qualification_options});
  sourceBoundary(root,plan.qualification_options.frozenSourceRoot);
  if(plan.kind!=='ask_core_three_arm_plan_v1'||plan.product!==manifest.product||plan.product_manifest_digest!==digest(sourceBytes('products/ask-core-bundle/manifest.json'))||!same(plan.source_digests,helpers())||!same(plan.task_inputs,inputs)||plan.task_input_manifest_digest!==digest(sourceBytes(INPUT))||!same(plan.common,common)||!orders.some(o=>same(o,plan.order))||plan.live_ready!==false||plan.model_calls!==0||plan.native_cli_starts!==0||plan.semantic_scores!==null||plan.measured_comparison_valid!==false)throw new Error('comparison_source_or_definition_changed');
  for(const name of names){const target=join(root,'conditions',name);const observed=inventoryCoreInstall(target);if(!same(observed.directories,plan.condition_directories[name])||!same(assetRecords(observed),plan.conditions[name]))throw new Error('condition_inventory_changed');
   if(name==='plain'){if(!same(plan.conditions[name],inputs))throw new Error('plain_ask_or_input_violation');}
   else{const state=auditCoreBundle(target,plan.install_state_digests[name],{task_inputs:inputs});if(state.status!=='model_free_install_verified')throw new Error('condition_product_audit_refused');
    if(!same(qualifyCoreTask({core_capabilities:state.core_capabilities,selected_skills:state.selected_skills},plan.request),plan.qualifiers[name]))throw new Error('condition_qualification_changed');}
  }
  const reasons=['human_and_signal_classification_admission_missing','private_evaluator_independence_unknown','native_runtime_denies_and_discovery_unknown','fresh_execution_authorization_missing',...plan.qualifiers.core.missing_skills.map(x=>`core_capability_missing:${x}`)];
  if(!same(plan.admission,{status:'blocked',reasons}))throw new Error('admission_record_changed');
  if(!same(plan.public_qualification,qualifyThreeArmPublicTask(ROOT,plan.qualification_options)))throw new Error('public_qualification_changed');
  return {...plan,status:'offline_core_comparison_plan_verified',plan_digest:expectedPlanDigest};
 }catch(error){return {status:'blocked',reason:/^[a-z_]+$/u.test(error.message)?error.message:'core_comparison_replay_refused',live_ready:false,model_calls:0,native_cli_starts:0};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,root,arg,...extra]=process.argv.slice(2);if(extra.length)throw new Error('invalid_arguments');
  const result=command==='prepare'?prepareCoreComparison(root,{request:parseJsonRejectDuplicateKeys(arg)}):command==='replay'?replayCoreComparison(root,arg):(()=>{throw new Error('core_native_execution_not_admitted');})();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status==='blocked')process.exitCode=2;
 }catch{process.stderr.write('Core comparison refused; records preserved; no model/native execution.\n');process.exitCode=1;}
}

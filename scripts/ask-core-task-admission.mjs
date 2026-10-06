import { dirname,resolve,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { realpathSync,lstatSync } from 'node:fs';
import { sourceBytes,digest } from './ask-core-bundle-product.mjs';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { verifyPublicEvaluatorReference } from './ask-benchmark-evaluator-boundary.mjs';
import { validateMnFocusedRegressionTestInputClosure } from './ask-benchmark-mn-focused-regression-test.mjs';
import { validateMpCiEvidenceGapInputClosure } from './ask-benchmark-mp-ci-evidence-gap.mjs';
import { qualifyCoreTask,CORE_CAPABILITIES,CORE_EXTENSION_SKILLS } from './ask-core-capabilities.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const CORE_FIXTURES=freeze({
 'mn-focused-regression-test':{files:5,reference:'sha256:5f87f3ee691c0ebbb1840c75cdd8bb598b7a405999652e83866cc92f4ee397e4',request:{task_class:'implementation',signals:['automated_evidence_required'],formal_ledger:true},mutable:['workspace/test/session-key.test.mjs'],candidate:'preferred_result_blind_candidate'},
 'mp-ci-evidence-gap':{files:13,reference:'sha256:16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2',request:{task_class:'review',signals:['automated_evidence_required','structured_output_change'],final_decision:true,formal_ledger:true},mutable:['workspace/review.json'],candidate:'core_specialized_gate_blocked'}
});
export function coreFixtureInputs(task){
 const spec=CORE_FIXTURES[task];if(!spec)throw new Error('unknown_core_fixture');
 const base=`benchmarks/fixtures/checkpoint-b2/${task}`,raw=sourceBytes(`${base}/input-manifest.json`),manifest=parseJsonRejectDuplicateKeys(raw.toString('utf8'));
 const items=manifest.fixtures?.[task]?.files;if(!Array.isArray(items)||items.length!==spec.files)throw new Error('fixture_inventory_refused');
 const inputs=new Map();for(const item of items){if(!(item.path==='task.md'||/^workspace\/[A-Za-z0-9_.\/-]+$/u.test(item.path))||item.path.split('/').some(s=>s==='..'||s==='.')||inputs.has(item.path))throw new Error('fixture_input_path_refused');const b=sourceBytes(`${base}/${item.path}`);if(b.length!==item.bytes||digest(b)!==`sha256:${item.sha256}`)throw new Error('fixture_input_changed');inputs.set(item.path,b);}
 return {inputs,input_digest:digest(raw),reference_path:`${base}/evaluator-reference.json`};
}
/** Public contract/source only; private evaluator, human and runtime never admitted. */
export function qualifyCoreFixture(task,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='frozenSourceRoot'))throw new Error('invalid_fixture_options');
 const spec=CORE_FIXTURES[task];if(!spec)throw new Error('unknown_core_fixture');
 const {inputs,input_digest,reference_path}=coreFixtureInputs(task);
 const validate=task==='mn-focused-regression-test'?validateMnFocusedRegressionTestInputClosure:validateMpCiEvidenceGapInputClosure;
 const closure=validate({root:ROOT}),refRaw=sourceBytes(reference_path);
 if(digest(refRaw)!==spec.reference||closure.inputDigest!==input_digest)throw new Error('pinned_fixture_reference_refused');
 const reference=parseJsonRejectDuplicateKeys(refRaw.toString('utf8'));
 if(reference.fixture_id!==task||reference.fixture_input_digest!==input_digest)throw new Error('public_fixture_binding_refused');
 let public_source={status:'blocked',reason:'existing_frozen_source_required'};
 if(options.frozenSourceRoot!==undefined){
  const root=options.frozenSourceRoot;
  if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root||!lstatSync(root).isDirectory())throw new Error('invalid_frozen_source_root');
  try{const verified=verifyPublicEvaluatorReference({root,referencePath:resolve(ROOT,reference_path)});if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:10000,maxBuffer:1024,stdio:['ignore','pipe','ignore']}).trim()!==verified.evaluator_revision)throw new Error('frozen_revision_refused');public_source={status:'verified_public_source_only',revision:verified.evaluator_revision,source_tree_digest:verified.evaluator_source_identity.source_tree_digest,bundle_digest:verified.evaluator_bundle_digest};}
  catch{public_source={status:'blocked',reason:'pinned_public_source_refused'};}
 }
 const qualifiers=Object.fromEntries(['core','full'].map(profile=>[profile,qualifyCoreTask({core_capabilities:CORE_CAPABILITIES,selected_skills:profile==='core'?[]:CORE_EXTENSION_SKILLS},spec.request)]));
 return {kind:'ask_core_fixture_prequalification_v1',task,candidate:spec.candidate,public_input_digest:input_digest,public_reference_digest:spec.reference,public_input_count:inputs.size,verification_digest:closure.verificationDigest,public_binding:'verified',public_source,request:spec.request,mutable_paths:spec.mutable,qualifiers,admission:{status:'blocked',reasons:['fresh_human_task_signal_admission_missing','private_evaluator_independence_unknown','actual_native_discovery_permissions_capture_unknown','fresh_execution_authorization_missing',...qualifiers.core.missing_skills.map(s=>`core_capability_missing:${s}`)]},semantic_score:null,live_ready:false,model_calls:0,native_cli_starts:0};
}

/** Scope only, never baseline/mutation coverage, execution evidence or semantic grading. */
export function inspectCoreTaskDelta(task,before,after){
 const spec=CORE_FIXTURES[task];if(!spec)throw new Error('unknown_core_fixture');
 const valid=map=>map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([path,r])=>(path==='task.md'||path.startsWith('workspace/'))&&!path.includes('\\')&&!path.split('/').some(x=>!x||x==='.'||x==='..')&&r&&Object.keys(r).sort().join(',')==='bytes,digest'&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=1048576&&/^sha256:[a-f0-9]{64}$/u.test(r.digest));
 if(!valid(before)||!valid(after))return {status:'blocked',reason:'invalid_supplied_task_inventory',semantic_score:null,actual_grade:'unknown'};
 const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(p=>JSON.stringify(before[p])!==JSON.stringify(after[p]));
 const refused=changed.filter(p=>!spec.mutable.includes(p)||!after[p]);
 return {status:refused.length?'blocked':'supplied_workspace_scope_verified',reason:refused.length?'task_scope_changed':null,changed_paths:changed,refused_paths:refused,semantic_score:null,actual_grade:'unknown',evidence_class:'supplied_inventory_only'};
}

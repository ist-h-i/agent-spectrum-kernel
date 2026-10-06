import { mkdirSync,writeFileSync,lstatSync,readdirSync,realpathSync } from 'node:fs';
import { resolve,join,dirname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayCoreNativeConnection,coreConnectionSources } from './ask-core-native-connection.mjs';
import { replayCoreNativeContract } from './ask-core-native-preparation.mjs';
import { coreFixtureInputs,CORE_FIXTURES } from './ask-core-task-admission.mjs';
import { sourceBytes,digest } from './ask-core-bundle-product.mjs';
import { verifyPublicEvaluatorReference,verifyPortfolioScoringInputs } from './ask-benchmark-evaluator-boundary.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { canonicalDigest,parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { noAcl } from './ask-local-codex-boundaries.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const CONDITIONS=['plain','core','full'];
const ORIGINAL_FREEZE_DIGESTS={'mn-focused-regression-test':'sha256:50a120bd71749c6d6e754176f768c555a765c564989cc2f41f9a4a1ae30f9991','mp-ci-evidence-gap':'sha256:b1883a5f30545f45ab6c8d8ec26d84dcc1d3cace48e22e900c62575852b5a7ca'};
const SAME=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const overlap=(a,b)=>a===b||a.startsWith(b+sep)||b.startsWith(a+sep);
const PREREQUISITES={original_portfolio_run_authority:'missing',sealed_verification_command_evidence:'missing',sealed_private_evaluator_input:'unresolved',native_compatibility_authority:'missing'};
function closed(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||!SAME(Object.keys(value).sort(),[...keys].sort()))throw new Error('connected_normalization_closed_shape_required');}
function privateDirectory(path){const s=lstatSync(path);if(realpathSync(path)!==path||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o777)!==0o700)throw new Error('connected_normalization_private_directory_required');noAcl([path]);}
function read(path){const s=lstatSync(path);if(realpathSync(path)!==path||!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o777)!==0o600)throw new Error('connected_normalization_private_file_required');noAcl([path]);return readStableFile(path,'connected normalization input',33554432).bytes;}
function write(path,bytes){mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{mode:0o600,flag:'wx'});}
function parse(bytes){return parseJsonRejectDuplicateKeys(bytes.toString('utf8'));}
function publicEvaluator(task){const {reference_path,input_digest}=coreFixtureInputs(task),raw=sourceBytes(reference_path),reference=parse(raw),freezePath=reference_path.replace('evaluator-reference.json','scoring-input-freeze-manifest.json'),freezeBytes=sourceBytes(freezePath),freeze=parse(freezeBytes);if(digest(raw)!==CORE_FIXTURES[task].reference||reference.fixture_id!==task||reference.fixture_input_digest!==input_digest||digest(freezeBytes)!==ORIGINAL_FREEZE_DIGESTS[task]||freeze.fixture_id!==task||freeze.fixture_input_digest!==input_digest||freeze.evaluator_public_reference.raw_byte_digest!==digest(raw))throw new Error('connected_normalization_original_reference_changed');return {reference_path,raw,reference,freezePath,freezeBytes,freeze};}
function sourcePins(){return Object.fromEntries(['scripts/ask-core-connected-normalizer.mjs','products/ask-core-bundle/manifest.json'].map(p=>[p,digest(sourceBytes(p))]));}
function referenceBinding(original){return {path:original.reference_path,raw_digest:digest(original.raw),metadata_digest:original.reference.public_metadata_digest,evaluator_revision:original.reference.evaluator_revision,bundle_digest:original.reference.evaluator_bundle_digest,authority_manifest_path:original.reference.evaluator_authority_manifest_path,authority_manifest_raw_digest:original.reference.evaluator_authority_manifest_raw_sha256,scoring_input_freeze_path:original.freezePath,scoring_input_freeze_raw_digest:digest(original.freezeBytes)};}
function projectTrial(connection,condition,trial){
 if(!trial)return {condition,state:'not_started',reason:connection.stop??'capture_not_produced',semantic_score:null};
 const inventory=trial.after?.inputs;
 if(!inventory)return {condition,state:'terminal_snapshot_unavailable',reason:'task_inventory_unknown',semantic_score:null};
 const inspected=trial.summary.inspection,failed=connection.receipts[condition].status!=='complete_success';
 return {condition,state:failed?'failed_or_unknown':'completed_capture',reason:failed?(trial.summary.reason??'lifecycle_failure_or_unknown'):null,
  capture_digest:connection.trials[condition],session_identity_digest:inspected.session_identity_digest??null,
  turn_identity_digest:inspected.turn_identity_digest??null,usage:inspected.usage,
  started_ms:trial.started,completed_ms:trial.completed,final_output:trial.final_message,
  terminal_task_inventory:inventory,terminal_task_inventory_digest:canonicalDigest(inventory),
  command_evidence:{status:'unknown',reason:'sealed_verification_command_evidence_not_captured'},semantic_score:null};
}

/** Real connected-result contract, not a synthetic grading authority. Reads only
 * the explicitly supplied capture/preparation and their task workspaces. No
 * authentication home, runtime image, grant, grader, model or CLI is accessed. */
export function normalizeCoreConnectedResult(connectionRoot,externalDigest,outputRoot){
 const connection=replayCoreNativeConnection(connectionRoot,externalDigest);
 if(connection.status!=='offline_connected_capture_verified')throw new Error(connection.reason??'connected_normalization_capture_not_verified');
 const plan=replayCoreNativeContract(connection.preparation,connection.preparation_digest);
 const connectionBytes=read(join(connectionRoot,'connected-result.json'));
 if(digest(connectionBytes)!==externalDigest)throw new Error('connected_normalization_capture_changed');
 if(plan.status!=='offline_native_preparation_contract_verified')throw new Error('connected_normalization_preparation_not_verified');
 const original=publicEvaluator(plan.task),target=resolve(outputRoot);
 for(const path of [connectionRoot,connection.preparation,connection.request.target_root,connection.request.ledger_root,connection.paths.auth_home,connection.paths.runtime_root,...Object.values(connection.paths.workspaces),ROOT])if(overlap(target,resolve(path)))throw new Error('connected_normalization_output_overlap');
 if(realpathSync(dirname(target))!==dirname(target))throw new Error('connected_normalization_parent_link_refused');
 // Gather and verify every task byte before allocating the new evidence root.
 // after.inputs is an inventory, never permission to invent missing content.
 const snapshots={},trials={},captures={};
 for(const condition of CONDITIONS){
  if(!connection.trials[condition]){trials[condition]=projectTrial(connection,condition,null);continue;}
  const bytes=read(join(connectionRoot,`${condition}-capture.json`));
  if(digest(bytes)!==connection.trials[condition])throw new Error('connected_normalization_capture_changed');
  const trial=parse(bytes),inventory=trial.after?.inputs;
  captures[condition]=bytes;trials[condition]=projectTrial(connection,condition,trial);
  if(!inventory)continue;
  if(!SAME(Object.keys(inventory).sort(),Object.keys(plan.task_inputs).sort()))throw new Error('connected_normalization_task_inventory_changed');
  const snapshot={};
  for(const [path,record]of Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b))){
   if(!(path==='task.md'||/^workspace\/[a-zA-Z0-9._/-]+$/u.test(path))||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('connected_normalization_task_path_refused');
   const content=read(join(connection.paths.workspaces[condition],path));
   if(content.length!==record.bytes||digest(content)!==record.digest)throw new Error('connected_normalization_terminal_workspace_changed');
   snapshot[path]=content;
  }
  snapshots[condition]=snapshot;
  // Capture success is an execution outcome only. Missing command evidence
  // cannot be replaced by scope checks or an invented "passed" observation.
 }
 // Reject drift during the snapshot read rather than silently mixing epochs.
 if(replayCoreNativeConnection(connectionRoot,externalDigest).status!=='offline_connected_capture_verified')throw new Error('connected_normalization_capture_changed');
 mkdirSync(target,{mode:0o700});privateDirectory(target);
 write(join(target,'connected-source.json'),connectionBytes);
 for(const [condition,bytes]of Object.entries(captures))write(join(target,'captures',`${condition}.json`),bytes);
 for(const [condition,files]of Object.entries(snapshots))for(const [path,bytes]of Object.entries(files))write(join(target,'task-snapshots',condition,path),bytes);
 const value={kind:'ask_core_connected_normalization_v1',status:'normalized_capture_pending_evaluator_authority',
  evidence_class:connection.evidence_class,connection_digest:externalDigest,preparation_digest:connection.preparation_digest,
  execution_request_digest:canonicalDigest(connection.request),product_digest:connection.request.product_digest,
  connection_source_digests:connection.source_digests,normalizer_source_digests:sourcePins(),fixture_id:plan.task,
  fixture_input_digest:original.reference.fixture_input_digest,public_task_inventory_digest:canonicalDigest(plan.task_inputs),
  evaluator_reference:referenceBinding(original),
  execution_evaluator_digest:connection.request.evaluator_digest,order:connection.request.order,trials,
  prerequisites:PREREQUISITES,
  scoring_ready:false,native_attestation:'unknown',measured_comparison_valid:false,model_calls:0,grader_process_starts:0};
 write(join(target,'normalized-capture.json'),Buffer.from(JSON.stringify(value)+'\n'));
 return {...value,result_digest:digest(read(join(target,'normalized-capture.json'))),output_root:target};
}

/** Capsule replay reads no original capture/workspace/auth roots. External SHA
 * is mandatory; it verifies saved evidence, never issues scoring authority. */
export function replayCoreConnectedNormalization(outputRoot,externalDigest){
 try{
  const target=resolve(outputRoot);privateDirectory(target);const raw=read(join(target,'normalized-capture.json'));
  if(digest(raw)!==externalDigest)throw new Error('connected_normalization_external_digest_changed');
  const value=parse(raw),original=publicEvaluator(value.fixture_id);
  closed(value,['kind','status','evidence_class','connection_digest','preparation_digest','execution_request_digest','product_digest','connection_source_digests','normalizer_source_digests','fixture_id','fixture_input_digest','public_task_inventory_digest','evaluator_reference','execution_evaluator_digest','order','trials','prerequisites','scoring_ready','native_attestation','measured_comparison_valid','model_calls','grader_process_starts']);
  if(value.kind!=='ask_core_connected_normalization_v1'||value.status!=='normalized_capture_pending_evaluator_authority'||!['synthetic_process_only','native_capture_pending_independent_validation'].includes(value.evidence_class)||value.scoring_ready!==false||value.native_attestation!=='unknown'||value.measured_comparison_valid!==false||value.model_calls!==0||value.grader_process_starts!==0||!SAME(value.normalizer_source_digests,sourcePins())||!SAME(value.connection_source_digests,coreConnectionSources())||value.evaluator_reference.raw_digest!==digest(original.raw))throw new Error('connected_normalization_contract_changed');
  const sourceBytes=read(join(target,'connected-source.json')),source=parse(sourceBytes);
  const taskInputs=Object.fromEntries([...coreFixtureInputs(value.fixture_id).inputs].map(([p,b])=>[p,{bytes:b.length,digest:digest(b)}]));
  if(digest(sourceBytes)!==value.connection_digest||source.evidence_class!==value.evidence_class||source.request.product_digest!==value.product_digest||value.product_digest!==value.normalizer_source_digests['products/ask-core-bundle/manifest.json']||canonicalDigest(source.request)!==value.execution_request_digest||!SAME(source.source_digests,value.connection_source_digests)||!SAME(source.request.order,value.order)||!SAME(Object.keys(value.trials).sort(),[...CONDITIONS].sort())||source.preparation_digest!==value.preparation_digest||source.request.evaluator_digest!==value.execution_evaluator_digest||source.request.task_digest!==canonicalDigest(taskInputs)||value.public_task_inventory_digest!==canonicalDigest(taskInputs)||value.fixture_input_digest!==original.reference.fixture_input_digest||!SAME(value.evaluator_reference,referenceBinding(original))||!SAME(value.prerequisites,PREREQUISITES))throw new Error('connected_normalization_source_binding_changed');
  const expected=new Set(['normalized-capture.json','connected-source.json']);
  for(const condition of CONDITIONS){const trial=value.trials[condition];let capture=null;if(source.trials[condition]){const name=`captures/${condition}.json`,bytes=read(join(target,name));if(digest(bytes)!==source.trials[condition])throw new Error('connected_normalization_capture_changed');capture=parse(bytes);expected.add(name);if(!SAME(capture.before.inputs,taskInputs))throw new Error('connected_normalization_public_input_changed');}
   if(!SAME(trial,projectTrial(source,condition,capture)))throw new Error('connected_normalization_trial_projection_changed');if(!trial.terminal_task_inventory)continue;
   if(canonicalDigest(trial.terminal_task_inventory)!==trial.terminal_task_inventory_digest)throw new Error('connected_normalization_inventory_changed');
   for(const [path,record]of Object.entries(trial.terminal_task_inventory)){if(!(path==='task.md'||/^workspace\/[a-zA-Z0-9._/-]+$/u.test(path))||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('connected_normalization_task_path_refused');const name=`task-snapshots/${condition}/${path}`,bytes=read(join(target,name));if(bytes.length!==record.bytes||digest(bytes)!==record.digest)throw new Error('connected_normalization_snapshot_changed');expected.add(name);}
  }
  const actual=[];function walk(path,prefix=''){privateDirectory(path);for(const name of readdirSync(path)){const rel=prefix?`${prefix}/${name}`:name,s=lstatSync(join(path,name));if(s.isDirectory()){if(![...expected].some(p=>p.startsWith(rel+'/')))throw new Error('connected_normalization_extra_directory');walk(join(path,name),rel);}else{read(join(path,name));actual.push(rel);}}}walk(target);
  if(!SAME(actual.sort(),[...expected].sort()))throw new Error('connected_normalization_saved_inventory_changed');
  return {...value,status:'offline_connected_normalization_verified',result_digest:externalDigest};
 }catch(e){return {status:'blocked',reason:/^[a-z_]+$/u.test(e.message)?e.message:'connected_normalization_replay_refused',scoring_ready:false,model_calls:0};}
}

/** Connect the actual normalized capture to its original public sealed MN
 * reference. Private inputs are unresolved: no private root argument or reads.
 * The original source closure and treatment enum are inspected, not rewritten. */
export function connectCoreNormalizedEvaluator({outputRoot,externalDigest,frozenSourceRoot}){
 const normalized=replayCoreConnectedNormalization(outputRoot,externalDigest);
 if(normalized.status!=='offline_connected_normalization_verified')return normalized;
 try{
  const original=publicEvaluator(normalized.fixture_id),referencePath=join(ROOT,original.reference_path);
  const reference=verifyPublicEvaluatorReference({root:frozenSourceRoot,referencePath});
  const fields={catalog:'catalogPath',policy_manifest:'policyManifestPath',scoring_policy:'scoringPolicyPath',admission_record:'admissionRecordPath',requirement_record:'requirementRecordPath',output_contract:'outputContractPath',evaluator_public_reference:'referencePath'};
  const inputs=verifyPortfolioScoringInputs({root:ROOT,freezeManifestPath:join(ROOT,original.freezePath),freezeManifestSourceDigest:digest(original.freezeBytes),...Object.fromEntries(Object.entries(fields).map(([key,arg])=>[arg,join(ROOT,original.freeze[key].path)]))});
  if(!SAME(inputs.evaluatorReference,reference))throw new Error('connected_normalization_original_scoring_reference_changed');
  const schemaPath=join(frozenSourceRoot,'benchmarks/schemas/normalized-portfolio-result.schema.json');
  const schema=parse(readStableFile(schemaPath,'original public normalized schema',1048576).bytes);
  const supported=schema.properties.lineage.properties.condition.enum;
  if(!Array.isArray(supported))throw new Error('connected_normalization_original_condition_contract_unknown');
  const reasons=['original_portfolio_run_authority_missing','sealed_verification_command_evidence_missing','sealed_private_evaluator_input_unresolved','native_compatibility_authority_missing'];
  for(const condition of CONDITIONS)if(!supported.includes(condition))reasons.push(`sealed_condition_not_supported:${condition}`);
  if(normalized.execution_evaluator_digest!==reference.evaluator_bundle_digest)reasons.push('execution_evaluator_bundle_binding_mismatch');
  return {status:'blocked',reason:'original_sealed_evaluator_prerequisites_missing',reasons,
   normalized_capture_digest:externalDigest,fixture_id:normalized.fixture_id,public_reference_digest:digest(original.raw),
   evaluator_revision:reference.evaluator_revision,evaluator_bundle_digest:reference.evaluator_bundle_digest,
   original_supported_conditions:supported,public_source_status:'verified_original_source_only',
   public_scoring_input_status:'verified_original_freeze_only',scoring_input_freeze_digest:inputs.freezeManifestSourceDigest,
   sealed_private_input_status:'unresolved',scoring_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0};
 }catch(e){return {status:'blocked',reason:'original_public_evaluator_source_not_verified',scoring_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0};}
}

/** Prepare an admission review request, never an authority or trusted issuer
 * receipt. It accepts only the public/capture inputs of the existing connector. */
export function buildCoreNativeCompatibilityReview(options){
 const connection=connectCoreNormalizedEvaluator(options);
 if(connection.public_source_status!=='verified_original_source_only'||connection.public_scoring_input_status!=='verified_original_freeze_only')return connection;
 const normalized=replayCoreConnectedNormalization(options.outputRoot,options.externalDigest);
 if(normalized.status!=='offline_connected_normalization_verified')return normalized;
 return {kind:'ask_core_native_compatibility_review_request_v1',status:'pending_independent_review',
  authority_status:'not_issued',independence_status:'not_verified',issuer:null,
  normalized_capture_digest:options.externalDigest,evidence_class:normalized.evidence_class,
  connection_digest:normalized.connection_digest,preparation_digest:normalized.preparation_digest,
  execution_request_digest:normalized.execution_request_digest,product_digest:normalized.product_digest,
  fixture_id:normalized.fixture_id,fixture_input_digest:normalized.fixture_input_digest,
  public_task_inventory_digest:normalized.public_task_inventory_digest,
  evaluator_reference:normalized.evaluator_reference,execution_evaluator_digest:normalized.execution_evaluator_digest,
  order:normalized.order,conditions:Object.fromEntries(CONDITIONS.map(condition=>{const t=normalized.trials[condition];return [condition,{condition,state:t.state,capture_digest:t.capture_digest??null,terminal_task_inventory_digest:t.terminal_task_inventory_digest??null,command_evidence_status:t.command_evidence?.status??'unknown'}];})),
  missing_prerequisites:[...connection.reasons,'independent_issuer_and_trust_anchor_not_established'],
  scoring_ready:false,live_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0};
}

/** Re-derive the entire request: even a coherently rehashed caller record must
 * retain all blockers and identities. Digest matching is not issuer admission. */
export function verifyCoreNativeCompatibilityReview(options,request,externalDigest){
 const expected=buildCoreNativeCompatibilityReview(options);
 if(expected.status!=='pending_independent_review')return expected;
 if(!/^sha256:[a-f0-9]{64}$/u.test(externalDigest??'')||canonicalDigest(request)!==externalDigest||!SAME(request,expected))return {status:'blocked',reason:'native_compatibility_review_request_binding_changed',scoring_ready:false,live_ready:false,model_calls:0,grader_process_starts:0};
 return {status:'review_request_bindings_verified_not_admission',request_digest:externalDigest,authority_status:'not_issued',independence_status:'not_verified',scoring_ready:false,live_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0};
}

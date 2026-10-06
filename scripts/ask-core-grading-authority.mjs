import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync,writeFileSync,lstatSync,readFileSync,readdirSync,realpathSync,existsSync } from 'node:fs';
import { resolve,join,posix,sep } from 'node:path';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { canonicalDigest,parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { noAcl } from './ask-local-codex-boundaries.mjs';
import { verifyEvaluatorAuthority,readStableWorkspaceInventory } from './ask-benchmark-evaluator-boundary.mjs';
import { scoreEvaluatorResult,buildPortfolioEngineeringResult } from './ask-benchmark-portfolio-score.mjs';
import { resolveEffectiveAdmissionAuthority } from './ask-benchmark-admission-decision.mjs';
import { requireCoreControllerAttribution,inspectCoreControllerAttribution } from './ask-core-controller-attribution.mjs';
import { replayCoreConnectedNormalization } from './ask-core-connected-normalizer.mjs';
import { activeCoreProducer,withCoreCaptureProducer } from './ask-core-producer-scope.mjs';
import { coreProducerBuildingProfile,verifyCoreCaptureProducer } from './ask-core-capture-producer.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url))),scope=new AsyncLocalStorage();
const CONDITIONS=Object.freeze(['plain','core','full']);
const SCHEMAS=['normalized-portfolio-result','normalized-portfolio-run','evaluator-result-envelope','portfolio-engineering-result','original-workspace-authority','portfolio-terminal-workspace-authority','repository-diff-artifact','portfolio-command-evidence'];
const CALCULATION_KEYS=['freezeManifest','freezeManifestSourceDigest','catalog','policyManifest','scoringPolicy','admissionRecord','requirementRecord','outputContract','evaluatorReference'];
const INPUTS=['catalogPath','policyManifestPath','scoringPolicyPath','admissionRecordPath','requirementRecordPath','outputContractPath','scoringInputFreezeManifestPath','referencePath','privateRoot','manifestPath','resultPath','privateEvaluationRoot','privateEvaluationRecordPath','privateFragmentPath','materializedPath','selectionState','runDir','normalizedResultsPath'];
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const overlap=(a,b)=>a===b||a.startsWith(b+sep)||b.startsWith(a+sep);
function closed(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||!same(Object.keys(v).sort(),[...keys].sort()))throw new Error('core_grading_closed_contract_required');}
function read(path){const s=lstatSync(path);if(!s.isFile()||s.nlink!==1||realpathSync(path)!==path)throw new Error('core_grading_regular_file_required');return readStableFile(path,'core grading evidence',33554432).bytes;}
function privateRoot(path){const s=lstatSync(path);if(!s.isDirectory()||realpathSync(path)!==path||s.uid!==process.getuid()||(s.mode&0o777)!==0o700)throw new Error('core_grading_private_root_required');noAcl([path]);}
function privateRead(path){const s=lstatSync(path);if(s.uid!==process.getuid()||(s.mode&0o777)!==0o600)throw new Error('core_grading_private_file_required');noAcl([path]);return read(path);}
function json(bytes){return parseJsonRejectDuplicateKeys(bytes.toString('utf8'));}
function write(path,value){writeFileSync(path,Buffer.isBuffer(value)?value:JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});}
function freeze(v){if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;}
export function coreGradingSources(root=ROOT){
  const paths=new Set([...SCHEMAS.flatMap(n=>[`benchmarks/schemas/${n}.schema.json`,`benchmarks/schemas/core-${n}.schema.json`]),'scripts/ask-core-grading-authority.mjs','scripts/generate-ask-core-grading-schemas.mjs','scripts/ask-core-scored-replay.mjs','products/ask-core-bundle/manifest.json']);
  const pending=[...paths].filter(p=>p.endsWith('.mjs'));
  while(pending.length){const path=pending.pop();for(const m of read(resolve(root,path)).toString('utf8').matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)){if(isBuiltin(m[1]))continue;if(!m[1].startsWith('.'))throw new Error('core_grading_source_import_refused');const ref=posix.normalize(posix.join(posix.dirname(path),m[1]));if(ref.startsWith('../')||posix.isAbsolute(ref))throw new Error('core_grading_source_escape');if(!paths.has(ref)){paths.add(ref);if(ref.endsWith('.mjs'))pending.push(ref);}}}
  return Object.fromEntries([...paths].sort().map(p=>[p,hash(read(resolve(root,p)))]));
}
/** The original wire schema_path names identify the base contract. Only an
 * externally pinned Core provenance profile selects these explicit extensions. */
function activeProof(){const state=scope.getStore();return state?.active?state.proof:null;}
function runScope(proof,callback){const state={proof,active:true};return scope.run(state,()=>{try{const value=callback();if(value&&typeof value.then==='function')throw new Error('core_grading_async_scope_forbidden');return value;}finally{state.active=false;}});}
export function coreGradingSchemaPath(path){const producer=activeCoreProducer()||coreProducerBuildingProfile();if(!activeProof()&&!producer)return path;for(const n of SCHEMAS)if(path.endsWith(`/benchmarks/schemas/${n}.schema.json`))return producer||activeProof().controller?join(ROOT,`benchmarks/schemas/core-${n}.schema.json`):path.replace(`${n}.schema.json`,`core-${n}.schema.json`);return path;}
export function coreGradingConditions(legacy){return activeProof()||activeCoreProducer()||coreProducerBuildingProfile()?CONDITIONS:legacy;}
function inventory(path){const s=lstatSync(path);if(realpathSync(path)!==path||s.isSymbolicLink())throw new Error('core_grading_input_link_refused');if(s.isFile())return {digest:hash(read(path)),bytes:s.size};if(!s.isDirectory())throw new Error('core_grading_input_type_refused');return Object.fromEntries(readdirSync(path).sort().map(n=>[n,inventory(join(path,n))]));}
export function coreGraderInputInventory(options){const inputs=Object.fromEntries(INPUTS.filter(k=>options[k]).map(k=>[k,inventory(resolve(options[k]))]));if(options.coreCaptureProducer)inputs.coreCaptureProducer={external_digest:options.coreCaptureProducer.externalDigest,inventory:inventory(resolve(options.coreCaptureProducer.recordRoot))};return inputs;}
function inspectCapture(c){closed(c,['kind','evidence_class','condition','product_digest','fixture_id','fixture_input_digest','normalized_result_id','normalized_result_digest','terminal_workspace_tree_digest','terminal_workspace_authority_digest','terminal_workspace_authority_bytes','outcome']);if(c.kind!=='ask_core_synthetic_grading_capture_v1'||c.evidence_class!=='synthetic_fixture'||!CONDITIONS.includes(c.condition)||!['completed','failed','unavailable','interrupted','invalid'].includes(c.outcome))throw new Error('core_grading_capture_unknown_or_native');for(const key of ['product_digest','fixture_input_digest','normalized_result_digest','terminal_workspace_tree_digest','terminal_workspace_authority_digest'])if(!/^sha256:[a-f0-9]{64}$/u.test(c[key]))throw new Error('core_grading_capture_digest_required');if(!Number.isSafeInteger(c.terminal_workspace_authority_bytes)||c.terminal_workspace_authority_bytes<1)throw new Error('core_grading_terminal_workspace_required');}
function verifyAuthority(options){const a=options.coreGradingAuthority;closed(a,['path','digest','capturePath']);const raw=privateRead(resolve(a.path));if(hash(raw)!==a.digest)throw new Error('core_grading_external_authority_digest_changed');const p=json(raw);closed(p,['kind','evidence_class','capture_digest','capture','grader_input_inventory_digest','source_digests','scoring_input_freeze_source_digest','calculation_digests']);if(p.kind!=='ask_core_grading_provenance_authority_v1'||p.evidence_class!=='synthetic_fixture')throw new Error('core_grading_execution_authority_forbidden');inspectCapture(p.capture);if(!same(p.source_digests,coreGradingSources(options.root??ROOT))||p.capture.product_digest!==p.source_digests['products/ask-core-bundle/manifest.json'])throw new Error('core_grading_source_or_product_changed');const capture=privateRead(resolve(a.capturePath));if(hash(capture)!==p.capture_digest||!same(json(capture),p.capture))throw new Error('core_grading_capture_changed');if(p.scoring_input_freeze_source_digest!==options.scoringInputFreezeManifestSourceDigest||canonicalDigest(coreGraderInputInventory(options))!==p.grader_input_inventory_digest)throw new Error('core_grading_grader_input_changed');const terminal=read(join(resolve(options.runDir),'terminal-workspace.json'));const t=json(terminal);closed(t,['kind','files']);if(t.kind!=='ask_core_synthetic_terminal_workspace_v1'||!Array.isArray(t.files)||t.files.length===0||hash(terminal)!==p.capture.terminal_workspace_authority_digest||terminal.length!==p.capture.terminal_workspace_authority_bytes||canonicalDigest(t.files)!==p.capture.terminal_workspace_tree_digest)throw new Error('core_grading_terminal_workspace_changed');for(const f of t.files){closed(f,['path','bytes','digest']);if(typeof f.path!=='string'||!/^workspace\/[a-zA-Z0-9._/-]+$/u.test(f.path)||f.path.split('/').some(x=>x==='.'||x==='..'||x==='')||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^sha256:[a-f0-9]{64}$/u.test(f.digest))throw new Error('core_grading_terminal_inventory_invalid');}return freeze(p);}
function assertCaptureBinding(p,v){const c=p.capture,l=v.normalized.lineage;for(const [key,value] of Object.entries({condition:l.condition,fixture_id:l.fixture_id,fixture_input_digest:l.fixture_input_digest,normalized_result_id:v.normalized.normalized_result_id,normalized_result_digest:v.normalized.normalized_result_digest,terminal_workspace_tree_digest:l.terminal_workspace_tree_digest,terminal_workspace_authority_digest:l.terminal_workspace_authority_digest,terminal_workspace_authority_bytes:l.terminal_workspace_authority_bytes,outcome:v.normalized.outcome}))if(c[key]!==value)throw new Error('core_grading_capture_lineage_changed');if(l.terminal_workspace_authority_availability!=='captured')throw new Error('core_grading_terminal_workspace_unknown');}
/** No native admission, CLI, model, grant or permission mutation. Scope is
 * synchronous and inaccessible without an independently pinned fixture record. */
export function withCoreGradingAuthority(options,callback){if(options.coreControllerGradingContext){if(options.coreGradingAuthority)throw new Error('multiple_core_grading_authorities_refused');const run=()=>{const p=verifyControllerContext(options);return runScope(p,()=>callback(p));};return options.coreCaptureProducer?withCoreCaptureProducer(options.coreCaptureProducer,run):run();}if(!options.coreGradingAuthority)return callback();const p=verifyAuthority(options);return runScope(p,()=>callback(p));}
export function coreCalculationDigests(v){const inputs=Object.fromEntries(CALCULATION_KEYS.map(k=>[k,v.scoringInputs[k]]));return {normalized:canonicalDigest(v.normalized),result:canonicalDigest(v.result),evaluationReady:canonicalDigest(v.evaluationReady),scoringInputs:Object.fromEntries(Object.entries(inputs).map(([k,value])=>[k,canonicalDigest(value)]))};}
export function assertCoreGradingVerified(verified){const p=activeProof();if(!p&&(activeCoreProducer()||coreProducerBuildingProfile()))throw new Error('core_producer_scope_cannot_authorize_scoring');if(p){assertCaptureBinding(p,verified);if(p.controller){assertControllerVerified(p,verified);}else if(!same(coreCalculationDigests(verified),p.calculation_digests))throw new Error('core_grading_calculation_authority_changed');}return verified;}

function verifyControllerContext(options){
 const proof=requireCoreControllerAttribution(options.coreControllerGradingContext),j=proof.journal;
 if(!same(j.source_digests,coreGradingSources())||j.scoring_input_freeze_digest!==options.scoringInputFreezeManifestSourceDigest)throw new Error('controller_scoring_source_or_freeze_changed');
 if(proof.realm==='native'){
  const currentHead=execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8',timeout:1000,env:{PATH:process.env.PATH??'/usr/bin:/bin'}}).trim();
  if(currentHead!==j.git_head)throw new Error('controller_scoring_implementation_head_changed');
  const n=options.coreConnectedNormalization;closed(n,['outputRoot','externalDigest']);
  if(n.externalDigest!==j.connected_normalization_digest)throw new Error('controller_native_capture_changed');
  const capture=replayCoreConnectedNormalization(n.outputRoot,n.externalDigest),t=capture.trials?.[j.binding.condition];
  const source=json(privateRead(join(resolve(n.outputRoot),'connected-source.json')));
  if(capture.status!=='offline_connected_normalization_verified'||capture.evidence_class!=='native_capture_pending_independent_validation'||source.request.git_head!==j.git_head||source.request.source_digest!==j.connection_source_digest||capture.execution_request_digest!==j.request_digest||capture.product_digest!==j.product_digest||capture.public_task_inventory_digest!==j.public_task_inventory_digest||capture.fixture_id!==j.binding.fixture_id||capture.fixture_input_digest!==j.binding.fixture_input_digest||capture.execution_evaluator_digest!==j.evaluator_bundle_digest||t?.state!=='completed_capture'||t.capture_digest!==j.connected_capture_digest||t.terminal_task_inventory_digest!==j.connected_terminal_task_digest)throw new Error('controller_native_capture_binding_refused');
  if(!options.coreCaptureProducer)throw new Error('controller_native_producer_records_required');
  const produced=verifyCoreCaptureProducer(options.coreCaptureProducer),records=produced.records;
  if(produced.evidence_class!=='owner_attested_native_record'||produced.capture.result_digest!==j.connected_normalization_digest||produced.executionOptions.runDir!==resolve(options.runDir)||produced.executionOptions.materializedPath!==resolve(options.materializedPath)||produced.executionOptions.selectionState!==resolve(options.selectionState)||records.producer.invocation_id!==j.producer_execution_id||records.producer_record_digest!==j.producer_context_export_digest||records.reviewer.invocation_id!==proof.archive.reviewer_execution_id||records.reviewer_record_digest!==proof.archive.reviewer_context_export_digest)throw new Error('controller_native_producer_association_changed');
 }
 // Only after public sources and native capture bindings pass do we inspect
 // declared private scoring inputs. The caller still needs explicit read and
 // grader permission; an attribution token does not provide that permission.
 if(j.grader_input_inventory_digest!==canonicalDigest(coreGraderInputInventory(options)))throw new Error('controller_scoring_input_inventory_changed');
 if(proof.realm==='native'){
  const capture=replayCoreConnectedNormalization(options.coreConnectedNormalization.outputRoot,options.coreConnectedNormalization.externalDigest),t=capture.trials[j.binding.condition];
  if(!options.privateEvaluationRoot||!options.privateEvaluationRecordPath)throw new Error('controller_native_private_candidate_authority_required');
  const record=json(read(resolve(options.privateEvaluationRecordPath))),relative=record.candidate_workspace_path;
  if(record.candidate_authority?.kind!=='verified_terminal_candidate'||typeof relative!=='string'||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(n=>!n||n==='.'||n==='..'))throw new Error('controller_native_terminal_candidate_required');
  const candidate=readStableWorkspaceInventory(resolve(options.privateEvaluationRoot,relative),'controller original candidate');
  const originalFiles=Object.fromEntries(candidate.portableEntries.filter(f=>f.file_type==='file').map(f=>[f.path,{bytes:f.bytes,digest:f.sha256}]));
  const capturedFiles=Object.fromEntries(Object.entries(t.terminal_task_inventory).filter(([name])=>name.startsWith('workspace/')).map(([name,value])=>[name.slice('workspace/'.length),value]));
  if(!same(originalFiles,capturedFiles))throw new Error('controller_native_candidate_detached_from_capture');
 }
 return freeze({controller:proof,capture:{...j.binding,product_digest:j.product_digest}});
}
function assertControllerVerified(p,v){
 const j=p.controller.journal,b=j.binding,l=v.normalized.lineage;
 for(const key of ['run_instance_id','case_id','attempt'])if(b[key]!==l[key])throw new Error('controller_original_run_lineage_changed');
 if(v.result.evaluator_bundle_digest!==j.evaluator_bundle_digest||v.scoringInputs.freezeManifestSourceDigest!==j.scoring_input_freeze_digest)throw new Error('controller_original_evaluator_changed');
 if(!same(coreCalculationDigests(v),j.calculation_digests))throw new Error('controller_original_calculation_changed');
}

/** Future authorized invocation only: full original verifier once, then the
 * unchanged pure scorer once. This may run the original private verifier's
 * determinism pair; it starts no model/CLI and issues no execution permission. */
export function scoreControllerBoundCoreCapture(options,outputRoot){
 return withCoreGradingAuthority(options,p=>{
  if(!p?.controller)throw new Error('controller_scoring_context_required');
  const target=resolve(outputRoot);
  if(existsSync(target))throw new Error('controller_scoring_new_output_required');
  if(p.controller.realm==='native'&&[ROOT,resolve(options.root)].some(input=>overlap(input,target)))throw new Error('controller_scoring_output_overlap');
  for(const input of INPUTS.filter(k=>options[k]).map(k=>resolve(options[k])))if(overlap(input,target))throw new Error('controller_scoring_output_overlap');
  if(options.coreConnectedNormalization&&overlap(resolve(options.coreConnectedNormalization.outputRoot),target))throw new Error('controller_scoring_output_overlap');
  if(realpathSync(dirnameFor(target))!==dirnameFor(target))throw new Error('controller_scoring_output_parent_refused');
  const evidence=options.coreControllerAttributionEvidence;
  closed(evidence,['journalBytes','journalDigest','reviewArchiveBytes','reviewArchiveDigest','ownerAttestationBytes','ownerAttestationDigest','expectedHead','expectedSources']);
  if(!same(inspectCoreControllerAttribution(evidence),p.controller))throw new Error('controller_scoring_archive_changed');
  const savedEvidence={...evidence,journalBytes:Buffer.from(evidence.journalBytes),reviewArchiveBytes:Buffer.from(evidence.reviewArchiveBytes),ownerAttestationBytes:Buffer.from(evidence.ownerAttestationBytes),expectedSources:structuredClone(evidence.expectedSources)};
  if(!same(inspectCoreControllerAttribution(savedEvidence),p.controller))throw new Error('controller_scoring_archive_changed');
  // Remove the context option for the nested verifier; the synchronous profile
  // remains active for its entire lifetime without an extra verifier call.
  const originalOptions={...options};delete originalOptions.coreControllerGradingContext;
  const v=verifyEvaluatorAuthority(originalOptions);assertControllerVerified(p,v);
  const authority=resolveEffectiveAdmissionAuthority({frozenAdmissionRecord:v.scoringInputs.admissionRecord,requirementRecord:v.scoringInputs.requirementRecord,evaluatorReference:v.scoringInputs.evaluatorReference,root:options.root});
  const artifact=buildPortfolioEngineeringResult({...v,effectiveAdmissionAuthority:authority},{root:options.root});
  verifyControllerContext(options);
  const calculation={normalized:v.normalized,result:v.result,evaluationReady:v.evaluationReady,scoringInputs:Object.fromEntries(CALCULATION_KEYS.map(k=>[k,v.scoringInputs[k]]))};
  mkdirSync(target,{mode:0o700});privateRoot(target);
  write(join(target,'engineering-result.json'),artifact);write(join(target,'calculation.json'),calculation);
  for(const [name,key]of [['journal.json','journalBytes'],['review-archive.json','reviewArchiveBytes'],['owner-attestation.json','ownerAttestationBytes']])write(join(target,name),savedEvidence[key]);
  const record={kind:'ask_core_controller_scored_capsule_v1',evidence_class:p.controller.realm==='native'?'owner_attested_native_scoring':'synthetic_controller_scoring',condition:p.capture.condition,assurance:p.controller.assurance,journal_digest:p.controller.journal_digest,review_archive_digest:p.controller.review_archive_digest,owner_attestation_digest:p.controller.owner_attestation_digest,git_head:p.controller.journal.git_head,source_digests:p.controller.journal.source_digests,calculation_digests:coreCalculationDigests(calculation),inventory:Object.fromEntries(['engineering-result.json','calculation.json','journal.json','review-archive.json','owner-attestation.json'].map(n=>[n,hash(privateRead(join(target,n)))])),scoring_status:artifact.scoring_status,scoring_reason:artifact.scoring_reason,execution_permission:false,live_ready:false,measured_comparison_valid:false,model_calls:0};
  write(join(target,'scored-result.json'),record);
  return {...record,result_digest:hash(privateRead(join(target,'scored-result.json'))),output_root:target,artifact};
 });
}
function dirnameFor(path){return resolve(path,'..');}

/** Pure saved calculation replay, not a verifier/grader/admission rerun. */
export function replayControllerBoundCoreCapture(outputRoot,externalDigest,{root=ROOT,attributionDigests}={}){
 try{
  const target=resolve(outputRoot);privateRoot(target);const raw=privateRead(join(target,'scored-result.json'));
  if(hash(raw)!==externalDigest)throw new Error('controller_scored_external_digest_changed');
  const r=json(raw);closed(r,['kind','evidence_class','condition','assurance','journal_digest','review_archive_digest','owner_attestation_digest','git_head','source_digests','calculation_digests','inventory','scoring_status','scoring_reason','execution_permission','live_ready','measured_comparison_valid','model_calls']);
  closed(attributionDigests,['journalDigest','reviewArchiveDigest','ownerAttestationDigest']);
  for(const [key,field]of [['journalDigest','journal_digest'],['reviewArchiveDigest','review_archive_digest'],['ownerAttestationDigest','owner_attestation_digest']])if(!/^sha256:[a-f0-9]{64}$/u.test(attributionDigests[key]??'')||attributionDigests[key]!==r[field])throw new Error('controller_scored_external_attribution_changed');
  if(r.kind!=='ask_core_controller_scored_capsule_v1'||r.execution_permission!==false||r.live_ready!==false||r.measured_comparison_valid!==false||r.model_calls!==0||!same(r.source_digests,coreGradingSources()))throw new Error('controller_scored_claim_or_source_changed');
  closed(r.inventory,['engineering-result.json','calculation.json','journal.json','review-archive.json','owner-attestation.json']);
  if(!same(readdirSync(target).sort(),['scored-result.json',...Object.keys(r.inventory)].sort()))throw new Error('controller_scored_inventory_changed');
  for(const [name,sha]of Object.entries(r.inventory))if(hash(privateRead(join(target,name)))!==sha)throw new Error('controller_scored_file_changed');
  const proof=inspectCoreControllerAttribution({journalBytes:privateRead(join(target,'journal.json')),journalDigest:r.journal_digest,reviewArchiveBytes:privateRead(join(target,'review-archive.json')),reviewArchiveDigest:r.review_archive_digest,ownerAttestationBytes:privateRead(join(target,'owner-attestation.json')),ownerAttestationDigest:r.owner_attestation_digest,expectedHead:r.git_head,expectedSources:r.source_digests});
  if(r.evidence_class!==(proof.realm==='native'?'owner_attested_native_scoring':'synthetic_controller_scoring')||r.condition!==proof.journal.binding.condition||r.assurance!==proof.assurance)throw new Error('controller_scored_attribution_changed');
  const v=json(privateRead(join(target,'calculation.json')));closed(v,['normalized','result','evaluationReady','scoringInputs']);closed(v.scoringInputs,CALCULATION_KEYS);
  if(!same(coreCalculationDigests(v),r.calculation_digests))throw new Error('controller_scored_calculation_changed');
  const p={controller:proof,capture:{...proof.journal.binding,product_digest:proof.journal.product_digest}};assertCaptureBinding(p,v);assertControllerVerified(p,v);
  const authority=resolveEffectiveAdmissionAuthority({frozenAdmissionRecord:v.scoringInputs.admissionRecord,requirementRecord:v.scoringInputs.requirementRecord,evaluatorReference:v.scoringInputs.evaluatorReference,root});
  const expected=runScope(p,()=>buildPortfolioEngineeringResult({...v,effectiveAdmissionAuthority:authority},{root}));
  const actual=json(privateRead(join(target,'engineering-result.json')));
  if(!same(actual,expected)||r.scoring_status!==actual.scoring_status||r.scoring_reason!==actual.scoring_reason)throw new Error('controller_scored_calculation_changed');
  // Replay proves the pinned saved calculation only. It does not reaccept
  // owner statements or authenticate a native producer/capture afresh.
  return {...r,evidence_class:'offline_calculation_only',assurance:'saved_digest_integrity_not_reauthenticated',status:'offline_controller_scored_capture_verified',result_digest:externalDigest,grader_process_starts:0,native_origin_status:'not_reauthenticated',native_host_verification:'not_established_by_offline_replay'};
 }catch(e){return {status:'blocked',reason:/^[a-z_]+$/u.test(e.message)?e.message:'controller_scored_replay_refused',execution_permission:false,live_ready:false,model_calls:0,grader_process_starts:0};}
}

/** Persist public calculation inputs separately from capture/private roots. */
export function scoreCoreCapture(options,outputRoot){return withCoreGradingAuthority(options,p=>{if(!p)throw new Error('core_grading_authority_required');const target=resolve(outputRoot);for(const input of INPUTS.filter(k=>options[k]).map(k=>resolve(options[k])))if(overlap(input,target))throw new Error('core_grading_output_overlap');if(overlap(resolve(options.coreGradingAuthority.path),target)||overlap(resolve(options.coreGradingAuthority.capturePath),target))throw new Error('core_grading_output_overlap');if(realpathSync(resolve(target,'..'))!==resolve(target,'..'))throw new Error('core_grading_output_parent_link_refused');mkdirSync(target,{mode:0o700});privateRoot(target);const verified=verifyEvaluatorAuthority(options);assertCaptureBinding(p,verified);const scored=scoreEvaluatorResult({...options,outputPath:join(target,'engineering-result.json')});const scoringInputs=Object.fromEntries(CALCULATION_KEYS.map(k=>[k,verified.scoringInputs[k]]));const calculation={normalized:verified.normalized,result:verified.result,evaluationReady:verified.evaluationReady,scoringInputs};write(join(target,'calculation.json'),calculation);verifyAuthority(options);write(join(target,'provenance.json'),privateRead(resolve(options.coreGradingAuthority.path)));const result={kind:'ask_core_scored_offline_capsule_v1',evidence_class:'synthetic_scoring_fixture',condition:p.capture.condition,product_digest:p.capture.product_digest,capture_digest:p.capture_digest,authority_digest:options.coreGradingAuthority.digest,source_digests:p.source_digests,inventory:Object.fromEntries(['engineering-result.json','calculation.json','provenance.json'].map(n=>[n,hash(read(join(target,n)))])),scoring_status:scored.artifact.scoring_status,scoring_reason:scored.artifact.scoring_reason,native_admission:false,live_ready:false,measured_comparison_valid:false,model_calls:0,grader_process_starts:0};write(join(target,'scored-result.json'),result);return {...result,result_digest:hash(privateRead(join(target,'scored-result.json'))),output_root:target,artifact:scored.artifact};});}

/** Offline: only the capsule and current public source/schema bytes are read. */
export function replayCoreScoredCapture(outputRoot,externalDigest,{root=ROOT}={}){try{const target=resolve(outputRoot);privateRoot(target);const bytes=privateRead(join(target,'scored-result.json'));if(hash(bytes)!==externalDigest)throw new Error('core_scored_external_digest_changed');const r=json(bytes);closed(r,['kind','evidence_class','condition','product_digest','capture_digest','authority_digest','source_digests','inventory','scoring_status','scoring_reason','native_admission','live_ready','measured_comparison_valid','model_calls','grader_process_starts']);if(r.kind!=='ask_core_scored_offline_capsule_v1'||r.evidence_class!=='synthetic_scoring_fixture'||r.native_admission!==false||r.live_ready!==false||r.measured_comparison_valid!==false||r.model_calls!==0||r.grader_process_starts!==0||!same(r.source_digests,coreGradingSources(root)))throw new Error('core_scored_claim_or_source_changed');closed(r.inventory,['engineering-result.json','calculation.json','provenance.json']);if(!same(readdirSync(target).sort(),['scored-result.json',...Object.keys(r.inventory)].sort()))throw new Error('core_scored_inventory_changed');for(const [n,d]of Object.entries(r.inventory))if(hash(read(join(target,n)))!==d)throw new Error('core_scored_file_changed');const provenanceBytes=privateRead(join(target,'provenance.json'));if(hash(provenanceBytes)!==r.authority_digest)throw new Error('core_scored_authority_digest_changed');const p=json(provenanceBytes);closed(p,['kind','evidence_class','capture_digest','capture','grader_input_inventory_digest','source_digests','scoring_input_freeze_source_digest','calculation_digests']);inspectCapture(p.capture);if(p.kind!=='ask_core_grading_provenance_authority_v1'||p.evidence_class!=='synthetic_fixture'||!same(p.source_digests,r.source_digests)||r.condition!==p.capture.condition||r.product_digest!==p.capture.product_digest||r.capture_digest!==p.capture_digest)throw new Error('core_scored_provenance_changed');const v=json(privateRead(join(target,'calculation.json')));closed(v,['normalized','result','evaluationReady','scoringInputs']);closed(v.scoringInputs,CALCULATION_KEYS);assertCaptureBinding(p,v);if(!same(coreCalculationDigests(v),p.calculation_digests))throw new Error('core_scored_calculation_authority_changed');const authority=resolveEffectiveAdmissionAuthority({frozenAdmissionRecord:v.scoringInputs.admissionRecord,requirementRecord:v.scoringInputs.requirementRecord,evaluatorReference:v.scoringInputs.evaluatorReference,root});const actual=json(read(join(target,'engineering-result.json')));const expected=runScope(p,()=>buildPortfolioEngineeringResult({...v,effectiveAdmissionAuthority:authority},{root}));if(!same(actual,expected)||r.scoring_status!==actual.scoring_status||r.scoring_reason!==actual.scoring_reason)throw new Error('core_scored_calculation_changed');return {...r,status:'offline_scored_capture_verified',result_digest:externalDigest,native_attestation:'unknown'};}catch(e){return {status:'blocked',reason:/^[a-z_]+$/u.test(e.message)?e.message:'core_scored_replay_refused',live_ready:false,model_calls:0};}}

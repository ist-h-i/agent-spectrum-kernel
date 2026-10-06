import { join } from 'node:path';
import { buildCoreNativeCompatibilityReview } from './ask-core-connected-normalizer.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { canonicalDigest,parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { digest,sourceBytes } from './ask-core-bundle-product.mjs';

const CONDITIONS=['plain','core','full'],SHA=/^sha256:[a-f0-9]{64}$/u,HEAD=/^[a-f0-9]{40}$/u,ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const SOURCES=['scripts/ask-core-native-compatibility-provenance.mjs','benchmarks/schemas/core-native-compatibility-provenance.schema.json'];
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const stopped=reason=>({status:'blocked',reason,binding_status:'invalid',authority_status:'not_issued',independence_status:'not_verified',scoring_ready:false,live_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0});
function need(ok){if(!ok)throw new Error('native_compatibility_provenance_binding_refused');}
function closed(value,keys){need(value!==null&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort()));}
function identifier(value){need(typeof value==='string'&&ID.test(value));}
function sha(value){need(typeof value==='string'&&SHA.test(value));}

/** Pure consistency inspection only. Supplied request/IDs are untrusted; this
 * function cannot establish capture origin or reviewer independence. */
export function inspectCoreNativeProvenanceRecords(request,evidence,expectedHead){
 try{
  need(request?.kind==='ask_core_native_compatibility_review_request_v1'&&request.status==='pending_independent_review');
  need(HEAD.test(expectedHead??''));
  closed(evidence,['run','materialization','selection','commands','archive_bytes','archive_digest']);
  const {run,materialization,selection,commands}=evidence;
  closed(run,['run_id','case_id','attempt_id','git_head','producer_execution_id','source_digest','product_digest','task_digest','request_digest']);
  for(const key of ['run_id','case_id','attempt_id','producer_execution_id'])identifier(run[key]);
  for(const key of ['source_digest','product_digest','task_digest','request_digest'])sha(run[key]);
  need(run.git_head===expectedHead&&run.product_digest===request.product_digest&&run.task_digest===request.public_task_inventory_digest&&run.request_digest===request.execution_request_digest);
  closed(materialization,['run_id','case_id','attempt_id','task_digest','conditions']);
  closed(selection,['run_id','case_id','attempt_id','materialization_digest','order']);
  for(const record of [materialization,selection])for(const key of ['run_id','case_id','attempt_id'])need(record[key]===run[key]);
  need(materialization.task_digest===run.task_digest&&same(materialization.conditions,CONDITIONS)&&same(selection.order,request.order)&&selection.materialization_digest===canonicalDigest(materialization));
  closed(commands,CONDITIONS);
  const reasons=[...request.missing_prerequisites,'trusted_controller_execution_identity_unavailable'];
  for(const condition of CONDITIONS){
   const record=commands[condition],trial=request.conditions[condition];
   closed(record,['run_id','case_id','attempt_id','condition','capture_digest','terminal_task_inventory_digest','command_evidence_status']);
   for(const key of ['run_id','case_id','attempt_id'])need(record[key]===run[key]);
   need(trial.condition===condition&&record.condition===condition&&record.capture_digest===trial.capture_digest&&record.terminal_task_inventory_digest===trial.terminal_task_inventory_digest&&record.command_evidence_status===trial.command_evidence_status);
   need(['unknown','failed','not_started','verified'].includes(record.command_evidence_status));
   if(trial.state!=='completed_capture')reasons.push(`capture_not_complete:${condition}`);
   if(record.command_evidence_status!=='verified')reasons.push(`sealed_command_not_verified:${condition}`);
  }
  need(Buffer.isBuffer(evidence.archive_bytes)&&evidence.archive_bytes.length>0&&evidence.archive_bytes.length<=1048576);
  sha(evidence.archive_digest);need(digest(evidence.archive_bytes)===evidence.archive_digest);
  const archive=parseJsonRejectDuplicateKeys(evidence.archive_bytes.toString('utf8'));
  closed(archive,['kind','git_head','producer_execution_id','reviewer_execution_id','reviewer_type','author_self_approval','status','blocking_findings','review_request_digest','run_digest','materialization_digest','selection_digest','commands_digest']);
  identifier(archive.reviewer_execution_id);need(archive.producer_execution_id===run.producer_execution_id&&archive.reviewer_execution_id!==run.producer_execution_id);
  need(archive.kind==='ask_core_supplied_review_archive_v1'&&archive.git_head===expectedHead&&['independent_agent','independent_human','independent_panel'].includes(archive.reviewer_type)&&archive.author_self_approval===false&&archive.status==='approved'&&archive.blocking_findings===0);
  need(archive.review_request_digest===canonicalDigest(request)&&archive.run_digest===canonicalDigest(run)&&archive.materialization_digest===canonicalDigest(materialization)&&archive.selection_digest===canonicalDigest(selection)&&archive.commands_digest===canonicalDigest(commands));
  return {kind:'ask_core_native_compatibility_provenance_v1',status:'blocked',reason:'trusted_controller_execution_identity_unavailable',binding_status:'supplied_records_consistent_not_authenticated',authority_status:'not_issued',independence_status:'not_verified',git_head:expectedHead,producer_execution_id:run.producer_execution_id,reviewer_execution_id:archive.reviewer_execution_id,review_request_digest:canonicalDigest(request),review_archive_digest:evidence.archive_digest,run_digest:canonicalDigest(run),materialization_digest:canonicalDigest(materialization),selection_digest:canonicalDigest(selection),commands_digest:canonicalDigest(commands),missing_prerequisites:[...new Set(reasons)],scoring_ready:false,live_ready:false,native_attestation:'unknown',model_calls:0,grader_process_starts:0};
 }catch{return stopped('native_compatibility_provenance_binding_refused');}
}

/** Replays actual connected capsules and original public sealed references.
 * The captured source digest/HEAD are bound separately from supplied records. */
export function buildCoreNativeCompatibilityProvenance(options,evidence){
 try{
  const request=buildCoreNativeCompatibilityReview(options);
  if(request.status!=='pending_independent_review')return request;
  const raw=readStableFile(join(options.outputRoot,'connected-source.json'),'saved connected header',1048576).bytes;
  need(digest(raw)===request.connection_digest);
  const connection=parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  need(connection.request.git_head===options.expectedHead&&evidence.run.source_digest===connection.request.source_digest);
  const result=inspectCoreNativeProvenanceRecords(request,evidence,options.expectedHead);
  if(result.binding_status==='invalid')return result;
  return {...result,binding_status:'saved_capture_and_supplied_record_bindings_verified_not_admission',source_digests:Object.fromEntries(SOURCES.map(path=>[path,digest(sourceBytes(path))]))};
 }catch{return stopped('native_compatibility_provenance_binding_refused');}
}

export function verifyCoreNativeCompatibilityProvenance(options,evidence,candidate,externalDigest){
 try{
  const expected=buildCoreNativeCompatibilityProvenance(options,evidence);
  need(expected.binding_status==='saved_capture_and_supplied_record_bindings_verified_not_admission');
  sha(externalDigest);need(canonicalDigest(candidate)===externalDigest&&same(candidate,expected));
  return expected;
 }catch{return stopped('native_compatibility_provenance_candidate_changed');}
}

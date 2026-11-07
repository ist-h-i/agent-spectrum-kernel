// Durable host port only. This module never dispatches an app/model or Eval.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {validateInstructionEnvironmentAuthoringResponse} from './instruction-environment-authoring.mjs';
import {assertPublicInstructionSummary} from './instruction-loop-feedback.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
const keys=(v,k)=>assert.deepEqual(Object.keys(v).sort(),[...k].sort());
const file=(p,name)=>join(p.stateRoot,'host-authoring-'+name+'.json');
const save=(path,artifact)=>writeCanonicalJsonNoReplace({outputPath:path,artifact,label:'host authoring',maximumBytes:16*1024*1024});
function read(p,name){const path=file(p,name);assertNoSymlinkPathSegments(path,'host authoring',{allowMissingLeaf:true});return existsSync(path)?readJsonFileStrict(path,'host authoring',16*1024*1024):null;}
function prepared(p,job,{root,preparedHandoffDigest}){
  assert.equal(p.candidate?.authoring?.provider.kind,'external_host');assert.equal(job.kind,'generate');
  const h=read(p,'prepared');if(!h)return null;
  assert.equal(h.kind,'component_host_authoring_preparation_v1');assert.equal(h.job_digest,canonicalDigest(job),'host authoring job drift');
  assert.equal(h.profile_digest,canonicalDigest(p),'host authoring profile drift');
  const {state}=readRunJournal(root);assert.equal(canonicalDigest(state.pending),canonicalDigest(job),'host authoring is not the exact pending job');
  assert.equal(state.authoring_progress?.handoff_digest??preparedHandoffDigest,canonicalDigest(h),'host authoring checkpoint differs from published journal handoff or completed preparation receipt');return h;
}
function progress(context){return readRunJournal(context.root).state.authoring_progress;}
function pinnedClaim(context,c){const expected=progress(context)?.claim_digest;if(expected){assert.ok(c,'published host claim missing; never claim again');assert.equal(canonicalDigest(c),expected,'published host claim drift');}}
function pending(h,claim){return {kind:'component_authoring_pending_v1',handoff_digest:canonicalDigest(h),request_object_digest:h.request.request_object_digest,
  completion_state:claim?'claimed_completion_unknown':'awaiting_claim',claim_digest:claim?canonicalDigest(claim):null,execution_id:claim?.execution_id??null,models_started_by_runtime:false};}
export function prepareHostInstructionAuthoring(p,job,continuation){
  const h={kind:'component_host_authoring_preparation_v1',job_digest:canonicalDigest(job),profile_digest:canonicalDigest(p),...continuation};
  save(file(p,'prepared'),h);return pending(h,null);
}
function validatedClaim(h,c){
  keys(c,['handoff_digest','execution_id','provider','evidence_kind']);assert.equal(c.handoff_digest,canonicalDigest(h),'host handoff mismatch');
  for(const k of ['execution_id','provider'])assert.match(c[k],/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u);
  assert.ok(['synthetic','host_reported'].includes(c.evidence_kind));return c;
}
function validatedCompletion(h,c,s){
  keys(s,['handoff_digest','claim_digest','response','closure']);assert.equal(s.handoff_digest,canonicalDigest(h),'host handoff mismatch');
  assert.equal(s.claim_digest,canonicalDigest(c),'host authoring claim mismatch');
  keys(s.closure,['status','termination_confirmed','evidence_ref']);assert.equal(s.closure.status,'completed');assert.equal(s.closure.termination_confirmed,true,'host completion closure unknown');
  assert.ok(typeof s.closure.evidence_ref==='string'&&s.closure.evidence_ref.length>0&&s.closure.evidence_ref.length<=1024);assertPublicInstructionSummary(s.closure.evidence_ref);
  validateInstructionEnvironmentAuthoringResponse({...h.authoring,requestObjectDigest:h.request.request_object_digest,response:s.response});return s;
}
export function inspectHostInstructionAuthoring(p,job,context){
  const h=prepared(p,job,context);if(!h)return null;
  const c=read(p,'claim'),s=read(p,'completion');pinnedClaim(context,c);if(c)validatedClaim(h,c);
  const expected=progress(context)?.completion_digest;if(expected){assert.ok(s,'published host completion missing');assert.equal(canonicalDigest(s),expected,'published host completion drift');}
  if(s){assert.ok(c,'host completion without claim');validatedCompletion(h,c,s);}
  return {prepared:h,claim:c,completion:s,pending:pending(h,c)};
}
export function readHostInstructionAuthoringRequest(p,job,context){
  const inspected=inspectHostInstructionAuthoring(p,job,context),h=inspected?.prepared;assert.ok(h,'host authoring request unavailable');
  return {kind:'component_host_authoring_request_v1',handoff_digest:canonicalDigest(h),generation_input:h.request.generation_input,
    existing_claim:inspected.claim,models_started_by_runtime:false,execution_permission:'host_owned_not_granted_by_request'};
}
export function claimHostInstructionAuthoring(p,job,c,{modelCallsAuthorized=false,...context}={}){
  const h=prepared(p,job,context);assert.ok(h,'host authoring request unavailable');validatedClaim(h,c);
  if(c.evidence_kind==='host_reported')assert.equal(modelCallsAuthorized,true,'external host model calls not authorized');
  const old=read(p,'claim');pinnedClaim(context,old);if(old)assert.equal(canonicalDigest(old),canonicalDigest(c),'host authoring already claimed; inspect the existing execution');
  const publication=save(file(p,'claim'),c);
  return {status:'claimed',claim_digest:canonicalDigest(c),claim_created:publication.created,models_started_by_runtime:false,
    repeated_claim_requires_existing_execution_inspection:true};
}
export function completeHostInstructionAuthoring(p,job,s,context){
  const h=prepared(p,job,context),c=read(p,'claim');assert.ok(h&&c,'host authoring must be claimed first');validatedClaim(h,c);validatedCompletion(h,c,s);
  pinnedClaim(context,c);const expected=progress(context)?.completion_digest;
  if(expected){const old=read(p,'completion');assert.ok(old,'published host completion missing');assert.equal(canonicalDigest(s),expected,'published host completion conflict');assert.equal(canonicalDigest(old),expected,'published host completion drift');}
  save(file(p,'completion'),s);return {status:'completion_recorded',completion_digest:canonicalDigest(s),models_started_by_runtime:false};
}

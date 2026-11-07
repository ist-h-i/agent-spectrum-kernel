// Optional external-host adapter. No provider dispatch, candidate execution or owner mutation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,assertNoSymlinkPathSegments,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import {readInstructionLoopJson as read,readInstructionLoopBytes as bytes,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES as maximumBytes} from './instruction-loop-artifact.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const names=['instruction-loop-host-scoring.mjs','instruction-loop-artifact.mjs','content-addressed-store.mjs','instruction-run-journal.mjs'];
const pin=path=>({path,digest:hash(bytes(path))});
const save=(outputPath,artifact)=>writeCanonicalJsonNoReplace({outputPath,artifact,label:'host reference scoring',maximumBytes});
const keys=(v,k)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...k].sort());};
const verify=p=>{assert.equal(resolve(p.path),p.path);assertNoSymlinkPathSegments(p.path,'host scoring input');assert.equal(hash(bytes(p.path)),p.digest,'host scoring input drift');};
const checked=p=>{verify(p);return read(p.path);};
function settingsFor(protectedRoot,evidenceKind,parent=null){
 assert.equal(resolve(protectedRoot),protectedRoot);assertNoSymlinkPathSegments(protectedRoot,'host grading root',{allowMissingLeaf:true});assert.ok(['synthetic','host_reported'].includes(evidenceKind));
 return {kind:'host_reference_scoring_settings_v1',protected_root:protectedRoot,evidence_kind:evidenceKind,sources:names.map(n=>pin(join(import.meta.dirname,n))),...(parent?{parent}: {})};
}
export function createInlineHostReferenceScoringCommand({protectedRoot,evidenceKind='host_reported',parent=null}){
 const settings=settingsFor(protectedRoot,evidenceKind,parent),prefix=[process.execPath,join(import.meta.dirname,names[0]),'worker-inline',JSON.stringify(settings),canonicalDigest(settings)];
 return {argv:[...prefix,'execute'],inspect_argv:[...prefix,'inspect'],pins:settings.sources,model_calls:evidenceKind==='host_reported'};
}
function settingsValue(binding){const value=binding.inline??checked(binding);assert.equal(value.kind,'host_reference_scoring_settings_v1');for(const p of value.sources)verify(p);return value;}
export function createHostReferenceScoringCommand({settingsPath,protectedRoot,evidenceKind='host_reported'}){
 settingsPath=resolve(settingsPath);assert.equal(resolve(protectedRoot),protectedRoot);assertNoSymlinkPathSegments(protectedRoot,'host grading root');
 assert.ok(settingsPath.startsWith(protectedRoot+'/'),'settings outside protected root');assert.ok(['synthetic','host_reported'].includes(evidenceKind));
 const settings=settingsFor(protectedRoot,evidenceKind);
 save(settingsPath,settings);const p=pin(settingsPath),prefix=[process.execPath,join(import.meta.dirname,names[0]),'worker',settingsPath,p.digest];
 return {argv:[...prefix,'execute'],inspect_argv:[...prefix,'inspect'],pins:[p,...settings.sources],model_calls:evidenceKind==='host_reported'};
}
function context(directory){
 assert.equal(resolve(directory),directory);assertNoSymlinkPathSegments(directory,'host scoring job');
 const job=read(join(directory,'request.json'));assert.equal(job.kind,'grade');assert.equal(basename(directory),canonicalDigest(job).slice(7),'host scoring job transplant');
 const root=join(directory,'host-scoring');assertNoSymlinkPathSegments(root,'host scoring handoff');
 const {state}=readRunJournal(root);assert.ok(state,'host scoring preparation missing');
 assert.equal(state.kind,'host_reference_scoring_state_v1');assert.equal(state.handoff.job_digest,canonicalDigest(job));
 const settings=settingsValue(state.handoff.settings);
 assert.ok(directory.startsWith(settings.protected_root+'/'),'job outside protected grading root');
 for(const p of settings.sources)verify(p);
 assert.equal(state.handoff.evidence_kind,settings.evidence_kind);const h=canonicalDigest(state.handoff);
 const load=name=>{const path=join(root,name+'.json');assertNoSymlinkPathSegments(path,'host scoring receipt',{allowMissingLeaf:true});return existsSync(path)?read(path):null;};
 const claim=load('claim'),completion=load('completion');
 for(const [kind,value] of [['claim',claim],['completion',completion]])if(state[kind+'_digest']){assert.ok(value,'checkpointed host '+kind+' missing');assert.equal(canonicalDigest(value),state[kind+'_digest'],'checkpointed host '+kind+' drift');}
 let parentState=null;
 if(settings.parent){const parent=settings.parent;assert.equal(resolve(parent.root),parent.root);assertNoSymlinkPathSegments(parent.root,'host scoring parent');parentState=readRunJournal(parent.root).state;
  assert.ok(parentState?.pending?.kind==='report','exact parent report is not pending');assert.equal(canonicalDigest(parentState.pending),parent.report_job_digest,'parent pending report transplant');assert.equal(job.input.source_report_job_digest,parent.report_job_digest);
  const progress=parentState.reference_scoring_progress;if(progress){assert.equal(progress.job_digest,canonicalDigest(job));assert.equal(progress.handoff_digest,h,'parent host scoring handoff drift');
   if(progress.claim_digest){assert.ok(claim,'parent checkpointed claim missing');assert.equal(progress.claim_digest,canonicalDigest(claim),'parent checkpointed claim drift');}
   if(progress.completion_digest){assert.ok(completion,'parent checkpointed completion missing');assert.equal(progress.completion_digest,canonicalDigest(completion),'parent checkpointed completion drift');}}
 }
 return {directory,root,job,state,settings,h,claim,completion,parentState};
}
function validateClaim(c,value){
 keys(value,['handoff_digest','execution_id','provider','evidence_kind']);assert.equal(value.handoff_digest,c.h);assert.equal(value.evidence_kind,c.settings.evidence_kind);
 for(const k of ['execution_id','provider'])assert.match(value[k],/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u);
 return value;
}
function refs(value){assert.ok(Array.isArray(value)&&value.length<=256,'bounded reference list required');for(const p of value){keys(p,['path','digest']);assert.match(p.digest,/^sha256:[a-f0-9]{64}$/u);assert.equal(resolve(p.path),p.path);}return value;}
function validateCompletion(c,value){
 assert.ok(c.claim,'host scoring must be claimed first');validateClaim(c,c.claim);
 keys(value,['handoff_digest','claim_digest','status','fixed_point_assessments','reference_assessments','closure']);assert.equal(value.handoff_digest,c.h);assert.equal(value.claim_digest,canonicalDigest(c.claim),'host scoring claim mismatch');
 assert.ok(['completed','failed'].includes(value.status));keys(value.closure,['status','termination_confirmed','evidence_ref']);assert.equal(value.closure.status,value.status);assert.equal(value.closure.termination_confirmed,true,'host scoring closure unknown');
 assert.ok(typeof value.closure.evidence_ref==='string'&&value.closure.evidence_ref.length>0&&value.closure.evidence_ref.length<=1024);
 refs(value.fixed_point_assessments);refs(value.reference_assessments);if(value.status==='failed')assert.equal(value.fixed_point_assessments.length+value.reference_assessments.length,0,'failed grading cannot donate quality');
 return value;
}
export function readHostReferenceScoringRequest(directory){
 const c=context(directory);if(c.claim)validateClaim(c,c.claim);if(c.completion)validateCompletion(c,c.completion);
 return {kind:'host_reference_scoring_request_v1',handoff_digest:c.h,handoff:c.state.handoff,grade_job_digest:canonicalDigest(c.job),job_ref:pin(join(directory,'request.json')),existing_claim:c.claim,completion_recorded:Boolean(c.completion),completion_digest:c.completion?canonicalDigest(c.completion):null,models_started_by_runtime:false,
  execution_permission:'request_grants_none; real claim also requires the original runtime grant and explicit host model grant',judge_scope:'host mediator only; prepare isolated anonymous packets for judges'};
}
export function claimHostReferenceScoring(directory,value,{modelCallsAuthorized=false}={}){
 const first=context(directory),unlock=lockRunJournal(first.root);
 try{const c=context(directory);validateClaim(c,value);if(value.evidence_kind==='host_reported')assert.ok(c.state.handoff.model_calls_authorized&&modelCallsAuthorized,'host scoring model calls not authorized');
  if(c.claim)assert.equal(canonicalDigest(c.claim),canonicalDigest(value),'host scoring already claimed; inspect existing execution');
  const publication=save(join(c.root,'claim.json'),value);c.state.claim_digest=canonicalDigest(value);appendRunJournal(c.root,'host_scoring_claimed',c.state);
  return {status:'claimed',claim_digest:canonicalDigest(value),claim_created:publication.created,models_started_by_runtime:false,repeated_claim_requires_existing_execution_inspection:true};
 }finally{unlock();}
}
export function completeHostReferenceScoring(directory,value){
 const first=context(directory),unlock=lockRunJournal(first.root);
 try{const c=context(directory);validateCompletion(c,value);if(c.completion)assert.equal(canonicalDigest(c.completion),canonicalDigest(value),'host scoring completion conflict');
  save(join(c.root,'completion.json'),value);c.state.completion_digest=canonicalDigest(value);appendRunJournal(c.root,'host_scoring_completed',c.state);
  return {status:'completion_recorded',completion_digest:canonicalDigest(value),models_started_by_runtime:false};
 }finally{unlock();}
}
export function runHostReferenceScoringWorker({settingsPath,settingsDigest,inline=false,action,requestPath,resultPath}){
 assert.ok(['execute','inspect'].includes(action));const binding=inline?{inline:JSON.parse(settingsPath)}:{path:settingsPath,digest:settingsDigest};if(inline)assert.equal(canonicalDigest(binding.inline),settingsDigest);const settings=settingsValue(binding);
 assert.equal(basename(requestPath),'request.json');assert.equal(basename(resultPath),'result.json');assert.equal(dirname(requestPath),dirname(resultPath));const directory=dirname(requestPath);
 assert.equal(resolve(directory),directory);assert.ok(directory.startsWith(settings.protected_root+'/'));assertNoSymlinkPathSegments(directory,'host scoring job');
 const job=read(requestPath);assert.equal(job.kind,'grade');assert.equal(basename(directory),canonicalDigest(job).slice(7));const root=join(directory,'host-scoring');
 if(action==='execute'&&!existsSync(root)){
  const authorized=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED==='1';assert.ok(settings.evidence_kind==='synthetic'||authorized,'host scoring runtime model calls not authorized');
  mkdirSync(root,{mode:0o700});const handoff={kind:'host_reference_scoring_handoff_v1',job_digest:canonicalDigest(job),settings:binding,evidence_kind:settings.evidence_kind,model_calls_authorized:authorized};
  appendRunJournal(root,'host_scoring_prepared',{kind:'host_reference_scoring_state_v1',handoff,claim_digest:null,completion_digest:null});
 }
 if(!existsSync(root))return null;const result=inspectHostReferenceScoringResult(directory,binding);if(result)save(resultPath,result);return result;
}
export function inspectHostReferenceScoringResult(directory,binding){
 const c=context(directory);assert.equal(canonicalDigest(c.state.handoff.settings),canonicalDigest(binding),'host scoring settings transplant');if(!c.completion||c.parentState&&!c.parentState.reference_scoring_progress?.completion_digest)return null;validateCompletion(c,c.completion);
 return {request_digest:canonicalDigest(c.job),status:c.completion.status,output:{fixed_point_assessments:c.completion.fixed_point_assessments,reference_assessments:c.completion.reference_assessments,
  ready_for_next_root:true,host_claim_digest:canonicalDigest(c.claim),host_completion_digest:canonicalDigest(c.completion),closure_evidence_kind:c.settings.evidence_kind,provider_authentication_verified:false,resources:null}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [mode,settingsPath,settingsDigest,action,requestPath,resultPath]=process.argv.slice(2);assert.ok(['worker','worker-inline'].includes(mode));runHostReferenceScoringWorker({settingsPath,settingsDigest,inline:mode==='worker-inline',action,requestPath,resultPath});}
 catch(error){console.error(String(error.message));process.exitCode=1;}
}

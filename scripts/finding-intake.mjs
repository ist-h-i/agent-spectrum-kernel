#!/usr/bin/env node
// Project-local observations, not approval or automatically confirmed rules.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync,realpathSync,readFileSync,readSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalDigest,assertNoSymlinkPathSegments,readJsonFileStrict,writeCanonicalJsonNoReplace,parseJsonRejectDuplicateKeys} from './content-addressed-store.mjs';
import {assertPublicInstructionSummary,buildInstructionLoopFeedback} from './instruction-loop-feedback.mjs';
import {buildPersonalEvolutionObservation} from './ask-personal-evolution-observation.mjs';
const MAX=32768, DIGEST=/^sha256:[a-f0-9]{64}$/u;
const fields=(v,ks)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...ks].sort(),'missing or unsupported fields');};
const id=v=>{assertPublicInstructionSummary(v);assert.ok(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u.test(v),'bounded identifier required');};
const text=v=>{assertPublicInstructionSummary(v);assert.ok(v.length<=2048,'summary too long');};
// Resolve the caller-selected project root (including macOS /var aliases);
// symlinks inside the private store remain forbidden.
const store=project=>join(realpathSync(resolve(project)),'.agent-spectrum-kernel','findings');
function safeDir(path){assertNoSymlinkPathSegments(path,'finding directory',{allowMissingLeaf:true});mkdirSync(path,{recursive:true,mode:0o700});assertNoSymlinkPathSegments(path,'finding directory');}
function config(project){
 const root=store(project),file=join(root,'config.json');
 assertNoSymlinkPathSegments(root,'finding directory',{allowMissingLeaf:true});
 if(!existsSync(file))throw new Error('finding intake is not enabled for this project');
 const value=readJsonFileStrict(file,'finding config',MAX);fields(value,['kind','repository_id']);
 assert.equal(value.kind,'ask_finding_intake_v1');id(value.repository_id);return value;
}
export function initializeFindingIntake(project,repositoryId){
 id(repositoryId);
 const root=store(project),value={kind:'ask_finding_intake_v1',repository_id:repositoryId};
 safeDir(root);safeDir(join(root,'events'));
 const file=join(root,'config.json');
 assert.ok(!existsSync(join(root,'config.disabled.json')),'finding intake is disabled; restore its config explicitly to resume');
 if(existsSync(file)){assert.deepEqual(config(project),value,'already enabled for a different project');return value;}
 // Local observations are not source assets and must not leak through git add.
 const ignore=join(root,'.gitignore');assertNoSymlinkPathSegments(ignore,'finding ignore',{allowMissingLeaf:true});
 if(!existsSync(ignore))writeFileSync(ignore,'*\n',{flag:'wx',mode:0o600});
 else assert.equal(readFileSync(ignore,'utf8'),'*\n','unexpected finding ignore contents');
 writeCanonicalJsonNoReplace({outputPath:file,artifact:value,label:'finding config',maximumBytes:MAX});return value;
}
function validateEvent(event){
 fields(event,['task_id','source','occurred_at','summary','evidence_status','disposition','related_to','supersedes']);id(event.task_id);assert.ok(event.occurred_at===null||(typeof event.occurred_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(event.occurred_at)&&Number.isFinite(Date.parse(event.occurred_at))),'source timestamp or null required');
 fields(event.source,['kind','id','item_id']);assert.ok(['task_observation','user_comment','ai_review'].includes(event.source.kind));id(event.source.id);id(event.source.item_id);text(event.summary);
 assert.ok(['Verified','Supported','Hypothesis','Unknown','Falsified'].includes(event.evidence_status));
 assert.ok(['open','resolved','disputed','withdrawn'].includes(event.disposition));
 assert.ok(Array.isArray(event.related_to)&&event.related_to.length<=16&&new Set(event.related_to).size===event.related_to.length);
 for(const ref of event.related_to)assert.match(ref,DIGEST);
 assert.ok(event.supersedes===null||DIGEST.test(event.supersedes),'supersedes must be a prior event ID or null');
}
function eventBody(repositoryId,event){
 validateEvent(event);
 return {kind:'ask_finding_event_v1',repository_id:repositoryId,...structuredClone(event),
   event_id:canonicalDigest({repository_id:repositoryId,task_id:event.task_id,source:event.source}),
   authority_implied:false,raw_content_retained:false};
}
function readRecord(project,eventId){
 assert.match(eventId,DIGEST);
 const record=readJsonFileStrict(join(store(project),'events',eventId.slice(7)+'.json'),'finding record',MAX);
 fields(record,['kind','repository_id','task_id','source','occurred_at','summary','evidence_status','disposition','related_to','supersedes','event_id','authority_implied','raw_content_retained','record_digest']);
 const event=Object.fromEntries(['task_id','source','occurred_at','summary','evidence_status','disposition','related_to','supersedes'].map(k=>[k,record[k]]));
 const body=eventBody(config(project).repository_id,event);
 assert.deepEqual(record,{...body,record_digest:canonicalDigest(body)},'finding record drift');assert.equal(record.event_id,eventId);return record;
}
export function captureFinding(project,event){
 const cfg=config(project),body=eventBody(cfg.repository_id,event),record={...body,record_digest:canonicalDigest(body)};
 const dir=join(store(project),'events');assertNoSymlinkPathSegments(dir,'finding events');
 for(const ref of [...event.related_to,...(event.supersedes?[event.supersedes]:[])]){assert.notEqual(ref,record.event_id,'self relation');try{readRecord(project,ref);}catch{throw new Error('related finding is missing or invalid');}}
 const path=join(dir,record.event_id.slice(7)+'.json');
 const duplicate=()=>{assert.deepEqual(readRecord(project,record.event_id),record,'event identity conflict: issue a new source event for corrections');return {status:'duplicate',record};};
 if(existsSync(path))return duplicate();
 try{const publication=writeCanonicalJsonNoReplace({outputPath:path,artifact:record,label:'finding event',maximumBytes:MAX});if(!publication.created)return duplicate();}
 catch(error){if(existsSync(path))return duplicate();throw error;}
 return {status:'recorded',record};
}
export function listFindings(project){
 config(project);const dir=join(store(project),'events');assertNoSymlinkPathSegments(dir,'finding events');
 const names=readdirSync(dir).sort();assert.ok(names.length<=10000,'too many findings; select/archive a bounded task set');
 return names.filter(name=>name.endsWith('.json')).map(name=>{assert.match(name,/^[a-f0-9]{64}\.json$/u);return readRecord(project,'sha256:'+name.slice(0,-5));});
}
export function findingFeedback(project,selections){
 assert.ok(Array.isArray(selections)&&selections.length>0&&selections.length<=64);const seen=new Set(), records=listFindings(project);
 const findings=selections.map(s=>{
  fields(s,['event_id','kind','severity','tags','correction','intended_mechanism','applicability','non_applicability']);
  assert.ok(!seen.has(s.event_id),'duplicate selection');seen.add(s.event_id);const r=readRecord(project,s.event_id);
  assert.ok(!records.some(update=>update.supersedes===r.event_id),'select the current correction, not an earlier superseded observation');
  assert.ok(!['withdrawn','disputed'].includes(r.disposition)&&r.evidence_status!=='Falsified','review disputed or withdrawn findings before proposing a rule');
  return {kind:s.kind,severity:s.severity,tags:s.tags,observation:buildPersonalEvolutionObservation({
   observation_id:r.event_id,repository_id:r.repository_id,task_ids:[r.task_id],evidence_refs:[{artifact_id:r.event_id,digest:r.record_digest}],
   evidence_status:r.evidence_status,correction:s.correction,intended_mechanism:s.intended_mechanism,applicability:s.applicability,non_applicability:s.non_applicability,
   privacy:{classification:'public_summary',raw_content_retained:false,private_answers_retained:false}})};
 });return buildInstructionLoopFeedback({findings});
}
// Called only on a validated review result, after the original work is retained.
// An AI claim is a hypothesis about a defect, not verified just because parsed.
export function captureReviewFindings(project,result,executionId){
 const root=store(project);assertNoSymlinkPathSegments(root,'finding directory',{allowMissingLeaf:true});
 if(!existsSync(join(root,'config.json')))return {status:'disabled',events:[]};
 config(project);id(executionId);assert.match(result.request_digest,DIGEST);assert.ok(Array.isArray(result.findings)&&result.findings.length<=32);
 const events=result.findings.map(f=>captureFinding(project,{task_id:result.request_digest,
  source:{kind:'ai_review',id:executionId,item_id:canonicalDigest(f)},
  occurred_at:null,summary:`Review reported ${f.severity}: ${f.obligation_ref} at ${f.path}.`,
  evidence_status:'Hypothesis',disposition:'open',related_to:[],supersedes:null}));
 return {status:'recorded',events:events.map(e=>({status:e.status,event_id:e.record.event_id}))};
}
export function runFindingIntake(args){
 const [command,...rest]=args,flags={};assert.equal(rest.length%2,0,'named options required');
 for(let i=0;i<rest.length;i+=2){assert.ok(['--project','--repository-id','--event','--selection','--output'].includes(rest[i])&&!Object.hasOwn(flags,rest[i]),'unknown or duplicate option');flags[rest[i]]=rest[i+1];}
 const expected={init:['--project','--repository-id'],capture:['--project','--event'],list:['--project'],feedback:['--project','--selection','--output']}[command];assert.ok(expected,'expected init|capture|list|feedback');assert.deepEqual(Object.keys(flags).sort(),expected.sort(),'invalid command options');
 const input=p=>{if(p!=='-')return readJsonFileStrict(resolve(p),'finding input',MAX);const data=Buffer.alloc(MAX+1);let total=0,n;while(total<data.length&&(n=readSync(0,data,total,data.length-total,null))>0)total+=n;assert.ok(total<=MAX,'input too large');return parseJsonRejectDuplicateKeys(data.subarray(0,total),'finding input');};
 let result;
 if(command==='init')result=initializeFindingIntake(flags['--project'],flags['--repository-id']);
 if(command==='capture')result=captureFinding(flags['--project'],input(flags['--event']));
 if(command==='list')result={kind:'ask_finding_inventory_v1',events:listFindings(flags['--project'])};
 if(command==='feedback'){result=findingFeedback(flags['--project'],input(flags['--selection']));writeCanonicalJsonNoReplace({outputPath:resolve(flags['--output']),artifact:result,label:'finding feedback'});}
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(runFindingIntake(process.argv.slice(2)),null,2));}catch(e){console.error(`ask findings: ${e.message}`);process.exitCode=1;}

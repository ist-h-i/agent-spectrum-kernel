// Local retained-input evidence, not an attestation of the model's full context.
import assert from 'node:assert/strict';
import {readdirSync,lstatSync} from 'node:fs';import {join} from 'node:path';
import {readJsonFileStrict,assertNoSymlinkPathSegments,canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {parseUserCodexTelemetry} from './ask-user-comparison.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
const json=p=>readJsonFileStrict(p,'retained grade source',16*1024*1024);
const bytes=p=>{assertNoSymlinkPathSegments(p,'retained grade source');return readStableFile(p,'retained grade source',16*1024*1024).bytes;};
const pin=p=>({path:p,digest:hash(bytes(p))});
function inventory(root){
 assertNoSymlinkPathSegments(root,'retained grade capsule');const rows=[];let total=0;
 function walk(folder=''){
  for(const name of readdirSync(join(root,folder)).sort()){
   assert.ok(name!=='.'&&name!=='..'&&!name.includes('\\'));const path=folder?folder+'/'+name:name,absolute=join(root,path),s=lstatSync(absolute);assert.ok(!s.isSymbolicLink());
   if(s.isDirectory()){walk(path);continue;}assert.ok(s.isFile());const b=bytes(absolute);total+=b.length;assert.ok(total<=64*1024*1024&&rows.length<4096);
   rows.push({path,digest:hash(b),mode:s.mode&0o111?'100755':'100644'});
  }
 }
 walk();return rows;
}
export function verifyRetainedPracticalGradeSource({attempt,settings}){
 assert.equal(settings.kind,'host_business_practical_grader_v1','this retained-source adapter requires the business source-grader protocol');
 const root=attempt.result.output.evidence_root,privateRoot=join(root,'private-grade'),dispatch=json(join(privateRoot,'dispatch.json')),packet=json(join(privateRoot,'packet/packet.json')),primary=json(join(privateRoot,'primary-backend.json')),capture=json(join(privateRoot,'capture-scope.json'));
 assert.equal(dispatch.trial_id,canonicalDigest(attempt.job),'foreign original trial');assert.equal(dispatch.task_id,settings.task_id);assert.equal(dispatch.fixture_id,settings.fixture_id);assert.equal(packet.task_id,settings.task_id);
 assert.ok(typeof primary.session_id==='string'&&primary.session_id,'retained original session identity required');assert.equal(primary.terminal,true);assert.equal(primary.completed,true);
 assert.equal(capture.source_executed,false);assert.equal(capture.public_input_unchanged,true);assert.equal(capture.files.length,packet.candidate_inventory.length);
 const sourceRefs=[];
 for(const item of packet.candidate_inventory){
  assert.ok(typeof item.path==='string'&&!item.path.startsWith('/')&&!item.path.split('/').some(v=>!v||v==='.'||v==='..'||v.includes('\\')));
  const captured=capture.files.find(v=>v.path===item.path);assert.ok(captured);assert.equal(captured.digest,'sha256:'+item.sha256);
  for(const base of [join(root,'workspace'),join(privateRoot,'submission'),join(privateRoot,'packet/service/candidate'),join(privateRoot,'packet/judge/candidate')]){
   const file=join(base,item.path),r=pin(file);assert.equal(r.digest,captured.digest,'retained submission source graft');assert.equal(lstatSync(file).mode&0o111?'100755':'100644',item.mode);sourceRefs.push(r);
  }
 }
 assert.equal(new Set(packet.candidate_inventory.map(v=>v.path)).size,packet.candidate_inventory.length);
 for(const file of settings.public_files){assert.equal(pin(join(root,'workspace',file.target)).digest,file.digest,'original public input graft');}
 const expected=inventory(join(privateRoot,'packet/judge')),replies=settings.config.replyRoot,capsules=settings.config.capsuleRoot;
 assertNoSymlinkPathSegments(replies,'original grade replies');assertNoSymlinkPathSegments(capsules,'original grade capsules');const names=readdirSync(replies);assert.ok(names.length<=512);const matches=[];
 for(const name of names){
  if(!/^[a-f0-9]{32}$/u.test(name))continue;
  const stdout=join(replies,name,'stdout.jsonl');let telemetry;try{telemetry=parseUserCodexTelemetry(bytes(stdout).toString('utf8'));}catch{continue;}
  if(telemetry.session_id===primary.session_id)matches.push({name,stdout});
 }
 assert.equal(matches.length,1,'original primary reply/capsule identity ambiguous or missing');
 const match=matches[0],reply=join(replies,match.name,'reply.json'),input=join(capsules,match.name,'inputs');assert.equal(bytes(reply).toString('utf8'),primary.text,'original primary response graft');
 assert.equal(canonicalDigest(inventory(input)),canonicalDigest(expected),'primary input capsule differs from retained packet');
 sourceRefs.push(pin(reply),pin(match.stdout),pin(join(privateRoot,'capture-scope.json')),...expected.map(v=>pin(join(input,v.path))));
 return {kind:'retained_practical_grade_source_binding_v1',original_job_digest:canonicalDigest(attempt.job),original_result_digest:canonicalDigest(attempt.result),
  task_id:packet.task_id,public_input_digest:attempt.row.public_input_digest,candidate_digest:packet.candidate_digest,policy_digest:packet.policy_digest,
  original_session_id:primary.session_id,source_refs:sourceRefs,source_executed:false,full_model_context_captured:false,
  scope:'Matching retained local input capsule, reply and selected source copies; no independent remote attestation or runtime acceptance.'};
}

// Registered staged public tasks. Execution stays in the standard Codex adapter;
// this module owns frozen preparation and stage/semantic-assessor handoffs only.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,readdirSync,lstatSync,realpathSync,readFileSync,readlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {collectPracticalSessionUsage} from './practical-session-usage.mjs';
import {executeCodexPracticalAdapter,validateCodexPracticalOptions} from './practical-codex-adapter.mjs';
const SOURCE=resolve(import.meta.dirname,'..');
const catalogPath=join(SOURCE,'benchmarks/practical-challenges.json');
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const bytes=path=>readStableFile(path,'challenge frozen input',16*1024*1024).bytes;
const pin=path=>({path,digest:hash(bytes(path))});
const executablePin=path=>({path,digest:hash(readStableBytes(path,'challenge executable',256*1024*1024))});
const safe=p=>assert.ok(typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!p.includes('\\'),'safe relative path required');
const outside=(a,b)=>a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/');
function tree(root,allowInternalLinks=false){
 const result=[];
 const walk=(rel='')=>{for(const name of readdirSync(join(root,rel)).sort()){
  const path=rel?rel+'/'+name:name;safe(path);const stat=lstatSync(join(root,path));
  if(stat.isSymbolicLink()){
   assert.ok(allowInternalLinks,'symlinks forbidden in challenge inputs');
   const link=readlinkSync(join(root,path)),target=realpathSync(join(root,path));
   assert.ok(target.startsWith(root+'/'),'runtime symlink escapes workspace');result.push({path,link});continue;
  }
  if(stat.isDirectory())walk(path);else{assert.ok(stat.isFile());result.push({path,digest:hash(bytes(join(root,path)))});}
 }};walk();return result;
}
function verified(ref){assertNoSymlinkPathSegments(ref.path,'challenge asset');assert.equal(hash(bytes(ref.path)),ref.digest,'challenge asset drift');return bytes(ref.path);}
function copyFiles(source,target,files){for(const f of files){safe(f.path);const content=verified({path:join(source,f.path),digest:f.digest});mkdirSync(dirname(join(target,f.path)),{recursive:true});writeFileSync(join(target,f.path),content,{flag:'wx',mode:0o644});}}
export function listPracticalChallenges(){return readJsonFileStrict(catalogPath).challenges;}
function registration(id){const c=listPracticalChallenges().find(x=>x.id===id);assert.ok(c,'unknown registered challenge');return c;}
function verifyPublic(c){
 const manifest=JSON.parse(verified({path:join(SOURCE,c.input_manifest.path),digest:c.input_manifest.digest}));
 const expected=manifest.files.map(f=>({path:f.path,digest:'sha256:'+f.sha256})).sort((a,b)=>a.path<b.path?-1:1);
 assert.deepEqual(tree(join(SOURCE,c.workspace)),expected,'frozen public challenge inventory changed');return expected;
}
function bindEvaluator(c,root,output){
 root=realpathSync(root);assert.ok(outside(root,output)&&outside(root,SOURCE),'private evaluator must be external to checkout and run');
 return {root,files:c.evaluator.files.map(f=>{safe(f.path);verified({path:join(root,f.path),digest:f.digest});return f;})};
}
export function preparePracticalChallenge({id,root,options,updatePath,evaluatorRoot=null,instructionsRoot=null,instructionsSupplements=[],toolchainRoots,sessionRoots=[],evidenceKind='observed'}){
 assert.ok(['observed','synthetic'].includes(evidenceKind));
 const c=registration(id),files=verifyPublic(c);root=resolve(root);assertNoSymlinkPathSegments(root,'challenge run',{allowMissingLeaf:true});
 assert.ok(outside(root,SOURCE),'run must be outside source checkout');assert.ok(!existsSync(root),'fresh run required');
 validateCodexPracticalOptions(options);assert.equal(realpathSync(options.executable),options.executable,'canonical executable required');assert.equal(options.task_file,'task.md');
 assert.ok(Array.isArray(toolchainRoots)&&toolchainRoots.length>0);
 for(const p of toolchainRoots){assert.equal(realpathSync(p),p);assert.ok(p!=='/'&&outside(p,root)&&outside(p,SOURCE)&&(!evaluatorRoot||outside(p,realpathSync(evaluatorRoot))),'toolchain read access overlaps protected sources');}
 const update={path:realpathSync(updatePath??join(SOURCE,c.stages[1].update.path)),digest:c.stages[1].update.digest};verified(update);assert.ok(outside(update.path,root));
 const evaluator=evaluatorRoot?bindEvaluator(c,evaluatorRoot,root):null;
 const instructions=instructionsRoot?{root:realpathSync(instructionsRoot),files:tree(realpathSync(instructionsRoot))}:null;
 assert.ok(Array.isArray(instructionsSupplements));
 const supplements=new Map();
 for(const f of instructionsSupplements){assert.deepEqual(Object.keys(f).sort(),['digest','path']);safe(f.path);assert.match(f.digest,/^sha256:[a-f0-9]{64}$/u);assert.ok(!supplements.has(f.path),'duplicate instruction supplement');supplements.set(f.path,f.digest);}
 if(supplements.size)assert.ok(instructions,'supplements require an instruction root');
 if(instructions){
  for(const [path,digest] of supplements){assert.ok(instructions.files.some(f=>f.path===path&&f.digest===digest),'instruction supplement missing or changed');}
  assert.ok(outside(instructions.root,root));const managed=new Map();
  const states=['.agent-spectrum-kernel/install-state.json','.agent-spectrum-kernel/codex-install-state.json'];
  for(const name of states)if(existsSync(join(instructions.root,name))){const state=readJsonFileStrict(join(instructions.root,name));for(const [path,entry] of Object.entries(state.managed_files??{})){safe(path);managed.set(path,'sha256:'+entry.sha256);}}
  for(const f of instructions.files){
   const base=f.path==='AGENTS.md'||states.includes(f.path)||f.path.startsWith('.agents/');
   assert.ok(base||managed.has(f.path)||supplements.has(f.path),'instructions must be an instruction-only tree or canonical installer-managed file');
   if(managed.has(f.path))assert.equal(f.digest,managed.get(f.path),'installed instruction digest drift');
  }
 }
 for(const path of sessionRoots){assert.equal(realpathSync(path),path);assert.ok(outside(path,root),'session observations must remain outside solver workspace');}

 const sourcePins=['practical-challenge-evaluation.mjs','practical-session-usage.mjs','practical-codex-adapter.mjs','codex-exec-runner.mjs','ask-user-comparison.mjs','content-addressed-store.mjs','instruction-environment.mjs','ask-benchmark-stable-file.mjs'].map(n=>pin(join(SOURCE,'scripts',n)));
 const manifest={kind:'practical_staged_challenge_run_v1',root,registration:c,registration_digest:canonicalDigest(c),options,
  executable:executablePin(options.executable),source_pins:sourcePins,files,update,evaluator,instructions,instruction_supplements:instructionsSupplements,toolchain_roots:toolchainRoots,session_roots:sessionRoots,
  evidence_kind:evidenceKind,network_policy:'enabled; external access prohibited by task contract, not claimed as network isolation',comparison_limits:['Linked root/descendant response records are observed where available; complete usage and billed cost remain unknown.','Instruction overlay, toolchain and network contract must be held equal across compared runs.','This is separate challenge scoring, not primary24 admission.']};
 mkdirSync(root,{mode:0o700});mkdirSync(join(root,'workspace'),{mode:0o700});copyFiles(join(SOURCE,c.workspace),join(root,'workspace'),files);
 if(instructions)copyFiles(instructions.root,join(root,'workspace'),instructions.files);
 save(join(root,'manifest.json'),manifest);save(join(root,'manifest-digest.json'),{digest:canonicalDigest(manifest)});
 return inspectPracticalChallenge(root);
}
function load(root){
 root=resolve(root);assertNoSymlinkPathSegments(root,'challenge run');const m=readJsonFileStrict(join(root,'manifest.json'));
 assert.equal(m.kind,'practical_staged_challenge_run_v1');assert.equal(m.root,root,'run root changed');assert.equal(canonicalDigest(m),readJsonFileStrict(join(root,'manifest-digest.json')).digest,'run manifest changed');
 assert.equal(canonicalDigest(registration(m.registration.id)),m.registration_digest,'registered challenge changed');
 assertNoSymlinkPathSegments(m.executable.path,'challenge executable');assert.deepEqual(executablePin(m.executable.path),m.executable,'executable changed');m.source_pins.forEach(verified);return m;
}
function frozen(root,m){for(const f of [...m.files,...(m.instructions?.files??[])])verified({path:join(root,'workspace',f.path),digest:f.digest});}
function result(root,stage){const path=join(root,stage,'stage-result.json');return existsSync(path)?readJsonFileStrict(path):null;}
function verifyStage(root,stage,{reassessmentSpec=null}={}){const r=result(root,stage);assert.ok(r?.completed,'previous stage incomplete or unknown; do not retry');
 const stored=readJsonFileStrict(join(root,stage,'task-codex-provider.json'));assert.deepEqual(stored,r.receipt,'stage receipt changed');
 for(const a of r.receipt.observation.artifacts)verified({path:join(root,stage,a.path),digest:a.digest});
 if(r.usage_snapshot)verified({path:join(root,stage,r.usage_snapshot.path),digest:r.usage_snapshot.digest});
 for(const a of r.outputs)verified({path:join(root,'workspace',a.path),digest:a.digest});
 if(r.submission_files){
  for(const f of r.submission_files)verified({path:join(root,'workspace',f.path),digest:f.digest});
  const additions=stage==='initial'&&reassessmentSpec?new Set([reassessmentSpec.update.target,...reassessmentSpec.outputs]):new Set();
  assert.deepEqual(tree(join(root,'workspace')).filter(f=>!additions.has(f.path)),r.submission_files,'submission inventory changed');
 }
 return r;
}
export function inspectPracticalChallenge(root){
 root=resolve(root);const m=load(root),first=result(root,'initial'),second=result(root,'reassessment');
 return {kind:'practical_staged_challenge_status_v1',id:m.registration.id,manifest_digest:canonicalDigest(m),
  usage_latest:second?.usage_snapshot??first?.usage_snapshot??null,
  status:second?.completed?'awaiting_semantic_assessment':existsSync(join(root,'reassessment'))?'reassessment_consumed_or_unknown':first?.completed?'awaiting_resume_confirmation':existsSync(join(root,'initial'))?'initial_consumed_or_unknown':'prepared',
  new_dispatch_requires_authorization:true,stages:{initial:first,reassessment:second},comparison_limits:m.comparison_limits};
}
export async function startPracticalChallenge(root,confirmation,{allowModelCalls=false,stage='initial',session}={}){
 root=resolve(root);const m=load(root);assert.equal(confirmation,canonicalDigest(m),'confirm exact manifest digest');
 if(session!==undefined)assert.equal(m.evidence_kind,'synthetic','injected sessions require synthetic evidence');
 assert.equal(allowModelCalls,true,'model calls require explicit authorization');
 assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','standard runtime model authorization required');
 assert.ok(['initial','reassessment'].includes(stage));frozen(root,m);
 const spec=m.registration.stages.find(s=>s.id===stage),workspace=join(root,'workspace');
 assert.ok(!existsSync(join(root,stage)),'stage consumed or unknown; inspect, never replay');
 let previous=null;
 if(stage==='reassessment'){previous=verifyStage(root,'initial');assert.ok(previous.receipt.session_id,'same-session resume requires observed session id');verified(m.update);}
 for(const output of spec.outputs)assert.ok(!existsSync(join(workspace,output)),'stage output must not preexist');
 const before=tree(workspace,true);mkdirSync(join(root,stage),{mode:0o700});save(join(root,stage,'before.json'),before);
 if(stage==='reassessment')writeFileSync(join(workspace,spec.update.target),verified(m.update),{flag:'wx',mode:0o644});
 const invocationDigest=canonicalDigest({manifest:confirmation,stage});
 const outcome=await executeCodexPracticalAdapter({settings:{kind:'practical_codex_settings_v1',...m.options,evidence_kind:m.evidence_kind},
  controlRoot:join(root,stage),requestDigest:confirmation,commandDigest:canonicalDigest(m.options),invocationDigest,role:'task'},session,
  {workspace,prompt:spec.prompt,resume_session_id:previous?.receipt.session_id??null,toolchain_roots:m.toolchain_roots});
 let integrityError=null,outputs=[];
 try{
  frozen(root,m);
  if(previous){verifyStage(root,'initial',{reassessmentSpec:spec});for(const f of before){if(f.link!==undefined)assert.equal(readlinkSync(join(workspace,f.path)),f.link,'runtime link changed');else verified({path:join(workspace,f.path),digest:f.digest});}
   const allowed=new Set([...before.map(f=>f.path),spec.update.target,...spec.outputs]);assert.ok(tree(workspace,true).every(f=>allowed.has(f.path)),'reassessment may only add REASSESSMENT.md');
   verified({path:join(workspace,spec.update.target),digest:spec.update.digest});
   assert.equal(outcome.receipt.session_id,previous.receipt.session_id,'resume session changed');
  }
  outputs=spec.outputs.map(path=>({path,digest:hash(bytes(join(workspace,path)))}));
  for(const f of outputs)assert.ok(bytes(join(workspace,f.path)).length>0,'empty stage output');
 }catch(error){integrityError=String(error.message);}
 // Root process exit alone cannot establish a completed turn.
 const events=readFileSync(join(root,stage,'task-codex.stdout.jsonl'),'utf8').trim().split('\n');
 let turnCompleted=false;try{turnCompleted=JSON.parse(events.at(-1)).type==='turn.completed';}catch{}
 const usage=collectPracticalSessionUsage({sessionRoots:m.session_roots,workspace,rootSessionId:outcome.receipt.session_id,rootTurnLowerBound:outcome.receipt.observation.metrics});
 save(join(root,stage,'usage-hierarchy.json'),usage);
 const record={...outcome,usage_snapshot:{path:'usage-hierarchy.json',digest:hash(bytes(join(root,stage,'usage-hierarchy.json')))},completed:outcome.completed&&turnCompleted&&!integrityError,integrity_error:integrityError,outputs,
  initial_written_before_investigation:'not_automatically_verified; semantic assessor checks transcript',automatic_semantic_scoring:false,
  ...(m.registration.freeze_submission?{submission_files:tree(workspace)}:{})};
 save(join(root,stage,'stage-result.json'),record);return inspectPracticalChallenge(root);
}
function challengeScorePacket(root,{evaluatorRoot=null}={}){
 root=resolve(root);const m=load(root);frozen(root,m);const stages=m.registration.stages.map(s=>verifyStage(root,s.id,{reassessmentSpec:m.registration.stages[1]}));
 assert.ok(evaluatorRoot||m.evaluator?.root,'external semantic evaluator assets required');
 const evaluator=bindEvaluator(m.registration,evaluatorRoot??m.evaluator.root,root);
 for(const p of m.toolchain_roots)assert.ok(outside(p,evaluator.root),'evaluator overlaps solver toolchain access');
 const packet={kind:'practical_challenge_semantic_handoff_v1',fixture_id:m.registration.id,manifest_digest:canonicalDigest(m),
  evaluator,stages:stages.map((s,i)=>({id:m.registration.stages[i].id,outputs:s.outputs,...(s.submission_files?{submission_files:s.submission_files}:{}),receipt:pin(join(root,m.registration.stages[i].id,'task-codex-provider.json')),usage_snapshot:pin(join(root,m.registration.stages[i].id,'usage-hierarchy.json'))})),
  workspace:join(root,'workspace'),quality_score:null,semantic_assessment_required:true,automatic_semantic_scoring:false,
  method:'External semantic assessor evaluates frozen rubric against answer/source/transcript evidence; the pinned external score.mjs validates and totals those decisions only.',
  comparison_limits:m.comparison_limits};
 return packet;
}

export function preparePracticalChallengeScoreHandoff(root,options={}){
 root=resolve(root);const packet=challengeScorePacket(root,options),path=join(root,'score-handoff.json');save(path,packet);return {path,digest:canonicalDigest(packet),quality_score:null,semantic_assessment_required:true};
}
export function inspectPracticalChallengeScoreHandoff(root){
 root=resolve(root);const saved=readJsonFileStrict(join(root,'score-handoff.json'));
 const expected=challengeScorePacket(root,{evaluatorRoot:saved.evaluator?.root});
 assert.deepEqual(saved,expected,'semantic handoff changed');return expected;
}

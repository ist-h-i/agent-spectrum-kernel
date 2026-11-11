import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {listPracticalChallenges,preparePracticalChallenge,inspectPracticalChallenge,startPracticalChallenge,preparePracticalChallengeScoreHandoff} from './practical-challenge-evaluation.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {collectPracticalSessionUsage} from './practical-session-usage.mjs';
import {PRIMARY_FIXTURE_REGISTRY} from './ask-benchmark-portfolio-catalog.mjs';
const id='rc01-shared-review-platform';
function setup(t){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'challenge-test-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const root=join(base,'run');
 const config={id,root,evidenceKind:'synthetic',options:{executable:realpathSync('/bin/echo'),model:'test-model',reasoning:'low',task_file:'task.md',timeout_ms:1000},toolchainRoots:['/usr']};
 const ready=preparePracticalChallenge(config),calls=[];
 const fake=async request=>{calls.push(request);
  const resume=request.argv[1]==='resume';
  assert.ok(request.argv.includes('--ignore-user-config'));assert.ok(request.argv.includes('approval_policy="never"'));
  assert.ok(request.argv.some(x=>x.startsWith('permissions.challenge={"filesystem"=')));
  assert.ok(!request.input.includes('rubric'));assert.ok(!request.input.includes('score.mjs'));
  assert.equal(existsSync(join(request.cwd,'OPERATIONAL-UPDATE.md')),resume);
  for(const name of resume?['REASSESSMENT.md']:['INITIAL.md','REVIEW.md'])writeFileSync(join(request.cwd,name),'Synthetic answer: '+name);
  return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:12,stdout:Buffer.from([
   {type:'thread.started',thread_id:'synthetic-session'},
   {type:'turn.completed',usage:{input_tokens:9,cached_input_tokens:2,output_tokens:4}},
  ].map(JSON.stringify).join('\n')+'\n'),stderr:Buffer.alloc(0)};
 };
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 t.after(()=>{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;});
 const run=(stage='initial',session=fake)=>startPracticalChallenge(root,ready.manifest_digest,{allowModelCalls:true,stage,session});
 return {base,root,config,ready,calls,fake,run};
}
test('catalog is separate from unchanged primary24 and discoverable through standard CLI',()=>{
 const rows=listPracticalChallenges();assert.equal(rows.length,1);assert.equal(rows[0].id,id);
 assert.equal(rows[0].primary_catalog_member,false);
 assert.equal(Object.keys(PRIMARY_FIXTURE_REGISTRY).length,24);
 const r=spawnSync(process.execPath,['scripts/practical-evaluation-cli.mjs','challenge-list'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout)[0].id,id);
});
test('prepare freezes 151 public files; update and evaluator are not solver inputs',t=>{
 const f=setup(t);assert.equal(f.ready.status,'prepared');assert.equal(f.calls.length,0);
 const manifest=JSON.parse(readFileSync(join(f.root,'manifest.json')));assert.equal(manifest.files.length,151);
 assert.equal(existsSync(join(f.root,'workspace','OPERATIONAL-UPDATE.md')),false);
 assert.equal(existsSync(join(f.root,'workspace','rubric.json')),false);
 assert.throws(()=>preparePracticalChallenge(f.config),/fresh run/);
});
test('initial and same-session resume retain standard provider usage and frozen answers',async t=>{
 const f=setup(t);const first=await f.run();assert.equal(first.status,'awaiting_resume_confirmation');
 assert.equal(first.stages.initial.receipt.observation.metrics.input_tokens,9);
 const initial=readFileSync(join(f.root,'workspace','INITIAL.md'));
 const end=await f.run('reassessment');assert.equal(end.status,'awaiting_semantic_assessment');
 assert.equal(f.calls.length,2);assert.ok(f.calls[1].argv.includes('synthetic-session'));
 assert.deepEqual(readFileSync(join(f.root,'workspace','INITIAL.md')),initial);
 assert.equal(end.stages.reassessment.automatic_semantic_scoring,false);
 assert.throws(()=>preparePracticalChallengeScoreHandoff(f.root),/external semantic evaluator/);
 await assert.rejects(f.run('reassessment'),/consumed/);assert.equal(f.calls.length,2);
});
test('authorization, exact manifest confirmation and prior-stage gates precede any calls',async t=>{
 const f=setup(t);await assert.rejects(startPracticalChallenge(f.root,f.ready.manifest_digest,{session:f.fake}),/authorization/);
 await assert.rejects(startPracticalChallenge(f.root,'sha256:'+'0'.repeat(64),{allowModelCalls:true,session:f.fake}),/manifest digest/);
 await assert.rejects(f.run('reassessment'),/previous stage/);assert.equal(f.calls.length,0);
});
test('source drift prevents model dispatch',async t=>{
 const f=setup(t);writeFileSync(join(f.root,'workspace','task.md'),'changed');await assert.rejects(f.run(),/asset drift/);assert.equal(f.calls.length,0);
});
test('initial answer tampering blocks resume',async t=>{
 const f=setup(t);await f.run();writeFileSync(join(f.root,'workspace','REVIEW.md'),'changed');await assert.rejects(f.run('reassessment'),/asset drift/);assert.equal(f.calls.length,1);
});
test('same-session answer rewrite fails integrity, cannot replay or grade',async t=>{
 const f=setup(t);await f.run();const end=await f.run('reassessment',async r=>{const out=await f.fake(r);writeFileSync(join(r.cwd,'INITIAL.md'),'retroactive');return out;});
 assert.equal(end.status,'reassessment_consumed_or_unknown');assert.match(end.stages.reassessment.integrity_error,/asset drift/);
 assert.throws(()=>preparePracticalChallengeScoreHandoff(f.root));await assert.rejects(f.run('reassessment'));
});
test('exit zero without completed turn remains unknown and consumed',async t=>{
 const f=setup(t);const end=await f.run('initial',async r=>{const out=await f.fake(r);out.stdout=Buffer.from('{"type":"thread.started","thread_id":"synthetic-session"}\n');return out;});
 assert.equal(end.status,'initial_consumed_or_unknown');await assert.rejects(f.run(),/consumed/);await assert.rejects(f.run('reassessment'),/incomplete or unknown/);
});
test('process failure cannot become complete review or free retry',async t=>{
 const f=setup(t);const end=await f.run('initial',async()=>({spawnObserved:false,terminationConfirmed:true,exitCode:null,error:{message:'synthetic launch failure'},stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)}));
 assert.equal(end.status,'initial_consumed_or_unknown');await assert.rejects(f.run(),/consumed/);assert.equal(inspectPracticalChallenge(f.root).stages.initial.completed,false);
});
test('private or overbroad toolchain roots are rejected before preparation',t=>{
 const f=setup(t);assert.throws(()=>preparePracticalChallenge({...f.config,root:join(f.base,'other'),toolchainRoots:['/']}),/protected sources/);
 const instructions=join(f.base,'instructions');mkdirSync(instructions);writeFileSync(join(instructions,'rubric.json'),'private');
 assert.throws(()=>preparePracticalChallenge({...f.config,root:join(f.base,'other'),instructionsRoot:instructions}),/instruction-only/);
});


test('canonical full overlay permits pinned root skills and Codex prompts without whole-repo access',t=>{
 const f=setup(t),overlay=join(f.base,'overlay');mkdirSync(join(overlay,'.agent-spectrum-kernel'),{recursive:true});mkdirSync(join(overlay,'skills','example'),{recursive:true});mkdirSync(join(overlay,'.codex','prompts'),{recursive:true});
 const content='Synthetic installed instruction';
 for(const name of ['skills/example/SKILL.md','.codex/prompts/review.md'])writeFileSync(join(overlay,name),content);
 const managed=Object.fromEntries(['skills/example/SKILL.md','.codex/prompts/review.md'].map(path=>[path,{sha256:hash(Buffer.from(content)).slice(7)}]));
 writeFileSync(join(overlay,'.agent-spectrum-kernel','install-state.json'),JSON.stringify({managed_files:managed}));
 const ready=preparePracticalChallenge({...f.config,root:join(f.base,'full'),instructionsRoot:overlay});assert.equal(ready.status,'prepared');
 assert.equal(readFileSync(join(f.base,'full','workspace','skills','example','SKILL.md'),'utf8'),content);
 writeFileSync(join(overlay,'secret.md'),'not installed');assert.throws(()=>preparePracticalChallenge({...f.config,root:join(f.base,'blocked'),instructionsRoot:overlay}),/instruction-only/);
});

test('hierarchy usage deduplicates response identity and resume cumulative records without model restrictions',t=>{
 const f=setup(t),logs=join(f.base,'sessions');mkdirSync(logs);
 const usage=(thread,turn,response,input)=>({type:'token_usage_record',payload:{thread_id:thread,turn_id:turn,response_id:response,usage:{input_tokens:input,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:input+3}}});
 const write=(id,parent,events,cwd=join(f.root,'workspace'))=>writeFileSync(join(logs,id+'.jsonl'),[{type:'session_meta',payload:{id,parent_thread_id:parent,cwd}},...events].map(JSON.stringify).join('\n'));
 const root=usage('root','turn1','a',10),child=usage('child','turn2','b',20);
 write('root',null,[root,root,usage('root','turn3','c',30)]);
 write('child','root',[root,{type:'turn_context',payload:{model:'different-model',effort:'high'}},child],join(f.root,'workspace','packages','portal'));
 write('grandchild','child',[usage('grandchild','turn4','d',40)],join(f.root,'workspace','packages','core'));
 write('unrelated',null,[usage('unrelated','turn1','x',999)],'/unrelated');
 write('unrelated-child','unrelated',[usage('unrelated-child','turn2','y',999)]);
 const options={sessionRoots:[logs],workspace:join(f.root,'workspace'),rootSessionId:'root'};
 const result=collectPracticalSessionUsage(options);assert.equal(result.aggregate_observed.input_tokens,100);assert.equal(result.unique_response_count,4);assert.equal(result.sessions.length,3);assert.deepEqual(result.sessions.map(s=>s.id).sort(),['child','grandchild','root']);assert.deepEqual(result.missing_usage_sessions,[]);assert.deepEqual(result.issues,[]);assert.equal(result.complete_total,null);
 assert.equal(result.do_not_sum_stage_snapshots,true);assert.equal(collectPracticalSessionUsage(options).aggregate_observed.input_tokens,100);
 write('root',null,[root,{...root,payload:{...root.payload,usage:{...root.payload.usage,input_tokens:99}}}]);
 const conflicting=collectPracticalSessionUsage(options);assert.ok(conflicting.issues.some(s=>s.startsWith('conflicting_response_usage')));assert.equal(conflicting.aggregate_observed.input_tokens,60);
});


test('hierarchy usage rejects a root outside the approved workspace and excludes its descendants',t=>{
 const f=setup(t),logs=join(f.base,'sessions');mkdirSync(logs);
 for(const [id,parent,cwd] of [['foreign-root',null,'/unrelated'],['foreign-child','foreign-root',join(f.root,'workspace')]]){
  writeFileSync(join(logs,id+'.jsonl'),[
   {type:'session_meta',payload:{id,parent_thread_id:parent,cwd}},
   {type:'token_usage_record',payload:{thread_id:id,turn_id:'turn',response_id:id,usage:{input_tokens:999,output_tokens:1}}},
  ].map(JSON.stringify).join('\n'));
 }
 const options={sessionRoots:[logs],workspace:join(f.root,'workspace'),rootSessionId:'foreign-root'};
 const result=collectPracticalSessionUsage(options);assert.equal(result.aggregate_observed.input_tokens,null);assert.equal(result.unique_response_count,0);assert.deepEqual(result.sessions,[]);assert.deepEqual(result.missing_usage_sessions,['foreign-root']);assert.ok(result.issues.includes('root_workspace_binding_mismatch:foreign-root'));assert.equal(result.complete_total,null);
 const absent=collectPracticalSessionUsage({...options,rootSessionId:'absent-root'});assert.deepEqual(absent.sessions,[]);assert.deepEqual(absent.missing_usage_sessions,['absent-root']);
});

test('hierarchy usage excludes response IDs claimed by different threads or turns',t=>{
 const f=setup(t),logs=join(f.base,'scope-conflicts');mkdirSync(logs);
 const usage=(thread,turn,response,input)=>({type:'token_usage_record',payload:{thread_id:thread,turn_id:turn,response_id:response,usage:{input_tokens:input,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:input+3}}});
 const write=(id,parent,events)=>writeFileSync(join(logs,id+'.jsonl'),[{type:'session_meta',payload:{id,parent_thread_id:parent,cwd:join(f.root,'workspace')}},...events].map(JSON.stringify).join('\n'));
 // The alphabetically first child is processed before the root: its provisional
 // sum must also lose the collision discovered while reading the root later.
 write('root',null,[usage('root','r1','cross-thread',10),usage('root','r1','cross-turn',20),usage('root','r2','cross-turn',20),usage('root','r2','root-valid',40)]);
 write('child','root',[usage('child','c1','cross-thread',10),usage('child','c1','child-valid',30)]);
 const result=collectPracticalSessionUsage({sessionRoots:[logs],workspace:join(f.root,'workspace'),rootSessionId:'root'});
 assert.equal(result.unique_response_count,2);assert.equal(result.aggregate_observed.input_tokens,70);
 assert.deepEqual(result.sessions.map(s=>[s.id,s.unique_response_count,s.observed.input_tokens]),[['child',1,30],['root',1,40]]);
 assert.ok(result.issues.includes('conflicting_response_scope:cross-thread'));assert.ok(result.issues.includes('conflicting_response_scope:cross-turn'));
 assert.equal(result.complete_total,null);assert.equal(result.complete_billed_cost,null);
});

test('hierarchy usage retains missing response usage identities without inventing zero',t=>{
 const f=setup(t),logs=join(f.base,'missing-responses');mkdirSync(logs);
 const missing={type:'token_usage_record',payload:{thread_id:'root',turn_id:'turn',response_id:'missing',usage:null}};
 const valid={type:'token_usage_record',payload:{thread_id:'root',turn_id:'turn',response_id:'valid',usage:{input_tokens:10,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:13}}};
 const write=events=>writeFileSync(join(logs,'root.jsonl'),[{type:'session_meta',payload:{id:'root',cwd:join(f.root,'workspace')}},...events].map(JSON.stringify).join('\n'));
 const options={sessionRoots:[logs],workspace:join(f.root,'workspace'),rootSessionId:'root'};
 write([missing,missing,valid]);const result=collectPracticalSessionUsage(options);
 assert.deepEqual(result.missing_usage_records,[{thread_id:'root',turn_id:'turn',response_id:'missing'}]);
 assert.equal(result.unique_response_count,1);assert.equal(result.aggregate_observed.input_tokens,10);assert.ok(result.issues.includes('invalid_usage:root'));
 assert.equal(result.complete_total,null);assert.equal(result.complete_billed_cost,null);
 write([missing]);const empty=collectPracticalSessionUsage(options);
 assert.equal(empty.aggregate_observed.input_tokens,null);assert.deepEqual(empty.missing_usage_sessions,['root']);
 assert.deepEqual(empty.missing_usage_records,result.missing_usage_records);
 const recovered={...valid,payload:{...valid.payload,response_id:'missing'}};
 write([missing,recovered,recovered]);const recoveredResult=collectPracticalSessionUsage(options);
 assert.equal(recoveredResult.unique_response_count,1);assert.equal(recoveredResult.aggregate_observed.input_tokens,10);
 assert.deepEqual(recoveredResult.missing_usage_sessions,[]);
 assert.deepEqual(recoveredResult.missing_usage_records,result.missing_usage_records);
 assert.equal(recoveredResult.complete_total,null);assert.equal(recoveredResult.complete_billed_cost,null);
});

test('hierarchy usage treats missing-usage scope claims as conflicts too',t=>{
 const f=setup(t),logs=join(f.base,'missing-scope-conflict');mkdirSync(logs);
 for(const [id,parent,usage] of [['child','root',null],['root',null,{input_tokens:10,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:13}]]){
  writeFileSync(join(logs,id+'.jsonl'),[
   {type:'session_meta',payload:{id,parent_thread_id:parent,cwd:join(f.root,'workspace')}},
   {type:'token_usage_record',payload:{thread_id:id,turn_id:id+'-turn',response_id:'shared',usage}},
  ].map(JSON.stringify).join('\n'));
 }
 const result=collectPracticalSessionUsage({sessionRoots:[logs],workspace:join(f.root,'workspace'),rootSessionId:'root'});
 assert.equal(result.unique_response_count,0);assert.equal(result.aggregate_observed.input_tokens,null);
 assert.ok(result.sessions.every(s=>s.unique_response_count===0&&s.observed.input_tokens===null));
 assert.deepEqual(result.missing_usage_sessions,['child','root']);
 assert.deepEqual(result.missing_usage_records,[{thread_id:'child',turn_id:'child-turn',response_id:'shared'}]);
 assert.ok(result.issues.includes('conflicting_response_scope:shared'));
 assert.equal(result.complete_total,null);assert.equal(result.complete_billed_cost,null);
});

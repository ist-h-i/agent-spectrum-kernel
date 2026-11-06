import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync,writeFileSync,readdirSync,statSync,cpSync,readFileSync,symlinkSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { canonicalDigest,putContentAddressedJson } from './content-addressed-store.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
import { captureInstructionEnvironment,verifyInstructionEnvironment,exportInstructionEnvironment,instructionBytesDigest as hash } from './instruction-environment.mjs';
import { captureRetainedInstructionLayout,retainedInstructionPath } from './retained-instruction-layout.mjs';
import { prepareRetainedInstructionComparison,readRetainedInstructionResults,verifyRetainedInstructionComparison } from './retained-instruction-comparison.mjs';
import { planEnvironmentTargetApply } from './environment-target.mjs';
function write(root,path,text){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);}
function inventory(root,rel=''){return readdirSync(join(root,rel)).sort().flatMap(name=>{
 const path=rel?rel+'/'+name:name,s=statSync(join(root,path));return s.isDirectory()?inventory(root,path):[{path,bytes:s.size,mode:s.mode&0o777,sha256:hash(readFileSync(join(root,path)))}];
});}
function fixture(t) {
 const seed=environmentFixture(t),root=join(seed.root,'source');mkdirSync(root);
 write(root,'AGENTS.md','Synthetic only.\n');write(root,'CUSTOM_INSTRUCTIONS.md','Synthetic kernel copy.\n');
 write(root,'skills/demo/SKILL.md','Synthetic demo.\n');write(root,'.agents/skills/demo/SKILL.md','Synthetic demo.\n');
 write(root,'.agent-spectrum-kernel/codex-install-state.json',JSON.stringify({selected_profile:'full',selected_skills:['demo']}));
 write(root,'.agent-spectrum-kernel/install-state.json','{}');
 for(const f of seed.content.files){const target=seed.options.bindings[0].files.find(x=>x.source===f.path).target;write(root,target,Buffer.from(f.bytes_base64,'base64'));}
 const freeze=()=>{
  const expectedFiles=inventory(root);
  return captureRetainedInstructionLayout({storeRoot:seed.storeRoot,sourceRoot:root,expectedFiles,expectedInventoryDigest:canonicalDigest(expectedFiles)});
 };
 const layout=freeze(),mapped=new Set(seed.options.bindings.flatMap(x=>x.files.map(f=>f.target)));
 const options={...seed.options,sourceRoot:root,retainedLayoutObjectDigest:layout.object_digest,supportPaths:inventory(root).map(f=>f.path).filter(p=>!mapped.has(p))};
 return {...seed,sourceRoot:root,freeze,layout,options};
}
test('opt-in retained layout freezes and re-exports every instruction without relaxing ordinary capture',t=>{
 const f=fixture(t),saved=captureInstructionEnvironment(f.options);
 const checked=verifyInstructionEnvironment({...f.options,environmentObjectDigest:saved.object_digest});
 assert.equal(checked.files.length,inventory(f.sourceRoot).length);
 assert.equal(saved.environment.runtime_use_implied,false);
 const target=join(f.root,'export');
 exportInstructionEnvironment({...f.options,environmentObjectDigest:saved.object_digest,outputRoot:target});
 assert.deepEqual(inventory(target).map(({mode,...x})=>x),inventory(f.sourceRoot).map(({mode,...x})=>x));
 assert.throws(()=>captureInstructionEnvironment({...f.options,retainedLayoutObjectDigest:undefined}),/unsupported/);
});
test('a retained environment cannot omit a canonical instruction or state',t=>{
 const f=fixture(t);
 assert.throws(()=>captureInstructionEnvironment({...f.options,supportPaths:f.options.supportPaths.filter(p=>p!=='CUSTOM_INSTRUCTIONS.md')}),/omitted/);
});
test('retained manifest refuses undeclared files and post-review drift',t=>{
 const f=fixture(t),expectedFiles=inventory(f.sourceRoot),o={storeRoot:f.storeRoot,sourceRoot:f.sourceRoot,expectedFiles,expectedInventoryDigest:canonicalDigest(expectedFiles)};
 write(f.sourceRoot,'docs/extra.md','Undeclared.\n');
 assert.throws(()=>captureRetainedInstructionLayout(o),/undeclared/);
});
test('retained mirror validation covers references as well as entrypoints',t=>{
 const f=fixture(t);
 write(f.sourceRoot,'skills/demo/references/x.md','Canonical.\n');
 write(f.sourceRoot,'.agents/skills/demo/references/x.md','Different.\n');
 const layout=f.freeze();
 assert.throws(()=>captureInstructionEnvironment({...f.options,retainedLayoutObjectDigest:layout.object_digest,
 supportPaths:inventory(f.sourceRoot).map(x=>x.path).filter(p=>!p.startsWith('.agents/prompts/'))}),/mirrors differ/);
});
test('retained inventory refuses symlinks',t=>{
 const f=fixture(t);symlinkSync(join(f.sourceRoot,'AGENTS.md'),join(f.sourceRoot,'docs-link'));
 assert.throws(()=>f.freeze(),/symlink/);
});
for(const path of ['../AGENTS.md','.env','.codex/config.toml','.agent-spectrum-kernel/auth.json','workspace/answer.json'])
 test('retained layout refuses unrelated or secret path '+path,()=>assert.throws(()=>retainedInstructionPath(path)));
function planFixture(t){
 const f=fixture(t),a=captureInstructionEnvironment(f.options);
 const b=captureInstructionEnvironment({...f.options,environmentId:'second-synthetic-role'});
 const n=join(f.root,'prepared');mkdirSync(n);
 write(n,'runner.py','Synthetic runner bytes, never executed.\n');write(n,'prompt.txt','Synthetic fixed prompt.\n');
 const rows=['baseline','candidate'].map((variant,i)=>{
  const id='synthetic-'+i,work=join(f.root,id,'work');mkdirSync(dirname(work),{recursive:true});cpSync(f.sourceRoot,work,{recursive:true});
  write(work,'task.md','Synthetic public task.\n');write(n,id+'-wrapper','Synthetic wrapper bytes, never executed.\n');
  return {sequence:i+1,trial_id:id,fixture_id:'synthetic-task',repetition:1,variant,ask:'on',work_root:work,trial_root:join(n,'trials',id),wrapper:join(n,id+'-wrapper'),
   public_inventory:[inventory(work).find(x=>x.path==='task.md')],initial_inventory:inventory(work)};
 });
 const config={rows,model:f.options.runtime.model,effort:'low',runner:join(n,'runner.py'),dependency_pins:[{path:join(n,'runner.py'),sha256:hash(readFileSync(join(n,'runner.py')))}],source_public_head:'synthetic-source'};
 write(n,'config.json',JSON.stringify(config));
 const files=['config.json','prompt.txt','runner.py',...rows.map(r=>r.trial_id+'-wrapper')].map(path=>({path,sha256:hash(readFileSync(join(n,path)))}));
 write(n,'preparation-manifest.json',JSON.stringify({files}));
 const options={...f.options,configPath:join(n,'config.json'),preparationManifestDigest:hash(readFileSync(join(n,'preparation-manifest.json'))),environments:{baseline:a.object_digest,challenger:b.object_digest}};
 const prepared=prepareRetainedInstructionComparison(options);
 return {...f,n,rows,config,options,prepared};
}
test('retained preparation/results are model-free, complete, and unknown before execution',t=>{
 const f=planFixture(t),report=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest});
 assert.equal(report.complete,false);assert.ok(report.rows.every(r=>r.state==='not_started'&&r.root_usage===null));
 assert.equal(report.adoption.status,'not_assessed');assert.equal(report.reference_review.status,'awaiting_results');assert.equal(report.model_launch_performed_by_command,false);
 assert.equal(report.official_quality_score,null);assert.equal(report.full_hierarchical_usage,null);
});
test('retained plan rejects config/wrapper drift before consuming results',t=>{
 const f=planFixture(t);write(f.n,f.rows[0].trial_id+'-wrapper','Changed.\n');
 assert.throws(()=>verifyRetainedInstructionComparison({...f.options,planObjectDigest:f.prepared.object_digest}),/drift/);
});
test('pre-result preparation refuses an allocated trial rather than retrying it',t=>{
 const f=planFixture(t);mkdirSync(f.rows[0].trial_root,{recursive:true});
 assert.throws(()=>prepareRetainedInstructionComparison(f.options),/already allocated/);
});
function completed(f,index=0,{missingUsage=false,start='2026-11-05T01:00:00.000000+00:00',end='2026-11-05T01:00:01.000000+00:00'}={}){
 const row=f.rows[index],thread='00000000-0000-4000-8000-00000000000'+index;
 const usage=missingUsage?null:{input_tokens:100,cached_input_tokens:80,output_tokens:3};
 const status={trial_id:row.trial_id,model_requested:f.config.model,reasoning_requested:'low',
 prompt_sha256:hash(readFileSync(join(f.n,'prompt.txt'))).slice(7),thread_id:thread,exit_code:0,execution_status:'completed',
 started_utc:start,ended_utc:end,reported_root_tokens:usage};
 write(row.trial_root,'completion.json',JSON.stringify({trial_id:row.trial_id,status,cli_terminal_verified:true,ready_for_next_root:true,observed_native_children:[],sampling_errors:[]}));
 write(row.trial_root,'metrics/stdout.raw.jsonl',[{type:'thread.started',thread_id:thread},{type:'turn.completed',...(usage?{usage}:{})}].map(x=>JSON.stringify(x)).join('\n')+'\n');
 write(row.trial_root,'controller/retained-work.tar.gz','Synthetic archive bytes, never extracted.\n');
 const archive=join(row.trial_root,'controller/retained-work.tar.gz');
 const receipt={status,official_root_usage_from_turn_completed:usage,elapsed_seconds:(Date.parse(end)-Date.parse(start))/1000,
 retained_work_archive:archive,retained_work_archive_sha256:hash(readFileSync(archive)).slice(7)};
 write(row.trial_root,'controller/completion-receipt.json',JSON.stringify(receipt));return receipt;
}
test('closed retained evidence preserves official root components without inventing hierarchy or quality',t=>{
 const f=planFixture(t);completed(f);
 const report=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}),r=report.rows[0];
 assert.equal(r.state,'completed');assert.equal(r.cli_seconds,1);assert.deepEqual(r.root_usage,{input_tokens:100,cached_input_tokens:80,output_tokens:3});
 assert.equal(r.full_hierarchical_usage,null);assert.equal(r.formal_quality_score,null);assert.equal(report.complete,false);
});
test('a terminal event with no usage remains a completed but quantitatively unknown reference',t=>{
 const f=planFixture(t);completed(f,0,{missingUsage:true});
 const r=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}).rows[0];
 assert.equal(r.state,'completed');assert.equal(r.root_usage,null);assert.equal(r.full_hierarchical_usage,null);
});
test('official CLI counters survive a missing pipeline copy without certifying hierarchy',t=>{
 const f=planFixture(t),receipt=completed(f),path=join(f.rows[0].trial_root,'completion.json'),done=JSON.parse(readFileSync(path));
 delete done.status.reported_root_tokens;receipt.status=done.status;write(f.rows[0].trial_root,'completion.json',JSON.stringify(done));
 write(f.rows[0].trial_root,'controller/completion-receipt.json',JSON.stringify(receipt));
 const r=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}).rows[0];
 assert.equal(r.state,'completed');assert.equal(r.root_usage.input_tokens,100);assert.equal(r.root_usage_status,'event_with_missing_status_copy');assert.equal(r.full_hierarchical_usage,null);
});
test('a missing CLI component stays null rather than blocking completion or being filled with zero',t=>{
 const f=planFixture(t),receipt=completed(f),done=JSON.parse(readFileSync(join(f.rows[0].trial_root,'completion.json')));
 const usage={input_tokens:100,output_tokens:3};done.status.reported_root_tokens=null;receipt.status=done.status;receipt.official_root_usage_from_turn_completed=usage;
 write(f.rows[0].trial_root,'completion.json',JSON.stringify(done));write(f.rows[0].trial_root,'controller/completion-receipt.json',JSON.stringify(receipt));
 write(f.rows[0].trial_root,'metrics/stdout.raw.jsonl',[{type:'thread.started',thread_id:done.status.thread_id},{type:'turn.completed',usage}].map(x=>JSON.stringify(x)).join('\n')+'\n');
 const r=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}).rows[0];assert.equal(r.state,'completed');
 assert.deepEqual(r.root_usage,{input_tokens:100,cached_input_tokens:null,output_tokens:3});assert.equal(r.root_usage_status,'partial');
});
test('malformed CLI usage is rejected rather than treated as unknown components',t=>{
 const f=planFixture(t);completed(f);const done=JSON.parse(readFileSync(join(f.rows[0].trial_root,'completion.json')));
 write(f.rows[0].trial_root,'metrics/stdout.raw.jsonl',[{type:'thread.started',thread_id:done.status.thread_id},{type:'turn.completed',usage:'invalid'}].map(x=>JSON.stringify(x)).join('\n')+'\n');
 assert.throws(()=>readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}),/invalid CLI usage/);
});
test('retained results reject archive mutation and receipt root-token disagreement',t=>{
 const f=planFixture(t),receipt=completed(f);
 receipt.official_root_usage_from_turn_completed={...receipt.official_root_usage_from_turn_completed,input_tokens:101};
 write(f.rows[0].trial_root,'controller/completion-receipt.json',JSON.stringify(receipt));
 assert.throws(()=>readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}),/root usage mismatch/);
 completed(f);write(f.rows[0].trial_root,'controller/retained-work.tar.gz','Changed.\n');
 assert.throws(()=>readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}),/archive drift/);
});
test('retained comparison rejects overlapping root model intervals',t=>{
 const f=planFixture(t);completed(f,0);completed(f,1);
 assert.throws(()=>readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}),/overlap/);
});
test('an environment failure before thread creation is retained as failure with unknown usage',t=>{
 const f=planFixture(t);completed(f);
 const path=join(f.rows[0].trial_root,'completion.json'),done=JSON.parse(readFileSync(path));
 done.cli_terminal_verified=false;done.ready_for_next_root=false;done.status.thread_id=null;done.status.exit_code=1;done.status.execution_status='failed';done.status.reported_root_tokens=null;
 write(f.rows[0].trial_root,'completion.json',JSON.stringify(done));
 write(f.rows[0].trial_root,'metrics/stdout.raw.jsonl','');
 const receiptPath=join(f.rows[0].trial_root,'controller/completion-receipt.json'),receipt=JSON.parse(readFileSync(receiptPath));
 receipt.status=done.status;receipt.official_root_usage_from_turn_completed=null;
 write(f.rows[0].trial_root,'controller/completion-receipt.json',JSON.stringify(receipt));
 const r=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest}).rows[0];
 assert.equal(r.state,'failed_or_interrupted');assert.equal(r.root_usage,null);assert.equal(r.formal_quality_score,null);
});
test('complete retained results enable reference review without inventing a formal adoption decision',t=>{
 const f=planFixture(t);completed(f,0);completed(f,1,{start:'2026-11-05T01:00:02.000000+00:00',end:'2026-11-05T01:00:03.000000+00:00'});
 const r=readRetainedInstructionResults({...f.options,planObjectDigest:f.prepared.object_digest});
 assert.equal(r.complete,true);assert.equal(r.reference_review.status,'ready_for_reference_review');
 assert.equal(r.reference_review.quality_assessed_by_reader,false);assert.equal(r.adoption.status,'not_assessed');
 assert.equal(r.adoption.formal_recommendation_invoked,false);assert.equal(r.adoption.action,'not_applied');
});
test('a reference recommendation cannot masquerade as a formal application receipt',t=>{
 const f=fixture(t),target=join(f.root,'normal-owner');mkdirSync(target);write(target,'README.user.txt','Unrelated user file.\n');
 const reference=putContentAddressedJson({storeRoot:f.storeRoot,artifact:{object_kind:'retained_instruction_reference_adoption_review_v1',reference_disposition:'candidate_for_user_review'}});
 assert.throws(()=>planEnvironmentTargetApply({storeRoot:f.storeRoot,receiptObjectDigest:reference.digest,targetRoot:target}),/Evolution application receipt.*schema validation/);
 assert.deepEqual(readdirSync(target),['README.user.txt']);assert.equal(readFileSync(join(target,'README.user.txt'),'utf8'),'Unrelated user file.\n');
});

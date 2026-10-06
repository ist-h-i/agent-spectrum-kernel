// Fixed synthetic child: no model, network, auth, command execution or grading.
import { writeSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const p=JSON.parse(readFileSync(0,'utf8')),b=p.binding;
const id=`00000000-0000-0000-0000-${String(p.session).padStart(12,'0')}`;
const event=x=>process.stdout.write(JSON.stringify(x)+'\n');
const entries=[{access:'read',path:{type:'path',path:'/'}},...[b.evidence_root,b.runtime_root,b.controller_root,b.auth_home,...(b.preparation_root?[b.preparation_root]:[]),...(b.peer_workspaces??[])].map(path=>({access:'deny',path:{type:'path',path}})),{access:'write',path:{type:'path',path:b.workspace}}];
const rows=[{type:'session_meta',payload:{id,cli_version:'0.157.1',model_provider:'ask_core_openai_no_retry',cwd:b.workspace}},{type:'turn_context',payload:{model:'gpt-6.1-sol',effort:'medium',cwd:b.workspace,approval_policy:'never',sandbox_policy:{type:'workspace-write',network_access:false},active_permission_profile:{id:'ask_core_native'},permission_profile:{type:'managed',network:'restricted',file_system:{type:'restricted',entries}},turn_id:`synthetic-turn-${p.condition}`}}];
if(p.scenario==='peer_override')entries.push({access:'read',path:{type:'path',path:(b.peer_workspaces?.[0]??'/synthetic-invalid-peer')+'/workspace/answer'}});
if(p.scenario==='bad_permissions')rows[1].payload.permission_profile.file_system.entries.pop();
if(p.scenario==='session_output_limit')writeSync(3,'x'.repeat(1100000));
writeSync(3,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
if(p.scenario==='startup_timeout'){setInterval(()=>{},1000);}else{
 event({type:'thread.started',thread_id:id});event({type:'turn.started'});
 if(p.scenario==='task_timeout')setInterval(()=>{},1000);
 else if(p.scenario==='invalid_utf8')process.stdout.write(Buffer.from([255,10]));
 else if(p.scenario==='duplicate_json')process.stdout.write('{"type":"turn.completed","type":"turn.failed"}\n');
 else if(p.scenario==='output_limit')process.stderr.write('x'.repeat(1100000));
 else{
  if(p.scenario==='pipe_holder')spawn(process.execPath,['-e','setTimeout(()=>{},6000)'],{stdio:['ignore',1,2,3],detached:true}).unref();
  if(p.scenario==='intervention_mutation')writeFileSync('AGENTS.md','synthetic intervention mutation');
  if(p.scenario==='extra_directory')mkdirSync('synthetic-extra-directory');
  if(p.scenario==='forbidden_mutation')writeFileSync('task.md','synthetic forbidden mutation');
  if(p.scenario==='allowed_mutation')writeFileSync('workspace/test/session-key.test.mjs','// synthetic scope-only change\n');
  event({type:'turn.completed',usage:p.scenario==='unknown_usage'?{}:{input_tokens:p.scenario==='token_threshold'?50000:100,output_tokens:1,cached_input_tokens:0}});
  if(p.scenario==='exit_failure')process.exitCode=1;
 }
}

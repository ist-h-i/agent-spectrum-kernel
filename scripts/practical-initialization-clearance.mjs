// Trusted host operation exception for one pre-session CLI initialization failure.
// This is not provider closure, quality evidence, an approval or a replay grant.
import assert from 'node:assert/strict';
import {existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonicalDigest,readJsonFileStrict,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
const json=p=>readJsonFileStrict(p,'initialization recovery evidence',16*1024*1024);
const bytes=p=>readStableFile(p,'initialization recovery evidence',16*1024*1024).bytes;
const ref=p=>({path:p,digest:hash(bytes(p))});
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const controlNames=['practical-initialization-clearance.mjs','practical-initialization-recovery-cli.mjs','practical-evaluation-runner.mjs','practical-grade-supplement.mjs'];
const initDiagnostic=/^(?:WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted \(os error 1\)\n)?Error: failed to initialize in-process app-server client: Operation not permitted \(os error 1\)\n?$/u;
function rootPath(p){assert.equal(resolve(p),p);assertNoSymlinkPathSegments(p,'initialization recovery root');return p;}
export function inspectInitializationRecoveryOperation(operationRoot){
 rootPath(operationRoot);const o=readRunJournal(operationRoot).state;assert.ok(o?.current&&!o.preparation);
 const cycleRoot=rootPath(o.current.root);assert.ok(cycleRoot.startsWith(operationRoot+'/'),'foreign operation cycle');
 for(const path of [o.current.config_path,o.current.profile_path]){assert.equal(resolve(path),path);assertNoSymlinkPathSegments(path,'original operation input');}
 const config=json(o.current.config_path),profile=json(o.current.profile_path);
 assert.equal(canonicalDigest(config),o.current.config_digest);assert.equal(ref(o.current.profile_path).digest,o.current.profile_digest);
 assert.equal(profile.kind,'full_practical_instruction_loop_profile_v1');assert.equal(profile.normal.target,null,'owner targets are outside this operational exception');
 assert.equal(config.runtime.profile_path,o.current.profile_path);assert.equal(config.runtime.profile_digest,o.current.profile_digest);
 assert.ok(same(config.policy,{...profile.policy,runtime_digest:canonicalDigest(config.runtime)}),'original policy/profile drift');
 const root=rootPath(profile.practical.root);assert.ok(root!==operationRoot&&!root.startsWith(operationRoot+'/')&&!operationRoot.startsWith(root+'/'),'evaluation overlaps operation');
 const cycle=readRunJournal(cycleRoot).state;assert.ok(same(cycle.policy,config.policy),'original cycle policy drift');
 const selection=cycle.outputs.select,s=readRunJournal(root).state;
 assert.equal(selection.practical_root,root);assert.ok(same(selection.practical_plan,s.plan));assert.equal(selection.practical_plan_digest,canonicalDigest(s.plan));
 assert.equal(canonicalDigest(selection.practical_runtime),s.plan.runtime_digest);
 if(cycle.pending){assert.equal(cycle.pending.kind,'evaluate');assert.ok(same(selection,cycle.pending.input.selection));}
 assert.equal(cycle.evaluation_decision.disposition,'approved');assert.equal(s.evaluation_decision.disposition,'approved');
 for(const p of [...config.runtime.source_pins,...Object.values(selection.practical_runtime.commands).flatMap(c=>c.pins)])assert.equal(ref(p.path).digest,p.digest,'original execution input drift');
 return {o,cycleRoot,cycle,config,profile,root,state:s,selection};
}
function originalEvidence(root,attempt,assessorJob){
 const sources=[],keep=p=>{sources.push(ref(p));return json(p);};
 const taskRoot=join(root,'jobs',canonicalDigest(attempt.job).slice(7)),assessRoot=join(root,'jobs',canonicalDigest(assessorJob).slice(7));
 const request=keep(join(taskRoot,'request.json')),result=keep(join(taskRoot,'result.json')),transport=keep(join(taskRoot,'transport.json'));
 assert.ok(same(request,attempt.job)&&same(result,attempt.result),'original failed Task differs from journal');
 assert.equal(result.status,'failed');assert.equal(result.output.execution_completed,false);assert.equal(result.output.context_integrity,'preserved');
 assert.equal(result.output.grade,null);assert.equal(result.output.grading_execution_state,'not_started');assert.equal(result.output.ready_for_next_root,false);
 assert.equal(transport.request_digest,canonicalDigest(request));assert.equal(transport.exit_code,0);assert.equal(transport.signal,null);
 const local=keep(join(taskRoot,'task-completion.json')),provider=keep(join(taskRoot,'task-codex-provider.json'));
 const started=keep(join(taskRoot,'task-started.json'));assert.equal(started.command_digest,provider.command_digest);
 assert.equal(provider.invocation_digest,canonicalDigest({request_digest:canonicalDigest(request),command_digest:provider.command_digest,role:'task'}));
 assert.ok(same(local,result.output.task));assert.equal(local.exit_code,1);assert.equal(local.process_group_closed,true);assert.equal(local.provider_terminal_confirmed,false);assert.equal(local.timed_out,false);assert.equal(local.signal,null);
 assert.equal(provider.kind,'practical_codex_provider_receipt_v1');assert.equal(provider.request_digest,canonicalDigest(request));assert.equal(provider.terminal,false);assert.equal(provider.session_id,null);
 assert.equal(provider.local.spawn_observed,true);assert.equal(provider.local.termination_confirmed,true);assert.equal(provider.local.exit_code,1);assert.equal(provider.local.error,null);
 for(const k of ['timed_out','interrupted','output_limited'])assert.equal(provider.local[k],false);
 for(const path of ['task-codex.stdout.jsonl','task-codex.stderr.log']){
  const artifact=provider.observation.artifacts.find(a=>a.path===path);assert.ok(artifact);const raw=bytes(join(taskRoot,path));
  assert.equal(hash(raw),artifact.digest);sources.push(ref(join(taskRoot,path)));
  if(path.endsWith('stdout.jsonl'))assert.equal(raw.length,0);else assert.match(raw.toString('utf8'),initDiagnostic);
 }
 const assess=keep(join(assessRoot,'request.json')),assessTransport=keep(join(assessRoot,'transport.json'));
 assert.ok(same(assess,assessorJob));assert.equal(assess.kind,'assess');assert.equal(assessTransport.request_digest,canonicalDigest(assess));assert.equal(assessTransport.exit_code,1);assert.equal(assessTransport.signal,null);
 assert.equal(assess.input.packet.attempt_key,attempt.id);assert.equal(assess.input.packet.worker_job_digest,canonicalDigest(attempt.job));assert.equal(assess.input.packet.result_digest,canonicalDigest(attempt.result));
 assert.equal(existsSync(join(assessRoot,'result.json')),false,'a returned assessor result requires ordinary inspection');
 for(const [name,expected]of [['stdout.log',''],['stderr.log','assessment incomplete; inspect saved session, do not replay automatically\n']]){
  const p=join(assessRoot,name);assert.equal(bytes(p).toString('utf8'),expected);sources.push(ref(p));
 }
 assert.deepEqual(readdirSync(join(assessRoot,'assessment-session')),[],'assessor has additional evidence; inspect it first');
 const taskProcess=keep(join(taskRoot,'process.json')),assessProcess=keep(join(assessRoot,'process.json'));
 return {sources,taskRoot,assessRoot,provider,workerPids:[taskProcess.pid,assessProcess.pid]};
}
export function observeInitializationRecoveryProcesses({taskRoot,assessRoot,workerPids},inspect=spawnSync){
 for(const pid of workerPids){assert.ok(Number.isSafeInteger(pid)&&pid>0);try{process.kill(pid,0);assert.fail('original local worker is still present');}catch(error){if(error.code!=='ESRCH')throw error;}}
 // Include orphaned local writers, not merely descendants of the exited worker.
 const r=inspect(process.platform==='darwin'?'/usr/sbin/lsof':'lsof',['-nP','-a','-u',String(process.getuid()),'-d','cwd','-Fpn'],{encoding:'utf8',maxBuffer:16*1024*1024});
 assert.ok(!r.error&&r.status===0&&!r.stderr.trim(),'cannot completely inspect owned local writers');
 const roots=[taskRoot,assessRoot],matches=[];let pid=null,selfVisible=false;
 for(const line of r.stdout.split('\n')){if(line.startsWith('p')){pid=Number(line.slice(1));assert.ok(Number.isSafeInteger(pid)&&pid>0,'invalid process observation');}else if(line.startsWith('n')){assert.ok(pid,'cwd without process identity');const p=line.slice(1);if(pid===process.pid&&p===process.cwd())selfVisible=true;if(roots.some(root=>p===root||p.startsWith(root+'/')))matches.push({pid,cwd:p});}}
 assert.equal(selfVisible,true,'observer cannot see its own cwd; process inspection is incomplete');
 assert.deepEqual(matches,[],'an original local writer remains in an owned workspace');
 return {kind:'owned_local_writer_observation_v1',at:new Date().toISOString(),worker_pids:workerPids,workers_absent:true,owned_roots:roots,matching_writers:[],same_uid_cwd_observation:true,observer_visible:true,provider_closure_inferred:false,
  scope:'Known worker PIDs and same-UID processes with an owned cwd; not every open descriptor from another cwd or remote computation.'};
}
export function preparePracticalInitializationClearance({operationRoot,reason},observe=observeInitializationRecoveryProcesses){
 assert.ok(typeof reason==='string'&&reason.trim()&&reason.length<=4096);
 const {o,cycleRoot,cycle,config,root,state:s,selection}=inspectInitializationRecoveryOperation(operationRoot);
 assert.equal(cycle.pending?.kind,'evaluate');assert.equal(cycle.evaluation_decision?.disposition,'approved');
 assert.equal(s.status,'ai_assessment_uncertain');assert.equal(s.active?.kind,'assess');assert.ok(s.recovery);assert.equal(s.gate,null);assert.equal(s.evaluation_decision.disposition,'approved');
 assert.equal(canonicalDigest(s.plan),cycle.outputs.select.practical_plan_digest);assert.ok(same(cycle.outputs.select.practical_runtime,cycle.pending.input.selection.practical_runtime));
 const attempt=s.attempts.find(a=>a.id===s.recovery.entry_id);assert.ok(attempt&&same(attempt.job,s.recovery.job));assert.equal(attempt.job.input.attempt,1,'only first-attempt initialization failure');
 assert.ok(same(s.active.input.packet,s.recovery.packet));
 for(const p of [operationRoot,cycleRoot,root])assert.equal(existsSync(join(p,'.advance-lock')),false,'an original coordinator is active');
 const evidence=originalEvidence(root,attempt,s.active),observation=observe(evidence);
 const command=selection.practical_runtime.commands.assess;
 assert.ok(command?.model_calls&&command.pins.some(p=>p.path.endsWith('/practical-evaluation-assessor.mjs')),'standard read-only assessor required');
 for(const p of [...config.runtime.source_pins,...selection.practical_runtime.commands.trial.pins,...command.pins])assert.equal(ref(p.path).digest,p.digest,'original execution input drift');
 const clearance={kind:'practical_initialization_continuation_clearance_v1',run_root:root,operation_root:operationRoot,cycle_root:cycleRoot,
  approved_plan_digest:canonicalDigest(s.plan),case_approval_digest:canonicalDigest(s.evaluation_decision),original_attempt_id:attempt.id,
  original_job_digest:canonicalDigest(attempt.job),original_result_digest:canonicalDigest(attempt.result),original_assessor_job:s.active,
  original_assessor_job_digest:canonicalDigest(s.active),command_digest:evidence.provider.command_digest,invocation_digest:evidence.provider.invocation_digest,
  reason,selection_basis:'execution_failure',scope:'isolated_retry_after_local_initialization_failure',safe_to_continue:true,process_closed:false,
  assessor_disposition:'Retire this read-only judgment without replay; local writer absence observed, remote outcome/cost remain Unknown.',
  limits:['This is a host operational exception, not positive provider closure or quality evidence.','Original failure, provider terminal false and assessor Unknown remain recorded.','Only the failed first Task may use its original one-row retry budget in a fresh workspace. No owner write or extra approval is granted.'],
  parent_binding:{config_path:o.current.config_path,config_digest:o.current.config_digest,profile_path:o.current.profile_path,profile_digest:o.current.profile_digest,cycle_policy_digest:canonicalDigest(cycle.policy),selection_digest:canonicalDigest(selection)},
  control_implementation:controlNames.map(n=>ref(join(import.meta.dirname,n))),
  local_observation:observation,sources:evidence.sources};
 validatePracticalInitializationClearance(clearance,{root,state:s});return clearance;
}
export function validatePracticalInitializationClearance(clearance,{root,state,checkProcesses=false}={}){
 assert.equal(clearance.kind,'practical_initialization_continuation_clearance_v1');assert.equal(clearance.run_root,root);assert.equal(clearance.scope,'isolated_retry_after_local_initialization_failure');assert.equal(clearance.safe_to_continue,true);assert.equal(clearance.process_closed,false);
 assert.equal(clearance.approved_plan_digest,canonicalDigest(state.plan));assert.equal(clearance.case_approval_digest,canonicalDigest(state.evaluation_decision));
 const parent=inspectInitializationRecoveryOperation(clearance.operation_root);assert.equal(parent.root,root);assert.equal(parent.cycleRoot,clearance.cycle_root);
 assert.ok(same(clearance.parent_binding,{config_path:parent.o.current.config_path,config_digest:parent.o.current.config_digest,profile_path:parent.o.current.profile_path,profile_digest:parent.o.current.profile_digest,cycle_policy_digest:canonicalDigest(parent.cycle.policy),selection_digest:canonicalDigest(parent.selection)}),'continuation parent binding changed');
 const attempt=state.attempts.find(a=>a.id===clearance.original_attempt_id);assert.ok(attempt);assert.equal(clearance.original_job_digest,canonicalDigest(attempt.job));assert.equal(clearance.original_result_digest,canonicalDigest(attempt.result));
 assert.equal(attempt.job.input.attempt,1,'only first-attempt initialization failure');
 const assessor=parent.selection.practical_runtime.commands.assess;assert.ok(assessor?.model_calls&&assessor.argv[1].endsWith('/practical-evaluation-assessor.mjs')&&assessor.pins.some(p=>p.path===assessor.argv[1]),'standard read-only assessor required');
 assert.equal(clearance.original_assessor_job_digest,canonicalDigest(clearance.original_assessor_job));assert.equal(clearance.original_assessor_job.kind,'assess');
 const evidence=originalEvidence(root,attempt,clearance.original_assessor_job);assert.ok(same(clearance.sources,evidence.sources),'initialization evidence changed');
 assert.equal(clearance.command_digest,evidence.provider.command_digest);assert.equal(clearance.invocation_digest,evidence.provider.invocation_digest);
 const worker=parent.selection.practical_runtime.commands.trial;assert.ok(worker.argv[1].endsWith('/practical-evaluation-worker.mjs'));
 const settings=json(worker.argv[2]);assert.equal(ref(worker.argv[2]).digest,worker.argv[3]);
 assert.equal(canonicalDigest(settings.conditions[attempt.row.condition].command),clearance.command_digest,'failed Task command differs from approved condition');
 assert.ok(same(attempt.row,attempt.job.input.row));
 assert.equal(clearance.local_observation.workers_absent,true);assert.deepEqual(clearance.local_observation.matching_writers,[]);assert.equal(clearance.local_observation.provider_closure_inferred,false);
 assert.equal(clearance.local_observation.same_uid_cwd_observation,true);assert.equal(clearance.local_observation.observer_visible,true);
 assert.deepEqual(clearance.control_implementation.map(p=>p.path).sort(),controlNames.map(n=>join(import.meta.dirname,n)).sort(),'exact host controller sources required');
 for(const p of clearance.control_implementation)assert.equal(ref(p.path).digest,p.digest,'recovery controller drift');
 const observation=checkProcesses?observeInitializationRecoveryProcesses(evidence):null;
 return {attempt,observation};
}

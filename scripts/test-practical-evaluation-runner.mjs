import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,mkdirSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {advancePracticalEvaluation,inspectPracticalEvaluation} from './practical-evaluation-runner.mjs';
import {createPracticalEvaluationCommandRuntime} from './instruction-loop-command-runtime.mjs';
const context={cli_version:'fixture-v1',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
function fixture(t){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-practical-eval-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const plan={kind:'practical_evaluation_plan_v1',id:'fixture',goal:'Reduce rework while preserving task quality.',runtime_digest:canonicalDigest('fixture'),evidence_kind:'synthetic',
    conditions:['baseline','candidate'].map(id=>({id,context})),cases:[{id:'local',task_ref:'local-task',input_ref:'fixed-input',success_criteria_ref:'public-check-v1',public_input_digest:canonicalDigest('input')}],
    repetitions:1,recovery:{max_extra_trials:4,max_retries_per_row:2,allow_exclusion:true,allow_reference:true,required_dimensions:['execution','duration']},
    global_context:{ask_presence:'unknown',change_status:'unknown'}};
  const calls=[],receipts=new Map(),runtime={digest:plan.runtime_digest,retrySupported:true,inspect:async j=>receipts.get(canonicalDigest(j))??null};
  runtime.trial=async job=>{calls.push(job);const result={request_digest:canonicalDigest(job),status:'completed',output:{ready_for_next_root:true,cli_seconds:1,
    notes:{outcome:'pass',evidence_refs:['synthetic-check'],metrics:{duration_ms:1000}}}};receipts.set(canonicalDigest(job),result);return result;};
  const run=extra=>advancePracticalEvaluation({root:join(dir,'run'),plan,runtime,...extra});
  return {dir,root:join(dir,'run'),plan,runtime,calls,receipts,run};
}
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic human case approval only.'});
const choice=(packet,action='use',retry_scope=null)=>({packet_digest:canonicalDigest(packet),action,retry_scope,
  reason:'Use the useful evidence and repair only the stated irregularity.',selection_basis:retry_scope==='case'?'fair_comparison':action==='retry'?'execution_failure':'practical_reference',
  used_dimensions:packet.available_dimensions,comparison_limits:['Original failures and any replacement selection remain visible; no formal causal claim.']});
test('automatic recovery receives the current case decision separately from earlier authoring context',async t=>{
 const f=fixture(t),jobs=[];
 f.plan.goal='Prepare a candidate only; do not start Eval yet. Previous run shared a CPU load.';
 f.plan.recovery.required_dimensions.push('quality');
 const trial=f.runtime.trial;
 f.runtime.trial=async job=>{const r=await trial(job);r.output.quality_observation_issue='closed grader has no valid judgment';return r;};
 const {buildPracticalEvaluationAssessmentPrompt}=await import('./practical-evaluation-assessor.mjs');
 f.runtime.assess=async job=>{jobs.push(structuredClone(job));return {request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet,'reference')};};
 const pending=await f.run();assert.equal(jobs.length,0);
 const decision={...approve(pending),reason:'Now approve these cases. A higher score may justify reasonable resource increases. '+ 'Retain the full qualification. '.repeat(400)};
 const end=await f.run({decision});assert.equal(end.status,'completed');assert.equal(f.calls.length,2);assert.equal(end.report.extra_trials,0);
 assert.equal(jobs.length,2);
 for(const job of jobs){
  assert.deepEqual(job.input.evaluation_decision,decision,'current approved reason must not be lost behind the old plan goal');
  assert.equal(job.input.goal,f.plan.goal,'retain original plan context in the immutable job');
  const prompt=buildPracticalEvaluationAssessmentPrompt(job),payload=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
  assert.deepEqual(payload.evaluation_decision,decision);
  assert.equal(payload.improvement_context,f.plan.goal);assert.equal(payload.goal,undefined);
  assert.equal(payload.packet_digest,canonicalDigest(job.input.packet));
  assert.match(prompt,/previous-run observations are not facts about the current attempt/);
  assert.match(prompt,/does not grant execution or application authority/);
 }
});
for(const scope of ['trial','case'])test(`AI ${scope} retry uses fresh attempts, keeps every original result and records selection`,async t=>{
  const f=fixture(t),trial=f.runtime.trial;
  f.runtime.trial=async job=>{if(job.input.row.condition==='candidate'&&job.input.attempt===1){f.calls.push(job);const result={request_digest:canonicalDigest(job),status:'failed',output:{ready_for_next_root:true,cli_seconds:0.1}};f.receipts.set(canonicalDigest(job),result);return result;}return trial(job);};
  f.runtime.assess=async job=>({request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet,'retry',scope)});
  const pending=await f.run();assert.equal(pending.status,'awaiting_evaluation_approval');assert.equal(f.calls.length,0);
  const end=await f.run({decision:approve(pending)});assert.equal(end.status,'completed');
  assert.equal(f.calls.length,scope==='trial'?3:4);assert.equal(end.report.extra_trials,scope==='trial'?1:2);
  assert.equal(new Set(f.calls.map(j=>j.key)).size,f.calls.length);
  assert.equal(end.report.all_attempts.filter(a=>a.included_in_comparison).length,2);
  assert.equal(end.report.all_attempts.find(a=>a.original_result.status==='failed').included_in_comparison,false);
  assert.equal(end.report.recovery_decisions[0].assessment.retry_scope,scope);
  assert.equal(end.report.pragmatic.summaries.length,2);assert.equal(end.report.formal_admission_implied,false);
  assert.ok(end.report.resources_all_attempts.duration_ms.known_total>2000);
  assert.equal(end.report.assessment_overhead.complete_cost,null);assert.equal(end.report.assessment_attempts.length,1);
  const count=f.calls.length;await f.run();assert.equal(f.calls.length,count);
});
test('partial usage remains null while AI uses known time/outcomes and proceeds without a perfect dataset',async t=>{
  const f=fixture(t);f.plan.recovery.required_dimensions.push('usage');
  f.runtime.assess=async job=>({request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet)});
  const s=await f.run(),end=await f.run({decision:approve(s)});
  assert.equal(end.status,'completed');assert.equal(f.calls.length,2);assert.equal(end.report.recovery_decisions.length,2);
  assert.ok(end.report.pragmatic.summaries.every(s=>s.metrics.input_tokens.observed_count===0&&s.metrics.input_tokens.unknown_count===1));
  assert.ok(end.report.pragmatic.summaries.every(s=>s.metrics.duration_ms.known_values[0]===1000));
});
test('practical report retains typed per-attempt source quality and separates partially known grader usage',async t=>{
 const f=fixture(t),original=f.runtime.trial,summary={kind:'fixed_point_reference_summary_v1',exact_lower:'1',exact_upper:'2',scale_maximum:'10',mandatory_compliance:null,
  observation_completeness_reported:false,runtime_acceptance_verified:null,critical_status:'undetermined',partial_items:1,undetermined_items:1,formal_admission:false,evidence_truth_checked:false,capture_complete:false};
 f.runtime.trial=async job=>{const r=await original(job);r.output.quality_observation={kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'unknown',evidence_refs:[{path:'judgment.json',digest:canonicalDigest('judgment')}],fixed_reference:summary};
  r.output.grading_execution_state='completed';r.output.grade={exit_code:0,duration_ms:20,provider_observation:{artifacts:r.output.quality_observation.evidence_refs,metrics:{input_tokens:job.input.row.condition==='baseline'?7:null,output_tokens:2,cached_tokens:null}}};return r;};
 const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.report.all_attempts.length,2);
 assert.equal(end.report.all_attempts[0].quality_observation.fixed_reference.exact_lower,'1');
 assert.deepEqual(end.report.grading_overhead.resources.input_tokens,{known_total:7,observed_count:1,unknown_count:1});
 assert.equal(end.report.grading_overhead.resources.cached_tokens.known_total,null);assert.equal(end.report.grading_overhead.remote_cost,null);
 assert.equal(end.report.resources_all_attempts.input_tokens.known_total,null,'grading input is not task input');
 const {summarizeInstructionLoopEvaluation}=await import('./instruction-loop-feedback.mjs'),projection=summarizeInstructionLoopEvaluation(end.report);
 assert.equal(projection.cases[0].conditions[0].fixed_reference.exact_upper,'2');assert.equal(projection.raw_logs_included,false);
});
test('valid partial source quality is available evidence without forcing a task retry for runtime Unknown',async t=>{
 const f=fixture(t),original=f.runtime.trial;f.plan.recovery.required_dimensions.push('quality');
 f.runtime.trial=async job=>{const r=await original(job),refs=[{path:'judgment.json',digest:canonicalDigest('judgment')}];
  r.output.notes.outcome='unknown';r.output.quality_observation={kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'unknown',evidence_refs:refs,fixed_reference:null};
  r.output.grade={exit_code:0,provider_observation:{artifacts:refs}};return r;};
 f.runtime.assess=async()=>{throw Error('usable scoped evidence is not missing quality');};
 const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.status,'completed');assert.equal(f.calls.length,2);assert.equal(end.report.recovery_decisions.length,0);
});
test('AI can reference a closed grading-only incident without rerunning an expensive task',async t=>{
 const f=fixture(t),original=f.runtime.trial;f.runtime.trial=async job=>{const r=await original(job);r.output.quality_observation_issue='invalid optional grading reference';return r;};
 f.runtime.assess=async job=>{assert.ok(job.input.packet.issues.includes('grading_quality_unusable'));assert.ok(!job.input.packet.available_dimensions.includes('quality'));return {request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet,'reference')};};
 const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.status,'completed');assert.equal(f.calls.length,2);assert.equal(end.report.extra_trials,0);
 assert.ok(end.report.all_attempts.every(a=>a.observation.outcome==='unknown'));assert.equal(end.report.recovery_decisions.length,2);
});
test('an empty Unknown quality envelope is missing evidence, not usable partial quality',async t=>{
 const f=fixture(t),original=f.runtime.trial;f.plan.recovery.required_dimensions.push('quality');
 f.runtime.trial=async job=>{const r=await original(job);r.output.notes.outcome='unknown';r.output.quality_observation={kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'unknown',evidence_refs:[],fixed_reference:null};r.output.grade={exit_code:0,provider_observation:{artifacts:[]}};return r;};
 f.runtime.assess=async job=>{assert.ok(job.input.packet.missing_dimensions.includes('quality'));return {request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet,'reference')};};
 const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.report.recovery_decisions.length,2);assert.equal(f.calls.length,2);
});
test('uncertain processes cannot be retried or followed by another root; AI can finish a useful partial report',async t=>{
  const f=fixture(t);f.runtime.trial=async job=>{f.calls.push(job);return {status:'running'};};
  const start=await f.run();let state=await f.run({decision:approve(start)});
  assert.equal(state.status,'awaiting_ai_recovery');assert.equal(state.pending_gate,null);
  const packet=state.pending_recovery;assert.equal(packet.retry_available,false);
  await assert.rejects(f.run({assessment:choice(packet,'retry','trial')}),/unavailable/);
  state=await f.run({assessment:choice(packet,'reference')});assert.equal(state.status,'completed');assert.equal(f.calls.length,1);
  assert.equal(state.report.execution_suspended,true);assert.equal(state.report.all_attempts.length,1);
  assert.ok(state.report.pragmatic.blocks[0].trials.every(t=>t.outcome==='unknown'));
});
test('loss of a worker response resumes by inspection, not by replay',async t=>{
  const f=fixture(t),trial=f.runtime.trial;f.runtime.trial=async job=>{await trial(job);throw new Error('synthetic response loss');};
  const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.status,'completed');assert.equal(f.calls.length,2);
  assert.equal(end.report.all_attempts.length,2);assert.ok(end.report.all_attempts.every(a=>a.original_result.status==='completed'));
  assert.ok(end.report.all_attempts.every(a=>a.result_observation_history.some(r=>r.status==='unknown')));
});
test('new terminal evidence refreshes the AI packet before a stale recovery choice can be consumed',async t=>{
  const f=fixture(t);f.runtime.trial=async job=>{f.calls.push(job);return {status:'running'};};
  const start=await f.run(),pending=await f.run({decision:approve(start)}),oldPacket=pending.pending_recovery;
  const job=f.calls[0];f.receipts.set(canonicalDigest(job),{request_digest:canonicalDigest(job),status:'failed',output:{ready_for_next_root:true,cli_seconds:2}});
  await assert.rejects(f.run({assessment:choice(oldPacket,'reference')}),/different packet/);
  const refreshed=inspectPracticalEvaluation(f.root);assert.equal(refreshed.pending_recovery.process_closed,true);
  assert.notEqual(refreshed.pending_recovery_digest,canonicalDigest(oldPacket));assert.equal(f.calls.length,1);
});
test('an invalid automatic AI judgment is recorded and can be corrected by the host AI without a human gate or replay',async t=>{
  const f=fixture(t);f.plan.recovery.required_dimensions.push('usage');
  f.runtime.assess=async job=>({request_digest:canonicalDigest(job),status:'completed',output:{...choice(job.input.packet),used_dimensions:['usage']}});
  const start=await f.run();let state=await f.run({decision:approve(start)});
  assert.equal(state.status,'awaiting_ai_recovery');assert.equal(state.pending_gate,null);
  assert.equal(state.assessment_rejections.length,1);assert.equal(state.recovery_decisions.length,0);
  while(state.status==='awaiting_ai_recovery')state=await f.run({assessment:choice(state.pending_recovery)});
  assert.equal(state.status,'completed');assert.equal(f.calls.length,2);assert.equal(state.report.rejected_assessments.length,2);
  assert.equal(state.report.recovery_decisions.length,2);
});
test('exclusion does not erase failures, retry budgets cannot be increased after approval, and low scores do not trigger retries',async t=>{
  const f=fixture(t),trial=f.runtime.trial;f.plan.recovery.max_extra_trials=0;
  f.runtime.trial=async job=>{const r=await trial(job);if(job.input.row.condition==='candidate'){r.status='failed';f.receipts.set(canonicalDigest(job),r);}return r;};
  f.runtime.assess=async job=>{assert.equal(job.input.packet.retry_available,false);return {request_digest:canonicalDigest(job),status:'completed',output:choice(job.input.packet,'exclude')};};
  const s=await f.run(),end=await f.run({decision:approve(s)});assert.equal(end.report.all_attempts.length,2);
  assert.equal(end.report.all_attempts.filter(a=>a.included_in_comparison).length,1);
  f.plan.recovery.max_extra_trials=1;await assert.rejects(f.run(),/change approved plan/);
  const g=fixture(t),good=g.runtime.trial;g.runtime.trial=async job=>{const r=await good(job);r.output.notes.outcome='fail';return r;};
  g.runtime.assess=async()=>{throw new Error('valid quality failures are observations, not automatic retry reasons');};
  const a=await g.run(),b=await g.run({decision:approve(a)});assert.equal(b.report.recovery_decisions.length,0);
  assert.ok(b.report.pragmatic.summaries.every(s=>s.reported_outcome_counts.fail===1));
});
test('real local public checks use isolated fresh workspaces and durable process receipts without a private grader',async t=>{
  const f=fixture(t),source=join(f.dir,'check.mjs');writeFileSync(source,'console.log("public criterion checked");\n');
  const files=[{source,target:'check.mjs',digest:hash(readFileSync(source))}];
  f.plan.cases[0].public_input_digest=canonicalDigest(files.map(({target,digest})=>({target,digest})));
  const command={argv:[process.execPath,'check.mjs'],pins:[{path:source,digest:hash(readFileSync(source))}],model_calls:false,timeout_ms:5000};
  const settings=join(f.dir,'settings.json');writeFileSync(settings,JSON.stringify({cases:{local:{files}},conditions:{baseline:{command,command_role:'check'},candidate:{command,command_role:'check'}}}));
  const worker=resolve(import.meta.dirname,'practical-evaluation-worker.mjs'),pin={path:settings,digest:hash(readFileSync(settings))};
  const definition={commands:{trial:{argv:[process.execPath,worker,settings,pin.digest,'execute'],inspect_argv:[process.execPath,worker,settings,pin.digest,'inspect'],
    pins:[pin,{path:worker,digest:hash(readFileSync(worker))}],model_calls:false}}};
  const runtime=createPracticalEvaluationCommandRuntime({definition});f.plan.runtime_digest=runtime.digest;
  const run=extra=>advancePracticalEvaluation({root:f.root,plan:f.plan,runtime,...extra});
  const s=await run(),end=await run({decision:approve(s)});
  assert.equal(end.status,'completed');assert.equal(end.report.all_attempts.length,2);
  assert.ok(end.report.all_attempts.every(a=>a.original_result.output.ready_for_next_root&&a.observation.outcome==='pass'));
  assert.ok(end.report.all_attempts.every(a=>a.original_result.output.task.closure_scope.includes('local_owned_process_group')));
  assert.equal(inspectPracticalEvaluation(f.root).report.all_attempts.length,2);
});
test('legal delimiter-like labels cannot alias another trial or its recovery decision',async t=>{
  const f=fixture(t);f.plan.cases=['a','a-r1-b'].map(id=>({...f.plan.cases[0],id}));
  f.plan.conditions=['b-r1-c','c'].map(id=>({id,context}));
  const s=await f.run(),end=await f.run({decision:approve(s)});
  assert.equal(end.report.all_attempts.length,4);assert.equal(new Set(end.report.all_attempts.map(a=>a.id)).size,4);
});
test('a public check exit 1 is a completed quality failure, not an execution retry trigger',async t=>{
  const f=fixture(t),source=join(f.dir,'failing-check.mjs');writeFileSync(source,'console.log("criterion unmet");process.exit(1);\n');
  const {executePracticalEvaluationWorker}=await import('./practical-evaluation-worker.mjs');
  const {mkdirSync}=await import('node:fs');const dir=join(f.dir,'direct');mkdirSync(dir);
  const files=[{source,target:'check.mjs',digest:hash(readFileSync(source))}];
  const job={kind:'trial',key:'quality-fail',input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
  const command={argv:[process.execPath,'check.mjs'],pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:false};
  const result=await executePracticalEvaluationWorker({cases:{local:{files}},conditions:{baseline:{command,command_role:'check'}}},job,join(dir,'result.json'));
  assert.equal(result.status,'completed');assert.equal(result.output.notes.outcome,'fail');assert.equal(result.output.ready_for_next_root,true);
});
test('post-trial instruction additions and mode changes become explicit recovery evidence',async t=>{
  const f=fixture(t),source=join(f.dir,'change-context.mjs'),rules=join(f.dir,'rules.md');
  writeFileSync(source,'import {chmodSync,writeFileSync} from "node:fs";chmodSync("AGENTS.md",0o400);writeFileSync("CLAUDE.md","New local instruction");\n');
  writeFileSync(rules,'Fixed local instruction\n',{mode:0o600});
  const {executePracticalEvaluationWorker}=await import('./practical-evaluation-worker.mjs'),{mkdirSync,lstatSync}=await import('node:fs');
  const directory=join(f.dir,'context-attempt');mkdirSync(directory);
  const files=[{source,target:'task.mjs',digest:hash(readFileSync(source))}],job={kind:'trial',key:'context-change',input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
  const command={argv:[process.execPath,'task.mjs'],pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:false};
  const result=await executePracticalEvaluationWorker({cases:{local:{files}},conditions:{baseline:{command,files:[{source:rules,target:'AGENTS.md',digest:hash(readFileSync(rules)),mode:0o600}]}}},job,join(directory,'result.json'));
  assert.equal(result.output.context_integrity,'changed');assert.ok(result.output.context_integrity_scope.includes('ambient/global inputs excluded'));
  assert.equal(lstatSync(rules).mode&0o777,0o600);assert.equal(readFileSync(rules,'utf8'),'Fixed local instruction\n');
});
test('a failed model-labelled fixture needs an actual provider closure receipt before retry is safe',async t=>{
  const f=fixture(t),source=join(f.dir,'provider-fixture.mjs');
  writeFileSync(source,'import {writeFileSync} from "node:fs";if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({request_digest:process.argv[3],command_digest:process.argv[4],invocation_digest:process.argv[5],terminal:true,provider_ref:"synthetic-provider-ended"}));process.exit(2);\n');
  const {executePracticalEvaluationWorker}=await import('./practical-evaluation-worker.mjs'),{mkdirSync}=await import('node:fs');
  const previous=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
  try{
    const files=[{source,target:'provider.mjs',digest:hash(readFileSync(source))}];
    for(const receipt of [false,true]){
      const directory=join(f.dir,receipt?'known-provider':'unknown-provider');mkdirSync(directory);
      const job={kind:'trial',key:'provider-'+receipt,input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
      const command={argv:[process.execPath,'provider.mjs',...(receipt?['{evaluation_control_root}/provider.json','{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}']:[])],
        pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:true,...(receipt?{provider_closure_path:'provider.json'}:{})};
      const result=await executePracticalEvaluationWorker({cases:{local:{files}},conditions:{baseline:{command}}},job,join(directory,'result.json'));
      assert.equal(result.status,'failed');assert.equal(result.output.task.process_group_closed,true);
      assert.equal(result.output.ready_for_next_root,receipt);assert.equal(result.output.task.provider_terminal_confirmed,receipt);
    }
  }finally{if(previous===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=previous;}
});
test('a task provider receipt cannot be reused by an identical grader invocation',t=>{
  const f=fixture(t),source=join(f.dir,'two-phases.mjs');
  writeFileSync(source,'import {existsSync,readFileSync,writeFileSync} from "node:fs";const n=existsSync("counter")?Number(readFileSync("counter")):0;writeFileSync("counter",String(n+1));if(n===0)writeFileSync(process.argv[2],JSON.stringify({request_digest:process.argv[3],command_digest:process.argv[4],invocation_digest:process.argv[5],terminal:true,provider_ref:"synthetic-task-complete"}));process.exit(n===0?0:2);\n');
  const worker=resolve(import.meta.dirname,'practical-evaluation-worker.mjs');
  for(const scoped of [false,true]){
    const directory=join(f.dir,scoped?'scoped':'reused');mkdirSync(directory);
    const providerPath=scoped?'provider-{evaluation_command_role}.json':'provider.json';
    const files=[{source,target:'provider.mjs',digest:hash(readFileSync(source))}];
    const job={kind:'trial',key:'phase-'+scoped,input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
    const command={argv:[process.execPath,'provider.mjs','{evaluation_control_root}/'+providerPath,'{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}'],
      pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:true,provider_closure_path:providerPath};
    const settings=join(directory,'settings.json'),request=join(directory,'request.json'),result=join(directory,'result.json');
    writeFileSync(settings,JSON.stringify({cases:{local:{files,grader:command}},conditions:{baseline:{command}}}));writeFileSync(request,JSON.stringify(job));
    const invoked=spawnSync(process.execPath,[worker,settings,hash(readFileSync(settings)),'execute',request,result],{env:{...process.env,ASK_LOOP_MODEL_CALLS_AUTHORIZED:'1'},encoding:'utf8'});
    const saved=JSON.parse(readFileSync(result));
    if(scoped){assert.equal(invoked.status,0);assert.equal(saved.output.grade.provider_terminal_confirmed,false);assert.equal(saved.output.ready_for_next_root,false);
      assert.equal(readFileSync(join(directory,'workspace/counter'),'utf8'),'2');}
    else{assert.equal(invoked.status,1);assert.equal(saved.output.grade,null);assert.equal(saved.output.grading_execution_state,'not_started');
      assert.equal(saved.output.ready_for_next_root,true);assert.match(saved.output.reason,/fresh for each command invocation/);
      assert.equal(readFileSync(join(directory,'workspace/counter'),'utf8'),'1');}
    const oldReceipt=JSON.parse(readFileSync(join(directory,scoped?'provider-task.json':'provider.json')));
    assert.equal(oldReceipt.invocation_digest,canonicalDigest({request_digest:canonicalDigest(job),command_digest:canonicalDigest(command),role:'task'}));
  }
});
test('unreadable observation directories do not erase a known process completion',async t=>{
  const f=fixture(t),source=join(f.dir,'restricted-dir.mjs');writeFileSync(source,'import {mkdirSync,chmodSync} from "node:fs";mkdirSync("restricted");chmodSync("restricted",0);\n');
  const {executePracticalEvaluationWorker}=await import('./practical-evaluation-worker.mjs'),directory=join(f.dir,'restricted-attempt');mkdirSync(directory);
  const files=[{source,target:'task.mjs',digest:hash(readFileSync(source))}],job={kind:'trial',key:'collector',input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
  const command={argv:[process.execPath,'task.mjs'],pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:false};
  try{
    const saved=await executePracticalEvaluationWorker({cases:{local:{files}},conditions:{baseline:{command}}},job,join(directory,'result.json'));
    assert.equal(saved.status,'completed');assert.equal(saved.output.ready_for_next_root,true);
    if(process.getuid?.()!==0)assert.equal(saved.output.context_integrity,'unverified');
  }finally{chmodSync(join(directory,'workspace/restricted'),0o700);}
});
test('task changes to a pinned workspace grader cannot produce a quality result',t=>{
  const f=fixture(t),source=join(f.dir,'edit-grader.mjs'),grader=join(f.dir,'criterion.mjs');
  writeFileSync(source,'import {writeFileSync} from "node:fs";writeFileSync("criterion.mjs","process.exit(0);\\n");\n');
  writeFileSync(grader,'process.exit(1);\n');
  const directory=join(f.dir,'grader-drift');mkdirSync(directory);
  const files=[{source,target:'task.mjs',digest:hash(readFileSync(source))},{source:grader,target:'criterion.mjs',digest:hash(readFileSync(grader))}];
  const job={kind:'trial',key:'grader-drift',input:{row:{case_id:'local',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
  const command={argv:[process.execPath,'task.mjs'],pins:[{path:source,digest:hash(readFileSync(source))}],timeout_ms:5000,model_calls:false};
  const settings=join(directory,'settings.json'),request=join(directory,'request.json'),result=join(directory,'result.json');
  writeFileSync(settings,JSON.stringify({cases:{local:{files,grader:{...command,argv:[process.execPath,'criterion.mjs'],pins:[{path:grader,digest:hash(readFileSync(grader))}]}}},conditions:{baseline:{command}}}));
  writeFileSync(request,JSON.stringify(job));
  const worker=resolve(import.meta.dirname,'practical-evaluation-worker.mjs');
  const invoked=spawnSync(process.execPath,[worker,settings,hash(readFileSync(settings)),'execute',request,result],{encoding:'utf8'});
  assert.equal(invoked.status,1);const saved=JSON.parse(readFileSync(result));
  assert.match(saved.output.reason,/workspace command pin drift/);assert.equal(saved.output.notes.outcome,'unknown');
  assert.equal(saved.output.task.exit_code,0);assert.equal(saved.output.ready_for_next_root,true);assert.equal(saved.output.grading_execution_state,'not_started');
  assert.equal(readFileSync(grader,'utf8'),'process.exit(1);\n');
});

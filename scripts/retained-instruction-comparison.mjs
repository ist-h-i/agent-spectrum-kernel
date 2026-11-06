// Read-only connection to frozen external trial_runner.py records.
// This module never launches a process, grades a candidate, grants trust or applies files.
import assert from 'node:assert/strict';
import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, readStableBytes,
  parseJsonRejectDuplicateKeys, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { verifyInstructionEnvironment, instructionBytesDigest } from './instruction-environment.mjs';
const KIND='retained_instruction_comparison_v1';
const raw=(p,max=16*1024*1024)=>readStableBytes(p,'retained comparison evidence',max);
const json=p=>parseJsonRejectDuplicateKeys(raw(p),'retained comparison JSON');
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
function streamBytes(path) {
  assertNoSymlinkPathSegments(path,'retained terminal stream');
  const before=lstatSync(path);
  if(before.size!==0)return raw(path);
  assert.ok(before.isFile(),'retained terminal stream must be regular');
  const after=lstatSync(path);
  for(const key of ['dev','ino','size','mode','mtimeMs','ctimeMs'])assert.equal(after[key],before[key],'empty terminal stream changed');
  return Buffer.alloc(0);
}
function frozenConfiguration(path, manifestDigest) {
  const n=dirname(resolve(path)),m=join(n,'preparation-manifest.json');
  assert.equal(instructionBytesDigest(raw(m)),manifestDigest,'retained preparation manifest drift');
  const manifest=json(m);
  for(const f of manifest.files) {
    assert.ok(typeof f.path==='string'&&!f.path.split('/').some(x=>['..','.'].includes(x))&&!f.path.startsWith('/'));
    assert.equal(instructionBytesDigest(raw(join(n,f.path))),f.sha256,'retained prepared file drift');
  }
  const config=json(path);
  for(const f of config.dependency_pins)assert.equal(instructionBytesDigest(raw(f.path)),f.sha256,'retained runtime dependency drift');
  return config;
}
export function prepareRetainedInstructionComparison(o) {
  const config=frozenConfiguration(o.configPath,o.preparationManifestDigest);
  assert.ok(Array.isArray(config.rows)&&config.rows.length>0&&config.rows.length<=256);
  assert.deepEqual(Object.keys(o.environments).sort(),['baseline','challenger']);
  const envs=Object.fromEntries(Object.entries(o.environments).map(([role,environmentObjectDigest])=>[role,
    verifyInstructionEnvironment({...o,environmentObjectDigest})]));
  const rows=config.rows.map((r,i)=>{
    assert.equal(r.sequence,i+1);assert.ok(['baseline','candidate'].includes(r.variant));assert.equal(r.ask,'on');
    const role=r.variant==='candidate'?'challenger':'baseline',env=envs[role];
    assert.ok(env.environment.retained_layout_object_digest,'complete retained layout required');
    assert.equal(env.environment.runtime.model,config.model);
    assert.ok(!existsSync(r.trial_root),'pre-result seal refuses an already allocated trial');
    const initial=new Map(r.initial_inventory.map(f=>[f.path,f]));
    for(const file of env.files){
      const f=initial.get(file.path);
      assert.ok(f&&f.sha256===file.raw_digest,'retained initial instructions differ from environment');
      assert.equal(instructionBytesDigest(raw(resolve(r.work_root,file.path))),file.raw_digest,'retained current instruction drift');
    }
    const taskPaths=new Set(r.public_inventory.map(f=>f.path));
    const expected=r.initial_inventory.filter(f=>!taskPaths.has(f.path)&&!f.path.startsWith('.runtime/')).map(f=>f.path).sort();
    assert.deepEqual(env.files.map(f=>f.path).sort(),expected,'retained instruction inventory omitted');
    return {sequence:r.sequence,trial_id:r.trial_id,fixture_id:r.fixture_id,repetition:r.repetition,role,
      work_root:r.work_root,trial_root:r.trial_root,public_inventory:r.public_inventory,wrapper:r.wrapper,
      wrapper_digest:instructionBytesDigest(raw(r.wrapper)),environment_object_digest:o.environments[role]};
  });
  assert.equal(new Set(rows.map(r=>r.trial_id)).size,rows.length,'duplicate retained trial');
  for(const fixture of new Set(rows.map(r=>r.fixture_id))){
    const group=rows.filter(r=>r.fixture_id===fixture);
    assert.ok(group.every(r=>same(r.public_inventory,group[0].public_inventory)),'public task differs across roles/repetitions');
    for(const repetition of new Set(group.map(r=>r.repetition)))assert.deepEqual(
      group.filter(r=>r.repetition===repetition).map(r=>r.role).sort(),['baseline','challenger'],'unpaired repetition');
  }
  const plan={object_kind:KIND,phase:'pre_result',results_accessed:false,config_path:resolve(o.configPath),
    config_digest:instructionBytesDigest(raw(o.configPath)),preparation_manifest_digest:o.preparationManifestDigest,
    environments:o.environments,cases:rows,model:config.model,effort:config.effort,
    runner:{path:config.runner,digest:instructionBytesDigest(raw(config.runner))},prompt_digest:instructionBytesDigest(raw(join(dirname(o.configPath),'prompt.txt'))),
    evidence_scope:'observed_reference_only',holdout_claimed:false,source_public_head:config.source_public_head,
    complete_hierarchical_usage_required_for_start:false,model_launch_authority_implied:false,
    formal_quality_admission_implied:false};
  return {object_digest:putContentAddressedJson({storeRoot:o.storeRoot,artifact:plan}).digest,plan,models_started:false};
}
export function verifyRetainedInstructionComparison(o) {
  const plan=readContentAddressedJson({storeRoot:o.storeRoot,digest:o.planObjectDigest}).value;
  assert.equal(plan.object_kind,KIND);assert.equal(plan.phase,'pre_result');assert.equal(plan.results_accessed,false);
  assert.equal(instructionBytesDigest(raw(plan.config_path)),plan.config_digest,'retained config drift');
  const config=frozenConfiguration(plan.config_path,plan.preparation_manifest_digest);
  assert.equal(plan.runner.digest,instructionBytesDigest(raw(config.runner)));
  for(const c of plan.cases){
    assert.equal(instructionBytesDigest(raw(c.wrapper)),c.wrapper_digest);
    const env=verifyInstructionEnvironment({...o,environmentObjectDigest:c.environment_object_digest});
    assert.equal(c.environment_object_digest,plan.environments[c.role]);
    for(const f of env.files)assert.equal(instructionBytesDigest(raw(resolve(c.work_root,f.path))),f.raw_digest,'retained read-only instructions changed');
  }
  return {plan,config};
}
export function readRetainedInstructionResults(o) {
  const {plan}=verifyRetainedInstructionComparison(o),threads=new Set(),intervals=[],evidence=[];
  const rows=plan.cases.map(c=>{
    const completion=join(c.trial_root,'completion.json');
    if(!existsSync(completion))return {...c,state:existsSync(c.trial_root)?'running_or_uncertain':'not_started',root_usage:null,full_hierarchical_usage:null};
    const done=json(completion),s=done.status,receiptPath=join(c.trial_root,'controller/completion-receipt.json');
    assert.equal(done.trial_id,c.trial_id);assert.equal(s.trial_id,c.trial_id);
    assert.equal(s.model_requested,plan.model);assert.equal(s.reasoning_requested,plan.effort);assert.equal(s.prompt_sha256,plan.prompt_digest.slice(7));
    const stream=join(c.trial_root,'metrics/stdout.raw.jsonl');
    const streamData=existsSync(stream)?streamBytes(stream):null;
    const events=streamData?streamData.toString('utf8').split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x)):[];
    const starts=events.filter(e=>e.type==='thread.started'),ends=events.filter(e=>e.type==='turn.completed');
    const success=done.cli_terminal_verified===true&&s.exit_code===0&&s.execution_status==='completed';
    assert.ok(starts.length<=1,'multiple root starts in retained stream');
    if(success){assert.equal(starts.length,1,'retained root start missing');assert.equal(ends.length,1,'retained terminal usage event missing');}
    if(starts.length){
      assert.equal(starts[0].thread_id,s.thread_id);
      assert.ok(!threads.has(s.thread_id),'retained root conversation reused');threads.add(s.thread_id);
    }
    const eventUsage=ends.length===1?(ends[0].usage??null):null;
    assert.ok(eventUsage===null||(typeof eventUsage==='object'&&!Array.isArray(eventUsage)),'invalid CLI usage record');
    assert.ok(s.reported_root_tokens===null||s.reported_root_tokens===undefined||(typeof s.reported_root_tokens==='object'&&!Array.isArray(s.reported_root_tokens)),'invalid native status usage record');
    let usage=eventUsage?{...eventUsage}:null,statusCopyMissing=false;
    if(usage){
      for(const key of ['input_tokens','cached_input_tokens','output_tokens']) {
        if(usage[key]===null||usage[key]===undefined)usage[key]=null;
        else {
          assert.ok(Number.isSafeInteger(usage[key])&&usage[key]>=0);
          if(s.reported_root_tokens?.[key]!==null&&s.reported_root_tokens?.[key]!==undefined)
            assert.equal(usage[key],s.reported_root_tokens[key],'root usage differs from original status');
        }
        if(s.reported_root_tokens?.[key]===null||s.reported_root_tokens?.[key]===undefined)statusCopyMissing=true;
      }
      if(usage.cached_input_tokens!==null&&usage.input_tokens!==null)assert.ok(usage.cached_input_tokens<=usage.input_tokens,'cache is an input subset');
    }
    const retained=existsSync(receiptPath)?json(receiptPath):null;
    if(retained){
      assert.ok(same(retained.status,s),'retention receipt/status mismatch');
      assert.ok(same(retained.official_root_usage_from_turn_completed??null,eventUsage),'retention root usage mismatch');
      const archive=join(c.trial_root,'controller/retained-work.tar.gz');
      assert.equal(resolve(retained.retained_work_archive),resolve(archive));
      assert.equal(instructionBytesDigest(raw(archive,128*1024*1024)).slice(7),retained.retained_work_archive_sha256,'retention archive drift');
    }
    const start=Date.parse(s.started_utc),end=Date.parse(s.ended_utc);
    assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>=start);
    if(retained)assert.ok(Number.isFinite(retained.elapsed_seconds)&&retained.elapsed_seconds>=0
      &&Math.abs(retained.elapsed_seconds-(end-start)/1000)<0.002,'retention CLI duration mismatch');
    intervals.push([start,end]);
    evidence.push({path:completion,digest:instructionBytesDigest(raw(completion))},
      {path:stream,digest:streamData?instructionBytesDigest(streamData):null});
    return {...c,state:success?(done.ready_for_next_root===true&&retained?'completed':'terminal_retention_or_process_uncertain'):'failed_or_interrupted',
      cli_seconds:retained?retained.elapsed_seconds:(end-start)/1000,root_usage:usage,observed_children:done.observed_native_children??[],
      sampling_errors:done.sampling_errors??[],runner_returncode:done.runner_returncode??null,native_usage_status:s.usage_status??null,
      root_usage_source:'turn.completed',root_usage_status:usage===null?'missing':
        ['input_tokens','cached_input_tokens','output_tokens'].some(k=>usage[k]===null)?'partial':statusCopyMissing?'event_with_missing_status_copy':'event_and_status_agree',
      full_hierarchical_usage:null,formal_quality_score:null};
  });
  intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;i++)assert.ok(intervals[i-1][1]<=intervals[i][0],'retained model intervals overlap');
  const complete=rows.every(r=>r.state==='completed');
  return {object_kind:'retained_instruction_reference_report',plan_object_digest:o.planObjectDigest,rows,evidence,
    complete,official_quality_score:null,full_hierarchical_usage:null,
    reference_review:{status:complete?'ready_for_reference_review':'awaiting_results',quality_assessed_by_reader:false},
    adoption:{status:'not_assessed',action:'not_applied',formal_recommendation_invoked:false,
      reason:'This command verifies retained execution records only. It does not run Evolution, grade quality or decide adoption. Authoring export and normal source installation remain separate from formal receipt-based owner apply.'},
    model_launch_performed_by_command:false,candidate_code_executed_by_command:false};
}

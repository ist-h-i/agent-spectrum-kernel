// Software fixtures only: stop at the case gate, never approve or run Eval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,writeFileSync,readFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {createComponentInstructionLoopConfiguration,createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
const cli=join(import.meta.dirname,'supervised-instruction-loop-cli.mjs');
function fixture(t,track='codex',removeAll=false){
  const f=componentLoopFixture(t,track),response=f.profile.candidate.authoring.provider.response;
  f.profile.candidate.authoring.provider={kind:'external_host'};writeFileSync(f.profilePath,JSON.stringify(f.profile));
  if(removeAll){f.profile.candidate.authoring.removableStableIds=[...new Set([...f.profile.candidate.authoring.removableStableIds,...f.profile.candidate.authoring.editableStableIds])];writeFileSync(f.profilePath,JSON.stringify(f.profile));}
  const config=createComponentInstructionLoopConfiguration(f.profilePath);writeFileSync(f.configPath,JSON.stringify(config));
  const invoke=(command,extra=[])=>spawnSync(process.execPath,[cli,command,'--root',f.root,'--config',f.configPath,...extra],{encoding:'utf8',maxBuffer:4*1024*1024});
  const ok=(command,extra=[])=>{const r=invoke(command,extra);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  const run=()=>advanceSupervisedInstructionLoop({root:f.root,policy:config.policy,runtime:createComponentInstructionLoopRuntime({definition:config.runtime})});
  return {...f,config,response,invoke,ok,run};
}
function inputs(f,request,evidence_kind='synthetic'){
  const claim={handoff_digest:request.handoff_digest,execution_id:'host-execution-1',provider:'claude_app',evidence_kind};
  const claimPath=join(f.workspaceRoot,'claim.json');writeFileSync(claimPath,JSON.stringify(claim));
  const submission={handoff_digest:request.handoff_digest,claim_digest:canonicalDigest(claim),
    response:{...f.response,request_digest:request.generation_input.request_digest},
    closure:{status:'completed',termination_confirmed:true,evidence_ref:'synthetic existing host execution closure'}};
  const submissionPath=join(f.workspaceRoot,'submission.json');writeFileSync(submissionPath,JSON.stringify(submission));
  return {claim,claimPath,submission,submissionPath};
}
for(const track of ['codex','claude'])test(`external ${track} authoring waits durably and resumes exactly the reserved candidate at case approval`,async t=>{
  const f=fixture(t,track),ownerBefore=canonicalDigest(fullInstructionInventory(f.target));
  let s=await f.run();assert.equal(s.status,'awaiting_authoring');assert.equal(s.pending_gate,null);
  assert.equal(existsSync(f.profile.practical.root),false);assert.equal(existsSync(f.profile.candidateRoot),false);
  const request=f.ok('authoring-request'),again=await f.run();assert.equal(again.status,'awaiting_authoring');
  assert.equal(again.pending_authoring.handoff_digest,request.handoff_digest);
  assert.deepEqual(f.ok('authoring-request'),request);assert.ok(request.generation_input.read_only_environment);
  assert.equal(JSON.stringify(request).includes(f.workspaceRoot),false);
  const i=inputs(f,request);assert.equal(f.ok('authoring-claim',['--claim',i.claimPath]).claim_created,true);
  assert.equal(f.ok('authoring-claim',['--claim',i.claimPath]).claim_created,false);
  assert.equal((await f.run()).pending_authoring.completion_state,'claimed_completion_unknown');
  assert.equal(f.ok('authoring-complete',['--submission',i.submissionPath]).status,'completion_recorded');
  assert.equal(f.ok('authoring-complete',['--submission',i.submissionPath]).status,'completion_recorded');
  s=await f.run();assert.equal(s.status,'awaiting_evaluation_approval');assert.equal(s.pending_authoring,null);
  assert.equal(existsSync(f.profile.practical.root),false);assert.equal(canonicalDigest(fullInstructionInventory(f.target)),ownerBefore);
  const journal=readRunJournal(f.root),candidate=journal.state.outputs.generate;
  assert.equal(candidate.execution.kind,'external_host');assert.equal(candidate.execution.evidence_kind,'synthetic');
  assert.equal(candidate.execution.usage,null);assert.equal(candidate.execution.claim_digest,canonicalDigest(i.claim));
  // Lost completed-stage response: use owned result evidence, never re-prepare.
  const job=journal.events.find(e=>e.kind==='operation_reserved'&&e.state.pending.kind==='generate').state.pending;
  const result=join(f.profile.stateRoot,'stages',canonicalDigest(job).slice(7),'result.json');unlinkSync(result);
  const recovered=await createComponentInstructionLoopRuntime({definition:f.config.runtime}).inspect(job,{root:f.root});
  assert.equal(recovered.status,'completed');assert.equal(canonicalDigest(recovered.output),canonicalDigest(candidate));
});
test('empty final projections and altered private checkpoints refuse without consuming a valid completion',async t=>{
  const f=fixture(t,'codex',true);await f.run();const request=f.ok('authoring-request'),i=inputs(f,request);
  f.ok('authoring-claim',['--claim',i.claimPath]);
  const invalid={...i.submission,response:{request_digest:request.generation_input.request_digest,changes:f.profile.candidate.authoring.removableStableIds.map(stable_id=>({operation:'exclude',stable_id}))}};
  writeFileSync(i.submissionPath,JSON.stringify(invalid));assert.notEqual(f.invoke('authoring-complete',['--submission',i.submissionPath]).status,0);
  assert.equal(existsSync(join(f.profile.stateRoot,'host-authoring-completion.json')),false);
  const checkpoint=join(f.profile.stateRoot,'host-authoring-prepared.json'),original=readFileSync(checkpoint),altered=JSON.parse(original);
  altered.authoring.editableStableIds=[];writeFileSync(checkpoint,JSON.stringify(altered));
  assert.notEqual(f.invoke('authoring-request').status,0);assert.equal((await f.run()).status,'operation_uncertain');
  writeFileSync(checkpoint,original);writeFileSync(i.submissionPath,JSON.stringify(i.submission));f.ok('authoring-complete',['--submission',i.submissionPath]);
  assert.equal((await f.run()).status,'awaiting_evaluation_approval');
});
test('a partially reserved local finalization remains uncertain and is never repeated',async t=>{
  const f=fixture(t);await f.run();const i=inputs(f,f.ok('authoring-request'));
  f.ok('authoring-claim',['--claim',i.claimPath]);f.ok('authoring-complete',['--submission',i.submissionPath]);
  mkdirSync(join(f.profile.stateRoot,'host-authoring-finalizing'));
  assert.equal((await f.run()).status,'operation_uncertain');assert.equal((await f.run()).status,'operation_uncertain');
  assert.equal(existsSync(f.profile.candidateRoot),false);assert.equal(existsSync(f.profile.practical.root),false);
});
test('lost preparation response recovers the completed handoff receipt without another generation',async t=>{
  const f=fixture(t),runtime=createComponentInstructionLoopRuntime({definition:f.config.runtime}),original=runtime.generate;let calls=0;
  runtime.generate=async(...args)=>{calls++;await original(...args);throw new Error('synthetic transport loss after completed preparation');};
  const lost=await advanceSupervisedInstructionLoop({root:f.root,policy:f.config.policy,runtime});assert.equal(lost.status,'operation_uncertain');
  assert.equal(readRunJournal(f.root).state.authoring_progress,undefined);
  const checkpoint=readFileSync(join(f.profile.stateRoot,'host-authoring-prepared.json'));
  const recovered=await f.run();assert.equal(recovered.status,'awaiting_authoring');assert.equal(calls,1);
  assert.deepEqual(readFileSync(join(f.profile.stateRoot,'host-authoring-prepared.json')),checkpoint);
  assert.equal(f.ok('authoring-request').handoff_digest,recovered.pending_authoring.handoff_digest);
  assert.equal(existsSync(f.profile.candidateRoot),false);assert.equal(existsSync(f.profile.practical.root),false);
});
test('a lost or altered published claim cannot acquire permission to dispatch again',async t=>{
  const f=fixture(t);await f.run();const i=inputs(f,f.ok('authoring-request'));
  f.ok('authoring-claim',['--claim',i.claimPath]);const path=join(f.profile.stateRoot,'host-authoring-claim.json'),saved=readFileSync(path);
  unlinkSync(path);assert.notEqual(f.invoke('authoring-claim',['--claim',i.claimPath]).status,0);
  assert.equal((await f.run()).status,'operation_uncertain');
  writeFileSync(path,saved);assert.equal(f.ok('authoring-claim',['--claim',i.claimPath]).claim_created,false);
  writeFileSync(path,JSON.stringify({...i.claim,execution_id:'altered'}));assert.notEqual(f.invoke('authoring-request').status,0);
  assert.equal((await f.run()).status,'operation_uncertain');
});
test('host authoring refuses missing grant, competing claim, unknown closure and invalid inventory before accepting a completion',async t=>{
  const f=fixture(t);await f.run();const request=f.ok('authoring-request'),i=inputs(f,request,'host_reported');
  assert.notEqual(f.invoke('authoring-claim',['--claim',i.claimPath]).status,0);
  assert.equal(f.ok('authoring-claim',['--claim',i.claimPath,'--allow-model-calls']).claim_created,true);
  writeFileSync(i.claimPath,JSON.stringify({...i.claim,execution_id:'other-execution'}));assert.notEqual(f.invoke('authoring-claim',['--claim',i.claimPath,'--allow-model-calls']).status,0);
  for(const invalid of [
    {...i.submission,handoff_digest:canonicalDigest('another handoff')},
    {...i.submission,claim_digest:canonicalDigest('another claim')},
    {...i.submission,closure:{...i.submission.closure,termination_confirmed:false}},
    {...i.submission,response:{request_digest:request.generation_input.request_digest,changes:[{operation:'exclude',stable_id:'undeclared'}]}}
  ]){writeFileSync(i.submissionPath,JSON.stringify(invalid));assert.notEqual(f.invoke('authoring-complete',['--submission',i.submissionPath]).status,0);}
  assert.equal((await f.run()).status,'awaiting_authoring');
  writeFileSync(i.submissionPath,JSON.stringify(i.submission));f.ok('authoring-complete',['--submission',i.submissionPath]);
  writeFileSync(i.submissionPath,JSON.stringify({...i.submission,response:{request_digest:request.generation_input.request_digest,changes:[]}}));
  assert.notEqual(f.invoke('authoring-complete',['--submission',i.submissionPath]).status,0);
  assert.equal((await f.run()).status,'awaiting_evaluation_approval');
});
test('bounded operation exposes the current host handoff without starting trials or adding a human judgment',t=>{
  const f=fixture(t),operation=join(f.workspaceRoot,'operation');
  const r=spawnSync(process.execPath,[cli,'operate','--root',operation,'--config',f.configPath,'--profile',f.profilePath,'--cycles','2'],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(r.status,0,r.stderr);const s=JSON.parse(r.stdout);assert.equal(s.operation_status,'awaiting_authoring');
  assert.equal(s.pending_gate,null);assert.ok(s.pending_authoring.handoff_digest);assert.equal(existsSync(f.profile.practical.root),false);
  const cycle=s.current_cycle,command=(name,extra=[])=>{
    const r=spawnSync(process.execPath,[cli,name,'--root',cycle.root,'--config',cycle.config_path,...extra],{encoding:'utf8',maxBuffer:4*1024*1024});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
  };
  const i=inputs(f,command('authoring-request'));command('authoring-claim',['--claim',i.claimPath]);command('authoring-complete',['--submission',i.submissionPath]);
  const resumed=spawnSync(process.execPath,[cli,'operate','--root',operation,'--config',f.configPath,'--profile',f.profilePath,'--cycles','2'],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(resumed.status,0,resumed.stderr);const gate=JSON.parse(resumed.stdout);
  assert.equal(gate.operation_status,'awaiting_evaluation_approval');assert.equal(gate.pending_gate.kind,'evaluation');
  assert.equal(existsSync(f.profile.practical.root),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir,devNull} from 'node:os';
import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';
import {readRunJournal,appendRunJournal} from './instruction-run-journal.mjs';
import {advanceSupervisedInstructionLoop,prepareNextSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {readInstructionReferenceEvidence} from './instruction-loop-reference-evidence.mjs';
import {referenceFixture} from './test-helpers-instruction-reference.mjs';
function fixture(t,{target=true}={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-reference-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));const source=join(dir,'candidate');mkdirSync(source);writeFileSync(join(source,'instruction.md'),'Synthetic instruction');
 const git=args=>{const r=spawnSync('git',['-c','core.hooksPath='+devNull,'-c','user.name=Fixture','-c','user.email=fixture@invalid','-c','commit.gpgsign=false',...args],{cwd:source,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};git(['init','--quiet']);git(['add','.']);git(['commit','--quiet','-m','synthetic']);const revision=git(['rev-parse','HEAD']);
 const c={source_root:source,source_revision:revision,baseline_revision:revision,environment_object_digest:canonicalDigest('synthetic environment')},root=join(dir,'run');
 const policy={kind:'reference_instruction_loop_v1',id:'reference-fixture',runtime_digest:canonicalDigest('synthetic runtime'),observation:{goal:'Improve public instructions.'},catalog:[{id:'old-unapproved-case',public_input_digest:canonicalDigest('old input')}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:target?join(dir,'owner'):null,formal_admission_implied:false};
 const calls=[],receipts=new Map(),runtime={digest:policy.runtime_digest,validateReferenceEvidence:()=>{},inspect:async job=>receipts.get(canonicalDigest(job))??{status:'unknown'}};
 for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>{calls.push(kind);assert.ok(!['trial','report'].includes(kind),'reference flow cannot run original trials or report');const output=['generate','register'].includes(kind)?c:kind==='select'?{case_ids:['old-unapproved-case']}:kind==='plan'?{target:policy.normal_target,reference_digest:job.input.report.reference_digest}:{synthetic:true};const r={status:'completed',request_digest:canonicalDigest(job),output};receipts.set(canonicalDigest(job),r);return r;};
 const run=extra=>advanceSupervisedInstructionLoop({root,policy,runtime,...extra});return {dir,source,c,root,policy,runtime,calls,run,manifest:referenceFixture(dir,c)};
}
const decide=(s,disposition='approved')=>({disposition,packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic host judgment of this exact evidence scope.'});
test('reference scope and adoption are fresh separate decisions; original evaluation remains unrun',async t=>{
 const f=fixture(t),old=await f.run(),oldDigest=canonicalDigest(old.pending_gate);assert.equal(old.status,'awaiting_evaluation_approval');
 let s=await f.run({referenceEvidence:f.manifest});assert.equal(s.status,'awaiting_reference_review');assert.equal(s.completed_trials,0);assert.equal(s.report,null);assert.equal(s.reference_evidence.limits.candidate_effect,'not_measured');assert.equal(s.pending_gate.packet.reference_evidence.review.attempts.length,4);assert.equal(f.calls.includes('plan'),false);
 const h=readRunJournal(f.root),snapshot=readInstructionReferenceEvidence({root:f.root,state:h.state});assert.equal(canonicalDigest(snapshot.original_gate),oldDigest);assert.equal(h.state.evaluation_decision,undefined);assert.equal(snapshot.artifacts.length,f.manifest.artifacts.length);
 await assert.rejects(f.run({decision:decide(old)}),/different packet/);
 const referenceDecision=decide(s);s=await f.run({decision:referenceDecision});assert.equal(s.status,'awaiting_change_approval');assert.equal(s.report.kind,'instruction_loop_external_reference_report_v1');assert.equal(f.calls.includes('apply'),false);
 await assert.rejects(f.run({decision:referenceDecision}),/different packet/);s=await f.run({decision:decide(s)});assert.equal(s.final.outcome,'applied');assert.equal(s.completed_trials,0);
 const state=readRunJournal(f.root).state;assert.equal(state.evaluation_decision,undefined);assert.equal(state.outputs.evaluate,undefined);assert.equal(f.calls.filter(k=>k==='apply').length,1);
 const next=prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'fresh-cycle'}});assert.equal(next.approval_carried_forward,false);const prior=next.policy.observation.previous;assert.equal(prior.reference_evidence.candidate_effect,'not_measured');assert.equal(prior.evaluation_summary,undefined);assert.equal(prior.reference_evidence.attempt_count,4);assert.equal(prior.reference_evidence.failed_or_interrupted_count,1);assert.equal(prior.reference_evidence.selected_count,3);assert.equal(prior.reference_evidence.limitations.length,1);assert.equal(prior.failure_count,0);assert.equal(prior.decisions.length,2);assert.equal(prior.decisions.some(d=>d.kind==='evaluation_decision'),false);
});
for(const gate of ['reference','change'])test(`${gate} rejection reuses retirement/cleanup, retains evidence, never applies`,async t=>{
 const f=fixture(t);await f.run();let s=await f.run({referenceEvidence:f.manifest});if(gate==='change')s=await f.run({decision:decide(s)});s=await f.run({decision:decide(s,'rejected')});assert.equal(s.final.outcome,gate+'_rejected');assert.equal(f.calls.includes('apply'),false);assert.deepEqual(f.calls.slice(-2),['version','cleanup']);assert.ok(existsSync(s.reference_evidence.reference.path));assert.equal(f.manifest.artifacts.every(a=>existsSync(a.path)),true);
});
test('result-only reference review cannot apply or dispose; deferral leaves the same gate',async t=>{
 const f=fixture(t,{target:false});await f.run();let s=await f.run({referenceEvidence:f.manifest});const before=canonicalDigest(s.pending_gate);s=await f.run({decision:decide(s,'deferred')});assert.equal(canonicalDigest(s.pending_gate),before);s=await f.run({decision:decide(s)});assert.equal(s.status,'awaiting_result_review');s=await f.run({decision:decide(s,'rejected')});assert.equal(s.final.outcome,'result_rejected_retained');assert.ok(!f.calls.some(k=>['plan','apply','version','cleanup'].includes(k)));
});
test('attachment is idempotent and cannot replace evidence or combine with a decision',async t=>{
 const f=fixture(t),old=await f.run();await assert.rejects(f.run({referenceEvidence:f.manifest,decision:decide(old)}),/review reference/);let s=await f.run({referenceEvidence:f.manifest});const gate=canonicalDigest(s.pending_gate);s=await f.run({referenceEvidence:f.manifest});assert.equal(canonicalDigest(s.pending_gate),gate);await assert.rejects(f.run({referenceEvidence:{...f.manifest,limitations:['different']}}),/cannot be replaced/);
});
for(const [name,mutate] of [
 ['wrong candidate',m=>m.candidate_digest=canonicalDigest('other')],['wrong environment',m=>m.attempts[0].environment_object_digest=canonicalDigest('other')],
 ['missing failed attempt',m=>m.attempts.splice(1,1)],['selected failed attempt',m=>m.attempts[1].selected=true],['unclosed attempt',m=>m.attempts[1].closure='unknown'],
 ['aliased receipt path',m=>{const [a,b]=m.artifacts.filter(a=>a.role==='receipt');b.path=a.path;b.digest=a.digest;}],['aliased receipt bytes',m=>{const [a,b]=m.artifacts.filter(a=>a.role==='receipt');b.digest=a.digest;}],
 ['missing case approval',m=>m.artifacts=m.artifacts.filter(a=>a.role!=='case_approval')],['duplicate receipt',m=>m.attempts[1].receipt=m.attempts[0].receipt],['self authorization',m=>m.approved=true]
])test(`reference refuses ${name} without plan or owner effects`,async t=>{
 const f=fixture(t);await f.run();mutate(f.manifest);await assert.rejects(f.run({referenceEvidence:f.manifest}));assert.equal(f.calls.includes('plan'),false);assert.equal(readRunJournal(f.root).state.status,'awaiting_evaluation_approval');
});
test('retained bytes are immutable snapshots; tamper blocks plain resume and fresh approval',async t=>{
 const f=fixture(t);await f.run();const s=await f.run({referenceEvidence:f.manifest}),file=s.reference_evidence.reference.path;
 writeFileSync(f.manifest.artifacts[0].path,'external bytes changed after snapshot');assert.equal((await f.run()).status,'awaiting_reference_review');
 const original=readFileSync(file);writeFileSync(file,'{}');await assert.rejects(f.run(),/drift/);await assert.rejects(f.run({decision:decide(s)}),/drift/);writeFileSync(file,original);rmSync(file);await assert.rejects(f.run());assert.equal(f.calls.includes('plan'),false);
});
test('raw evidence digest or symlink drift and candidate source drift refuse',async t=>{
 const f=fixture(t);await f.run();const a=f.manifest.artifacts[0],original=readFileSync(a.path);writeFileSync(a.path,'drift');await assert.rejects(f.run({referenceEvidence:f.manifest}),/bytes changed/);writeFileSync(a.path,original);const external=join(f.dir,'external');writeFileSync(external,original);rmSync(a.path);symlinkSync(external,a.path);await assert.rejects(f.run({referenceEvidence:f.manifest}),/symlink/);rmSync(a.path);writeFileSync(a.path,original);
 const s=await f.run({referenceEvidence:f.manifest});writeFileSync(join(f.source,'instruction.md'),'changed');await assert.rejects(f.run({decision:decide(s)}),/not clean/);
});
for(const change of [s=>s.pending={kind:'evaluate'},s=>s.evaluation_decision={disposition:'approved'},s=>s.trials.push({}),s=>s.outputs.report={}])test('active, approved or partially executed original evaluation cannot become reference evidence',async t=>{
 const f=fixture(t);await f.run();const h=readRunJournal(f.root);change(h.state);appendRunJournal(f.root,'synthetic forbidden state',h.state);await assert.rejects(f.run({referenceEvidence:f.manifest}));assert.equal(f.calls.includes('plan'),false);
});

test('lost cleanup response resumes from its receipt after owned source removal',async t=>{
 const f=fixture(t),cleanup=f.runtime.cleanup;f.runtime.cleanup=async job=>{await cleanup(job);rmSync(f.source,{recursive:true});throw new Error('Synthetic lost cleanup response');};
 await f.run();let s=await f.run({referenceEvidence:f.manifest});s=await f.run({decision:decide(s,'rejected')});assert.equal(s.status,'operation_uncertain');assert.equal(s.active_job.kind,'cleanup');assert.equal(existsSync(f.source),false);
 s=await f.run();assert.equal(s.final.outcome,'reference_rejected');assert.equal(f.calls.filter(k=>k==='cleanup').length,1);assert.ok(existsSync(s.reference_evidence.reference.path));
});

test('a runtime without an explicit reference capability cannot attach evidence',async t=>{const f=fixture(t);await f.run();delete f.runtime.validateReferenceEvidence;await assert.rejects(f.run({referenceEvidence:f.manifest}),/no reference evidence capability/);assert.equal(f.calls.includes('plan'),false);});

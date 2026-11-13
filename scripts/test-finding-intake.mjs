import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,renameSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {initializeFindingIntake,captureFinding,listFindings,findingFeedback,captureReviewFindings} from './finding-intake.mjs';
const fixture=t=>{const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-findings-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
const event=(id='message-1',kind='user_comment')=>({task_id:'task-1',source:{kind,id,item_id:'finding-1'},occurred_at:'2026-11-13T01:00:00Z',summary:'Saving while another request is in progress loses input.',evidence_status:'Unknown',disposition:'open',related_to:[],supersedes:null});
test('opt-in initialization, all three event sources, idempotent replay and distinct recurrence',t=>{
 const root=fixture(t);assert.throws(()=>captureFinding(root,event()),/not enabled/);
 initializeFindingIntake(root,'my-project');initializeFindingIntake(root,'my-project');
 assert.throws(()=>initializeFindingIntake(root,'other-project'),/different/);
 const first=captureFinding(root,event());assert.equal(first.status,'recorded');assert.equal(captureFinding(root,event()).status,'duplicate');
 captureFinding(root,event('message-2','task_observation'));captureFinding(root,event('review-1','ai_review'));
 const records=listFindings(root);assert.equal(records.length,3);assert.ok(records.every(r=>r.authority_implied===false));
 assert.throws(()=>captureFinding(root,{...event(),summary:'Different bytes for the same event.'}),/conflict/);
});
test('corrections link to prior evidence without overwriting or becoming approval',t=>{
 const root=fixture(t);initializeFindingIntake(root,'project');const first=captureFinding(root,event());
 captureFinding(root,{...event('message-2'),summary:'The proposed defect is not reproduced.',disposition:'disputed',supersedes:first.record.event_id});
 assert.equal(listFindings(root).length,2);assert.equal(listFindings(root).find(r=>r.event_id===first.record.event_id).summary,event().summary);
 assert.throws(()=>captureFinding(root,{...event('message-3'),related_to:['sha256:'+'0'.repeat(64)]}),/related/);
});
test('reject secret-like text, raw fields and symlink stores; do not claim successful writes',t=>{
 const root=fixture(t);initializeFindingIntake(root,'project');
 assert.throws(()=>captureFinding(root,{...event(),summary:'token=private-value'}));
 assert.throws(()=>captureFinding(root,{...event(),raw_transcript:'private'}));
 const outside=join(root,'outside');mkdirSync(outside);rmSync(join(root,'.agent-spectrum-kernel/findings/events'),{recursive:true});symlinkSync(outside,join(root,'.agent-spectrum-kernel/findings/events'));
 assert.throws(()=>captureFinding(root,event()),/symlink/);
});
test('capture accepted review findings automatically only after opt-in, no source dumps',t=>{
 const root=fixture(t);const review={request_digest:'sha256:'+'a'.repeat(64),findings:[{path:'src/save.js',obligation_ref:'preserve-input',severity:'major'}]};
 assert.equal(captureReviewFindings(root,review,'execution-1').status,'disabled');initializeFindingIntake(root,'project');
 assert.equal(captureReviewFindings(root,review,'execution-1').status,'recorded');assert.equal(captureReviewFindings(root,review,'execution-1').status,'recorded');
 const records=listFindings(root);assert.equal(records.length,1);assert.equal(records[0].evidence_status,'Hypothesis');
 assert.equal(records[0].source.kind,'ai_review');
 captureReviewFindings(root,review,'execution-2');assert.equal(listFindings(root).length,2,'a separate review is not a retry');
});
test('bridge selected, bounded interpretation into existing feedback without fabricating knowledge',t=>{
 const root=fixture(t);initializeFindingIntake(root,'project');const {record}=captureFinding(root,event());
 const selection={event_id:record.event_id,kind:'instruction_gap',severity:2,tags:['review'],correction:'Check saving and concurrent edits.',intended_mechanism:'Review update boundaries.',applicability:'An asynchronous save affects current input.',non_applicability:['Read-only screens.']};
 const feedback=findingFeedback(root,[selection]);assert.equal(feedback.kind,'instruction_loop_feedback_v1');assert.equal(feedback.authority_implied,false);assert.equal(feedback.candidates[0].evidence[0].evidence_status,'Unknown');
 assert.throws(()=>findingFeedback(root,[{...selection,evidence_status:'Verified'}]));
 assert.throws(()=>findingFeedback(root,[selection,selection]));
});
test('JSON corruption is surfaced, not silently skipped',t=>{
 const root=fixture(t);initializeFindingIntake(root,'project');const {record}=captureFinding(root,event());
 writeFileSync(join(root,'.agent-spectrum-kernel/findings/events',record.event_id.slice(7)+'.json'),'{}');assert.throws(()=>listFindings(root));
});

test('related occurrences stay selectable; superseding correction blocks obsolete event',t=>{
 const root=fixture(t);initializeFindingIntake(root,'project');const first=captureFinding(root,event()).record;
 const second=captureFinding(root,{...event('message-2'),related_to:[first.event_id]}).record;
 const selection=r=>({event_id:r.event_id,kind:'instruction_gap',severity:2,tags:['review'],correction:'Check pending edits.',intended_mechanism:'Check update boundaries.',applicability:'Async editing.',non_applicability:['Read-only tasks.']});
 assert.equal(findingFeedback(root,[selection(first),selection(second)]).candidates[0].occurrences,2);
 captureFinding(root,{...event('message-3'),supersedes:first.event_id,disposition:'disputed'});
 assert.throws(()=>findingFeedback(root,[selection(first)]),/superseded/);
});
test('concurrent captures publish complete JSON and preserve independent occurrences',async t=>{
 const {spawn}=await import('node:child_process');const root=fixture(t);initializeFindingIntake(root,'project');
 const run=e=>new Promise((ok,fail)=>{const c=spawn(process.execPath,['scripts/finding-intake.mjs','capture','--project',root,'--event','-'],{stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',fail);c.on('close',status=>status===0?ok(JSON.parse(out)):fail(new Error(err)));c.stdin.end(JSON.stringify(e));});
 const results=await Promise.all([run(event()),run(event()),run(event()),run(event('message-2')),run(event('message-3'))]);
 assert.equal(results.filter(r=>r.status==='recorded').length,3);assert.equal(listFindings(root).length,3);
});
test('assembled npm CLI accepts agent-written stdin with receipts',async t=>{
 const {buildNpmPackage}=await import('./build-npm-package.mjs');const {resolve}=await import('node:path');if(process.env.ASK_TEST_USE_BUILT_PACKAGE!=='1')buildNpmPackage();
 const root=fixture(t),cli=resolve('bin/ask.mjs');const run=(args,input)=>spawnSync(process.execPath,[cli,'findings',...args],{cwd:root,input,encoding:'utf8',timeout:30000});
 let r=run(['init','--project',root,'--repository-id','package-project']);assert.equal(r.status,0,r.stderr);
 r=run(['capture','--project',root,'--event','-'],JSON.stringify(event()));assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'recorded');
 r=run(['list','--project',root]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).events.length,1);
 assert.notEqual(run(['capture','--project',root,'--event','-'],'{"task_id":1,"task_id":2}').status,0);
 assert.notEqual(run(['capture','--project',root,'--event','-'],'x'.repeat(32769)).status,0);
});

test('disable and resume preserve records and unrelated project files',t=>{
 const root=fixture(t),untouched=join(root,'existing.txt');writeFileSync(untouched,'keep');
 initializeFindingIntake(root,'project');const first=captureFinding(root,event()).record;
 const base=join(root,'.agent-spectrum-kernel/findings'),active=join(base,'config.json'),disabled=join(base,'config.disabled.json');
 renameSync(active,disabled);
 assert.throws(()=>initializeFindingIntake(root,'project'),/disabled/);
 assert.equal(captureReviewFindings(root,{},'execution-disabled').status,'disabled');
 assert.throws(()=>captureFinding(root,event('later')),/not enabled/);
 renameSync(disabled,active);
 assert.deepEqual(listFindings(root),[first]);assert.equal(captureFinding(root,event()).status,'duplicate');
 assert.equal(readFileSync(untouched,'utf8'),'keep');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';
import {prepareReviewRuleChange,reviewRuleChangeStatus,validateReviewRuleChange,proposedReviewRuleContent,reviewRuleEffectiveness} from './review-rule-lifecycle.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {selectInstructionLoopCases} from './instruction-loop-case-selection.mjs';
import {buildNpmPackage} from './build-npm-package.mjs';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'ask-rule-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const target=join(dir,'project'),path='skills/review-code-health/references/project-rules.md';mkdirSync(join(target,dirname(path)),{recursive:true});writeFileSync(join(target,path),'# Project rules\n');
 const entry={id:'RR-0001',finding_pattern:'Missing permission-denial checks.',review_layer:'verification',trigger_signal:'Permission guard changes.',why_it_matters:'Unauthorized access may regress.',current_pr_blocker_policy:'Block missing denial verification.',suggested_prevention_target:'review checklist',evidence_source:'Two independent review findings.',evidence_status:'Supported',authority_status:'not_asserted',record_state:'active',repeat_pattern:'repeated',false_positive_risk:'Docs-only changes do not affect guards.',suppression_rule:'Suppress for documentation-only changes.',staleness_trigger:'Authorization model changes.',owner:'platform-team'};
 const spec={action:'add',entry,target_root:target,target_path:path,promotion_basis:'repeated',reason:'Prevent recurring access-control review omissions.',validation:{positive:[{evidence_digest:canonicalDigest('denial'),summary:'Guard change requires denial check.',outcome:'pass'}],negative:[{evidence_digest:canonicalDigest('docs'),summary:'Docs-only change suppresses rule.',outcome:'pass'}]}};
 return {dir,target,path,spec};
}
function loop(f,request,id='cycle',write=true,adapter=null){
 const root=join(f.dir,id),calls=[],receipts=new Map();
 const policy={kind:'reference_instruction_loop_v1',id,runtime_digest:canonicalDigest('synthetic-rule-runtime'),observation:request.observation,catalog:[{id:'positive',public_input_digest:canonicalDigest('positive'),tags:['review'],domain:'local'},{id:'negative',public_input_digest:canonicalDigest('negative'),tags:['review'],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:4,normal_target:f.target,formal_admission_implied:false};
 const runtime={digest:policy.runtime_digest,inspect:async j=>receipts.get(canonicalDigest(j))??{status:'unknown'}};
 for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>{
   calls.push(kind);let output={kind,completed:true};
   if(kind==='generate')output={content_digest:canonicalDigest(request.rule_block),changed_tags:['review']};
   if(kind==='register')output={version:'v'+request.revision,asset_digest:canonicalDigest(request),registry:{}};
   if(kind==='select')output=selectInstructionLoopCases({catalog:policy.catalog,changedTags:['review'],limit:2});
   if(kind==='trial')output={trial_id:job.input.row.id,ready_for_next_root:true};
   if(kind==='report')output={failures:[],unknowns:['synthetic fixture; no long-term efficacy']};
   if(kind==='plan')output={target:f.target,...(adapter?{normal_plan:{selection:{adapter}}}:{})};
   if(kind==='apply'&&write)writeFileSync(join(f.target,f.path),proposedReviewRuleContent(readFileSync(join(f.target,f.path),'utf8'),request));
   const result={request_digest:canonicalDigest(job),status:'completed',output};receipts.set(canonicalDigest(job),result);return result;
 };
 return {root,calls,policy,run:(extra={})=>advanceSupervisedInstructionLoop({root,policy,runtime,...extra})};
}
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic fixture owner approval.'});
async function complete(l){let s=await l.run();s=await l.run({decision:approve(s)});return l.run({decision:approve(s)});}
test('representative add, update and retire reuse both gates; exact target evidence, no extra model calls',async t=>{
 const f=fixture(t),original=readFileSync(join(f.target,f.path),'utf8'),request=prepareReviewRuleChange(f.spec);
 assert.equal(readFileSync(join(f.target,f.path),'utf8'),original);validateReviewRuleChange(request);
 const l=loop(f,request);let s=await l.run();assert.equal(s.status,'awaiting_evaluation_approval');
 assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'candidate');assert.equal(l.calls.includes('apply'),false);
 s=await l.run({decision:approve(s)});assert.equal(s.status,'awaiting_change_approval');assert.equal(l.calls.includes('apply'),false);
 await l.run({decision:approve(s)});let status=reviewRuleChangeStatus({request,root:l.root});assert.equal(status.state,'active');assert.equal(status.application_verified,true);assert.equal(status.effectiveness_status,'Unknown');
 writeFileSync(join(f.target,f.path),readFileSync(join(f.target,f.path),'utf8')+'\nOther independently approved guidance.\n');
 assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'active');
 const update=prepareReviewRuleChange({...f.spec,action:'update',entry:{...f.spec.entry,suppression_rule:'Suppress documentation-only and comment-only changes.'},previous_request:request});
 assert.equal(update.revision,2);const second=loop(f,update,'update');s=await second.run();assert.equal(s.status,'awaiting_evaluation_approval');await assert.rejects(second.run({decision:approve({...s,pending_gate:{wrong:true}})}));
 s=await second.run({decision:approve(s)});await second.run({decision:approve(s)});assert.equal(reviewRuleChangeStatus({request:update,root:second.root}).state,'active');
 const retire=prepareReviewRuleChange({...f.spec,action:'retire',entry:update.entry,reason:'Equivalent executable denial checks now cover this rule.',previous_request:update});
 const third=loop(f,retire,'retire');await complete(third);assert.equal(reviewRuleChangeStatus({request:retire,root:third.root}).state,'deprecated');assert.equal(readFileSync(join(f.target,f.path),'utf8'),original+'\nOther independently approved guidance.\n');
});
test('rejection and restoration cannot claim active; file drift and non-applied output remain visible',async t=>{
 const f=fixture(t),request=prepareReviewRuleChange(f.spec),l=loop(f,request);
 let s=await l.run();s=await l.run({decision:approve(s)});await l.run({decision:{...approve(s),disposition:'rejected'}});
 assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'rejected');assert.equal(l.calls.includes('apply'),false);
 const missing=loop(f,request,'missing',false);await complete(missing);assert.equal(reviewRuleChangeStatus({request,root:missing.root}).state,'under_review');
 const good=loop(f,request,'good');await complete(good);s=await good.run({requestRestore:true});await good.run({decision:approve(s)});
 assert.equal(reviewRuleChangeStatus({request,root:good.root}).state,'restored');
});
test('refuse uncertain evidence, missing exceptions, narrow checks, private summaries, drift and unsafe target',t=>{
 const f=fixture(t);
 for(const mutate of [s=>s.entry.owner='unassigned',s=>s.entry.evidence_status='Hypothesis',s=>s.validation.negative=[],s=>s.validation.positive[0].outcome='fail',s=>s.entry.suggested_prevention_target='lint/test/check',s=>s.entry.authority_status='human_confirmed',s=>s.entry.why_it_matters='secret=abc',s=>s.target_path='../outside.md',s=>s.promotion_basis='one-off',s=>s.entry.repeat_pattern='one-off']){
  const s=structuredClone(f.spec);mutate(s);assert.throws(()=>prepareReviewRuleChange(s));
 }
 const request=prepareReviewRuleChange(f.spec),bad=structuredClone(request);bad.entry.owner='another';assert.throws(()=>validateReviewRuleChange(bad));
 assert.throws(()=>prepareReviewRuleChange({...f.spec,action:'update',previous_request:request}),/missing/);
 rmSync(join(f.target,f.path));symlinkSync(join(f.dir,'outside'),join(f.target,f.path));assert.throws(()=>prepareReviewRuleChange(f.spec),/symlink/);
});
test('foreign proposal and foreign target cycles are rejected',async t=>{
 const f=fixture(t),request=prepareReviewRuleChange(f.spec),l=loop(f,request);await l.run();
 const other=prepareReviewRuleChange({...f.spec,reason:'A different plan.'});assert.throws(()=>reviewRuleChangeStatus({request:other,root:l.root}),/different rule/);
 const foreign=loop(f,request,'foreign');foreign.policy.normal_target=join(f.dir,'other');await foreign.run();assert.throws(()=>reviewRuleChangeStatus({request,root:foreign.root}),/different project/);
});
test('assembled npm CLI prepares a Git-free proposal and reports the approved cycle',async t=>{
 const f=fixture(t);if(process.env.ASK_TEST_USE_BUILT_PACKAGE!=='1')buildNpmPackage();const spec=join(f.dir,'spec.json'),output=join(f.dir,'request.json');writeFileSync(spec,JSON.stringify(f.spec));
 const cli=resolve('bin/ask.mjs'),run=args=>spawnSync(process.execPath,[cli,'rules',...args],{cwd:f.dir,encoding:'utf8',timeout:30000});
 let r=run(['prepare','--spec',spec,'--output',output]);assert.equal(r.status,0,r.stderr);const request=JSON.parse(readFileSync(output));
 const l=loop(f,request);await complete(l);r=run(['status','--request',output,'--root',l.root]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).state,'active');
 assert.notEqual(run(['prepare','--spec',spec,'--output',output]).status,0,'no silent overwrite of a proposal');
});

test('effectiveness review exposes noise, recurrence and replacement without automatic adoption or invented causal value',t=>{
 const f=fixture(t),request=prepareReviewRuleChange(f.spec);
 const observations={request_digest:request.request_digest,evidence_digest:canonicalDigest('observed-window'),window:'Two completed review tasks.',rule_firings:4,useful_catches:1,false_positives:3,suppressions:2,recurrences:1,maintenance_minutes:5,assumptions_changed:false,executable_replacement:false};
 let r=reviewRuleEffectiveness({request,observations});assert.equal(r.recommendation,'refresh');assert.equal(r.reasons.length,2);assert.equal(r.mutation_performed,false);assert.equal(r.causal_improvement_claimed,false);
 r=reviewRuleEffectiveness({request,observations:{...observations,executable_replacement:true}});assert.equal(r.recommendation,'consider_retirement');
 r=reviewRuleEffectiveness({request,observations:{...observations,rule_firings:null,useful_catches:null,false_positives:null,recurrences:null}});assert.equal(r.recommendation,'no_refresh_signal');assert.equal(r.effectiveness_status,'Unknown');
 assert.throws(()=>reviewRuleEffectiveness({request,observations:{...observations,useful_catches:5}}));
 assert.throws(()=>reviewRuleEffectiveness({request,observations:{...observations,request_digest:canonicalDigest('other')}}));
});

test('applicable Codex and Claude projections remain required when state disappears and unknown selection is not active',async t=>{
 for(const [adapter,prefix,stateFile] of [['codex','.agents','codex-install-state.json'],['claude-code','.claude','claude-install-state.json']]){
  const f=fixture(t),request=prepareReviewRuleChange(f.spec),l=loop(f,request,'cycle',true,adapter);await complete(l);
  const live=join(f.target,prefix,f.path),state=join(f.target,'.agent-spectrum-kernel',stateFile);
  assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'under_review');
  mkdirSync(dirname(live),{recursive:true});writeFileSync(live,request.rule_block);
  assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'active');
  mkdirSync(dirname(state),{recursive:true});writeFileSync(state,JSON.stringify({selected_skills:[]}));assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'under_review');
  writeFileSync(state,'{}');assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'under_review');
  writeFileSync(state,JSON.stringify({selected_skills:['review-code-health']}));assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'active');
  rmSync(state);rmSync(live);assert.equal(reviewRuleChangeStatus({request,root:l.root}).state,'under_review');
 }
});

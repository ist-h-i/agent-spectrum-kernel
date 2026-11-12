#!/usr/bin/env node
// A proposal/status adapter, not another application or approval engine.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalDigest, assertNoSymlinkPathSegments, readStableBytes, readJsonFileStrict, writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
import { validateJsonSchema } from './json-schema-validation.mjs';
import { assertPublicInstructionSummary } from './instruction-loop-feedback.mjs';
import { inspectSupervisedInstructionLoop, readCompletedInstructionLoopContinuation } from './supervised-instruction-loop.mjs';
import { readRunJournal } from './instruction-run-journal.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const digest=v=>assert.match(v??'',/^sha256:[a-f0-9]{64}$/u);
const fields=(v,keys)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),keys.sort(),'missing or unsupported rule fields');};
const text=v=>{assertPublicInstructionSummary(v);assert.ok(v.length<=512&&!/[\r\n]|<!--|-->/u.test(v),'rule fields must be bounded single-line public summaries');};
function checkEntry(entry){
  assert.deepEqual(validateJsonSchema(entry,{schemaPath:join(ROOT,'schemas/review-rule-ledger-entry.schema.json')}),[],'invalid review rule entry');
  Object.values(entry).forEach(text);
  assert.ok(['Verified','Supported'].includes(entry.evidence_status),'promotion requires supported causal evidence');
  assert.equal(entry.authority_status,'not_asserted','preparation cannot claim human approval');
  assert.equal(entry.record_state,'active','entry describes the proposed active rule, retirement is an operation');
  assert.ok(!['unassigned','unknown','none'].includes(entry.owner.toLowerCase()),'rule owner required');
  assert.ok(['review checklist','project overlay','SKILL.md','review context'].includes(entry.suggested_prevention_target),'route this finding to its narrower check, ledger or backlog instead');
}
function checkValidation(validation){
  fields(validation,['positive','negative']);
  for(const category of ['positive','negative']){
    assert.ok(Array.isArray(validation[category])&&validation[category].length>0&&validation[category].length<=8,`${category} validation required`);
    for(const evidence of validation[category]){fields(evidence,['evidence_digest','summary','outcome']);digest(evidence.evidence_digest);text(evidence.summary);assert.equal(evidence.outcome,'pass','validation must pass before proposing promotion');}
  }
  const refs=[...validation.positive,...validation.negative].map(x=>x.evidence_digest);
  assert.equal(new Set(refs).size,refs.length,'positive and exception checks require distinct evidence');
}
const marker=id=>({start:`<!-- ASK review rule ${id} -->`,end:`<!-- /ASK review rule ${id} -->`});
export function renderReviewRule(entry,revision){
  const m=marker(entry.id);
  return `${m.start}\n### ${entry.id} (revision ${revision})\n\n`+Object.entries(entry).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`- ${k}: ${k==='authority_status'?'human_confirmed':v}`).join('\n')+`\n${m.end}\n`;
}
function ruleRange(content,id){
  const m=marker(id),start=content.indexOf(m.start),end=content.indexOf(m.end);
  if(start===-1&&end===-1)return null;
  assert.ok(start>=0&&end>start&&content.indexOf(m.start,start+1)===-1&&content.indexOf(m.end,end+1)===-1,'ambiguous rule markers');
  return {start,end:end+m.end.length+(content[end+m.end.length]==='\n'?1:0)};
}
export function proposedReviewRuleContent(content,request){
  const range=ruleRange(content,request.entry.id);
  if(request.action==='add'){assert.equal(range,null,'rule already exists; use update');return content+(content&&!content.endsWith('\n')?'\n':'')+request.rule_block;}
  assert.ok(range,'previous rule missing');assert.equal(content.slice(range.start,range.end),request.previous.rule_block,'previous rule drift');
  return content.slice(0,range.start)+request.rule_block+content.slice(range.end);
}
function checkTarget(request){
  assert.equal(resolve(request.target_root),request.target_root,'absolute target_root required');
  assert.match(request.target_path,/^skills\/[a-zA-Z0-9_-]+\/(?:SKILL\.md|references\/[a-zA-Z0-9_-]+\.md)$/u,'use a selected skill SKILL.md or references/*.md file');
}
function targetBytes(request){
  checkTarget(request);return readTargetPath(request.target_root,request.target_path);
}
function readTargetPath(root,relativePath){
  const path=join(root,relativePath);
  assertNoSymlinkPathSegments(root,'rule project');
  assertNoSymlinkPathSegments(path,'rule target',{allowMissingLeaf:true});
  return existsSync(path)?readStableBytes(path,'rule target',1024*1024):null;
}
function observationFor(body){
  const goal=`Review-rule change ${canonicalDigest(body)}. ${body.action} ${body.entry.id}, revision ${body.revision}, only in ${body.target_path}. Preserve all unrelated bytes. Reason: ${body.reason}. `+
    (body.action==='retire'?`Remove exactly the marked rule block for ${body.entry.id}; do not replace it with another rule.`:`Use this exact marked block (human_confirmed is proposed, not approval until the ordinary human change gate):\n${body.rule_block}`)+
    '\nUse the existing supervised loop. Select applicability and suppression/exception cases for human approval before evaluation; report the evidence and request human approval before applying. Do not claim reduced recurrence without observed evidence.';
  assertPublicInstructionSummary(goal);return {goal};
}
export function prepareReviewRuleChange(spec){
  fields(spec,['action','entry','target_root','target_path','promotion_basis','validation','reason',...(spec.previous_request?['previous_request']:[])]);
  checkEntry(spec.entry);checkValidation(spec.validation);text(spec.reason);
  assert.ok(['add','update','retire'].includes(spec.action));
  assert.ok(['repeated','high_impact_single_case','owner_requested','missing_invariant'].includes(spec.promotion_basis),'promotion basis required');
  if(['repeated','high_impact_single_case'].includes(spec.promotion_basis))assert.equal(spec.entry.repeat_pattern,spec.promotion_basis,'promotion basis disagrees with finding');
  const before=targetBytes(spec),content=before?.toString('utf8')??'';
  let previous=null,revision=1;
  if(spec.action!=='add'){
    const p=validateReviewRuleChange(spec.previous_request);assert.notEqual(p.action,'retire','retired rule needs a new proposal');
    assert.equal(p.entry.id,spec.entry.id);assert.equal(p.target_root,spec.target_root);assert.equal(p.target_path,spec.target_path);
    previous={request_digest:p.request_digest,revision:p.revision,rule_block:p.rule_block};revision=p.revision+1;
  }else assert.equal(spec.previous_request,undefined,'add cannot reuse previous authority');
  const body={kind:'review_rule_change_v1',action:spec.action,entry:structuredClone(spec.entry),target_root:spec.target_root,target_path:spec.target_path,
    revision,previous,promotion_basis:spec.promotion_basis,validation:structuredClone(spec.validation),reason:spec.reason,
    rule_block:spec.action==='retire'?'':renderReviewRule(spec.entry,revision),before_file_digest:before===null?null:hash(before)};
  body.desired_file_digest=hash(proposedReviewRuleContent(content,body));
  const observation=observationFor(body);
  return {...body,observation,request_digest:canonicalDigest({...body,observation})};
}
export function validateReviewRuleChange(value){
  fields(value,['kind','action','entry','target_root','target_path','revision','previous','promotion_basis','validation','reason','rule_block','before_file_digest','desired_file_digest','observation','request_digest']);
  checkTarget(value);
  assert.ok(['repeated','high_impact_single_case','owner_requested','missing_invariant'].includes(value.promotion_basis),'promotion basis required');
  if(['repeated','high_impact_single_case'].includes(value.promotion_basis))assert.equal(value.entry.repeat_pattern,value.promotion_basis,'promotion basis disagrees with finding');
  assert.equal(value.kind,'review_rule_change_v1');checkEntry(value.entry);checkValidation(value.validation);text(value.reason);
  assert.ok(['add','update','retire'].includes(value.action));assert.ok(Number.isSafeInteger(value.revision)&&value.revision>0);
  assert.equal(value.rule_block,value.action==='retire'?'':renderReviewRule(value.entry,value.revision));
  if(value.action==='add'){assert.equal(value.previous,null);assert.equal(value.revision,1);}else{
    fields(value.previous,['request_digest','revision','rule_block']);digest(value.previous.request_digest);assert.equal(value.revision,value.previous.revision+1);assertPublicInstructionSummary(value.previous.rule_block);const range=ruleRange(value.previous.rule_block,value.entry.id);assert.ok(range&&range.start===0&&range.end===value.previous.rule_block.length,'invalid previous rule block');
  }
  if(value.before_file_digest!==null)digest(value.before_file_digest);digest(value.desired_file_digest);
  const {request_digest,observation,...body}=value;assert.deepEqual(observation,observationFor(body));assert.equal(request_digest,canonicalDigest({...body,observation}),'rule request drift');
  return value;
}
export function reviewRuleChangeStatus({request,root}){
  validateReviewRuleChange(request);root=resolve(root);assertNoSymlinkPathSegments(root,'rule cycle');
  const {state}=readRunJournal(root);assert.ok(state,'cycle not initialized');
  assert.equal(canonicalDigest(state.policy.observation),canonicalDigest(request.observation),'cycle belongs to a different rule proposal');
  assert.equal(state.policy.normal_target,request.target_root,'cycle targets a different project');
  const inspected=inspectSupervisedInstructionLoop(root);
  const result={rule_id:request.entry.id,revision:request.revision,request_digest:request.request_digest,cycle_status:inspected.status,
    state:'candidate',application_verified:false,effectiveness_status:'Unknown',long_term_effectiveness_claimed:false};
  if(state.status!=='completed')return {...result,next_gate:inspected.pending_gate?.kind??null};
  const completed=readCompletedInstructionLoopContinuation(root);
  result.outcome=completed.outcome;result.journal_digest=completed.journal_digest;
  if(!completed.application_active)return {...result,state:completed.outcome==='restored'?'restored':/rejected/u.test(completed.outcome)?'rejected':'not_active'};
  assert.equal(state.evaluation_decision?.disposition,'approved','missing evaluation approval');
  assert.equal(state.change_decision?.disposition,'approved','missing change approval');
  const projectionPaths=[];
  for(const [adapter,prefix,stateFile] of [['codex','.agents','codex-install-state.json'],['claude-code','.claude','claude-install-state.json']]){
    const statePath=join(request.target_root,'.agent-spectrum-kernel',stateFile);
    const installed=existsSync(statePath);
    if(installed||state.outputs.plan?.normal_plan?.selection?.adapter===adapter){
      if(installed){
        const install=readJsonFileStrict(statePath,'rule adapter state');
        if(!Array.isArray(install.selected_skills)||request.action!=='retire'&&!install.selected_skills.includes(request.target_path.split('/')[1]))return {...result,state:'under_review',reason:`Rule Skill is not selected in ${adapter}.`};
      }
      projectionPaths.push(`${prefix}/${request.target_path}`);
    }
  }
  const actual=targetBytes(request);
  for(const path of [request.target_path,...projectionPaths]){
    const bytes=path===request.target_path?actual:readTargetPath(request.target_root,path);
    const content=bytes?.toString('utf8')??'',range=ruleRange(content,request.entry.id);
    const matches=request.action==='retire'?range===null:range&&content.slice(range.start,range.end)===request.rule_block;
    if(!matches)return {...result,state:'under_review',reason:`Applied rule differs from the exact proposal at ${path}. Refresh or investigate before using the rule.`};
  }
  return {...result,state:request.action==='retire'?'deprecated':'active',application_verified:true,installed_projections_checked:projectionPaths,whole_file_matches_proposal:actual!==null&&hash(actual)===request.desired_file_digest};
}
// Host-reviewed observations, not telemetry scraping or proof of causation.
export function reviewRuleEffectiveness({request,observations}){
  validateReviewRuleChange(request);
  fields(observations,['request_digest','evidence_digest','window','rule_firings','useful_catches','false_positives','suppressions','recurrences','maintenance_minutes','assumptions_changed','executable_replacement']);
  assert.equal(observations.request_digest,request.request_digest,'observations belong to another rule version');
  digest(observations.evidence_digest);text(observations.window);
  for(const k of ['rule_firings','useful_catches','false_positives','suppressions','recurrences','maintenance_minutes'])assert.ok(observations[k]===null||Number.isSafeInteger(observations[k])&&observations[k]>=0,'nonnegative counts or explicit null required');
  for(const k of ['assumptions_changed','executable_replacement'])assert.equal(typeof observations[k],'boolean');
  for(const k of ['useful_catches','false_positives'])if(observations.rule_firings!==null&&observations[k]!==null)assert.ok(observations[k]<=observations.rule_firings,'outcomes exceed firings');
  const reasons=[];
  if(observations.executable_replacement)reasons.push('An executable check may replace the instruction.');
  if(observations.assumptions_changed)reasons.push('Applicability assumptions changed.');
  if(observations.false_positives!==null&&observations.useful_catches!==null&&observations.false_positives>observations.useful_catches)reasons.push('False positives outnumber useful catches.');
  if(observations.recurrences>0)reasons.push('The failure recurred; inspect coverage before strengthening the rule.');
  return {rule_id:request.entry.id,revision:request.revision,observations:structuredClone(observations),
    recommendation:observations.executable_replacement?'consider_retirement':reasons.length?'refresh':'no_refresh_signal',reasons,
    human_decision_required:reasons.length>0,mutation_performed:false,causal_improvement_claimed:false,effectiveness_status:'Unknown'};
}
export function reviewRuleCommand(args){
  const [command,...rest]=args,options={};
  assert.ok(rest.length%2===0,'options require values');for(let i=0;i<rest.length;i+=2){assert.ok(!Object.hasOwn(options,rest[i]),'duplicate option');options[rest[i]]=rest[i+1];}
  if(command==='prepare'){
    fields(options,['--spec','--output']);const request=prepareReviewRuleChange(readJsonFileStrict(resolve(options['--spec']),'rule spec'));
    writeCanonicalJsonNoReplace({outputPath:resolve(options['--output']),artifact:request,label:'rule request'});return request;
  }
  if(command==='review'){fields(options,['--request','--observations']);return reviewRuleEffectiveness({request:readJsonFileStrict(resolve(options['--request']),'rule request'),observations:readJsonFileStrict(resolve(options['--observations']),'rule observations')});}
  assert.equal(command,'status','usage: ask rules prepare --spec file --output file | status --request file --root cycle | review --request file --observations file');
  fields(options,['--request','--root']);return reviewRuleChangeStatus({request:readJsonFileStrict(resolve(options['--request']),'rule request'),root:options['--root']});
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(reviewRuleCommand(process.argv.slice(2)),null,2));}catch(error){console.error(`ask rules: ${error.message}`);process.exitCode=1;}

import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyCoreTask, CORE_CAPABILITIES } from './ask-core-capabilities.mjs';

test('zero-Skill core supplies ordinary tasks, baseline and formal ledger structurally',()=>{
 for(const task_class of ['trivial','implementation','design','investigation','review','handoff']){
  const q=qualifyCoreTask({core_capabilities:CORE_CAPABILITIES,selected_skills:[]},{task_class,signals:[],formal_ledger:true});
  assert.equal(q.status,'structural_capabilities_available');
  assert.equal(q.live_ready,false); assert.equal(q.model_calls,0);
  assert.equal(q.providers['evidence-ledger'],'core:formal-ledger');
  if(task_class==='review')assert.equal(q.providers['review-ai-quality'],'core:review-ai-quality');
 }
});
test('specialized, risk and final gates are blockers, not poor scores',()=>{
 for(const request of [{task_class:'review',signals:['docs_output_change']},{task_class:'implementation',signals:['external_effect']},{task_class:'review',signals:[],final_decision:true}]){
  const q=qualifyCoreTask({core_capabilities:CORE_CAPABILITIES,selected_skills:[]},request);
  assert.equal(q.status,'blocked');assert.equal(q.reason,'capability_missing');
  assert.ok(q.missing_skills.length); assert.equal(q.semantic_score,null);
 }
});
test('reject unknown core capabilities, Skills, signals and request fields',()=>{
 const base={core_capabilities:CORE_CAPABILITIES,selected_skills:[]};
 assert.throws(()=>qualifyCoreTask({...base,core_capabilities:[...CORE_CAPABILITIES,'invented']},{task_class:'review',signals:[]}));
 assert.throws(()=>qualifyCoreTask({...base,selected_skills:['invented']},{task_class:'review',signals:[]}));
 assert.throws(()=>qualifyCoreTask(base,{task_class:'review',signals:['invented']}));
 assert.throws(()=>qualifyCoreTask(base,{task_class:'review',signals:[],waive:true}));
});

test('Full explicitly requested projection Skills never replace common core ownership',()=>{
 const q=qualifyCoreTask({core_capabilities:CORE_CAPABILITIES,selected_skills:['review-ai-quality','evidence-ledger']},{task_class:'review',signals:[],formal_ledger:true,required_skills:['review-ai-quality','evidence-ledger']});
 assert.equal(q.providers['review-ai-quality'],'core:review-ai-quality');
 assert.equal(q.providers['evidence-ledger'],'core:formal-ledger');
 assert.equal(q.providers['extension:review-ai-quality'],'skill:review-ai-quality');
});


import { mkdtempSync,realpathSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync,linkSync,statSync,renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installCoreBundle,auditCoreBundle,inventoryCoreInstall,CORE_STATE } from './install-ask-core-bundle.mjs';
import { CORE_EXTENSION_SKILLS } from './ask-core-capabilities.mjs';
import { inspectCoreClosure,coreAssetMap,loadFrozenProduct,assertFrozenProductSources,digest } from './ask-core-bundle-product.mjs';
import { inspectCoreReviewResult,inspectCoreEnvelope,refuseCoreNativeExecution } from './ask-core-runner-contract.mjs';
import { prepareCoreComparison,replayCoreComparison } from './ask-local-core-comparison.mjs';
const core={core_capabilities:CORE_CAPABILITIES,selected_skills:[]};
const full={core_capabilities:CORE_CAPABILITIES,selected_skills:CORE_EXTENSION_SKILLS};
const review={task_class:'review',signals:[]};
const result=()=>({baseline:{gate_id:'review-ai-quality',status:'pass',evidence:'checked supplied target diff'},additional:[],missing_evidence:[],findings:[]});
const finding=(id='F-A',severity='minor')=>({finding_id:id,severity,merge_blocker:severity==='blocker',practical_impact:'impact',trigger_or_failure_trace:'trigger',evidence_location:'file:1',required_post_fix_condition:'check'});
function scratch(t){const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-core-test-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}

test('closed baseline, missing evidence and findings contracts reject malformed outputs',()=>{
 assert.equal(inspectCoreReviewResult(core,review,result()).status,'model_free_review_contract_verified');
 for(const mutate of [r=>r.baseline.evidence='',r=>r.baseline=[r.baseline],r=>r.additional.push(r.baseline),r=>r.unknown=true,r=>r.findings=[null],r=>r.findings=[finding(),finding()],r=>r.findings=[finding('F-N','nit'),finding('F-B','blocker')]]){
  const r=result();mutate(r);assert.equal(inspectCoreReviewResult(core,review,r).status,'blocked');
 }
 const r=result();r.findings=[finding()];assert.equal(inspectCoreReviewResult(core,review,r).status,'model_free_review_contract_verified');
 r.baseline.status='insufficient_evidence';assert.equal(inspectCoreReviewResult(core,review,r).status,'blocked');
 r.missing_evidence=[{gate_id:'review-ai-quality',missing_input:'target',affected_judgment:'baseline',next_check:'obtain target'}];
 assert.equal(inspectCoreReviewResult(core,review,r).status,'model_free_review_contract_verified');
 r.missing_evidence[0].next_check='';assert.equal(inspectCoreReviewResult(core,review,r).status,'blocked');
});
test('specialized output is not inspected before capability admission; Full final matrix has no merge authority',()=>{
 assert.equal(inspectCoreReviewResult(core,{...review,signals:['docs_output_change']},null).action,'stop_before_native_launch');
 const q=qualifyCoreTask(full,{...review,signals:['docs_output_change']});
 const r=result();r.additional=q.required_skills.map(g=>({gate_id:g,status:'pass',evidence:'checked document',signals:['docs_output_change']}));
 assert.equal(inspectCoreReviewResult(full,{...review,signals:['docs_output_change']},r).status,'model_free_review_contract_verified');
 const f=result();f.decision='approve';
 assert.equal(inspectCoreReviewResult(full,{...review,final_decision:true},f).merge_authorized,false);
 f.findings=[finding()];assert.equal(inspectCoreReviewResult(full,{...review,final_decision:true},f).status,'blocked');
 f.decision='approve_with_comments';assert.equal(inspectCoreReviewResult(full,{...review,final_decision:true},f).status,'model_free_review_contract_verified');
 assert.throws(refuseCoreNativeExecution,/not_admitted/);
});
test('inline envelope binds common core provider and rejects unavailable/invalid routes',()=>{
 const e={schema_version:'1.0.0',route:{work_mode:'実装',operating_mode:'delivery_quality',user_facing:'implementation',internal:{primary:'core:implementation',secondary:[]}},evidence_status:{checked:['fixture'],missing:[]},stop_reason:{status:'completed',details:[],human_decision_required:[],stop_if:[]},next_action:'review'};
 const req={task_class:'implementation',signals:[]};
 assert.equal(inspectCoreEnvelope(core,req,e).status,'model_free_envelope_contract_verified');
 e.route.internal.primary='controlled-implementation';assert.equal(inspectCoreEnvelope(core,req,e).status,'blocked');
 e.route.internal.secondary='invalid';assert.equal(inspectCoreEnvelope(core,req,e).status,'blocked');
 assert.equal(inspectCoreEnvelope(core,req,null).status,'blocked');
});
test('literal closure rejects missing runtime imports, absolute references, schemes and unclassified contracts',()=>{
 for(const ref of ['/b.md','file:///b.md','custom:b.md','../../b.md','\\b.md'])assert.throws(()=>inspectCoreClosure(new Map([['docs/a.md',Buffer.from(`[x](${ref})`)],['docs/b.md',Buffer.from('ok')]])));
 assert.throws(()=>inspectCoreClosure(new Map([['scripts/a.mjs',Buffer.from("import './missing.mjs';")]])),/mandatory_core_dependency_missing/);
 assert.throws(()=>inspectCoreClosure(new Map([['docs/a.md',Buffer.from('docs/missing.md')]])),/unclassified_core_reference/);
 for(const ref of ['/b.json','file:b.json','../missing.json'])assert.throws(()=>inspectCoreClosure(new Map([['schemas/a.json',Buffer.from(JSON.stringify({$ref:ref}))]])));
 assert.equal(inspectCoreClosure().status,'classified_literal_closure_verified');
});
test('actual Node installers preserve identical core, zero core Skills and Full selection with superseded legacy state',async t=>{
 const dir=scratch(t),k=join(dir,'core'),f=join(dir,'full');
 const ks=installCoreBundle(k,'core'),fs=installCoreBundle(f,'full');
 assert.deepEqual(ks.selected_skills,[]);assert.equal(fs.selected_skills.length,47);
 const km=inventoryCoreInstall(k),fm=inventoryCoreInstall(f);
 assert.equal([...km.keys()].some(p=>p.startsWith('skills/')||p.startsWith('.agents/skills/')),false);
 for(const [p,b]of coreAssetMap())assert.ok(km.get(p).equals(b)&&fm.get(p).equals(b),p);
 assert.equal(auditCoreBundle(k,ks.state_digest).status,'model_free_install_verified');
 assert.equal(auditCoreBundle(f,fs.state_digest).status,'model_free_install_verified');
 assert.equal(JSON.parse(fm.get('.agent-spectrum-kernel/codex-install-state.json')).native_admission,false);
 for(const prefix of ['skills','.agents/skills'])for(const skill of ['review-ai-quality','evidence-ledger'])assert.match(fm.get(`${prefix}/${skill}/SKILL.md`).toString(),/one logical result/);
 assert.match(fm.get('skills/review-router/SKILL.md').toString(),/common core baseline/);
 assert.equal(statSync(join(k,CORE_STATE)).mode&0o777,0o600);
 const installed=await import(pathToFileURL(join(k,'scripts/ask-core-runner-contract.mjs')));
 assert.equal(installed.inspectCoreReviewResult(core,review,result()).status,'model_free_review_contract_verified');
 assert.throws(()=>installCoreBundle(k,'core'),/new_canonical_target_required/);
});
test('read-only audit rejects independent digest mismatch, tampering, extra directories, links and unknown state',t=>{
 const dir=scratch(t),k=join(dir,'core'),s=installCoreBundle(k,'core');
 const statePath=join(k,CORE_STATE),original=readFileSync(statePath),before=statSync(statePath).mtimeMs;
 assert.equal(auditCoreBundle(k,s.state_digest).status,'model_free_install_verified');assert.equal(statSync(statePath).mtimeMs,before);
 assert.equal(auditCoreBundle(k).reason,'external_state_digest_required');
 assert.equal(auditCoreBundle(k,'sha256:'+'0'.repeat(64)).reason,'state_digest_changed');
 mkdirSync(join(k,'extra'));assert.equal(auditCoreBundle(k,s.state_digest).reason,'installed_directories_changed');rmSync(join(k,'extra'),{recursive:true});
 const agents=readFileSync(join(k,'AGENTS.md'));writeFileSync(join(k,'AGENTS.md'),'tampered');assert.equal(auditCoreBundle(k,s.state_digest).reason,'installed_inventory_changed');writeFileSync(join(k,'AGENTS.md'),agents);
 symlinkSync('AGENTS.md',join(k,'link'));assert.equal(auditCoreBundle(k,s.state_digest).status,'blocked');rmSync(join(k,'link'));
 linkSync(join(k,'AGENTS.md'),join(k,'hard'));assert.equal(auditCoreBundle(k,s.state_digest).status,'blocked');rmSync(join(k,'hard'));
 const unknown=JSON.parse(original);unknown.live_ready=true;const b=Buffer.from(JSON.stringify(unknown));writeFileSync(statePath,b);assert.equal(auditCoreBundle(k,digest(b)).reason,'invalid_product_state');writeFileSync(statePath,original);
 assert.equal(auditCoreBundle(k,s.state_digest,{task_inputs:{'AGENTS.md':{bytes:agents.length,digest:digest(agents)}}}).status,'blocked');
 assert.equal(auditCoreBundle(k,s.state_digest).status,'model_free_install_verified');
});
test('new comparison has equal public inputs, shared base and blocked actual admission; replay is read-only',t=>{
 const dir=scratch(t),root=join(dir,'comparison');
 const p=prepareCoreComparison(root,{request:review,orderIndex:5});
 assert.equal(p.model_calls,0);assert.equal(p.native_cli_starts,0);assert.equal(p.semantic_scores,null);assert.equal(p.admission.status,'blocked');assert.equal(p.request_authority,'unverified_caller_classification');
 assert.equal(p.qualifiers.core.status,'structural_capabilities_available');
 for(const name of ['core','full'])for(const [path,value]of Object.entries(p.task_inputs))assert.deepEqual(p.conditions[name][path],value);
 for(const path of p.core_asset_paths)assert.deepEqual(p.conditions.core[path],p.conditions.full[path]);
 const control=join(root,'control/core-comparison.json'),before=statSync(control).mtimeMs,raw=readFileSync(control);
 assert.equal(replayCoreComparison(root,p.plan_digest).status,'offline_core_comparison_plan_verified');assert.equal(statSync(control).mtimeMs,before);assert.ok(readFileSync(control).equals(raw));
 assert.equal(replayCoreComparison(root,'sha256:'+'0'.repeat(64)).reason,'plan_digest_changed');
 mkdirSync(join(root,'conditions/plain/extra'));assert.equal(replayCoreComparison(root,p.plan_digest).reason,'condition_inventory_changed');rmSync(join(root,'conditions/plain/extra'),{recursive:true});
 const altered=JSON.parse(raw);altered.admission={status:'available',reasons:[]};const changed=Buffer.from(JSON.stringify(altered));writeFileSync(control,changed);assert.equal(replayCoreComparison(root,digest(changed)).reason,'admission_record_changed');writeFileSync(control,raw);
 assert.throws(()=>prepareCoreComparison(root,{request:review}),/new_core_comparison_root_required/);
 assert.throws(()=>prepareCoreComparison(join(dir,'invalid'),{request:review,waive:true}),/invalid_core_comparison_options/);
 // A caller-signed stored record still cannot exempt a source/comparison overlap.
 const frozen=join(dir,'frozen');mkdirSync(frozen,{mode:0o700});const moved=join(frozen,'comparison');renameSync(root,moved);
 const overlap=JSON.parse(raw);overlap.qualification_options={frozenSourceRoot:frozen};const overlapRaw=Buffer.from(JSON.stringify(overlap));writeFileSync(join(moved,'control/core-comparison.json'),overlapRaw);
 assert.equal(replayCoreComparison(moved,digest(overlapRaw)).reason,'frozen_source_overlap_or_invalid');
});

test('source freeze rejects stale projected/core/builder pins without writing source',()=>{
 const original=loadFrozenProduct();
 for(const field of ['core_sources','full_sources']){const altered=structuredClone(original);altered[field][0].digest='sha256:'+'0'.repeat(64);assert.throws(()=>assertFrozenProductSources(altered),/source_drift/);}
 const altered=structuredClone(original);altered.core_assets['AGENTS.md'].digest='sha256:'+'0'.repeat(64);assert.throws(()=>assertFrozenProductSources(altered),/source_drift/);
});

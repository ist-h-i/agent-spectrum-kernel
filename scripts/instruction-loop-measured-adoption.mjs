// Bind a completed standard comparison to a distinct publication revision.
// No solver, publication, approval, or Registry state transition occurs here.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {devNull} from 'node:os';
import {resolve,join} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {instructionBytesDigest as hash,verifyInstructionEnvironment,instructionEnvironmentTrustOptions} from './instruction-environment.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {inspectPracticalChallengeScoreHandoff} from './practical-challenge-evaluation.mjs';
import {inspectChallengeEvaluationWorker} from './practical-challenge-worker.mjs';
import {bindMeasuredNormalOwnerSource} from './instruction-loop-source-binding.mjs';
import {FULL_SOURCE_DERIVED_PATHS,fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
export const MEASURED_REVIEW_CANONICAL_PATHS=['skills/review-router/SKILL.md','skills/review-ai-quality/SKILL.md','docs/review-finding-contract.md'];
export const MEASURED_REVIEW_TEST_PATH='scripts/test-review-route.mjs';
const read=p=>readJsonFileStrict(p,'measured adoption input',16*1024*1024);
const pin=p=>({path:resolve(p),digest:hash(readStableBytes(p,'measured adoption pin',16*1024*1024))});
function git(root,args){const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`, ...args],{cwd:root,maxBuffer:16*1024*1024,env:{...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,'adoption Git inspection failed');return r.stdout;}
const text=(r,a)=>git(r,a).toString('utf8').trim();
const blob=(r,rev,p)=>hash(git(r,['show',rev+':'+p]));
const limits=['The measured candidate and publication commits are distinct. Only the explicitly matched review instruction assets are transferred; current main as a whole was not re-evaluated.','The completed standard comparison is retained as evidence, not rerun or relabeled as a new generation/evaluation.','Grading observations are assessor judgments; token hierarchy completeness and billed cost remain unknown.','Adoption still requires the separate saved human change decision and normal source publication completion.'];
function evaluationSnapshot(e){
 assert.deepEqual(pin(e.settings.path),e.settings,'measured settings changed');assert.deepEqual(pin(e.config.path),e.config,'measured configuration changed');
 const h=readRunJournal(e.root),s=h.state;assert.equal(h.previous,e.journal_digest,'completed evaluation journal changed');assert.equal(s.status,'completed');assert.equal(s.plan.evidence_kind,'observed','synthetic evaluation cannot support observed adoption');assert.equal(s.evaluation_decision?.disposition,'approved','recorded case approval required');
 const config=read(e.config.path);assert.equal(canonicalDigest(config.plan),canonicalDigest(s.plan));assert.equal(canonicalDigest(config.runtime),s.plan.runtime_digest);assert.ok(config.runtime.commands.trial.pins.some(p=>p.path===e.settings.path&&p.digest===e.settings.digest),'settings not pinned by measured runtime');
 assert.equal(canonicalDigest(s.report),e.report_digest);assert.equal(canonicalDigest(s.plan),e.plan_digest);
 const gate=h.events.map(x=>x.state.gate).find(g=>g&&canonicalDigest(g)===s.evaluation_decision.packet_digest);assert.ok(gate,'case approval must match an actual historical gate');
 assert.equal(s.plan.conditions.find(c=>c.id==='candidate')?.context.environment_ref,'git:'+e.measured_revision,'evaluated candidate source mismatch');
 assert.equal(s.plan.conditions.find(c=>c.id==='baseline')?.context.environment_ref,'git:'+e.baseline_revision,'evaluated baseline source mismatch');
 assert.equal(s.plan.conditions.length,2);assert.equal(s.plan.repetitions,1);assert.equal(s.plan.cases.length,1);assert.equal(s.plan.cases[0].id,'rc01-shared-review-platform');
 assert.equal(s.attempts.length,2,'this bounded bridge imports one pair, not selected subsets or retries');assert.equal(s.report.all_attempts.length,2);
 const settings=read(e.settings.path),selected=[];
 for(const a of s.attempts){assert.equal(a.result.status,'completed');assert.equal(a.result.output.ready_for_next_root,true);assert.equal(a.result.output.grading_execution_state,'completed');assert.equal(a.result.output.semantic_assessment_required,false);
  const report=s.report.all_attempts.find(r=>r.id===a.id);assert.ok(report?.included_in_comparison,'all measured attempts must be retained');assert.equal(canonicalDigest(report.original_result),canonicalDigest(a.result));
  selected.push(a);
 }
 assert.deepEqual(selected.map(a=>a.row.condition).sort(),['baseline','candidate']);return {h,s,settings,selected};
}
async function evaluation(e){const checked=evaluationSnapshot(e);for(const a of checked.selected){const current=await inspectChallengeEvaluationWorker(checked.settings,a.job,resolve(a.result.output.challenge_root,'..'));assert.equal(canonicalDigest(current),canonicalDigest(a.result),'frozen measured answer, grading or resource evidence drift');}return checked;}
function measuredProjection(b,state){
 assert.equal(b.evaluation.measured_revision,b.measured_revision);const row=state.attempts.find(a=>a.row.condition==='candidate'),manifest=read(join(row.result.output.challenge_root,'manifest.json'));
 for(const p of MEASURED_REVIEW_CANONICAL_PATHS){const f=manifest.instructions?.files.find(f=>f.path===p);assert.ok(f,'measured projection misses approved canonical asset');assert.equal(f.digest,blob(b.measured_source_root,b.measured_revision,p),'measured instructions differ from adopted source');}
}
function publication(b,candidate=null){
 for(const root of [b.measured_source_root,b.publication_source_root]){assert.equal(resolve(root),root);assertNoSymlinkPathSegments(root,'adoption source');}
 for(const v of [b.measured_revision,b.publication_revision,b.publication_base_revision])assert.match(v,/^[a-f0-9]{40}$/u);
 assert.equal(text(b.measured_source_root,['rev-parse','HEAD']),b.measured_revision);assert.equal(text(b.measured_source_root,['status','--porcelain','--untracked-files=normal']),'','measured source dirty');
 assert.equal(text(b.publication_source_root,['rev-parse','HEAD']),b.publication_revision);assert.equal(text(b.publication_source_root,['status','--porcelain','--untracked-files=normal']),'','publication source dirty');
 assert.equal(text(b.publication_source_root,['rev-parse','HEAD^{tree}']),b.publication_tree);
 const paths=text(b.publication_source_root,['diff','--name-only',b.publication_base_revision,b.publication_revision]).split('\n').filter(Boolean).sort();
 assert.ok(MEASURED_REVIEW_CANONICAL_PATHS.every(p=>paths.includes(p)),'all three approved review assets must be present');
 for(const p of paths)assert.ok(MEASURED_REVIEW_CANONICAL_PATHS.includes(p)||p===MEASURED_REVIEW_TEST_PATH||FULL_SOURCE_DERIVED_PATHS.includes(p),'unapproved publication path: '+p);
 assert.deepEqual(paths,b.changes.map(x=>x.path).sort(),'publication change inventory drift');
 for(const f of b.changes){assert.equal(blob(b.publication_source_root,b.publication_revision,f.path),f.after);assert.equal(blob(b.publication_source_root,b.publication_base_revision,f.path),f.before);
  if(MEASURED_REVIEW_CANONICAL_PATHS.includes(f.path)||f.path===MEASURED_REVIEW_TEST_PATH){assert.equal(blob(b.measured_source_root,b.measured_revision,f.path),f.after,'published asset/test differs from measured source');assert.equal(f.measured_digest,f.after);}
  else{assert.equal(blob(b.measured_source_root,b.measured_revision,f.path),f.after,'generated publication differs from measured source');assert.equal(f.measured_digest,f.after);}
 }
 if(candidate){assert.equal(candidate.source_root,b.publication_source_root);assert.equal(candidate.source_revision,b.publication_revision);assert.equal(candidate.baseline_revision,b.publication_base_revision);assert.deepEqual([...candidate.changed_paths].sort(),paths);bindMeasuredNormalOwnerSource({sourceRoot:candidate.source_root,candidate});}
 return paths;
}
export async function verifyMeasuredSourceAdoptionBinding(ref,{candidate=null}={}){
 assert.deepEqual(pin(ref.path),ref,'measured adoption binding changed');const b=read(ref.path);assert.equal(b.kind,'measured_review_source_adoption_v1');assert.deepEqual(b.comparison_limits,limits);publication(b,candidate);
 const {s,settings,selected}=await evaluation(b.evaluation);assert.equal(b.evaluation.measured_revision,b.measured_revision);
 const measured=selected.find(a=>a.row.condition==='candidate'),manifest=read(join(measured.result.output.challenge_root,'manifest.json'));
 for(const p of MEASURED_REVIEW_CANONICAL_PATHS){const f=manifest.instructions?.files.find(f=>f.path===p);assert.ok(f,'measured projection misses approved canonical asset');assert.equal(f.digest,blob(b.measured_source_root,b.measured_revision,p),'measured instructions differ from adopted source');}
 return {binding:b,state:s,selected};
}
export async function prepareMeasuredSourceAdoptionBinding({evaluationRoot,settingsPath,measuredSourceRoot,measuredRevision,baselineRevision,candidate,outputPath,configPath=join(evaluationRoot,'..','config.json')}){
 const h=readRunJournal(resolve(evaluationRoot)),settings=pin(settingsPath),changes=text(candidate.source_root,['diff','--name-only',candidate.baseline_revision,candidate.source_revision]).split('\n').filter(Boolean).map(path=>({path,before:blob(candidate.source_root,candidate.baseline_revision,path),after:blob(candidate.source_root,candidate.source_revision,path),measured_digest:blob(measuredSourceRoot,measuredRevision,path)}));
 const b={kind:'measured_review_source_adoption_v1',measured_source_root:resolve(measuredSourceRoot),measured_revision:measuredRevision,publication_source_root:candidate.source_root,publication_revision:candidate.source_revision,publication_base_revision:candidate.baseline_revision,publication_tree:text(candidate.source_root,['rev-parse',candidate.source_revision+'^{tree}']),changes,
  evaluation:{root:resolve(evaluationRoot),journal_digest:h.previous,report_digest:canonicalDigest(h.state.report),plan_digest:canonicalDigest(h.state.plan),config:pin(configPath),settings,measured_revision:measuredRevision,baseline_revision:baselineRevision},comparison_limits:limits};
 publication(b,candidate);await evaluation(b.evaluation);
 const measured=h.state.attempts.find(a=>a.row.condition==='candidate'),manifest=read(join(measured.result.output.challenge_root,'manifest.json'));
 for(const p of MEASURED_REVIEW_CANONICAL_PATHS)assert.equal(manifest.instructions?.files.find(f=>f.path===p)?.digest,blob(measuredSourceRoot,measuredRevision,p),'measured projection/source mismatch');
 outputPath=resolve(outputPath);writeCanonicalJsonNoReplace({outputPath,artifact:b,label:'measured adoption binding'});return pin(outputPath);
}
export async function prepareMeasuredSourceAdoptionImport({profile,policy,candidate,binding}){
 const verified=await verifyMeasuredSourceAdoptionBinding(binding,{candidate}),s=verified.state;
 assert.equal(profile.kind,'full_practical_instruction_loop_profile_v1');assert.equal(profile.normal.kind,'ask_source_repository_v1');assert.equal(policy.evaluation_mode,'practical_v1');assert.equal(policy.normal_target,profile.normal.target);
 assert.equal(profile.generator.candidateRoot,candidate.source_root);assert.equal(profile.generator.fullRoot,candidate.full_root);assert.ok(candidate.owned_version&&candidate.registry&&candidate.environment_object_digest&&candidate.candidate_assets?.length,'registered owned Full candidate required');
 const registry=verifyAssetRegistry({storeRoot:profile.storeRoot,snapshotDigest:candidate.registry.snapshot_digest,trustedAuthorityContexts:candidate.registry.trusted_authority_contexts??[]});
 for(const ref of candidate.candidate_assets){const entry=registry.assets.find(a=>a.record_digest===ref.record_digest&&a.content_digest===ref.content_digest);assert.ok(entry,'candidate Asset is absent from Registry');assert.equal(entry.record.source.revision,candidate.source_revision,'candidate Asset belongs to another revision');}
 const env=verifyInstructionEnvironment({storeRoot:profile.storeRoot,environmentObjectDigest:candidate.environment_object_digest,trustedAssetAuthorityContexts:candidate.registry.trusted_authority_contexts??[],...instructionEnvironmentTrustOptions(profile.practical.environmentTrust)});
 assert.equal(env.environment.retained_layout_object_digest,candidate.layout_object_digest);assert.equal(env.environment.registry_snapshot_digest,candidate.registry.snapshot_digest);
 assert.equal(canonicalDigest(fullInstructionInventory(candidate.full_root).map(f=>({path:f.path,raw_digest:f.sha256}))),canonicalDigest(env.files.map(f=>({path:f.path,raw_digest:f.raw_digest}))),'registered publication Full projection changed');
 for(const ref of candidate.candidate_assets)assert.ok(env.environment.bindings.some(b=>b.asset.record_digest===ref.record_digest&&b.asset.content_digest===ref.content_digest),'candidate Asset missing from publication environment');
 assert.equal(hash(readStableBytes(candidate.owned_version.archive,'owned publication archive',512*1024*1024)),candidate.owned_version.archive_digest);
 assert.deepEqual(policy.conditions,['baseline','candidate']);assert.equal(policy.repetitions,1);assert.equal(policy.max_trials,2);assert.equal(policy.catalog.length,1);assert.equal(policy.catalog[0].id,s.plan.cases[0].id);assert.equal(policy.catalog[0].public_input_digest,s.plan.cases[0].public_input_digest);
 const c={...candidate,measured_adoption:binding,generated_by_this_loop:false,retained_from_prior_evaluation:true};
 const rows=policy.conditions.map((condition,i)=>({id:policy.id+'-'+String(i+1).padStart(3,'0'),case:policy.catalog[0],condition,repetition:1}));
 const trials=rows.map(row=>{const a=verified.selected.find(a=>a.row.condition===row.condition);return {...a.result.output,row,status:a.result.status,original_attempt_id:a.id,original_row:a.row};});
 const select={kind:'completed_measured_selection_v1',case_ids:[policy.catalog[0].id],source_profile_digest:canonicalDigest(profile),practical_plan_digest:canonicalDigest(s.plan),measured_adoption:binding};
 const report={...s.report,adoption_context:{binding,comparison_limits:limits}};
 return {kind:'measured_source_adoption_import_v1',host_verified_prior_approval:true,evidence_ref:binding.path,measured_adoption:binding,outputs:{generate:c,register:c,select,evaluate:{practical_status:'completed',report,trials,executed_by_this_controller:false},report},trials};
}
export async function validateMeasuredSourceAdoptionImport(value,{profile,policy}){
 assert.equal(value.kind,'measured_source_adoption_import_v1');const expected=await prepareMeasuredSourceAdoptionImport({profile,policy,candidate:value.outputs.register,binding:value.measured_adoption});assert.equal(canonicalDigest(value),canonicalDigest(expected),'historical adoption import mismatch');return true;
}

export function verifyMeasuredSourceAdoptionPublication(ref,candidate=null){
 assert.deepEqual(pin(ref.path),ref,'measured adoption binding changed');const b=read(ref.path);assert.equal(b.kind,'measured_review_source_adoption_v1');assert.deepEqual(b.comparison_limits,limits);publication(b,candidate);
 const {h}=evaluationSnapshot(b.evaluation);measuredProjection(b,h.state);
 for(const a of h.state.attempts){const root=a.result.output.challenge_root;inspectPracticalChallengeScoreHandoff(root);for(const f of a.result.output.grade.provider_observation.artifacts)assert.equal(pin(join(root,'..',f.path)).digest,f.digest,'retained grading artifact drift');}
 return b;
}

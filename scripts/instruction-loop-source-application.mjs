import {assertReferenceEvidenceDecision} from './instruction-loop-reference-evidence.mjs';
// ASK source publication is a separate owner capability, not a Full installer.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {devNull} from 'node:os';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {bindMeasuredNormalOwnerSource,verifyNormalOwnerSourceBinding} from './instruction-loop-source-binding.mjs';
import {FULL_SOURCE_DERIVED_PATHS} from './instruction-loop-full-candidate.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
const keys=(v,names)=>assert.deepEqual(Object.keys(v).sort(),[...names].sort());
const sha=v=>assert.match(v??'',/^[a-f0-9]{40}$/u);
const digest=v=>assert.match(v??'',/^sha256:[a-f0-9]{64}$/u);
const save=(path,value)=>writeCanonicalJsonNoReplace({outputPath:path,artifact:value,label:'source application record',maximumBytes:16*1024*1024});
const read=path=>existsSync(path)?readJsonFileStrict(path,'source application record',16*1024*1024):null;
function gitBytes(root,args){const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`,...args],{cwd:root,maxBuffer:16*1024*1024,timeout:120000,
 env:{...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,'source Git operation failed: '+args[0]);return r.stdout;}
const git=(root,args)=>gitBytes(root,args).toString('utf8').trim();
function owner(p){const n=p.normal;keys(n,['kind','target','repository','remote_url','base_branch','base_revision','publication_branch']);assert.equal(n.kind,'ask_source_repository_v1');
 assert.equal(resolve(n.target),n.target);assertNoSymlinkPathSegments(n.target,'source owner');assert.equal(git(n.target,['rev-parse','--show-toplevel']),n.target,'source owner must be its repository root');
 assert.match(n.repository,/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);const slug=n.repository.slice(11);
 assert.ok(n.remote_url==='https://github.com/'+slug+'.git'||n.remote_url==='git@github.com:'+slug+'.git','explicit credential-free repository identity required');
 assert.ok(git(n.target,['config','--get','remote.origin.url'])===n.remote_url,'source remote identity drift');
 for(const branch of [n.base_branch,n.publication_branch]){assert.match(branch,/^[A-Za-z0-9][A-Za-z0-9/_-]{0,99}$/u);assert.ok(!branch.includes('//')&&!branch.endsWith('/'));}assert.notEqual(n.base_branch,n.publication_branch);
 sha(n.base_revision);assert.equal(git(n.target,['rev-parse','HEAD']),n.base_revision,'source owner base drift');assert.equal(git(n.target,['status','--porcelain','--untracked-files=normal']),'','source owner is not clean');
 for(const other of [p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot])assert.ok(n.target!==other&&!n.target.startsWith(other+'/')&&!other.startsWith(n.target+'/'),'source owner overlaps private state');return n;
}
export const validateSourceApplicationOwner=p=>owner(p);
const canonical=path=>/^skills\/[a-z0-9-]+\/(?:SKILL\.md|references\/[A-Za-z0-9_./-]+\.md)$/u.test(path)&&path.split('/').every(v=>v&&v!=='.'&&v!=='..');
function blob(root,revision,path){const listed=git(root,['ls-tree','-r','--name-only',revision,'--',path]);return listed===path?hash(gitBytes(root,['show',revision+':'+path])):null;}
const plans=p=>join(p.stateRoot,'source-publication-plans');
const planPath=(p,job)=>join(plans(p),canonicalDigest(job).slice(7)+'.json');
function checkedPlan(p,plan){const n=owner(p);assert.equal(plan.kind,'ask_source_application_plan_v1');assert.equal(canonicalDigest(plan.destination),canonicalDigest(n),'source target transplant');
 verifyNormalOwnerSourceBinding({sourceRoot:p.generator.candidateRoot,binding:plan.candidate_binding});assert.equal(git(p.generator.candidateRoot,['rev-parse','HEAD^{tree}']),plan.result_tree,'prepared source tree drift');return n;}
export function planSourceApplication(p,job){assert.equal(job.kind,'plan');assert.equal(job.input.target,p.normal.target);const n=owner(p),c=job.input.candidate;
 const binding=bindMeasuredNormalOwnerSource({sourceRoot:p.generator.candidateRoot,candidate:c});sha(c.baseline_revision);
 const baseTree=git(n.target,['rev-parse',n.base_revision+'^{tree}']);assert.equal(git(c.source_root,['rev-parse',c.baseline_revision+'^{tree}']),baseTree,'source base differs from measured environment; re-plan against the current base');
 const paths=git(c.source_root,['diff','--name-only',c.baseline_revision,c.source_revision]).split('\n').filter(Boolean);assert.ok(paths.length>0&&paths.length<=256);
 assert.deepEqual([...c.changed_paths].sort(),[...paths].sort(),'candidate change inventory drift');assert.ok(paths.some(canonical),'source plan requires a canonical Skill change');
 for(const path of paths)assert.ok(canonical(path)||FULL_SOURCE_DERIVED_PATHS.includes(path),'non-instruction source change refused');
 const plan={kind:'ask_source_application_plan_v1',destination:structuredClone(n),candidate_binding:binding,base_tree:baseTree,result_tree:git(c.source_root,['rev-parse','HEAD^{tree}']),
  changes:paths.map(path=>({path,kind:canonical(path)?'canonical':'generated',before:blob(c.source_root,c.baseline_revision,path),after:blob(c.source_root,c.source_revision,path)})),
  allowed_operations:['push_new_branch','open_pull_request','inspect_ci_and_review','normal_merge'],formal_admission_implied:false};
 mkdirSync(plans(p),{recursive:true,mode:0o700});save(planPath(p,job),plan);return plan;
}
function directory(p,job){assert.ok(['apply','restore'].includes(job.kind));return join(p.stateRoot,'source-applications',canonicalDigest(job).slice(7));}
function assertPending(p,job,context){assert.equal(p.kind,'full_practical_instruction_loop_profile_v1');assert.ok(context?.root,'current source coordinator required');assertNoSymlinkPathSegments(context.root,'source coordinator');const state=readRunJournal(context.root).state;assert.ok(state?.pending,'no pending source operation');assert.ok(['advancing','awaiting_source_application','operation_uncertain'].includes(state.status),'source operation is not pending execution');assert.equal(state.gate??null,null);if(state.reference_evidence)assertReferenceEvidenceDecision({root:context.root,state,verifySource:true});else assert.equal(state.evaluation_decision?.disposition,'approved','source application requires the saved case approval');assert.equal(canonicalDigest(state.pending),canonicalDigest(job),'different current source operation');assert.equal(canonicalDigest(state.change_decision),canonicalDigest(job.input.decision),'source decision is not the saved human approval');assert.equal(state.change_decision.disposition,'approved');assert.equal(canonicalDigest(state.outputs?.plan),canonicalDigest(job.input.plan),'source plan is not the saved approved plan');assert.equal(state.outputs?.select?.source_profile_digest,canonicalDigest(p),'source profile differs from approved selection');const policy=v=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtime_digest'));assert.equal(canonicalDigest(policy(state.policy)),canonicalDigest(policy(p.policy)),'source policy differs from coordinator');return state;}
function progress(context){return context?.root?readRunJournal(context.root).state?.source_application_progress:null;}
function prepared(p,job,context={}){assertPending(p,job,context);const dir=directory(p,job),h=read(join(dir,'request.json'));if(!h)return null;assert.equal(h.coordinator_root,context.root,'source coordinator transplant');assert.equal(h.job_digest,canonicalDigest(job));assert.equal(h.profile_digest,canonicalDigest(p));assert.equal(h.plan_digest,canonicalDigest(job.input.plan));
 const old=progress(context);if(old){assert.equal(old.job_digest,canonicalDigest(job));assert.equal(old.handoff_digest,canonicalDigest(h));}return h;}
function pending(h,c){return {kind:'source_application_pending_v1',job_digest:h.job_digest,handoff_digest:canonicalDigest(h),publication_root:h.publication_root,
 completion_state:c?'claimed_publication_requires_inspection':'awaiting_claim',claim_digest:c?canonicalDigest(c):null,model_calls:0,remote_operations_started_by_runtime:false};}
export function prepareSourceApplication(p,job,context={}){assert.equal(job.kind,'apply','source restore requires a separately pinned exact revert candidate and change plan');
 assert.equal(job.input.decision.disposition,'approved','source publication requires the second change approval');digest(job.input.decision.packet_digest);assertPending(p,job,context);const plan=job.input.plan;checkedPlan(p,plan);
 const dir=directory(p,job);assertNoSymlinkPathSegments(dir,'owned source application',{allowMissingLeaf:true});mkdirSync(dir,{recursive:true,mode:0o700});
 const intent={coordinator_root:context.root,job_digest:canonicalDigest(job),profile_digest:canonicalDigest(p),plan_digest:canonicalDigest(plan)};save(join(dir,'intent.json'),intent);
 const repo=join(dir,'publication');if(!existsSync(repo)){git(p.generator.candidateRoot,['clone','--quiet','--no-local','--no-hardlinks','--template=', '--',p.generator.candidateRoot,repo]);git(repo,['remote','set-url','origin',plan.destination.remote_url]);}
 assertNoSymlinkPathSegments(repo,'owned publication');assert.equal(git(repo,['rev-parse','HEAD']),plan.candidate_binding.source_revision);assert.equal(git(repo,['status','--porcelain','--untracked-files=normal']),'');assert.ok(git(repo,['config','--get','remote.origin.url'])===plan.destination.remote_url,'source remote identity drift');
 const h={kind:'ask_source_application_request_v1',...intent,plan,decision:job.input.decision,publication_root:repo,
  public_content_policy:'Publish only the approved source delta and bounded validation summary; keep this request, local paths, original answers and private criteria outside the public PR.',
  completion_contract:'Reported merged PR and bound CI/review evidence; fetch and checkout its normal merge commit in this private clone. Exact parents/base/head/tree are independently checked. PR-only is pending, never applied.',remote_authentication:'host_reported_not_independently_verified'};
 save(join(dir,'request.json'),h);return pending(h,read(join(dir,'claim.json')));
}
function checkedClaim(h,c){keys(c,['handoff_digest','execution_id','actor']);assert.equal(c.handoff_digest,canonicalDigest(h));for(const k of ['execution_id','actor'])assert.match(c[k],/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u);return c;}
function pinClaim(context,c){const old=progress(context)?.claim_digest;if(old){assert.ok(c,'recorded source claim missing; do not claim again');assert.equal(canonicalDigest(c),old,'source claim drift');}}
function checkedCompletion(p,h,c,s){keys(s,['handoff_digest','claim_digest','publication','evidence']);assert.equal(s.handoff_digest,canonicalDigest(h));assert.equal(s.claim_digest,canonicalDigest(c));
 const v=s.publication;keys(v,['state','repository','base_branch','branch','head_commit','merge_commit','merge_tree','pull_request','ci_status','review_status']);
 assert.equal(v.state,'merged','a branch or PR is pending, not applied');assert.equal(v.repository,h.plan.destination.repository);assert.equal(v.base_branch,h.plan.destination.base_branch);assert.equal(v.branch,h.plan.destination.publication_branch);
 assert.equal(v.head_commit,h.plan.candidate_binding.source_revision);sha(v.merge_commit);assert.equal(v.merge_tree,h.plan.result_tree);assert.ok(Number.isSafeInteger(v.pull_request)&&v.pull_request>0);assert.equal(v.ci_status,'passed');assert.equal(v.review_status,'approved');
 assert.ok(Array.isArray(s.evidence)&&s.evidence.length>0&&s.evidence.length<=16);const refs=new Set();
 for(const e of s.evidence){keys(e,['path','digest']);assert.match(e.path,/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u);assert.ok(e.path.split('/').every(x=>x&&x!=='.'&&x!=='..'));assert.ok(!refs.has(e.path));refs.add(e.path);digest(e.digest);const path=join(h.publication_root,'..',e.path);assertNoSymlinkPathSegments(path,'source publication evidence');assert.equal(hash(readStableBytes(path,'source publication evidence',4*1024*1024)),e.digest);}
 assertNoSymlinkPathSegments(h.publication_root,'owned merged source');const repo=h.publication_root;
 assert.ok(git(repo,['config','--get','remote.origin.url'])===h.plan.destination.remote_url,'source remote identity drift');assert.equal(git(repo,['rev-parse','HEAD']),v.merge_commit,'check out the observed main merge in the owned clone');assert.equal(git(repo,['status','--porcelain','--untracked-files=normal']),'');
 assert.deepEqual(git(repo,['rev-list','--parents','-n','1',v.merge_commit]).split(' '),[v.merge_commit,h.plan.destination.base_revision,v.head_commit],'normal merge graph/base/head mismatch');assert.equal(git(repo,['rev-parse',v.merge_commit+'^{tree}']),h.plan.result_tree,'merged tree differs from approved candidate');
 for(const e of h.plan.changes)assert.equal(blob(repo,v.merge_commit,e.path),e.after,'merged changed-file bytes mismatch');
 verifyNormalOwnerSourceBinding({sourceRoot:p.generator.candidateRoot,binding:h.plan.candidate_binding});return s;
}
export function readSourceApplicationRequest(p,job,context={}){const h=prepared(p,job,context);assert.ok(h,'source application not prepared');const c=read(join(directory(p,job),'claim.json'));pinClaim(context,c);if(c)checkedClaim(h,c);
 return {kind:h.kind,handoff_digest:canonicalDigest(h),request:h,existing_claim:c,execution_permission:'Only claim_created:true authorizes a new execution; an existing claim requires observing that execution.'};}
export function claimSourceApplication(p,job,c,context={}){const h=prepared(p,job,context);assert.ok(h);checkedClaim(h,c);const path=join(directory(p,job),'claim.json'),old=read(path);pinClaim(context,old);if(old)assert.equal(canonicalDigest(old),canonicalDigest(c),'source publication already claimed; inspect the existing execution');else checkedPlan(p,h.plan);const r=save(path,c);
 return {status:'claimed',handoff_digest:canonicalDigest(h),claim_digest:canonicalDigest(c),claim_created:r.created,execute_new:r.created,model_calls:0};}
export function completeSourceApplication(p,job,s,context={}){const h=prepared(p,job,context),c=read(join(directory(p,job),'claim.json'));assert.ok(h&&c,'source publication must be claimed first');checkedClaim(h,c);pinClaim(context,c);checkedCompletion(p,h,c,s);const old=progress(context)?.completion_digest;if(old)assert.equal(canonicalDigest(s),old,'source completion conflict');save(join(directory(p,job),'completion.json'),s);return {status:'completion_recorded',completion_digest:canonicalDigest(s),model_calls:0};}
export function inspectSourceApplication(p,job,context={}){
 if(job.kind==='plan'){const plan=read(planPath(p,job));if(plan)checkedPlan(p,plan);return plan;}
 if(!['apply','restore'].includes(job.kind))return null;
 const h=prepared(p,job,context);if(!h)return null;const dir=directory(p,job),c=read(join(dir,'claim.json')),s=read(join(dir,'completion.json'));pinClaim(context,c);if(c)checkedClaim(h,c);
 const expected=progress(context)?.completion_digest;if(expected){assert.ok(s,'recorded source completion missing');assert.equal(canonicalDigest(s),expected);}
 if(!s)return pending(h,c);assert.ok(c);checkedCompletion(p,h,c,s);
 return sourceApplicationOutput(h,s);
}
export function verifyMergedSourceContinuation(application,remoteUrl){assert.equal(application.kind,'ask_source_application_v1');assert.equal(application.status,'merged');assert.equal(application.local_git_content_verified,true);
 const root=application.publication_root;assert.equal(resolve(root),root);assertNoSymlinkPathSegments(root,'merged source continuation');assert.equal(git(root,['rev-parse','HEAD']),application.merge_commit);assert.equal(git(root,['rev-parse','HEAD^{tree}']),application.merge_tree);assert.equal(git(root,['status','--porcelain','--untracked-files=normal']),'');assert.ok(git(root,['config','--get','remote.origin.url'])===remoteUrl,'source remote identity drift');return application;
}

function sourceApplicationOutput(h,s){return {kind:'ask_source_application_v1',status:'merged',source_repository:true,target:h.plan.destination.target,repository:h.plan.destination.repository,application_job_digest:h.job_digest,handoff_digest:canonicalDigest(h),source_revision:h.plan.candidate_binding.source_revision,publication_root:h.publication_root,merge_commit:s.publication.merge_commit,merge_tree:s.publication.merge_tree,local_git_content_verified:true,remote_authentication:'host_reported_not_independently_verified',publication:s.publication,evidence:s.evidence,completion_digest:canonicalDigest(s),formal_admission_implied:false};}
export function verifyRetainedSourceApplication(p,application,{root,job}={}){assert.ok(root&&job,'current source lifecycle operation required');const state=readRunJournal(root).state;if(state.reference_evidence)assertReferenceEvidenceDecision({root,state,verifySource:true});assert.equal(canonicalDigest(state?.pending),canonicalDigest(job),'different current source lifecycle operation');assert.ok(job.kind==='version'&&job.input.action==='activate'||job.kind==='cleanup'&&job.input.disposition==='applied','no source activation/cleanup operation');application??=state.outputs.apply;assert.equal(canonicalDigest(application),canonicalDigest(state.outputs.apply),'source application differs from saved result');digest(application.application_job_digest);
 const dir=join(p.stateRoot,'source-applications',application.application_job_digest.slice(7));const h=read(join(dir,'request.json')),c=read(join(dir,'claim.json')),s=read(join(dir,'completion.json'));assert.ok(h&&c&&s,'retained source publication evidence missing');assert.equal(h.coordinator_root,root,'source coordinator transplant');assert.equal(h.profile_digest,canonicalDigest(p));assert.equal(h.job_digest,application.application_job_digest);assert.equal(canonicalDigest(h),application.handoff_digest);assert.equal(canonicalDigest(h.plan),canonicalDigest(state.outputs.plan));assert.equal(canonicalDigest(h.decision),canonicalDigest(state.change_decision));assert.equal(h.decision.disposition,'approved');checkedClaim(h,c);checkedCompletion(p,h,c,s);assert.equal(canonicalDigest(sourceApplicationOutput(h,s)),canonicalDigest(application),'retained source application result drift');return application;}

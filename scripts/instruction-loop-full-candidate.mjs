// Full candidates reuse the normal source/installers and existing Registry.
// Only selected canonical Markdown reaches the generator; mirrors/state are built
// by the existing installers, never authored by the model.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readdirSync,lstatSync,writeFileSync,existsSync,rmSync,chmodSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {devNull} from 'node:os';
import {canonicalDigest,readStableBytes,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash,captureInstructionEnvironment} from './instruction-environment.mjs';
import {captureRetainedInstructionLayout,verifyRetainedInstructionLayout,retainedInstructionPath} from './retained-instruction-layout.mjs';
import {verifyAssetRegistry,registerAsset} from './asset-registry.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {FULL_REVIEW_FINDING_CONTRACT_PATH} from './instruction-projection-paths.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';
import {snapshotInstructionSource,verifyInstructionSourceSnapshot,writeInstructionSourceSnapshot} from './instruction-source-version.mjs';

const gitEnv=()=>({...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
  GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'});
function git(root,args){const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`,...args],{cwd:root,env:gitEnv(),encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,`local version operation failed: ${args[0]}`);return r.stdout.trim();}
export function fullInstructionInventory(root,relative=''){
  assertNoSymlinkPathSegments(root,'owned Full source');
  return readdirSync(join(root,relative)).sort().flatMap(name=>{
    if(name==='.git'||relative===''&&name==='.ask-source-version.json')return [];
    const path=relative?relative+'/'+name:name,s=lstatSync(join(root,path));assert.ok(!s.isSymbolicLink(),'Full source symlink');
    if(s.isDirectory())return fullInstructionInventory(root,path);
    assert.ok(s.isFile());const b=readStableFile(join(root,path),'Full source file',16*1024*1024).bytes;
    return [{path,bytes:b.length,mode:s.mode&0o777,sha256:hash(b)}];
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function allowed(path,skills){return typeof path==='string'&&skills.some(s=>path===`skills/${s}/SKILL.md`||new RegExp(`^skills/${s}/references/[A-Za-z0-9._/-]+\\.md$`,'u').test(path))&&path.split('/').every(x=>/^[A-Za-z0-9_][A-Za-z0-9._-]*$/u.test(x));}
// This opt-in names a Skill owner, never an arbitrary supporting-document path.
export function reviewFindingContractScope(p){
  if(p.reviewFindingContract===undefined)return null;
  const scope=p.reviewFindingContract;
  assert.ok(scope&&typeof scope==='object'&&!Array.isArray(scope),'review contract scope required');
  assert.deepEqual(Object.keys(scope),['skill'],'closed review contract scope required');
  assert.ok(p.skills?.includes(scope.skill)&&/^[a-z0-9-]+$/u.test(scope.skill),'review contract owner must be a selected Skill');
  return {path:FULL_REVIEW_FINDING_CONTRACT_PATH,skill:scope.skill};
}
const inventoryMap=root=>new Map(fullInstructionInventory(root).map(f=>[f.path,f]));
function actualSkillChange(before,after,skill){
  return [...new Set([...before.keys(),...after.keys()])].some(path=>allowed(path,[skill])&&before.get(path)?.sha256!==after.get(path)?.sha256);
}
function assertReviewContractDelta(before,after,scope){
  const path=FULL_REVIEW_FINDING_CONTRACT_PATH,a=before.get(path),b=after.get(path);
  if(scope)assert.ok(a&&b,'review contract must remain an existing canonical file');
  if(a?.sha256===b?.sha256)return false;
  assert.ok(scope&&a&&b,'review contract change requires explicit scope and an existing canonical file');
  assert.ok(actualSkillChange(before,after,scope.skill),'review contract change requires an actual owner Skill Markdown change');
  return true;
}
export const FULL_SOURCE_DERIVED_PATHS=['docs/fixtures/adapter-runtime-bundle.json','docs/fixtures/adapter-runtime-evidence.json','docs/fixtures/adapter-runtime-profiles.json','docs/fixtures/verification-proof-policy-cases.json','docs/verification-proof-policy-contract.md','docs/validation-report.md',
  ...['implement','investigate','review-pr','verify','handoff'].map(name=>`adapters/claude-code/plugin/skills/${name}/SKILL.md`)];
function filesystemSource(p){
  const kind=p.sourceKind??'git_repository';
  assert.ok(['git_repository','filesystem_snapshot'].includes(kind),'unsupported source kind');
  return kind==='filesystem_snapshot';
}
function assertSourceRevision(p){
  if(filesystemSource(p))return verifyInstructionSourceSnapshot(p.baselineSourceRoot,p.baselineRevision);
  assert.equal(git(p.baselineSourceRoot,['rev-parse','HEAD']),p.baselineRevision,'baseline revision drift');
  assert.equal(git(p.baselineSourceRoot,['status','--porcelain','--untracked-files=no']),'','baseline source must be clean');
}
function sourceValidation(p){
  if(filesystemSource(p)){
    if(p.sourceValidation!==undefined){
      assert.deepEqual(Object.keys(p.sourceValidation),['kind'],'closed source validation setting required');
      assert.equal(p.sourceValidation.kind,'instruction_assets_v1','filesystem sources require instruction asset validation, not repository history validation');
    }
    return {kind:'instruction_assets_v1',entrypoint_contracts:'Preserve selected Skill entrypoints, supporting references and existing installer projection contracts.'};
  }
  if(p.sourceValidation===undefined)return null;
  assert.deepEqual(Object.keys(p.sourceValidation).sort(),['kind'],'closed source validation setting required');
  assert.equal(p.sourceValidation.kind,'ask_repository_v1','unsupported source validation contract');
  assert.equal(git(p.baselineSourceRoot,['rev-parse','--is-shallow-repository']),'false','source validation requires complete local history before authoring');
  for(const path of ['scripts/validate-repo.mjs','docs/validation-report.md']){
    assert.ok(existsSync(join(p.baselineSourceRoot,path)),'source validation input missing: '+path);
    readStableBytes(join(p.baselineSourceRoot,path),'trusted source validation input',16*1024*1024);
    assert.equal(git(p.baselineSourceRoot,['ls-files','--error-unmatch','--',path]),path,'source validation input must be tracked');
  }
  return {kind:'ask_repository_v1',validator_digest:hash(readStableBytes(join(p.baselineSourceRoot,'scripts/validate-repo.mjs'),'trusted source validator',16*1024*1024)),entrypoint_contracts:'Preserve existing required entrypoint headers, exact contract references and proof tokens. Moving them only to a reference does not satisfy unchanged repository validation. The host regenerates the validation report.'};
}
function assertDerivedSourceChanges(authored,root,derivedPaths){
  const before=new Map(authored.map(f=>[f.path,f])),after=new Map(fullInstructionInventory(root).map(f=>[f.path,f]));
  for(const path of new Set([...before.keys(),...after.keys()])){
    const a=before.get(path),b=after.get(path);
    if(a&&b)assert.equal(a.mode,b.mode,'source writer changed file mode: '+path);
    if(a?.sha256===b?.sha256)continue;
    assert.ok(derivedPaths.includes(path),'source writer changed unexpected path: '+path);
    assert.ok(b,'source writer removed derived path: '+path);
  }
}
function validateGeneratedSource(p,expectedValidatorDigest){
  const script=join(p.candidateRoot,'scripts/validate-repo.mjs'),started=Date.now();
  const validatorDigest=hash(readStableBytes(script,'trusted source validator',16*1024*1024));
  assert.equal(validatorDigest,expectedValidatorDigest,'source validator drift before execution');
  const result=spawnSync(process.execPath,[script,'--write-report'],{cwd:p.candidateRoot,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
  const bounded=value=>{const b=Buffer.from(String(value??''));return {text:b.subarray(0,128*1024).toString('utf8'),total_bytes:b.length,truncated:b.length>128*1024};};
  const receipt={kind:'full_source_validation_receipt_v1',contract:'ask_repository_v1',validator_digest:validatorDigest,
    baseline_revision:p.baselineRevision,exit_code:result.status,signal:result.signal??null,error:result.error?String(result.error.message).slice(0,1024):null,
    duration_ms:Date.now()-started,stdout:bounded(result.stdout),stderr:bounded(result.stderr),runtime_or_effectiveness_implied:false};
  const path=join(p.stagingRoot,'source-validation.json');
  writeCanonicalJsonNoReplace({outputPath:path,artifact:receipt,label:'private source validation receipt'});
  assert.equal(result.status,0,'source validation failed; preserve source-validation.json and consumed authoring, do not replay');
  return {status:'passed',kind:'ask_repository_v1',record:receipt,receipt:{path,digest:hash(readStableBytes(path,'source validation receipt'))},
    report_digest:hash(readStableBytes(join(p.candidateRoot,'docs/validation-report.md'),'generated validation report',16*1024*1024)),runtime_or_effectiveness_implied:false};
}
export function compareFullInstructionContext({baselineRoot,candidateRoot,skills,reviewFindingContract}){
  const before=new Map(fullInstructionInventory(baselineRoot).map(f=>[f.path,f])),after=new Map(fullInstructionInventory(candidateRoot).map(f=>[f.path,f]));
  const scope=reviewFindingContractScope({skills,reviewFindingContract}),contractChanged=assertReviewContractDelta(before,after,scope);
  const changed=[];
  for(const path of [...new Set([...before.keys(),...after.keys()])].sort()){
    const a=before.get(path),b=after.get(path);if(a&&b)assert.equal(a.mode,b.mode,'Full context file mode changed: '+path);
    if(a?.sha256===b?.sha256)continue;
    changed.push(path);if(scope&&path===scope.path)continue;
    if(allowed(path,skills)||path.startsWith('.agents/')&&allowed(path.slice(8),skills))continue;
    assert.ok(a&&b,'unexpected Full context addition/removal: '+path);
    if(['.agent-spectrum-kernel/install-state.json','.agent-spectrum-kernel/codex-install-state.json'].includes(path)){
      const old=readJsonFileStrict(join(baselineRoot,path)),next=readJsonFileStrict(join(candidateRoot,path));
      if(path.endsWith('codex-install-state.json')){assert.deepEqual(next.selected_skills,old.selected_skills,'Full capability selection changed');assert.equal(next.selected_profile,old.selected_profile);}
      continue; // Source identity and historical target metadata are regenerated.
    }
    if(path.startsWith('.agents/prompts/')){
      const normalized=root=>readStableBytes(join(root,path),'Full prompt').toString('utf8').replace(/[a-f0-9]{64}/gu,'HASH');
      assert.equal(normalized(baselineRoot),normalized(candidateRoot),'Full prompt changed beyond generated hash bindings');continue;
    }
    assert.fail('unexpected Full supporting-context change: '+path);
  }
  return {changed_paths:changed,...(scope?{canonical_contract_changes:contractChanged?[scope.path]:[],supporting_context_excludes:[scope.path]}:{}),supporting_context_preserved:true,capability_selection_preserved:true,
    owner_metadata_regenerated:true,prompt_changes_only_hash_bindings:true};
}
export function fullGenerationInput(p){
  assert.equal(resolve(p.baselineSourceRoot),p.baselineSourceRoot);assertNoSymlinkPathSegments(p.baselineSourceRoot,'baseline source');
  assertSourceRevision(p);
  const validation=sourceValidation(p),scope=reviewFindingContractScope(p);
  assert.ok(p.skills.length>0&&p.skills.length<=64&&new Set(p.skills).size===p.skills.length);
  for(const s of p.skills)assert.match(s,/^[a-z0-9-]+$/u);
  assert.ok(typeof p.goal==='string'&&p.goal.length>0&&p.goal.length<=8192);
  const files=p.skills.flatMap(s=>fullInstructionInventory(join(p.baselineSourceRoot,'skills',s)).map(f=>({...f,path:`skills/${s}/`+f.path})))
    .filter(f=>allowed(f.path,p.skills)).map(f=>({path:f.path,raw_digest:f.sha256,text:readStableBytes(join(p.baselineSourceRoot,f.path),'public Skill').toString('utf8')}));
  if(scope){
    if(!filesystemSource(p))assert.equal(git(p.baselineSourceRoot,['ls-files','--error-unmatch','--',scope.path]),scope.path,'review contract must be tracked');
    const bytes=readStableBytes(join(p.baselineSourceRoot,scope.path),'public review contract');
    files.push({path:scope.path,raw_digest:hash(bytes),text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)});
  }
  assert.ok(files.reduce((n,f)=>n+Buffer.byteLength(f.text),0)<=2*1024*1024,'bounded public generation input');
  const feedback=p.observation===undefined?null:projectInstructionLoopObservation(p.observation);
  return {kind:'full_skill_revision_request_v1',goal:feedback?.goal??p.goal,baseline_revision:p.baselineRevision,skills:p.skills,files,
    ...(feedback?{work_feedback:feedback,host_goal:p.goal}:{}),
    ...(validation?{source_validation:validation}:{}),...(scope?{review_finding_contract:scope}:{}),
    response_contract:{changes:'write/delete canonical skills/<selected>/SKILL.md or references/*.md only'+(scope?'; also write '+scope.path+' together with an actual Markdown change to its owner Skill '+scope.skill:''),entrypoints_must_remain:true},
    raw_logs_included:false,private_answers_included:false,formal_admission_implied:false};
}
export async function codexFullInstructionProvider(p,input){
  assert.equal(p.modelCallsAuthorized,true,'new Full generation model call is not authorized');
  if(p.executableDigest!==undefined){assert.equal(resolve(p.executable),p.executable,'absolute pinned Full authoring executable required');assert.match(p.executableDigest,/^sha256:[a-f0-9]{64}$/u);assert.equal(hash(readStableBytes(p.executable,'pinned Full authoring executable',16*1024*1024)),p.executableDigest,'Full authoring executable drift');}
  assertNoSymlinkPathSegments(p.sessionRoot,'generation session',{allowMissingLeaf:true});mkdirSync(p.sessionRoot,{mode:0o700});
  const final=join(p.sessionRoot,'last-message.json');
  const prompt='Revise the supplied public '+(input.review_finding_contract?'canonical':'Skill')+' source for the stated goal. Return only JSON {"changes":[{"operation":"write","path":"...","text":"..."}]} (or operation delete for an existing reference). Preserve essential safety and capability boundaries. Do not edit executable code, test cases, scoring, owner state or mirrors.\n'+JSON.stringify(input);
  const argv=['exec','--json','--skip-git-repo-check','--sandbox','read-only','-o',final,...(p.model?['--model',p.model]:[]),'-'];
  const result=await executeCodexSession({executable:p.executable,argv,cwd:p.sessionRoot,input:prompt,timeoutMs:p.timeoutMs,terminationScope:'direct_child',
    env:{...process.env,ASK_LOOP_MODEL_CALLS_AUTHORIZED:'1'}});
  const bounded=value=>{const b=Buffer.from(value??'');return {text:b.subarray(0,128*1024).toString('utf8'),total_bytes:b.length,truncated:b.length>128*1024};};
  let responseRef;try{responseRef={path:final,digest:hash(readStableBytes(final,'Full generator response',8*1024*1024))};}catch{}
  const receiptPath=join(p.sessionRoot,'provider-execution.json'),receipt={kind:'full_authoring_execution_v1',model_call_authorized:true,input_digest:canonicalDigest(input),...(responseRef?{response_ref:responseRef}:{}),
    spawn_observed:result.spawnObserved??null,termination_confirmed:result.terminationConfirmed??null,exit_code:result.exitCode??null,signal:result.signal??null,
    error:result.error??null,timed_out:result.timedOut??false,interrupted:result.interrupted??false,output_limited:result.outputLimited??false,duration_ms:result.durationMs??null,
    stdout:bounded(result.stdout),stderr:bounded(result.stderr),closure_scope:'direct local child only; remote work not inferred',private_diagnostics_not_feedback:true};
  writeCanonicalJsonNoReplace({outputPath:receiptPath,artifact:receipt,label:'private Full authoring execution'});
  assert.ok(result.spawnObserved&&result.terminationConfirmed&&result.exitCode===0&&!result.error&&!result.timedOut&&!result.interrupted&&!result.outputLimited,'Full generation incomplete; preserve session, never retry automatically');
  return {response:readJsonFileStrict(final,'Full generator response',8*1024*1024),execution:{kind:'codex',duration_ms:result.durationMs,model_requested:p.model??null,
    reasoning_configuration:'ordinary CLI configuration, not inspected',root_usage:null,full_hierarchical_usage:null,
    process_lifetime_scope:'direct_child',ambient_read_isolation:'Unknown',receipt:{path:receiptPath,digest:hash(readStableBytes(receiptPath,'Full authoring execution receipt'))}}};
}
export async function generateFullInstructionCandidate(p,provider){
  const roots=[p.baselineSourceRoot,p.storeRoot,p.candidateRoot,p.fullRoot,p.stagingRoot];
  for(const [i,a] of roots.entries())for(const b of roots.slice(i+1))assert.ok(a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/'),'separate source, CAS and materialization roots required');
  const input=fullGenerationInput(p),scope=reviewFindingContractScope(p),provided=await provider(input);assert.deepEqual(Object.keys(provided.response).sort(),['changes'],'Full generator returns only changes');const changes=provided.response.changes;
  assert.ok(Array.isArray(changes)&&changes.length<=256);const seen=new Set();let bytes=0;
  for(const c of changes){
    assert.ok(c&&(allowed(c.path,p.skills)||scope&&c.path===scope.path)&&!seen.has(c.path),'generated path outside allowed Skill source');seen.add(c.path);
    assert.ok(['write','delete'].includes(c.operation));
    assert.deepEqual(Object.keys(c).sort(),(c.operation==='write'?['operation','path','text']:['operation','path']).sort());
    if(c.operation==='write'){assert.ok(typeof c.text==='string'&&c.text.length&&!c.text.includes('\0'));bytes+=Buffer.byteLength(c.text);}
    else assert.ok(c.path.includes('/references/')&&existsSync(join(p.baselineSourceRoot,c.path)),'only existing references may be deleted');
  }
  assert.ok(bytes<=2*1024*1024);
  if(scope){
    const before=new Map(input.files.map(f=>[f.path,{sha256:f.raw_digest}])),after=new Map(before);
    for(const c of changes)if(c.operation==='delete')after.delete(c.path);else after.set(c.path,{sha256:hash(Buffer.from(c.text))});
    assertReviewContractDelta(before,after,scope);
  }
  const filesystem=filesystemSource(p);
  // Revalidate after the provider returns, before allocating materializations.
  assertSourceRevision(p);
  for(const dir of [p.candidateRoot,p.fullRoot,p.stagingRoot]){assertNoSymlinkPathSegments(dir,'fresh owned materialization',{allowMissingLeaf:true});assert.ok(!existsSync(dir),'fresh owned materialization required');mkdirSync(dir,{mode:0o700});}
  if(filesystem){
    for(const file of fullInstructionInventory(p.baselineSourceRoot)){
      const bytes=readStableFile(join(p.baselineSourceRoot,file.path),'pinned filesystem source',16*1024*1024).bytes;
      assert.equal(hash(bytes),file.sha256,'filesystem source changed during materialization');
      const target=join(p.candidateRoot,file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx',mode:file.mode});chmodSync(target,file.mode);
    }
    verifyInstructionSourceSnapshot(p.candidateRoot,p.baselineRevision);
  }else{
    git(p.candidateRoot,['init','--quiet','--template=']);
    git(p.candidateRoot,['fetch','--quiet',...(p.sourceValidation?[]:['--depth=1']),'--no-tags',p.baselineSourceRoot,p.baselineRevision]);
    git(p.candidateRoot,['checkout','--quiet','--detach','FETCH_HEAD']);
  }
  // The provider never receives candidateRoot or this executable checkout.
  for(const c of changes){const path=join(p.candidateRoot,c.path);assertNoSymlinkPathSegments(path,'canonical generated file',{allowMissingLeaf:true});
    if(c.operation==='delete')rmSync(path);else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,c.text,{mode:0o644});}}
  const pluginWriter=join(p.candidateRoot,'scripts/claude-plugin-fixed-entries.mjs');
  const derivedPaths=filesystem?[]:FULL_SOURCE_DERIVED_PATHS.filter(path=>path!=='docs/validation-report.md'&&(!path.startsWith('adapters/')||existsSync(pluginWriter)));
  if(p.sourceValidation&&!filesystem)derivedPaths.push('docs/validation-report.md');
  const authored=p.sourceValidation||scope?fullInstructionInventory(p.candidateRoot):null;
  if(!filesystem){
  const refresh=spawnSync(process.execPath,[join(p.candidateRoot,'scripts/update-adapter-runtime-fixtures.mjs')],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(refresh.status,0,'existing adapter fixture writer failed');
  if(authored)assertDerivedSourceChanges(authored,p.candidateRoot,derivedPaths);
  }
  const derivation=[];
  if(!filesystem&&existsSync(pluginWriter))for(const mode of ['write','check']){
    const result=spawnSync(process.execPath,[pluginWriter,'--'+mode],{cwd:p.candidateRoot,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
    const record={kind:'full_source_derivation_receipt_v1',writer:'claude-plugin-fixed-entries',mode,exit_code:result.status,signal:result.signal??null,
      stdout:String(result.stdout??'').slice(0,131072),stderr:String(result.stderr??'').slice(0,131072),runtime_or_effectiveness_implied:false};
    const path=join(p.stagingRoot,'source-derivation-'+mode+'.json');writeCanonicalJsonNoReplace({outputPath:path,artifact:record,label:'owned source derivation'});
    derivation.push({path:'source-derivation-'+mode+'.json',digest:hash(readStableBytes(path,'source derivation')),record});
    assert.equal(result.status,0,'existing Claude plugin fixed-entry '+mode+' failed; inspect source derivation receipt');
    if(authored)assertDerivedSourceChanges(authored,p.candidateRoot,derivedPaths);
  }
  let validation=!filesystem&&p.sourceValidation?validateGeneratedSource(p,input.source_validation.validator_digest):null;
  if(filesystem){
    for(const skill of p.skills){
      const bytes=readStableBytes(join(p.candidateRoot,'skills',skill,'SKILL.md'),'required Skill entrypoint',2*1024*1024);
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);assert.ok(text.trim().length&&!text.includes('\0'),'empty or invalid Skill entrypoint');
    }

  }
  if(authored)assertDerivedSourceChanges(authored,p.candidateRoot,derivedPaths);
  if(!filesystem)git(p.candidateRoot,['add','--','skills',...(scope?[scope.path]:[]),...derivedPaths.filter(path=>existsSync(join(p.candidateRoot,path)))]);
  const preserved=provided.execution?.preserved_candidate_source;
  if(preserved&&filesystem){
    assert.ok(p.provider?.retainedAuthoring&&p.provider.caseReselection===true,'preserved snapshot requires retained case reselection');
    verifyInstructionSourceSnapshot(preserved.source_root,preserved.source_revision);
    assert.equal(snapshotInstructionSource(p.candidateRoot),preserved.source_revision,'retained candidate source snapshot changed');
  }else if(preserved){
    assert.ok(p.provider?.retainedAuthoring&&p.provider.caseReselection===true,'preserved commit requires retained case reselection');
    assert.equal(resolve(preserved.source_root),preserved.source_root);assertNoSymlinkPathSegments(preserved.source_root,'retained candidate source');
    assert.match(preserved.source_revision,/^[a-f0-9]{40}$/u);
    git(p.candidateRoot,['fetch','--quiet','--no-tags',preserved.source_root,preserved.source_revision]);
    assert.equal(git(p.candidateRoot,['write-tree']),git(p.candidateRoot,['rev-parse',preserved.source_revision+'^{tree}']),'retained candidate source tree changed');
    // Preserve the proven original commit without overwriting any materialized
    // file. This also keeps installer provenance and the Full bytes identical.
    git(p.candidateRoot,['reset','--soft',preserved.source_revision]);
  }else if(!filesystem)git(p.candidateRoot,['-c','user.name=ASK local versioning','-c','user.email=ask-local@invalid','commit','--quiet','--allow-empty','-m','Generated scoped Full instruction candidate']);
  const revision=filesystem?writeInstructionSourceSnapshot(p.candidateRoot):git(p.candidateRoot,['rev-parse','HEAD']);
  const before=filesystem?inventoryMap(p.baselineSourceRoot):null,after=filesystem?inventoryMap(p.candidateRoot):null;
  const changed=filesystem?[...new Set([...before.keys(),...after.keys()])].sort().filter(path=>before.get(path)?.sha256!==after.get(path)?.sha256||before.get(path)?.mode!==after.get(path)?.mode):git(p.candidateRoot,['diff','--name-only',p.baselineRevision,'HEAD']).split('\n').filter(Boolean);
  assert.ok(changed.every(path=>allowed(path,p.skills)||scope&&path===scope.path||derivedPaths.includes(path)),'non-instruction/non-derived source changed');
  for(const script of ['install-kernel.mjs','install-codex-adapter.mjs']){
    const r=spawnSync(process.execPath,[join(p.candidateRoot,'scripts',script),'--target',p.fullRoot,...(script.includes('codex')?['--profile','full']:[])],{encoding:'utf8',maxBuffer:16*1024*1024});
    assert.equal(r.status,0,'existing Full installer failed');
  }
  if(filesystem){
    const record={kind:'full_source_validation_receipt_v1',contract:'instruction_assets_v1',baseline_revision:p.baselineRevision,
      selected_skills:p.skills,entrypoints_present:true,projection_validation:'passed',installers:['install-kernel.mjs','install-codex-adapter.mjs'],runtime_or_effectiveness_implied:false};
    const path=join(p.stagingRoot,'source-validation.json');writeCanonicalJsonNoReplace({outputPath:path,artifact:record,label:'instruction asset validation'});
    validation={status:'passed',kind:'instruction_assets_v1',record,receipt:{path,digest:hash(readStableBytes(path,'instruction asset validation receipt'))},runtime_or_effectiveness_implied:false};
  }
  for(const s of p.supplements??[]){
    retainedInstructionPath(s.path);
    assert.equal(hash(readStableBytes(s.source,'frozen Full supplement')),s.digest);const target=join(p.fullRoot,s.path);
    assert.ok(!existsSync(target),'supplement cannot replace installer-owned content');
    // The retained snapshot validator below rejects unsupported/private paths.
    assert.ok(!s.path.startsWith('/')&&!s.path.split('/').some(x=>['.','..'].includes(x)));
    mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readStableBytes(s.source,'Full supplement'),{mode:0o644});
  }
  const files=fullInstructionInventory(p.fullRoot);
  const layout=captureRetainedInstructionLayout({storeRoot:p.storeRoot,sourceRoot:p.fullRoot,expectedFiles:files,expectedInventoryDigest:canonicalDigest(files)});
  writeCanonicalJsonNoReplace({outputPath:join(p.stagingRoot,'changes.json'),artifact:{input_digest:canonicalDigest(input),changes},label:'owned generation changes',maximumBytes:4*1024*1024});
  writeCanonicalJsonNoReplace({outputPath:join(p.stagingRoot,'owned-files.json'),artifact:{files:[{path:'changes.json',digest:hash(readStableBytes(join(p.stagingRoot,'changes.json'),'owned changes',4*1024*1024))},
    ...derivation.map(({path,digest})=>({path,digest})),...(validation?[{path:'source-validation.json',digest:validation.receipt.digest}]:[])]},label:'owned generation staging'});
  return {kind:'generated_full_instruction_candidate_v1',source_root:p.candidateRoot,...(filesystem?{source_kind:'filesystem_snapshot'}:{}),source_revision:revision,baseline_revision:p.baselineRevision,
    full_root:p.fullRoot,staging_root:p.stagingRoot,changed_paths:changed,derived_binding_paths:changed.filter(path=>derivedPaths.includes(path)),layout_object_digest:layout.object_digest,
    generated_by_this_loop:true,execution:provided.execution,...(derivation.length?{source_derivation:derivation}:{}),...(validation?{source_validation:validation}:{}),formal_admission_implied:false};
}
export function registerFullInstructionCandidate(p,candidate){
  assert.equal(candidate.source_root,p.candidateRoot);assert.equal(candidate.full_root,p.fullRoot);
  const filesystem=filesystemSource(p);
  if(filesystem){assert.equal(candidate.source_kind,'filesystem_snapshot');verifyInstructionSourceSnapshot(p.candidateRoot,candidate.source_revision);}
  else{assert.equal(git(p.candidateRoot,['rev-parse','HEAD']),candidate.source_revision);assert.equal(git(p.candidateRoot,['status','--porcelain']),'','generated source drift');}
  const trusted=p.trustedAuthorityContexts??[],parents=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:p.registrySnapshotDigest,trustedAuthorityContexts:trusted});
  const scope=reviewFindingContractScope(p),source=inventoryMap(p.candidateRoot),baseline=inventoryMap(p.baselineSourceRoot),installed=inventoryMap(p.fullRoot);
  assertReviewContractDelta(baseline,source,scope);
  assertReviewContractDelta(baseline,installed,scope);
  if(scope){
    const retained=verifyRetainedInstructionLayout({storeRoot:p.storeRoot,layoutObjectDigest:candidate.layout_object_digest});
    assert.deepEqual([...installed.values()],retained.layout.files.map(f=>({path:f.path,bytes:f.bytes,mode:f.mode,sha256:f.raw_digest})),'paired Full layout drift');
    assert.equal(installed.get(scope.path)?.sha256,source.get(scope.path)?.sha256,'installed review contract differs from candidate source');
    assert.ok(p.parentAssets.some(ref=>parents.assets.some(a=>a.record_digest===ref.record_digest&&a.record.type_extension.entrypoint===`skills/${scope.skill}/SKILL.md`)),'review contract owner Asset missing');
  }
  // Check all parents before any Registry write, including an inherited binding.
  for(const parent of p.parentAssets){
    const found=parents.assets.find(a=>a.record_digest===parent.record_digest&&a.content_digest===parent.content_digest);assert.ok(found,'parent Asset missing');
    const prefix=found.record.type_extension.entrypoint.replace(/SKILL\.md$/u,'');
    for(const f of found.content.files)if(f.path===FULL_REVIEW_FINDING_CONTRACT_PATH)
      assert.ok(scope&&prefix===`skills/${scope.skill}/`,'unconfigured canonical contract Asset binding');
    if(scope&&prefix===`skills/${scope.skill}/`){
      for(const f of found.content.files)assert.equal(f.raw_digest,baseline.get(f.path)?.sha256,'review contract owner baseline Asset drift');
      const project=(files,prefix)=>[...files.values()].filter(f=>f.path.startsWith(prefix)).map(f=>({path:f.path.slice(prefix.length),sha256:f.sha256}));
      assert.deepEqual(project(installed,prefix),project(source,prefix),'installed owner Skill differs from source');
      assert.deepEqual(project(installed,'.agents/'+prefix),project(source,prefix),'installed owner Skill mirror differs from source');
    }
  }
  let snapshot=p.registrySnapshotDigest;const refs=[],environmentAssets=[],baselineAssets=[];
  for(const parent of p.parentAssets){
    const found=parents.assets.find(a=>a.record_digest===parent.record_digest&&a.content_digest===parent.content_digest);assert.ok(found,'parent Asset missing');
    const d=structuredClone(found.record);delete d.object_kind;const prefix=d.type_extension.entrypoint.replace(/SKILL\.md$/u,'');
    d.version=filesystem?candidate.source_revision:'git:'+candidate.source_revision;d.source.revision=candidate.source_revision;
    if(filesystem){d.source.kind='filesystem_snapshot';d.version_scheme='content_digest';}
    const oldTypes=new Map(found.content.files.map(f=>[f.path,f.media_type]));
    const bindContract=scope&&prefix===`skills/${scope.skill}/`&&(found.content.files.some(f=>f.path===scope.path)||actualSkillChange(baseline,source,scope.skill));
    const files=[...installed.values()].filter(f=>f.path.startsWith(prefix)||bindContract&&f.path===scope.path).map(f=>({path:f.path,raw_digest:f.sha256,media_type:oldTypes.get(f.path)??(f.path.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream')}));
    const projection=files.map(({path,raw_digest})=>({path,raw_digest}));
    if(canonicalDigest(projection)===canonicalDigest(found.record.content.files)){environmentAssets.push(parent);continue;}
    d.content={package_format:'canonical_json_base64_files',files};
    d.derivation={kind:'full_content_revision',parent,delta:{kind:'replacement',summary:'Scoped public Skill revision; normal Full projection generated by existing installers.'}};
    d.safety={...d.safety,status:'not_evaluated'};d.mechanism_and_evidence={...d.mechanism_and_evidence,status:'not_evaluated',evidence_refs:[]};d.evaluation_history={status:'not_evaluated',evidence_refs:[],cost:null};
    d.permissions_and_effects={...d.permissions_and_effects,status:'not_evaluated',permission_refs:[],effect_refs:[]};
    d.maintenance={...d.maintenance,stale_status:'not_assessed',regression_refs:[],retirement:null,rollback:{status:'requires_explicit_authority',target:parent,authority_ref:null}};
    const saved=registerAsset({storeRoot:p.storeRoot,sourceRoot:p.fullRoot,predecessorSnapshotDigest:snapshot,descriptor:d,trustedAuthorityContexts:trusted});snapshot=saved.snapshot_digest;
    const asset={asset_type:d.asset_type,stable_id:d.stable_id,version:d.version,record_digest:saved.record_digest,content_digest:saved.content_digest};refs.push(asset);environmentAssets.push(asset);baselineAssets.push(parent);
  }
  const files=fullInstructionInventory(p.fullRoot),registered=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:snapshot,trustedAuthorityContexts:trusted});
  const bindings=environmentAssets.map(asset=>({asset,files:registered.assets.find(a=>a.record_digest===asset.record_digest).content.files.map(f=>({source:f.path,target:f.path===FULL_REVIEW_FINDING_CONTRACT_PATH?f.path:'.agents/'+f.path}))}));
  const mapped=new Set(bindings.flatMap(b=>b.files.map(f=>f.target)));
  const environment=captureInstructionEnvironment({storeRoot:p.storeRoot,sourceRoot:p.fullRoot,environmentId:p.environmentId,adapter:'codex',runtime:p.runtime,
    registrySnapshotDigest:snapshot,trustedAssetAuthorityContexts:trusted,selectionObjectDigest:null,bindings,supportPaths:files.filter(f=>!mapped.has(f.path)).map(f=>f.path),retainedLayoutObjectDigest:candidate.layout_object_digest});
  return {...candidate,registry:{snapshot_digest:snapshot,trusted_authority_contexts:trusted},candidate_assets:refs,baseline_assets:baselineAssets,environment_assets:environmentAssets,no_change:refs.length===0,
    environment_object_digest:environment.object_digest,formal_admission_implied:false};
}

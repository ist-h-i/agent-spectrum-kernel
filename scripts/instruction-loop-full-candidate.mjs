// Full candidates reuse the normal source/installers and existing Registry.
// Only canonical Skill Markdown reaches the generator; mirrors/state are built
// by the existing installers, never authored by the model.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readdirSync,lstatSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {devNull} from 'node:os';
import {canonicalDigest,readStableBytes,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash,captureInstructionEnvironment} from './instruction-environment.mjs';
import {captureRetainedInstructionLayout,retainedInstructionPath} from './retained-instruction-layout.mjs';
import {verifyAssetRegistry,registerAsset} from './asset-registry.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';

const gitEnv=()=>({...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
  GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'});
function git(root,args){const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`,...args],{cwd:root,env:gitEnv(),encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,`local version operation failed: ${args[0]}`);return r.stdout.trim();}
export function fullInstructionInventory(root,relative=''){
  assertNoSymlinkPathSegments(root,'owned Full source');
  return readdirSync(join(root,relative)).sort().flatMap(name=>{
    if(name==='.git')return [];
    const path=relative?relative+'/'+name:name,s=lstatSync(join(root,path));assert.ok(!s.isSymbolicLink(),'Full source symlink');
    if(s.isDirectory())return fullInstructionInventory(root,path);
    assert.ok(s.isFile());const b=readStableBytes(join(root,path),'Full source file',16*1024*1024);
    return [{path,bytes:b.length,mode:s.mode&0o777,sha256:hash(b)}];
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function allowed(path,skills){return typeof path==='string'&&skills.some(s=>path===`skills/${s}/SKILL.md`||new RegExp(`^skills/${s}/references/[A-Za-z0-9._/-]+\\.md$`,'u').test(path))&&path.split('/').every(x=>/^[A-Za-z0-9_][A-Za-z0-9._-]*$/u.test(x));}
export function compareFullInstructionContext({baselineRoot,candidateRoot,skills}){
  const before=new Map(fullInstructionInventory(baselineRoot).map(f=>[f.path,f])),after=new Map(fullInstructionInventory(candidateRoot).map(f=>[f.path,f]));
  const changed=[];
  for(const path of [...new Set([...before.keys(),...after.keys()])].sort()){
    const a=before.get(path),b=after.get(path);if(a&&b)assert.equal(a.mode,b.mode,'Full context file mode changed: '+path);
    if(a?.sha256===b?.sha256)continue;
    changed.push(path);if(allowed(path,skills)||path.startsWith('.agents/')&&allowed(path.slice(8),skills))continue;
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
  return {changed_paths:changed,supporting_context_preserved:true,capability_selection_preserved:true,
    owner_metadata_regenerated:true,prompt_changes_only_hash_bindings:true};
}
export function fullGenerationInput(p){
  assert.equal(resolve(p.baselineSourceRoot),p.baselineSourceRoot);assertNoSymlinkPathSegments(p.baselineSourceRoot,'baseline source');
  assert.equal(git(p.baselineSourceRoot,['rev-parse','HEAD']),p.baselineRevision,'baseline revision drift');
  assert.equal(git(p.baselineSourceRoot,['status','--porcelain','--untracked-files=no']),'','baseline source must be clean');
  assert.ok(p.skills.length>0&&p.skills.length<=64&&new Set(p.skills).size===p.skills.length);
  for(const s of p.skills)assert.match(s,/^[a-z0-9-]+$/u);
  assert.ok(typeof p.goal==='string'&&p.goal.length>0&&p.goal.length<=8192);
  const files=p.skills.flatMap(s=>fullInstructionInventory(join(p.baselineSourceRoot,'skills',s)).map(f=>({...f,path:`skills/${s}/`+f.path})))
    .filter(f=>allowed(f.path,p.skills)).map(f=>({path:f.path,raw_digest:f.sha256,text:readStableBytes(join(p.baselineSourceRoot,f.path),'public Skill').toString('utf8')}));
  assert.ok(files.reduce((n,f)=>n+Buffer.byteLength(f.text),0)<=2*1024*1024,'bounded public generation input');
  const feedback=p.observation===undefined?null:projectInstructionLoopObservation(p.observation);
  return {kind:'full_skill_revision_request_v1',goal:feedback?.goal??p.goal,baseline_revision:p.baselineRevision,skills:p.skills,files,
    ...(feedback?{work_feedback:feedback,host_goal:p.goal}:{}),
    response_contract:{changes:'write/delete canonical skills/<selected>/SKILL.md or references/*.md only',entrypoints_must_remain:true},
    raw_logs_included:false,private_answers_included:false,formal_admission_implied:false};
}
export async function codexFullInstructionProvider(p,input){
  assert.equal(p.modelCallsAuthorized,true,'new Full generation model call is not authorized');
  assertNoSymlinkPathSegments(p.sessionRoot,'generation session',{allowMissingLeaf:true});mkdirSync(p.sessionRoot,{mode:0o700});
  const final=join(p.sessionRoot,'last-message.json');
  const prompt='Revise the supplied public Skill source for the stated goal. Return only JSON {"changes":[{"operation":"write","path":"...","text":"..."}]} (or operation delete for an existing reference). Preserve essential safety and capability boundaries. Do not edit executable code, test cases, scoring, owner state or mirrors.\n'+JSON.stringify(input);
  const argv=['exec','--json','--skip-git-repo-check','--sandbox','read-only','-o',final,...(p.model?['--model',p.model]:[]),'-'];
  const result=await executeCodexSession({executable:p.executable,argv,cwd:p.sessionRoot,input:prompt,timeoutMs:p.timeoutMs,terminationScope:'direct_child'});
  assert.ok(result.spawnObserved&&result.terminationConfirmed&&result.exitCode===0&&!result.error&&!result.timedOut&&!result.interrupted&&!result.outputLimited,'Full generation incomplete; preserve session, never retry automatically');
  return {response:readJsonFileStrict(final,'Full generator response',8*1024*1024),execution:{kind:'codex',duration_ms:result.durationMs,model_requested:p.model??null,
    reasoning_configuration:'ordinary CLI configuration, not inspected',root_usage:null,full_hierarchical_usage:null,
    process_lifetime_scope:'direct_child',ambient_read_isolation:'Unknown'}};
}
export async function generateFullInstructionCandidate(p,provider){
  const roots=[p.baselineSourceRoot,p.storeRoot,p.candidateRoot,p.fullRoot,p.stagingRoot];
  for(const [i,a] of roots.entries())for(const b of roots.slice(i+1))assert.ok(a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/'),'separate source, CAS and materialization roots required');
  const input=fullGenerationInput(p),provided=await provider(input);assert.deepEqual(Object.keys(provided.response).sort(),['changes'],'Full generator returns only changes');const changes=provided.response.changes;
  assert.ok(Array.isArray(changes)&&changes.length<=256);const seen=new Set();let bytes=0;
  for(const c of changes){
    assert.ok(c&&allowed(c.path,p.skills)&&!seen.has(c.path),'generated path outside allowed Skill source');seen.add(c.path);
    assert.ok(['write','delete'].includes(c.operation));
    assert.deepEqual(Object.keys(c).sort(),(c.operation==='write'?['operation','path','text']:['operation','path']).sort());
    if(c.operation==='write'){assert.ok(typeof c.text==='string'&&c.text.length&&!c.text.includes('\0'));bytes+=Buffer.byteLength(c.text);}
    else assert.ok(c.path.includes('/references/')&&existsSync(join(p.baselineSourceRoot,c.path)),'only existing references may be deleted');
  }
  assert.ok(bytes<=2*1024*1024);
  for(const dir of [p.candidateRoot,p.fullRoot,p.stagingRoot]){assertNoSymlinkPathSegments(dir,'fresh owned materialization',{allowMissingLeaf:true});assert.ok(!existsSync(dir),'fresh owned materialization required');mkdirSync(dir,{mode:0o700});}
  git(p.candidateRoot,['init','--quiet','--template=']);
  git(p.candidateRoot,['fetch','--quiet','--depth=1','--no-tags',p.baselineSourceRoot,p.baselineRevision]);
  git(p.candidateRoot,['checkout','--quiet','--detach','FETCH_HEAD']);
  // The provider never receives candidateRoot or this executable checkout.
  for(const c of changes){const path=join(p.candidateRoot,c.path);assertNoSymlinkPathSegments(path,'canonical generated file',{allowMissingLeaf:true});
    if(c.operation==='delete')rmSync(path);else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,c.text,{mode:0o644});}}
  const derivedPaths=['docs/fixtures/adapter-runtime-bundle.json','docs/fixtures/adapter-runtime-evidence.json','docs/fixtures/adapter-runtime-profiles.json','docs/verification-proof-policy-contract.md'];
  const refresh=spawnSync(process.execPath,[join(p.candidateRoot,'scripts/update-adapter-runtime-fixtures.mjs')],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(refresh.status,0,'existing adapter fixture writer failed');
  git(p.candidateRoot,['add','--','skills',...derivedPaths]);
  git(p.candidateRoot,['-c','user.name=ASK local versioning','-c','user.email=ask-local@invalid','commit','--quiet','--allow-empty','-m','Generated scoped Full instruction candidate']);
  const revision=git(p.candidateRoot,['rev-parse','HEAD']);
  const changed=git(p.candidateRoot,['diff','--name-only',p.baselineRevision,'HEAD']).split('\n').filter(Boolean);
  assert.ok(changed.every(path=>allowed(path,p.skills)||derivedPaths.includes(path)),'non-instruction/non-derived source changed');
  for(const script of ['install-kernel.mjs','install-codex-adapter.mjs']){
    const r=spawnSync(process.execPath,[join(p.candidateRoot,'scripts',script),'--target',p.fullRoot,...(script.includes('codex')?['--profile','full']:[])],{encoding:'utf8',maxBuffer:16*1024*1024});
    assert.equal(r.status,0,'existing Full installer failed');
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
  writeCanonicalJsonNoReplace({outputPath:join(p.stagingRoot,'owned-files.json'),artifact:{files:[{path:'changes.json',digest:hash(readStableBytes(join(p.stagingRoot,'changes.json'),'owned changes',4*1024*1024))}]},label:'owned generation staging'});
  return {kind:'generated_full_instruction_candidate_v1',source_root:p.candidateRoot,source_revision:revision,baseline_revision:p.baselineRevision,
    full_root:p.fullRoot,staging_root:p.stagingRoot,changed_paths:changed,derived_binding_paths:changed.filter(path=>derivedPaths.includes(path)),layout_object_digest:layout.object_digest,
    generated_by_this_loop:true,execution:provided.execution,formal_admission_implied:false};
}
export function registerFullInstructionCandidate(p,candidate){
  assert.equal(candidate.source_root,p.candidateRoot);assert.equal(candidate.full_root,p.fullRoot);
  assert.equal(git(p.candidateRoot,['rev-parse','HEAD']),candidate.source_revision);
  assert.equal(git(p.candidateRoot,['status','--porcelain']),'','generated source drift');
  const trusted=p.trustedAuthorityContexts??[],parents=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:p.registrySnapshotDigest,trustedAuthorityContexts:trusted});
  let snapshot=p.registrySnapshotDigest;const refs=[];
  for(const parent of p.parentAssets){
    const found=parents.assets.find(a=>a.record_digest===parent.record_digest&&a.content_digest===parent.content_digest);assert.ok(found,'parent Asset missing');
    const d=structuredClone(found.record);delete d.object_kind;const prefix=d.type_extension.entrypoint.replace(/SKILL\.md$/u,'');
    d.version='git:'+candidate.source_revision;d.source.revision=candidate.source_revision;
    d.content={package_format:'canonical_json_base64_files',files:fullInstructionInventory(p.fullRoot).filter(f=>f.path.startsWith(prefix)).map(f=>({path:f.path,raw_digest:f.sha256,media_type:f.path.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream'}))};
    d.derivation={kind:'full_content_revision',parent,delta:{kind:'replacement',summary:'Scoped public Skill revision; normal Full projection generated by existing installers.'}};
    d.safety={...d.safety,status:'not_evaluated'};d.mechanism_and_evidence={...d.mechanism_and_evidence,status:'not_evaluated',evidence_refs:[]};d.evaluation_history={status:'not_evaluated',evidence_refs:[],cost:null};
    d.permissions_and_effects={...d.permissions_and_effects,status:'not_evaluated',permission_refs:[],effect_refs:[]};
    d.maintenance={...d.maintenance,stale_status:'not_assessed',regression_refs:[],retirement:null,rollback:{status:'requires_explicit_authority',target:parent,authority_ref:null}};
    const saved=registerAsset({storeRoot:p.storeRoot,sourceRoot:p.fullRoot,predecessorSnapshotDigest:snapshot,descriptor:d,trustedAuthorityContexts:trusted});snapshot=saved.snapshot_digest;
    refs.push({asset_type:d.asset_type,stable_id:d.stable_id,version:d.version,record_digest:saved.record_digest,content_digest:saved.content_digest});
  }
  const files=fullInstructionInventory(p.fullRoot),bindings=refs.map(asset=>({asset,files:files.filter(f=>f.path.startsWith('skills/'+asset.stable_id.split('.').at(-1)+'/')).map(f=>({source:f.path,target:'.agents/'+f.path}))}));
  const mapped=new Set(bindings.flatMap(b=>b.files.map(f=>f.target)));
  const environment=captureInstructionEnvironment({storeRoot:p.storeRoot,sourceRoot:p.fullRoot,environmentId:p.environmentId,adapter:'codex',runtime:p.runtime,
    registrySnapshotDigest:snapshot,trustedAssetAuthorityContexts:trusted,selectionObjectDigest:null,bindings,supportPaths:files.filter(f=>!mapped.has(f.path)).map(f=>f.path),retainedLayoutObjectDigest:candidate.layout_object_digest});
  return {...candidate,registry:{snapshot_digest:snapshot,trusted_authority_contexts:trusted},candidate_assets:refs,baseline_assets:p.parentAssets,
    environment_object_digest:environment.object_digest,formal_admission_implied:false};
}

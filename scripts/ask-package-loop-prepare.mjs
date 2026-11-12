// Prepare a real package workspace for the existing supervised Full loop.
// This never invokes a provider or records either human approval.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateInstructionLoopAssetAuthority } from './instruction-loop-assets.mjs';
import { packageWorkspaceRuntime } from './ask-package-workspace.mjs';
import { readInstructionSourceSnapshot } from './instruction-source-version.mjs';
import { canonicalDigest, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { createEmptyAssetRegistry, registerAsset } from './asset-registry.mjs';
import { fullGenerationInput, fullInstructionInventory } from './instruction-loop-full-candidate.mjs';
import { captureRetainedInstructionLayout } from './retained-instruction-layout.mjs';
import { captureInstructionEnvironment } from './instruction-environment.mjs';
import { createFullPracticalInstructionLoopConfiguration } from './instruction-loop-practical-runtime.mjs';

function descriptor(skill, files, revision) {
  const unknown=()=>({status:'unknown',included:[],excluded:[]});
  return {schema_version:'1.0.0',asset_type:'skill',stable_id:skill,version:revision,version_scheme:'content_digest',
    source:{kind:'filesystem_snapshot',repository_id:'ask-npm-workspace',revision},
    provenance:{origin:'repository_file',license:{status:'unknown',spdx_id:null,evidence_ref:null},owner:{status:'unknown',owner_id:null,evidence_ref:null}},
    derivation:{kind:'root',parent:null,delta:null},dependencies:[],type_extension:{kind:'skill',entrypoint:`skills/${skill}/SKILL.md`},
    content:{package_format:'canonical_json_base64_files',files:files.map(f=>({path:f.path,raw_digest:f.sha256,media_type:f.path.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream'}))},
    compatibility:{asset_contract_versions:['1.0.0'],runtime_profiles:['codex']},
    applicability:{models:unknown(),adapters:{status:'bounded',included:['codex'],excluded:[]},stacks:unknown(),domains:unknown(),projects:unknown(),task_classes:unknown(),included_scopes:['workspace'],excluded_scopes:[],required_capabilities:[],notes:['Initial workspace baseline; registration is not an effectiveness claim.']},
    permissions_and_effects:{status:'not_evaluated',requested_permissions:[],possible_effects:[],permission_refs:[],effect_refs:[]},
    safety:{status:'not_evaluated',classifications:[],constraint_refs:[]},mechanism_and_evidence:{status:'not_evaluated',mechanism_refs:[],evidence_refs:[]},evaluation_history:{status:'not_evaluated',evidence_refs:[],cost:null},
    maintenance:{stale_status:'not_assessed',refresh_conditions:['Re-evaluate after source or runtime changes.'],regression_refs:[],retirement:null,rollback:{status:'requires_explicit_authority',target:null,authority_ref:null}}};
}
export function preparePackageInstructionLoop({workspaceRoot,spec,runId}) {
  assert.match(runId??'',/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u,'run-id must be a portable identifier');
  assert.ok(spec&&typeof spec==='object','spec required');
  assert.ok(Array.isArray(spec.skills)&&spec.skills.length>0&&new Set(spec.skills).size===spec.skills.length,'select distinct skills');
  for(const skill of spec.skills)assert.match(skill,/^[a-z0-9][a-z0-9-]*$/u);
  assert.ok(spec.provider&&spec.runtime&&spec.policy&&spec.selection&&spec.practical,'provider/runtime/policy/selection/practical are required');
  assert.ok(spec.normal&&Object.hasOwn(spec.normal,'target'),'normal.target must be an explicit absolute path or null');
  assert.ok(spec.normal.target===null||typeof spec.normal.target==='string'&&isAbsolute(spec.normal.target),'normal.target must be absolute or null');
  validateInstructionLoopAssetAuthority(spec.assetAuthority);
  if(spec.provider.kind==='codex'){
    assert.ok(typeof spec.provider.executable==='string'&&isAbsolute(spec.provider.executable),'absolute authoring Codex executable required');
    assert.ok(spec.provider.model===null||typeof spec.provider.model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(spec.provider.model),'explicit authoring model or null required');
    assert.ok(Number.isSafeInteger(spec.provider.timeoutMs)&&spec.provider.timeoutMs>0&&spec.provider.timeoutMs<=86400000,'bounded authoring timeoutMs required');
  }
  assert.ok(typeof spec.policy.observation?.goal==='string'&&spec.policy.observation.goal.trim()&&spec.policy.observation.goal.length<=8192,'policy.observation.goal is required');
  const workspace=resolve(workspaceRoot),sourceRoot=packageWorkspaceRuntime(workspace),revision=readInstructionSourceSnapshot(sourceRoot)?.revision;
  assert.ok(revision,'workspace source snapshot required');
  const runRoot=join(workspace,'state','loops',runId);assertNoSymlinkPathSegments(runRoot,'loop root',{allowMissingLeaf:true});
  assert.ok(!existsSync(runRoot),'run already exists; resume its configuration instead');
  const storeRoot=join(runRoot,'store'),baselineRoot=join(runRoot,'baseline');
  mkdirSync(dirname(runRoot),{recursive:true});
  mkdirSync(runRoot,{mode:0o700});
  try {
    for(const script of ['install-kernel.mjs','install-codex-adapter.mjs']){
      const result=spawnSync(process.execPath,[join(sourceRoot,'scripts',script),'--target',baselineRoot,...(script.includes('codex')?['--profile','full']:[])],{encoding:'utf8',maxBuffer:16*1024*1024});
      assert.equal(result.status,0,`baseline installer failed: ${result.stderr||result.stdout}`);
    }
    const inventory=fullInstructionInventory(baselineRoot),parents=[],bindings=[];
    let snapshot=createEmptyAssetRegistry({storeRoot,registryId:`npm-${runId}`,repositoryId:'ask-npm-workspace',scopeId:'workspace'}).snapshot_digest;
    for(const skill of spec.skills){
      const files=inventory.filter(f=>f.path.startsWith(`skills/${skill}/`));assert.ok(files.some(f=>f.path===`skills/${skill}/SKILL.md`),`unknown skill ${skill}`);
      const d=descriptor(skill,files,revision),saved=registerAsset({storeRoot,sourceRoot:baselineRoot,predecessorSnapshotDigest:snapshot,descriptor:d,trustedAuthorityContexts:[]});snapshot=saved.snapshot_digest;
      const asset={asset_type:'skill',stable_id:skill,version:revision,record_digest:saved.record_digest,content_digest:saved.content_digest};parents.push(asset);
      bindings.push({asset,files:files.map(f=>({source:f.path,target:'.agents/'+f.path}))});
    }
    const layout=captureRetainedInstructionLayout({storeRoot,sourceRoot:baselineRoot,expectedFiles:inventory,expectedInventoryDigest:canonicalDigest(inventory)});
    const mapped=new Set(bindings.flatMap(b=>b.files.map(f=>f.target)));
    const env=captureInstructionEnvironment({storeRoot,sourceRoot:baselineRoot,environmentId:`${runId}-baseline`,adapter:'codex',runtime:spec.runtime,registrySnapshotDigest:snapshot,trustedAssetAuthorityContexts:[],selectionObjectDigest:null,bindings,supportPaths:inventory.filter(f=>!mapped.has(f.path)).map(f=>f.path),retainedLayoutObjectDigest:layout.object_digest});
    const profile={kind:'full_practical_instruction_loop_profile_v1',protectedRoot:workspace,stateRoot:join(runRoot,'runtime-state'),storeRoot,normal:spec.normal,
      policy:{...spec.policy,normal_target:spec.normal.target,evaluation_mode:'practical_v1',formal_admission_implied:false},selection:spec.selection,
      generator:{goal:spec.policy.observation.goal,baselineSourceRoot:sourceRoot,baselineRevision:revision,sourceKind:'filesystem_snapshot',storeRoot,candidateRoot:join(runRoot,'candidate-source'),fullRoot:join(runRoot,'candidate'),stagingRoot:join(runRoot,'staging'),environmentId:`${runId}-candidate`,runtime:spec.runtime,skills:spec.skills,parentAssets:parents,registrySnapshotDigest:snapshot,trustedAuthorityContexts:[],provider:spec.provider.kind==='codex'?{...spec.provider,sessionRoot:join(runRoot,'generation-session')}:spec.provider},
      baselineEnvironmentObjectDigest:env.object_digest,
      practical:{...spec.practical,root:join(runRoot,'evaluation'),baselineRoot}};
    profile.assetAuthority=spec.assetAuthority;
    fullGenerationInput(profile.generator); // Exercise the real authoring input contract without dispatching its provider.
    const profilePath=join(runRoot,'profile.json'),configPath=join(runRoot,'configuration.json');
    writeFileSync(profilePath,JSON.stringify(profile,null,2)+'\n',{flag:'wx'});
    const configuration=createFullPracticalInstructionLoopConfiguration(profilePath);
    writeFileSync(configPath,JSON.stringify(configuration,null,2)+'\n',{flag:'wx'});
    return {profile_path:profilePath,config_path:configPath,root:join(runRoot,'coordinator'),models_started:false,approvals_recorded:false};
  } catch(error) {rmSync(runRoot,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  for(const name of ['--workspace','--spec','--run-id'])assert.ok(args.includes(name),`${name} required`);
  console.log(JSON.stringify(preparePackageInstructionLoop({workspaceRoot:value('--workspace'),spec:JSON.parse(readFileSync(value('--spec'),'utf8')),runId:value('--run-id')}),null,2));
}

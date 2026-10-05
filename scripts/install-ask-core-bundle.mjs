import { spawnSync } from 'node:child_process';
import { existsSync,lstatSync,mkdirSync,readdirSync,realpathSync,writeFileSync } from 'node:fs';
import { dirname,resolve,join,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import { coreAssetMap,inspectCoreClosure,sourceBytes,digest,assetRecords,loadFrozenProduct,CORE_PRODUCT,safePath } from './ask-core-bundle-product.mjs';
import { CORE_CAPABILITIES,CORE_EXTENSION_SKILLS } from './ask-core-capabilities.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const CORE_STATE='.agent-spectrum-kernel/core-bundle-state.json';
const LEGACY_BASE='docs/mac-ask-full-static-inventory.json',SUPPLEMENT='docs/mac-ask-full-reference-supplement.json';
const readJson=path=>parseJsonRejectDuplicateKeys(sourceBytes(path).toString('utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function targetBoundary(target){
 if(typeof process.getuid!=='function'||!/^v24\./u.test(process.version))throw new Error('unsupported_core_runtime');
 if(typeof target!=='string'||!isAbsolute(target)||resolve(target)!==target||target==='/'||existsSync(target)||realpathSync(dirname(target))!==dirname(target)||target===ROOT||target.startsWith(`${ROOT}/`)||ROOT.startsWith(`${target}/`))throw new Error('new_canonical_target_required');
}
function write(target,path,bytes,replace=false){
 if(!safePath(path))throw new Error('unsafe_product_path');
 mkdirSync(dirname(join(target,path)),{recursive:true,mode:0o700});
 writeFileSync(join(target,path),bytes,{flag:replace?'w':'wx',mode:0o600});
}
export function inventoryCoreInstall(root){
 if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root)throw new Error('unsafe_product_root');
 const top=lstatSync(root);if(!top.isDirectory()||top.isSymbolicLink()||top.uid!==process.getuid()||(top.mode&0o777)!==0o700)throw new Error('unsafe_product_root');
 const entries=new Map(),directories=[];
 function walk(relative=''){
  for(const item of readdirSync(join(root,relative),{withFileTypes:true})){
   const path=relative?`${relative}/${item.name}`:item.name;if(!safePath(path))throw new Error('unsafe_product_path');
   const s=lstatSync(join(root,path));if(s.uid!==process.getuid()||s.isSymbolicLink())throw new Error('unsafe_product_entry');
   if(s.isDirectory()){directories.push(path);walk(path);}
   else if(s.isFile()&&s.nlink===1)entries.set(path,readStableFile(join(root,path),'installed core product',1048576).bytes);
   else throw new Error('unsafe_product_entry');
   if(entries.size+directories.length>1000)throw new Error('product_inventory_limit');
  }
 }walk();entries.directories=directories.sort();return entries;
}
/** Versioned projections of existing Full Skills; no default source is edited. */
function projectFullSkill(path,bytes){
 if(!/(?:^skills\/|^\.agents\/skills\/)/u.test(path)||!path.endsWith('.md'))return bytes;
 let text=bytes.toString('utf8').replaceAll('.agent-spectrum-kernel/codex-install-state.json',CORE_STATE).replaceAll('.agent-spectrum-kernel/claude-install-state.json',CORE_STATE);
 if(/\/(review-ai-quality|evidence-ledger)\/SKILL\.md$/u.test(path)){
  const name=path.split('/').at(-2),core=name==='review-ai-quality'?'core:review-ai-quality':'core:formal-ledger';
  text=`---\nname: ${name}\ndescription: Consume the common ASK Core Bundle ${core} obligation without creating a second logical result.\n---\n\n# Core obligation projection\n\nThis extension is part of ASK Core Bundle Full 1.0.0. Read AGENTS.md and ${CORE_STATE}. The canonical procedure is the common core entry, not a second Skill-owned baseline/ledger. If a current result of that exact core obligation exists for this target, consume its evidence references. Otherwise perform the core procedure once and record one logical result. Preserve the closed statuses, finding/missing-evidence contracts, specialized blockers and final-gate ownership. Never claim a physical Skill invocation count from this projection.\n`;
 }else if(/\/review-router\/SKILL\.md$/u.test(path)){
  text=text.replace('4. Run the baseline semantic review first.','4. Consume the common core baseline semantic review first.\n   - The canonical baseline procedure is in AGENTS.md. Reuse its one current logical result for this exact target; if absent, perform that core procedure once. Do not create a second Skill-owned baseline result.');
  text=text.replace('A missing baseline capability stops as capability_missing. Heavy gates never substitute for it.','A missing core:review-ai-quality capability stops as capability_missing. Heavy gates never substitute for it.');
 }
 return Buffer.from(text);
}
export function verifyLegacyFullSources(){
 if(digest(sourceBytes(LEGACY_BASE))!=='sha256:3634c9ef3801067636d990a63f1793c268390ccb4012a1e2f1c4ac2e5b566bed'||digest(sourceBytes(SUPPLEMENT))!=='sha256:466da3374a9d2311a335ebf7113288dccd1d1c25c9a5b9e278f4d03e61a05b5f')throw new Error('legacy_full_identity_drift');
 const base=readJson(LEGACY_BASE),extra=readJson(SUPPLEMENT),plan=buildCodexProjectionPlan({profileName:'full'});
 for(const item of [...base.core_sources,...base.renderer_inputs.canonical,...base.renderer_inputs.adapter_owned,base.kernel_renderer_source,...extra.assets])if(digest(sourceBytes(item.path))!==item.digest)throw new Error('legacy_full_source_drift');
 if(!same(plan.skills,CORE_EXTENSION_SKILLS)||plan.skills.length!==47||plan.prompts.length!==5||plan.commands.length!==1||plan.fingerprint!==base.fingerprint)throw new Error('full_selection_drift');
 return {base,extra,plan};
}
/** Internal materializer for generation and install: Node installers only, never Codex. */
export function materializeCoreProfile(target,profile){
 if(!['core','full'].includes(profile))throw new Error('unknown_core_profile');targetBoundary(target);inspectCoreClosure();
 const core=coreAssetMap(),full=profile==='full'?verifyLegacyFullSources():null;
 mkdirSync(target,{mode:0o700});
 if(full){
  for(const [script,args]of [['install-kernel.mjs',[]],['install-codex-adapter.mjs',['--profile','full']]]){
   const r=spawnSync(process.execPath,[join(ROOT,'scripts',script),'--target',target,...args],{cwd:ROOT,env:{PATH:''},timeout:15000,maxBuffer:1048576,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   if(r.error||r.status!==0||r.signal)throw new Error('full_node_installer_refused_preserve_partial');
  }
  for(const asset of full.extra.assets)write(target,asset.path,sourceBytes(asset.path));
  // New candidate roots only. Original states never describe the new product as active.
  for(const path of ['.agent-spectrum-kernel/install-state.json','.agent-spectrum-kernel/codex-install-state.json'])write(target,path,Buffer.from(JSON.stringify({install_status:'superseded_by_ask_core_bundle_v1',product:CORE_PRODUCT,state_path:CORE_STATE,native_admission:false})+'\n'),true);
  for(const [path,bytes]of inventoryCoreInstall(target)){
   const projected=projectFullSkill(path,bytes);if(!projected.equals(bytes))write(target,path,projected,true);
  }
 }
 for(const [path,bytes]of core)write(target,path,bytes,existsSync(join(target,path)));
 return inventoryCoreInstall(target);
}
export function installCoreBundle(target,profile){
 const manifest=loadFrozenProduct();
 // Source authority is checked before any child or writes, including transitive builders.
 const bytes=sourceBytes('products/ask-core-bundle/manifest.json'),assets=materializeCoreProfile(target,profile);
 const expected=profile==='core'?manifest.core_assets:manifest.full_assets;
 if(!same(assetRecords(assets),expected))throw new Error('generated_product_inventory_drift_preserve_partial');
 const state={kind:'ask_core_bundle_install_state_v1',product:CORE_PRODUCT,profile,product_manifest_digest:digest(bytes),core_capabilities:[...CORE_CAPABILITIES],selected_skills:profile==='full'?[...CORE_EXTENSION_SKILLS]:[],
  core_asset_paths:Object.keys(manifest.core_assets),assets:expected,legacy_managed_runner:'not_admitted',runner_contract:'model_free_only',live_ready:false,model_calls:0,native_cli_starts:0};
 const raw=Buffer.from(JSON.stringify(state,null,2)+'\n');write(target,CORE_STATE,raw);
 return {...state,state_digest:digest(raw)};
}
/** Read-only exact inventory audit; no installer, Git, transport, grant or model call. */
export function auditCoreBundle(target,expectedStateDigest,options={}){
 try{
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(x=>x!=='task_inputs'))throw new Error('invalid_audit_options');
  const inputs=options.task_inputs??{};if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new Error('invalid_task_input_contract');
  for(const [path,record]of Object.entries(inputs))if(!safePath(path)||!(path==='task.md'||path.startsWith('workspace/'))||!record||!same(Object.keys(record).sort(),['bytes','digest'])||!Number.isSafeInteger(record.bytes)||record.bytes<0||record.bytes>1048576||!/^sha256:[a-f0-9]{64}$/u.test(record.digest))throw new Error('invalid_task_input_contract');
  if(!/^sha256:[a-f0-9]{64}$/u.test(expectedStateDigest??''))throw new Error('external_state_digest_required');
  const manifest=loadFrozenProduct(),assets=inventoryCoreInstall(target),raw=assets.get(CORE_STATE);
  if(!raw||digest(raw)!==expectedStateDigest)throw new Error('state_digest_changed');
  const state=parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  const keys=['kind','product','profile','product_manifest_digest','core_capabilities','selected_skills','core_asset_paths','assets','legacy_managed_runner','runner_contract','live_ready','model_calls','native_cli_starts'];
  if(!same(Object.keys(state).sort(),keys.sort()))throw new Error('invalid_product_state_shape');
  const profile=state.profile,expected=profile==='core'?manifest.core_assets:profile==='full'?manifest.full_assets:null;
  if(!expected||state.kind!=='ask_core_bundle_install_state_v1'||state.product!==CORE_PRODUCT||state.live_ready!==false||state.model_calls!==0||state.native_cli_starts!==0||state.product_manifest_digest!==digest(sourceBytes('products/ask-core-bundle/manifest.json'))||!same(state.core_capabilities,CORE_CAPABILITIES)||!same(state.selected_skills,profile==='core'?[]:CORE_EXTENSION_SKILLS)||!same(state.assets,expected)||!same(state.core_asset_paths,Object.keys(manifest.core_assets))||state.legacy_managed_runner!=='not_admitted'||state.runner_contract!=='model_free_only')throw new Error('invalid_product_state');
  const dirs=new Set();for(const path of [...Object.keys(expected),...Object.keys(inputs),CORE_STATE]){let p=dirname(path);while(p!=='.'){dirs.add(p);p=dirname(p);}}
  if(!same(assets.directories,[...dirs].sort()))throw new Error('installed_directories_changed');
  for(const [path,record]of Object.entries(inputs)){const b=assets.get(path);if(!b||b.length!==record.bytes||digest(b)!==record.digest)throw new Error('task_input_changed');assets.delete(path);}
  assets.delete(CORE_STATE);if(!same(assetRecords(assets),expected))throw new Error('installed_inventory_changed');
  const s=lstatSync(join(target,CORE_STATE));if((s.mode&0o777)!==0o600)throw new Error('unsafe_state_mode');
  return {...state,status:'model_free_install_verified',state_digest:expectedStateDigest};
 }catch(error){return {status:'blocked',reason:/^[a-z_]+$/u.test(error.message)?error.message:'product_audit_refused',live_ready:false,model_calls:0,native_cli_starts:0};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,target,value,...extra]=process.argv.slice(2);if(extra.length)throw new Error('invalid_arguments');
  const result=command==='install'?installCoreBundle(target,value):command==='audit'?auditCoreBundle(target,value):(()=>{throw new Error('native_execution_not_admitted');})();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status==='blocked')process.exitCode=2;
 }catch{process.stderr.write('Core Bundle operation refused; existing records preserved; no model/native execution.\n');process.exitCode=1;}
}

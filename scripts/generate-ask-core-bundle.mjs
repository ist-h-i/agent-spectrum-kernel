import { mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,resolve,join,posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { CORE_SOURCE_PATHS,CORE_PRODUCT,PRODUCT_MANIFEST,coreAssetMap,coreSourceRecords,inspectCoreClosure,assetRecords,sourceBytes,digest,safePath } from './ask-core-bundle-product.mjs';
import { materializeCoreProfile,verifyLegacyFullSources } from './install-ask-core-bundle.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function fullSources(){
 const {base,extra}=verifyLegacyFullSources();
 const paths=new Set(['docs/mac-ask-full-static-inventory.json','docs/mac-ask-full-reference-supplement.json','manifest.json',
  ...base.core_sources.map(x=>x.path),...base.renderer_inputs.canonical.map(x=>x.path),...base.renderer_inputs.adapter_owned.map(x=>x.path),base.kernel_renderer_source.path,...extra.assets.map(x=>x.path),
  'scripts/install-kernel.mjs','scripts/install-codex-adapter.mjs','scripts/install-ask-core-bundle.mjs','scripts/ask-core-bundle-product.mjs','scripts/generate-ask-core-bundle.mjs']);
 // Freeze the complete literal builder module chain before any installer spawn.
 const queue=[...paths].filter(x=>x.endsWith('.mjs'));
 while(queue.length){const path=queue.pop(),text=sourceBytes(path).toString('utf8');
  for(const m of text.matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)){
   if(isBuiltin(m[1]))continue;if(!m[1].startsWith('.'))throw new Error('unsupported_builder_import');
   const ref=posix.normalize(posix.join(posix.dirname(path),m[1]));if(!safePath(ref))throw new Error('builder_import_escape');
   if(!paths.has(ref)){paths.add(ref);queue.push(ref);}
  }
 }
 return [...paths].sort().map(path=>({path,bytes:sourceBytes(path).length,digest:digest(sourceBytes(path))}));
}
export function buildCoreBundleFreeze(){
 const sources=fullSources(),scratch=realpathSync(mkdtempSync(join(tmpdir(),'ask-core-freeze-')));
 try{
  const full=materializeCoreProfile(join(scratch,'full'),'full');
  return {kind:'ask_core_bundle_product_v1',product:CORE_PRODUCT,design_source:'fb32ac6fbeab387ecbef98ca3a046665c0e29be8',design_revision:2,
   projection_revision:1,core_sources:coreSourceRecords(),core_assets:assetRecords(coreAssetMap()),core_closure:inspectCoreClosure(),
   full_sources:sources,full_assets:assetRecords(full),full_selection:{skills:47,prompts:5,commands:1},
   live_ready:false,native_execution:'not_admitted',legacy_product:'unchanged',source_integrity:'local_frozen_bytes_not_execution_authority'};
 }finally{rmSync(scratch,{recursive:true,force:true});} // Only this call's new model-free scratch, never old records.
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==1||!['--write','--check'].includes(args[0]))throw new Error('invalid_generator_arguments');
 const bytes=JSON.stringify(buildCoreBundleFreeze(),null,2)+'\n';
 if(args[0]==='--write')writeFileSync(join(ROOT,PRODUCT_MANIFEST),bytes);
 else if(readFileSync(join(ROOT,PRODUCT_MANIFEST),'utf8')!==bytes)throw new Error('core_product_freeze_not_current');
 process.stdout.write('Core Bundle frozen inventory is current; model/native starts=0.\n');
}

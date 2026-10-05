import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname,resolve,posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const CORE_PRODUCT='ask-core-bundle@1.0.0';
export const PRODUCT_MANIFEST='products/ask-core-bundle/manifest.json';
export const digest=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
export const safePath=p=>typeof p==='string'&&p.length<512&&!p.includes('\\')&&!p.includes('\0')&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
export const CORE_SOURCE_PATHS=Object.freeze([
 'products/ask-core-bundle/AGENTS.md','products/ask-core-bundle/capabilities.json',
 'docs/claim-evidence-status-contract.md','schemas/claim-evidence-status.schema.json','scripts/claim-evidence-status.mjs',
 'docs/verification-proof-policy-contract.md','schemas/verification-proof-policy.schema.json','scripts/verification-proof-policy.mjs',
 'docs/lifecycle-artifact-contract.md','docs/lifecycle-traceability-contract.md','docs/agent-session-state-contract.md',
 'docs/execution-envelope-contract.md','schemas/execution-envelope.schema.json','schemas/execution-envelope-record.schema.json','scripts/execution-envelope.mjs',
 'schemas/review-signal-gate-map.json','docs/review-finding-contract.md','schemas/review-finding.schema.json',
 'docs/verification-evidence-contract.md','docs/adr/0001-verification-evidence-trust-boundary.md',
 'schemas/verification-evidence.schema.json','schemas/verification-reuse-plan.schema.json','schemas/verification-evidence-transfer.schema.json',
 'scripts/verification-evidence.mjs','scripts/content-addressed-store.mjs','scripts/json-schema-validation.mjs',
 'schemas/metrics-event.schema.json','docs/metrics-event-contract.md','scripts/review-route-contract.mjs',
 'scripts/ask-core-capabilities.mjs','scripts/ask-core-runner-contract.mjs',
 'schemas/codex-risk-action.schema.json',
 'schemas/codex-risk-approval-request.schema.json',

]);
const DEFERRED=Object.freeze({
 'docs/epic-admission-work-package-plan-contract.md':{kind:'conditional_extension',reason:'Opt-in aggregate epic admission is outside ordinary core tasks; require its extension before using it.'},
 'docs/fixtures/lifecycle-traceability-chains.json':{kind:'example_fixture',reason:'Worked examples are not schema or per-task authority; the normative trace contract is included.'},
 'docs/ai/skill-adoption-metrics.md':{kind:'conditional_extension',reason:'Metrics ledger mutation requires separately selected observability capability; no collector/ledger is enabled in core.'},
});
export function sourceBytes(path){if(!safePath(path))throw new Error('unsafe_source_path');return readStableFile(resolve(ROOT,path),'core product source',1048576).bytes;}
function ownershipProjection(path,bytes){
 if(path!=='docs/claim-evidence-status-contract.md')return bytes;
 const text=bytes.toString('utf8'),old='The installed `evidence-ledger` capability is activated only when the contract selects `formal_ledger` for at least one closed trigger:';
 if(!text.includes(old))throw new Error('claim_ownership_source_changed');
 return Buffer.from(text.replace(old,'In ASK Core Bundle 1.0.0, the core-owned formal ledger procedure is activated only when the contract selects `formal_ledger` for at least one closed trigger. An installed evidence-ledger Skill consumes that same obligation; no second ledger is created:'));
}
export function coreAssetMap(){
 const assets=new Map();
 for(const source of CORE_SOURCE_PATHS){const target=source==='products/ask-core-bundle/AGENTS.md'?'AGENTS.md':source;assets.set(target,ownershipProjection(source,sourceBytes(source)));}
 assets.set('CUSTOM_INSTRUCTIONS.md',assets.get('AGENTS.md'));
 return assets;
}
/** Bounded literal reference graph, explicit classifications and runtime import closure. */
export function inspectCoreClosure(assets=coreAssetMap()){
 const edges=[];
 function relative(from,ref){
  if(!ref||ref.startsWith('/')||ref.includes('\\')||ref.includes('\0')||/^[a-z][a-z0-9+.-]*:/iu.test(ref))throw new Error('core_reference_escape');
  return posix.normalize(posix.join(posix.dirname(from),ref));
 }
 function edge(from,target,kind){
  if(!safePath(target))throw new Error('core_reference_escape');
  if(['schema_ref','literal_esm_import'].includes(kind)&&!assets.has(target))throw new Error('mandatory_core_dependency_missing');
  const classification=assets.has(target)?{kind:'included',reason:'Exact core asset'}:DEFERRED[target];
  if(!classification)throw new Error(`unclassified_core_reference:${from}:${target}`);
  edges.push({from,target,reference_kind:kind,...classification});
 }
 for(const [path,bytes]of assets){
  const text=bytes.toString('utf8');
  if(path.endsWith('.mjs')){
   if(/\bimport\s*\(|\brequire\s*\(/u.test(text))throw new Error('unsupported_core_import');
   for(const m of text.matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*)["']([^"'\r\n]+)["']/gu)){
    if(isBuiltin(m[1]))continue;
    if(!m[1].startsWith('.'))throw new Error('external_core_import');
    edge(path,relative(path,m[1]),'literal_esm_import');
   }
  }
  if(path.endsWith('.md')||path.endsWith('.mjs')||path.endsWith('.json')){
   for(const m of text.matchAll(/(?:docs|schemas|scripts|products)\/[A-Za-z0-9_./-]+\.(?:md|mjs|json)/gu))edge(path,m[0],'literal_contract_path');
  }
  if(path.endsWith('.md'))for(const m of text.matchAll(/\]\(([^\s)]+)\)/gu)){
   const ref=m[1].split('#')[0];if(!ref||/^(https?|mailto):/iu.test(ref))continue;
   edge(path,relative(path,ref),'local_markdown_link');
  }
  if(path.endsWith('.json')){
   const walk=value=>{if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){
    if(key==='$ref'&&typeof v==='string'&&!v.startsWith('#'))edge(path,relative(path,v.split('#')[0]),'schema_ref');
    else if(typeof v==='object')walk(v);
   }};walk(JSON.parse(text));
  }
 }
 return {status:'classified_literal_closure_verified',edges,unverified:['computed_runtime_io','model_procedure_use','managed_native_runtime']};
}
export function coreSourceRecords(){return CORE_SOURCE_PATHS.map(path=>{const bytes=sourceBytes(path);return {path,bytes:bytes.length,digest:digest(bytes)};});}
export function assetRecords(assets){return Object.fromEntries([...assets].sort(([a],[b])=>a.localeCompare(b)).map(([path,b])=>[path,{bytes:b.length,digest:digest(b)}]));}
export function assertFrozenProductSources(manifest){
 if(manifest.kind!=='ask_core_bundle_product_v1'||manifest.product!==CORE_PRODUCT||JSON.stringify(manifest.core_sources)!==JSON.stringify(coreSourceRecords())||JSON.stringify(manifest.core_assets)!==JSON.stringify(assetRecords(coreAssetMap()))||JSON.stringify(manifest.core_closure)!==JSON.stringify(inspectCoreClosure()))throw new Error('core_product_source_drift');
 for(const item of manifest.full_sources){const bytes=sourceBytes(item.path);if(digest(bytes)!==item.digest||bytes.length!==item.bytes)throw new Error('full_product_source_drift');}
 return manifest;
}
export function loadFrozenProduct(){return assertFrozenProductSources(JSON.parse(readFileSync(resolve(ROOT,PRODUCT_MANIFEST),'utf8')));}

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { kernelPrinciplesV2FixtureDescriptor as descriptor, principlesV2Capability as capability, kernelPrinciplesV2DescriptorSourcePaths as paths } from './kernel-principles-v2-catalog24.mjs';
import { PRIMARY_METADATA_REGENERATED_HEADERS, projectPrimaryMetadataTaskSemantics } from './ask-primary-metadata-task-contract.mjs';
const ids=['hi-financial-state-integrity','mn-frontend-default-fix','pf-api-pagination-behavior','pf-frontend-async-state'];
const read=(id,name)=>readFileSync(new URL(`../benchmarks/fixtures/checkpoint-b2/${id}/${name}`,import.meta.url));
const seal=value=>{const {metadata_digest,...body}=value;return Buffer.from(JSON.stringify({...body,metadata_digest:canonicalDigest(body)}));};
for(const id of ids){
 const task=read(id,'task.md'),original=read(id,'metadata.json'),metadata=JSON.parse(original);
 test(`${id}: current and authority-rebound metadata retain task semantics but exact raw refs differ`,()=>{
  const initial=descriptor(id,task,original);assert.equal(capability(initial,{metadataBytes:original}).status,'available');
  const rebound=seal({...metadata,evaluator_bundle_id:'evaluator-'+ 'a'.repeat(64),evaluator_bundle_digest:'sha256:'+ 'b'.repeat(64),evaluator_byte_count:metadata.evaluator_byte_count+1});
  const next=descriptor(id,task,rebound);assert.equal(capability(next,{metadataBytes:rebound}).status,'available');
  assert.equal(initial.task_class,next.task_class);assert.notEqual(initial.requirement_scan.evidence_refs[1],next.requirement_scan.evidence_refs[1]);
  assert.equal(initial.requirement_scan.evidence_refs[3],next.requirement_scan.evidence_refs[3]);
  assert.deepEqual(Object.keys(next),['task_class','requirement_scan','required_procedures']);
  assert.ok(paths(id).includes('scripts/ask-primary-metadata-task-contract.mjs'));assert.ok(paths(id).includes('scripts/content-addressed-store.mjs'));
  assert.throws(()=>capability(initial,{metadataBytes:rebound}));assert.throws(()=>capability(next,{metadataBytes:original}));
 });
 test(`${id}: every semantic field mutation is rejected even with a recomputed self-digest`,()=>{
  for(const key of Object.keys(projectPrimaryMetadataTaskSemantics(metadata))){
   const changed=structuredClone(metadata);const value=changed[key];changed[key]=Array.isArray(value)?[...value,'unexpected']:typeof value==='boolean'?!value:typeof value==='number'?value+1:value+'-changed';
   assert.throws(()=>descriptor(id,task,seal(changed)),undefined,key);
  }
  assert.throws(()=>descriptor(id,Buffer.concat([task,Buffer.from('\n')]),original));
 });
 test(`${id}: closed keys, strict JSON, headers and self-digest fail closed`,()=>{
  for(const key of Object.keys(metadata)){const changed={...metadata};delete changed[key];assert.throws(()=>descriptor(id,task,Buffer.from(JSON.stringify(changed))),undefined,key);}
  assert.throws(()=>descriptor(id,task,seal({...metadata,unknown:true})));
  assert.throws(()=>descriptor(id,task,Buffer.from('{"fixture_id":"x","fixture_id":"x"}')));
  assert.throws(()=>descriptor(id,task,Buffer.from([0xff])));assert.throws(()=>descriptor(id,task,Buffer.from('null')));
  for(const patch of [{evaluator_bundle_id:'invalid'},{evaluator_bundle_digest:'invalid'},{evaluator_byte_count:0},{evaluator_byte_count:1.5},{review_status:'admitted'},{review_status:'approved'}])assert.throws(()=>descriptor(id,task,seal({...metadata,...patch})));
  assert.throws(()=>descriptor(id,task,Buffer.from(JSON.stringify({...metadata,metadata_digest:'sha256:'+'0'.repeat(64)}))));
 });
 test(`${id}: capability requires matching raw context and rejects forged fixture claims`,()=>{
  const initial=descriptor(id,task,original);assert.throws(()=>capability(initial));
  const semanticOnly=structuredClone(initial);semanticOnly.requirement_scan.evidence_refs=[initial.requirement_scan.evidence_refs[3]];assert.throws(()=>capability(semanticOnly));assert.throws(()=>capability(semanticOnly,{metadataBytes:original}));
  for(const ref of [initial.requirement_scan.evidence_refs[3]+'changed','ask_primary_metadata_task_semantics_v1:unknown:sha256:'+'0'.repeat(64)]){const forged=structuredClone(initial);forged.requirement_scan.evidence_refs=[ref];assert.throws(()=>capability(forged,{metadataBytes:original}));}
  for(let i=0;i<initial.requirement_scan.evidence_refs.length;i++){const changed=structuredClone(initial);changed.requirement_scan.evidence_refs[i]+='changed';assert.throws(()=>capability(changed,{metadataBytes:original}));}
  const other=ids.find(other=>other!==id);assert.throws(()=>capability(initial,{metadataBytes:read(other,'metadata.json')}));
  const changed=structuredClone(initial);changed.task_class='risk-gated';assert.throws(()=>capability(changed,{metadataBytes:original}));
  const conflict=structuredClone(initial);conflict.requirement_scan.evidence_refs.push(`benchmarks/fixtures/checkpoint-b2/${other}/task.md#sha256:${'0'.repeat(64)}`);assert.throws(()=>capability(conflict,{metadataBytes:original}));
 });
}
test('shared scoring projection is exactly the preexisting five-header policy',()=>{
 const old=['evaluator_bundle_id','evaluator_bundle_digest','evaluator_byte_count','review_status','metadata_digest'];assert.deepEqual(PRIMARY_METADATA_REGENERATED_HEADERS,old);
 for(const id of ids){const metadata=JSON.parse(read(id,'metadata.json'));assert.deepEqual(projectPrimaryMetadataTaskSemantics(metadata),Object.fromEntries(Object.entries(metadata).filter(([key])=>!old.includes(key))));}
});
test('legacy9 stays three-source raw protocol and unaffected catalog fixture retains raw pin',()=>{
 const id='mn-build-option-update',task=read(id,'task.md'),metadata=read(id,'metadata.json'),value=descriptor(id,task,metadata);
 assert.equal(capability(value).status,'available');assert.equal(paths(id).length,3);assert.equal(value.requirement_scan.evidence_refs.length,3);
 assert.throws(()=>descriptor(id,task,Buffer.concat([metadata,Buffer.from('\n')])));
 const extended='hi-authorization-exception',bytes=read(extended,'metadata.json'),raw=descriptor(extended,read(extended,'task.md'),bytes);
 assert.equal(capability(raw).status,'available');assert.equal(raw.requirement_scan.evidence_refs.length,3);assert.equal(paths(extended).length,6);
 assert.throws(()=>descriptor(extended,read(extended,'task.md'),Buffer.concat([bytes,Buffer.from('\n')])));
 assert.equal(descriptor('unknown-fixture',Buffer.from(''),Buffer.from('{}')),null);
});

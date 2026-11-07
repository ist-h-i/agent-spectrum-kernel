// Explicit package/delivery binding. No discovery, byte rewriting or execution.
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {canonicalDigest,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionPath} from './instruction-projection-paths.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
const digest=/^sha256:[a-f0-9]{64}$/u;
const normalized=d=>{assert.ok(typeof d==='string');const n=d.startsWith('sha256:')?d:'sha256:'+d;assert.match(n,digest);return n;};
function sourcePin(source,target,entry){
 assert.equal(resolve(source),source,'absolute public source required');assertNoSymlinkPathSegments(source,'public package source');
 const raw=readStableFile(source,'public package bytes',16*1024*1024).bytes;
 assert.equal(raw.length,entry.bytes,'public package byte count changed');assert.equal(hash(raw),entry.sha256,'public package bytes changed');
 return {source,target,bytes:entry.bytes,digest:entry.sha256,mode:entry.mode};
}
export function bindNativePublicInputs({input,catalog,selectedCaseIds,template}){
 assert.equal(input.kind,'native_public_input_bindings_v1');assert.ok(Array.isArray(input.cases)&&input.cases.length<=256);
 assert.equal(new Set(input.cases.map(c=>c.case_id)).size,input.cases.length,'duplicate package binding');
 assert.equal(new Set(selectedCaseIds).size,selectedCaseIds.length);
 const bindings=[],sources=[];
 for(const id of selectedCaseIds){
  const spec=input.cases.find(c=>c.case_id===id),c=catalog.find(c=>c.id===id),rows=template.rows.filter(r=>r.fixture_id===id);
  assert.ok(spec&&c&&rows.length,'selected package binding missing');assert.equal(resolve(spec.source_root),spec.source_root);
  assertNoSymlinkPathSegments(spec.source_root,'public package root');
  assert.ok(['','workspace/'].includes(spec.path_prefix));
  assert.ok(Array.isArray(spec.package_inventory)&&spec.package_inventory.length>0&&spec.package_inventory.length<=8192);
  assert.equal(canonicalDigest(spec.package_inventory),c.public_input_digest,'package identity differs from controller catalog');
  const delivery=rows[0].public_inventory,deliveryDigest=canonicalDigest(delivery);
  assert.ok(rows.every(r=>canonicalDigest(r.public_inventory)===deliveryDigest),'native public delivery differs across rows');
  assert.ok(Array.isArray(delivery)&&delivery.length>0&&delivery.length<=8193);
  const byTarget=new Map(),pins=[],seen=new Set(),mode_changes=[];
  for(const f of delivery){instructionPath(f.path);assert.ok(f.path==='task.md'||f.path.startsWith('workspace/'),'native public delivery requires task.md or workspace paths');assert.ok(!byTarget.has(f.path.toLowerCase()),'duplicate delivery target');
   assert.ok(Number.isSafeInteger(f.bytes)&&f.bytes>=0);assert.match(f.sha256,digest);assert.ok(Number.isSafeInteger(f.mode)&&f.mode>=0&&f.mode<=0o777);
   byTarget.set(f.path.toLowerCase(),f);}
  for(const f of spec.package_inventory){
   instructionPath(f.path);const target=spec.path_prefix+f.path;instructionPath(target);
   assert.ok(!seen.has(target.toLowerCase()),'duplicate package target');seen.add(target.toLowerCase());
   const d=byTarget.get(target.toLowerCase());assert.ok(d&&d.path===target,'package file missing from exact native delivery');
   assert.equal(f.bytes,d.bytes);assert.equal(normalized(f.sha256),d.sha256,'package/delivery content differs');
   if(f.mode!==undefined){assert.ok(Number.isSafeInteger(f.mode)&&f.mode>=0&&f.mode<=0o777);if(f.mode!==d.mode)mode_changes.push({path:target,package_mode:f.mode,delivery_mode:d.mode});}
   pins.push(sourcePin(join(spec.source_root,f.path),target,d));
  }
  const extras=spec.extra_files??[];assert.ok(Array.isArray(extras)&&extras.length<=1);
  for(const extra of extras){assert.equal(extra.target,'task.md','only an explicit existing task wrapper may be added');assert.ok(!seen.has(extra.target));seen.add(extra.target);
   const d=byTarget.get(extra.target);assert.ok(d);assert.equal(extra.digest,d.sha256,'existing task wrapper digest differs');pins.push(sourcePin(extra.source,extra.target,d));}
  assert.equal(seen.size,delivery.length,'unbound native public input');
  bindings.push({case_id:id,package_public_input_digest:c.public_input_digest,delivered_public_input_digest:deliveryDigest,
   path_prefix:spec.path_prefix,sha_representation_normalized:true,mode_changes,existing_task_wrapper_included:extras.length===1,content_bytes_unchanged:true});
  sources.push([id,pins]);
 }
 return {kind:'native_public_input_binding_result_v1',bindings,delivery_sources:Object.fromEntries(sources),models_started:false};
}

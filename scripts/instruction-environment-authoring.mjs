// Adapter-neutral authoring handoff. The host fixes identities, dependencies,
// allowed mappings and metadata; an agent can supply instruction text only.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from './content-addressed-store.mjs';
import { verifyInstructionEnvironment, exactInstructionAsset, instructionBytesDigest } from './instruction-environment.mjs';
import { instructionPath, instructionTargetPath } from './instruction-projection-paths.mjs';
import { verifyAssetRegistry, registerAsset } from './asset-registry.mjs';
import { registerInstructionEnvironmentBundle, resolveInstructionComponents } from './instruction-environment-compiler.mjs';
import { projectInstructionLoopObservation, assertPublicInstructionSummary } from './instruction-loop-feedback.mjs';
import { commitInstructionSource } from './instruction-source-version.mjs';
import { verifyInstructionComposition } from './instruction-composition.mjs';

const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
function resetClaims(d) {
  d.safety = { ...d.safety, status: 'not_evaluated' };
  d.mechanism_and_evidence = { ...d.mechanism_and_evidence, status: 'not_evaluated', evidence_refs: [] };
  d.evaluation_history = { status: 'not_evaluated', evidence_refs: [], cost: null };
  d.permissions_and_effects = { ...d.permissions_and_effects, status: 'not_evaluated', permission_refs: [], effect_refs: [] };
  d.maintenance = { ...d.maintenance, stale_status: 'not_assessed', retirement: null };
  return d;
}
function context(options) {
  const { environment, files } = verifyInstructionEnvironment(options);
  assert.equal(environment.registry_snapshot_digest, options.registrySnapshotDigest, 'authoring Registry snapshot drift');
  const local = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  const components = environment.components?.length ? environment.components : environment.bindings;
  resolveInstructionComponents({ ...options, adapter: environment.adapter, components });
  return { environment, local, components, files };
}
function validateSpec(options, spec) {
  keys(spec, ['kind', 'baseline_environment_digest', 'registry_snapshot_digest', 'editable_ids', 'removable_ids', 'additions', 'observation', 'bundle_descriptor',
    ...(spec.composition_object_digest === undefined ? [] : ['composition_object_digest'])]);
  assert.equal(spec.kind, 'instruction_environment_authoring_v1');
  assert.equal(spec.baseline_environment_digest, options.environmentObjectDigest);
  assert.equal(spec.registry_snapshot_digest, options.registrySnapshotDigest);
  const c = context(options), ids = c.components.map(a => a.asset.stable_id);
  for (const key of ['editable_ids', 'removable_ids']) {
    assert.ok(Array.isArray(spec[key]) && spec[key].length <= 64 && new Set(spec[key]).size === spec[key].length);
    spec[key].forEach(id => assert.ok(ids.includes(id), 'authoring permission names an absent Asset'));
  }
  assert.ok(Array.isArray(spec.additions) && spec.additions.length <= 64);
  const added = new Set();
  for (const a of spec.additions) {
    keys(a, ['descriptor', 'files']); const d = a.descriptor;
    assert.ok(['skill', 'prompt'].includes(d.asset_type));
    assert.ok(!ids.includes(d.stable_id) && !added.has(d.stable_id) && !c.local.assets.some(b => b.stable_id === d.stable_id), 'new Asset identity already exists');
    assert.match(d.stable_id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u); added.add(d.stable_id);
    assert.equal(d.derivation.kind, 'root', 'new Assets keep genuine root lineage');
    assert.ok(['skill', 'prompt_template'].includes(d.type_extension.kind));
    assert.ok(!d.type_extension.adapter || ['shared', c.environment.adapter].includes(d.type_extension.adapter));
    assert.equal(d.source.repository_id, c.local.repository_id);
    assert.ok(Array.isArray(a.files) && a.files.length && a.files.length <= 256);
    const sources = new Set();
    for (const f of a.files) {
      keys(f, ['source', 'target']); instructionPath(f.source); instructionTargetPath(c.environment.adapter, f.target);
      assert.ok(f.source.endsWith('.md') && !sources.has(f.source), 'bounded unique Markdown inventory required'); sources.add(f.source);
    }
    assert.ok(sources.has(d.type_extension.entrypoint), 'addition must include its declared entrypoint');
  }
  projectInstructionLoopObservation(spec.observation);
  assert.equal(spec.bundle_descriptor.asset_type, 'prompt');
  assert.equal(spec.bundle_descriptor.source.repository_id, c.local.repository_id);
  const lineage=spec.bundle_descriptor.derivation;
  if(c.environment.components?.length){
    assert.equal(c.environment.bindings.length,1,'one existing environment lineage target required');
    assert.equal(lineage.kind,'full_content_revision');
    assert.ok(same(lineage.parent,c.environment.bindings[0].asset),'bundle parent differs from baseline environment');
    assert.ok(same(spec.bundle_descriptor.maintenance.rollback.target,lineage.parent),'bundle rollback differs from baseline');
  }else assert.equal(lineage.kind,'root','first environment bundle must be a genuine root');
  if (spec.composition_object_digest !== undefined) {
    const {lock} = verifyInstructionComposition({...options,compositionObjectDigest:spec.composition_object_digest});
    assert.equal(lock.kind,'instruction_composition_lock_v1');assert.equal(lock.adapter,c.environment.adapter);
    assert.ok(same(lock.components,c.components),'authoring composition differs from declared environment');
    c.layers=lock.layers.map(l=>({id:l.id,kind:l.kind,asset_ids:l.components.map(a=>a.asset.stable_id).filter(id=>ids.includes(id))}));
  }
  return c;
}

// Read-only context is data, never an enlargement of the editable inventory.
// Share the text budget across all fixed Markdown files so one common layer
// cannot consume the entire budget before a personal/application layer appears.
function readOnlyEnvironment(c,spec) {
  const textFiles=[];let declarationBytes=8192;
  const publicList=values=>{
    const result={count:values.length,inventory_digest:canonicalDigest(values),values:[],redacted_count:0,omitted_count:0};
    for(const value of values){
      let safe=true;try{assertPublicInstructionSummary(value);if(/https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(value))safe=false;}catch{safe=false;}
      if(!safe){result.redacted_count++;continue;}
      const bytes=Buffer.byteLength(value);
      if(result.values.length>=16||bytes>256||bytes>declarationBytes){result.omitted_count++;continue;}
      declarationBytes-=bytes;result.values.push(value);
    }
    return result;
  };
  const assets=c.components.map(component=>{
    const a=c.local.assets.find(a=>same(exactInstructionAsset(a),component.asset)),editable=spec.editable_ids.includes(a.stable_id);
    const files=a.content.files.map(f=>{
      const bytes=Buffer.from(f.bytes_base64,'base64'),item={path:f.path,raw_digest:f.raw_digest,byte_count:bytes.length};
      if(f.path.endsWith('.md')&&!editable)textFiles.push({item,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)});
      return item;
    });
    const refs={constraint_refs:a.record.safety.constraint_refs,permission_refs:a.record.permissions_and_effects.permission_refs,effect_refs:a.record.permissions_and_effects.effect_refs};
    return {asset:component.asset,editable,mappings:component.files,files,inventory_digest:canonicalDigest(component),file_count:files.length,omitted_file_count:0,
      known_constraints:{safety_status:a.record.safety.status,permission_status:a.record.permissions_and_effects.status,
        classifications:publicList(a.record.safety.classifications),requested_permissions:publicList(a.record.permissions_and_effects.requested_permissions),
        possible_effects:publicList(a.record.permissions_and_effects.possible_effects),
        references:Object.fromEntries(Object.entries(refs).map(([key,values])=>[key,{count:values.length,inventory_digest:canonicalDigest(values)}]))}};
  });
  const support=c.environment.support.map(f=>{
    const file=c.files.find(item=>item.path===f.path),item={path:f.path,raw_digest:f.raw_digest,byte_count:Buffer.byteLength(file.text)};
    if(f.path.endsWith('.md'))textFiles.push({item,text:file.text});return item;
  });
  const textBudget=32768,perFile=4096,share=textFiles.length?Math.floor(textBudget/textFiles.length):0;
  for(const {item,text} of textFiles){
    const bytes=Buffer.from(text);let length=Math.min(bytes.length,perFile,share);
    while(length){try{item.text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));break;}catch{length--;}}
    item.text??='';item.text_truncated=length<bytes.length;
  }
  const context={environment_digest:spec.baseline_environment_digest,projection_digest:c.environment.projection_digest,
    composition_digest:spec.composition_object_digest??null,layers:structuredClone(c.layers??null),layer_inventory_digest:canonicalDigest(c.layers??null),
    layer_count:c.layers?.length??0,omitted_layer_count:0,
    assets,asset_inventory_digest:canonicalDigest(c.components),asset_count:assets.length,omitted_asset_count:0,
    support,support_inventory_digest:canonicalDigest(c.environment.support),support_count:support.length,omitted_support_count:0,
    text_budget_bytes:textBudget,byte_budget_bytes:131072,included_text_bytes:0,text_truncated:false,metadata_truncated:false,context_incomplete:false,
    helpers_are_inventory_only:true,references_are_inventory_only:true,edit_authority_implied:false};
  const lists=assets.flatMap(a=>['classifications','requested_permissions','possible_effects'].map(k=>a.known_constraints[k]));
  const refresh=()=>{
    context.included_text_bytes=[...context.assets.flatMap(a=>a.files),...context.support].reduce((n,f)=>n+Buffer.byteLength(f.text??''),0);
    context.text_truncated=textFiles.some(({item})=>item.text_truncated);
    context.context_incomplete=context.text_truncated||context.metadata_truncated||lists.some(v=>v.redacted_count||v.omitted_count);
    return Buffer.byteLength(JSON.stringify(context))>context.byte_budget_bytes;
  };
  // Oversized inventories degrade to counted/digested references, never fail a
  // consumed generation merely because context is large. Full CAS is unchanged.
  if(refresh()){
    context.metadata_truncated=true;
    for(const list of lists){list.omitted_count+=list.values.length;list.values=[];}
  }
  if(refresh())for(const {item} of textFiles){item.text='';item.text_truncated=item.byte_count>0;}
  if(refresh()){
    for(const a of [...assets.filter(a=>!a.editable),...assets.filter(a=>a.editable)]){
      a.omitted_file_count=a.file_count;a.files=[];a.mappings=[];context.metadata_truncated=true;
      if(!refresh())break;
    }
  }
  if(refresh()){
    context.layers=context.layers?.map(l=>({id:l.id,kind:l.kind,asset_count:l.asset_ids.length,asset_inventory_digest:canonicalDigest(l.asset_ids)}))??null;
    context.support=[];context.omitted_support_count=context.support_count;context.metadata_truncated=true;
  }
  while(refresh()&&context.assets.length){context.assets.pop();context.omitted_asset_count++;context.metadata_truncated=true;}
  refresh();return context;
}
export function prepareInstructionEnvironmentAuthoring(options) {
  const spec = { kind: 'instruction_environment_authoring_v1', baseline_environment_digest: options.environmentObjectDigest,
    registry_snapshot_digest: options.registrySnapshotDigest, editable_ids: [...options.editableStableIds].sort(),
    removable_ids: [...(options.removableStableIds ?? [])].sort(), additions: structuredClone(options.additions ?? []),
    observation: structuredClone(options.observation), bundle_descriptor: structuredClone(options.bundleDescriptor),
    ...(options.compositionObjectDigest===undefined?{}:{composition_object_digest:options.compositionObjectDigest}) };
  const c = validateSpec(options, spec);
  const editable = c.components.filter(a => spec.editable_ids.includes(a.asset.stable_id)).map(component => {
    const a = c.local.assets.find(a => same(exactInstructionAsset(a), component.asset));
    assert.ok(a.record.type_extension.entrypoint?.endsWith('.md'),'authoring requires a Markdown instruction entrypoint');
    return { asset: component.asset, files: a.content.files.filter(f=>f.path.endsWith('.md')).map(f => ({ path: f.path,
      text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(f.bytes_base64, 'base64')) })),
    fixed_file_inventory:a.content.files.filter(f=>!f.path.endsWith('.md')).map(f=>({path:f.path,raw_digest:f.raw_digest})) };
  });
  assert.ok(editable.flatMap(a => a.files).reduce((n, f) => n + Buffer.byteLength(f.text), 0) <= 2 * 1024 * 1024);
  const requestDigest = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: spec }).digest;
  return { request_object_digest: requestDigest, generation_input: { kind: spec.kind, request_digest: requestDigest,
    adapter: c.environment.adapter, feedback: projectInstructionLoopObservation(spec.observation), editable,
    read_only_environment:readOnlyEnvironment(c,spec),
    removable_ids: spec.removable_ids, additions: spec.additions.map(a => ({ stable_id: a.descriptor.stable_id,
      asset_type: a.descriptor.asset_type, files: a.files })),
    response_contract: '{request_digest, changes:[{operation:revise|create,stable_id,files:[{path,text}]}|{operation:exclude,stable_id}]}',
    excluded_assets_are_not_retired: true, raw_logs_included: false }, models_started: false, activation_implied: false };
}
export function importInstructionEnvironmentAuthoring(options) {
  const spec = readContentAddressedJson({ storeRoot: options.storeRoot, digest: options.requestObjectDigest }).value;
  const c = validateSpec(options, spec), response = structuredClone(options.response);
  keys(response, ['request_digest', 'changes']); assert.equal(response.request_digest, options.requestObjectDigest, 'authoring request transplant');
  assert.ok(Array.isArray(response.changes) && response.changes.length <= 64);
  const seen = new Set(), prepared = []; let bytes = 0;
  for (const change of response.changes) {
    assert.ok(!seen.has(change.stable_id), 'duplicate Asset change'); seen.add(change.stable_id);
    assert.ok(['revise', 'create', 'exclude'].includes(change.operation));
    keys(change, change.operation === 'exclude' ? ['operation', 'stable_id'] : ['operation', 'stable_id', 'files']);
    if (change.operation === 'exclude') { assert.ok(spec.removable_ids.includes(change.stable_id), 'exclusion not authorized by host inventory'); continue; }
    let descriptor, mappings, parent = null, fixedFiles=[];
    if (change.operation === 'revise') {
      assert.ok(spec.editable_ids.includes(change.stable_id), 'revision outside editable inventory');
      const component = c.components.find(a => a.asset.stable_id === change.stable_id); parent = component.asset; mappings = component.files;
      const original=c.local.assets.find(a => same(exactInstructionAsset(a), parent));
      descriptor = structuredClone(original.record); delete descriptor.object_kind;
      fixedFiles=original.content.files.filter(f=>!f.path.endsWith('.md')).map(f=>({path:f.path,bytes:Buffer.from(f.bytes_base64,'base64'),media_type:f.media_type}));
    } else {
      const a = spec.additions.find(a => a.descriptor.stable_id === change.stable_id); assert.ok(a, 'addition outside declared inventory');
      descriptor = structuredClone(a.descriptor); mappings = a.files;
    }
    assert.ok(Array.isArray(change.files) && change.files.length && change.files.length <= 256);
    assert.deepEqual(change.files.map(f => f.path).sort(), mappings.map(f => f.source).filter(p=>p.endsWith('.md')).sort(), 'complete declared Markdown inventory required');
    for (const f of change.files) {
      keys(f, ['path', 'text']); instructionPath(f.path);
      assert.ok(f.path.endsWith('.md') && typeof f.text === 'string' && f.text.length && !f.text.includes('\0'), 'instruction Markdown required');
      bytes += Buffer.byteLength(f.text); assert.ok(bytes <= 2 * 1024 * 1024, 'bounded generated instruction content required');
    }
    if (parent) {
      descriptor.derivation = { kind: 'full_content_revision', parent, delta: { kind: 'replacement', summary: 'Bounded agent-authored instruction revision.' } };
      descriptor.maintenance.rollback = { status: 'requires_explicit_authority', target: parent, authority_ref: null };
    }
    prepared.push({ change, descriptor: resetClaims(descriptor), mappings, fixedFiles });
  }
  const unchanged=response.changes.every(change=>change.operation==='revise'&&change.files.every(f=>{
    const component=c.components.find(a=>a.asset.stable_id===change.stable_id),asset=c.local.assets.find(a=>same(exactInstructionAsset(a),component.asset));
    return asset.content.files.find(original=>original.path===f.path)?.raw_digest===instructionBytesDigest(Buffer.from(f.text));
  }));
  if(unchanged&&c.environment.components?.length){
    const asset=c.environment.bindings[0].asset,record=c.local.assets.find(a=>same(exactInstructionAsset(a),asset)).record;
    return {snapshot_digest:options.registrySnapshotDigest,asset,descriptor:record,components:c.components,individual_assets:[],created:false,no_change:true,
      baseline_environment_digest:spec.baseline_environment_digest,request_object_digest:options.requestObjectDigest,response_digest:canonicalDigest(response),
      models_started:false,activation_implied:false,validation_required:false};
  }
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-authoring-')));
  const components = c.components.filter(a => !response.changes.some(x => x.operation === 'exclude' && x.stable_id === a.asset.stable_id));
  let snapshot = options.registrySnapshotDigest; const assets = [];
  try {
    for (const [i, item] of prepared.entries()) {
      const source = join(root, String(i)); mkdirSync(source);
      for (const f of item.change.files) { const path = join(source, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, f.text, { flag: 'wx', mode: 0o600 }); }
      for(const f of item.fixedFiles){instructionPath(f.path);const path=join(source,f.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,f.bytes,{flag:'wx',mode:0o600});}
      const d = item.descriptor, revision = commitInstructionSource(source,{contextDigest:options.requestObjectDigest});
      d.source.revision = revision; d.version = 'git:' + revision; d.version_scheme = 'git_revision';
      d.content = { package_format: 'canonical_json_base64_files', files: item.change.files.map(f => ({ path: f.path,
        media_type: 'text/markdown; charset=utf-8', raw_digest: instructionBytesDigest(Buffer.from(f.text)) })).concat(item.fixedFiles.map(f=>({path:f.path,media_type:f.media_type,raw_digest:instructionBytesDigest(f.bytes)}))) };
      const saved = registerAsset({ storeRoot: options.storeRoot, sourceRoot: source, predecessorSnapshotDigest: snapshot,
        descriptor: d, trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] }); snapshot = saved.snapshot_digest;
      const asset = exactInstructionAsset({ ...d, ...saved }), component = { asset, files: item.mappings };
      const old = components.findIndex(a => a.asset.stable_id === asset.stable_id);
      if (old < 0) components.push(component); else components[old] = component; assets.push(asset);
    }
    const compiled = registerInstructionEnvironmentBundle({ ...options, adapter: c.environment.adapter, components,
      registrySnapshotDigest: snapshot, descriptor: resetClaims(structuredClone(spec.bundle_descriptor)) });
    return { ...compiled, individual_assets: assets, components, baseline_environment_digest: spec.baseline_environment_digest,
      request_object_digest: options.requestObjectDigest, response_digest: canonicalDigest(response), models_started: false,
      activation_implied: false, validation_required: true };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

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
import { projectInstructionLoopObservation } from './instruction-loop-feedback.mjs';
import { commitInstructionSource } from './instruction-source-version.mjs';

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
  const { environment } = verifyInstructionEnvironment(options);
  assert.equal(environment.registry_snapshot_digest, options.registrySnapshotDigest, 'authoring Registry snapshot drift');
  const local = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  const components = environment.components?.length ? environment.components : environment.bindings;
  resolveInstructionComponents({ ...options, adapter: environment.adapter, components });
  return { environment, local, components };
}
function validateSpec(options, spec) {
  keys(spec, ['kind', 'baseline_environment_digest', 'registry_snapshot_digest', 'editable_ids', 'removable_ids', 'additions', 'observation', 'bundle_descriptor']);
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
  return c;
}
export function prepareInstructionEnvironmentAuthoring(options) {
  const spec = { kind: 'instruction_environment_authoring_v1', baseline_environment_digest: options.environmentObjectDigest,
    registry_snapshot_digest: options.registrySnapshotDigest, editable_ids: [...options.editableStableIds].sort(),
    removable_ids: [...(options.removableStableIds ?? [])].sort(), additions: structuredClone(options.additions ?? []),
    observation: structuredClone(options.observation), bundle_descriptor: structuredClone(options.bundleDescriptor) };
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
    removable_ids: spec.removable_ids, additions: spec.additions.map(a => ({ stable_id: a.descriptor.stable_id,
      asset_type: a.descriptor.asset_type, files: a.files })),
    response_contract: '{request_digest, changes:[{operation:revise|create,stable_id,files:[{path,text}]}|{operation:exclude,stable_id}]}',
    excluded_assets_are_not_retired: true, raw_logs_included: false }, models_started: false, activation_implied: false };
}
export function importInstructionEnvironmentAuthoring(options) {
  const spec = readContentAddressedJson({ storeRoot: options.storeRoot, digest: options.requestObjectDigest }).value;
  const c = validateSpec(options, spec), response = structuredClone(options.response);
  keys(response, ['request_digest', 'changes']); assert.equal(response.request_digest, options.requestObjectDigest, 'authoring request transplant');
  assert.ok(Array.isArray(response.changes) && response.changes.length && response.changes.length <= 64);
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-authoring-')));
  const components = c.components.filter(a => !response.changes.some(x => x.operation === 'exclude' && x.stable_id === a.asset.stable_id));
  let snapshot = options.registrySnapshotDigest; const assets = [];
  try {
    for (const [i, item] of prepared.entries()) {
      const source = join(root, String(i)); mkdirSync(source);
      for (const f of item.change.files) { const path = join(source, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, f.text, { flag: 'wx', mode: 0o600 }); }
      for(const f of item.fixedFiles){instructionPath(f.path);const path=join(source,f.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,f.bytes,{flag:'wx',mode:0o600});}
      const d = item.descriptor, revision = commitInstructionSource(source);
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

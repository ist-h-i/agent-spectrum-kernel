// Composition uses the existing rendered Prompt bundle and exact dependencies.
// The environment bundle has real revision lineage; new Skills remain roots.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from './content-addressed-store.mjs';
import { registerAsset, verifyAssetRegistry } from './asset-registry.mjs';
import { instructionTargetPath } from './instruction-projection-paths.mjs';
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const ref = a => Object.fromEntries(['asset_type', 'stable_id', 'version', 'record_digest', 'content_digest'].map(k => [k, a[k]]));
const sorted = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const ENVIRONMENT_COMPILER = 'ask-instruction-environment-compiler';
export function resolveInstructionComponents(options) {
  const registry = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  assert.ok(Array.isArray(options.components) && options.components.length && options.components.length <= 256, 'bounded nonempty components required');
  const components = structuredClone(options.components).sort((a, b) => sorted(a.asset.stable_id, b.asset.stable_id));
  const ids = new Set(), targets = new Set(), files = [];
  const restrictions={classifications:[],constraint_refs:[],requested_permissions:[],possible_effects:[]};
  for (const component of components) {
    assert.deepEqual(Object.keys(component).sort(), ['asset', 'files']);
    const asset = registry.assets.find(a => same(ref(a), component.asset));
    assert.ok(asset && ['skill', 'prompt'].includes(asset.asset_type), 'component must be a registered instruction Asset');
    assert.notEqual(asset.record.type_extension.renderer?.id, ENVIRONMENT_COMPILER, 'nested environment composition is not supported');
    for(const k of ['classifications','constraint_refs'])restrictions[k].push(...asset.record.safety[k]);
    for(const k of ['requested_permissions','possible_effects'])restrictions[k].push(...asset.record.permissions_and_effects[k]);
    assert.ok(!ids.has(asset.stable_id), 'duplicate component stable ID'); ids.add(asset.stable_id);
    const adapter = asset.record.type_extension.adapter;
    assert.ok(!adapter || ['shared', options.adapter].includes(adapter), 'component adapter mismatch');
    assert.ok(Array.isArray(component.files)); component.files.sort((a, b) => sorted(a.source, b.source));
    assert.deepEqual(component.files.map(f => f.source), asset.content.files.map(f => f.path).sort(sorted), 'complete component bytes required');
    for (const mapping of component.files) {
      assert.deepEqual(Object.keys(mapping).sort(), ['source', 'target']); instructionTargetPath(options.adapter, mapping.target);
      assert.ok(!targets.has(mapping.target.toLowerCase()), 'colliding compiled instruction paths'); targets.add(mapping.target.toLowerCase());
      const file = asset.content.files.find(f => f.path === mapping.source);
      files.push({ ...file, path: mapping.target });
    }
  }
  files.sort((a, b) => sorted(a.path, b.path));
  assert.ok(files.length <= 256 && !files.some(a => files.some(b => b.path.startsWith(a.path + '/'))), 'compiled instruction inventory exceeds package bounds or collides');
  for(const k of Object.keys(restrictions))restrictions[k]=[...new Set(restrictions[k])].sort(sorted);
  return { components, files, restrictions };
}
export function registerInstructionEnvironmentBundle(options) {
  const { components, files, restrictions } = resolveInstructionComponents(options);
  const input = { schema_version: '1.0.0', object_kind: 'instruction_environment_components', adapter: options.adapter, components };
  const inputDigest = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: input }).digest;
  const descriptor = structuredClone(options.descriptor);
  assert.equal(descriptor.asset_type, 'prompt', 'environment lineage uses an actual rendered Prompt bundle');
  // Caller declarations may add restrictions, but a bundle cannot conceal a
  // component's known high-impact classification, constraints or effects.
  // This union grants no safety/effectiveness/activation authority.
  for(const k of ['classifications','constraint_refs'])descriptor.safety[k]=[...new Set([...descriptor.safety[k],...restrictions[k]])].sort(sorted);
  for(const k of ['requested_permissions','possible_effects'])descriptor.permissions_and_effects[k]=[...new Set([...descriptor.permissions_and_effects[k],...restrictions[k]])].sort(sorted);
  descriptor.dependencies = components.map(c => c.asset);
  descriptor.content = { package_format: 'canonical_json_base64_files', files: files.map(f => ({ path: f.path, media_type: f.media_type, raw_digest: f.raw_digest })) };
  descriptor.type_extension = { kind: 'rendered_prompt_bundle', adapter: options.adapter, entrypoints: files.map(f => f.path),
    renderer: { id: ENVIRONMENT_COMPILER, version: '1', input_digest: inputDigest,
      projection_digest: canonicalDigest(files.map(({ path, raw_digest }) => ({ path, raw_digest }))) }, runtime_application_implied: false };
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-environment-compile-')));
  try {
    for (const f of files) { const path = join(root, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(f.bytes_base64, 'base64'), { flag: 'wx', mode: 0o600 }); }
    const publication = registerAsset({ storeRoot: options.storeRoot, sourceRoot: root,
      predecessorSnapshotDigest: options.registrySnapshotDigest, descriptor,
      trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
    return { ...publication, asset: ref({ ...descriptor, ...publication }), descriptor,
      component_input_object_digest: inputDigest, models_started: false, authority_implied: false };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
export function inspectCompiledInstructionComponents(options, asset, mappings) {
  if (asset.record.type_extension.renderer?.id !== ENVIRONMENT_COMPILER) return [];
  const input = readContentAddressedJson({ storeRoot: options.storeRoot, digest: asset.record.type_extension.renderer.input_digest }).value;
  assert.deepEqual(Object.keys(input).sort(), ['adapter', 'components', 'object_kind', 'schema_version']);
  assert.equal(input.object_kind, 'instruction_environment_components'); assert.equal(input.schema_version, '1.0.0');
  assert.equal(input.adapter, options.adapter);
  const resolved = resolveInstructionComponents({ ...options, components: input.components });
  assert.ok(same(asset.record.dependencies, resolved.components.map(c => c.asset)), 'compiled dependency lineage drift');
  assert.deepEqual(resolved.files.map(f => ({ path: f.path, raw_digest: f.raw_digest })), asset.content.files.map(f => ({ path: f.path, raw_digest: f.raw_digest })), 'compiled component bytes drift');
  // Re-mapping the compiled runtime projection would invalidate the identities
  // advertised by its component manifest and is deliberately refused.
  assert.ok(mappings.every(m => m.source === m.target), 'compiled environment requires exact runtime path identity');
  return resolved.components;
}

// Labels help an operator choose local assets; they do not grant cross-scope
// authority or last-layer-wins precedence.
import assert from 'node:assert/strict';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from './content-addressed-store.mjs';
import { verifyAssetRegistry } from './asset-registry.mjs';
import { resolveInstructionComponents, registerInstructionEnvironmentBundle } from './instruction-environment-compiler.mjs';

export function planInstructionComposition(options) {
  const registry = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  assert.ok(Array.isArray(options.layers) && options.layers.length && options.layers.length <= 64);
  const layers = structuredClone(options.layers).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(), components = new Map();
  for (const layer of layers) {
    assert.deepEqual(Object.keys(layer).sort(), ['components', 'id', 'kind']);
    assert.match(layer.id, /^[a-zA-Z0-9._-]{1,100}$/u);
    assert.ok(!ids.has(layer.id), 'duplicate composition layer'); ids.add(layer.id);
    assert.ok(['common', 'specialist', 'application', 'personal'].includes(layer.kind));
    assert.ok(Array.isArray(layer.components) && layer.components.length && layer.components.length <= 256);
    for (const component of layer.components) {
      const key = component.asset.stable_id, previous = components.get(key);
      assert.ok(!previous || canonicalDigest(previous) === canonicalDigest(component),
        'composition version or mapping conflict: ' + key);
      components.set(key, component);
    }
    layer.components.sort((a, b) => a.asset.stable_id.localeCompare(b.asset.stable_id));
  }
  const excluded = options.excludedStableIds ?? [];
  assert.ok(Array.isArray(excluded) && new Set(excluded).size === excluded.length);
  for (const id of excluded) assert.ok(components.delete(id), 'excluded Asset is absent: ' + id);
  const resolved = resolveInstructionComponents({ ...options, components: [...components.values()] });
  const lock = { kind: 'instruction_composition_lock_v1', adapter: options.adapter,
    registry_snapshot_digest: options.registrySnapshotDigest, scope_id: registry.scope_id,
    layers, excluded_stable_ids: [...excluded].sort(), components: resolved.components,
    projection_digest: canonicalDigest(resolved.files.map(({ path, raw_digest }) => ({ path, raw_digest }))),
    activation_implied: false };
  return { lock, lock_digest: canonicalDigest(lock), models_started: false };
}
export function publishInstructionComposition(options) {
  const planned = planInstructionComposition(options);
  return { ...planned, object_digest: putContentAddressedJson({ storeRoot: options.storeRoot, artifact: planned.lock }).digest };
}
export function verifyInstructionComposition(options) {
  const lock = readContentAddressedJson({ storeRoot: options.storeRoot, digest: options.compositionObjectDigest }).value;
  const checked = planInstructionComposition({ ...options, adapter: lock.adapter,
    registrySnapshotDigest: lock.registry_snapshot_digest, layers: lock.layers, excludedStableIds: lock.excluded_stable_ids });
  assert.equal(checked.lock_digest, options.compositionObjectDigest, 'composition lock drift');
  return checked;
}
export function registerInstructionComposition(options) {
  const { lock } = verifyInstructionComposition(options);
  assert.equal(options.registrySnapshotDigest, lock.registry_snapshot_digest, 'replan after local Registry changes');
  return registerInstructionEnvironmentBundle({ ...options, adapter: lock.adapter, components: lock.components });
}
export function compareInstructionCompositions({ before, after }) {
  const old = new Map(before.components.map(c => [c.asset.stable_id, c]));
  const next = new Map(after.components.map(c => [c.asset.stable_id, c]));
  return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap(id =>
    canonicalDigest(old.get(id) ?? null) === canonicalDigest(next.get(id) ?? null) ? []
      : [{ stable_id: id, action: !old.has(id) ? 'add' : !next.has(id) ? 'exclude' : 'change',
        before: old.get(id) ?? null, after: next.get(id) ?? null }]);
}

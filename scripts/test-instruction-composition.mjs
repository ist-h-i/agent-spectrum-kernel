import test from 'node:test';
import assert from 'node:assert/strict';
import { planInstructionComposition, publishInstructionComposition, verifyInstructionComposition,
  registerInstructionComposition, compareInstructionCompositions } from './instruction-composition.mjs';
import { compiledMembershipFixture } from './test-helpers-instruction-environment-composition.mjs';
import { verifyAssetRegistry } from './asset-registry.mjs';

for (const track of ['codex', 'claude']) test(`${track} local layers pin individual versions and add/exclude through existing bundle lineage`, t => {
  const f = compiledMembershipFixture(t, track);
  const o = { ...f.options, registrySnapshotDigest: f.challenger.snapshot_digest,
    layers: [{ id: 'organization', kind: 'common', components: f.options.bindings },
      { id: 'frontend', kind: 'specialist', components: [f.rootComponent] },
      { id: 'app-a', kind: 'application', components: [f.rootComponent] },
      { id: 'my-workflow', kind: 'personal', components: [f.rootComponent] }] };
  const saved = publishInstructionComposition(o); assert.equal(saved.lock.components.length, 2);
  assert.equal(saved.lock.activation_implied, false);
  assert.deepEqual(planInstructionComposition({ ...o, layers: [...o.layers].reverse() }),
    { lock: saved.lock, lock_digest: saved.lock_digest, models_started: false });
  const pinned = verifyInstructionComposition({ ...o, compositionObjectDigest: saved.object_digest });
  assert.equal(pinned.lock_digest, saved.lock_digest);
  const excluded = planInstructionComposition({ ...o, excludedStableIds: [f.rootAsset.stable_id] });
  assert.deepEqual(compareInstructionCompositions({ before: saved.lock, after: excluded.lock }).map(r => r.action), ['exclude']);
  assert.deepEqual(compareInstructionCompositions({ before: excluded.lock, after: saved.lock }).map(r => r.action), ['add']);
  const record = verifyAssetRegistry({ storeRoot: f.storeRoot, snapshotDigest: f.challenger.snapshot_digest }).assets
    .find(a => a.record_digest === f.challenger.asset.record_digest).record;
  const descriptor = structuredClone(record); delete descriptor.object_kind;
  descriptor.version = '1.2.0'; descriptor.derivation.parent = f.challenger.asset;
  descriptor.maintenance.rollback.target = f.challenger.asset;
  const removed = publishInstructionComposition({ ...o, excludedStableIds: [f.rootAsset.stable_id] });
  const registered = registerInstructionComposition({ ...o, descriptor, compositionObjectDigest: removed.object_digest });
  assert.equal(registered.asset.version, '1.2.0');
  assert.throws(() => registerInstructionComposition({ ...o, registrySnapshotDigest: registered.snapshot_digest, descriptor,
    compositionObjectDigest: removed.object_digest }), /replan/);
  const conflict = structuredClone(o.layers);
  conflict[1].components = [{ ...conflict[1].components[0], asset: { ...conflict[1].components[0].asset, version: 'other' } }];
  assert.throws(() => planInstructionComposition({ ...o, layers: conflict }), /version or mapping conflict/);
  const collide = structuredClone(o.layers); collide[1].components[0].files[0].target = f.options.bindings[0].files[0].target;
  collide.splice(2);
  assert.throws(() => planInstructionComposition({ ...o, layers: collide }), /colliding/);
  assert.throws(() => planInstructionComposition({ ...o, excludedStableIds: ['missing'] }), /absent/);
});

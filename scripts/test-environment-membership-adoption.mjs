import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyAssetRegistry } from './asset-registry.mjs';
import { exportInstructionEnvironment } from './instruction-environment.mjs';
import { planEnvironmentTargetApply, applyEnvironmentTargetPlan, restoreEnvironmentTarget } from './environment-target.mjs';
import { compiledMembershipFixture } from './test-helpers-instruction-environment-composition.mjs';
import { syntheticClosure } from './test-helpers-personal-prompt-adoption.mjs';
for (const adapterTrack of ['codex', 'claude']) test(`${adapterTrack}: existing Evolution approves compiled new-root membership and restores it`, t => {
  const seed = compiledMembershipFixture(t, adapterTrack), checked = verifyAssetRegistry({ storeRoot: seed.storeRoot, snapshotDigest: seed.challenger.snapshot_digest });
  const registry = Object.fromEntries(['registry_id', 'repository_id', 'scope_id', 'snapshot_revision', 'snapshot_digest'].map(k => [k, checked[k]]));
  const f = syntheticClosure(t, { adapterTrack, environmentProjection: true, compositionSeed: { storeRoot: seed.storeRoot,
    parentAsset: seed.baseline.asset, childAsset: seed.challenger.asset, registry } });
  assert.equal(f.candidate.parent_asset.stable_id, seed.baseline.asset.stable_id);
  assert.notEqual(f.candidate.parent_asset.stable_id, seed.rootAsset.stable_id);
  const root = join(f.root, 'target'); exportInstructionEnvironment({ ...f.closure, environmentObjectDigest: f.environments.baseline, outputRoot: root });
  const path = join(root, seed.rootComponent.files[0].target), options = { ...f.closure, targetRoot: root, rollbackLockDigest: f.rollbackLockDigest };
  assert.equal(existsSync(path), false);
  const p = planEnvironmentTargetApply(options); assert.equal(applyEnvironmentTargetPlan(p.handle, p.digest).status, 'applied');
  assert.equal(existsSync(path), true);
  assert.equal(restoreEnvironmentTarget(options).status, 'restored'); assert.equal(existsSync(path), false);
  const after = verifyAssetRegistry({ storeRoot: seed.storeRoot, snapshotDigest: seed.challenger.snapshot_digest });
  assert.equal(after.assets.find(a => a.stable_id === seed.rootAsset.stable_id).record.derivation.kind, 'root');
});

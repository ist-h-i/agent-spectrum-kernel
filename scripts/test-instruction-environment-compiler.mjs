import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readContentAddressedJson } from './content-addressed-store.mjs';
import { registerAsset } from './asset-registry.mjs';
import { registerInstructionEnvironmentBundle } from './instruction-environment-compiler.mjs';
import { captureInstructionEnvironment, verifyInstructionEnvironment, instructionBytesDigest } from './instruction-environment.mjs';
import { buildSkillUsageEvidence } from './skill-usage-evidence.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
import { compiledMembershipFixture } from './test-helpers-instruction-environment-composition.mjs';
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
for (const track of ['codex', 'claude']) test(`${track}: environment has genuine revision lineage while added Skill remains a root`, t => {
  const f = compiledMembershipFixture(t, track);
  assert.equal(read(f.storeRoot, f.rootAsset.record_digest).derivation.kind, 'root');
  assert.deepEqual(read(f.storeRoot, f.challenger.record_digest).derivation.parent, f.baseline.asset);
  const content = read(f.storeRoot, f.challenger.content_digest);
  const options = { ...f.options, selectionObjectDigest: null, registrySnapshotDigest: f.challenger.snapshot_digest,
    bindings: [{ asset: f.challenger.asset, files: content.files.map(file => ({ source: file.path, target: file.path })) }] };
  const saved = captureInstructionEnvironment(options), checked = verifyInstructionEnvironment({ ...options, environmentObjectDigest: saved.object_digest });
  assert.ok(checked.environment.components.some(c => c.asset.stable_id === f.rootAsset.stable_id));
  const evidence = buildSkillUsageEvidence({ environmentObjectDigest: saved.object_digest, environment: saved.environment,
    runId: 'run', sessionId: 'session', producerVersion: 'fixture', selfReportedSkillIds: [f.rootAsset.stable_id],
    input: [{ 'event.name': track === 'codex' ? 'codex.skill_invocation' : 'skill_activated',
      [track === 'codex' ? 'conversation.id' : 'session.id']: 'session', 'skill.name': 'new-local' }] });
  assert.equal(evidence.mechanical_observations[0].asset_id, f.rootAsset.stable_id);
  const bad = structuredClone(options); bad.bindings[0].files[0].target += '.moved';
  assert.throws(() => captureInstructionEnvironment(bad), /path identity/);
});

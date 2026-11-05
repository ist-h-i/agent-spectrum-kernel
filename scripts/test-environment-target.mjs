import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportInstructionEnvironment } from './instruction-environment.mjs';
import { planEnvironmentTargetApply, applyEnvironmentTargetPlan, restoreEnvironmentTarget } from './environment-target.mjs';
import { syntheticClosure } from './test-helpers-personal-prompt-adoption.mjs';
for (const adapterTrack of ['codex', 'claude']) test(`${adapterTrack}: existing approved closure applies complete environment and explicitly restores`, t => {
  const f = syntheticClosure(t, { adapterTrack, environmentProjection: true });
  const root = join(f.root, 'target');
  exportInstructionEnvironment({ ...f.closure, environmentObjectDigest: f.environments.baseline, outputRoot: root });
  writeFileSync(join(root, 'README.md'), 'Project-owned work.\n');
  const options = { ...f.closure, targetRoot: root, rollbackLockDigest: f.rollbackLockDigest };
  assert.throws(() => planEnvironmentTargetApply({ ...options, trustedHumanDecisionAuthorities: [] }), /trust/i);
  const first = planEnvironmentTargetApply(options);
  assert.throws(() => applyEnvironmentTargetPlan(first.handle, 'wrong'), /confirmation/);
  assert.equal(applyEnvironmentTargetPlan(first.handle, first.digest).status, 'applied');
  assert.throws(() => applyEnvironmentTargetPlan(first.handle, first.digest), /owned/);
  assert.throws(() => restoreEnvironmentTarget({ ...options, rollbackLockDigest: f.candidateSelection }));
  assert.equal(restoreEnvironmentTarget(options).status, 'restored');
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), 'Project-owned work.\n');
  // A plan never grants authority to overwrite a subsequent local edit.
  const next = planEnvironmentTargetApply(options);
  const path = first.plan.files[0]; writeFileSync(join(root, path), 'local edit');
  assert.throws(() => applyEnvironmentTargetPlan(next.handle, next.digest), /drift/);
  assert.equal(readFileSync(join(root, path), 'utf8'), 'local edit');
});

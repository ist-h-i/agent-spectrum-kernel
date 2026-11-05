import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import { buildClaudeProjectionPlan } from './install-claude-adapter.mjs';
import { instructionTargetPath } from './instruction-projection-paths.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { planEnvironmentTargetApply, applyEnvironmentTargetPlan, restoreEnvironmentTarget } from './environment-target.mjs';
import { syntheticClosure } from './test-helpers-personal-prompt-adoption.mjs';
const source = resolve(import.meta.dirname, '..');
for (const adapterTrack of ['codex', 'claude']) test(`${adapterTrack}: lease real full installer instruction ownership and return exact owner bytes`, t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-environment-normal-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, args, { cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const script = join(source, `scripts/install-${adapterTrack}-adapter.mjs`);
  const core = run(join(source, 'scripts/install-kernel.mjs'), '--target', root); assert.equal(core.status, 0, core.stderr);
  const installed = run(script, '--target', root, '--profile', 'full'); assert.equal(installed.status, 0, installed.stderr);
  writeFileSync(join(root, 'README.md'), 'Unrelated project file.\n');
  const ownerPath = join(root, `.agent-spectrum-kernel/${adapterTrack}-install-state.json`), rawOwner = readFileSync(ownerPath), owner = JSON.parse(rawOwner);
  const kernel = JSON.parse(readFileSync(join(root, '.agent-spectrum-kernel/install-state.json')));
  const adapter = adapterTrack === 'codex' ? 'codex' : 'claude_code';
  const projection = adapterTrack === 'codex' ? buildCodexProjectionPlan({ profileName: 'full' }) : buildClaudeProjectionPlan({ profileName: 'full' });
  const primary = new Set(projection.compactProfileArtifacts.map(a => `${adapterTrack === 'codex' ? '.agents/prompts' : '.claude/commands'}/${a.metadata.prompt_name}`));
  const support = [...new Set([...Object.keys(owner.managed_files), ...Object.keys(kernel.managed_files), 'AGENTS.md'])].filter(path => {
    if (primary.has(path) || !existsSync(join(root, path))) return false;
    try { instructionTargetPath(adapter, path, true); return true; } catch { return false; }
  });
  const f = syntheticClosure(t, { adapterTrack, renderedSeed: projection.compactProfileArtifacts, environmentProjection: true,
    environmentSupportRoot: root, environmentSupportPaths: support });
  const options = { ...f.closure, targetRoot: root, rollbackLockDigest: f.rollbackLockDigest, ownerStateDigest: instructionBytesDigest(rawOwner) };
  assert.throws(() => planEnvironmentTargetApply({ ...options, ownerStateDigest: undefined }), /ownership transfer/);
  const p = planEnvironmentTargetApply(options);
  assert.equal(applyEnvironmentTargetPlan(p.handle, p.digest).status, 'applied');
  const delegated = JSON.parse(readFileSync(ownerPath));
  assert.ok(delegated.instruction_environment_delegation);
  assert.ok([...primary].every(path => !delegated.managed_files[path]));
  const refused = run(script, '--target', root, '--profile', 'full', '--check'); assert.notEqual(refused.status, 0);
  const coreRefused = run(join(source, 'scripts/install-kernel.mjs'), '--target', root, '--check'); assert.notEqual(coreRefused.status, 0);
  assert.throws(() => restoreEnvironmentTarget({ ...options, ownerStateDigest: 'sha256:' + '0'.repeat(64) }), /pin/);
  assert.equal(restoreEnvironmentTarget(options).status, 'restored');
  assert.ok(readFileSync(ownerPath).equals(rawOwner));
  const returned = run(script, '--target', root, '--profile', 'full', '--check'); assert.equal(returned.status, 0, returned.stderr);
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), 'Unrelated project file.\n');
  assert.throws(() => planEnvironmentTargetApply(options), /already consumed/);
});

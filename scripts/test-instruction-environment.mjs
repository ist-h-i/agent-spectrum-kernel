import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalDigest, readContentAddressedJson } from './content-addressed-store.mjs';
import { createEmptyAssetRegistry, registerAsset } from './asset-registry.mjs';
import { captureInstructionEnvironment, verifyInstructionEnvironment, exportInstructionEnvironment, exactInstructionAsset, instructionBytesDigest } from './instruction-environment.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
for (const track of ['codex', 'claude']) test(`${track}: freeze, verify and export exact complete environment`, t => {
  const f = environmentFixture(t, track), frozen = captureInstructionEnvironment(f.options);
  const checked = verifyInstructionEnvironment({ ...f.options, environmentObjectDigest: frozen.object_digest });
  assert.equal(checked.environment.runtime.ambient_config, 'Unknown');
  assert.equal(checked.environment.effectiveness_implied, false);
  const outputRoot = join(f.root, 'export');
  exportInstructionEnvironment({ ...f.options, environmentObjectDigest: frozen.object_digest, outputRoot });
  for (const file of checked.files) assert.equal(readFileSync(join(outputRoot, file.path), 'utf8'), file.text);
  assert.throws(() => exportInstructionEnvironment({ ...f.options, environmentObjectDigest: frozen.object_digest, outputRoot }), /fresh/);
  writeFileSync(join(f.root, 'AGENTS.md'), 'later source changes');
  const second = join(f.root, 'export-again');
  exportInstructionEnvironment({ ...f.options, environmentObjectDigest: frozen.object_digest, outputRoot: second });
  assert.equal(readFileSync(join(second, 'AGENTS.md'), 'utf8'), 'Artificial bounded instruction environment.\n');
});
test('missing files, collisions, other-adapter paths, traversal and unregistered refs fail before export', t => {
  const f = environmentFixture(t);
  for (const mutate of [
    x => x.bindings[0].files.pop(),
    x => x.bindings[0].files[1].target = x.bindings[0].files[0].target,
    x => x.bindings[0].files[0].target = '.claude/commands/x.md',
    x => x.bindings[0].files[0].target = '../escape.md',
    x => x.bindings[0].asset.version = 'absent',
    x => x.supportPaths = ['.claude/settings.json'],
  ]) {
    const input = structuredClone(f.options); mutate(input);
    assert.throws(() => captureInstructionEnvironment(input));
  }
  assert.equal(existsSync(join(f.root, 'export')), false);
});
test('symlink source and export ancestors are refused', t => {
  const f = environmentFixture(t);
  symlinkSync(join(f.root, 'AGENTS.md'), join(f.root, 'CLAUDE.md'));
  assert.throws(() => captureInstructionEnvironment({ ...f.options, supportPaths: ['CLAUDE.md'] }), /symlink/);
  const frozen = captureInstructionEnvironment(f.options);
  symlinkSync(f.root, join(f.root, 'linked'));
  assert.throws(() => exportInstructionEnvironment({ ...f.options, environmentObjectDigest: frozen.object_digest, outputRoot: join(f.root, 'linked/out') }), /symlink/);
});
test('new Skills and revised Skill bodies/references remain individually registered and exportable on both adapters', t => {
  const f = environmentFixture(t), source = resolve(import.meta.dirname, '../docs/fixtures/asset-registry');
  const reference = JSON.parse(readFileSync(join(source, 'reference.json'))), sample = reference.assets.find(a => a.asset_type === 'skill');
  const descriptor = structuredClone(readContentAddressedJson({ storeRoot: join(source, 'store'), digest: sample.record_digest }).value);
  delete descriptor.object_kind; delete descriptor.content.content_digest;
  descriptor.stable_id = 'ask.skill.new-local'; descriptor.version_scheme = 'semantic'; descriptor.version = '1.0.0';
  descriptor.type_extension.entrypoint = 'skills/new-local/SKILL.md';
  const paths = ['skills/new-local/SKILL.md', 'skills/new-local/references/check.md'];
  for (const path of paths) { mkdirSync(dirname(join(f.root, path)), { recursive: true }); writeFileSync(join(f.root, path), `Artificial ${path}\n`); }
  const files = () => paths.map(path => ({ path, media_type: 'text/markdown; charset=utf-8', raw_digest: instructionBytesDigest(readFileSync(join(f.root, path))) }));
  descriptor.content.files = files();
  const initial = createEmptyAssetRegistry({ storeRoot: f.storeRoot, registryId: 'new-skills', repositoryId: descriptor.source.repository_id, scopeId: 'new-skills' });
  const first = registerAsset({ storeRoot: f.storeRoot, sourceRoot: f.root, predecessorSnapshotDigest: initial.snapshot_digest, descriptor });
  const parent = exactInstructionAsset({ ...descriptor, ...first });
  descriptor.version = '1.1.0'; descriptor.derivation = { kind: 'full_content_revision', parent, delta: { kind: 'replacement', summary: 'Revise actual Skill text.' } };
  descriptor.maintenance.rollback.target = parent;
  writeFileSync(join(f.root, paths[0]), 'Revised Skill body.\n'); descriptor.content.files = files();
  const second = registerAsset({ storeRoot: f.storeRoot, sourceRoot: f.root, predecessorSnapshotDigest: first.snapshot_digest, descriptor });
  for (const adapter of ['codex', 'claude_code']) {
    const options = { ...f.options, adapter, environmentId: `new-${adapter}`, registrySnapshotDigest: second.snapshot_digest,
      selectionObjectDigest: null, supportPaths: [], bindings: [{ asset: exactInstructionAsset({ ...descriptor, ...second }),
        files: paths.map(path => ({ source: path, target: `.${adapter === 'codex' ? 'agents' : 'claude'}/${path}` })) }] };
    const saved = captureInstructionEnvironment(options), outputRoot = join(f.root, `new-${adapter}`);
    exportInstructionEnvironment({ ...options, environmentObjectDigest: saved.object_digest, outputRoot });
    assert.equal(readFileSync(join(outputRoot, options.bindings[0].files[0].target), 'utf8'), 'Revised Skill body.\n');
    assert.equal(saved.environment.runtime_use_implied, false);
    assert.notEqual(second.content_digest, first.content_digest);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotInstructionSource, verifyInstructionSourceSnapshot, writeInstructionSourceSnapshot, readInstructionSourceSnapshot } from './instruction-source-version.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ask-file-snapshot-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'); mkdirSync(source);
  mkdirSync(join(source, 'skills')); writeFileSync(join(source, 'skills', 'demo.md'), 'Skill.\n');
  return { root, source };
}
test('filesystem source revision is location independent, includes content and paths, excludes Git metadata', t => {
  const { root, source } = fixture(t), copy = join(root, 'copy');
  const revision = snapshotInstructionSource(source); assert.match(revision, /^sha256:[a-f0-9]{64}$/u);
  cpSync(source, copy, { recursive: true });
  assert.equal(snapshotInstructionSource(copy), revision);
  mkdirSync(join(copy, '.git')); writeFileSync(join(copy, '.git', 'config'), 'private local metadata');
  assert.equal(snapshotInstructionSource(copy), revision);
  writeFileSync(join(copy, 'skills', 'demo.md'), 'Changed.\n');
  assert.throws(() => verifyInstructionSourceSnapshot(copy, revision), /snapshot changed/);
});
test('explicit inventory and context are deterministic and executable changes are detected', t => {
  const { source } = fixture(t), path = join(source, 'skills', 'demo.md');
  const revision = snapshotInstructionSource(source, { paths: ['skills/demo.md'] });
  writeFileSync(join(source, 'unrelated.txt'), 'extra');
  assert.equal(snapshotInstructionSource(source, { paths: ['skills/demo.md'] }), revision);
  assert.notEqual(snapshotInstructionSource(source), revision);
  assert.notEqual(snapshotInstructionSource(source, { paths: ['skills/demo.md'], contextDigest: 'sha256:' + 'a'.repeat(64) }), revision);
  chmodSync(path, 0o700);
  assert.notEqual(snapshotInstructionSource(source, { paths: ['skills/demo.md'] }), revision);
});
test('snapshot rejects escape, duplicate inventory, symlinks, and non-file paths', t => {
  const { root, source } = fixture(t);
  for (const paths of [['../escape'], ['skills/demo.md', 'skills/demo.md'], ['skills'], ['/tmp/other'], ['.git/config']])
    assert.throws(() => snapshotInstructionSource(source, { paths }));
  symlinkSync(join(source, 'skills', 'demo.md'), join(source, 'link.md'));
  assert.throws(() => snapshotInstructionSource(source), /symlink/);
  symlinkSync(source, join(root, 'link-root'));
  assert.throws(() => snapshotInstructionSource(join(root, 'link-root')), /symlink/);
});

test('source marker survives relocation and verifies bytes; invalid marker does not fall back to Git', t => {
  const { root, source } = fixture(t);
  assert.equal(readInstructionSourceSnapshot(source), null);
  const revision = writeInstructionSourceSnapshot(source);
  assert.equal(readInstructionSourceSnapshot(source).revision, revision);
  const copy = join(root, 'copy'); cpSync(source, copy, { recursive: true });
  assert.equal(readInstructionSourceSnapshot(copy).revision, revision);
  writeFileSync(join(copy, 'skills', 'demo.md'), 'drift');
  assert.throws(() => readInstructionSourceSnapshot(copy), /snapshot changed/);
  writeFileSync(join(source, '.ask-source-version.json'), '{}');
  assert.throws(() => readInstructionSourceSnapshot(source));
});

test('source snapshots accept empty and bounded large runtime files', t => {
  const { source } = fixture(t);
  writeFileSync(join(source, '.gitkeep'), '');
  writeFileSync(join(source, 'large.json'), 'a'.repeat(2 * 1024 * 1024));
  const revision = writeInstructionSourceSnapshot(source);
  assert.equal(readInstructionSourceSnapshot(source).revision, revision);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { devNull } from 'node:os';
import { existsSync, lstatSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNoSymlinkPathSegments, canonicalDigest, readJsonFileStrict } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';

// Only a fresh, privately materialized instruction source is accepted by callers.
// No network, user hooks, signing agent or global Git configuration is involved.
export function commitInstructionSource(root,{contextDigest=null}={}) {
  if(contextDigest!==null)assert.match(contextDigest,/^sha256:[a-f0-9]{64}$/u);
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
  const git = args => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=' + devNull, '-c', 'commit.gpgsign=false',
      '-c', 'user.name=ASK local instructions', '-c', 'user.email=local-instructions@invalid', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 0, 'local instruction source version failed'); return r.stdout.trim();
  };
  git(['init', '--quiet', '--template=']); git(['add', '--all']); git(['commit', '--quiet', '-m', 'Materialized instruction candidate'+(contextDigest?'\n\nContext '+contextDigest:'')]);
  return git(['rev-parse', 'HEAD']);
}

// File snapshots identify bytes and portable executable intent, never absolute
// paths, timestamps, Git metadata, or machine-specific ownership. They carry no
// authority to execute, activate, or trust the captured instructions.
export function snapshotInstructionSource(root, { contextDigest = null, paths = null } = {}) {
  if (contextDigest !== null) assert.match(contextDigest, /^sha256:[a-f0-9]{64}$/u);
  root = resolve(root);
  assertNoSymlinkPathSegments(root, 'instruction snapshot root');
  assert.ok(lstatSync(root).isDirectory(), 'instruction snapshot root must be a directory');
  const portable = value => {
    assert.ok(typeof value === 'string' && /^(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(value)
      && !value.split('/').includes('.git') && value !== '.ask-source-version.json', 'invalid instruction snapshot path');
    return value;
  };
  const enumerate = () => {
    const found = [];
    function walk(directory, prefix = '') {
      for (const name of readdirSync(directory).sort()) {
        if (name === '.git' || (prefix === '' && name === '.ask-source-version.json')) continue;
        const path = portable(prefix + name), absolute = resolve(root, path);
        const status = lstatSync(absolute);
        assert.ok(!status.isSymbolicLink(), 'instruction snapshot must not contain a symlink');
        if (status.isDirectory()) walk(absolute, path + '/');
        else { assert.ok(status.isFile(), 'instruction snapshot must contain regular files only'); found.push(path); }
      }
    }
    walk(root); return found.sort();
  };
  const inventory = paths === null ? enumerate() : [...paths].map(portable).sort();
  assert.ok(inventory.length > 0 && inventory.length <= 10000, 'bounded nonempty snapshot inventory required');
  assert.equal(new Set(inventory).size, inventory.length, 'duplicate instruction snapshot path');
  let total = 0;
  const files = inventory.map(path => {
    const absolute = resolve(root, path);
    assertNoSymlinkPathSegments(absolute, 'instruction snapshot file');
    const status = lstatSync(absolute);
    assert.ok(status.isFile(), 'instruction snapshot entry must be a regular file');
    assert.ok(status.size <= 64 * 1024 * 1024, 'instruction snapshot file is too large');
    total += status.size;
    assert.ok(total <= 256 * 1024 * 1024, 'instruction snapshot is too large');
    const file = readStableFile(absolute, 'instruction snapshot file', 64 * 1024 * 1024);
    return { path, raw_digest: file.rawByteDigest,
      byte_length: file.bytes.length, executable: Boolean(file.evidence.finalPath.mode & 0o111) };
  });
  if (paths === null) assert.deepEqual(enumerate(), inventory, 'instruction snapshot inventory changed during read');
  return canonicalDigest({ kind: 'instruction_filesystem_snapshot_v1', context_digest: contextDigest, files });
}

export function verifyInstructionSourceSnapshot(root, revision, options = {}) {
  assert.match(revision, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(snapshotInstructionSource(root, options), revision, 'instruction source snapshot changed');
  return revision;
}


export function writeInstructionSourceSnapshot(root, { contextDigest = null } = {}) {
  root = resolve(root);
  const revision = snapshotInstructionSource(root, { contextDigest });
  const markerPath = resolve(root, '.ask-source-version.json');
  assertNoSymlinkPathSegments(markerPath, 'instruction snapshot marker', { allowMissingLeaf: true });
  if (existsSync(markerPath)) assert.ok(lstatSync(markerPath).isFile(), 'instruction snapshot marker must be a file');
  const marker = { kind: 'filesystem_snapshot', revision, context_digest: contextDigest };
  const temporary = resolve(root, `.ask-source-version-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(marker) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, markerPath);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return revision;
}

export function readInstructionSourceSnapshot(root) {
  root = resolve(root);
  const markerPath = resolve(root, '.ask-source-version.json');
  assertNoSymlinkPathSegments(markerPath, 'instruction snapshot marker', { allowMissingLeaf: true });
  if (!existsSync(markerPath)) return null;
  const marker = readJsonFileStrict(markerPath, 'instruction snapshot marker');
  assert.deepEqual(Object.keys(marker).sort(), ['context_digest', 'kind', 'revision']);
  assert.equal(marker.kind, 'filesystem_snapshot');
  verifyInstructionSourceSnapshot(root, marker.revision, { contextDigest: marker.context_digest });
  return marker;
}

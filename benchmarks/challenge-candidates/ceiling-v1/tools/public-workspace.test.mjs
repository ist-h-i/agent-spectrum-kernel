import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { candidates, freeze, prepare, root, verify } from './public-workspace.mjs';

test('all six public seeds prepare, run and freeze separately from portfolio', () => {
  assert.equal(process.version, 'v24.19.0', 'use the pinned fixture runtime');
  assert.equal(candidates().length, 6);
  for (const { id } of candidates()) {
    const temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-public-'));
    try {
      const workspace = resolve(temp, 'workspace');
      const receipt = prepare(id, workspace);
      assert.equal(receipt.ready_for_measurement, false);
      assert.equal(existsSync(resolve(workspace, '.git')), false);
      assert.equal(existsSync(resolve(workspace, 'catalog.json')), false);
      assert.equal(existsSync(resolve(workspace, 'tools')), false);
      assert.ok(readFileSync(resolve(workspace, 'task.md'), 'utf8').includes('公開契約'));
      execFileSync(process.execPath, ['--test'], { cwd: workspace, timeout: 30_000, encoding: 'utf8', env: { PATH: process.env.PATH } });
      assert.equal(verify(id, workspace).valid, true);
      mkdirSync(resolve(workspace, 'test/added'), { recursive: true });
      writeFileSync(resolve(workspace, 'test/added/observation.mjs'), '// synthetic submission inventory check\n');
      writeFileSync(resolve(workspace, 'RESULT.md'), 'Synthetic controller verification; no model execution.\n');
      const record = freeze(id, workspace, resolve(temp, 'frozen'), { trial_id: 'synthetic-controller-only', model: 'not-executed', condition: 'synthetic' });
      assert.equal(record.quality_score, null);
      assert.equal(record.safety_blocker, null);
      assert.equal(record.evaluator_reference, null);
      assert.equal(record.ready_for_measurement, false);
      assert.equal(record.submission_digest, verify(id, workspace).submission_digest);
      assert.equal(verify(id, resolve(temp, 'frozen/workspace')).valid, true);
      assert.throws(() => prepare(id, workspace), /EEXIST/u);
      assert.throws(() => freeze(id, workspace, resolve(temp, 'missing-fields'), {}), /missing trial_id/u);
      const protectedPath = 'package.json';
      writeFileSync(resolve(workspace, protectedPath), '{}\n');
      assert.equal(verify(id, workspace).valid, false);
      assert.throws(() => freeze(id, workspace, resolve(temp, 'invalid-freeze'), { trial_id: 'x', model: 'not-executed', condition: 'synthetic' }), /protected/u);
      assert.equal(existsSync(resolve(temp, 'invalid-freeze')), false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});

test('controller rejects scope escapes, wrong identities, aliases and changed inputs', () => {
  const { id } = candidates()[0], temp = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-boundary-'));
  try {
    const workspace = resolve(temp, 'workspace');
    prepare(id, workspace);
    assert.throws(() => prepare('../../escape', resolve(temp, 'escape')), /unknown/u);
    writeFileSync(resolve(workspace, 'outside.txt'), 'outside scope');
    assert.equal(verify(id, workspace).valid, false);
    rmSync(resolve(workspace, 'outside.txt'));
    rmSync(resolve(workspace, 'task.md'));
    assert.equal(verify(id, workspace).valid, false);
    copyFileSync(resolve(root, candidates()[0].task_path), resolve(workspace, 'task.md'));
    symlinkSync(resolve(workspace, 'package.json'), resolve(workspace, 'src/alias.mjs'));
    assert.throws(() => verify(id, workspace), /symlink/u);
    rmSync(resolve(workspace, 'src/alias.mjs'));
    linkSync(resolve(workspace, 'package.json'), resolve(workspace, 'src/hardlink.mjs'));
    assert.throws(() => verify(id, workspace), /independent regular/u);
    rmSync(resolve(workspace, 'src/hardlink.mjs'));
    symlinkSync(temp, resolve(temp, 'alias'));
    assert.throws(() => prepare(id, resolve(temp, 'alias/new')), /symlink/u);
    assert.equal(verify(id, workspace).valid, true);
    assert.equal(verify(candidates()[1].id, workspace).valid, false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

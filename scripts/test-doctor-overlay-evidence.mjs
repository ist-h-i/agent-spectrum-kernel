#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const target = mkdtempSync(resolve(tmpdir(), 'ask-doctor-evidence-'));
const run = (script, args) => spawnSync(process.execPath, [resolve(root, 'scripts', script), ...args], { encoding: 'utf8' });
try {
  const installed = run('install-kernel.mjs', ['--target', target, '--skills', 'operating-mode-router']);
  assert.equal(installed.status, 0, installed.stderr);
  const safe = 'Do not require extra tests, documents, or agents when direct evidence suffices.';
  const cases = [
    [safe, false],
    ['Never bypass verification.', false],
    ['Do not require evidence.', true],
    ['Do not require verification when direct evidence suffices.', true],
    ['Do not require extra verification when direct evidence suffices.', true],
    ['No need for evidence.', true],
    ['Skip risk-gate when direct evidence suffices.', true],
    [safe + ' Bypass verification.', true],
    [safe.replace('.', '; bypass verification.'), true],
  ];
  for (const [statement, expected] of cases) {
    writeFileSync(resolve(target, 'docs/project-overlay.md'), statement + '\n');
    const result = run('ask-doctor.mjs', ['--target', target, '--runtime-probe']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.includes('possible project-overlay contradiction'), expected, statement + '\n' + result.stdout);
  }
  console.log(`Doctor evidence-boundary regression tests passed: ${cases.length}`);
} finally {
  rmSync(target, { recursive: true, force: true });
}

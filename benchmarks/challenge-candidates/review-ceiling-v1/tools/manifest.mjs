import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPracticalChallengeRegistrations } from '../../../../scripts/evaluation-task-catalog.mjs';
import { evaluationFile, evaluationSource, readEvaluationInventory } from '../../../../scripts/evaluation-task-inputs.mjs';

const registration = readPracticalChallengeRegistrations().find(row => row.id === 'rc01-shared-review-platform');
assert.ok(registration, 'RC01 must be registered');

export function sealedInput() {
  const { id, input_version: version, input_manifest: { path: manifest, digest } } = registration;
  return readEvaluationInventory({ id, input: {
    kind: 'staged', root: registration.workspace, manifest, digest, version,
    task_path: 'task.md', delivery_modes: ['default'], default_delivery: 'default',
  } });
}

export function manifestBytes() {
  const { path, digest } = registration.input_manifest;
  return evaluationFile(join(evaluationSource, path), 'evaluation input manifest', digest).bytes;
}

export function stats(rows) {
  const out = {
    files: rows.length, bytes: rows.reduce((sum, row) => sum + row.bytes.length, 0),
    implementation_lines: 0, test_lines: 0, styles_lines: 0, markup_lines: 0, other_text_lines: 0,
  };
  for (const row of rows) {
    if (/\.(png|jpg|woff|ico)$/.test(row.path)) continue;
    const body = row.bytes.toString('utf8');
    const lines = body.split('\n').length - (body.endsWith('\n') ? 1 : 0);
    const isTest = /(^|\/)(__tests__|tests?|fixtures)(\/|$)|\.test\./.test(row.path);
    const bucket = /\.(ts|tsx|js|mjs|cjs)$/.test(row.path) ? (isTest ? 'test_lines' : 'implementation_lines')
      : /\.css$/.test(row.path) ? 'styles_lines' : /\.html$/.test(row.path) ? 'markup_lines' : 'other_text_lines';
    out[bucket] += lines;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'use scripts/seal-evaluation-revisions.mjs --write to refresh the shared manifest');
  console.log(JSON.stringify({ status: 'ok', ...stats(sealedInput().files) }));
}

import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPracticalChallengeRegistrations } from '../../../../scripts/evaluation-task-catalog.mjs';
import { evaluationFile, evaluationSource, listEvaluationTree, verifyStagedEvaluationTaskInput } from '../../../../scripts/evaluation-task-inputs.mjs';

export const root = resolve(import.meta.dirname, '..');
export const source = evaluationSource;
export const id = 'ch08-growth-workspace';

export function inventory(dir = join(root, 'workspace')) {
  return listEvaluationTree(dir).map(path => {
    const { bytes, rawByteDigest } = evaluationFile(join(dir, path), 'UI challenge input');
    return { path, sha256: rawByteDigest.slice(7), bytes: bytes.length };
  });
}

export function seal() {
  const registration = readPracticalChallengeRegistrations().find(task => task.id === id);
  assert.ok(registration, 'CH08 must be registered');
  const files = verifyStagedEvaluationTaskInput(registration);
  assert.deepEqual(registration.evaluator.categories, { functional: 40, ux: 60 });
  assert.equal(registration.stages[1].update.scope, 'protected', 'CH08 reassessment belongs to protected assets');
  for (const { path, digest } of registration.evaluator.files) {
    evaluationFile(join(root, 'evaluator-v2', path), 'CH08 evaluator', digest);
  }
  return {
    files: files.length,
    bytes: inventory().reduce((sum, row) => sum + row.bytes, 0),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 2, 'use scripts/seal-evaluation-revisions.mjs --write to refresh the shared manifest');
  console.log(JSON.stringify({ status: 'ok', ...seal() }));
}

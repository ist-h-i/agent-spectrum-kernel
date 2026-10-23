#!/usr/bin/env node
// Human command adapter only; all dispatch/admission/consumption stays in the batch API.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPrimaryEvaluationBatch, startPrimaryEvaluationBatch } from './ask-primary-evaluation-batch.mjs';
import { createPrimaryEvaluationGradingAdapter } from './ask-primary-evaluation-grading.mjs';

export async function runPrimaryEvaluationStartCommand(argv) {
  assert.equal(argv.length, 3, 'start ROOT --confirm sha256:MANIFEST_DIGEST');
  const [root, flag, confirmedDigest] = argv;
  assert.equal(flag, '--confirm', 'confirm the inspected manifest digest');
  assert.match(confirmedDigest, /^sha256:[a-f0-9]{64}$/u, 'manifest digest required');
  const retained = inspectPrimaryEvaluationBatch(root);
  assert.equal(confirmedDigest, retained.manifest_digest, 'inspect and confirm the exact manifest digest');
  const references = retained.manifest.blocks.map(block => block.grading.resources ?? null);
  const reference = references[0];
  assert.ok(reference && typeof reference.path === 'string' && typeof reference.digest === 'string', 'fixed grading resources must be bound in every block');
  assert.deepEqual(Object.keys(reference).sort(), ['digest', 'path'], 'closed grading resource reference required');
  assert.ok(references.every(value => value?.path === reference.path && value?.digest === reference.digest
    && Object.keys(value).length === 2), 'all blocks must bind the same fixed grading resources');
  const gradingAdapter = createPrimaryEvaluationGradingAdapter({ resourcesPath: reference.path, resourcesDigest: reference.digest });
  const inspected = inspectPrimaryEvaluationBatch(root, { gradingAdapter });
  if (inspected.start_consumed || inspected.blockers.length) return { exitCode: 9, report: {
    kind: 'ask_primary_evaluation_batch_start_refused_v1', status: 'blocked', manifest_digest: inspected.manifest_digest,
    start_consumed: inspected.start_consumed, blockers: inspected.blockers,
    reason: inspected.start_consumed ? 'start_consumed_or_unknown_no_resume' : 'existing_preflight_not_ready',
  } };
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const report = await startPrimaryEvaluationBatch(root, confirmedDigest, { gradingAdapter, signal: controller.signal });
    return { exitCode: report.state === 'completed' ? 0 : 1, report };
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrimaryEvaluationStartCommand(process.argv.slice(2)).then(({ exitCode, report }) => {
    console.log(JSON.stringify(report, null, 2)); process.exitCode = exitCode;
  }, error => { console.error(error.message); process.exitCode = 10; });
}

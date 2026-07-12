import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(process.argv[2] ?? path.join(here, '..', 'workspace'));
const load = (relative) => import(pathToFileURL(path.join(workspace, relative)).href);
const { JobStore } = await load('src/job-store.mjs');
const { ExportService } = await load('src/export-service.mjs');

function job(overrides = {}) {
  return {
    id: 'j1', tenantId: 'tenant-a', ownerId: 'owner-a', status: 'queued',
    attempts: 0, maxAttempts: 3, availableAt: 0, lastError: null,
    leaseOwner: null, leaseExpiresAt: null, payload: { format: 'csv' },
    ...overrides
  };
}

test('operators cannot retry jobs from another tenant', () => {
  const store = new JobStore([job({ status: 'failed', attempts: 1, availableAt: null, lastError: { code: 'E' } })]);
  const service = new ExportService({ store, exporter: null, clock: { now: () => 100 } });
  assert.throws(() => service.retry('j1', { tenantId: 'tenant-b', userId: 'operator-b', role: 'operator' }));
  assert.equal(store.get('j1').status, 'failed');
});

test('concurrent claims return the job to only one worker', async () => {
  let entered = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const store = new JobStore([job()], {
    beforeClaim: async () => {
      entered += 1;
      if (entered === 2) release();
      await gate;
    }
  });
  const claims = await Promise.all([
    store.claimNext('worker-a', 10),
    store.claimNext('worker-b', 10)
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(store.get('j1').attempts, 1);
});

test('terminal writes require the active lease owner and an unexpired lease', () => {
  const store = new JobStore([job({
    status: 'running', attempts: 1, leaseOwner: 'worker-a', leaseExpiresAt: 50, availableAt: 0
  })]);
  const before = store.get('j1');
  assert.throws(() => store.complete('j1', 'worker-b', { rows: 1 }, 20));
  assert.deepEqual(store.get('j1'), before);
  assert.throws(() => store.complete('j1', 'worker-a', { rows: 1 }, 50));
  assert.deepEqual(store.get('j1'), before);
  assert.throws(() => store.fail('j1', 'worker-a', Object.assign(new Error('late'), { retryable: true }), 51));
  assert.deepEqual(store.get('j1'), before);
});

test('rejected manual retry leaves job state unchanged', () => {
  const store = new JobStore([job({
    status: 'succeeded', attempts: 2, availableAt: null,
    lastError: { code: 'OLD', message: 'keep me', retryable: true }
  })]);
  const before = store.get('j1');
  assert.throws(() => store.retry('j1', 100));
  assert.deepEqual(store.get('j1'), before);
});

test('retryable failure at maxAttempts remains failed', () => {
  const store = new JobStore([job({
    status: 'running', attempts: 3, maxAttempts: 3,
    leaseOwner: 'worker-a', leaseExpiresAt: 1_000
  })]);
  const failed = store.fail('j1', 'worker-a', Object.assign(new Error('temporary'), { retryable: true }), 100);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.availableAt, null);
});

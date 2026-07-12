import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStore } from '../src/job-store.mjs';

test('a queued job can be claimed and completed', async () => {
  const store = new JobStore([{ id: 'j1', status: 'queued', attempts: 0, maxAttempts: 3, availableAt: 0 }]);
  const claimed = await store.claimNext('worker-a', 10);
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);
  const result = { rows: 2 };
  store.complete('j1', 'worker-a', result, 20);
  result.rows = 9;
  assert.equal(store.get('j1').result.rows, 2);
});

test('retry schedules a failed job using exponential backoff', () => {
  const store = new JobStore([{ id: 'j1', status: 'failed', attempts: 2, maxAttempts: 4, availableAt: null, lastError: { code: 'E' } }]);
  const retried = store.retry('j1', 100);
  assert.equal(retried.status, 'queued');
  assert.equal(retried.availableAt, 2_100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStore } from '../src/job-store.mjs';
import { ExportService } from '../src/export-service.mjs';

test('an owner can retry a failed export', () => {
  const store = new JobStore([{ id: 'j1', tenantId: 't1', ownerId: 'u1', status: 'failed', attempts: 1, maxAttempts: 3, availableAt: null, lastError: { code: 'E' } }]);
  const service = new ExportService({ store, exporter: null, clock: { now: () => 100 } });
  const result = service.retry('j1', { tenantId: 't1', userId: 'u1', role: 'member' });
  assert.equal(result.status, 'queued');
});

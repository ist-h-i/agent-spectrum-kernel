import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('backfill preserves an ordinary public price for both readers', {
  program: {
    steps: [
      {
        op: 'construct', module: 'harness/store.mjs', export: 'PriceStore',
        args: [[{ id: 'tea', revision: 1, v1: { price: '12.50', currency: 'USD' }, v2: null }]],
        as: 'store',
      },
      {
        op: 'construct', module: 'src/migration.mjs', export: 'MigrationService',
        args: [{ $ref: 'store' }], as: 'migration',
      },
      { op: 'call', target: 'migration', method: 'backfill', args: [], as: 'report' },
      { op: 'call', target: 'migration', method: 'readV1', args: ['tea'], as: 'legacy' },
      { op: 'call', target: 'migration', method: 'readV2', args: ['tea'], as: 'modern' },
    ],
  },
  check(o) {
    assert.deepEqual(o.report?.migrated, ['tea']);
    assert.deepEqual(o.report?.skipped, []);
    assert.deepEqual(o.report?.conflicts, []);
    assert.deepEqual(o.legacy, { price: '12.50', currency: 'USD' });
    assert.deepEqual(o.modern, { amountMinor: '1250', currency: 'USD', taxMode: 'included' });
  },
});

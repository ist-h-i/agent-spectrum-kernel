import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('ordinary events close one window through the fixed sink', {
  program: {
    steps: [
      { op: 'invoke', module: 'harness/sink.mjs', export: 'createSink', args: [], as: 'sink' },
      {
        op: 'invoke', module: 'src/processor.mjs', export: 'createProcessor',
        args: [{ windowSize: 100, allowedLateness: 20, sink: { $ref: 'sink' } }], as: 'processor'
      },
      {
        op: 'call', target: 'processor', method: 'ingest',
        args: [{ tenantId: 'north', eventId: 'sale-a', revision: 0, eventTime: 10, amountMinor: '350', deleted: false }], as: 'first'
      },
      {
        op: 'call', target: 'processor', method: 'ingest',
        args: [{ tenantId: 'north', eventId: 'sale-b', revision: 0, eventTime: 70, amountMinor: '-25', deleted: false }], as: 'second'
      },
      { op: 'call', target: 'sink', method: 'snapshot', args: [], as: 'before' },
      { op: 'call', target: 'processor', method: 'advanceWatermark', args: ['north', 120], as: 'closed' },
      { op: 'call', target: 'sink', method: 'snapshot', args: [], as: 'after' }
    ]
  },
  check(observations) {
    assert.ok(observations && typeof observations === 'object');
    assert.deepEqual(observations.first, { accepted: true });
    assert.deepEqual(observations.second, { accepted: true });
    assert.equal(observations.before?.outputCount, 0);
    assert.deepEqual(observations.closed, { accepted: true });
    assert.ok(Array.isArray(observations.after?.outputs));
    assert.deepEqual(observations.after.outputs, [
      { tenantId: 'north', start: 0, end: 100, amountMinor: '325' }
    ]);
    assert.equal(observations.after.outputCount, 1);
    assert.equal(observations.after.rejectionCount, 0);
  }
});

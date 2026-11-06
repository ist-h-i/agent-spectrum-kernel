import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('scenario protocol records a normal report receipt', {
  program: {
    steps: [
      { op: 'construct', module: 'harness/store.mjs', export: 'DurableStore', args: [], as: 'store' },
      { op: 'construct', module: 'harness/sink.mjs', export: 'IdempotentSink', args: [], as: 'sink' },
      {
        op: 'invoke', module: 'src/queue.mjs', export: 'createQueue',
        args: [{ store: { $ref: 'store' }, sink: { $ref: 'sink' } }], as: 'queue',
      },
      {
        op: 'invoke', module: 'harness/client.mjs', export: 'submitReport',
        args: [{ $ref: 'queue' }, {
          tenantId: 'north', requestId: 'r1', payload: { title: 'Weekly', rows: [2, 4] },
        }], as: 'job',
      },
      {
        op: 'invoke', module: 'harness/client.mjs', export: 'workerTick',
        args: [{ $ref: 'queue' }, 'worker-a'], as: 'result',
      },
      {
        op: 'call', target: 'sink', method: 'lookup',
        args: [{ $ref: 'job', path: ['key'] }], as: 'output',
      },
      { op: 'call', target: 'sink', method: 'entries', args: [], as: 'outputs' },
    ],
  },
  check(o) {
    assert.equal(o?.job?.state, 'queued');
    assert.equal(o?.result?.state, 'succeeded');
    assert.equal(typeof o?.result?.receipt, 'string');
    assert.equal(typeof o?.output?.receipt, 'string');
    assert.equal(o?.result?.receipt, o?.output?.receipt);
    assert.ok(Array.isArray(o?.outputs));
    assert.equal(o.outputs.length, 1);
  },
});

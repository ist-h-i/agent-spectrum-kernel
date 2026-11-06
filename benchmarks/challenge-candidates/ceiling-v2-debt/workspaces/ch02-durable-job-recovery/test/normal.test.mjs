import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/queue.mjs';
import { DurableStore } from '../harness/store.mjs';
import { IdempotentSink } from '../harness/sink.mjs';
import { submitReport, workerTick } from '../harness/client.mjs';
import { render } from '../harness/renderer.mjs';
test('one report is rendered and recorded with a receipt', () => {
  const store = new DurableStore(), sink = new IdempotentSink(), queue = createQueue({ store, sink });
  const job = submitReport(queue, { tenantId: 'north', requestId: 'r1', payload: { title: 'Weekly', rows: [2,4] } });
  assert.equal(job.state, 'queued');
  const result = workerTick(queue, 'worker-a');
  assert.equal(result.state, 'succeeded');
  assert.equal(result.receipt, sink.lookup(job.key).receipt);
  assert.equal(sink.entries().length, 1);
});
test('same request returns same job and conflicting request is rejected', () => {
  const queue = createQueue({ store: new DurableStore(), sink: new IdempotentSink() });
  const first = queue.enqueue('north', 'r1', { title: 'A', rows: [] });
  assert.deepEqual(queue.enqueue('north', 'r1', { rows: [], title: 'A' }), first);
  assert.throws(() => queue.enqueue('north', 'r1', { title: 'B', rows: [] }));
});
test('permanent renderer failure is observable without stopping unrelated work', () => {
  const queue = createQueue({ store: new DurableStore(), sink: new IdempotentSink() });
  queue.enqueue('north', 'bad', { rows: [] }); queue.enqueue('north', 'good', { title: 'Good', rows: [] });
  assert.equal(workerTick(queue, 'w').state, 'failed');
  assert.equal(workerTick(queue, 'w').state, 'succeeded');
});
test('renderer classifies malformed JSON payloads as permanent failures', () => {
  for (const payload of [null, false, 0, 'text', [], {}, { title: 'No rows' }]) {
    assert.throws(() => render(payload), error => error.code === 'PERMANENT');
  }
});

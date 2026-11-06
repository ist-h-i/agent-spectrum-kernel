import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProcessor } from '../src/processor.mjs';
import { createSink } from '../harness/sink.mjs';
import { consume } from '../harness/consumer.mjs';
import { smallWindowSum } from '../harness/small-check.mjs';

test('fixed consumer closes a normal window at end plus lateness', () => {
  const sink = createSink();
  const processor = createProcessor({ windowSize: 100, allowedLateness: 20, sink });
  const inputs = JSON.parse(readFileSync(new URL('../data/normal.json', import.meta.url)));
  for (const input of inputs.slice(0, 2)) assert.deepEqual(consume(processor, input), { accepted: true });
  assert.equal(sink.snapshot().outputCount, 0);
  consume(processor, inputs[2]);
  assert.deepEqual(sink.snapshot().outputs, [{ tenantId: 'north', start: 0, end: 100, amountMinor: '325' }]);
  consume(processor, inputs[2]);
  assert.equal(sink.snapshot().outputCount, 1);
});

test('amounts are exact beyond the safe integer range', () => {
  const sink = createSink();
  const processor = createProcessor({ windowSize: 10, allowedLateness: 0, sink });
  const events = ['9007199254740993', '9007199254740995'].map((amountMinor, index) => ({
    tenantId: 't', eventId: String(index), revision: 0, eventTime: index, amountMinor, deleted: false
  }));
  for (const event of events) processor.ingest(event);
  processor.advanceWatermark('t', 10);
  assert.equal(sink.snapshot().outputs[0].amountMinor, smallWindowSum(events));
});

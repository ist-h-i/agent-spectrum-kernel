import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('scenario protocol accepts a normal shared edit', {
  program: {
    steps: [
      {
        op: 'construct', module: 'harness/server.mjs', export: 'EditServer', as: 'server',
        args: [[
          { tenantId: 'north', rowId: 'a', version: 1, name: 'Notebook', quantity: 2 },
          { tenantId: 'south', rowId: 'a', version: 1, name: 'Envelope', quantity: 4 },
        ]],
      },
      {
        op: 'construct', module: 'harness/transport.mjs', export: 'EditTransport',
        args: [{ $ref: 'server' }], as: 'transport',
      },
      {
        op: 'invoke', module: 'src/editor.mjs', export: 'createEditor',
        args: [{ transport: { $ref: 'transport' }, tenantId: 'north' }], as: 'editor',
      },
      {
        op: 'invoke', module: 'harness/views.mjs', export: 'mountList',
        args: [{ $ref: 'editor' }, 'a'], as: 'list',
      },
      {
        op: 'invoke', module: 'harness/views.mjs', export: 'mountDetail',
        args: [{ $ref: 'editor' }, 'a'], as: 'detail',
      },
      { op: 'call', target: 'editor', method: 'edit', args: ['a', { quantity: 3 }], as: 'id' },
      { op: 'call', target: 'editor', method: 'snapshot', args: ['a'], as: 'before' },
      { op: 'call', target: 'editor', method: 'flush', args: [{ $ref: 'id' }] },
      { op: 'call', target: 'transport', method: 'accept', args: [{ $ref: 'id' }] },
      { op: 'call', target: 'transport', method: 'deliver', args: [{ $ref: 'id' }] },
      { op: 'call', target: 'list', method: 'current', args: [], as: 'listState' },
      { op: 'call', target: 'detail', method: 'current', args: [], as: 'detailState' },
      { op: 'call', target: 'list', method: 'close', args: [] },
      { op: 'call', target: 'detail', method: 'close', args: [] },
    ],
  },
  check(o) {
    assert.equal(o?.before?.confirmed?.quantity, 2);
    assert.equal(o?.before?.pending?.quantity, 3);
    assert.equal(o?.listState?.confirmed?.quantity, 3);
    assert.equal(o?.listState?.status, 'idle');
    assert.deepEqual(o?.listState, o?.detailState);
  },
});

import assert from 'node:assert/strict';
import { scenarioTest } from '../harness/scenario.mjs';

scenarioTest('directly permitted detail reads do not start export chunks', {
  program: {
    steps: [
      {
        op: 'construct', module: 'harness/policy-store.mjs', export: 'PolicyStore',
        args: [{
          north: {
            revision: 1, users: ['alice', 'bob'], groups: {},
            resources: { report: { parent: null, body: 'quarterly report' } },
            rules: [{ subject: 'user:alice', resource: 'report', action: 'read', effect: 'allow' }],
            links: {},
          },
        }],
        as: 'store',
      },
      {
        op: 'construct', module: 'harness/policy-store.mjs', export: 'ChunkAdapter',
        args: [{ $ref: 'store' }], as: 'chunks',
      },
      {
        op: 'construct', module: 'src/service.mjs', export: 'DocumentService',
        args: [{ $ref: 'store' }, { $ref: 'chunks' }], as: 'documents',
      },
      {
        op: 'call', target: 'documents', method: 'detail',
        args: [{ tenant: 'north', user: 'alice', resource: 'report' }], as: 'detail',
      },
      { op: 'get', target: 'chunks', path: ['accepted', 'size'], as: 'acceptedCount' },
      { op: 'call', target: 'documents', method: 'close', args: [] },
    ],
  },
  check(o) {
    assert.deepEqual(o.detail, { status: 'allowed', body: 'quarterly report' });
    assert.equal(o.acceptedCount, 0);
  },
});

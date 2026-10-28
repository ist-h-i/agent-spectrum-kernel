import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PolicyStore, ChunkAdapter } from '../harness/policy-store.mjs';
import { documentClient } from '../harness/clients.mjs';
import { DocumentService } from '../src/service.mjs';
const setup = () => {
  const store = new PolicyStore(JSON.parse(readFileSync(new URL('../data/policies.json', import.meta.url))));
  const chunks = new ChunkAdapter(store);
  return { store, chunks, service: new DocumentService(store, chunks) };
};
test('directly authorized reader can list and open a document', () => {
  const { service } = setup();
  const client = documentClient(service, 'north', 'alice');
  assert.deepEqual(client.list(), ['report']);
  assert.deepEqual(client.detail('report'), { status: 'allowed', body: 'quarterly report' });
  assert.deepEqual(documentClient(service, 'north', 'bob').detail('report'), { status: 'denied' });
  service.close();
});
test('normal export completes in bounded chunks', () => {
  const { service, chunks } = setup();
  const client = documentClient(service, 'north', 'alice');
  const queued = client.export('report');
  assert.equal(queued.status, 'queued');
  for (let i = 0; i < 10 && client.status(queued.jobId).status !== 'completed'; i++) client.next(queued.jobId);
  assert.equal(client.status(queued.jobId).status, 'completed');
  assert.equal(chunks.completed.map(chunk => chunk.bytes).join(''), 'quarterly report');
  service.close();
});
test('adapter serializes revision checking with chunk acceptance', () => {
  const { store, chunks } = setup();
  const revision = store.revision('north');
  chunks.beforeAccept(() => { const policy = store.snapshot('north'); policy.rules = []; store.replace('north', policy); });
  assert.deepEqual(chunks.beginChunk({ tenant: 'north', expectedRevision: revision, resource: 'report', bytes: 'part' }), { status: 'revision-conflict' });
  assert.equal(chunks.accepted.size, 0);
});
test('a chunk accepted before revocation can finish after it', () => {
  const { store, chunks } = setup();
  const accepted = chunks.beginChunk({ tenant: 'north', expectedRevision: store.revision('north'), resource: 'report', bytes: 'part' });
  assert.equal(accepted.status, 'accepted');
  const policy = store.snapshot('north');
  policy.rules = [];
  store.replace('north', policy);
  assert.deepEqual(chunks.finish(accepted.receipt), { status: 'completed', receipt: accepted.receipt });
  assert.equal(chunks.completed.length, 1);
  assert.equal(chunks.completed[0].bytes, 'part');
  chunks.finish(accepted.receipt);
  assert.equal(chunks.completed.length, 1);
});

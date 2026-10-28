import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PriceStore } from '../harness/store.mjs';
import { legacyClient, modernClient } from '../harness/clients.mjs';
import { MigrationService } from '../src/migration.mjs';
const setup = () => {
  const store = new PriceStore(JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url))));
  return { store, service: new MigrationService(store) };
};
test('both readers observe an ordinary included price', () => {
  const { store, service } = setup();
  const old = legacyClient(service, store, 'legacy');
  const next = modernClient(service, store, 'modern');
  assert.equal(old.write('tea', { price: '3.25', currency: 'USD' }).ok, true);
  assert.deepEqual(next.read('tea'), { amountMinor: '325', currency: 'USD', taxMode: 'included' });
  assert.deepEqual(old.read('tea'), { price: '3.25', currency: 'USD' });
});
test('backfill and a drained queue permit normal cutover', () => {
  const { store, service } = setup();
  const old = legacyClient(service, store, 'legacy');
  old.queue('q1', 'rice', { price: '700', currency: 'JPY' });
  assert.deepEqual(service.backfill().skipped, []);
  assert.equal(service.drainQueue()[0].status, 'applied');
  old.close();
  assert.equal(service.activateV2().ok, true);
  assert.equal(store.state().phase, 'v2');
  assert.equal(service.readV2('rice').amountMinor, '700');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore, TransferService } from '../src/index.mjs';

function accounts() {
  return [
    { id: 'acct_from1', currency: 'USD', balance: 1_000, minBalance: 0, version: 0 },
    { id: 'acct_to001', currency: 'USD', balance: 200, minBalance: 0, version: 0 }
  ];
}

test('legacy credit and debit remain available', () => {
  const service = new TransferService(new AccountStore(accounts()));
  assert.equal(service.credit('acct_to001', 50).balance, 250);
  assert.equal(service.debit('acct_from1', 100).balance, 900);
});

test('transfer moves funds and returns a receipt', async () => {
  const service = new TransferService(new AccountStore(accounts()));
  const receipt = await service.transfer({
    requestId: 'request-1', fromAccountId: 'acct_from1', toAccountId: 'acct_to001', amount: 300,
    expectedVersions: { from: 0, to: 0 }
  });
  assert.equal(receipt.transferId, 'tr_000001');
  assert.equal(receipt.from.balance, 700);
  assert.equal(receipt.to.balance, 500);
});

test('transfer rejects zero and self transfers', async () => {
  const service = new TransferService(new AccountStore(accounts()));
  await assert.rejects(() => service.transfer({
    requestId: 'request-1', fromAccountId: 'acct_from1', toAccountId: 'acct_to001', amount: 0,
    expectedVersions: { from: 0, to: 0 }
  }));
  await assert.rejects(() => service.transfer({
    requestId: 'request-2', fromAccountId: 'acct_from1', toAccountId: 'acct_from1', amount: 1,
    expectedVersions: { from: 0, to: 0 }
  }));
});

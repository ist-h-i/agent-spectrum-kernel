import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(process.argv[2] ?? path.join(here, '..', 'workspace'));
const load = (relative) => import(pathToFileURL(path.join(workspace, relative)).href);
const api = await load('src/index.mjs');
const {
  AccountStore, TransferService, IdempotencyConflictError,
  InsufficientFundsError, VersionConflictError
} = api;
const hashFile = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, relative))).digest('hex');

function seed(overrides = {}) {
  const from = { id: 'acct_from1', currency: 'USD', balance: 100, minBalance: 0, version: 0, ...overrides.from };
  const to = { id: 'acct_to001', currency: 'USD', balance: 10, minBalance: 0, version: 0, ...overrides.to };
  return [from, to];
}

function request(overrides = {}) {
  return {
    requestId: 'request-1', fromAccountId: 'acct_from1', toAccountId: 'acct_to001', amount: 40,
    expectedVersions: { from: 0, to: 0 }, ...overrides
  };
}

test('normal transfer updates both accounts, receipt, and history exactly once', async () => {
  const audits = [];
  const store = new AccountStore(seed(), { auditSink: async (record) => audits.push(record) });
  const service = new TransferService(store);
  const receipt = await service.transfer(request());
  assert.deepEqual(receipt, {
    requestId: 'request-1', transferId: 'tr_000001', amount: 40, currency: 'USD',
    from: { id: 'acct_from1', balance: 60, version: 1 },
    to: { id: 'acct_to001', balance: 50, version: 1 }
  });
  assert.equal(audits.length, 1);
  assert.equal(service.listTransfers().length, 1);
});

test('floor boundary succeeds and one unit below the floor fails without mutation', async () => {
  const store = new AccountStore(seed({ from: { balance: 100, minBalance: -20 } }));
  const service = new TransferService(store);
  await service.transfer(request({ amount: 120 }));
  assert.equal(service.getAccount('acct_from1').balance, -20);

  const failingStore = new AccountStore(seed({ from: { balance: 100, minBalance: -20 } }));
  const failingService = new TransferService(failingStore);
  const before = [failingService.getAccount('acct_from1'), failingService.getAccount('acct_to001')];
  await assert.rejects(() => failingService.transfer(request({ amount: 121 })), InsufficientFundsError);
  assert.deepEqual([failingService.getAccount('acct_from1'), failingService.getAccount('acct_to001')], before);
  assert.deepEqual(failingService.listTransfers(), []);
});

test('audit rejection rolls back accounts, sequence, history, and idempotency', async () => {
  let shouldFail = true;
  const store = new AccountStore(seed(), { auditSink: async () => { if (shouldFail) throw new Error('audit down'); } });
  const service = new TransferService(store);
  const before = [service.getAccount('acct_from1'), service.getAccount('acct_to001')];
  await assert.rejects(() => service.transfer(request()), /audit down/);
  assert.deepEqual([service.getAccount('acct_from1'), service.getAccount('acct_to001')], before);
  assert.deepEqual(service.listTransfers(), []);
  shouldFail = false;
  const receipt = await service.transfer(request());
  assert.equal(receipt.transferId, 'tr_000001');
});

test('version and idempotency conflicts preserve state; replay precedes version checks', async () => {
  const store = new AccountStore(seed());
  const service = new TransferService(store);
  const first = await service.transfer(request());
  const replay = await service.transfer(request());
  assert.deepEqual(replay, first);
  assert.equal(service.listTransfers().length, 1);
  const before = [service.getAccount('acct_from1'), service.getAccount('acct_to001'), service.listTransfers()];
  await assert.rejects(() => service.transfer(request({ amount: 41 })), IdempotencyConflictError);
  await assert.rejects(() => service.transfer(request({ requestId: 'request-2', expectedVersions: { from: 0, to: 0 } })), VersionConflictError);
  assert.deepEqual([service.getAccount('acct_from1'), service.getAccount('acct_to001'), service.listTransfers()], before);
});

test('concurrent transfers cannot overspend', async () => {
  let entered = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const store = new AccountStore(seed(), {
    auditSink: async () => {
      entered += 1;
      if (entered === 1) release();
      await gate;
    }
  });
  const service = new TransferService(store);
  const outcomes = await Promise.allSettled([
    service.transfer(request({ requestId: 'request-a', amount: 80 })),
    service.transfer(request({ requestId: 'request-b', amount: 80 }))
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  assert.equal(service.getAccount('acct_from1').balance, 20);
  assert.equal(service.listTransfers().length, 1);
});

test('concurrent duplicate requests commit once and return the same receipt', async () => {
  let auditCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const store = new AccountStore(seed(), { auditSink: async () => { auditCalls += 1; await gate; } });
  const service = new TransferService(store);
  const first = service.transfer(request());
  const second = service.transfer(request());
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, right);
  assert.equal(auditCalls, 1);
  assert.equal(service.listTransfers().length, 1);
});

test('input, receipt, history, and audit objects are detached', async () => {
  let auditObject;
  const store = new AccountStore(seed(), { auditSink: async (record) => { auditObject = record; record.amount = 999; } });
  const service = new TransferService(store);
  const input = request();
  const receipt = await service.transfer(input);
  input.amount = 1;
  receipt.from.balance = 999;
  const history = service.listTransfers();
  history[0].amount = 777;
  assert.equal(service.getAccount('acct_from1').balance, 60);
  assert.equal(service.listTransfers()[0].amount, 40);
  assert.equal(auditObject.amount, 999);
});

test('legacy APIs remain compatible', () => {
  const service = new TransferService(new AccountStore(seed()));
  assert.equal(service.credit('acct_to001', 5).balance, 15);
  assert.equal(service.debit('acct_from1', 10).balance, 90);
  assert.equal(service.getAccount('acct_from1').version, 1);
  assert.deepEqual(service.listTransfers(), []);
});

test('scope-protected files and source-module set are unchanged', () => {
  assert.equal(hashFile('package.json'), '084ae0db79f5b172a2ee67db4a726352d1c3bdbc5431bf5f2ebf89364293c018');
  assert.equal(hashFile('src/serial-executor.mjs'), '2f8aa7f9b32242f1babcc5e831a8919f9dad5c1dab533fb9b68914a9efd37bd6');
  assert.equal(hashFile('docs/transfers.md'), 'f3d95be226bb970d9e2cc08a4f55fde84d958e3979905570e72ad72cbc08ba23');
  assert.equal(hashFile('docs/transfer.schema.json'), '658335dce2ed31eb3644e2c2280fe05b1bdff71d0d5b161bf673258b3cb0276a');
  const sourceFiles = fs.readdirSync(path.join(workspace, 'src')).sort();
  assert.deepEqual(sourceFiles, ['account-store.mjs', 'errors.mjs', 'index.mjs', 'serial-executor.mjs', 'transfer-service.mjs', 'validation.mjs']);
});

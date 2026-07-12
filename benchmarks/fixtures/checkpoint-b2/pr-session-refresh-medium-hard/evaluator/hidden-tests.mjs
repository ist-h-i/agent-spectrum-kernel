import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(process.argv[2] ?? path.join(here, '..', 'workspace'));
const load = (relative) => import(pathToFileURL(path.join(workspace, relative)).href);

const { AccountStore } = await load('src/account-store.mjs');
const { SessionStore } = await load('src/session-store.mjs');
const { AuthService } = await load('src/auth-service.mjs');
const { hashRefreshToken } = await load('src/tokens.mjs');

function seedSession(sessions, overrides = {}) {
  sessions.create({
    id: 's1', accountId: 'a1', tenantId: 't1', role: 'admin',
    refreshHash: hashRefreshToken('refresh-old'), expiresAt: 1_000,
    ...overrides
  });
}

test('refresh reloads current account state and claims', async () => {
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'viewer', active: true }]);
  const sessions = new SessionStore();
  seedSession(sessions);
  let claims;
  const service = new AuthService({
    sessions, accounts, clock: { now: () => 100 },
    tokenIssuer: {
      issueRefreshToken: () => 'refresh-next',
      issueAccessToken: async (account) => { claims = account; return 'access'; }
    }
  });
  await service.refresh('refresh-old');
  assert.equal(claims.role, 'viewer');

  const disabledAccounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'viewer', active: false }]);
  const disabledSessions = new SessionStore();
  seedSession(disabledSessions);
  const disabledService = new AuthService({
    sessions: disabledSessions, accounts: disabledAccounts, clock: { now: () => 100 },
    tokenIssuer: { issueRefreshToken: () => 'refresh-next', issueAccessToken: async () => 'access' }
  });
  await assert.rejects(() => disabledService.refresh('refresh-old'));

  const movedAccounts = new AccountStore([{ id: 'a1', tenantId: 't2', role: 'viewer', active: true }]);
  const movedSessions = new SessionStore();
  seedSession(movedSessions);
  const movedService = new AuthService({
    sessions: movedSessions, accounts: movedAccounts, clock: { now: () => 100 },
    tokenIssuer: { issueRefreshToken: () => 'refresh-next', issueAccessToken: async () => 'access' }
  });
  await assert.rejects(() => movedService.refresh('refresh-old'));
});

test('a token is expired at the exact expiresAt boundary', async () => {
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'member', active: true }]);
  const sessions = new SessionStore();
  seedSession(sessions, { role: 'member' });
  const service = new AuthService({
    sessions, accounts, clock: { now: () => 1_000 },
    tokenIssuer: { issueRefreshToken: () => 'refresh-next', issueAccessToken: async () => 'access' }
  });
  await assert.rejects(() => service.refresh('refresh-old'));
});

test('token-signing failure preserves the original refresh token', async () => {
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'member', active: true }]);
  const sessions = new SessionStore();
  seedSession(sessions, { role: 'member' });
  const service = new AuthService({
    sessions, accounts, clock: { now: () => 100 },
    tokenIssuer: {
      issueRefreshToken: () => 'refresh-next',
      issueAccessToken: async () => { throw new Error('signer unavailable'); }
    }
  });
  await assert.rejects(() => service.refresh('refresh-old'), /signer unavailable/);
  assert.ok(sessions.findByRefreshHash(hashRefreshToken('refresh-old')));
  assert.equal(sessions.findByRefreshHash(hashRefreshToken('refresh-next')), null);
});

test('concurrent refresh calls allow only one rotation', async () => {
  let entered = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sessions = new SessionStore({
    beforeWrite: async () => {
      entered += 1;
      if (entered === 2) release();
      await gate;
    }
  });
  seedSession(sessions, { role: 'member' });
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'member', active: true }]);
  const tokens = ['refresh-next-a', 'refresh-next-b'];
  const service = new AuthService({
    sessions, accounts, clock: { now: () => 100 },
    tokenIssuer: {
      issueRefreshToken: () => tokens.shift(),
      issueAccessToken: async () => 'access'
    }
  });
  const outcomes = await Promise.allSettled([
    service.refresh('refresh-old'),
    service.refresh('refresh-old')
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
});

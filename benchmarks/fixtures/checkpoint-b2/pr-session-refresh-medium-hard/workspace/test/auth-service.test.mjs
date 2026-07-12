import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore } from '../src/account-store.mjs';
import { SessionStore } from '../src/session-store.mjs';
import { AuthService } from '../src/auth-service.mjs';
import { hashRefreshToken } from '../src/tokens.mjs';

function issuer() {
  const refreshTokens = ['refresh-login', 'refresh-next'];
  return {
    issueRefreshToken: () => refreshTokens.shift(),
    issueSessionId: () => 'session-1',
    issueAccessToken: async ({ id, role }) => `access:${id}:${role}`
  };
}

test('login creates a session for an active account', async () => {
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'member', active: true }]);
  const sessions = new SessionStore();
  const service = new AuthService({ sessions, accounts, tokenIssuer: issuer(), clock: { now: () => 100 } });
  const result = await service.login('a1');
  assert.equal(result.accessToken, 'access:a1:member');
  assert.ok(sessions.getById('session-1'));
});

test('refresh returns a new pair and invalidates the old refresh token', async () => {
  const accounts = new AccountStore([{ id: 'a1', tenantId: 't1', role: 'member', active: true }]);
  const sessions = new SessionStore();
  sessions.create({
    id: 's1', accountId: 'a1', tenantId: 't1', role: 'member',
    refreshHash: hashRefreshToken('refresh-old'), expiresAt: 1_000
  });
  const service = new AuthService({ sessions, accounts, tokenIssuer: issuer(), clock: { now: () => 100 } });
  const result = await service.refresh('refresh-old');
  assert.equal(result.refreshToken, 'refresh-login');
  assert.equal(result.accessToken, 'access:a1:member');
  assert.equal(sessions.findByRefreshHash(hashRefreshToken('refresh-old')), null);
});

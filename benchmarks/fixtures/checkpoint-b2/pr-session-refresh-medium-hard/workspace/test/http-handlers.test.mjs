import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshHandler } from '../src/http-handlers.mjs';

test('refresh responses disable caching', async () => {
  const handler = createRefreshHandler({
    refresh: async () => ({ accessToken: 'a', refreshToken: 'r', expiresAt: 10 })
  });
  const response = await handler({ body: { refreshToken: 'refresh-ok' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
});

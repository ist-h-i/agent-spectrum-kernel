import { describe, expect, it } from 'vitest';

import { createProviderBoundary } from '../index.js';

describe('provider adapter bootstrap', () => {
  it('keeps token storage outside provider adapters', () => {
    expect(createProviderBoundary('local-git')).toMatchObject({
      kind: 'local-git',
      ownsNetworkMapping: true,
      ownsSecretStorage: false
    });
    expect(createProviderBoundary('github')).toMatchObject({
      kind: 'github',
      ownsNetworkMapping: true,
      ownsSecretStorage: false
    });
  });
});

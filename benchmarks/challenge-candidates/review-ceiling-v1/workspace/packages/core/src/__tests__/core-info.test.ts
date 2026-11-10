import { describe, expect, it } from 'vitest';

import { getReviewOpsCoreInfo } from '../index.js';

describe('ReviewOps core bootstrap', () => {
  it('declares a manual-only local core', () => {
    expect(getReviewOpsCoreInfo()).toEqual({
      name: 'ReviewOps Core',
      layer: 'core',
      aiExecution: 'manual-only'
    });
  });
});

import { describe, expect, it } from 'vitest';

import { collectPolicyViolations } from '../../scripts/policy-checker.mjs';

describe('AI network policy guard', () => {
  it('does not include AI SDK dependencies or known AI endpoints', async () => {
    await expect(collectPolicyViolations(process.cwd())).resolves.toEqual([]);
  });
});

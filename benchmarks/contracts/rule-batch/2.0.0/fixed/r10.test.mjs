import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';
import { registerLegacyTests } from './legacy-results.mjs';

for (const { id, requirements, run } of cases) {
  if (requirements.includes('r10')) test('r10/' + id, () => run(api));
}

registerLegacyTests(test, 'r10');

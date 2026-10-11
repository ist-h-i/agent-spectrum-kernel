import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';
import { registerLegacyTests } from './legacy-results.mjs';

for (const { id, requirements, run } of cases) {
  if (requirements.includes('r5')) test('r5/' + id, () => run(api));
}

registerLegacyTests(test, 'r5');

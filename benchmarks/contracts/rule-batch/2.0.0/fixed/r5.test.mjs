import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';

for (const { id, requirements, run } of cases) {
  if (requirements.includes('r5')) test('r5/' + id, () => run(api));
}

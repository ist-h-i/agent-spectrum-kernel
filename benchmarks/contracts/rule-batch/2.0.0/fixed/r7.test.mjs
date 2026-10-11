import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';

for (const { id, requirements, run } of cases) {
  if (requirements.includes('r7')) test('r7/' + id, () => run(api));
}

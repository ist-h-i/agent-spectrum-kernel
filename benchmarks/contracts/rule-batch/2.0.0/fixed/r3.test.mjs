import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';

for (const { id, requirements, run } of cases) {
  if (requirements.includes('r3')) test('r3/' + id, () => run(api));
}

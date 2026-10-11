import test from 'node:test';
import * as api from '../../src/index.mjs';
import { cases } from './cases.mjs';

for (const { id, run } of cases) test(`rule-batch@2.0.0/${id}`, () => run(api));

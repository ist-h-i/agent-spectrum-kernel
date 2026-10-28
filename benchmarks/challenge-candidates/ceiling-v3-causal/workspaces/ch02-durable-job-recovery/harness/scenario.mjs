import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeScenario } from './scenario-engine.mjs';
import { scenarioDigest, validateScenario } from './scenario-protocol.mjs';

const capabilities = JSON.parse(readFileSync(new URL('./scenario-capabilities.json', import.meta.url), 'utf8'));
let mode = { mode: 'local' };
try { mode = JSON.parse(readFileSync('.ceiling/scenario-mode.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }

// Same test/check executes locally and against replayed public observations.
// Extraction executes no check and loads no reference implementation.
export function scenarioTest(name, { program, check }) {
  if (typeof check !== 'function') throw new TypeError('scenario check function required');
  const validated = validateScenario(program, capabilities), id = scenarioDigest(validated);
  test(name, async context => {
    context.diagnostic('CEILING_SCENARIO ' + JSON.stringify({ version: 'ceiling-scenario-v1', id, program: validated }));
    if (mode.mode === 'extract') return;
    let observations;
    if (mode.mode === 'replay') {
      const record = mode.observations?.[id];
      if (!record || !['completed', 'implementation_failure'].includes(record.state)) throw new Error('reference observation unavailable');
      observations = record.observations;
      await check(observations);
      if (record.state === 'implementation_failure') assert.fail(`public API operation ${record.error?.operation ?? '?'} failed without a requested catch`);
      return;
    } else if (mode.mode === 'local') observations = await executeScenario(validated, capabilities);
    else throw new Error('unknown scenario mode');
    await check(observations);
  });
}

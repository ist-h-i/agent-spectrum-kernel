// Trusted reference-side adapter. Only validated scenario data enters this process.
// Submitted test JavaScript and its imports are never copied here.
import { readFileSync } from 'node:fs';
import { executeScenario } from './scenario-engine.mjs';
const request = JSON.parse(readFileSync(0, 'utf8'));
const capabilities = JSON.parse(readFileSync('harness/scenario-capabilities.json', 'utf8'));
try {
  const observations = await executeScenario(request.program, capabilities);
  process.stdout.write(JSON.stringify({ state: 'completed', observations, transportNonce: request.transportNonce }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ state: error.message?.startsWith('invalid scenario:') ? 'invalid_scenario' : error.ceilingPhase === 'load' ? 'service_load_error' : 'implementation_failure',
    observations: error.ceilingObservations ?? null,
    error: { name: error.name, code: error.code ?? null, phase: error.ceilingPhase ?? null, operation: error.ceilingOperationIndex ?? null }, transportNonce: request.transportNonce }) + '\n');
}

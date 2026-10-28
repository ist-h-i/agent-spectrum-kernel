// Trusted service-side launcher: JSON scenarios only, never submitted JavaScript.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const request = JSON.parse(readFileSync('.ceiling/scenario-service-request.json', 'utf8'));
const observations = {};
for (const item of request.scenarios) {
  const transportNonce = randomBytes(32).toString('hex');
  const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${process.cwd()}`, 'harness/scenario-worker.mjs'], {
    cwd: process.cwd(), input: JSON.stringify({ program: item.program, transportNonce }), encoding: 'utf8',
    timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
  });
  let value = null; try { value = JSON.parse(result.stdout); } catch {}
  observations[item.id] = result.status === 0 && !result.error && value?.transportNonce === transportNonce
    ? { state: value.state, observations: value.observations ?? null, error: value.error ?? null }
    : { state: 'service_failure', error: result.error?.code ?? result.signal ?? result.status };
}
process.stdout.write(JSON.stringify({ version: 'ceiling-scenario-service-v1', runtime: process.version, observations }) + '\n');

// Public transport adapter: inputs only; expectations remain with the controller.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const request = JSON.parse(readFileSync('.ceiling/request.json', 'utf8'));
const results = {};
for (const item of request.programs ?? []) {
  const transportNonce = randomBytes(32).toString('hex');
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=/work', '.ceiling/worker.mjs'], {
    cwd: '/work', input: JSON.stringify({ ...item.program, transportNonce }), encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
  });
  let output = null;
  try { output = JSON.parse(result.stdout); } catch {}
  if (output?.transportNonce !== transportNonce) output = null;
  const state = result.status === 0 && !result.error && output?.status === 'completed' ? 'completed'
    : ['candidate_error', 'candidate_load_error'].includes(output?.status) ? 'candidate_failure'
    : output?.status === 'evaluator_input_error' ? 'evaluator_input_error'
    : result.error?.code === 'ETIMEDOUT' ? 'candidate_timeout'
    : result.error ? 'execution_error' : 'candidate_exit_or_invalid_output';
  results[item.key] = { state, observations: output?.observations ?? null,
    status: result.status, signal: result.signal, error: result.error?.code ?? null };
}
let tests = null;
if (request.tests?.length) {
  const result = spawnSync(process.execPath, ['--permission', '--allow-child-process', '--allow-fs-read=/work',
    '--test', '--test-reporter=./.ceiling/reporter.mjs', ...request.tests], {
    cwd: '/work', encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
  });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch {}
  tests = { status: result.status, error: result.error?.code ?? null, report };
}
process.stdout.write(JSON.stringify({ version: 'ceiling-batch-v1', runtime: process.version, results, tests }) + '\n');

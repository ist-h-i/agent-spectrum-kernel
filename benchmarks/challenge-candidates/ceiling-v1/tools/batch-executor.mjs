// Public transport adapter: inputs only; expectations remain with the controller.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const request = JSON.parse(readFileSync('.ceiling/request.json', 'utf8'));
const results = {};
for (const item of request.programs ?? []) {
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=/work', '.ceiling/worker.mjs'], {
    cwd: '/work', input: JSON.stringify(item.program), encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
  });
  let output = null;
  try { output = JSON.parse(result.stdout); } catch {}
  results[item.key] = result.status === 0 && !result.error && output?.status === 'completed'
    ? { state: 'completed', observations: output.observations }
    : { state: 'execution_error', status: result.status, signal: result.signal, error: result.error?.code ?? null };
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

// Untrusted test-side launcher. This workspace contains no private implementation.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const request = JSON.parse(readFileSync('.ceiling/scenario-test-request.json', 'utf8'));
const result = spawnSync(process.execPath, ['--permission', '--allow-child-process', `--allow-fs-read=${process.cwd()}`,
  '--test', '--test-reporter=./harness/scenario-reporter.mjs', ...request.tests], {
  cwd: process.cwd(), encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
});
let report = null; try { report = JSON.parse(result.stdout); } catch {}
process.stdout.write(JSON.stringify({ version: 'ceiling-scenario-tests-v1', runtime: process.version,
  status: result.status, error: result.error?.code ?? null, report }) + '\n');

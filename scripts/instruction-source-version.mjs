import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { devNull } from 'node:os';

// Only a fresh, privately materialized instruction source is accepted by callers.
// No network, user hooks, signing agent or global Git configuration is involved.
export function commitInstructionSource(root,{contextDigest=null}={}) {
  if(contextDigest!==null)assert.match(contextDigest,/^sha256:[a-f0-9]{64}$/u);
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
  const git = args => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=' + devNull, '-c', 'commit.gpgsign=false',
      '-c', 'user.name=ASK local instructions', '-c', 'user.email=local-instructions@invalid', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 0, 'local instruction source version failed'); return r.stdout.trim();
  };
  git(['init', '--quiet', '--template=']); git(['add', '--all']); git(['commit', '--quiet', '-m', 'Materialized instruction candidate'+(contextDigest?'\n\nContext '+contextDigest:'')]);
  return git(['rev-parse', 'HEAD']);
}

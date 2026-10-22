import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { classifyChanges, observeChanges, parseNameStatus, FULL_TEST_JOBS } from './ci-change-shadow.mjs';

const sha = 'a'.repeat(40);
const evidence = changes => ({ base: sha, head: 'b'.repeat(40), merge_base: sha, complete: true, changes });
const modified = path => ({ status: 'M', path });

test('closed modified-doc allowlist proposes docs; actual mode is always full', () => {
  const r = classifyChanges(evidence([modified('docs/usage-ja.md'), modified('docs/prompt-recipes-ja.md')]));
  assert.equal(r.category, 'docs');
  assert.equal(r.actual_mode, 'full');
  assert.equal(r.selection_enabled, false);
  assert.deepEqual(r.proposed_test_jobs, ['independent-local-clone', 'common']);
  for (const status of ['A', 'D', 'R100', 'T']) assert.equal(classifyChanges(evidence([{ status, path: 'docs/usage-ja.md' }])).proposal, 'full');
});

test('Skill/core classify conservatively; unknown/shared/deps/CI and mixed scope are full', () => {
  for (const [path, category] of [['skills/risk-gate/SKILL.md', 'skill'], ['scripts/ask-local-eval.mjs', 'core'], ['AGENTS.md', 'shared'], ['package-lock.json', 'dependencies'], ['.github/workflows/validate.yml', 'ci'], ['docs/fixtures/input.json', 'shared'], ['docs/verification-proof-policy-contract.md', 'unknown'], ['novel/file', 'unknown']]) {
    const r = classifyChanges(evidence([modified(path)]));
    assert.equal(r.category, category, path);
    assert.equal(r.proposal, 'full', path);
    assert.deepEqual(r.proposed_test_jobs, FULL_TEST_JOBS);
  }
  for (const paths of [['skills/a/SKILL.md', 'skills/b/SKILL.md'], ['scripts/a.mjs', 'scripts/b.mjs'], ['docs/usage-ja.md', 'scripts/a.mjs']]) {
    assert.equal(classifyChanges(evidence(paths.map(modified))).proposal, 'full');
  }
});

test('bad evidence, base delta, empty/deleted/renamed/malformed paths never lighten', () => {
  for (const e of [null, {}, evidence([]), { ...evidence([modified('docs/usage-ja.md')]), complete: false }, { ...evidence([modified('docs/usage-ja.md')]), base: 'bad' }, { ...evidence([modified('docs/usage-ja.md')]), merge_base: 'c'.repeat(40) }]) assert.equal(classifyChanges(e).proposal, 'full');
  for (const path of ['../docs/usage-ja.md', '/docs/usage-ja.md', 'docs//usage-ja.md', 'docs/./usage-ja.md', 'docs/usage-ja.md\nforged', 'docs\\usage-ja.md']) assert.equal(classifyChanges(evidence([modified(path)])).proposal, 'full');
  assert.deepEqual(parseNameStatus('M\0docs/usage-ja.md\0'), [modified('docs/usage-ja.md')]);
  assert.deepEqual(parseNameStatus('R100\0old\0new\0'), [{ status: 'R100', path: 'new', previous_path: 'old' }]);
  for (const diff of ['M\0docs/usage-ja.md', 'M\0', 'R100\0old\0', 'Z\0file\0', 'M\0a\0M\0a\0']) assert.throws(() => parseNameStatus(diff));
});

test('real Git uses event base/head merge-base, catches base drift and Git failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'ask-ci-shadow-'));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
    writeFileSync(join(root, 'doc'), 'base'); git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'doc'), 'head'); git('commit', '-qam', 'head'); const head = git('rev-parse', 'HEAD');
    const event = { pull_request: { base: { sha: base }, head: { sha: head } } };
    const observed = observeChanges({ event, cwd: root });
    assert.equal(observed.complete, true); assert.equal(observed.merge_base, base); assert.deepEqual(observed.changes, [modified('doc')]);
    assert.equal(observeChanges({ event: { pull_request: { base: { sha: 'c'.repeat(40) }, head: { sha: head } } }, cwd: root }).complete, false);
    git('checkout', '--detach', base); writeFileSync(join(root, 'other'), 'base drift'); git('add', '.'); git('commit', '-qm', 'base drift');
    const drift = observeChanges({ event: { pull_request: { base: { sha: git('rev-parse', 'HEAD') }, head: { sha: head } } }, cwd: root });
    assert.equal(classifyChanges(drift).proposal, 'full');
    assert.ok(classifyChanges(drift).reasons.includes('base_delta'));
    assert.equal(observeChanges({ event: {}, cwd: root }).complete, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('shadow recording is unconditional and never controls full-run/aggregate execution', () => {
  const workflow = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node scripts\/ci-change-shadow\.mjs/);
  assert.ok(!/needs[^\n]*shadow|if:[^\n]*(?:proposal|classif|shadow)|fromJSON/.test(workflow));
  assert.match(workflow, /needs: \[plan, independent-local-clone, docs-checks, common, repository-tests, personal-cli\]/);
});

test('historical regression paths retain their full detection owners in shadow proposals', () => {
  // #434's actual stale-Node guard failure and the existing OS/security boundary
  // regressions must never become reasons to omit their full-run owners.
  for (const paths of [['.github/workflows/validate.yml', 'scripts/test-ask-autonomous-development.mjs'], ['scripts/ask-local-codex.mjs'], ['scripts/ask-user-comparison-unattended.mjs'], ['schemas/verification-proof-policy.schema.json'], ['skills/risk-gate/SKILL.md']]) {
    assert.deepEqual(classifyChanges(evidence(paths.map(modified))).proposed_test_jobs, FULL_TEST_JOBS);
  }
});

test('CLI records full fallback and a persistent summary on unavailable event', () => {
  const root = mkdtempSync(join(tmpdir(), 'ask-ci-shadow-cli-'));
  try {
    const summary = join(root, 'summary');
    const r = spawnSync(process.execPath, [new URL('./ci-change-shadow.mjs', import.meta.url).pathname], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: join(root, 'absent'), GITHUB_STEP_SUMMARY: summary } });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.proposal, 'full'); assert.equal(report.actual_mode, 'full'); assert.equal(report.selection_enabled, false);
    assert.match(readFileSync(summary, 'utf8'), /actual execution: full/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

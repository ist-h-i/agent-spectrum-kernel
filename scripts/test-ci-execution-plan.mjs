import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORKERS, parseRegistry, createShadowPlan, createReceipt, verifyShadowGate, verifyHypotheticalGate, captureContext } from './ci-execution-plan.mjs';

const sha = digit => digit.repeat(40);
const workflow = 'jobs:\n' + WORKERS.map(id => `  ${id}:\n    steps:\n      - name: Check\n        id: check\n        run: node scripts/check-${id}.mjs\n      - name: Receipt\n        id: ci_receipt\n        run: node scripts/ci-execution-plan.mjs receipt\n`).join('');
const registry = parseRegistry(workflow);
const context = () => ({ observation: { base: sha('a'), head: sha('b'), merge_base: sha('a'), checkout_head: sha('c'), checkout_tree: sha('d'), complete: true, changes: [{ status: 'M', path: 'docs/usage-ja.md' }] }, identity: { checkout_head: sha('c'), checkout_tree: sha('d'), parents: [sha('a'), sha('b')], run_id: '1', run_attempt: '1', node: 'v24.19.0', platform: 'linux', worktree_clean: true }, doc_files: [{ path: 'docs/usage-ja.md', base_mode: '100644', head_mode: '100644', checkout_matches: true }] });
function fixture(input = context()) {
  const plan = createShadowPlan(input, registry);
  const needs = { plan: { result: 'success', outputs: { plan: JSON.stringify(plan) } } };
  for (const id of WORKERS) needs[id] = { result: 'success', outputs: { receipt: JSON.stringify(createReceipt(id, { check: { outcome: 'success', conclusion: 'success' } }, input.identity, registry)) } };
  return { needs, context: input, registry };
}

test('closed plan always selects every actual worker; docs selection is hypothetical only', () => {
  const input = context(), plan = createShadowPlan(input, registry);
  assert.equal(plan.mode, 'shadow'); assert.equal(plan.selection_enabled, false);
  assert.equal(plan.proposal, 'docs-v1'); assert.deepEqual(plan.required_jobs, WORKERS);
  assert.deepEqual(plan.proposed_jobs, ['independent-local-clone', 'docs-checks']);
  assert.doesNotThrow(() => verifyShadowGate(fixture()));
  for (const status of ['failure', 'skipped', 'cancelled', '', null]) for (const id of ['plan', ...WORKERS]) {
    const f = fixture(); f.needs[id].result = status; assert.throws(() => verifyShadowGate(f), undefined, `${id}:${status}`);
  }
  for (const id of ['plan', ...WORKERS]) { const f = fixture(); delete f.needs[id]; assert.throws(() => verifyShadowGate(f)); }
});

test('hypothetical non-selection accepts only explicit skipped entries; actual gate rejects them', () => {
  const f = fixture();
  for (const id of ['common', 'repository-tests', 'personal-cli']) f.needs[id] = { result: 'skipped', outputs: {} };
  assert.doesNotThrow(() => verifyHypotheticalGate(f)); assert.throws(() => verifyShadowGate(f));
  for (const state of ['failure', 'cancelled', 'success', null]) {
    const bad = structuredClone(f); bad.needs.common.result = state; assert.throws(() => verifyHypotheticalGate(bad));
  }
  delete f.needs.common; assert.throws(() => verifyHypotheticalGate(f));
});

test('strict plan rejects missing, extra, tampered or stale identities and never enables selection', () => {
  for (const mutate of [p => p.selection_enabled = true, p => p.required_jobs.pop(), p => p.extra = true, p => p.proposal = 'unknown', p => p.policy_digest = 'sha256:' + '0'.repeat(64), p => p.binding.checkout_head = sha('e')]) {
    const f = fixture(), p = JSON.parse(f.needs.plan.outputs.plan); mutate(p); f.needs.plan.outputs.plan = JSON.stringify(p); assert.throws(() => verifyShadowGate(f));
  }
  for (const value of ['', 'null', '{}', '{']) { const f = fixture(); f.needs.plan.outputs.plan = value; assert.throws(() => verifyShadowGate(f)); }
  const f = fixture(); f.needs.extra = { result: 'success' }; assert.throws(() => verifyShadowGate(f));
});

test('receipt binds exact step descriptors and outcomes, not counts or a final marker', () => {
  for (const value of [undefined, {}, { check: { outcome: 'skipped', conclusion: 'success' } }, { check: { outcome: 'failure', conclusion: 'success' } }]) assert.throws(() => createReceipt('common', value, context().identity, registry));
  for (const mutate of [r => r.completed = [], r => r.completed[0].digest = 'sha256:' + '0'.repeat(64), r => r.completed[0].id = 'another', r => r.binding.run_attempt = '2', r => r.extra = true]) {
    const f = fixture(), r = JSON.parse(f.needs.common.outputs.receipt); mutate(r); f.needs.common.outputs.receipt = JSON.stringify(r); assert.throws(() => verifyShadowGate(f));
  }
  const f = fixture(); delete f.needs.common.outputs.receipt; assert.throws(() => verifyShadowGate(f));
});

test('unverified checkout/base/type, shared/core/CI, deletion and unknown observations propose full', () => {
  for (const mutate of [c => c.observation.complete = false, c => c.observation.base = sha('f'), c => c.identity.parents = [sha('f'), sha('b')], c => c.doc_files[0].head_mode = '120000', c => c.doc_files[0].checkout_matches = false, c => c.doc_files = [], c => c.observation.changes[0].status = 'D', c => c.observation.changes[0].path = '.github/workflows/validate.yml', c => c.observation.changes[0].path = 'skills/a/SKILL.md', c => c.observation.changes[0].path = 'scripts/a.mjs']) {
    const c = context(); mutate(c); assert.equal(createShadowPlan(c, registry).proposal, 'full');
    assert.doesNotThrow(() => verifyShadowGate(fixture(c)));
  }
});

test('registry rejects conditional or unidentified required execution and changes on argv/cwd/source drift', () => {
  for (const text of [workflow.replace('id: check', 'id: ci_receipt'), workflow.replace('id: check', 'if: false'), workflow.replace('id: check', 'id: check\n        if: false')]) assert.throws(() => parseRegistry(text));
  for (const text of [workflow.replace('node scripts/check-common.mjs', 'node --test scripts/check-common.mjs'), workflow.replace('run: node scripts/check-common.mjs', 'working-directory: other\n        run: node scripts/check-common.mjs'), workflow.replace('run: node scripts/check-common.mjs', 'run: |\n          git fetch --no-tags origin ' + sha('f') + '\n          node scripts/check-common.mjs')]) assert.notEqual(parseRegistry(text).digest, registry.digest);
});

test('real Git manual/failed observation stays full and capture is read-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'ask-plan-'));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'ci@example.invalid'); writeFileSync(join(root, 'file'), 'data'); git('add', '.'); git('commit', '-qm', 'initial');
    const before = git('status', '--porcelain'); const c = captureContext({ cwd: root, event: {}, env: {} });
    assert.equal(createShadowPlan(c, registry).proposal, 'full'); assert.equal(git('status', '--porcelain'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('workflow retains full execution and other workflows at the inspected main', () => {
  const text = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
  assert.match(text, /  docs-checks:/); assert.match(text, /  plan:/);
  assert.ok(!/if:[^\n]*(?:proposal|proposed|docs-v1)|cancel-in-progress:|paths-ignore:/.test(text));
  assert.match(text, /needs: \[plan, independent-local-clone, docs-checks, common, repository-tests, personal-cli\]/);
  assert.equal(Object.keys(parseRegistry(text).jobs).length, 5);
});

// Historical evidence only: execution authority remains the current workflow.
test('all baseline run blocks, cwd and source fetches survive the job split byte-for-byte', () => {
  const baseline = JSON.parse(readFileSync(new URL('../docs/fixtures/ci-full-run-step-inventory.json', import.meta.url)));
  const text = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
  const current = Object.values(parseRegistry(text).jobs).flatMap(job => job.steps);
  // The failure-only diagnostic remains outside required successful completion.
  const diagnostic = text.match(/        if: \$\{\{ failure\(\).*?\n        run: \|\n((?:          .*\n|\n)*)/);
  assert.ok(diagnostic);
  current.push({ run: diagnostic[1].replace(/^          /gm, '').trimEnd(), cwd: '.' });
  const hash = value => createHash('sha256').update(value).digest('hex');
  for (const step of baseline.steps) assert.equal(current.filter(s => hash(s.run) === step.run_sha256 && s.cwd === step.cwd).length, 1, step.name);
});

test('unsupported valid YAML execution syntax cannot disappear from the registry', () => {
  for (const text of [workflow.replace('      - name: Check\n        id: check\n        run: node scripts/check-common.mjs', '      - run: node scripts/check-common.mjs\n        id: check'), workflow.replace('run: node scripts/check-common.mjs', 'run: >\n          node scripts/check-common.mjs'), workflow.replace('run: node scripts/check-common.mjs', 'shell: bash\n        run: node scripts/check-common.mjs'), workflow.replace('  common:\n', '  common:\n    defaults:\n      run:\n        working-directory: other\n')]) assert.throws(() => parseRegistry(text));
});

test('CLI round trip transports bound plans and receipts and rejects invalid gate input', () => {
  const root = mkdtempSync(join(tmpdir(), 'ask-plan-cli-'));
  for (const directory of ['scripts', '.github/workflows']) mkdirSync(join(root, directory), { recursive: true });
  for (const file of ['scripts/ci-execution-plan.mjs', 'scripts/ci-change-shadow.mjs', '.github/workflows/validate.yml']) copyFileSync(new URL('../' + file, import.meta.url), join(root, file));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'ci@example.invalid'); git('add', '.'); git('commit', '-qm', 'fixture');
  try {
  const script = join(root, 'scripts/ci-execution-plan.mjs');
  const current = parseRegistry(readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8'));
  const invoke = (action, extra = {}) => spawnSync(process.execPath, [script, action], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: '/nonexistent/ask-fixture-event', GITHUB_OUTPUT: '', ...extra } });
  const plan = invoke('plan'); assert.equal(plan.status, 0, plan.stderr); assert.equal(JSON.parse(plan.stdout).selection_enabled, false);
  const needs = { plan: { result: 'success', outputs: { plan: plan.stdout.trim() } } };
  for (const id of WORKERS) {
    const steps = Object.fromEntries(current.jobs[id].steps.map(({ id }) => [id, { outcome: 'success', conclusion: 'success' }]));
    const receipt = invoke('receipt', { CI_RECEIPT_JOB: id, CI_STEP_RESULTS: JSON.stringify(steps) });
    assert.equal(receipt.status, 0, receipt.stderr);
    needs[id] = { result: 'success', outputs: { receipt: receipt.stdout.trim() } };
  }
  const gate = invoke('gate', { CI_NEEDS: JSON.stringify(needs) }); assert.equal(gate.status, 0, gate.stderr);
  needs.common.result = 'skipped'; assert.equal(invoke('gate', { CI_NEEDS: JSON.stringify(needs) }).status, 1);
  assert.equal(invoke('--selective').status, 1);
  writeFileSync(join(root, 'scripts/ci-change-shadow.mjs'), '// dirty tracked input');
  assert.equal(invoke('receipt', { CI_RECEIPT_JOB: 'common', CI_STEP_RESULTS: '{}' }).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('global shell/env and unregistered action execution are rejected', () => {
  for (const text of ['defaults:\n  run:\n    shell: bash {0}\n' + workflow, 'env:\n  NODE_OPTIONS: other\n' + workflow, workflow.replace('    steps:', '    steps:\n      - name: Hidden action\n        id: hidden\n        if: false\n        uses: ./custom-action')]) assert.throws(() => parseRegistry(text));
  const setup = workflow.replace('    steps:', '    steps:\n      - uses: actions/setup-node@v5\n        with:\n          node-version: "24.19.0"');
  assert.notEqual(parseRegistry(setup).digest, parseRegistry(setup.replace('24.19.0', '24.18.0')).digest);
});

test('real merge checkout must match candidate bytes; dirty tracked inputs reject receipts', () => {
  const root = mkdtempSync(join(tmpdir(), 'ask-plan-doc-'));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/usage-ja.md'), 'before');
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'ci@example.invalid'); git('add', '.'); git('commit', '-qm', 'base');
    const branch = git('branch', '--show-current'), base = git('rev-parse', 'HEAD');
    git('checkout', '-qb', 'fixture'); writeFileSync(join(root, 'docs/usage-ja.md'), 'after'); git('commit', '-am', 'head'); const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', branch); git('merge', '--no-ff', '-m', 'merge', 'fixture');
    const event = { pull_request: { base: { sha: base }, head: { sha: head } } };
    assert.equal(createShadowPlan(captureContext({ cwd: root, event, env: {} }), registry).proposal, 'docs-v1');
    writeFileSync(join(root, 'docs/usage-ja.md'), 'dirty');
    const dirty = captureContext({ cwd: root, event, env: {} });
    assert.equal(dirty.identity.worktree_clean, false); assert.equal(dirty.doc_files[0].checkout_matches, false);
    assert.equal(createShadowPlan(dirty, registry).proposal, 'full');
    assert.throws(() => createReceipt('common', { check: { outcome: 'success', conclusion: 'success' } }, dirty.identity, registry));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

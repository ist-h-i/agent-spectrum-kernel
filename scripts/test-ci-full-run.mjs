import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const validate = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
const local = readFileSync(new URL('../.github/workflows/local-eval.yml', import.meta.url), 'utf8');
const baseline = JSON.parse(readFileSync(new URL('../docs/fixtures/ci-full-run-inventory.json', import.meta.url)));
const lifetimeCommand = 'node --test scripts/test-ask-primary-performance-execution.mjs scripts/test-ask-primary-performance-lifetime.mjs';
const commands = text => text.split('\n').map(line => line.trim().replace(/^run: /, '')).filter(line => /^node (?:--\S+ )*scripts\//.test(line)).sort();

test('all original validate commands remain, including flags and frozen sources', () => {
  const additions = [lifetimeCommand, 'node --test scripts/test-ci-full-run.mjs', 'node --test scripts/test-ci-change-shadow.mjs', 'node scripts/ci-change-shadow.mjs', 'node --test scripts/test-ask-personal-evolution-trace.mjs', 'node --test scripts/test-codex-metrics-collector.mjs'];
  for (const command of additions) assert.equal(commands(validate).filter(c => c === command).length, 1, command);
  assert.deepEqual(commands(validate).filter(c => !additions.includes(c)), baseline.validate_commands);
  assert.match(validate, /git fetch --no-tags origin a06e96f8/);
});

test('original coverage remains except two audited Mac-only fake logic files, with three Mac omissions explicitly owned on Ubuntu', () => {
  const expand = list => list.flatMap(command => {
    if (!command.startsWith('node --test ') && !command.startsWith('node --experimental-test-module-mocks --test ')) return [command];
    const offset = command.indexOf('scripts/');
    return command.slice(offset).split(' ').map(file => command.slice(0, offset) + file);
  }).sort();
  const moved = ['scripts/test-ask-primary-build-successor-v2.mjs', 'scripts/test-ask-personal-evolution-unattended-policy.mjs'];
  assert.equal(commands(local).filter(command => command === lifetimeCommand).length, 1);
  assert.deepEqual(expand(commands(local).filter(command => command !== lifetimeCommand)), expand(baseline.local_commands).filter(command => !moved.some(file => command.endsWith(file))));
  for (const file of moved) assert.ok(commands(validate).some(command => command.split(' ').includes(file)), file);
  assert.match(local, /if: matrix.os == 'ubuntu-24.04'\n        run: node --test scripts\/test-kernel-principles.mjs/);
  assert.equal(local.match(/^\s+if:/gm).length, 6, 'only the explicit additional Mac lifetime owner is conditional');
  const macCommands = local.split(/\n      - /).filter(step => !step.includes("if: matrix.os == 'ubuntu-24.04'")).flatMap(commands);
  const macOmissions = [...moved, 'scripts/test-kernel-principles.mjs'];
  assert.deepEqual(expand(macCommands.filter(command => command !== lifetimeCommand)), expand(baseline.local_commands).filter(command => !macOmissions.some(file => command.endsWith(file))), 'all other Mac file/flag coverage retained');
  const conditional = [...local.matchAll(/        if: matrix.os == 'macos-15'\n        run: (.+)/g)].map(m => m[1]);
  assert.equal(conditional.length, 5);
  assert.ok(conditional.includes(lifetimeCommand));
  const files = conditional.flatMap(command => command.match(/scripts\/[^ ]+\.mjs/g));
  assert.equal(files.length, 11);
  for (const file of files) {
    const source = commands(validate).find(command => command.split(' ').includes(file));
    const removed = conditional.find(command => command.split(' ').includes(file));
    assert.ok(source, file);
    assert.equal(source.slice(0, source.indexOf('scripts/')), removed.slice(0, removed.indexOf('scripts/')), file);
  }
  for (const text of [validate, local]) {
    assert.ok(!/node-version: (?:24|"24")\s/.test(text));
    assert.ok(!text.includes('ubuntu-latest'));
    assert.match(text, /24\.19\.0/);
    assert.ok(!/continue-on-error:|cancel-in-progress:|paths-ignore:/.test(text));
  }
});

test('fixed aggregate rejects failure, skip, cancel, missing and malformed results', () => {
  assert.match(validate, /  validate:\n    if: \$\{\{ always\(\) \}\}/);
  assert.match(validate, /needs: \[independent-local-clone, common, repository-tests, personal-cli\]/);
  const code = validate.split("node <<'NODE'\n").at(-1).split('\n          NODE')[0];
  const ids = ['independent-local-clone', 'common', 'repository-tests', 'personal-cli'];
  const valid = Object.fromEntries(ids.map(id => [id, { result: 'success' }]));
  const check = value => spawnSync(process.execPath, ['-e', code], { env: { ...process.env, RESULTS: JSON.stringify(value) } }).status;
  assert.equal(check(valid), 0);
  for (const id of ids) {
    for (const result of ['failure', 'skipped', 'cancelled', null, '']) assert.equal(check({ ...valid, [id]: { result } }), 1);
    const missing = { ...valid }; delete missing[id]; assert.equal(check(missing), 1);
  }
  assert.equal(check({ ...valid, unexpected: { result: 'success' } }), 1);
  assert.notEqual(check(null), 0);
});

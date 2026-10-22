import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const validate = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
const local = readFileSync(new URL('../.github/workflows/local-eval.yml', import.meta.url), 'utf8');
const baseline = JSON.parse(readFileSync(new URL('../docs/fixtures/ci-full-run-inventory.json', import.meta.url)));
const commands = text => text.split('\n').map(line => line.trim().replace(/^run: /, '')).filter(line => /^node (?:--\S+ )*scripts\//.test(line)).sort();

test('all original validate commands remain, including flags and frozen sources', () => {
  assert.deepEqual(commands(validate).filter(c => c !== 'node --test scripts/test-ci-full-run.mjs'), baseline.validate_commands);
  assert.match(validate, /git fetch --no-tags origin a06e96f8/);
});

test('Mac runs every original local-eval command; only 11 exact Ubuntu duplicates move', () => {
  const expand = list => list.flatMap(command => {
    if (!command.startsWith('node --test ') && !command.startsWith('node --experimental-test-module-mocks --test ')) return [command];
    const offset = command.indexOf('scripts/');
    return command.slice(offset).split(' ').map(file => command.slice(0, offset) + file);
  }).sort();
  assert.deepEqual(expand(commands(local)), expand(baseline.local_commands));
  const conditional = [...local.matchAll(/        if: matrix.os == 'macos-15'\n        run: (.+)/g)].map(m => m[1]);
  assert.equal(conditional.length, 4);
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

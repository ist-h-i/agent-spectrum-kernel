import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRegistry, requireSuccessfulJobs } from './ci-execution-plan.mjs';
import test from 'node:test';

const validate = readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
const local = readFileSync(new URL('../.github/workflows/local-eval.yml', import.meta.url), 'utf8');
const rollover = readFileSync(new URL('../.github/workflows/context-rollover.yml', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../.github/workflows/verification-completion.yml', import.meta.url), 'utf8');
const baseline = JSON.parse(readFileSync(new URL('../docs/fixtures/ci-full-run-inventory.json', import.meta.url)));
const lifetimeCommand = 'node --test scripts/test-ask-primary-performance-execution.mjs scripts/test-ask-primary-performance-lifetime.mjs';
const publicSandboxFile = 'scripts/test-ask-user-comparison-public-sandbox.mjs';
const manualComparisonCommand = 'node --test scripts/test-ask-primary-evaluation-start.mjs scripts/test-ask-primary-nine-condition-report.mjs';
const commands = text => text.split('\n').map(line => line.trim().replace(/^run: /, '')).filter(line => /^node (?:--\S+ )*scripts\//.test(line)).sort();

test('all original validate commands remain, including flags and frozen sources', () => {
  const additions = [lifetimeCommand, manualComparisonCommand, 'node --test scripts/test-sufficient-change-scope-fixtures.mjs', 'node --test scripts/test-ci-full-run.mjs', 'node --test scripts/test-ci-change-shadow.mjs', 'node scripts/ci-change-shadow.mjs', 'node --test scripts/test-ask-personal-evolution-trace.mjs', 'node --test scripts/test-codex-metrics-collector.mjs', 'node --test scripts/test-ci-execution-plan.mjs', 'node scripts/ci-execution-plan.mjs plan', 'node scripts/ci-execution-plan.mjs gate', 'node scripts/ci-execution-plan.mjs receipt'];
  for (const command of additions) assert.equal(commands(validate).filter(c => c === command).length, command.endsWith(' receipt') ? 5 : 1, command);
  assert.deepEqual(commands(validate).filter(c => !additions.includes(c)), baseline.validate_commands);
  assert.match(validate, /git fetch --no-tags origin a06e96f8/);
});

test('manual start and saved-report tests have one unconditional common owner without new jobs', () => {
  const registry = parseRegistry(validate), owners = Object.entries(registry.jobs).flatMap(([job, value]) =>
    value.steps.filter(step => step.run === manualComparisonCommand).map(step => job));
  assert.deepEqual(owners, ['common']);
  for (const file of ['scripts/test-ask-primary-evaluation-start.mjs', 'scripts/test-ask-primary-nine-condition-report.mjs']) {
    assert.equal(commands(validate).filter(command => command.split(' ').includes(file)).length, 1);
    for (const other of [local, rollover, completion]) assert.ok(!other.includes(file), 'no cross-workflow duplicate');
  }
  assert.deepEqual(Object.keys(registry.jobs).sort(), ['independent-local-clone', 'docs-checks', 'common', 'repository-tests', 'personal-cli'].sort());
});

test('original coverage remains except two audited Mac-only fake logic files, with three Mac omissions explicitly owned on Ubuntu', () => {
  const expand = list => list.flatMap(command => {
    if (!command.startsWith('node --test ') && !command.startsWith('node --experimental-test-module-mocks --test ')) return [command];
    const offset = command.indexOf('scripts/');
    return command.slice(offset).split(' ').map(file => command.slice(0, offset) + file);
  }).sort();
  const moved = ['scripts/test-ask-primary-build-successor-v2.mjs', 'scripts/test-ask-personal-evolution-unattended-policy.mjs'];
  assert.equal(commands(local).filter(command => command === lifetimeCommand).length, 1);
  assert.deepEqual(expand(commands(local).filter(command => command !== lifetimeCommand)).filter(command => !command.endsWith(publicSandboxFile)), expand(baseline.local_commands).filter(command => !moved.some(file => command.endsWith(file))));
  for (const file of moved) assert.ok(commands(validate).some(command => command.split(' ').includes(file)), file);
  assert.match(local, /if: matrix.os == 'ubuntu-24.04'\n        run: node --test scripts\/test-kernel-principles.mjs/);
  assert.equal(local.match(/^\s+if:/gm).length, 6, 'only the explicit additional Mac lifetime owner is conditional');
  const macCommands = local.split(/\n      - /).filter(step => !step.includes("if: matrix.os == 'ubuntu-24.04'")).flatMap(commands);
  const macOmissions = [...moved, 'scripts/test-kernel-principles.mjs'];
  assert.deepEqual(expand(macCommands.filter(command => command !== lifetimeCommand)).filter(command => !command.endsWith(publicSandboxFile)), expand(baseline.local_commands).filter(command => !macOmissions.some(file => command.endsWith(file))), 'all other Mac file/flag coverage retained');
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
  assert.match(validate, /needs: \[plan, independent-local-clone, docs-checks, common, repository-tests, personal-cli\]/);
  const ids = ['plan', 'independent-local-clone', 'docs-checks', 'common', 'repository-tests', 'personal-cli'];
  const valid = Object.fromEntries(ids.map(id => [id, { result: 'success' }]));
  const check = value => { try { requireSuccessfulJobs(value, ids); return 0; } catch { return 1; } };
  assert.equal(check(valid), 0);
  for (const id of ids) {
    for (const result of ['failure', 'skipped', 'cancelled', null, '']) assert.equal(check({ ...valid, [id]: { result } }), 1);
    const missing = { ...valid }; delete missing[id]; assert.equal(check(missing), 1);
  }
  assert.equal(check({ ...valid, unexpected: { result: 'success' } }), 1);
  assert.notEqual(check(null), 0);
});

test('cross-workflow duplicates have one pinned, unconditional owner and unique suites remain', () => {
  const shared = ['session-checkpoint', 'epic-admission-work-package-plan', 'json-schema-validation', 'verification-evidence', 'verification-scoped-reuse'].map(name => `node scripts/test-${name}.mjs`);
  const completionCommand = 'node --test scripts/test-verification-reuse-completion.mjs';
  const retainedCompletion = [
    'node scripts/validate-repo.mjs --write-report',
    'node --test scripts/test-verification-reuse-measurement-core.mjs scripts/test-verification-reuse-false-blocking.mjs',
    'node --test scripts/test-verification-reuse-measurement.mjs',
    'node scripts/verification-reuse-measurement.mjs --provider fixture --repetitions 2 --output "$RUNNER_TEMP/verification-reuse-measurement" > /dev/null',
    'node --test scripts/test-verification-decision-core.mjs', completionCommand,
  ].sort();
  const check = (main, context, verification) => {
    const common = parseRegistry(main).jobs.common.steps.flatMap(step => commands(step.run));
    for (const command of shared) assert.equal(common.filter(value => value === command).length, 1, command);
    assert.equal(commands(main).filter(command => command === completionCommand).length, 0);
    assert.deepEqual(commands(context), ['node --test scripts/test-context-rollover.mjs', 'node scripts/validate-repo.mjs'].sort());
    assert.deepEqual(commands(verification), retainedCompletion);
    assert.match(context, /jobs:\n  context-rollover:\n/);
    assert.match(verification, /jobs:\n  verification-completion:\n/);
    for (const text of [context, verification]) {
      assert.match(text, /on:\n  pull_request:/);
      assert.match(text, /    runs-on: ubuntu-24\.04\n/);
      assert.match(text, /          node-version: "24\.19\.0"\n/);
      assert.match(text, /uses: actions\/checkout@v5\n        with:\n          fetch-depth: 0\n/);
      assert.ok(!/ubuntu-latest|node-version: "24"|(?:^|\n)\s+(?:env|defaults|working-directory|ref|continue-on-error|needs):|paths(?:-ignore)?:|cancel-in-progress:/.test(text));
      assert.match(text, /run: git diff --check "origin\/\$\{\{ github.base_ref \}\}\.\.\.HEAD"/);
    }
    assert.ok(!/^\s+if:/m.test(context));
    assert.deepEqual(verification.match(/^\s+if:.*$/gm)?.map(line => line.trim()), ['if: always()']);
    assert.match(verification, /if node scripts\/validate-repo.mjs; then\n            exit 0\n          fi\n          node scripts\/validate-repo.mjs --write-report\n          git diff -- docs\/validation-report.md\n          exit 1/);
    assert.match(verification, /uses: actions\/upload-artifact@v4\n        with:\n          name: verification-reuse-measurement\n          path: \$\{\{ runner.temp \}\}\/verification-reuse-measurement\/\*\.json\n          if-no-files-found: ignore\n          retention-days: 14/);
    assert.match(verification, /head:process.env.GITHUB_SHA,baseline:r.baseline,reuse:r.reuse,delta:r.delta,complete:r.complete,issue_decision:r.issue_decision/);
    assert.match(main, /needs: \[plan, independent-local-clone, docs-checks, common, repository-tests, personal-cli\]/);
  };
  check(validate, rollover, completion);
  // Cheap negative fixtures: a removed owner, flag drift, restored duplicate,
  // floating runtime, cwd change, skipped owner or lost artifact must fail.
  for (const command of shared) assert.throws(() => check(validate.replace(command, command.replace('node ', 'node --test ')), rollover, completion));
  assert.throws(() => check(validate, rollover + '\n      - name: Restored duplicate\n        run: ' + shared[0] + '\n', completion));
  assert.throws(() => check(validate, rollover.replace('ubuntu-24.04', 'ubuntu-latest'), completion));
  assert.throws(() => check(validate, rollover, completion.replace('24.19.0', '24')));
  assert.throws(() => check(validate, rollover, completion.replace(completionCommand, completionCommand.replace('--test ', ''))));
  assert.throws(() => check(validate, rollover.replace('node --test scripts/test-context-rollover.mjs', ''), completion));
  assert.throws(() => check(validate, rollover, completion.replace('node --test scripts/test-verification-decision-core.mjs', '')));
  assert.throws(() => check(validate, rollover, completion.replace('    steps:', '    defaults:\n      run:\n        working-directory: elsewhere\n    steps:')));
  assert.throws(() => check(validate, rollover, completion.replace('        run: ' + completionCommand, '        if: false\n        run: ' + completionCommand)));
  assert.throws(() => check(validate, rollover, completion.replace('retention-days: 14', 'retention-days: 1')));
});


test('public sandbox artificial requests reuse the existing OS matrix step exactly once', () => {
  assert.equal(commands(local).filter(command => command.split(' ').includes(publicSandboxFile)).length, 1);
  for (const workflow of [validate, rollover, completion]) assert.ok(!workflow.includes(publicSandboxFile));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_PATH, checkRuleBatchBundle, digest, materializeRuleBatchBundle,
  prepareRuleBatchComparison, verifyRuleBatchMaterialization } from './ask-rule-batch-bundle.mjs';
import { inspectUserComparison, reportUserComparison } from './ask-user-comparison.mjs';
import { cases } from '../benchmarks/contracts/rule-batch/2.0.0/fixed/cases.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = 'benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard';
const temp = t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-rule-batch-bundle-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const child = (bin, args, cwd) => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stderr || r.stdout); return r.stdout.trim();
};
const git = (cwd, args) => child('git', ['-c', `core.hooksPath=${devNull}`, ...args], cwd);
function commitSource(source) {
  git(source, ['add', '--all']);
  git(source, ['-c', 'user.name=ASK bundle test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'test source']);
  return git(source, ['rev-parse', 'HEAD']);
}

test('closed bundle and requirement trace are internally consistent', () => {
  const checked = checkRuleBatchBundle();
  const requirements = JSON.parse(checked.assets.get(`${BUNDLE_PATH}/requirements.json`)).requirements;
  assert.deepEqual(requirements.map(r => r.id), Array.from({ length: 10 }, (_, i) => `r${i + 1}`));
  for (const r of requirements) {
    for (const field of ['original_requirement', 'criterion', 'inputs', 'expected_result', 'error', 'state_invariant', 'limits']) assert.ok(r[field]);
    assert.ok(r.cases.length > 0);
    assert.deepEqual(r.cases, cases.filter(c => c.requirements.includes(r.id)).map(c => c.id));
  }
  const historical = JSON.parse(checked.assets.get(`${BUNDLE_PATH}/history.json`));
  assert.equal(historical.original_run_id, 'f37390c0-c168-406d-8823-b02b9e09154d');
  assert.equal(historical.original_overall_exit_code, 7);
  assert.equal(historical.retrospective_v2_evaluation, 'NOT_RUN');
});

test('drift, absent/extra assets, unsafe manifest paths and missing external pins fail closed', t => {
  const root = temp(t);
  cpSync(join(ROOT, BUNDLE_PATH), join(root, BUNDLE_PATH), { recursive: true });
  cpSync(join(ROOT, ORIGINAL), join(root, ORIGINAL), { recursive: true });
  const checked = checkRuleBatchBundle(undefined, root);
  const asset = join(root, BUNDLE_PATH, 'spec.md'), before = readFileSync(asset);
  writeFileSync(asset, Buffer.concat([before, Buffer.from('drift')]));
  assert.throws(() => checkRuleBatchBundle(checked.bundleDigest, root), /asset_digest_mismatch/);
  writeFileSync(asset, before);
  writeFileSync(join(root, BUNDLE_PATH, 'extra.txt'), 'unbound');
  assert.throws(() => checkRuleBatchBundle(checked.bundleDigest, root), /inventory_mismatch/);
  rmSync(join(root, BUNDLE_PATH, 'extra.txt'));
  const manifestPath = join(root, BUNDLE_PATH, 'bundle.json'), raw = readFileSync(manifestPath);
  const m = JSON.parse(raw); m.files[0].path = '../outside'; writeFileSync(manifestPath, JSON.stringify(m));
  assert.throws(() => checkRuleBatchBundle(checked.bundleDigest, root), /manifest_digest_mismatch/);
  assert.throws(() => checkRuleBatchBundle(undefined, root), /inventory_mismatch/);
  writeFileSync(manifestPath, raw);
  rmSync(asset);
  assert.throws(() => checkRuleBatchBundle(checked.bundleDigest, root), /inventory_mismatch/);
  assert.throws(() => materializeRuleBatchBundle(join(root, 'out')), /external_digest_required/);
  assert.equal(existsSync(join(root, 'out')), false);
});

test('materialization preserves fixed bytes, never overwrites, and emits no positive solution', t => {
  const root = temp(t), checked = checkRuleBatchBundle();
  const receipt = materializeRuleBatchBundle(join(root, 'materialized'), checked.bundleDigest);
  assert.equal(receipt.model_launches, 0);
  assert.match(readFileSync(join(receipt.source, 'src/rule-service.mjs'), 'utf8'), /Not implemented/);
  assert.equal(existsSync(join(receipt.source, 'examples')), false);
  for (const name of ['cases.mjs', 'contract.test.mjs', 'legacy-verifier.v1.2.mjs', 'legacy.test.mjs']) {
    assert.deepEqual(readFileSync(join(receipt.source, 'test/fixed', name)), checked.assets.get(`${BUNDLE_PATH}/fixed/${name}`));
  }
  assert.throws(() => materializeRuleBatchBundle(receipt.output, checked.bundleDigest), /output_exists/);
  // Only the test-owned artificial positive replaces src bytes. Fixed evaluation
  // files are unchanged, and no saved/model-generated candidate is evaluated.
  const reference = readFileSync(join(ROOT, BUNDLE_PATH, 'examples/reference.mjs'), 'utf8')
    .replaceAll("'../../../../fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/src/errors.mjs'", "'./errors.mjs'")
    .replaceAll("'../../../../fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/src/validation.mjs'", "'./validation.mjs'");
  writeFileSync(join(receipt.source, 'src/rule-service.mjs'), reference);
  writeFileSync(join(receipt.source, 'src/index.mjs'), "export * from './rule-service.mjs';\n");
  const output = child(process.execPath, ['--test', 'test/fixed/contract.test.mjs', 'test/fixed/legacy.test.mjs'], receipt.source);
  assert.match(output, /(?:pass 233|# pass 233)/); // 118 + 114 + legacy execution-envelope check
});

test('existing preparation freezes one common public bundle for P/K/F without start', t => {
  const root = temp(t), checked = checkRuleBatchBundle();
  const receipt = materializeRuleBatchBundle(join(root, 'materialized'), checked.bundleDigest);
  git(receipt.source, ['init', '--quiet', '--template=']);
  const commit = commitSource(receipt.source);
  assert.equal(verifyRuleBatchMaterialization(receipt.output, checked.bundleDigest, commit).source_commit, commit);
  const cli = join(root, 'never-launch.mjs'), launch = join(root, 'unexpected-launch');
  writeFileSync(cli, `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(launch)}, 'unexpected');\n`, { mode: 0o700 });
  const options = { output: join(root, 'comparison'),
    evidenceKind: 'synthetic', cliBin: cli, cliVersion: 'declared-test-version' };
  const prepared = prepareRuleBatchComparison(receipt.output, checked.bundleDigest, commit, options);
  const inspected = inspectUserComparison(prepared.root), report = reportUserComparison(prepared.root);
  assert.equal(prepared.plan.source.commit, commit);
  assert.ok(inspected.plan_digest);
  assert.ok(report.slots.every(slot => slot.state === 'not_started' && slot.outcome === 'unknown'));
  for (const arm of Object.values(prepared.plan.arms)) {
    const binding = JSON.parse(readFileSync(join(prepared.root, arm.path, 'contract-binding.json')));
    assert.equal(binding.bundle_digest, checked.bundleDigest);
    assert.deepEqual(readFileSync(join(prepared.root, arm.path, 'test/fixed/cases.mjs')), checked.assets.get(`${BUNDLE_PATH}/fixed/cases.mjs`));
  }
  assert.equal(existsSync(launch), false);
  assert.throws(() => prepareRuleBatchComparison(receipt.output, checked.bundleDigest, commit,
    { ...options, output: join(root, 'bad-scope'), mutablePaths: ['src/', 'test/'] }), /bundle_owned_option_override/);
  assert.equal(digest(readFileSync(receipt.taskFile)), prepared.plan.task.digest);

  // F2: self-declared binding and a newly committed no-op fixed test cannot
  // masquerade as the reviewed bundle, even when the working copy is restored.
  const fixed = join(receipt.source, 'test/fixed/r2.test.mjs'), original = readFileSync(fixed);
  writeFileSync(fixed, "import test from 'node:test'; test('no-op', () => {});\n");
  const badCommit = commitSource(receipt.source);
  writeFileSync(fixed, original);
  assert.throws(() => prepareRuleBatchComparison(receipt.output, checked.bundleDigest, badCommit,
    { ...options, output: join(root, 'changed-commit') }), /source_commit_asset_mismatch/);
  assert.equal(existsSync(join(root, 'changed-commit')), false);
  for (const path of ['task.md', 'verification.json', 'source/docs/rule-batches.md',
    'source/src/validation.mjs', 'source/contract-binding.json', 'source/test/fixed/r2.test.mjs']) {
    const absolute = join(receipt.output, path), saved = readFileSync(absolute);
    writeFileSync(absolute, Buffer.concat([saved, Buffer.from('drift')]));
    assert.throws(() => verifyRuleBatchMaterialization(receipt.output, checked.bundleDigest, commit), /materialized_asset_mismatch/);
    writeFileSync(absolute, saved);
  }
});

test('per-requirement r2 executes retained historical integer cases (F1)', t => {
  const root = temp(t), checked = checkRuleBatchBundle();
  const receipt = materializeRuleBatchBundle(join(root, 'materialized'), checked.bundleDigest);
  const module = new URL('../benchmarks/contracts/rule-batch/2.0.0/examples/reference.mjs', import.meta.url).href;
  writeFileSync(join(receipt.source, 'src/index.mjs'), `
import * as base from ${JSON.stringify(module)};
export * from ${JSON.stringify(module)};
export class RuleService extends base.RuleService {
  applyBatch(request) {
    if (request?.expectedVersion > Number.MAX_SAFE_INTEGER) throw new base.RuleValidationError('artificial safe-integer cap');
    return super.applyBatch(request);
  }
}
`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', 'test/fixed/r2.test.mjs'],
    { cwd: receipt.source, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(r.error, undefined);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /historical-v1.2\/integer-no-schema-maximum-2/);
  assert.match(r.stdout, /historical-v1.2\/integer-no-schema-maximum-3/);
});

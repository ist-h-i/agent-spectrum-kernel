import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
import { comparisonHash, PRIMARY_PUBLIC_VERIFICATION_CONTRACT, primaryPublicVerificationRuntime, prepareGitBaseline, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { buildPrimaryPublicVerificationEnvelope, primaryPublicVerificationNeedsSandbox, readUserComparisonPlan, startUserComparison, verifyUserComparisonConditionForTest } from './ask-user-comparison.mjs';
import { CANONICAL_PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mac = { skip: process.platform !== 'darwin' ? 'macOS request construction only; no native process is executed' : false };
function setup(t, { sandbox = true } = {}) {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-public-sandbox-fake-')));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const id = 'mn-focused-regression-test', base = join(root, 'benchmarks/fixtures/checkpoint-b2', id);
  const manifest = JSON.parse(readFileSync(join(base, 'input-manifest.json')));
  for (const entry of manifest.fixtures[id].files) {
    const path = join(area, 'arms/plain', entry.path);
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, readFileSync(join(base, entry.path)));
  }
  mkdirSync(join(area, 'control/slots/plain'), { recursive: true });
  const reporter = readFileSync(join(root, 'scripts/ask-user-comparison-test-reporter.mjs'));
  writeFileSync(join(area, 'control/reporter.mjs'), reporter);
  const plan = { arms: { plain: { path: 'arms/plain' } }, policy: { execution_contract: 'single_shot_v1' },
    config: { verification_timeout_ms: 300000, evidence_kind: 'synthetic', ...(sandbox ? { public_verification: primaryPublicVerificationRuntime() } : {}) },
    verification: { recipe: buildPrimaryFixtureRecipe(id), reporter: { path: 'control/reporter.mjs', digest: comparisonHash(reporter) } } };
  return { area, plan };
}
const success = { stdout: 'artificial output\n', stderr: '', spawnObserved: true, exitCode: 0, durationMs: 3 };

test('fixed public sandbox request has no network/user-state environment or broad host filesystem allowance', mac, t => {
  const { area, plan } = setup(t), workspace = join(area, 'arms/plain/workspace');
  const envelope = buildPrimaryPublicVerificationEnvelope(plan, workspace), policy = envelope.prefix[1];
  assert.equal(envelope.executable, '/usr/bin/sandbox-exec');
  assert.equal(envelope.terminationScope, 'process_group');
  assert.match(policy, /\(deny default\)/u); assert.match(policy, /\(deny network\*\)/u);
  assert.ok(policy.includes(`(allow file-write* (subpath ${JSON.stringify(workspace)}) (literal "/dev/null"))`));
  for (const broad of ['(allow file-read*)', '(allow file-write*)', '(allow network*)', '(allow mach-lookup)', '(allow process*)']) assert.ok(!policy.includes(broad));
  for (const path of [root, join(area, 'control'), process.env.HOME + '/.codex', '/private/tmp', '/private/var/folders']) assert.ok(!policy.includes(`(subpath ${JSON.stringify(path)})`));
  assert.ok(!policy.includes(`(subpath ${JSON.stringify(dirname(dirname(process.execPath)))})`), 'entire Node prefix must not be readable');
  assert.ok(!policy.includes(`(subpath ${JSON.stringify(plan.config.public_verification.npm.root)})`), 'npm root configs are not part of the allowed runtime');
  for (const key of ['HOME', 'CODEX_HOME', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'BASH_ENV', 'ENV', 'AUTH_TOKEN']) assert.equal(Object.hasOwn(envelope.environment, key), false);
  assert.equal(envelope.environment.NPM_CONFIG_USERCONFIG, '/dev/null');
  assert.equal(envelope.environment.PATH.split(':')[0], dirname(process.execPath));
  assert.equal(envelope.observation.native_acceptance, 'unverified');
  assert.equal(envelope.observation.private_grading_authority, false);
});

test('candidate-code safety classification uses exact canonical recipes rather than arbitrary mutable path spellings', () => {
  const requiring = CANONICAL_PRIMARY_FIXTURE_IDS.filter(id => primaryPublicVerificationNeedsSandbox(buildPrimaryFixtureRecipe(id)));
  assert.equal(requiring.length, 9);
  for (const mutable of [['workspace/'], ['workspace/src'], ['workspace/payload'], ['workspace/review.json']]) {
    const recipe = structuredClone(buildPrimaryFixtureRecipe('mn-client-compatibility-fix')); recipe.mutable_paths = mutable;
    assert.throws(() => primaryPublicVerificationNeedsSandbox(recipe), /canonical fixture/u);
  }
});

test('public request rejects changed runtime/source/contract before fake dispatch', mac, async t => {
  const { area, plan } = setup(t), workspace = join(area, 'arms/plain/workspace');
  for (const mutate of [p => p.config.public_verification.node.digest = 'sha256:' + '0'.repeat(64),
    p => p.config.public_verification.controller_source_digest = 'sha256:' + '1'.repeat(64),
    p => p.config.public_verification.contract = 'unknown', p => p.policy.execution_contract = 'legacy']) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => buildPrimaryPublicVerificationEnvelope(changed, workspace));
  }
  const changed = structuredClone(plan); changed.config.public_verification.node.bytes++;
  let dispatched = false;
  await assert.rejects(verifyUserComparisonConditionForTest(area, changed, 'plain', undefined, async () => { dispatched = true; return success; }));
  assert.equal(dispatched, false);
});

test('public verification keeps exact original command under the OS envelope and uses existing owned-group transport', mac, async t => {
  const { area, plan } = setup(t), calls = [];
  const result = await verifyUserComparisonConditionForTest(area, plan, 'plain', undefined, async request => { calls.push(request); return success; });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, '/usr/bin/sandbox-exec');
  assert.deepEqual(calls[0].argv.slice(2), ['/bin/bash', ...plan.verification.recipe.checks[0].argv]);
  assert.equal(calls[0].terminationScope, 'process_group');
  assert.equal(calls[0].timeoutMs, 300000); assert.equal(calls[0].env.HOME, undefined);
  assert.equal(result.checks[0].status, 'pass');
  assert.deepEqual(result.checks[0].original_command, ['/bin/bash', ...plan.verification.recipe.checks[0].argv]);
  assert.equal(result.checks[0].termination_confirmed, true);
  assert.equal(result.runtime.public_verification_boundary.native_acceptance, 'unverified');
  assert.equal(result.independent_process, false, 'artificial transport is never an independent native observation');
  assert.equal(result.checks[0].semantic_quality, 'unknown');
  assert.equal(result.runtime.verification_environment.policy, PRIMARY_PUBLIC_VERIFICATION_CONTRACT);
});

test('sandbox apply failure is retained and never retries an unsandboxed command', mac, async t => {
  const { area, plan } = setup(t); let calls = 0;
  const result = await verifyUserComparisonConditionForTest(area, plan, 'plain', undefined, async request => {
    calls++; assert.equal(request.executable, '/usr/bin/sandbox-exec');
    return { ...success, exitCode: 71, stderr: 'sandbox-exec: sandbox_apply: Operation not permitted\n' };
  });
  assert.equal(calls, 1); assert.equal(result.checks[0].status, 'unknown'); assert.equal(result.checks[0].exit_code, 71);
  assert.equal(result.checks[0].runner_error.code, 'PUBLIC_VERIFICATION_SANDBOX_UNAVAILABLE');
  assert.equal(result.checks[0].semantic_quality, 'unknown');
  assert.match(readFileSync(join(area, 'control/slots/plain/verification-0.stderr.log'), 'utf8'), /sandbox_apply/u);
});

test('partial log collision preserves earlier evidence and aborts the verification flow', mac, async t => {
  const { area, plan } = setup(t); let calls = 0;
  const oldLog = join(area, 'control/slots/plain/verification-0.stdout.log'); writeFileSync(oldLog, 'retained earlier bytes');
  await assert.rejects(verifyUserComparisonConditionForTest(area, plan, 'plain', undefined, async () => { calls++; return success; }), /EEXIST/u);
  assert.equal(calls, 1); assert.equal(readFileSync(oldLog, 'utf8'), 'retained earlier bytes');
});

test('fresh preparation pins reference criteria without changing historical plans; macOS additionally pins the sandbox contract', async t => {
  const isMac = process.platform === 'darwin';
  const { area, plan } = setup(t, { sandbox: isMac }), repo = join(area, 'arms/plain'), commit = prepareGitBaseline(repo);
  const recipePath = join(area, 'verification-recipe.json'); writeFileSync(recipePath, JSON.stringify(plan.verification.recipe, null, 2) + '\n');
  const options = { repo, commit, taskFile: join(repo, 'task.md'), verificationFile: recipePath, output: join(area, 'fresh'),
    mutablePaths: plan.verification.recipe.mutable_paths, taskClass: plan.verification.recipe.runner_task_class,
    executionContract: 'single_shot_v1', kernelCondition: 'kernel_principles_v2', cliBin: '/never-start-codex',
    referenceReviewProtocolDigest: 'sha256:' + '2'.repeat(64), ...(isMac ? { publicVerificationContract: PRIMARY_PUBLIC_VERIFICATION_CONTRACT } : {}) };
  const made = prepareUserComparison(options), saved = readUserComparisonPlan(made.root);
  assert.equal(saved.plan.reference_review_protocol_digest, options.referenceReviewProtocolDigest);
  if (isMac) {
    assert.deepEqual(saved.plan.config.public_verification, primaryPublicVerificationRuntime());
    assert.equal(saved.plan.config.public_verification.contract, PRIMARY_PUBLIC_VERIFICATION_CONTRACT);
  } else assert.equal(saved.plan.config.public_verification, undefined);
  const oldOptions = { ...options, output: join(area, 'historical') }; delete oldOptions.referenceReviewProtocolDigest; delete oldOptions.publicVerificationContract;
  const historical = prepareUserComparison(oldOptions);
  assert.equal(Object.hasOwn(historical.plan, 'reference_review_protocol_digest'), false);
  assert.equal(Object.hasOwn(historical.plan.config, 'public_verification'), false);
  await assert.rejects(startUserComparison(historical.root, historical.plan_digest), /candidate executable public verification requires a fixed sandbox contract/u);
  assert.equal(existsSync(join(historical.root, 'control/start.json')), false, 'static refusal must precede durable start or model dispatch');
  assert.equal(readUserComparisonPlan(historical.root).plan.reference_review_protocol_digest, undefined);
  for (const bad of ['bad', null, 4]) assert.throws(() => prepareUserComparison({ ...options, output: join(area, 'never-created'), referenceReviewProtocolDigest: bad }));
});

test('cancelled/deadline/unknown-ending sandbox verifiers stop without further command dispatch', mac, async t => {
  for (const scenario of ['cancelled', 'deadline', 'unknown-ending']) await t.test(scenario, async child => {
    const { area, plan } = setup(child), signal = AbortSignal.abort(); let calls = 0;
    const value = await verifyUserComparisonConditionForTest(area, plan, 'plain', scenario === 'cancelled' ? signal : undefined,
      async () => { calls++; return { ...success, exitCode: null, cleanupError: { code: 'PROCESS_GROUP_REMAINS' } }; }, scenario === 'deadline' ? () => 0 : () => 300000);
    assert.equal(calls, scenario === 'unknown-ending' ? 1 : 0);
    if (scenario === 'unknown-ending') { assert.equal(value.checks[0].status, 'unknown'); assert.equal(value.checks[0].termination_confirmed, false); }
    else assert.equal(value.checks.length, 0);
  });
});

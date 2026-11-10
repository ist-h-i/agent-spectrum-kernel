import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluatePrimaryGrade } from './practical-primary-grading.mjs';

// Actual host, synthetic files and fake backend only. One formal-reference test
// runs a newly created diagnostic script. No saved shell is evaluated or executed.
const here = realpathSync(tmpdir());
function fixture(t, formal = false, sourceDiagnostic = false) {
  const root = mkdtempSync(join(here, '.synthetic-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const save = (path, value) => {
    const p = join(root, path); mkdirSync(dirname(p), { recursive: true });
    const bytes = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    writeFileSync(p, bytes, { flag: 'wx' });
    return { path: p, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  };
  const fixtureId = formal ? 'mp-frontend-state-review' : 'ordinary-frontend-review-evidence-gap';
  const requirement = (id, points) => ({ requirement_id: id, max_points: points, partial_credit_allowed: false });
  const requirements = [requirement('verification-conclusion', 2),
    ...(formal ? [requirement('evidence-and-review-precision', 1)] : []),
    requirement('other-original-criterion', formal ? 7 : 8)];
  const contract = { fixture_id: fixtureId, schema_version: '1.2.0', commands: [{
    command_id: 'review-contract-validation', canonical_script: formal ? 'original-digest-check && npm run validate:review' : 'npm run validate:review',
    requirement: 'required', working_directory: { path: '.', evidence_requirement: 'not_required' },
  }] };
  const config = {
    model: 'synthetic-no-model', reasoning: 'low',
    requirements: save('inputs/requirements.json', { fixture_id: fixtureId, requirements }),
    evidence_map: save('inputs/evidence-map.json', { fixture_id: fixtureId, scope_boundary_authority: {
      allowed_candidate_paths: ['workspace/review.json'], required_candidate_paths: ['workspace/review.json'],
    } }),
    verification_contract: save('inputs/contract.json', contract),
    output_path: 'workspace/review.json', checks: [], command_evidence_requirement_ids: ['verification-conclusion'],
    saved_evidence: save('inputs/saved-observations.json', {
      kind: 'host_saved_task_observations_v1', binding: { protected_inputs_unchanged: true, answer_unchanged: true },
      saved_observation_capture_valid: true, commands: [{ command: 'npm run test:interaction', exit_code: 2, stdout: 'not_run' }],
    }),
    capsuleRoot: join(root, 'capsules'), replyRoot: join(root, 'replies'),
  };
  for (const name of ['capsules', 'replies', 'control']) mkdirSync(join(root, name));
  const publicSource = save('inputs/public-note.txt', 'Structural validation does not prove browser interaction.\n');
  const publicFiles = [{ source: publicSource.path, digest: publicSource.digest, target: 'workspace/note.txt' }];
  save('task/workspace/note.txt', readFileSync(publicSource.path, 'utf8'));
  save('task/workspace/review.json', { verification: 'interaction passed', precision: sourceDiagnostic ? 'src/missing.mjs:999 is a valid reference' : 'browser proof from structure' });
  if (sourceDiagnostic) {
    const validator = save('inputs/validate.mjs', 'process.stderr.write("Invalid source reference: src/missing.mjs:999\\n"); process.exit(1);');
    publicFiles.push({ source: validator.path, digest: validator.digest, target: 'workspace/validate.mjs' });
    save('task/workspace/validate.mjs', readFileSync(validator.path, 'utf8'));
    config.checks = [[process.execPath, 'validate.mjs', 'review.json']];
  }
  const judgment = (reportingStatus = 'unknown', precisionStatus = 'unknown') => ({ requirements: requirements.map(r => ({
    id: r.requirement_id,
    status: r.requirement_id === 'verification-conclusion' ? reportingStatus : r.requirement_id === 'evidence-and-review-precision' ? precisionStatus : 'unknown',
    reason: 'Synthetic assessment of the original criterion.', evidence: ['candidate/workspace/review.json'],
  })) });
  const evidence = (basis = 'missing', precisionBasis = 'missing') => requirements
    .filter(r => r.requirement_id !== 'other-original-criterion')
    .map(r => ({ id: r.requirement_id, basis: r.requirement_id === 'verification-conclusion' ? basis : precisionBasis, counterevidence: [] }));
  const calls = [];
  const run = async replies => {
    const result = await evaluatePrimaryGrade({ config, fixtureId, publicFiles, workspace: join(root, 'task'), controlRoot: join(root, 'control') }, async call => {
      calls.push(call);
      assert.match(call.prompt, /Read reporting-policy.json/);
      assert.match(call.prompt, /not_required/);
      assert.match(call.prompt, /reporting_evidence/);
      const policy = JSON.parse(readFileSync(join(call.cwd, 'reporting-policy.json')));
      assert.deepEqual(policy.verification_contract, contract);
      assert.deepEqual(policy.requirements, requirements.filter(r => r.requirement_id !== 'other-original-criterion'));
      const value = typeof replies[call.role] === 'function' ? replies[call.role](call) : replies[call.role];
      return { terminal: true, completed: true, text: JSON.stringify(value), metrics: { input_tokens: 0, output_tokens: 0, cached_tokens: 0 }, model: 'synthetic-no-model' };
    });
    assert.deepEqual(calls.map(c => c.role), ['primary', 'verification']);
    return result;
  };
  return { root, run, judgment, evidence };
}
const agree = reporting_evidence => ({ verdict: 'agree', judgment: null, review: 'Synthetic source-checked audit.', reporting_evidence });
const contradiction = () => ({
  kind: 'reported_outcome_contradicted', claim: { path: 'candidate/workspace/review.json', quote: 'interaction passed' },
  observation: { path: 'task-command-evidence.json', quote: '"exit_code": 2' },
  explanation: 'The synthetic matching invocation returned not_run rather than the claimed interaction pass.',
});

test('real host sends original policy to both calls and preserves unknown scoring/schema', async t => {
  const f = fixture(t);
  const result = await f.run({ primary: { judgment: f.judgment(), reporting_evidence: f.evidence() }, verification: agree(f.evidence()) });
  assert.equal(result.issue, null);
  assert.equal(result.quality.fixed_reference.exact_lower, '0');
  assert.equal(result.quality.fixed_reference.exact_upper, '10');
  const final = JSON.parse(readFileSync(join(f.root, 'control/private-grade/final-judgment.json')));
  assert.deepEqual(final, f.judgment());
  assert.deepEqual(Object.keys(final), ['requirements']);
});
test('missing-only primary Fail is invalid, audit explicitly corrects to Unknown', async t => {
  const f = fixture(t);
  const result = await f.run({
    primary: { judgment: f.judgment('fail'), reporting_evidence: f.evidence() },
    verification: call => {
      const first = JSON.parse(readFileSync(join(call.cwd, 'primary-judgment.json')));
      assert.equal(first.status, 'invalid_primary_contract');
      assert.match(first.issue, /missing evidence must be unknown/);
      return { verdict: 'correct', judgment: f.judgment(), review: 'Explicitly correct the missing-only failure.', reporting_evidence: f.evidence() };
    },
  });
  assert.equal(result.issue, null);
  assert.equal(result.quality.fixed_reference.exact_upper, '10');
});
test('an audit cannot agree with invalid primary or introduce its own missing-only Fail', async t => {
  for (const invalidPrimary of [true, false]) {
    await t.test(String(invalidPrimary), async sub => {
      const f = fixture(sub);
      const result = await f.run({
        primary: { judgment: f.judgment(invalidPrimary ? 'fail' : 'unknown'), reporting_evidence: f.evidence() },
        verification: invalidPrimary ? agree(f.evidence()) : {
          verdict: 'correct', judgment: f.judgment('fail'), review: 'Synthetic invalid correction.', reporting_evidence: f.evidence(),
        },
      });
      assert.match(result.issue, /invalid primary requires complete correction|missing evidence must be unknown/);
      assert.equal(result.quality.fixed_reference, null);
      assert.equal(existsSync(join(f.root, 'control/private-grade/final-judgment.json')), false);
    });
  }
});
test('concrete existing counterexample permits Fail without any automatic score rewrite', async t => {
  const f = fixture(t); const sidecar = f.evidence('counterevidence');
  sidecar[0].counterevidence = [contradiction()];
  const result = await f.run({ primary: { judgment: f.judgment('fail'), reporting_evidence: sidecar }, verification: agree(sidecar) });
  assert.equal(result.issue, null);
  assert.equal(result.quality.fixed_reference.exact_upper, '8');
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, 'control/private-grade/final-judgment.json'))), f.judgment('fail'));
});
test('fabricated quotes, fresh-host proof and path traversal cannot substantiate Fail', async t => {
  for (const kind of ['fabricated', 'fresh-host', 'traversal']) {
    await t.test(kind, async sub => {
      const f = fixture(sub); const sidecar = f.evidence('counterevidence'); const item = contradiction();
      if (kind === 'fabricated') item.observation.quote = 'a nonexistent failed test';
      if (kind === 'fresh-host') item.observation.path = 'host-observations.json';
      if (kind === 'traversal') item.observation.path = '../inputs/saved-observations.json';
      sidecar[0].counterevidence = [item];
      const result = await f.run({ primary: { judgment: f.judgment('fail'), reporting_evidence: sidecar }, verification: agree(sidecar) });
      assert.match(result.issue, /invalid primary requires complete correction/);
      const first = JSON.parse(readFileSync(join(f.root, 'control/private-grade/primary-judgment.json')));
      assert.match(first.issue, /quoted evidence does not exist|source path is not permitted/);
    });
  }
});
test('formal precision is covered too; missing-only precision Fail is rejected', async t => {
  const f = fixture(t, true);
  const result = await f.run({ primary: { judgment: f.judgment('unknown', 'fail'), reporting_evidence: f.evidence() }, verification: agree(f.evidence()) });
  assert.match(result.issue, /invalid primary requires complete correction/);
  const first = JSON.parse(readFileSync(join(f.root, 'control/private-grade/primary-judgment.json')));
  assert.match(first.issue, /evidence-and-review-precision: missing evidence must be unknown/);
});
test('formal supported precision retains its one-point weight with no attestation gate', async t => {
  const f = fixture(t, true); const sidecar = f.evidence('missing', 'supported');
  const result = await f.run({ primary: { judgment: f.judgment('unknown', 'pass'), reporting_evidence: sidecar }, verification: agree(sidecar) });
  assert.equal(result.issue, null);
  assert.equal(result.quality.fixed_reference.exact_lower, '1');
  assert.equal(result.quality.fixed_reference.exact_upper, '10');
});

test('formal current source-reference defect may cite fresh validator diagnostics, not historical execution', async t => {
  const f = fixture(t, true, true), evidence = f.evidence('missing', 'counterevidence');
  evidence[1].counterevidence = [{ kind: 'source_reference_contradicted',
    claim: { path: 'candidate/workspace/review.json', quote: 'src/missing.mjs:999 is a valid reference' },
    observation: { path: 'host-observations.json', quote: 'Invalid source reference: src/missing.mjs:999' },
    explanation: 'The fresh synthetic validator identifies a current invalid reference, not a claim about past execution.' }];
  const result = await f.run({ primary: { judgment: f.judgment('unknown', 'fail'), reporting_evidence: evidence }, verification: agree(evidence) });
  assert.equal(result.issue, null);assert.equal(result.quality.fixed_reference.exact_upper, '9');
});
for (const kind of ['claimed_execution_contradicted', 'reported_outcome_contradicted']) test(`fresh diagnostics cannot support historical ${kind}`, async t => {
  const f = fixture(t, true, true), evidence = f.evidence('counterevidence', 'missing');
  evidence[0].counterevidence = [{ kind,
    claim: { path: 'candidate/workspace/review.json', quote: 'interaction passed' },
    observation: { path: 'host-observations.json', quote: 'Invalid source reference: src/missing.mjs:999' },
    explanation: 'This forbidden inference tries to turn a fresh diagnostic into historical execution counterevidence.' }];
  const result = await f.run({ primary: { judgment: f.judgment('fail'), reporting_evidence: evidence },
    verification: { verdict: 'correct', judgment: f.judgment('fail'), review: 'Invalid historical inference.', reporting_evidence: evidence } });
  assert.match(result.issue, /source path is not permitted/);assert.equal(result.quality.fixed_reference, null);
});

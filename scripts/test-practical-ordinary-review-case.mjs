import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {validateSchemaValue} from './json-schema-validation.mjs';
import {buildOrdinaryReviewInputArtifacts, validateOrdinaryReviewCase, FIXTURE_ID, FIXTURE_PATH} from './practical-ordinary-review-case.mjs';

const root = resolve(import.meta.dirname, '..'), fixture = join(root, FIXTURE_PATH);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const source = join(root, 'benchmarks/fixtures/checkpoint-b2/mp-frontend-state-review');
const withWorkspace = body => {
  const temp = mkdtempSync(join(tmpdir(), 'ordinary-review-'));
  try { cpSync(join(fixture, 'workspace'), temp, {recursive:true}); return body(temp); }
  finally { rmSync(temp, {recursive:true, force:true}); }
};
const run = (cwd, args) => {
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, {cwd, env, encoding:'utf8', timeout:30000});
};
const review = () => ({verification:{state:'incomplete', evidence:[]}, findings:[]});

test('ordinary case has distinct, closed public inputs and no admission claims', () => {
  const result = validateOrdinaryReviewCase(root);
  assert.equal(result.fixture_id, FIXTURE_ID);
  const metadata = json(join(fixture, 'scoring-contract.json'));
  assert.equal(metadata.formal_admission, false);
  assert.equal(metadata.output_path, 'workspace/review.json');
  assert.deepEqual(metadata.command_evidence_requirement_ids, ['verification-conclusion']);
  const manifest = json(join(fixture, 'input-manifest.json'));
  assert.deepEqual(Object.keys(manifest.fixtures), [FIXTURE_ID]);
  assert.deepEqual(manifest, buildOrdinaryReviewInputArtifacts(fixture).inputManifest);
  assert.ok(manifest.fixtures[FIXTURE_ID].files.every(f => f.path === 'task.md' || f.path.startsWith('workspace/')));
  const task = readFileSync(join(fixture, 'task.md'), 'utf8');
  assert.doesNotMatch(task, /merge decision|merge recommendation|final decision|no[- ]decision|review-router|ASK|scoring|rubric/iu);
  assert.match(task, /Review the supplied diff/u);
});

test('reviewed code, behavioral contract and tests stay identical to the source case', () => {
  const files = json(join(fixture, 'input-manifest.json')).fixtures[FIXTURE_ID].files;
  const changed = new Set(['task.md', 'workspace/package.json', 'workspace/package-lock.json', 'workspace/review.schema.json', 'workspace/scripts/validate-review.mjs']);
  for (const {path} of files) if (!changed.has(path)) {
    assert.deepEqual(readFileSync(join(fixture, path)), readFileSync(join(source, path)), path);
  }
});

test('schema and public validator accept ordinary review with or without optional decision', () => withWorkspace(workspace => {
  const schema = json(join(workspace, 'review.schema.json'));
  assert.deepEqual(schema.required, ['verification', 'findings']);
  for (const decision of [undefined, 'approve', 'request_changes', 'insufficient_evidence']) {
    const value = {...review(), ...(decision === undefined ? {} : {decision})};
    assert.deepEqual(validateSchemaValue(value, schema), []);
    writeFileSync(join(workspace, 'review.json'), JSON.stringify(value));
    const result = run(workspace, ['scripts/validate-review.mjs', 'review.json']);
    assert.equal(result.status, 0, result.stderr);
  }
}));

test('output checks still reject invalid decision, extra fields and false source references', () => withWorkspace(workspace => {
  const schema = json(join(workspace, 'review.schema.json'));
  const values = [
    {...review(), decision:'maybe'}, {...review(), unused:true},
    {...review(), verification:{state:'incomplete', evidence:[{path:'../task.md', conclusion:'read'}]}},
    {...review(), findings:[{title:'x', severity:'high', impact:'x', required_action:'x', evidence:[{path:'src/inbox-state.mjs', line:999}]}]},
  ];
  for (const value of values) {
    writeFileSync(join(workspace, 'review.json'), JSON.stringify(value));
    assert.notEqual(run(workspace, ['scripts/validate-review.mjs', 'review.json']).status, 0);
  }
  for (const value of values.slice(0, 2)) assert.ok(validateSchemaValue(value, schema).length > 0);
}));

test('seed has passing unit checks and a real list-detail regression', () => withWorkspace(workspace => {
  const unit = run(workspace, ['--test', 'test/unit/inbox-state.test.mjs']);
  assert.equal(unit.status, 0, unit.stderr);
  const interaction = run(workspace, ['--test', 'test/integration/inbox-view.test.mjs']);
  assert.equal(interaction.status, 1);
  assert.match(interaction.stdout, /filtering out the selection clears the detail pane/u);
  assert.match(interaction.stdout, /fail 1/u);
}));

test('scoring uses binary quality weights and observes decision without rewarding a route', () => {
  const requirements = json(join(fixture, 'requirement-record.json')).requirements;
  assert.equal(requirements.reduce((sum, r) => sum + r.max_points, 0), 10);
  assert.equal(new Set(requirements.map(r => r.requirement_id)).size, requirements.length);
  for (const r of requirements) {
    assert.equal(r.partial_credit_allowed, false);
    assert.ok(Number.isSafeInteger(r.max_points) && r.max_points > 0);
    assert.ok(r.pass_condition && r.fail_condition && r.unknown_condition);
    assert.doesNotMatch(JSON.stringify(r), /decision|review-router|skill|gate|route/iu);
  }
  const scoring = json(join(fixture, 'scoring-contract.json'));
  assert.deepEqual(scoring.scored_requirement_ids, requirements.map(r => r.requirement_id));
  assert.equal(scoring.unscored_observations.final_judgment.score_effect, 'none');
  assert.equal(scoring.unscored_observations.final_judgment.interpretation, 'descriptive_only');
});

test('input drift is rejected without rewriting the retained fixture', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ordinary-review-root-'));
  try {
    cpSync(fixture, join(temp, FIXTURE_PATH), {recursive:true});
    writeFileSync(join(temp, FIXTURE_PATH, 'task.md'), 'changed request');
    assert.throws(() => validateOrdinaryReviewCase(temp), /input inventory drift/u);
  } finally { rmSync(temp, {recursive:true, force:true}); }
});

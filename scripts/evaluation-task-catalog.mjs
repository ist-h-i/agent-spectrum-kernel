import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

const source = resolve(import.meta.dirname, '..');
const registrationsPath = 'benchmarks/evaluation-tasks.json';
const types = new Set(['review', 'design', 'investigation', 'implementation', 'documentation', 'test', 'handoff']);
const difficulties = new Set(['easy', 'easy_medium', 'medium', 'medium_hard', 'hard', 'unassessed']);
const read = path => readFileSync(join(source, path));
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'), path);
const reference = path => ({ path, digest: 'sha256:' + createHash('sha256').update(read(path)).digest('hex') });
const directory = id => `benchmarks/task-revisions/${id}`;

export function readEvaluationTaskRegistrations() {
  const data = json(registrationsPath);
  assert.equal(data.kind, 'evaluation_task_registrations_v2');
  assert.ok(Array.isArray(data.tasks) && data.tasks.length);
  assert.equal(new Set(data.tasks.map(row => row.id)).size, data.tasks.length, 'duplicate evaluation task ID');
  assert.ok(Number.isSafeInteger(data.assets.github_repository_id), 'protected asset repository ID required');
  assert.match(data.assets.revision, /^[a-f0-9]{40}$/u, 'protected asset revision required');
  return data;
}

function inputReference(row) {
  return row.input.kind === 'private'
    ? { path: join(row.input.asset_path, 'input-manifest.json'), digest: row.input.digest }
    : reference(join(directory(row.id), 'input-manifest.json'));
}

function describePracticalChallenge(row) {
  return {
    ...row.runner,
    id: row.id,
    workspace: row.input.root,
    input_version: row.input.version,
    input_manifest: inputReference(row),
  };
}

export function readPracticalChallengeRegistrations() {
  return readEvaluationTaskRegistrations().tasks.filter(row => row.runner).map(describePracticalChallenge);
}

function describeInput(row, assets, runner) {
  const { kind, root, version, asset_path: assetPath, modes } = row.input;
  const { path: manifest, digest } = inputReference(row);
  const delivery = Object.hasOwn(modes, 'one_shot') ? 'one_shot' : 'default';
  return {
    kind, version, manifest, digest, task_path: modes[delivery].task_path,
    default_delivery: delivery,
    delivery_modes: Object.keys(modes),
    ...(root ? { root } : { asset_path: assetPath }),
    ...(kind === 'private' ? { revision: assets.revision,
      archive_api_path: `repositories/${assets.github_repository_id}/tarball/${assets.revision}` } : {}),
    ...(runner ? { registration_digest: canonicalDigest(runner), reassessment_digest: runner.stages[1].update.digest } : {}),
    ...(row.followup ? { followup: row.followup } : {}),
  };
}

function assessmentDefinition(row, assets, input, observations, runner) {
  const rubric = reference(join(directory(row.id), 'rubric.json'));
  const definition = {
    scoring_scope: input.kind === 'primary' ? 'task' : 'supplemental',
    rubric,
    input_contract_digest: canonicalDigest(input),
    observations_digest: canonicalDigest(observations),
    calibration: { ...assets, path: `task-revisions/${row.id}` },
    ...(row.acceptance_files ? { public_criteria: row.acceptance_files.map(reference) } : {}),
    ...(row.private_acceptance ? { protected_criteria: row.private_acceptance } : {}),
    ...(runner ? { evaluator_files: runner.evaluator.files, evaluator_kind: runner.evaluator.kind } : {}),
  };
  return { ...definition, digest: canonicalDigest(definition) };
}

export function listEvaluationTasks({ difficulty, type, skill } = {}) {
  const skills = new Set(json('manifest.json').skills);
  assert.ok(difficulty === undefined || difficulties.has(difficulty), `unknown difficulty: ${difficulty}`);
  assert.ok(type === undefined || types.has(type), `unknown task type: ${type}`);
  assert.ok(skill === undefined || skills.has(skill), `unknown skill: ${skill}`);
  const { tasks, assets } = readEvaluationTaskRegistrations();
  return tasks.map(row => {
    const { id, domain, task_types, difficulty, difficulty_basis, difficulty_source } = row;
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(difficulties.has(difficulty) && domain && task_types?.length
      && task_types.every(type => types.has(type)), `invalid metadata for ${id}`);
    const runner = row.runner && describePracticalChallenge(row);
    const input = describeInput(row, assets, runner);
    const title = row.title ?? /^# (.+)$/mu.exec(read(join(input.root, input.task_path)).toString('utf8'))?.[1].trim();
    assert.ok(title, `task title required: ${id}`);
    const { criteria } = json(join(directory(id), 'rubric.json'));
    assert.ok(Array.isArray(criteria) && criteria.length && new Set(criteria.map(item => item.id)).size === criteria.length,
      `missing or duplicate criteria in ${id}`);
    if (input.kind === 'primary') {
      const rubric = reference(join(directory(id), 'rubric.json'));
      const manifest = json(input.manifest);
      assert.equal(manifest.rubric_digest, rubric.digest, `stale primary rubric: ${id}`);
      assert.equal(criteria.reduce((sum, item) => sum + item.points, 0), 10, `primary maximum: ${id}`);
    }
    const observations = criteria.map(({ id: criterion_id, ...item }) => {
      assert.ok(typeof criterion_id === 'string' && criterion_id.length && item.observation?.trim()
        && Number.isSafeInteger(item.points) && item.points > 0 && item.skills?.length
        && item.skills.every(skill => skills.has(skill))
        && [undefined, true].includes(item.requires_delivery)
        && (item.requires_followup === undefined || item.requires_followup === true && row.followup)
        && [undefined, 'product', 'submission'].includes(item.group),
      `invalid rubric criterion in ${id}`);
      return { criterion_id, ...item };
    });
    return { id, title, domain, task_types, difficulty, difficulty_basis,
      ...(difficulty_source ? { difficulty_source } : {}),
      input, assessment: assessmentDefinition(row, assets, input, observations, runner), observations };
  }).filter(task => (difficulty === undefined || task.difficulty === difficulty)
    && (type === undefined || task.task_types.includes(type))
    && (skill === undefined || task.observations.some(item => item.skills.includes(skill))));
}

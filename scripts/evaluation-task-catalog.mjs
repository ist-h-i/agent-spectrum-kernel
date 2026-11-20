import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

const SOURCE = resolve(import.meta.dirname, '..');
const registrationsPath = 'benchmarks/evaluation-tasks.json';
const businessRoot = 'benchmarks/challenge-candidates/business-five-v3-decisions';
const reviewProtocol = 'benchmarks/challenge-candidates/review-ceiling-v1/evaluation-protocol.md';
const portfolioPath = 'benchmarks/portfolio-catalog.json';
const TYPE_BY_CLASS = {
  pr_review: ['review'], operation_boundary: ['design'], investigation_implementation: ['investigation', 'implementation'],
  migration_design: ['design'], configuration: ['implementation'], local_implementation: ['implementation'],
  documentation: ['documentation'], verification_only: ['test'], local_bug_fix: ['implementation'],
  small_feature: ['implementation'], review_verification: ['review', 'test'], handoff_resume: ['handoff'],
  design_gate: ['design'], investigation: ['investigation'], implementation_verification: ['implementation', 'test'],
  dependency_migration: ['implementation'], implementation_review: ['implementation', 'review'],
};
const TYPES = new Set(Object.values(TYPE_BY_CLASS).flat());
const DIFFICULTIES = new Set(['easy', 'easy_medium', 'medium', 'medium_hard', 'hard', 'unassessed']);
const read = path => readFileSync(join(SOURCE, path));
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'), path);
const digest = path => 'sha256:' + createHash('sha256').update(read(path)).digest('hex');
const title = path => {
  const heading = /^# (.+)$/mu.exec(read(path).toString('utf8'));
  assert.ok(heading, `task requires a title: ${path}`);
  return heading[1].trim();
};

const withDifficulty = (value, basis) => ({ difficulty: value, difficulty_basis: basis });
const reference = path => ({ path, digest: digest(path) });

export function readEvaluationTaskRegistrations() {
  const data = json(registrationsPath);
  assert.equal(data.kind, 'evaluation_task_registrations_v1');
  return data;
}

function primaryEntries() {
  const catalog = json(portfolioPath);
  return catalog.fixtures.filter(row => row.fixture_role === 'primary').map(row => {
    const id = row.fixture_id;
    const root = `benchmarks/fixtures/checkpoint-b2/${id}`;
    const manifest = join(root, 'input-manifest.json');
    const criteria = join(root, 'requirement-record.json');
    const evaluator = join(root, 'evaluator-reference.json');
    const taskPath = join(root, 'task.md');
    return {
      id, title: title(taskPath), domain: row.domain,
      ...withDifficulty(row.difficulty.replace('-', '_'), 'portfolio_estimate'),
      task_types: TYPE_BY_CLASS[row.task_class],
      input: { kind: 'primary', manifest, digest: digest(manifest), task_path: taskPath, version: catalog.catalog_revision },
      assessment: { kind: 'primary_requirement_record', ...reference(criteria), evaluator_reference: reference(evaluator) },
      criterionIds: json(criteria).requirements.map(item => item.requirement_id),
    };
  });
}

function businessEntries() {
  const catalog = json('benchmarks/challenge-candidates/business-five-v3-decisions/catalog.json');
  return catalog.tasks.map(row => {
    const manifestPath = join(businessRoot, row.input_manifest);
    const sources = [
      join(businessRoot, row.decision_path), join(businessRoot, dirname(row.task_path), 'acceptance.md'),
      join(businessRoot, 'public/common/operation-and-observation.md'),
    ].map(reference);
    const manifest = json(manifestPath);
    for (const inventory of Object.values(manifest.modes)) {
      for (const source of sources) {
        const path = source.path.slice(businessRoot.length + 1);
        assert.equal(source.digest, 'sha256:' + inventory.files.find(file => file.path === path)?.sha256,
          `business acceptance criteria drift: ${row.id}`);
      }
    }
    return {
      id: row.id, title: row.title, domain: row.primary_axis,
      ...withDifficulty('unassessed', 'no_difficulty_estimate'),
      task_types: ['implementation'],
      input: {
        kind: 'business', root: businessRoot, manifest: row.input_manifest, digest: digest(manifestPath),
        task_path: row.task_path, version: catalog.version,
        prompts: { one_shot: row.one_shot_prompt, goal_with_pr: row.goal_with_pr_prompt },
      },
      assessment: { kind: 'public_acceptance_criteria', version: catalog.version, sources, digest: canonicalDigest(sources) },
      criterionIds: row.requirements,
    };
  });
}

function stagedEntries(registrations) {
  return registrations.map(row => {
    const isReview = row.series === 'review-ceiling-v1';
    const taskPath = 'task.md';
    const criteria = isReview ? reviewProtocol : join(row.workspace, 'brief/rubric.json');
    const criterionIds = isReview
      ? [...read(criteria).toString('utf8').matchAll(/^\| ([^|]+) \| [0-9]+ \|/gmu)].map(match => match[1].trim())
      : json(criteria).requirements.map(item => item.id);
    return {
      id: row.id, title: title(join(row.workspace, taskPath)), domain: row.selection.domain,
      ...withDifficulty(row.selection.difficulty, 'author_estimate'),
      task_types: row.selection.task_types,
      input: {
        kind: 'staged', root: row.workspace, manifest: row.input_manifest.path,
        digest: row.input_manifest.digest, task_path: taskPath, version: row.input_version,
        reassessment_digest: row.stages[1].update.digest,
      },
      assessment: {
        kind: row.evaluator.kind, public_criteria: reference(criteria), digest: canonicalDigest(row.evaluator.files),
        evaluator_files: row.evaluator.files,
      },
      criterionIds,
    };
  });
}

function externalEntries(registrations) {
  return registrations.map(row => ({
    id: row.id, title: row.title, domain: row.domain,
    ...withDifficulty('unassessed', 'no_difficulty_estimate'),
    task_types: ['implementation'],
    input: {
      kind: 'private', manifest: row.input_manifest.path, digest: row.input_manifest.digest,
      task_path: row.task_path, prompt_path: row.prompt.path, prompt_digest: row.prompt.digest,
      revision: row.revision, version: row.version,
    },
    assessment: { kind: 'access_controlled_acceptance_criteria', version: row.version, ...row.acceptance },
    criterionIds: row.acceptance_criterion_ids,
  }));
}

export function listEvaluationTasks({ difficulty, type, skill } = {}) {
  const skills = new Set(json('manifest.json').skills);
  assert.ok(difficulty === undefined || DIFFICULTIES.has(difficulty), `unknown difficulty: ${difficulty}`);
  assert.ok(type === undefined || TYPES.has(type), `unknown task type: ${type}`);
  assert.ok(skill === undefined || skills.has(skill), `unknown skill: ${skill}`);

  const registration = readEvaluationTaskRegistrations();
  const entries = [...primaryEntries(), ...externalEntries(registration.external),
    ...businessEntries(), ...stagedEntries(registration.challenges)];
  const definitions = json('benchmarks/evaluation-observations.json');
  assert.equal(new Set(entries.map(row => row.id)).size, entries.length, 'duplicate evaluation task ID');
  assert.deepEqual(Object.keys(definitions).sort(), entries.map(row => row.id).sort(), 'evaluation observations must cover the current catalog');

  return entries.map(({ criterionIds, ...task }) => {
    assert.ok(DIFFICULTIES.has(task.difficulty) && task.domain && task.task_types?.length
      && task.task_types.every(type => TYPES.has(type)), `invalid metadata for ${task.id}`);
    const observations = Object.entries(definitions[task.id]).map(([criterion_id, entry]) => {
      assert.ok(criterionIds.includes(criterion_id), `unknown assessment item in ${task.id}: ${criterion_id}`);
      assert.ok(entry.observation?.trim() && entry.skills?.length && entry.skills.every(id => skills.has(id)),
        `invalid skill observation in ${task.id}: ${criterion_id}`);
      return { criterion_id, ...entry };
    });
    assert.ok(observations.length, `missing skill observations in ${task.id}`);
    return { ...task, observations };
  }).filter(task => (difficulty === undefined || task.difficulty === difficulty)
    && (type === undefined || task.task_types.includes(type))
    && (skill === undefined || task.observations.some(item => item.skills.includes(skill))));
}


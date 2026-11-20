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
    const root = `benchmarks/task-revisions/${id}`;
    const manifest = join(root, 'input-manifest.json');
    const taskPath = join(root, 'task.md');
    const inventory = json(manifest);
    const rubric = reference(join(root, 'rubric.json'));
    assert.equal(rubric.digest, `sha256:${inventory.rubric_sha256}`, `stale public rubric for ${id}`);
    return {
      id, title: title(taskPath), domain: row.domain,
      ...withDifficulty(row.difficulty.replace('-', '_'), 'portfolio_estimate'),
      task_types: TYPE_BY_CLASS[row.task_class],
      input: { kind: 'primary', root, manifest, digest: digest(manifest), task_path: 'task.md', version: inventory.version },
      assessment: { kind: 'primary_revision_criteria', ...rubric },
    };
  });
}

function businessEntries() {
  const catalog = json('benchmarks/challenge-candidates/business-five-v3-decisions/catalog.json');
  return catalog.tasks.map(row => {
    const manifestPath = join(businessRoot, row.input_manifest);
    const inputDigest = digest(manifestPath);
    const taskRoot = join(businessRoot, dirname(row.task_path));
    const sources = [
      join(taskRoot, 'acceptance.md'), join(taskRoot, 'contract.md'), join(taskRoot, 'nonfunctional.md'),
      join(businessRoot, row.decision_path),
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
    const assessment = { kind: 'public_acceptance_criteria', version: catalog.version, sources,
      input_manifest_digest: inputDigest };
    return {
      id: row.id, title: row.title, domain: row.primary_axis,
      ...withDifficulty('unassessed', 'no_difficulty_estimate'),
      task_types: ['implementation'],
      input: {
        kind: 'business', root: businessRoot, manifest: row.input_manifest, digest: inputDigest,
        task_path: row.task_path, version: catalog.version,
        prompts: { one_shot: row.one_shot_prompt, goal_with_pr: row.goal_with_pr_prompt },
      },
      assessment: { ...assessment, digest: canonicalDigest(assessment) },
    };
  });
}

function stagedEntries(registrations) {
  return registrations.map(({ selection, ...row }) => {
    const isReview = row.series === 'review-ceiling-v1';
    const taskPath = 'task.md';
    const criteria = isReview ? reviewProtocol : join(row.workspace, 'brief/rubric.json');
    return {
      id: row.id, title: title(join(row.workspace, taskPath)), domain: selection.domain,
      ...withDifficulty(selection.difficulty, 'author_estimate'),
      difficulty_source: selection.difficulty_source,
      task_types: selection.task_types,
      input: {
        kind: 'staged', root: row.workspace, manifest: row.input_manifest.path,
        digest: row.input_manifest.digest, task_path: taskPath, version: row.input_version,
        registration_digest: canonicalDigest(row), reassessment_digest: row.stages[1].update.digest,
      },
      assessment: {
        kind: row.evaluator.kind, public_criteria: reference(criteria), digest: canonicalDigest(row.evaluator.files),
        evaluator_files: row.evaluator.files,
      },
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
      archive_api_path: `repositories/${row.github_repository_id}/tarball/${row.revision}`,
    },
    assessment: { kind: 'access_controlled_acceptance_criteria', version: row.version, ...row.acceptance },
    privateObservations: row.observations,
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
  assert.equal(new Set(entries.map(row => row.id)).size, entries.length, 'duplicate evaluation task ID');
  const calibration = registration.calibration;
  assert.ok(Number.isSafeInteger(calibration.github_repository_id) && /^[a-f0-9]{40}$/u.test(calibration.revision),
    'calibration must identify a fixed evaluator repository revision');

  return entries.map(({ privateObservations, ...task }) => {
    assert.ok(DIFFICULTIES.has(task.difficulty) && task.domain && task.task_types?.length
      && task.task_types.every(type => TYPES.has(type)), `invalid metadata for ${task.id}`);
    const rubricPath = `benchmarks/task-revisions/${task.id}/rubric.json`;
    const criteria = privateObservations ?? json(rubricPath).criteria;
    assert.ok(Array.isArray(criteria) && criteria.length && new Set(criteria.map(item => item.id)).size === criteria.length,
      `missing or duplicate criteria in ${task.id}`);
    const observations = criteria.map(({ id: criterion_id, ...entry }) => {
      assert.ok(typeof criterion_id === 'string' && criterion_id.length && entry.observation?.trim() &&
        Number.isSafeInteger(entry.points) && entry.points > 0 && entry.skills?.length &&
        entry.skills.every(id => skills.has(id)) && [undefined, true].includes(entry.requires_delivery) && [undefined, 'product', 'submission'].includes(entry.group),
        `invalid skill observation in ${task.id}: ${criterion_id}`);
      return { criterion_id, ...entry };
    });
    const primary = task.input.kind === 'primary';
    if (primary) assert.equal(criteria.reduce((sum, item) => sum + item.points, 0), 10, `primary maximum: ${task.id}`);
    const assessorRevision = calibration.task_revisions?.[task.id] ?? calibration.revision;
    assert.match(assessorRevision, /^[a-f0-9]{40}$/u, 'invalid per-task assessor revision');
    const assessment = { ...task.assessment, native_digest: task.assessment.digest,
      input_contract_digest: canonicalDigest(task.input), observations_digest: canonicalDigest(observations),
      scoring_scope: primary ? 'task' : 'supplemental',
      rubric: privateObservations ? { ...task.assessment } : reference(rubricPath),
      calibration: { github_repository_id: calibration.github_repository_id, revision: assessorRevision, path: `task-revisions/${task.id}` } };
    return { ...task, assessment: { ...assessment, digest: canonicalDigest(assessment) }, observations };
  }).filter(task => (difficulty === undefined || task.difficulty === difficulty)
    && (type === undefined || task.task_types.includes(type))
    && (skill === undefined || task.observations.some(item => item.skills.includes(skill))));
}

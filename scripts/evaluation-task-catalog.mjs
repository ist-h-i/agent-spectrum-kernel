import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

const source = resolve(import.meta.dirname, '..');
const registrationsPath = 'benchmarks/evaluation-tasks.json';
const types = new Set(['review', 'design', 'investigation', 'implementation', 'documentation', 'test', 'handoff']);
const difficulties = new Set(['easy', 'easy_medium', 'medium', 'medium_hard', 'hard', 'expert', 'unassessed']);
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const revisionPattern = /^[a-f0-9]{40}$/u;
const studyFields = new Set(['id', 'report', 'report_digest', 'source_revision', 'protected_revision', 'model', 'reasoning_effort', 'runtime', 'limitations']);
const resultFields = new Set(['input_version', 'input_digest', 'assessment_digest', 'maximum_points', 'score_group', 'conditions', 'caveat']);
const conditionFields = new Set(['condition', 'scores', 'skill']);
const scoreGroups = new Set(['task', 'challenge', 'product', 'submission']);
const read = path => readFileSync(join(source, path));
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'), path);
const reference = path => ({ path, digest: 'sha256:' + createHash('sha256').update(read(path)).digest('hex') });
const directory = id => `benchmarks/task-revisions/${id}`;

export function readEvaluationTaskRegistrations() {
  const data = json(registrationsPath);
  assert.equal(data.kind, 'evaluation_task_registrations_v2');
  assert.ok(Array.isArray(data.tasks) && data.tasks.length);
  assert.equal(new Set(data.tasks.map(row => row.id)).size, data.tasks.length, 'duplicate evaluation task ID');
  assert.equal(new Set(data.tasks.map(row => row.catalog_id)).size, data.tasks.length, 'duplicate catalog ID');
  assert.ok(data.labels.length && new Set(data.labels).size === data.labels.length
    && data.labels.every(label => /^[a-z]+(?:-[a-z]+)*$/u.test(label)), 'invalid catalog label vocabulary');
  for (const row of data.tasks) {
    if (row.protected_revision !== undefined) assert.match(row.protected_revision, revisionPattern, `invalid protected revision for ${row.id}`);
    assert.match(row.catalog_id, /^ASK-(?!000$)(?:[0-9]{3}|[1-9][0-9]{3,})$/u);
    assert.ok(row.labels?.length && new Set(row.labels).size === row.labels.length
      && row.labels.every(label => data.labels.includes(label)), `invalid labels for ${row.id}`);
  }
  assert.ok(Number.isSafeInteger(data.assets.github_repository_id), 'protected asset repository ID required');
  assert.match(data.assets.revision, revisionPattern, 'protected asset revision required');
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

function protectedInputRevision({ github_repository_id, revision }) {
  return { revision, archive_api_path: `repositories/${github_repository_id}/tarball/${revision}` };
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
    ...(kind === 'private' ? protectedInputRevision(assets) : {}),
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

function studyResultsByTask(studies, tasks) {
  const byTask = new Map(tasks.map(task => [task.id, []]));
  assert.equal(new Set(studies.map(study => study.id)).size, studies.length, 'duplicate model study ID');
  for (const { results, ...study } of studies) {
    assert.ok(Object.keys(study).every(key => studyFields.has(key)), 'unexpected model study field');
    assert.ok([study.id, study.report, study.model, study.reasoning_effort, study.runtime].every(value => typeof value === 'string' && value.trim())
      && study.limitations?.length && study.limitations.every(note => typeof note === 'string' && note.trim()), 'model study provenance required');
    assert.match(study.report_digest, digestPattern);
    assert.match(study.source_revision, revisionPattern);
    assert.match(study.protected_revision, revisionPattern);
    assert.ok(Array.isArray(results) && results.length, 'empty study task inventory');
    const taskGroups = new Set();
    for (const { task_id, ...result } of results) {
      assert.ok(Object.keys(result).every(key => resultFields.has(key)), 'unexpected model result field');
      assert.ok(byTask.has(task_id) && result.input_version?.trim(), 'model result must identify the task and edition');
      const group = result.score_group ?? 'task';
      assert.ok(scoreGroups.has(group), 'unknown model score group');
      const key = `${task_id}/${group}`;
      assert.ok(!taskGroups.has(key), `duplicate study task and score group: ${key}`);
      taskGroups.add(key);
      assert.match(result.input_digest, digestPattern);
      assert.match(result.assessment_digest, digestPattern);
      assert.ok(Number.isSafeInteger(result.maximum_points) && result.maximum_points > 0, 'model result needs a positive raw score maximum');
      assert.ok(result.conditions.length && new Set(result.conditions.map(row => row.condition)).size === result.conditions.length,
        'duplicate or missing study conditions');
      const conditions = result.conditions.map(condition => {
        const { scores } = condition;
        assert.ok(Object.keys(condition).every(key => conditionFields.has(key)), 'unexpected model condition field');
        assert.ok(condition.condition?.trim() && Array.isArray(scores) && scores.length
          && scores.every(score => score === null || (result.score_group === 'challenge' ? Number.isFinite(score) : Number.isSafeInteger(score))
            && score >= 0 && score <= result.maximum_points),
        `invalid model scores for ${task_id}`);
        return { ...condition, trial_count: scores.length, scored_count: scores.filter(score => score !== null).length };
      });
      byTask.get(task_id).push({ ...study, ...result, conditions });
    }
  }
  return byTask;
}

function observationEdition(observation, input, assessment) {
  if (observation.input_version !== input.version || observation.input_digest !== input.digest) return 'previous_input';
  const { digest, calibration, ...definition } = assessment;
  if (observation.protected_revision === calibration.revision) {
    return observation.assessment_digest === digest ? 'current' : 'previous_assessment';
  }
  const earlierCalibration = { ...calibration, revision: observation.protected_revision };
  const earlierInput = input.kind === 'private' ? { ...input, ...protectedInputRevision(earlierCalibration) } : input;
  const earlier = { ...definition, calibration: earlierCalibration, input_contract_digest: canonicalDigest(earlierInput) };
  return observation.assessment_digest === canonicalDigest(earlier) ? 'previous_protected_revision' : 'previous_assessment';
}

function decimalRatio(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(whole + fraction);
  const places = fraction.length - Number(exponent);
  return places >= 0
    ? { numerator: digits, denominator: 10n ** BigInt(places) }
    : { numerator: digits * 10n ** BigInt(-places), denominator: 1n };
}

function compareRatios(a, b) {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

function parseScoreRange(value) {
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/u.exec(value);
  assert.ok(match, '--score-range must be MIN-MAX between 0 and 100');
  const minimum = decimalRatio(match[1]), maximum = decimalRatio(match[2]);
  assert.ok(compareRatios(minimum, maximum) <= 0n && maximum.numerator <= 100n * maximum.denominator,
    '--score-range requires 0 <= MIN <= MAX <= 100');
  return { minimum, maximum };
}

function medianPercent(ordered, maximum) {
  const lower = decimalRatio(ordered[Math.floor((ordered.length - 1) / 2)]);
  const upper = decimalRatio(ordered[Math.floor(ordered.length / 2)]);
  return {
    numerator: 50n * (lower.numerator * upper.denominator + upper.numerator * lower.denominator),
    denominator: BigInt(maximum) * lower.denominator * upper.denominator,
  };
}

function displayPercent({ numerator, denominator }) {
  if (numerator === 0n) return 0;
  // Round only the returned JSON number. Range selection uses the exact fraction.
  const places = Math.max(0, String(denominator).length - String(numerator).length) + 20;
  return Number(`${numerator * 10n ** BigInt(places) / denominator}e-${places}`);
}

function selectMeasurements(observations, { model, effort, condition, range }) {
  const matches = [];
  for (const study of observations) {
    if (study.edition !== 'current' || (model !== undefined && study.model !== model)
      || (effort !== undefined && study.reasoning_effort !== effort)) continue;
    const conditions = [];
    for (const series of study.conditions) {
      if (!series.scored_count || (condition !== undefined && series.condition !== condition)) continue;
      const ordered = series.scores.filter(score => score !== null).sort((a, b) => a - b);
      const percent = medianPercent(ordered, study.maximum_points);
      if (range && (compareRatios(percent, range.minimum) < 0n || compareRatios(percent, range.maximum) > 0n)) continue;
      conditions.push({ ...series, median_percent: displayPercent(percent) });
    }
    if (conditions.length) matches.push({ ...study, conditions });
  }
  return matches;
}

export function listEvaluationTasks({ id: selection, difficulty, type, labels = [], skill, model, effort, condition, scoreRange } = {}) {
  const skills = new Set(json('manifest.json').skills);
  assert.ok(difficulty === undefined || difficulties.has(difficulty), `unknown difficulty: ${difficulty}`);
  assert.ok(type === undefined || types.has(type), `unknown task type: ${type}`);
  assert.ok(skill === undefined || skills.has(skill), `unknown skill: ${skill}`);
  const { tasks, assets, labels: vocabulary, model_studies } = readEvaluationTaskRegistrations();
  for (const label of labels) assert.ok(vocabulary.includes(label), `unknown label: ${label}`);
  const measured = studyResultsByTask(model_studies, tasks);
  const empiricalFilter = [model, effort, condition, scoreRange].some(value => value !== undefined);
  const range = scoreRange === undefined ? undefined : parseScoreRange(scoreRange);
  const matchesId = task => selection === undefined || task.id === selection || task.catalog_id === selection;
  assert.ok(tasks.some(matchesId), `unknown evaluation task: ${selection}`);
  return tasks.map(row => {
    const { id, catalog_id, domain, task_types, labels, difficulty, difficulty_basis, difficulty_source } = row;
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(difficulties.has(difficulty) && domain && task_types?.length
      && new Set(task_types).size === task_types.length && task_types.every(type => types.has(type))
      && (difficulty === 'unassessed' ? difficulty_basis === 'no_difficulty_estimate' : ['portfolio_estimate', 'author_estimate'].includes(difficulty_basis)),
    `invalid metadata for ${id}`);
    const runner = row.runner && describePracticalChallenge(row);
    const taskAssets = row.protected_revision ? { ...assets, revision: row.protected_revision } : assets;
    const input = describeInput(row, taskAssets, runner);
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
    const assessment = assessmentDefinition(row, taskAssets, input, observations, runner);
    const studies = measured.get(id).map(observation => {
      const edition = observationEdition(observation, input, assessment);
      const score_group = observation.score_group ?? 'task';
      if (edition === 'current' || edition === 'previous_protected_revision') {
        const group = observations.filter(item => (item.group ?? 'task') === score_group);
        const maximum = score_group === 'challenge' ? runner?.evaluator.maximum : group.reduce((total, item) => total + item.points, 0);
        assert.ok(maximum === observation.maximum_points,
          `model score maximum must match the registered rubric group for ${id}`);
      }
      return { ...observation, score_group, edition };
    });
    const difficulty_observations = empiricalFilter ? selectMeasurements(studies, { model, effort, condition, range }) : studies;
    return { id, catalog_id, title, domain, primary_type: task_types[0], task_types, labels, difficulty, difficulty_basis,
      ...(difficulty_source ? { difficulty_source } : {}),
      difficulty_observations, input, assessment, observations };
  }).filter(task => matchesId(task) && (difficulty === undefined || task.difficulty === difficulty)
    && (type === undefined || task.task_types.includes(type))
    && labels.every(label => task.labels.includes(label))
    && (!empiricalFilter || task.difficulty_observations.length)
    && (skill === undefined || task.observations.some(item => item.skills.includes(skill))));
}

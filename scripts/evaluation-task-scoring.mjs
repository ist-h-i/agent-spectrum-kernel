import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { listEvaluationTasks } from './evaluation-task-catalog.mjs';
import { inspectPracticalChallengeScoreHandoff } from './practical-challenge-evaluation.mjs';
import { evaluationRelativePath, readPrimaryRevision, resolveProtectedEvaluationAsset } from './evaluation-task-inputs.mjs';
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from './ask-benchmark-atomic-publication.mjs';

const boundedRead = (path, label) => readStableFile(path, label, 256 * 1024 * 1024);
const json = (path, label) => parseJsonRejectDuplicateKeys(boundedRead(path, label).bytes.toString('utf8'), label);
const safePath = value => typeof value === 'string' && !/[:\\\x00]/u.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..');
const fileSetDigest = files => canonicalDigest([...files].map(([path, digest]) => ({ path, digest })));
const freezePath = root => join(root, 'initial-submission.json');

function inventory(root) {
  assertNoSymlinkPathSegments(root, 'submitted directory');
  const files = new Map();
  function visit(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      if (name === '.git') continue;
      const relative = prefix + name, path = join(directory, name), stat = lstatSync(path);
      assert.ok(safePath(relative) && !stat.isSymbolicLink(), 'submission requires regular relative file paths');
      if (stat.isDirectory()) visit(path, `${relative}/`);
      else files.set(relative, boundedRead(path, 'submission file').rawByteDigest);
    }
  }
  visit(root, '');
  return files;
}

function deliveryDigest(path) {
  if (!existsSync(path)) return null;
  assertNoSymlinkPathSegments(path, 'host delivery');
  assert.ok(boundedRead(join(path, 'answer.md'), 'submitted final answer').bytes.toString('utf8').trim(),
    'host delivery needs the final answer in answer.md');
  return fileSetDigest(inventory(path));
}

function fixedChanges(task, workspace, current) {
  const { files, editable } = readPrimaryRevision(task.id, task.input);
  const allowed = new Set(editable), basePaths = new Set(files.map(file => file.path));
  const changes = [];
  for (const { path, bytes } of files) {
    if (allowed.has(path)) continue;
    if (!current.has(path)) { changes.push({ path, change: 'removed' }); continue; }
    const actual = boundedRead(join(workspace, path), 'fixed candidate input').bytes;
    if (bytes.equals(actual)) continue;
    if (allowed.has(`${path}#json-block`)) {
      const outside = content => {
        const block = /(^```json[ \t]*\r?\n)([\s\S]*?)(^ {0,3}`{3,}[ \t]*\r?$)/gmu;
        return [...content.matchAll(block)].length === 1 ? content.replace(block, '$1<example>\n$3') : null;
      };
      const before = outside(bytes.toString('utf8'));
      if (before !== null && before === outside(actual.toString('utf8'))) continue;
    }
    changes.push({ path, change: 'modified' });
  }
  for (const path of current.keys()) if (!basePaths.has(path) && !allowed.has(path)) changes.push({ path, change: 'added' });
  return changes;
}

function inspectInitial(root) {
  const directory = resolve(root);
  assertNoSymlinkPathSegments(directory, 'evaluation root');
  const preparation = json(join(directory, 'evaluation-preparation.json'), 'evaluation preparation');
  const task = listEvaluationTasks().find(row => row.id === preparation.task_id);
  assert.ok(task, 'unknown prepared task');
  assert.deepEqual(preparation.input, task.input, 'prepared input is from another version');
  assert.deepEqual(preparation.assessment, task.assessment, 'prepared assessment is from another version');
  const workspace = join(realpathSync(directory), 'workspace');
  assert.equal(preparation.workspace, workspace, 'preparation workspace changed');
  assertNoSymlinkPathSegments(workspace, 'submission workspace');
  const files = inventory(workspace);
  const delivered = deliveryDigest(join(directory, 'delivery'));
  const subject = { task_id: task.id, input_digest: task.input.digest, assessment_digest: task.assessment.digest,
    submission_digest: fileSetDigest(files), delivery_digest: delivered };
  return { directory, preparation, task, workspace, files, subject };
}

export function freezeEvaluationInitialSubmission(root) {
  const { directory, task, subject } = inspectInitial(root);
  assert.ok(task.input.followup, 'this task has no separately supplied follow-up');
  assert.ok(subject.delivery_digest, 'save the initial final answer before freezing the submission');
  const frozen = { kind: 'evaluation_initial_submission_v1', subject };
  publishJsonAtomicNoReplace({ outputPath: freezePath(directory), artifact: frozen, label: 'initial submission freeze' });
  return frozen;
}

function assertFrozenInitial(state) {
  const frozen = json(freezePath(state.directory), 'initial submission freeze');
  assert.equal(frozen.kind, 'evaluation_initial_submission_v1');
  assert.deepEqual(frozen.subject, state.subject, 'frozen initial submission changed');
}

export function prepareEvaluationFollowup(root, assetsRoot) {
  const initial = inspectInitial(root);
  const { task, directory, workspace, files, subject } = initial;
  const followup = task.input.followup;
  assert.ok(followup, 'this task has no separately supplied follow-up');
  if (followup.working_directory !== '.') evaluationRelativePath(followup.working_directory);
  assertFrozenInitial(initial);
  const destination = assertAtomicOutputAbsent(join(directory, 'followup'), 'evaluation follow-up');
  const assets = new Map(followup.files.map(ref => {
    const target = evaluationRelativePath(ref.target);
    return [target, resolveProtectedEvaluationAsset(assetsRoot, ref, [directory])];
  }));
  assert.equal(assets.size, followup.files.length, 'duplicate follow-up path');
  assert.ok(assets.has(followup.task_path) && !files.has(followup.task_path), 'follow-up prompt would replace submitted evidence');
  for (const path of assets.keys()) assert.ok(path === followup.task_path || files.has(path), 'follow-up overlay requires an existing input file');

  const pending = mkdtempSync(join(directory, '.followup-'));
  try {
    const output = join(pending, 'workspace');
    mkdirSync(output, { mode: 0o700 });
    for (const [path, digest] of files) {
      const file = boundedRead(join(workspace, path), 'frozen submitted file');
      assert.equal(file.rawByteDigest, digest, 'frozen initial submission changed');
      const target = join(output, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, assets.get(path)?.bytes ?? file.bytes, { flag: 'wx', mode: 0o600 });
    }
    writeFileSync(join(output, followup.task_path), assets.get(followup.task_path).bytes, { flag: 'wx', mode: 0o600 });
    const ready = { kind: 'evaluation_followup_preparation_v1', subject,
      files: Object.fromEntries(inventory(output)), manifest_digest: canonicalDigest(followup) };
    writeFileSync(join(pending, 'preparation.json'), JSON.stringify(ready, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    assertFrozenInitial(inspectInitial(directory));
    assertAtomicOutputAbsent(destination, 'evaluation follow-up');
    renameSync(pending, destination);
    const copied = join(destination, 'workspace');
    return { task_id: task.id, workspace: copied, working_directory: join(copied, followup.working_directory),
      task_file: join(copied, followup.task_path), manifest_digest: ready.manifest_digest };
  } finally {
    rmSync(pending, { recursive: true, force: true });
  }
}

function inspectFollowup(initial) {
  const { directory, task, subject } = initial;
  const root = join(directory, 'followup');
  if (!existsSync(root)) return { digest: null };
  assertFrozenInitial(initial);
  const prepared = json(join(root, 'preparation.json'), 'follow-up preparation');
  assert.equal(prepared.kind, 'evaluation_followup_preparation_v1');
  assert.deepEqual(prepared.subject, subject, 'follow-up preparation has a different initial submission');
  assert.equal(prepared.manifest_digest, canonicalDigest(task.input.followup), 'follow-up version changed');
  const delivered = deliveryDigest(join(root, 'delivery'));
  const files = inventory(join(root, 'workspace'));
  const authorised = new Map(task.input.followup.files.map(ref => [ref.target, ref.digest]));
  const expected = new Map(initial.files);
  for (const [path, digest] of authorised) {
    expected.set(path, digest);
    assert.equal(files.get(path), digest, 'follow-up prompt or fixture changed');
  }
  assert.deepEqual(prepared.files, Object.fromEntries(expected), 'follow-up base inventory changed');
  const editable = task.input.kind === 'primary' ? new Set(readPrimaryRevision(task.id, task.input).editable) : null;
  const changed = [...new Set([...expected.keys(), ...files.keys()])]
    .filter(path => files.get(path) !== expected.get(path) && editable && !editable.has(path));
  return { digest: delivered ? canonicalDigest({ preparation: prepared.manifest_digest,
    submission: fileSetDigest(files), delivery: delivered }) : null, fixed_input_changes: changed };
}

export function inspectEvaluationSubmission(root) {
  const initial = inspectInitial(root);
  const { directory, preparation, task, workspace, files, subject } = initial;
  const staged = task.input.kind === 'staged';
  let handoffDigest = null;
  let stageEvidence;
  if (staged && existsSync(join(directory, 'score-handoff.json'))) {
    const packet = inspectPracticalChallengeScoreHandoff(directory);
    assert.equal(packet.fixture_id, task.id, 'handoff task differs from selection');
    assert.equal(packet.manifest_digest, preparation.staged_run?.manifest_digest, 'handoff differs from the selected staged run');
    handoffDigest = canonicalDigest(packet);
    stageEvidence = packet.evidence_kind;
  }
  if (staged) Object.assign(subject, { stage_handoff_digest: handoffDigest, stage_evidence_kind: stageEvidence ?? null });
  const followup = task.input.followup ? inspectFollowup(initial) : undefined;
  if (followup) subject.followup_digest = followup.digest;
  return { subject, file_count: files.size, fixed_input_changes: task.input.kind === 'primary' ? fixedChanges(task, workspace, files) : null,
    ...(followup ? { followup_fixed_input_changes: followup.fixed_input_changes ?? null } : {}),
    scoring_scope: task.assessment.scoring_scope, criteria: task.observations };
}

function checkedEvidence(directory, refs) {
  assert.ok(Array.isArray(refs) && refs.length, 'observed judgments require saved evidence files');
  for (const ref of refs) {
    assert.ok(safePath(ref.path), 'invalid evidence path');
    assert.equal(boundedRead(join(directory, ref.path), 'assessment evidence').rawByteDigest, ref.digest, 'assessment evidence changed');
  }
  return refs;
}

// Arithmetic over an independent assessor's observations. Does not infer semantic or UI success.
export function scoreEvaluationSubmission(root, recordPath) {
  const { subject, criteria, scoring_scope, fixed_input_changes, followup_fixed_input_changes } = inspectEvaluationSubmission(root);
  const path = resolve(recordPath), record = json(path, 'assessor record');
  assert.deepEqual(record.subject, subject, 'assessor record is for a different submission or version');
  assert.ok(Array.isArray(record.items), 'assessor items must be an array');
  const judgments = new Map(record.items.map(item => [item.criterion_id, item]));
  assert.equal(judgments.size, record.items.length, 'duplicate criterion judgment');
  const ids = new Set(criteria.map(item => item.criterion_id));
  assert.ok([...judgments.keys()].every(id => ids.has(id)), 'unknown criterion judgment');
  const results = criteria.map(({ criterion_id, points: maximum, group, requires_delivery, requires_followup }) => {
    const item = judgments.get(criterion_id);
    const reason = item?.reason ?? (item ? '' : 'No observation supplied.');
    assert.ok(typeof reason === 'string' && reason.trim(), 'a judgment needs its observation or missing evidence');
    if (item) assert.ok(item.points === null || (Number.isInteger(item.points) && item.points >= 0 && item.points <= maximum), 'points outside criterion range');
    const points = item?.points ?? null;
    if (points !== null) {
      assert.ok(!requires_delivery || subject.delivery_digest, 'submitted final answer is required for this judgment');
      assert.ok(!requires_followup || subject.followup_digest, 'complete the protected follow-up before judging this criterion');
      assert.ok(subject.stage_handoff_digest !== null, 'complete and verify the staged score handoff before judging stage outcomes');
    }
    const evidence = points === null && !item?.evidence?.length ? [] : checkedEvidence(dirname(path), item.evidence);
    return { criterion_id, group: group ?? 'task', maximum, points, status: points === null ? 'unobserved' : 'observed', reason, evidence };
  });
  const groups = {};
  for (const group of new Set(results.map(row => row.group))) {
    const items = results.filter(row => row.group === group);
    const missing = items.filter(row => row.points === null).length;
    const confirmed = items.reduce((sum, row) => sum + (row.points ?? 0), 0);
    groups[group] = { maximum: items.reduce((sum, row) => sum + row.maximum, 0), confirmed_points: confirmed,
      points: missing ? null : confirmed, unobserved: missing };
  }
  const critical = record.critical_violations ?? [];
  assert.ok(Array.isArray(critical), 'critical violations must be an array');
  assert.ok(!critical.length || subject.stage_handoff_digest !== null, 'a staged violation requires a verified score handoff');
  for (const entry of critical) {
    assert.ok(typeof entry.impact === 'string' && entry.impact.trim(), 'critical violation requires observed impact');
    checkedEvidence(dirname(path), entry.evidence);
  }
  return { subject, scoring_scope, groups, results, fixed_input_changes,
    ...(followup_fixed_input_changes === undefined ? {} : { followup_fixed_input_changes }),
    critical_violations: critical, model_calls: 0 };
}

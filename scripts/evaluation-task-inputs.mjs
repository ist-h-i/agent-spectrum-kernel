import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertAtomicOutputAbsent } from './ask-benchmark-atomic-publication.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

const sourceRoot = realpathSync(resolve(import.meta.dirname, '..'));
const maximumFileBytes = 16 * 1024 * 1024;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

function relativeInputPath(path) {
  assert.ok(typeof path === 'string' && !/[:\\\x00]/u.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'),
    'safe relative evaluation input path required');
  return path;
}

function canonicalDirectory(path, label) {
  assert.ok(typeof path === 'string' && path.length > 0, `${label} directory required`);
  const directory = resolve(path);
  assertNoSymlinkPathSegments(directory, label);
  assert.ok(lstatSync(directory).isDirectory(), `${label} must be a directory`);
  return realpathSync(directory);
}

function contains(parent, child) {
  const path = relative(parent, child);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

function assertSeparated(first, second) {
  assert.ok(!contains(first, second) && !contains(second, first), 'evaluation output and source directories overlap');
}

function pinnedFile(path, expectedDigest, label, size) {
  assert.match(expectedDigest ?? '', digestPattern, `${label} pin must be SHA-256`);
  const { bytes, rawByteDigest } = readStableFile(path, label, maximumFileBytes);
  assert.ok(rawByteDigest === expectedDigest, `${label} digest changed`);
  if (size !== undefined) assert.equal(bytes.length, size, `${label} length changed`);
  return bytes;
}

function pinnedManifest(path, digest) {
  return parseJsonRejectDuplicateKeys(pinnedFile(path, digest, 'evaluation input manifest').toString('utf8'), 'evaluation input manifest');
}

function inventoryPaths(entries) {
  assert.ok(Array.isArray(entries) && entries.length > 0, 'evaluation input inventory is empty or invalid');
  const paths = new Set(entries.map(row => relativeInputPath(row.path)));
  assert.equal(paths.size, entries.length, 'duplicate evaluation input path');
  return paths;
}

function readInputs(root, entries) {
  return entries.map(row => {
    const digest = `sha256:${row.sha256}`;
    const bytes = pinnedFile(join(root, row.path), digest, 'evaluation input', row.bytes);
    return { path: row.path, digest, bytes };
  });
}

function workspacePaths(root) {
  const files = [];
  function walk(directory, prefix) {
    for (const name of readdirSync(directory)) {
      const path = relativeInputPath(prefix + name);
      const source = join(directory, name);
      const status = lstatSync(source);
      if (status.isDirectory()) walk(source, `${path}/`);
      else {
        assert.ok(status.isFile(), 'non-regular staged evaluation input');
        files.push(path);
      }
    }
  }
  walk(root, '');
  return files.sort();
}

function readStagedInput({ id, root, manifest: path, digest, task_path: taskPath }) {
  assert.ok(isAbsolute(path), 'staged evaluation manifest must be absolute');
  const manifest = pinnedManifest(path, digest);
  assert.equal(manifest.fixture_id, id, 'staged evaluation manifest task changed');
  const paths = inventoryPaths(manifest.files);
  assert.ok(paths.has(relativeInputPath(taskPath)), 'staged evaluation task file missing');
  assert.deepEqual(workspacePaths(root), [...paths].sort(), 'frozen public challenge inventory changed');
  return readInputs(root, manifest.files);
}

export function verifyStagedEvaluationTaskInput(input) {
  const root = canonicalDirectory(input.root, 'staged evaluation source');
  return readStagedInput({ ...input, root })
    .map(({ path, digest }) => ({ path, digest }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

// The solver sees public scoring observations and weights. Skill mappings stay with the assessor.
export function primaryRevisionTaskText(task, criteria) {
  const rows = criteria.map(item => `- ${item.id} (${item.points} pts) — ${item.observation}`);
  return `${task.trimEnd()}\n\n## Scoring (10 points)\n\n${rows.join('\n')}\n`;
}

export function readPrimaryRevision(id, input) {
  const revision = join(sourceRoot, 'benchmarks/task-revisions', id);
  const base = join(sourceRoot, 'benchmarks/fixtures/checkpoint-b2', id);
  const manifest = pinnedManifest(join(revision, 'input-manifest.json'), input.digest);
  assert.equal(manifest.id, id);
  assert.equal(manifest.version, input.version);
  const paths = inventoryPaths(manifest.files);
  assert.ok(paths.has('task.md') && paths.has('workspace/package.json'), 'primary revision is incomplete');
  const rubric = pinnedManifest(join(revision, 'rubric.json'), `sha256:${manifest.rubric_sha256}`);
  const files = manifest.files.map(row => {
    assert.ok(row.source === 'revision' || row.source === 'inherited', 'invalid primary file source');
    assert.ok(row.path === 'task.md' || row.path.startsWith('workspace/'), 'unexpected primary input');
    const path = join(row.source === 'revision' ? revision : base, row.path);
    let bytes;
    if (row.path === 'task.md') {
      const source = readStableFile(path, 'primary task', maximumFileBytes).bytes.toString('utf8');
      bytes = Buffer.from(primaryRevisionTaskText(source, rubric.criteria));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, 'revised task digest changed');
      assert.equal(bytes.length, row.bytes);
    } else bytes = pinnedFile(path, `sha256:${row.sha256}`, 'primary revision input', row.bytes);
    return { path: row.path, bytes };
  });
  return { files, editable: manifest.editable, workingDirectory: 'workspace' };
}

function readBusinessInput(id, input, root, mode) {
  assert.ok(mode === 'one_shot' || mode === 'goal_with_pr', 'unsupported business delivery mode');
  const manifest = pinnedManifest(join(root, relativeInputPath(input.manifest)), input.digest);
  assert.equal(manifest.task_id, id, 'business input manifest task changed');
  assert.equal(manifest.version, input.version, 'business input version changed');
  const workingDirectory = `public/tasks/${id}`;
  assert.equal(manifest.working_directory, workingDirectory, 'business input working directory changed');
  const inventory = manifest.modes[mode];
  const paths = inventoryPaths(inventory.files);
  assert.equal(canonicalDigest(inventory.files), `sha256:${inventory.inventory_sha256}`, 'business input inventory digest changed');
  assert.ok([...paths].every(path => path.startsWith('public/common/') || path.startsWith(`${workingDirectory}/`)), 'business input outside selected task');
  const promptPath = relativeInputPath(input.prompts[mode]);
  assert.equal(dirname(relativeInputPath(input.task_path)), workingDirectory, 'business task file outside working directory');
  assert.equal(dirname(promptPath), workingDirectory, 'business prompt outside working directory');
  assert.ok(paths.has(input.task_path) && paths.has(promptPath), 'business evaluation task or prompt missing');
  return { files: readInputs(root, inventory.files), workingDirectory, promptPath };
}

function readPrivateInput(input, root, assessment) {
  const manifest = pinnedManifest(join(root, relativeInputPath(input.manifest)), input.digest);
  inventoryPaths(manifest.files);
  const entries = manifest.files.map(row => ({ ...row, path: `public/${row.path}` }));
  assert.ok(entries.some(row => row.path === relativeInputPath(input.task_path)), 'private evaluation task file missing');
  const criteria = entries.find(row => row.path === relativeInputPath(assessment.path));
  assert.ok(criteria && `sha256:${criteria.sha256}` === (assessment.native_digest ?? assessment.digest),
    'private acceptance criteria do not match the input manifest');
  const promptPath = relativeInputPath(input.prompt_path);
  assert.ok(!entries.some(row => row.path === promptPath), 'duplicate private prompt path');
  const prompt = pinnedFile(join(root, promptPath), input.prompt_digest, 'private evaluation prompt');
  const files = readInputs(root, entries);
  files.push({ path: promptPath, bytes: prompt });
  return { files, workingDirectory: dirname(input.task_path), promptPath };
}

// Validate the entire selected inventory before creating a fresh solver workspace.
export function prepareEvaluationTaskInput({ id, input, assessment }, output, { deliveryMode, logisticsSource } = {}) {
  assert.ok(['primary', 'business', 'staged', 'private'].includes(input.kind), 'unsupported evaluation input kind');
  assert.ok(deliveryMode === undefined || input.kind === 'business', 'delivery mode is only available for business inputs');
  assert.ok(logisticsSource === undefined || input.kind === 'private', 'logistics source is only available for the private input');
  const destination = assertAtomicOutputAbsent(output, 'evaluation output');
  const target = join(realpathSync(dirname(destination)), basename(destination));
  assertSeparated(sourceRoot, target);
  const root = input.kind === 'private' ? canonicalDirectory(logisticsSource, 'logistics source') : canonicalDirectory(input.root, 'evaluation source');
  assertSeparated(root, target);

  const selectedMode = input.kind === 'business' ? deliveryMode ?? 'one_shot' : undefined;
  let inventory;
  if (input.kind === 'primary') inventory = readPrimaryRevision(id, input);
  else if (input.kind === 'business') inventory = readBusinessInput(id, input, root, selectedMode);
  else if (input.kind === 'private') inventory = readPrivateInput(input, root, assessment);
  else inventory = { files: readStagedInput({ ...input, id, root }), workingDirectory: '.' };

  mkdirSync(target, { mode: 0o700 });
  const workspace = join(target, 'workspace');
  mkdirSync(workspace, { mode: 0o700 });
  for (const file of inventory.files) {
    const path = join(workspace, file.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, file.bytes, { flag: 'wx', mode: 0o600 });
  }
  return {
    workspace,
    working_directory: join(workspace, inventory.workingDirectory),
    task_file: join(workspace, input.task_path),
    ...(inventory.promptPath === undefined ? {} : { prompt_file: join(workspace, inventory.promptPath) }),
    file_count: inventory.files.length,
    input_manifest_digest: input.digest,
    ...(selectedMode === undefined ? {} : { delivery_mode: selectedMode }),
  };
}

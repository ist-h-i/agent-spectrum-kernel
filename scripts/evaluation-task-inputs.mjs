import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertAtomicOutputAbsent } from './ask-benchmark-atomic-publication.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { assertNoSymlinkPathSegments, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

export const evaluationSource = realpathSync(resolve(import.meta.dirname, '..'));
const maximumFileBytes = 16 * 1024 * 1024;
export const evaluationDigest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

export function evaluationRelativePath(path) {
  assert.ok(typeof path === 'string' && !/[:\\\x00]/u.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..'), 'safe relative evaluation path required');
  return path;
}

export function canonicalEvaluationDirectory(path, label) {
  assert.ok(typeof path === 'string' && path.length > 0, `${label} directory required`);
  const directory = resolve(path);
  assertNoSymlinkPathSegments(directory, label);
  assert.ok(lstatSync(directory).isDirectory(), `${label} must be a directory`);
  return realpathSync(directory);
}

function contains(parent, child) {
  const subpath = relative(parent, child);
  return !isAbsolute(subpath) && subpath !== '..' && !subpath.startsWith(`..${sep}`);
}

export function assertEvaluationSeparation(first, second) {
  assert.ok(!contains(first, second) && !contains(second, first), 'evaluation paths overlap');
}

export function evaluationFile(path, label, digest, size) {
  const result = readStableFile(path, label, maximumFileBytes);
  if (digest !== undefined) assert.equal(result.rawByteDigest, digest, `${label} digest changed`);
  if (size !== undefined) assert.equal(result.bytes.length, size, `${label} length changed`);
  return result;
}

export function resolveProtectedEvaluationAsset(assetsRoot, ref, separateFrom = []) {
  const root = canonicalEvaluationDirectory(assetsRoot, 'protected evaluation assets');
  for (const path of [evaluationSource, ...separateFrom]) assertEvaluationSeparation(root, path);
  const path = join(root, evaluationRelativePath(ref.path));
  assert.match(ref.digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'protected asset pin required');
  return { path, digest: ref.digest, bytes: evaluationFile(path, 'protected evaluation asset', ref.digest).bytes };
}

export function listEvaluationTree(root, prefix = '') {
  const paths = [];
  for (const name of readdirSync(join(root, prefix))) {
    const path = evaluationRelativePath(prefix ? prefix + '/' + name : name);
    const stat = lstatSync(join(root, path));
    if (stat.isDirectory()) paths.push(...listEvaluationTree(root, path));
    else {
      assert.ok(stat.isFile(), 'non-regular evaluation input');
      paths.push(path);
    }
  }
  return paths.sort();
}

// The solver receives the broad public observations and weights, without assessor examples or skill IDs.
export function primaryRevisionTaskText(task, criteria) {
  const rows = criteria.map(item => `- ${item.id} (${item.points} pts) — ${item.observation}`);
  return `${task.trimEnd()}\n\n## Scoring (10 points)\n\n${rows.join('\n')}\n`;
}

export function readEvaluationInventory({ id, input, assessment }, {
  deliveryMode = input.default_delivery, assetsRoot, checkoutRoot = evaluationSource,
} = {}) {
  assert.ok(['primary', 'business', 'staged', 'private'].includes(input.kind), 'unsupported evaluation input kind');
  assert.match(input.digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'evaluation input manifest pin required');
  assert.ok(input.delivery_modes.includes(deliveryMode), 'delivery mode is not registered for this task');
  const protectedInput = input.kind === 'private';
  const definitionRoot = protectedInput ? canonicalEvaluationDirectory(assetsRoot, 'protected evaluation assets') : checkoutRoot;
  if (protectedInput) assertEvaluationSeparation(definitionRoot, checkoutRoot);
  const root = canonicalEvaluationDirectory(join(definitionRoot, evaluationRelativePath(input.root ?? input.asset_path)), 'evaluation source');
  const manifestBytes = evaluationFile(join(definitionRoot, evaluationRelativePath(input.manifest)), 'evaluation input manifest', input.digest).bytes;
  const manifest = parseJsonRejectDuplicateKeys(manifestBytes.toString('utf8'), 'evaluation input manifest');
  assert.equal(manifest.kind, 'evaluation_input_manifest_v2');
  assert.equal(manifest.id, id, 'evaluation input belongs to a different task');
  assert.equal(manifest.version, input.version, 'evaluation input version changed');
  assert.deepEqual(Object.keys(manifest.modes), input.delivery_modes, 'evaluation delivery modes changed');

  const mode = manifest.modes[deliveryMode], { files: entries, task_path, working_directory, prompt_path } = mode;
  assert.ok(Array.isArray(entries) && entries.length, 'evaluation input inventory is empty or invalid');
  const paths = new Set(entries.map(row => evaluationRelativePath(row.path)));
  assert.equal(paths.size, entries.length, 'duplicate evaluation input path');
  assert.equal(task_path, input.task_path, 'evaluation task file changed');
  assert.ok(paths.has(task_path) && (!prompt_path || paths.has(evaluationRelativePath(prompt_path))), 'evaluation task or prompt missing');
  if (working_directory !== '.') {
    const workingPrefix = evaluationRelativePath(working_directory) + '/';
    assert.ok([...paths].some(path => path.startsWith(workingPrefix)), 'evaluation working directory missing');
  }
  if (input.kind === 'staged') assert.deepEqual(listEvaluationTree(root), [...paths].sort(), 'frozen initial inventory changed');
  if (assessment?.protected_criteria) {
    const ref = assessment.protected_criteria;
    assert.equal('sha256:' + entries.find(row => row.path === ref.path)?.sha256, ref.digest, 'protected acceptance pin differs from input');
  }

  let rubric;
  if (input.kind === 'primary') {
    assert.match(manifest.rubric_digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'evaluation rubric pin required');
    const data = evaluationFile(join(root, 'rubric.json'), 'evaluation rubric', manifest.rubric_digest).bytes;
    rubric = parseJsonRejectDuplicateKeys(data.toString('utf8'), 'evaluation rubric');
  }
  const files = entries.map(row => {
    const path = join(root, row.path);
    const digest = 'sha256:' + row.sha256;
    if (rubric && row.path === task_path) {
      const text = evaluationFile(path, 'primary task text').bytes.toString('utf8');
      const bytes = Buffer.from(primaryRevisionTaskText(text, rubric.criteria));
      assert.equal(evaluationDigest(bytes), digest, 'revised task digest changed');
      assert.equal(bytes.length, row.bytes);
      return { path: row.path, digest, bytes };
    }
    return { path: row.path, digest, bytes: evaluationFile(path, 'evaluation input', digest, row.bytes).bytes };
  });
  return { root, files, editable: manifest.editable, workingDirectory: working_directory, taskPath: task_path, promptPath: prompt_path, deliveryMode };
}

export function verifyStagedEvaluationTaskInput(registration, args) {
  const inventory = readEvaluationInventory({ id: registration.id, input: {
    kind: 'staged', root: registration.workspace, manifest: registration.input_manifest.path,
    digest: registration.input_manifest.digest, version: registration.input_version,
    task_path: 'task.md', delivery_modes: ['default'], default_delivery: 'default',
  } }, args);
  return inventory.files.map(({ path, digest }) => ({ path, digest }));
}

export function readPrimaryRevision(id, input) {
  return readEvaluationInventory({ id, input });
}

// Validate all files before creating a new solver workspace. Its parent stays host-only.
export function prepareEvaluationTaskInput(task, output, options = {}) {
  const destination = assertAtomicOutputAbsent(output, 'evaluation output');
  const target = join(realpathSync(dirname(destination)), basename(destination));
  assertEvaluationSeparation(evaluationSource, target);
  const inventory = readEvaluationInventory(task, options);
  assertEvaluationSeparation(inventory.root, target);
  if (options.assetsRoot) {
    assertEvaluationSeparation(canonicalEvaluationDirectory(options.assetsRoot, 'protected evaluation assets'), target);
  }

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
    task_file: join(workspace, inventory.taskPath),
    ...(inventory.promptPath ? { prompt_file: join(workspace, inventory.promptPath) } : {}),
    file_count: inventory.files.length,
    input_manifest_digest: task.input.digest,
    ...(inventory.deliveryMode === 'default' ? {} : { delivery_mode: inventory.deliveryMode }),
  };
}

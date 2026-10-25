#!/usr/bin/env node
// Controller-side public artifact preparation. This module never executes submissions.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest } from '../../../../scripts/ask-benchmark-materialize.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const version = 'ceiling-public-v1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const portable = path => path.split(sep).join('/');
const inside = (parent, path) => path === parent || path.startsWith(parent + sep);

function noLinks(path) {
  const absolute = resolve(path);
  let current = absolute;
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`symlink path: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function inventory(directory) {
  noLinks(directory);
  const files = [];
  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      const full = resolve(path, name), stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`symlink entry: ${name}`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && stat.nlink === 1) {
        const bytes = readFileSync(full);
        files.push({ path: portable(relative(directory, full)), sha256: digest(bytes), bytes: bytes.length });
      } else throw new Error(`not an independent regular file: ${name}`);
    }
  }
  walk(directory);
  return files;
}

export function candidates() { return readJson(resolve(root, 'catalog.json')).candidates; }

export function executionAdapterDigest() {
  const names = new Set(['public-workspace.mjs', 'candidate-worker.mjs', 'assertion-reporter.mjs', 'batch-executor.mjs']);
  const files = inventory(resolve(root, 'tools')).filter(file => names.has(file.path));
  if (files.length !== names.size) throw new Error('execution adapter inventory incomplete');
  return canonicalDigest(files);
}

function candidate(id) {
  const record = candidates().find(item => item.id === id);
  if (!record) throw new Error(`unknown ceiling candidate: ${id}`);
  return record;
}

export function isSubmission(path) {
  return path.startsWith('src/') || path.startsWith('test/added/') || path === 'RESULT.md';
}

function source(id) {
  const record = candidate(id);
  const workspace = resolve(root, 'workspaces', id);
  const files = inventory(workspace);
  for (const { path } of files) {
    if (!/^(src|spec|test|data|harness)\//u.test(path) && !['package.json', 'package-lock.json', 'RESULT.md'].includes(path)) {
      throw new Error(`file outside public allowlist: ${path}`);
    }
    if (path.split('/').some(segment => /^(\.git|node_modules|oracle|oracles|mutants|private|evaluator|evaluators)$/iu.test(segment))) {
      throw new Error(`nonpublic path: ${path}`);
    }
  }
  const task = readFileSync(resolve(root, record.task_path));
  const expected = [...files, { path: 'task.md', sha256: digest(task), bytes: task.length }].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = readJson(resolve(root, 'input-manifests', `${id}.json`));
  if (manifest.version !== version || manifest.id !== id || manifest.input_digest !== canonicalDigest(expected)
    || canonicalDigest(manifest.files) !== canonicalDigest(expected)) throw new Error(`public input manifest mismatch: ${id}`);
  return { workspace, task, manifest };
}

function newOutput(out) {
  const path = resolve(out);
  noLinks(path);
  if (inside(root, path)) throw new Error('output must be outside candidate package');
  // Existing outputs are never overwritten, including an incomplete prior preparation.
  mkdirSync(path, { recursive: false });
  return path;
}

function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }

export function prepare(id, out) {
  const { workspace, task, manifest } = source(id);
  const target = newOutput(out);
  for (const file of manifest.files) {
    if (file.path === 'task.md') continue;
    const destination = resolve(target, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(workspace, file.path), destination);
  }
  mkdirSync(resolve(target, 'test/added'), { recursive: true });
  writeFileSync(resolve(target, 'task.md'), task, { flag: 'wx' });
  return { id, workspace: target, input_digest: manifest.input_digest, ready_for_measurement: false };
}

export function verify(id, workspace) {
  const { manifest } = source(id);
  const actual = inventory(resolve(workspace));
  const baseline = new Map(manifest.files.map(file => [file.path, file]));
  const protectedFiles = manifest.files.filter(file => !isSubmission(file.path));
  const observed = new Map(actual.map(file => [file.path, file]));
  const violations = [];
  for (const file of protectedFiles) {
    if (canonicalDigest(file) !== canonicalDigest(observed.get(file.path) ?? null)) violations.push(`protected modified or missing: ${file.path}`);
  }
  for (const file of actual) {
    if (!baseline.has(file.path) && !isSubmission(file.path)) violations.push(`outside submission scope: ${file.path}`);
  }
  return { id, valid: violations.length === 0, violations, input_digest: manifest.input_digest,
    submission_digest: canonicalDigest(actual.filter(file => isSubmission(file.path))), files: actual };
}

export function freeze(id, workspace, out, metadata) {
  for (const field of ['trial_id', 'model', 'condition']) {
    if (typeof metadata?.[field] !== 'string' || !metadata[field].trim()) throw new Error(`missing ${field}`);
  }
  const observed = verify(id, workspace);
  const adapterDigest = executionAdapterDigest();
  if (!observed.valid) throw new Error(observed.violations.join('\n'));
  const target = newOutput(out);
  for (const file of observed.files) {
    const destination = resolve(target, 'workspace', file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(workspace, file.path), destination);
  }
  // Detect input changes during capture; the frozen bytes, rather than source paths,
  // are what downstream evaluators must consume.
  const frozen = verify(id, resolve(target, 'workspace'));
  if (!frozen.valid || canonicalDigest(observed.files) !== canonicalDigest(frozen.files) || adapterDigest !== executionAdapterDigest()) throw new Error('workspace or adapter changed during freeze');
  const record = { version, ...metadata, id, runtime: process.version, input_digest: observed.input_digest,
    submission_digest: observed.submission_digest, workspace_digest: canonicalDigest(frozen.files), execution_adapter_digest: adapterDigest, files: frozen.files,
    evaluator_reference: null, quality_score: null, safety_blocker: null, ready_for_measurement: false };
  writeJson(resolve(target, 'submission.json'), record);
  return record;
}

function args(argv) {
  const [command, ...rest] = argv, options = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || !rest[index + 1] || rest[index + 1].startsWith('--')) throw new Error('expected --name value');
    const name = rest[index].slice(2);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate option: ${name}`);
    options[name] = rest[index + 1];
  }
  return { command, options };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, options } = args(process.argv.slice(2));
    let result;
    if (command === 'list') result = candidates().map(({ id, title, ready_for_measurement }) => ({ id, title, ready_for_measurement }));
    else if (command === 'prepare' && options.id && options.out) result = prepare(options.id, options.out);
    else if (command === 'verify' && options.id && options.workspace) {
      result = verify(options.id, options.workspace);
      if (!result.valid) process.exitCode = 1;
    } else if (command === 'freeze' && options.id && options.workspace && options.out) {
      result = freeze(options.id, options.workspace, options.out, { trial_id: options['trial-id'], model: options.model, condition: options.condition });
    } else throw new Error('use list | prepare --id ID --out NEW_DIR | verify --id ID --workspace DIR | freeze --id ID --workspace DIR --out NEW_DIR --trial-id ID --model ID --condition ID');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

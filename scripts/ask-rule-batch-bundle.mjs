import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devNull } from 'node:os';
import { prepareUserComparison } from './ask-user-comparison-prepare.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_PATH = 'benchmarks/contracts/rule-batch/2.0.0';
const ORIGINAL = 'benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard';
export const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = message => { throw new Error(`rule_batch_bundle:${message}`); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const safePath = path => typeof path === 'string' && path.length > 0
  && !isAbsolute(path) && !path.includes('\\')
  && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

function regularBytes(root, path) {
  if (!safePath(path)) fail('unsafe_path');
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) fail('linked_asset');
  }
  const stat = lstatSync(current);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) fail('invalid_asset');
  return readFileSync(current);
}

function leafPaths(root, path) {
  const found = [];
  for (const name of readdirSync(join(root, path)).sort()) {
    const child = `${path}/${name}`, stat = lstatSync(join(root, child));
    if (stat.isSymbolicLink()) fail('linked_asset');
    if (stat.isDirectory()) found.push(...leafPaths(root, child));
    else if (stat.isFile()) found.push(child);
    else fail('invalid_asset');
  }
  return found;
}

const destination = path => {
  const local = path.slice(BUNDLE_PATH.length + 1);
  if (local.startsWith('seed/')) return `source/${local.slice(5)}`;
  if (local.startsWith('fixed/')) return `source/test/${local}`;
  if (local === 'task.md') return 'task.md';
  if (local === 'verification.json') return 'verification.json';
  if (local === 'requirements.json') return 'source/docs/requirements.json';
  return null; // qualification examples and history never enter model task roots
};

function bindingFor(checked) {
  return {
    contract_id: checked.manifest.contract_id, verifier_id: checked.manifest.verifier_id,
    judgment_id: checked.manifest.judgment_id, bundle_digest: checked.bundleDigest,
    seed_origin_commit: checked.manifest.original_source_commit,
    mutable_paths: ['src/', 'test/generated/'], fixed_test_paths: ['test/fixed/'],
  };
}

function materializedAssets(checked) {
  const files = new Map();
  for (const [path, bytes] of checked.assets) {
    if (!path.startsWith(`${BUNDLE_PATH}/`)) continue;
    const target = destination(path);
    if (target !== null) files.set(target, bytes);
  }
  files.set('source/contract-binding.json', Buffer.from(json(bindingFor(checked))));
  return files;
}

export function checkRuleBatchBundle(expectedDigest, repository = ROOT) {
  repository = realpathSync(repository);
  const raw = regularBytes(repository, `${BUNDLE_PATH}/bundle.json`);
  const bundleDigest = digest(raw);
  if (expectedDigest !== undefined && expectedDigest !== bundleDigest) fail('manifest_digest_mismatch');
  const manifest = JSON.parse(raw);
  if (manifest.format !== 'ask.rule-batch-bundle@1.0.0'
      || manifest.contract_id !== 'ask.rule-batch@2.0.0'
      || manifest.verifier_id !== 'ask.rule-batch-verifier@2.0.0'
      || manifest.judgment_id !== 'ask.rule-batch-judgment@2.0.0'
      || manifest.original_source_commit !== '1a6227f6d9de37c9cee9b8d8fac88dc73b3d758c'
      || !Array.isArray(manifest.files)) fail('invalid_manifest');
  const actualPaths = [...leafPaths(repository, BUNDLE_PATH), ...leafPaths(repository, ORIGINAL)]
    .filter(path => path !== `${BUNDLE_PATH}/bundle.json`).sort();
  const paths = manifest.files.map(file => file.path).sort();
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(actualPaths)) fail('inventory_mismatch');
  const assets = new Map();
  for (const file of manifest.files) {
    const bytes = regularBytes(repository, file.path);
    if (digest(bytes) !== file.digest || bytes.length !== file.bytes) fail(`asset_digest_mismatch:${file.path}`);
    assets.set(file.path, bytes);
  }
  return { manifest, bundleDigest, assets };
}

export function materializeRuleBatchBundle(output, expectedDigest, repository = ROOT) {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest ?? '')) fail('external_digest_required');
  const checked = checkRuleBatchBundle(expectedDigest, repository);
  if (!isAbsolute(output) || resolve(output) !== output || realpathSync(dirname(output)) !== dirname(output)) fail('canonical_new_output_required');
  if (existsSync(output)) fail('output_exists');
  // No installer, Git hook, CLI or model is executed. Never overwrite a source.
  mkdirSync(output, { mode: 0o700 });
  const written = {};
  for (const [target, bytes] of materializedAssets(checked)) {
    const absolute = join(output, target);
    mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
    writeFileSync(absolute, bytes, { flag: 'wx', mode: 0o600 });
    written[target] = digest(bytes);
  }
  const receipt = { format: 'ask.rule-batch-materialization@1.0.0', ...bindingFor(checked),
    state: 'prepared_source_not_committed', model_launches: 0, inventory: written };
  writeFileSync(join(output, 'materialization.json'), json(receipt), { flag: 'wx', mode: 0o600 });
  return { ...receipt, output, source: join(output, 'source'), taskFile: join(output, 'task.md'), verificationFile: join(output, 'verification.json') };
}

// Run before comparison preparation, using the externally recorded bundle and
// source commit. Validate the committed bytes, not a mutable binding assertion.
export function verifyRuleBatchMaterialization(output, expectedDigest, sourceCommit, repository = ROOT) {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest ?? '')) fail('external_digest_required');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) fail('exact_source_commit_required');
  if (!isAbsolute(output) || realpathSync(output) !== output) fail('canonical_output_required');
  const checked = checkRuleBatchBundle(expectedDigest, repository);
  const expected = materializedAssets(checked);
  for (const [path, bytes] of expected) {
    if (digest(regularBytes(output, path)) !== digest(bytes)) fail(`materialized_asset_mismatch:${path}`);
  }
  const source = join(output, 'source');
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const git = args => {
    const result = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', `core.hooksPath=${devNull}`,
      '-c', 'core.fsmonitor=false', ...args],
    { cwd: source, env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) fail('source_commit_unavailable');
    return result.stdout;
  };
  const listing = git(['ls-tree', '-r', '-z', sourceCommit]).toString('utf8');
  const expectedSource = new Map([...expected].filter(([path]) => path.startsWith('source/'))
    .map(([path, bytes]) => [path.slice(7), bytes]));
  const committed = new Map();
  for (const entry of listing.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match || !safePath(match[3]) || committed.has(match[3])) fail('invalid_source_tree');
    committed.set(match[3], git(['cat-file', 'blob', match[2]]));
  }
  if (JSON.stringify([...committed.keys()].sort()) !== JSON.stringify([...expectedSource.keys()].sort())) fail('source_commit_inventory_mismatch');
  for (const [path, bytes] of expectedSource) {
    if (digest(committed.get(path)) !== digest(bytes)) fail(`source_commit_asset_mismatch:${path}`);
  }
  return { state: 'verified_frozen_source', ...bindingFor(checked), source_commit: sourceCommit,
    committed_files: committed.size, model_launches: 0 };
}

export function prepareRuleBatchComparison(output, expectedDigest, sourceCommit, options) {
  const verified = verifyRuleBatchMaterialization(output, expectedDigest, sourceCommit);
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('comparison_options_required');
  if (Object.keys(options).some(key => ['repo', 'commit', 'taskFile', 'verificationFile', 'mutablePaths', 'taskClass'].includes(key))) fail('bundle_owned_option_override');
  const prepared = prepareUserComparison({ ...options, repo: join(output, 'source'), commit: sourceCommit,
    taskFile: join(output, 'task.md'), verificationFile: join(output, 'verification.json'),
    mutablePaths: verified.mutable_paths, taskClass: 'implementation' });
  const expected = materializedAssets(checkRuleBatchBundle(expectedDigest));
  if (prepared.plan.task.digest !== digest(expected.get('task.md'))
      || prepared.plan.verification.digest !== digest(expected.get('verification.json'))) fail('prepared_external_input_drift');
  for (const [path, bytes] of expected) {
    if (path.startsWith('source/') && prepared.plan.source.inventory[path.slice(7)]?.digest !== digest(bytes)) fail('prepared_source_drift');
  }
  return { ...prepared, bundle_verification: verified };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, outputOrDigest, expectedDigest] = process.argv.slice(2);
    if (command === 'check' && expectedDigest === undefined) {
      const checked = checkRuleBatchBundle(outputOrDigest);
      console.log(json({ contract_id: checked.manifest.contract_id, verifier_id: checked.manifest.verifier_id,
        files: checked.assets.size, bundle_digest: checked.bundleDigest }).trim());
    } else if (command === 'materialize' && expectedDigest !== undefined) {
      console.log(json(materializeRuleBatchBundle(outputOrDigest, expectedDigest)).trim());
    } else if (command === 'verify-materialized') {
      const sourceCommit = process.argv[5];
      console.log(json(verifyRuleBatchMaterialization(outputOrDigest, expectedDigest, sourceCommit)).trim());
    } else if (command === 'prepare') {
      const sourceCommit = process.argv[5], optionsFile = process.argv[6];
      if (!isAbsolute(optionsFile ?? '') || realpathSync(optionsFile) !== optionsFile) fail('canonical_options_file_required');
      const options = JSON.parse(regularBytes(dirname(optionsFile), basename(optionsFile)));
      console.log(json(prepareRuleBatchComparison(outputOrDigest, expectedDigest, sourceCommit, options)).trim());
    } else fail('usage:check [digest] | materialize output digest | verify-materialized output digest commit | prepare output digest commit options.json');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

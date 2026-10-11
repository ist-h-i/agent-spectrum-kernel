import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const [path, bytes] of checked.assets) {
    if (!path.startsWith(`${BUNDLE_PATH}/`)) continue;
    const target = destination(path);
    if (target === null) continue;
    const absolute = join(output, target);
    mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
    writeFileSync(absolute, bytes, { flag: 'wx', mode: 0o600 });
    written[target] = digest(bytes);
  }
  const binding = {
    contract_id: checked.manifest.contract_id, verifier_id: checked.manifest.verifier_id,
    judgment_id: checked.manifest.judgment_id, bundle_digest: checked.bundleDigest,
    seed_origin_commit: checked.manifest.original_source_commit,
    mutable_paths: ['src/', 'test/generated/'],
    fixed_test_paths: ['test/fixed/'],
  };
  writeFileSync(join(output, 'source/contract-binding.json'), json(binding), { flag: 'wx', mode: 0o600 });
  written['source/contract-binding.json'] = digest(json(binding));
  const receipt = { format: 'ask.rule-batch-materialization@1.0.0', ...binding,
    state: 'prepared_source_not_committed', model_launches: 0, inventory: written };
  writeFileSync(join(output, 'materialization.json'), json(receipt), { flag: 'wx', mode: 0o600 });
  return { ...receipt, output, source: join(output, 'source'), taskFile: join(output, 'task.md'), verificationFile: join(output, 'verification.json') };
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
    } else fail('usage:check [digest] | materialize /canonical/new/output digest');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

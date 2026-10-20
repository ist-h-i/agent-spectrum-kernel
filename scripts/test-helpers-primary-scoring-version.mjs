// Shared synthetic static fixture. No model, evaluator worker or start.
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { comparisonHash as hash } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url))), raw = value => `${JSON.stringify(value, null, 2)}\n`;
const json = path => JSON.parse(readFileSync(path));
export const scoringVersionFixtureMode = (path, writable) => { const stat = lstatSync(path); if (stat.isDirectory()) { chmodSync(path, writable ? 0o700 : 0o500); for (const name of readdirSync(path)) scoringVersionFixtureMode(join(path, name), writable); } else chmodSync(path, writable ? 0o600 : 0o400); };
const mode = scoringVersionFixtureMode;
const processingFiles = ['scripts/ask-benchmark-command-evidence.mjs', 'scripts/ask-review-target-requirement.mjs',
  'benchmarks/schemas/primary-saved-v2-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v2-portfolio-command-evidence.schema.json'];
export function setupPrimaryScoringVersion(t, { processingV2 = false, processingV3 = false, processingV4 = false, processingV5 = false, processingV6 = false, fixtureIds = PRIMARY_FIXTURE_IDS } = {}) {
  const processing = processingV2 || processingV3 || processingV4 || processingV5 || processingV6, version = processingV6 ? 'v6' : processingV5 ? 'v5' : processingV4 ? 'v4' : processingV3 ? 'v3' : 'v2';
  const sourcePaths = processingFiles.map(path => path.replace('saved-v2-', `saved-${version}-`));
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-scoring-version-'))), runtime = join(parent, 'runtime'), privateRoot = join(parent, 'private');
  mkdirSync(runtime); mkdirSync(privateRoot);
  t.after(() => { mode(parent, true); rmSync(parent, { recursive: true, force: true }); });
  for (const id of fixtureIds) cpSync(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id), join(runtime, 'benchmarks/fixtures/checkpoint-b2', id), { recursive: true });
  for (const name of ['portfolio-catalog', 'portfolio-policy-manifest', 'portfolio-scoring-policy']) cpSync(join(ROOT, 'benchmarks', `${name}.json`), join(runtime, 'benchmarks', `${name}.json`));
  mkdirSync(join(runtime, 'scripts')); cpSync(join(ROOT, 'scripts/ask-benchmark-portfolio-score.mjs'), join(runtime, 'scripts/ask-benchmark-portfolio-score.mjs'));
  if (processing) for (const path of sourcePaths) {
    mkdirSync(resolve(join(runtime, path), '..'), { recursive: true }); cpSync(join(ROOT, path), join(runtime, path));
  }
  const resource = { privateRoot, admissionReviewAuthoritySourceDigest: hash('synthetic static receipt') };
  for (const key of ['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath']) {
    resource[key] = join(privateRoot, key); writeFileSync(resource[key], 'synthetic static receipt');
  }
  const manifestPath = join(parent, 'scoring-version.json');
  const seal = () => {
    mode(runtime, true); mode(privateRoot, true);
    const fixtures = {};
    for (const id of fixtureIds) {
      const base = `benchmarks/fixtures/checkpoint-b2/${id}`, freezePath = `${base}/scoring-input-freeze-manifest.json`, freeze = json(join(runtime, freezePath));
      const pins = Object.values(freeze).filter(value => value && typeof value === 'object' && value.path && value.raw_byte_digest);
      for (const pin of pins) pin.raw_byte_digest = hash(readFileSync(join(runtime, pin.path)));
      writeFileSync(join(runtime, freezePath), raw(freeze));
      const paths = [...pins.map(pin => pin.path), freezePath, `${base}/input-manifest.json`, `${base}/metadata.json`, `${base}/task.md`, `${base}/source-freeze-candidate.json`, `${base}/admission-review.json`, 'scripts/ask-benchmark-portfolio-score.mjs'];
      fixtures[id] = { frozen_source_root: runtime, selected: Object.fromEntries(paths.map(path => [path, hash(readFileSync(join(runtime, path)))])),
        resource: { ...resource }, resource_file_digests: Object.fromEntries(['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath'].map(key => [key, hash(readFileSync(resource[key]))])) };
    }
    try { chmodSync(manifestPath, 0o600); } catch {}
    writeFileSync(manifestPath, raw({ kind: processing ? `ask_primary_scoring_version_${version}` : 'ask_primary_scoring_version_v1',
      scoring_version_id: processing ? `synthetic-processing-${version}` : 'synthetic-successor-v1',
      ...(processing ? { processing: { command_evidence_parser_revision: processingV6 ? '1.9.0-primary-saved' : processingV5 ? '1.8.0-primary-saved' : processingV4 ? '1.7.0-primary-saved' : processingV3 ? '1.6.0-primary-saved' : '1.5.0-primary-saved', review_recognition_revision: '2',
        source_file_digests: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(join(runtime, path)))])) } } : {}), fixtures }));
    mode(runtime, false); mode(privateRoot, false); chmodSync(manifestPath, 0o400);
    return { path: manifestPath, digest: hash(readFileSync(manifestPath)) };
  };
  const mutate = (path, callback) => { const target = join(runtime, path); chmodSync(target, 0o600); const value = json(target); callback(value); writeFileSync(target, raw(value)); };
  return { parent, runtime, privateRoot, resource, seal, mutate, selector: seal() };
}

// Independent public copies and inert static receipts; never admission or a run.
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setupPrimaryScoringVersion, scoringVersionFixtureMode } from './test-helpers-primary-scoring-version.mjs';
import { primaryProcessingDescriptor, PRIMARY_PROCESSING_V10_SOURCE_PATHS } from './ask-primary-scoring-version.mjs';
import { computeOutputContractDigest, computeScoringInputFreezeManifestDigest, computeResultProfileDigest } from './ask-benchmark-scoring-contract.mjs';
import { comparisonHash } from './ask-user-comparison-prepare.mjs';
const id = 'mp-data-migration-handoff';
const root = new URL('../', import.meta.url);
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const read = path => JSON.parse(readFileSync(path));
export function syntheticV10ScoringVersion(t, { fixtureIds = [id], fixtureSet } = {}) {
  const f = setupPrimaryScoringVersion(t, { fixtureIds });
  scoringVersionFixtureMode(f.runtime, true);
  for (const path of PRIMARY_PROCESSING_V10_SOURCE_PATHS) {
    mkdirSync(dirname(join(f.runtime, path)), { recursive: true });
    cpSync(new URL(path, root), join(f.runtime, path));
  }
  const result_profile = { name: 'requirement_scope_verification_v2', digest: computeResultProfileDigest({ name: 'requirement_scope_verification_v2' }) };
  for (const fixtureId of fixtureIds) {
    const base = join(f.runtime, 'benchmarks/fixtures/checkpoint-b2', fixtureId);
    const output = read(join(base, 'output-contract.json')); output.result_profile = result_profile;
    output.output_contract_digest = computeOutputContractDigest(output); write(join(base, 'output-contract.json'), output);
    const freeze = read(join(base, 'scoring-input-freeze-manifest.json')); freeze.result_profile = result_profile;
    freeze.output_contract.raw_byte_digest = comparisonHash(readFileSync(join(base, 'output-contract.json')));
    freeze.output_contract.semantic_digest = output.output_contract_digest;
    freeze.manifest_digest = computeScoringInputFreezeManifestDigest(freeze); write(join(base, 'scoring-input-freeze-manifest.json'), freeze);
  }
  f.seal();
  const value = read(f.selector.path); value.kind = 'ask_primary_scoring_version_v10'; value.scoring_version_id = 'synthetic-closed-input-v10';
  value.processing = primaryProcessingDescriptor({ commandEvidenceParserRevision: '1.13.0-primary-app-server' });
  if (fixtureSet !== undefined) value.fixture_set = fixtureSet;
  chmodSync(f.selector.path, 0o600); write(f.selector.path, value); chmodSync(f.selector.path, 0o400);
  return { ...f, selector: { path: f.selector.path, digest: comparisonHash(readFileSync(f.selector.path)) }, result_profile };
}

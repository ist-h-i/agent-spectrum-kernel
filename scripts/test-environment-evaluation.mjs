// Fake boundary transports only. Real materializer is tested separately; the
// existing runner's containment/state tests remain the execution proof owner.
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, readContentAddressedJson } from './content-addressed-store.mjs';
import { captureInstructionEnvironment } from './instruction-environment.mjs';
import { buildEnvironmentEvolutionProjection } from './environment-evolution-binding.mjs';
import { buildEvolutionExperiment, publishEvolutionExperiment } from './evolution-loop.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
const materializer = await import('./ask-benchmark-materialize.mjs');
const execution = await import('./ask-benchmark-execution.mjs');
let materialization, dispatches, records;
mock.module('./ask-benchmark-materialize.mjs', { namedExports: { ...materializer,
  materializePortfolio: input => { materialization = input; return { fake: true }; },
  validateMaterializedPortfolio: () => ({ casesById: records }),
} });
mock.module('./ask-benchmark-execution.mjs', { namedExports: { ...execution,
  executePortfolio: input => { dispatches.push(input); return { fake: true }; },
} });
const api = await import('./environment-evaluation.mjs');
for (const track of ['codex', 'claude']) test(`${track}: exact environment evaluation delegates to existing runner and refuses drift before dispatch`, t => {
  const a = environmentFixture(t, track), b = environmentFixture(t, track, 'challenger', a);
  const draft = structuredClone(readContentAddressedJson({ storeRoot: a.storeRoot, digest: a.adapter.evolution.experiment_object_digest }).value);
  const root = resolve(import.meta.dirname, '..'), repositoryRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  draft.protocol.source_revision = repositoryRevision;
  a.options.runtime.cli_version = b.options.runtime.cli_version = draft.protocol.cli.version;
  const baseline = captureInstructionEnvironment(a.options), challenger = captureInstructionEnvironment(b.options);
  const environments = { baseline: baseline.object_digest, challenger: challenger.object_digest };
  draft.projection = buildEnvironmentEvolutionProjection({ ...a.options, roles: draft.roles, environments, evidenceKind: 'synthetic' });
  const published = publishEvolutionExperiment({ storeRoot: a.storeRoot, experiment: buildEvolutionExperiment(draft) });
  const cases = draft.protocol.fixture_ids.flatMap(fixture_id => Array.from({ length: draft.protocol.repetitions }, (_, index) => ({
    fixture_id, adapter_track: track, condition: 'full_ask', task_class: draft.protocol.task_classes[0], case_id: `${fixture_id}-${index}` })));
  const planPath = join(a.root, 'plan.json'), runtimeConfigPath = join(a.root, 'runtime.json');
  writeFileSync(planPath, JSON.stringify({ cases }));
  writeFileSync(runtimeConfigPath, JSON.stringify({ adapter: track, model: draft.protocol.model, expected_executable_version: draft.protocol.cli.version }));
  const options = { ...a.options, root, repositoryRevision, planPath, runtimeConfigPath, role: 'baseline',
    experimentObjectDigest: published.object_digest, trustedExperimentAuthorities: [draft.authority] };
  materialization = null; dispatches = [];
  assert.equal(api.materializeEnvironmentEvaluation(options).fake, true);
  assert.equal(materialization.instructionEnvironment.environmentObjectDigest, baseline.object_digest);
  records = new Map(cases.map(c => [c.case_id, { projected_asset_inventory: [
    ...a.content.files.map(f => ({ path: a.options.bindings[0].files.find(m => m.source === f.path).target, sha256: f.raw_digest.slice(7) })),
    { path: 'AGENTS.md', sha256: baseline.environment.support[0].raw_digest.slice(7) }], projection_evidence: {
      renderer_id: 'instruction-environment-export', projection_fingerprint: canonicalDigest({ object_digest: baseline.object_digest,
        projection_digest: baseline.environment.projection_digest }) } }]));
  assert.throws(() => api.executeEnvironmentEvaluation(options), /confirmation/);
  assert.equal(dispatches.length, 0);
  assert.throws(() => api.executeEnvironmentEvaluation({ ...options, confirmedExperimentObjectDigest: published.object_digest, retryFailed: true }), /retry/);
  assert.equal(dispatches.length, 0);
  const result = api.executeEnvironmentEvaluation({ ...options, confirmedExperimentObjectDigest: published.object_digest });
  assert.equal(result.quality_implied, false); assert.equal(dispatches.length, cases.length);
  assert.ok(dispatches.every(c => c.adapter === track && c.maxCases === 1 && c.retryFailed === false && c.firstAttemptOnly === true));
  records.values().next().value.projected_asset_inventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => api.verifyEnvironmentEvaluation(options), /byte drift/);
  assert.throws(() => api.verifyEnvironmentEvaluation({ ...options, repositoryRevision: 'foreign' }), /source revision drift/);
});

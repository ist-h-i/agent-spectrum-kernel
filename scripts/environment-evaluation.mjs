// Adapter-neutral connection to the existing benchmark materializer and runner.
// No grader, outcome policy, model transport, retry or authority is replaced.
import assert from 'node:assert/strict';
import { canonicalDigest, readJsonFileStrict } from './content-addressed-store.mjs';
import { verifyEvolutionExperiment } from './evolution-loop.mjs';
import { verifyEnvironmentEvolutionBinding } from './environment-evolution-binding.mjs';
import { materializePortfolio, validateMaterializedPortfolio } from './ask-benchmark-materialize.mjs';
import { executePortfolio, inspectVerifiedPortfolioExecution } from './ask-benchmark-execution.mjs';
import { readGitRevision } from './installer-lifecycle.mjs';
function context(options) {
  assert.ok(['baseline', 'challenger'].includes(options.role), 'explicit environment role required');
  const { experiment } = verifyEvolutionExperiment(options);
  assert.equal(experiment.projection.mode, 'instruction_environment_v1_exact');
  assert.equal(options.repositoryRevision, experiment.protocol.source_revision, 'evaluation source revision drift');
  assert.equal(readGitRevision(options.root), options.repositoryRevision, 'evaluation checkout revision drift');
  const { binding, pair } = verifyEnvironmentEvolutionBinding(options, experiment);
  const environment = pair[options.role].environment;
  const adapter = environment.adapter === 'codex' ? 'codex' : 'claude';
  const plan = readJsonFileStrict(options.planPath, 'environment evaluation plan');
  const cases = plan.cases.filter(c => c.adapter_track === adapter && c.condition === 'full_ask');
  assert.deepEqual([...new Set(cases.map(c => c.fixture_id))].sort(), [...experiment.protocol.fixture_ids].sort(), 'environment evaluation fixture scope drift');
  assert.ok(cases.every(c => experiment.protocol.task_classes.includes(c.task_class)), 'environment task class scope drift');
  for (const id of experiment.protocol.fixture_ids) assert.equal(cases.filter(c => c.fixture_id === id).length, experiment.protocol.repetitions, 'environment repetition scope drift');
  return { experiment, environment, adapter, cases, environmentObjectDigest: binding.environments[options.role] };
}
export function materializeEnvironmentEvaluation(options) {
  const c = context(options);
  return materializePortfolio({ ...options, instructionEnvironment: { ...options, environmentObjectDigest: c.environmentObjectDigest } });
}
export function verifyEnvironmentEvaluation(options) {
  const c = context(options);
  const plan = readJsonFileStrict(options.planPath, 'environment evaluation plan');
  const materialized = validateMaterializedPortfolio({ ...options, materializedRoot: options.materializedPath, plan });
  for (const entry of c.cases) {
    const record = materialized.casesById.get(entry.case_id), evidence = record.projection_evidence;
    assert.equal(evidence.renderer_id, 'instruction-environment-export', 'environment projection missing');
    assert.equal(evidence.projection_fingerprint, canonicalDigest({ object_digest: c.environmentObjectDigest,
      projection_digest: c.environment.projection_digest }), 'environment evaluation transplant');
    // Compare actual full projection bytes as well as the binding label.
    const expected = c.environment.projection_digest;
    const actual = canonicalDigest(record.projected_asset_inventory.map(f => ({ path: f.path, raw_digest: `sha256:${f.sha256}` }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    assert.equal(actual, expected, 'environment runtime projection byte drift');
  }
  return c;
}
export function executeEnvironmentEvaluation(options) {
  const c = verifyEnvironmentEvaluation(options);
  assert.equal(options.confirmedExperimentObjectDigest, options.experimentObjectDigest, 'exact evaluation start confirmation required');
  assert.ok(!options.retryFailed && options.successorPromptInput == null, 'environment evaluation cannot request retry or successor transport');
  const runtime = readJsonFileStrict(options.runtimeConfigPath, 'environment evaluation runtime');
  assert.equal(runtime.adapter, c.adapter, 'runtime adapter drift');
  assert.equal(runtime.model, c.experiment.protocol.model, 'runtime model drift');
  assert.ok(runtime.expected_executable_version === c.environment.runtime.cli_version
    || runtime.expected_executable_version?.endsWith(' ' + c.environment.runtime.cli_version), 'expected CLI version drift');
  // Existing runner probes and binds actual CLI version/executable/environment.
  // Each case has existing once-attempt state; terminal/unknown work is not reset.
  const outcomes = [];
  for (const entry of c.cases) outcomes.push(executePortfolio({ ...options, adapter: c.adapter,
    caseId: entry.case_id, maxCases: 1, retryFailed: false, successorPromptInput: null }));
  return { outcomes, quality_implied: false, environment_object_digest: c.environmentObjectDigest };
}
export function inspectEnvironmentEvaluation(options) {
  const c = verifyEnvironmentEvaluation(options);
  const execution = inspectVerifiedPortfolioExecution(options);
  return { ...execution, environment_object_digest: c.environmentObjectDigest, quality_implied: false };
}

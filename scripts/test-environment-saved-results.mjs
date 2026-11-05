import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalDigest, readContentAddressedJson } from './content-addressed-store.mjs';
import { captureInstructionEnvironment, instructionBytesDigest } from './instruction-environment.mjs';
import { buildEnvironmentEvolutionProjection } from './environment-evolution-binding.mjs';
import { buildEvolutionExperiment, publishEvolutionExperiment } from './evolution-loop.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
const originals = await Promise.all(['./environment-evaluation.mjs', './ask-benchmark-execution.mjs', './ask-benchmark-normalized-results.mjs',
  './ask-benchmark-portfolio-result-set.mjs', './ask-benchmark-evaluator-boundary.mjs', './ask-benchmark-portfolio-score.mjs'].map(p => import(p)));
let data, plans, nativeCalls, environments, frozenRuntime, observedRuntime, environmentOverride, altered = false;
mock.module('./environment-evaluation.mjs', { namedExports: { ...originals[0], verifyEnvironmentEvaluation: o => ({ cases: plans[o.role], adapter: o.adapterTrack,
  environmentObjectDigest: environmentOverride ?? environments[o.role], environment: { runtime: frozenRuntime } }) } });
mock.module('./ask-benchmark-execution.mjs', { namedExports: { ...originals[1], inspectVerifiedPortfolioExecution: o => ({ identity: {
  run_instance_id: `run-${o.role}`, plan: { digest: canonicalDigest(`plan-${o.role}`) } }, adapter_identities: new Map([[o.adapterTrack, observedRuntime]]) }) } });
mock.module('./ask-benchmark-normalized-results.mjs', { namedExports: { ...originals[2], verifyNormalizedPortfolioResults: o => ({ manifest: {
  source_snapshot_digest: canonicalDigest(`snapshot-${o.role}`), source: { run_instance_id: `run-${o.role}`, plan_digest: canonicalDigest(`plan-${o.role}`) },
  cases: [...data[o.role].map(e => ({ case_id: e.result.case_id, terminal_attempt: e.result.attempt })), { case_id: 'unrelated-plain', status: 'pending', terminal_attempt: null }] } }) } });
mock.module('./ask-benchmark-portfolio-result-set.mjs', { namedExports: { ...originals[3], verifyEngineeringResultSet: o => ({ artifact: {
  run_instance_id: `run-${o.role}`, plan_digest: canonicalDigest(`plan-${o.role}`), source_snapshot_digest: canonicalDigest(`snapshot-${o.role}`) },
  verified_results: data[o.role] }) } });
mock.module('./ask-benchmark-evaluator-boundary.mjs', { namedExports: { ...originals[4], verifyEvaluatorAuthority: o => { nativeCalls++; return o.original; } } });
mock.module('./ask-benchmark-portfolio-score.mjs', { namedExports: { ...originals[5], buildPortfolioEngineeringResult: o => altered ? { ...o, invalid: true } : o } });
const { verifyEnvironmentSavedResults } = await import('./environment-saved-results.mjs');
for (const track of ['codex', 'claude']) test(`${track}: saved results re-enter original verifiers; missing dimensions stay unavailable`, t => {
  const a = environmentFixture(t, track), b = environmentFixture(t, track, 'challenger', a);
  const draft = structuredClone(readContentAddressedJson({ storeRoot: a.storeRoot, digest: a.adapter.evolution.experiment_object_digest }).value);
  a.options.runtime.cli_version = b.options.runtime.cli_version = draft.protocol.cli.version;
  environments = { baseline: captureInstructionEnvironment(a.options).object_digest, challenger: captureInstructionEnvironment(b.options).object_digest };
  frozenRuntime = a.options.runtime; observedRuntime = { model: frozenRuntime.model, executable: { observed_version: frozenRuntime.cli_version } }; environmentOverride = null;
  const gradingBindings = draft.protocol.fixture_ids.map(fixture_id => ({ fixture_id, evaluator_bundle_digest: canonicalDigest('original-bundle'),
    scoring_input_freeze_manifest_source_digest: canonicalDigest('original-freeze'), scoring_policy_digest: draft.protocol.scoring_policy_digest }));
  draft.projection = buildEnvironmentEvolutionProjection({ ...a.options, roles: draft.roles, environments, gradingBindings, evidenceKind: 'synthetic' });
  const publication = publishEvolutionExperiment({ storeRoot: a.storeRoot, experiment: buildEvolutionExperiment(draft) });
  const options = { ...a.options, experimentObjectDigest: publication.object_digest, trustedExperimentObjectDigests: [publication.object_digest],
    trustedExperimentAuthorities: [draft.authority], trustedSavedEngineeringResultDigests: [], results: {},
    evaluationAuthority: { authority_id: 'independent-environment-evaluator', authority_revision: 1, authority_evidence_digest: canonicalDigest('synthetic original verifier only') } };
  data = {}; plans = {}; nativeCalls = 0; altered = false;
  for (const role of ['baseline', 'challenger']) {
    plans[role] = draft.protocol.fixture_ids.flatMap(fixture_id => Array.from({ length: draft.protocol.repetitions }, (_, index) => ({ fixture_id,
      repetition: index + 1, case_id: `${role}-${fixture_id}-${index}` })));
    data[role] = plans[role].map(c => {
      const result = { fixture_id: c.fixture_id, case_id: c.case_id, repetition: c.repetition, attempt: '0001', condition: 'full_ask', adapter: track,
        run_instance_id: `run-${role}`, plan_digest: canonicalDigest(`plan-${role}`), source_snapshot_digest: canonicalDigest(`snapshot-${role}`),
        ...gradingBindings.find(g => g.fixture_id === c.fixture_id), fixture_input_digest: canonicalDigest(c.fixture_id), scoring_status: 'complete',
        safety_blocker: { status: 'pass' }, blockers: { gate_status: 'pass' }, requirement_score: { normalized_requirement_score: role === 'baseline' ? 0.5 : 0.6 },
        overhead_telemetry: Object.fromEntries(['input_tokens', 'output_tokens', 'duration_ms', 'human_effort', 'monetary_cost'].map(k => [k, { status: 'known', value: 1 }])) };
      const raw_byte_digest = canonicalDigest(result); options.trustedSavedEngineeringResultDigests.push(raw_byte_digest);
      return { result, raw_byte_digest };
    });
    options.results[role] = { execution: { adapterTrack: track }, resultSet: { normalizedResultsPath: `${role}-normalized` },
      grading: data[role].map(({ result }) => ({ case_id: result.case_id, attempt: result.attempt, options: { original: result } })) };
  }
  const checked = verifyEnvironmentSavedResults(options);
  assert.equal(nativeCalls, data.baseline.length + data.challenger.length); assert.equal(checked.report.status, 'saved_pair_verified');
  assert.equal(checked.evidence.dimensions.quality.status, 'complete'); assert.equal(checked.evidence.dimensions.variance.status, 'unavailable');
  assert.equal(checked.evidence.dimensions.mechanism.status, 'unavailable'); assert.equal(checked.evidence.causal_attribution.status, 'not_claimed');
  const scoped = structuredClone(options);
  for (const role of ['baseline', 'challenger']) {
    scoped.results[role].resultSet.mode = 'environment_scope';
    scoped.results[role].grading.forEach((g, index) => {
      const bytes = Buffer.from(JSON.stringify(data[role][index].result));
      g.resultPath = join(a.root, `${role}-${index}-engineering.json`); writeFileSync(g.resultPath, bytes);
      scoped.trustedSavedEngineeringResultDigests.push(instructionBytesDigest(bytes));
    });
  }
  assert.equal(verifyEnvironmentSavedResults(scoped).report.status, 'saved_pair_verified', 'unrelated pending conditions cannot force extra model calls');
  const omitted = structuredClone(scoped); omitted.results.baseline.grading.pop();
  assert.throws(() => verifyEnvironmentSavedResults(omitted), /cover every registered case/);
  for (const key of ['experimentObjectDigest', 'trustedExperimentObjectDigests', 'root']) {
    const foreign = structuredClone(options); foreign.results.baseline.execution[key] = key === 'trustedExperimentObjectDigests' ? [] : 'foreign';
    assert.throws(() => verifyEnvironmentSavedResults(foreign), /unsupported role execution override/);
  }
  environmentOverride = canonicalDigest('foreign environment');
  assert.throws(() => verifyEnvironmentSavedResults(options), /pinned experiment/); environmentOverride = null;
  observedRuntime.model = 'foreign model'; assert.throws(() => verifyEnvironmentSavedResults(options), /runtime model/); observedRuntime.model = frozenRuntime.model;
  observedRuntime.executable.observed_version = 'foreign CLI'; assert.throws(() => verifyEnvironmentSavedResults(options), /CLI version/);
  observedRuntime.executable.observed_version = frozenRuntime.cli_version;
  const replacedContext = structuredClone(options); replacedContext.results.baseline.grading[0].options.runDir = 'foreign run';
  assert.throws(() => verifyEnvironmentSavedResults(replacedContext), /cannot replace execution context/);
  altered = true; assert.throws(() => verifyEnvironmentSavedResults(options), /original full grading verifier/); altered = false;
  assert.throws(() => verifyEnvironmentSavedResults({ ...options, trustedSavedEngineeringResultDigests: [] }), /receipt/);
  const unstarted = structuredClone(options); unstarted.results.baseline.resultSet = null; unstarted.results.baseline.grading = [];
  const held = verifyEnvironmentSavedResults(unstarted); assert.equal(held.report.status, 'hold_incomplete');
  assert.equal(held.evidence.dimensions.quality.status, 'insufficient_evidence');
  const tampered = structuredClone(data.challenger[0].result); data.challenger[0].result.scoring_policy_digest = canonicalDigest('foreign');
  assert.throws(() => verifyEnvironmentSavedResults(options), /pre-result criterion/); data.challenger[0].result = tampered;
});

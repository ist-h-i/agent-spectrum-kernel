// Re-verifies saved native engineering artifacts with their original owners.
// No new grader, model call, result-derived policy or automatic trust grant.
import assert from 'node:assert/strict';
import { canonicalDigest, putContentAddressedJson, readStableBytes, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { verifyEvolutionExperiment, deriveEvolutionRecommendation } from './evolution-loop.mjs';
import { verifyEnvironmentEvolutionBinding } from './environment-evolution-binding.mjs';
import { verifyEnvironmentEvaluation } from './environment-evaluation.mjs';
import { inspectVerifiedPortfolioExecution } from './ask-benchmark-execution.mjs';
import { verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';
import { verifyEngineeringResultSet } from './ask-benchmark-portfolio-result-set.mjs';
import { verifyEvaluatorAuthority } from './ask-benchmark-evaluator-boundary.mjs';
import { buildPortfolioEngineeringResult } from './ask-benchmark-portfolio-score.mjs';
import { buildSavedInstructionPairEvidence } from './saved-instruction-pair-evidence.mjs';
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const roleExecutionKeys = new Set(['planPath', 'materializedPath', 'selectionState', 'runDir', 'runtimeConfigPath', 'adapterTrack', 'executionAdmissionEvidenceByFixture']);
const fixedContextKeys = ['root', 'storeRoot', 'config', 'experimentObjectDigest', 'trustedExperimentObjectDigests',
  'trustedExperimentAuthorities', 'trustedPortfolioAuthorityContexts', 'trustedRegistryAuthorities', 'repositoryRevision',
  'planPath', 'materializedPath', 'selectionState', 'runDir', 'executionAdmissionEvidenceByFixture', 'role'];
function withFixedContext(execution, supplied) {
  for (const key of fixedContextKeys) if (Object.hasOwn(supplied, key)) {
    assert.ok(supplied[key] === execution[key] || (execution[key] !== undefined && same(supplied[key], execution[key])), `saved grading cannot replace execution context: ${key}`);
  }
  return { ...execution, ...supplied };
}
export function verifyEnvironmentSavedResults(options) {
  assert.ok(options.trustedExperimentObjectDigests?.includes(options.experimentObjectDigest), 'independent pre-result experiment pin required');
  const { experiment, candidate } = verifyEvolutionExperiment(options);
  const { binding } = verifyEnvironmentEvolutionBinding(options, experiment);
  assert.ok(['synthetic', 'observed'].includes(binding.evidence_kind), 'pre-result evidence provenance required');
  assert.ok(binding.grading_bindings?.length, 'pre-result original grading input inventory required');
  const observations = [], pairs = [], blocks = {}, executions = {};
  let incomplete = 0, pending = 0, recordedRuntimeDigest = null, recordedRuntimeCount = 0;
  for (const role of ['baseline', 'challenger']) {
    const supplied = options.results[role];
    for (const key of Object.keys(supplied.execution ?? {})) assert.ok(roleExecutionKeys.has(key), `unsupported role execution override: ${key}`);
    const execution = { ...options, ...supplied.execution, role };
    const ctx = verifyEnvironmentEvaluation(execution), inspected = inspectVerifiedPortfolioExecution(execution);
    assert.equal(ctx.environmentObjectDigest, binding.environments[role], 'saved role environment differs from pinned experiment');
    executions[role] = inspected.identity.run_instance_id; blocks[role] = ctx.cases;
    if (supplied.resultSet === null) {
      assert.equal((supplied.grading ?? []).length, 0, 'uncollected result set cannot supply grading results');
      pending += ctx.cases.length; continue;
    }
    const runtime = inspected.adapter_identities.get(ctx.adapter);
    assert.ok(runtime, 'saved runtime identity required');
    assert.equal(runtime.model, ctx.environment.runtime.model, 'saved runtime model differs from frozen environment');
    const version = runtime.executable.observed_version, expectedVersion = ctx.environment.runtime.cli_version;
    assert.ok(version === expectedVersion || version?.endsWith(' ' + expectedVersion), 'saved CLI version differs from frozen environment');
    const actualRuntimeDigest = canonicalDigest(runtime);
    if (recordedRuntimeDigest !== null) assert.equal(actualRuntimeDigest, recordedRuntimeDigest, 'saved roles have different recorded runtime contracts');
    recordedRuntimeDigest = actualRuntimeDigest;
    recordedRuntimeCount++;
    const normalized = verifyNormalizedPortfolioResults({ ...execution, outputPath: supplied.resultSet.normalizedResultsPath });
    assert.ok(supplied.resultSet.mode === undefined || supplied.resultSet.mode === 'environment_scope', 'unknown saved result scope');
    // The generic aggregate deliberately requires all four conditions. An
    // environment comparison executes only its pre-registered full_ask cases;
    // re-enter each original evaluator/scorer rather than forging an aggregate
    // or running unrelated model conditions to satisfy that aggregate contract.
    const scoped = supplied.resultSet.mode === 'environment_scope';
    const checked = scoped ? { artifact: { run_instance_id: normalized.manifest.source.run_instance_id,
      plan_digest: normalized.manifest.source.plan_digest, source_snapshot_digest: normalized.manifest.source_snapshot_digest },
      verified_results: (supplied.grading ?? []).map(g => {
        const bytes = readStableBytes(g.resultPath, 'original scoped engineering receipt', 16 * 1024 * 1024);
        return { result: parseJsonRejectDuplicateKeys(bytes, 'original scoped engineering receipt'), raw_byte_digest: instructionBytesDigest(bytes) };
      }) } : verifyEngineeringResultSet({ ...withFixedContext(execution, supplied.resultSet), adapter: ctx.adapter });
    assert.equal(checked.artifact.run_instance_id, inspected.identity.run_instance_id, 'saved run transplant');
    assert.equal(checked.artifact.plan_digest, inspected.identity.plan.digest, 'saved plan transplant');
    assert.equal(checked.artifact.source_snapshot_digest, normalized.manifest.source_snapshot_digest, 'saved normalized snapshot transplant');
    const expected = new Map(ctx.cases.map(c => [c.case_id, c]));
    const grading = supplied.grading ?? [];
    assert.equal(new Set(grading.map(g => `${g.case_id}:${g.attempt}`)).size, grading.length, 'duplicate original grading descriptor');
    const used = new Set();
    for (const entry of checked.verified_results.filter(e => e.result.condition === 'full_ask')) {
      const result = entry.result, planned = expected.get(result.case_id);
      assert.equal(result.run_instance_id, inspected.identity.run_instance_id, 'saved result run transplant');
      assert.equal(result.plan_digest, inspected.identity.plan.digest, 'saved result plan transplant');
      assert.equal(result.source_snapshot_digest, normalized.manifest.source_snapshot_digest, 'saved result snapshot transplant');
      assert.equal(result.adapter, ctx.adapter, 'saved result adapter transplant');
      if (scoped) {
        const terminal = normalized.manifest.cases.find(c => c.case_id === result.case_id);
        assert.ok(terminal && terminal.terminal_attempt === result.attempt, 'saved scope requires the authoritative terminal attempt');
      }
      assert.ok(planned && planned.fixture_id === result.fixture_id && planned.repetition === result.repetition, 'foreign saved task/repetition');
      assert.ok(!used.has(result.case_id), 'multiple attempts cannot become an environment outcome'); used.add(result.case_id);
      const key = `${result.case_id}:${result.attempt}`, original = grading.find(g => `${g.case_id}:${g.attempt}` === key);
      assert.ok(original, 'original native grading authority descriptor required');
      assert.ok(options.trustedSavedEngineeringResultDigests?.includes(entry.raw_byte_digest), 'independently pinned original grade receipt required');
      const authoritative = verifyEvaluatorAuthority({ ...withFixedContext(execution, original.options), normalizedResultsPath: supplied.resultSet.normalizedResultsPath });
      const rebuilt = buildPortfolioEngineeringResult(authoritative, { root: execution.root });
      assert.ok(same(rebuilt, result), 'saved result differs from original full grading verifier');
      const criterion = binding.grading_bindings.find(g => g.fixture_id === result.fixture_id);
      for (const field of ['evaluator_bundle_digest', 'scoring_input_freeze_manifest_source_digest', 'scoring_policy_digest']) {
        assert.equal(result[field], criterion[field], 'saved grading differs from pre-result criterion');
      }
      observations.push({ role, fixture_id: result.fixture_id, engineering: result });
      if (result.scoring_status !== 'complete') incomplete++;
    }
    if (scoped) assert.equal(used.size, ctx.cases.length, 'saved environment scope must cover every registered case');
    assert.equal(grading.length, used.size, 'extra grading inputs outside selected environment outcome scope');
    pending += expected.size - used.size;
  }
  assert.notEqual(executions.baseline, executions.challenger, 'roles require distinct saved runs');
  for (const a of observations.filter(o => o.role === 'baseline')) {
    const b = observations.find(o => o.role === 'challenger' && o.fixture_id === a.fixture_id && o.engineering.repetition === a.engineering.repetition);
    if (b && a.engineering.scoring_status === 'complete' && b.engineering.scoring_status === 'complete') {
      assert.equal(a.engineering.fixture_input_digest, b.engineering.fixture_input_digest, 'paired fixture inputs drifted');
      pairs.push({ fixture_id: a.fixture_id, repetition: a.engineering.repetition, baseline: a.engineering, challenger: b.engineering,
        quality_delta: b.engineering.requirement_score.normalized_requirement_score - a.engineering.requirement_score.normalized_requirement_score });
    }
  }
  const report = { kind: 'instruction_environment_saved_readout_v1', pair_digest: experiment.projection.projection_evidence_digest,
    status: pending || incomplete ? 'hold_incomplete' : 'saved_pair_verified', evidence_kind: binding.evidence_kind,
    pairs, observations, recorded_runtime_contract_digest: recordedRuntimeCount === 2 ? recordedRuntimeDigest : null,
    pending_role_count: pending, incomplete_role_count: incomplete, causal_attribution: 'not_claimed', formal_aggregate_eligible: false };
  const evidence = buildSavedInstructionPairEvidence({ candidate, experiment, blocks,
    registration: { pair_digest: report.pair_digest, description: { evidence_kind: binding.evidence_kind } } }, report, options.evaluationAuthority);
  const recommendation = deriveEvolutionRecommendation({ experiment, evidence });
  const reportObject = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: report, maximumBytes: 16 * 1024 * 1024 });
  return { report, report_object_digest: reportObject.digest, evidence, recommendation, candidate, experiment,
    models_started: false, authority_implied: false, mutation_performed: false };
}

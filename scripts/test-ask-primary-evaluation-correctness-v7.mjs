// Full producer/normalizer/fragment/adapter connection with authored fake events.
// Static resource receipts deliberately remain inadmissible. No worker is run.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { syntheticV7ScoringVersion } from './test-helpers-primary-evaluation-v7.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { readPrimaryScoringVersion } from './ask-primary-scoring-version.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';
import { envelopeHeaders, envelopeEnd } from './test-helpers-primary-command-envelope-v4.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { adaptPrivateEvaluatorFragmentToEnvelope, validatePrivateEvaluatorFragment } from './ask-benchmark-evaluator-boundary.mjs';
import { deriveRequirementScopeVerificationOutcome, deriveEffectiveVerificationEvidenceReferences, validateResultProfile, validateRequirementResultObservations } from './ask-benchmark-scoring-contract.mjs';
import { comparisonHash } from './ask-user-comparison-prepare.mjs';
const ROOT = resolve(import.meta.dirname, '..'), id = 'mp-data-migration-handoff', revision = '1.10.0-primary-saved';
const read = path => JSON.parse(readFileSync(path));
test('O7-CHAIN explicit one-task v7 keeps old selection closed and refuses profile/source drift', t => {
  const f = syntheticV7ScoringVersion(t), selected = readPrimaryScoringVersion(f.selector, id, { verifyResourceFiles: true });
  assert.equal(selected.processing.command_evidence_parser_revision, revision);
  assert.deepEqual(Object.keys(read(f.selector.path).fixtures), [id]);
  assert.throws(() => readPrimaryScoringVersion(f.selector, 'mn-build-option-update'), /absent/u);
  const initial = readFileSync(f.selector.path);
  for (const change of [value => value.kind = 'ask_primary_scoring_version_v6', value => value.processing.command_evidence_parser_revision = '1.9.0-primary-saved']) {
    const value = JSON.parse(initial); change(value); chmodSync(f.selector.path, 0o600); writeFileSync(f.selector.path, JSON.stringify(value)); chmodSync(f.selector.path, 0o400);
    assert.throws(() => readPrimaryScoringVersion({ path: f.selector.path, digest: comparisonHash(readFileSync(f.selector.path)) }, id));
  }
  chmodSync(f.selector.path, 0o600); writeFileSync(f.selector.path, initial); chmodSync(f.selector.path, 0o400);
  f.mutate(`benchmarks/fixtures/checkpoint-b2/${id}/output-contract.json`, value => value.result_profile.name = 'binary_scope_verification_v1');
  chmodSync(join(f.runtime, `benchmarks/fixtures/checkpoint-b2/${id}/output-contract.json`), 0o400);
  assert.throws(() => readPrimaryScoringVersion(f.selector, id), /changed|profile/u);
});
for (const shell of ['/bin/bash', '/bin/zsh']) test('O7-CHAIN saved synthetic handoff reaches derived envelope: ' + shell, async t => {
  const f = syntheticV7ScoringVersion(t);
  const source = syntheticPrimarySource(t, { fixtureId: id, nativeEvents: ({ contract }) => [
    ...envelopeHeaders(),
    ...contract.commands.flatMap((command, index) => {
      const item = { id: `artificial-check-${index}`, type: 'command_execution', command: renderCommandEvent(command).replace('/bin/bash -lc ', shell + ' -lc ') };
      return [{ type: 'item.started', item: { ...item, status: 'in_progress' } }, { type: 'item.completed', item: { ...item, status: 'completed', exit_code: 0, aggregated_output: 'anonymous structural evidence' } }];
    }), envelopeEnd(),
  ] });
  source.block.grading.scoring_version = f.selector;
  source.block.grading.binding.scoring_input_freeze_digest = comparisonHash(readFileSync(join(f.runtime, `benchmarks/fixtures/checkpoint-b2/${id}/scoring-input-freeze-manifest.json`)));
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'v7-producer'));
  assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  const verified = verifyPrimaryEvaluationProducer(options); assert.equal(verified.commandEvidenceParserRevision, revision);
  const input = buildPrimaryEvaluationScoringInputs(options, { condition: 'plain', frozenSourceRoot: f.runtime, ...f.resource }), n = input.normalizedResult, s = input.scorerOptions;
  assert.deepEqual(n.command_evidence.succeeded_command_ids, ['handoff-contract-validation']);
  const requirementRecord = read(s.requirementRecordPath), ref = { kind: 'normalized_result', digest: n.normalized_result_digest, bytes: null };
  const fragment = { schema_version: '1.0.0', schema_path: 'benchmarks/schemas/private-evaluator-fragment.schema.json', program: 'adaptive_ask_private_evaluator_fragment',
    evaluation_status: 'completed', result_profile: f.result_profile,
    requirement_results: requirementRecord.requirements.map(row => ({ requirement_id: row.requirement_id, outcome: 'pass', earned_points: row.max_points,
      matched_equivalence_class_ids: [], finding_ids: [], evidence_references: [ref], scope_deviation_references: [], verification_evidence_references: [] })),
    findings: [], scope_deviations: [], evidence_correctness: { state: 'pass', evidence_references: [ref] }, scoring_ready: false };
  const fill = () => {
    const derived = deriveRequirementScopeVerificationOutcome({ evaluatorResult: fragment, requirementRecord, normalizedResult: n });
    fragment.evaluation_status = derived.evaluation_status; delete fragment.classification;
    if (derived.classification !== null) fragment.classification = derived.classification;
    for (const field of ['under_processing', 'over_processing']) fragment[field] = { state: derived[field], evidence_references: structuredClone(derived.evidence_references) };
    fragment.verification_correctness = { state: derived.verification_correctness, evidence_references: deriveEffectiveVerificationEvidenceReferences({ normalizedResult: n, evaluatorResult: fragment }) };
    return derived;
  };
  const authority = { normalizedResult: n, scoringPolicy: read(s.scoringPolicyPath), requirementRecord, outputContract: read(s.outputContractPath), freezeManifest: read(s.scoringInputFreezeManifestPath),
    freezeManifestSourceDigest: s.scoringInputFreezeManifestSourceDigest, catalog: read(s.catalogPath), policyManifest: read(s.policyManifestPath), admissionRecord: read(s.admissionRecordPath),
    evaluatorReference: read(s.referencePath), sourceSnapshotDigest: s.sourceSnapshotDigest,
    bundleManifest: { evaluator_bundle_id: read(s.referencePath).evaluator_bundle_id, evaluator_bundle_digest: read(s.referencePath).evaluator_bundle_digest, evaluator_revision: read(s.referencePath).evaluator_revision },
    fragmentBinding: { normalized_result_id: n.normalized_result_id, normalized_result_digest: n.normalized_result_digest, run_instance_id: n.lineage.run_instance_id, case_id: n.lineage.case_id, attempt: n.lineage.attempt } };
  for (const kind of ['all_pass', 'under', 'over', 'missing']) {
    if (kind === 'under') Object.assign(fragment.requirement_results[0], { outcome: 'fail', earned_points: 0 });
    if (kind === 'over') fragment.scope_deviations = [{ finding_id: 'artificial-extra', category: 'scope_deviation', severity: 'medium', evidence_references: [ref] }];
    if (kind === 'missing') { fragment.scope_deviations = []; Object.assign(fragment.requirement_results[0], { outcome: 'pass', earned_points: requirementRecord.requirements[0].max_points }); n.command_evidence.references = []; }
    const derived = fill();
    const fragmentRaw = Buffer.from(JSON.stringify(fragment));
    Object.assign(authority, { privateFragmentDigest: comparisonHash(fragmentRaw), privateFragmentBytes: fragmentRaw.length,
      privateEvaluationRecordDigest: comparisonHash('inert artificial record, never admission') });
    const result = withPrimarySchemaBuild(() => adaptPrivateEvaluatorFragmentToEnvelope({ root: ROOT, fragment, authority }), { commandEvidenceParserRevision: revision });
    assert.equal(result.classification ?? null, { all_pass: 'correct_narrow_execution', under: 'under_processing', over: 'over_processing', missing: null }[kind]);
    assert.equal(result.quality.state, derived.quality); assert.equal(result.completion_claim_correctness.state, derived.quality);
    assert.equal(validateRequirementResultObservations({ evaluatorResult: result, requirementRecord, normalizedResult: n }).evaluationReady, kind !== 'missing');
    validateResultProfile({ evaluatorResult: result, requirementRecord, normalizedResult: n });
    const forged = structuredClone(result); forged.quality.state = kind === 'all_pass' ? 'fail' : 'pass';
    assert.throws(() => validateResultProfile({ evaluatorResult: forged, requirementRecord, normalizedResult: n }), /quality/u);
    assert.throws(() => validatePrivateEvaluatorFragment({ root: ROOT, fragment, scoringPolicy: authority.scoringPolicy, requirementRecord, normalizedResult: n }), /explicit.*authority/u);
  }
  assert.equal(input.scoring_ready, false, 'inert static receipts never become admission');
  const producer = read(join(produced.output_root, 'producer.json'));
  const original = readFileSync(join(source.block.root, 'control/slots/plain/stdout.jsonl'));
  assert.equal(original.includes(Buffer.from('anonymous structural evidence')), true);
  const path = Object.keys(producer.artifact_inventory).find(path => path.endsWith('/command-evidence.json'));
  const target = join(produced.output_root, path), saved = read(target);
  saved.commands[0].runtime_shell_executable = shell === '/bin/bash' ? '/bin/zsh' : '/bin/bash';
  const changed = Buffer.from(JSON.stringify(saved) + '\n'); writeFileSync(target, changed);
  producer.artifact_inventory[path] = { bytes: changed.length, digest: comparisonHash(changed), mode: statSync(target).mode & 0o777 };
  const producerRaw = Buffer.from(JSON.stringify(producer) + '\n'); writeFileSync(join(produced.output_root, 'producer.json'), producerRaw);
  assert.throws(() => verifyPrimaryEvaluationProducer({ ...options, externalDigest: comparisonHash(producerRaw) }), /derived record changed/u, 'repinning public wrappers cannot replace the original runtime event');
});

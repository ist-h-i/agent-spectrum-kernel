// Public artificial inputs only. The grading factory is mocked in this isolated
// test process; no production API accepts a fake adapter or execution callback.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { comparisonHash as hash } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { primaryProcessingDescriptor } from './ask-primary-scoring-version.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { artificialCombinedEnvelope, artificialCommand } from './test-helpers-primary-command-envelope-v4.mjs';
import { artificialLiteralEnvelope, artificialLiteralCommand } from './test-helpers-primary-literal-word-v5.mjs';
import { artificialAuxiliaryEnvelope } from './test-helpers-primary-auxiliary-shell-v6.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';
import * as grading from './ask-primary-evaluation-grading.mjs';

const ROOT = resolve(import.meta.dirname, '..'), roles = ['baseline', 'challenger'];
const raw = value => JSON.stringify(value, null, 2) + '\n';
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, raw(value), { mode: 0o400 }); };
const pin = path => ({ path, digest: hash(readFileSync(path)) });

for (const commandEvidenceParserRevision of ['1.5.0-primary-saved', '1.6.0-primary-saved', '1.7.0-primary-saved', '1.8.0-primary-saved', '1.9.0-primary-saved']) test(`artificial fixed ${commandEvidenceParserRevision} saved pair preserves normalized references and fake or Unknown quality`, async t => {
  const v6 = commandEvidenceParserRevision === '1.9.0-primary-saved';
  const v5 = commandEvidenceParserRevision === '1.8.0-primary-saved' || v6;
  const closedActions = v5 || commandEvidenceParserRevision === '1.7.0-primary-saved';
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-saved-scoring-roundtrip-')));
  t.after(() => { for (const path of ['runtime', 'inert-private']) chmodSync(join(root, path), 0o700); rmSync(root, { recursive: true, force: true }); });
  const runtime = join(root, 'runtime'), privateRoot = join(root, 'inert-private'); mkdirSync(runtime); mkdirSync(privateRoot);
  const resource = { privateRoot, admissionReviewAuthoritySourceDigest: hash('artificial receipt') };
  for (const key of ['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath']) {
    resource[key] = join(privateRoot, key); writeFileSync(resource[key], 'artificial receipt', { mode: 0o400 });
  }
  chmodSync(privateRoot, 0o500);
  const processing = primaryProcessingDescriptor({ commandEvidenceParserRevision });
  for (const path of Object.keys(processing.source_file_digests)) { mkdirSync(dirname(join(runtime, path)), { recursive: true }); cpSync(join(ROOT, path), join(runtime, path)); chmodSync(join(runtime, path), 0o400); }
  for (const name of ['portfolio-catalog', 'portfolio-policy-manifest', 'portfolio-scoring-policy']) {
    cpSync(join(ROOT, 'benchmarks', name + '.json'), join(runtime, 'benchmarks', name + '.json')); chmodSync(join(runtime, 'benchmarks', name + '.json'), 0o400);
  }
  cpSync(join(ROOT, 'scripts/ask-benchmark-portfolio-score.mjs'), join(runtime, 'scripts/ask-benchmark-portfolio-score.mjs')); chmodSync(join(runtime, 'scripts/ask-benchmark-portfolio-score.mjs'), 0o400);
  const fixtures = {};
  for (const id of PRIMARY_FIXTURE_IDS) {
    const base = 'benchmarks/fixtures/checkpoint-b2/' + id; cpSync(join(ROOT, base), join(runtime, base), { recursive: true });
    const freezePath = base + '/scoring-input-freeze-manifest.json', freeze = json(join(runtime, freezePath));
    const pins = Object.values(freeze).filter(value => value && typeof value === 'object' && value.path && value.raw_byte_digest);
    for (const value of pins) value.raw_byte_digest = hash(readFileSync(join(runtime, value.path)));
    write(join(runtime, freezePath), freeze);
    const paths = [...pins.map(value => value.path), ...['scoring-input-freeze-manifest.json', 'input-manifest.json', 'metadata.json', 'task.md', 'source-freeze-candidate.json', 'admission-review.json'].map(name => base + '/' + name), 'scripts/ask-benchmark-portfolio-score.mjs'];
    for (const path of paths) chmodSync(join(runtime, path), 0o400);
    fixtures[id] = { frozen_source_root: runtime, selected: Object.fromEntries(paths.map(path => [path, hash(readFileSync(join(runtime, path)))])), resource,
      resource_file_digests: Object.fromEntries(['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath'].map(key => [key, hash(readFileSync(resource[key]))])) };
  }
  chmodSync(runtime, 0o500);
  const version = v6 ? 'v6' : v5 ? 'v5' : closedActions ? 'v4' : commandEvidenceParserRevision === '1.6.0-primary-saved' ? 'v3' : 'v2';
  const selectorPath = join(root, 'selector.json'); write(selectorPath, { kind: `ask_primary_scoring_version_${version}`, scoring_version_id: `artificial-processing-${version}`, processing, fixtures });
  const blocks = Object.fromEntries(roles.map(role => [role, PRIMARY_FIXTURE_IDS.map(fixtureId => syntheticPrimarySource(t, { fixtureId,
    ...(closedActions ? { mutate: fixtureId === 'mn-build-option-update', nativeEvents: ({ armRoot, contract }) => {
      const declined = role === 'challenger' && fixtureId === 'mn-doc-config-correction';
      const events = (v6 ? artificialAuxiliaryEnvelope : v5 ? artificialLiteralEnvelope : artificialCombinedEnvelope)({ contract, armRoot, edit: fixtureId === 'mn-build-option-update',
        status: declined ? 'declined' : 'completed', exit_code: declined ? null : 0 });
      if (fixtureId === 'mn-build-option-update' && role === 'challenger') events.splice(-1, 0,
        ...artificialCommand(v5 ? artificialLiteralCommand(contract.commands[0]) : renderCommandEvent(contract.commands[0]), 'artificial-later-failure', 'failed', v5 ? 1 : 7));
      if (fixtureId === 'mp-frontend-state-review') events.splice(-1, 0,
        ...artificialCommand("/bin/zsh -lc 'node unknown-program.mjs'", 'artificial-opaque-operation'));
      return events;
    } } : {}) }).block)]));
  const retained = join(root, 'retained'), sourcePath = join(retained, 'source.json'); write(sourcePath, { blocks });
  const resources = Object.fromEntries(roles.map(role => {
    const path = join(root, role + '-resources.json'); write(path, { kind: 'ask_primary_grading_resources_v1', output_root: join(root, role + '-grading'),
      fixtures: Object.fromEntries(PRIMARY_FIXTURE_IDS.map(id => [id, { frozenSourceRoot: runtime, ...resource }])) }); return [role, pin(path)];
  }));
  const calls = [], adapters = {}, normalizedProofs = {}; let releaseFirst, enterFirst, incomplete = false;
  const held = new Promise(resolve => { releaseFirst = resolve; }), entered = new Promise(resolve => { enterFirst = resolve; });
  t.mock.module('./ask-primary-evaluation-grading.mjs', { exports: { ...grading, createPrimaryEvaluationGradingAdapter: ({ resourcesPath, resourcesDigest }) => {
    const role = roles.find(role => resources[role].path === resourcesPath); assert.ok(role); assert.equal(resourcesDigest, resources[role].digest);
    return adapters[role] ??= { preflight: block => ({ status: 'ready', fixture_id: block.fixture_id, synthetic: true }), grade: async block => {
      calls.push({ role, fixture_id: block.fixture_id });
      if (incomplete) return { status: role === 'baseline' ? 'completed' : 'unknown', quality: null, grader_process_starts: 0, model_calls: 0 };
      if (calls.length === 1) { enterFirst(); await held; }
      const produced = await producePrimaryEvaluationArtifacts(block, join(root, role + '-' + block.fixture_id + '-producer'));
      const verified = verifyPrimaryEvaluationProducer({ recordRoot: produced.output_root, externalDigest: produced.external_digest });
      assert.equal(verified.commandEvidenceParserRevision, commandEvidenceParserRevision);
      if (v5) {
        assert.equal(json(join(produced.output_root, 'producer.json')).kind, v6 ? 'ask_primary_evaluation_producer_v6' : 'ask_primary_evaluation_producer_v5');
        for (const attempt of verified.inspection.cases.flatMap(item => item.attempts)) {
          const commands = attempt.commandEvidence.commands.filter(command => command.match_state === 'matched');
          if (block.fixture_id !== 'mp-frontend-state-review') assert.ok(commands.length > 0);
          for (const command of commands) assert.match(command.literal_word_encoding, /^[lensd]+$/u);
        }
      }
      const proof = closedActions ? ['plain', 'kernel_principles_v1', 'full_ask'].map(condition => {
        const input = buildPrimaryEvaluationScoringInputs({ recordRoot: produced.output_root, externalDigest: produced.external_digest },
          { condition, frozenSourceRoot: runtime, ...resource });
        assert.equal(input.status, 'assembled_not_executed');
        const n = input.normalizedResult;
        return { condition, normalized_result_id: n.normalized_result_id, normalized_result_digest: hash(Buffer.from(raw(n))),
          terminal_workspace_tree_digest: n.lineage.terminal_workspace_tree_digest, command_evidence: n.command_evidence };
      }) : null;
      if (closedActions) normalizedProofs[role + '/' + block.fixture_id] = structuredClone(proof);
      // This is a fake boundary result, not a semantic score. A numeric zero
      // proves preservation independently of the command-success projection.
      const numericFake = closedActions && block.fixture_id === 'mp-iac-rollback-design';
      return { status: 'completed', quality: numericFake ? 0 : null, semantic_status: numericFake ? 'synthetic_numeric' : 'manual_review_required',
        ...(closedActions ? { normalized_command_evidence: proof } : {}), grader_process_starts: 0, model_calls: 0 };
    } };
  } } });
  const saved = await import(`./ask-primary-saved-scoring.mjs?artificial-roundtrip-${version}`);
  const prepared = await saved.preparePrimarySavedScoring({ source: pin(sourcePath), scoringVersion: pin(selectorPath), resources,
    retainedRoots: [retained], outputRoot: join(root, 'preparation') });
  assert.equal(prepared.status, 'prepared'); assert.equal(calls.length, 0);
  assert.equal(prepared.producer_normalizations, 0); assert.equal(prepared.grader_process_starts, 0); assert.equal(prepared.model_calls, 0);
  for (const role of roles) assert.equal(existsSync(join(root, role + '-grading')), false);
  const options = { recordRoot: prepared.output_root, externalDigest: prepared.external_digest };
  assert.deepEqual((await saved.verifyPrimarySavedScoringPreparation(options)).record.processing, processing);
  const first = saved.gradePreparedPrimarySavedScoring(options); await entered;
  try { await assert.rejects(saved.gradePreparedPrimarySavedScoring(options), /already exists|EEXIST/u); assert.equal(calls.length, 1); }
  finally { releaseFirst(); }
  const result = await first;
  assert.equal(result.status, 'completed'); assert.equal(result.inspected_sources_unchanged, true); assert.equal(result.formal_aggregate_eligible, false);
  assert.equal(calls.length, 18); assert.equal(result.grader_process_starts, 0); assert.equal(result.model_calls, 0);
  for (const role of roles) {
    assert.deepEqual(result.results[role].map(item => item.fixture_id), PRIMARY_FIXTURE_IDS);
    for (const item of result.results[role]) {
      assert.equal(item.quality, closedActions && item.fixture_id === 'mp-iac-rollback-design' ? 0 : null);
      if (closedActions) {
        assert.deepEqual(item.normalized_command_evidence, normalizedProofs[role + '/' + item.fixture_id]);
        for (const proof of item.normalized_command_evidence) {
          assert.ok(proof.normalized_result_id); assert.match(proof.normalized_result_digest, /^sha256:[a-f0-9]{64}$/u);
          const c = json(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', item.fixture_id, 'verification-command-contract.json'));
          const p = proof.command_evidence;
          if (item.fixture_id === 'mp-frontend-state-review') {
            assert.equal(p.evidence_level, 'unavailable'); assert.deepEqual(p.succeeded_command_ids, []);
            assert.deepEqual(p.unavailable_command_ids, c.commands.map(command => command.command_id));
          } else if (item.fixture_id === 'mn-build-option-update') {
            const ids = c.commands.map(command => command.command_id);
            assert.equal(p.evidence_level, 'executed');
            assert.deepEqual(p.succeeded_command_ids, role === 'baseline' ? ids : [ids[1]]);
            assert.deepEqual(p.failed_command_ids, role === 'challenger' ? [ids[0]] : []);
            if (v5 && role === 'challenger') { assert.equal(p.references.at(-1).outcome, 'failed'); assert.equal(p.references.at(-1).exit_code, 1); }
            assert.deepEqual(p.references.filter(ref => ref.command_id !== null).map(ref => ref.command_id), role === 'baseline' ? ids.toReversed() : [...ids.toReversed(), ids[0]]);
          } else if (item.fixture_id === 'mn-doc-config-correction' && role === 'challenger') {
            assert.deepEqual(p.succeeded_command_ids, []); assert.deepEqual(p.declined_command_ids, c.commands.map(command => command.command_id));
          }
          for (const ref of p.references) { assert.ok(ref.command_evidence_id); assert.match(ref.digest, /^sha256:[a-f0-9]{64}$/u); }
        }
      }
    }
  }
  if (closedActions) assert.deepEqual(json(result.result_path).results, result.results);
  await saved.verifyPrimarySavedScoringPreparation(options);
  await assert.rejects(saved.gradePreparedPrimarySavedScoring(options), /already exists/u); assert.equal(calls.length, 18);
  const partialPreparation = await saved.preparePrimarySavedScoring({ source: pin(sourcePath), scoringVersion: pin(selectorPath), resources,
    retainedRoots: [retained], outputRoot: join(root, 'partial-preparation') });
  incomplete = true;
  const partialOptions = { recordRoot: partialPreparation.output_root, externalDigest: partialPreparation.external_digest };
  const partial = await saved.gradePreparedPrimarySavedScoring(partialOptions);
  assert.equal(partial.status, 'incomplete'); assert.equal(partial.failure, 'existing_private_grading_incomplete');
  assert.equal(partial.results.baseline.length, 1); assert.equal(partial.results.challenger.length, 1); assert.equal(calls.length, 20);
  assert.equal(partial.results.baseline[0].quality, null); assert.equal(partial.inspected_sources_unchanged, true);
  await saved.verifyPrimarySavedScoringPreparation(partialOptions);
  await assert.rejects(saved.gradePreparedPrimarySavedScoring(partialOptions), /already exists/u); assert.equal(calls.length, 20);
});

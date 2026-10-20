// Registry interface controls and, when the catalog assembly is installed, the
// real public 24-task selection plus a retained non-legacy producer round trip.
// All resources/receipts/events are artificial; no evaluator or runner starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as recipes from './ask-primary-fixture-recipe.mjs';
import { PRIMARY_FIXTURE_REGISTRY } from './ask-benchmark-portfolio-catalog.mjs';
import * as selection from './ask-primary-scoring-version.mjs';
import { syntheticV7ScoringVersion } from './test-helpers-primary-evaluation-v7.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { comparisonHash } from './ask-user-comparison-prepare.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';
import { envelopeHeaders, envelopeEnd } from './test-helpers-primary-command-envelope-v4.mjs';
const kind = 'ask_primary_scoring_version_v7', ids = PRIMARY_FIXTURE_REGISTRY.map(row => row[0]);
const inventory = (fixtureIds, fixtureSet, version = kind) => ({ kind: version, fixtures: Object.fromEntries(fixtureIds.map(id => [id, {}])),
  ...(fixtureSet === undefined ? {} : { fixture_set: fixtureSet }) });

test('v7 without a catalog set retains the historical explicit subset; old versions remain nine-only', () => {
  assert.deepEqual(selection.validatePrimaryScoringVersionFixtureInventory(inventory(['mp-data-migration-handoff'])), ['mp-data-migration-handoff']);
  for (const fixtures of [[], ['pf-review-error-contract'], ['not-a-registered-task']])
    assert.throws(() => selection.validatePrimaryScoringVersionFixtureInventory(inventory(fixtures)));
  for (let version = 1; version <= 6; version++) {
    const historical = `ask_primary_scoring_version_v${version}`;
    assert.deepEqual(selection.validatePrimaryScoringVersionFixtureInventory(inventory(recipes.PRIMARY_FIXTURE_IDS, undefined, historical)), recipes.PRIMARY_FIXTURE_IDS);
    assert.throws(() => selection.validatePrimaryScoringVersionFixtureInventory(inventory(ids, 'catalog24', historical)));
    assert.equal(selection.isPrimaryScoringFixtureId('pf-review-error-contract', { evaluationVersion: historical }), false);
  }
  if (typeof recipes.assertPrimaryFixtureInventory !== 'function') {
    assert.throws(() => selection.validatePrimaryScoringVersionFixtureInventory(inventory(ids, 'catalog24')), /registered primary recipe API/u);
    assert.equal(selection.isPrimaryScoringFixtureId('pf-review-error-contract', { evaluationVersion: kind }), false);
  }
});

test('registered recipe API supplies exact legacy9/catalog24 inventory and the new fixture predicate', async t => {
  let inventoryCalls = 0, predicateCalls = 0;
  t.mock.module('./ask-primary-fixture-recipe.mjs', { namedExports: { ...recipes,
    isRegisteredPrimaryFixtureId: id => { predicateCalls++; return ids.includes(id); },
    assertPrimaryFixtureInventory: (actual, set) => {
      inventoryCalls++;
      assert.ok(['legacy9', 'catalog24'].includes(set));
      assert.deepEqual(actual, set === 'legacy9' ? recipes.PRIMARY_FIXTURE_IDS : ids);
    },
  } });
  const api = await import('./ask-primary-scoring-version.mjs?registered-api-control');
  assert.deepEqual(api.validatePrimaryScoringVersionFixtureInventory(inventory(ids, 'catalog24')), ids);
  assert.deepEqual(api.validatePrimaryScoringVersionFixtureInventory(inventory(recipes.PRIMARY_FIXTURE_IDS, 'legacy9')), recipes.PRIMARY_FIXTURE_IDS);
  assert.equal(inventoryCalls, 2);
  assert.ok(predicateCalls >= 15, 'registered fixture decisions come from the supplied recipe predicate');
  for (const fixtureId of ids) assert.equal(api.isPrimaryScoringFixtureId(fixtureId, { evaluationVersion: kind }), true);
  assert.equal(api.isPrimaryScoringFixtureId('unknown-task', { evaluationVersion: kind }), false);
  for (const manifest of [inventory(ids.slice(1), 'catalog24'), inventory([...ids].reverse(), 'catalog24'),
    inventory([...ids.slice(0, -1), 'unknown-task'], 'catalog24'), inventory(recipes.PRIMARY_FIXTURE_IDS, 'catalog24'),
    inventory(ids, 'unknown-set')]) assert.throws(() => api.validatePrimaryScoringVersionFixtureInventory(manifest));
});

test('installed catalog24: every registered task retains saved producer and command evidence through readback', {
  skip: typeof recipes.assertPrimaryFixtureInventory !== 'function' ? 'catalog24 assembly is not installed in this checkout' : false,
}, async t => {
  const f = syntheticV7ScoringVersion(t, { fixtureIds: recipes.primaryFixtureIdsForSet('catalog24'), fixtureSet: 'catalog24' });
  for (const fixtureId of ids) {
    assert.equal(selection.readPrimaryScoringVersion(f.selector, fixtureId, { verifyResourceFiles: true }).root, f.runtime);
  }
  for (const fixtureId of ids) {
  const source = syntheticPrimarySource(t, { fixtureId, nativeEvents: ({ contract }) => [
    ...envelopeHeaders(), ...contract.commands.flatMap((command, index) => {
      const item = { id: `registered-${index}`, type: 'command_execution', command: renderCommandEvent(command).replace('/bin/bash -lc ', '/bin/zsh -lc ') };
      return [{ type: 'item.started', item: { ...item, status: 'in_progress' } },
        { type: 'item.completed', item: { ...item, status: 'completed', exit_code: 0, aggregated_output: 'artificial registered-task evidence' } }];
    }), envelopeEnd(),
  ] });
  source.block.grading.scoring_version = f.selector;
  source.block.grading.binding.scoring_input_freeze_digest = comparisonHash(readFileSync(join(f.runtime, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/scoring-input-freeze-manifest.json`)));
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'catalog24-producer'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  assert.equal(verifyPrimaryEvaluationProducer(options).request.fixture_id, fixtureId);
  const input = buildPrimaryEvaluationScoringInputs(options, { condition: 'plain', frozenSourceRoot: f.runtime, ...f.resource });
  assert.deepEqual(input.normalizedResult.command_evidence.succeeded_command_ids, recipes.buildPrimaryFixtureRecipe(fixtureId).checks.map(check => check.id));
  assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0); assert.equal(input.scoring_ready, false);
  if (!recipes.PRIMARY_FIXTURE_IDS.includes(fixtureId)) await assert.rejects(producePrimaryEvaluationArtifacts({ ...source.block, grading: { binding: source.block.grading.binding } }, join(source.root, 'no-selector')), /primary fixture set is closed/u);
  }
});

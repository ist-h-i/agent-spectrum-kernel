import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID,
  PRIMARY_EVALUATION_CONDITIONS, PRIMARY_PRINCIPLES_V2_EVALUATION_CONDITIONS,
  getPrimaryEvaluationProfile, primaryProfileForKernel, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';
import { PRIMARY_PROFILE_CONDITIONS, PRIMARY_PROFILE_SCHEMAS, activePrimaryProducer,
  primaryGradingConditions, primaryGradingSchemaPath, withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { PRIMARY_GRADING_CONDITIONS, PRIMARY_GRADING_PROFILE_ID } from './ask-primary-evaluation-grading.mjs';
import { generatePrimaryGradingSchemas, primarySchemaBytes } from './generate-ask-primary-grading-schemas.mjs';
const requestFor = profile => ({ profile_id: profile.id, binding: { profile_id: profile.id },
  conditions: [...profile.conditions], slots: profile.conditions.map(condition => ({ condition })) });

test('two immutable profiles retain v1 exports and select exact actual kernel IDs', () => {
  assert.equal(PRIMARY_GRADING_PROFILE_ID, PRIMARY_EVALUATION_PROFILE_ID);
  assert.deepEqual(PRIMARY_PROFILE_CONDITIONS, PRIMARY_EVALUATION_CONDITIONS);
  assert.deepEqual(PRIMARY_GRADING_CONDITIONS, PRIMARY_EVALUATION_CONDITIONS);
  assert.deepEqual(PRIMARY_PRINCIPLES_V2_EVALUATION_CONDITIONS, ['plain', 'kernel_principles_v2', 'full_ask']);
  for (const id of [PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID]) {
    const profile = getPrimaryEvaluationProfile(id);
    assert.equal(primaryProfileForKernel(profile.kernel_condition), profile);
    assert.equal(primaryProfileForRequest(requestFor(profile)), profile);
    assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.conditions));
  }
  for (const id of [undefined, 'primary', 'core', 'kernel_only', 'kernel_principles_v2_candidate']) {
    assert.throws(() => getPrimaryEvaluationProfile(id)); assert.throws(() => primaryProfileForKernel(id));
  }
});
test('binding, condition order, missing or mixed slots cannot select a profile', () => {
  for (const id of [PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID]) {
    const profile = getPrimaryEvaluationProfile(id), other = id === PRIMARY_EVALUATION_PROFILE_ID
      ? PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID : PRIMARY_EVALUATION_PROFILE_ID;
    for (const mutate of [request => { request.binding.profile_id = other; },
      request => { delete request.binding; }, request => { request.conditions.reverse(); },
      request => { request.conditions[1] = 'kernel_only'; }, request => { request.slots[1].condition = getPrimaryEvaluationProfile(other).kernel_condition; },
      request => { request.slots.pop(); }, request => { request.slots.push(request.slots[0]); },
      request => { request.evaluator_binding = { profile_id: other }; }]) {
      const request = requestFor(profile); mutate(request); assert.throws(() => primaryProfileForRequest(request));
    }
  }
});
test('explicit schema builder selects v2 only in its synchronous scope without producer authority', () => {
  const path = '/example/benchmarks/schemas/normalized-portfolio-result.schema.json';
  assert.equal(primaryGradingSchemaPath(path), path);
  withPrimarySchemaBuild(() => {
    assert.equal(activePrimaryProducer(), false);
    assert.match(primaryGradingSchemaPath(path), /primary-k2-normalized-portfolio-result/);
    assert.deepEqual(primaryGradingConditions(['plain','kernel_only','adaptive_ask','full_ask']), PRIMARY_PRINCIPLES_V2_EVALUATION_CONDITIONS);
    assert.throws(() => primaryGradingSchemaPath('/example/benchmarks/schemas/primary-normalized-portfolio-result.schema.json'), /profile_mix/);
    assert.throws(() => withPrimarySchemaBuild(() => {}), /nested_scope/);
  }, { profileId: PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID });
  assert.equal(primaryGradingSchemaPath(path), path);
  assert.throws(() => withPrimarySchemaBuild(() => Promise.resolve(), { profileId: PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID }), /async_scope/);
  assert.throws(() => withPrimarySchemaBuild(() => {}, { profileId: 'unknown' }));
});
test('generation writes only eight new k2 schemas with wx and checks both distinct families', t => {
  const root = mkdtempSync(join(tmpdir(), 'primary-schema-profile-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, 'benchmarks/schemas'); mkdirSync(folder, { recursive: true });
  for (const name of PRIMARY_PROFILE_SCHEMAS) for (const prefix of ['', 'primary-']) {
    const file = `${prefix}${name}.schema.json`; writeFileSync(join(folder, file), readFileSync(new URL(`../benchmarks/schemas/${file}`, import.meta.url)));
  }
  const originals = PRIMARY_PROFILE_SCHEMAS.map(name => readFileSync(join(folder, `primary-${name}.schema.json`)));
  generatePrimaryGradingSchemas({ root }); generatePrimaryGradingSchemas({ root, check: true });
  for (const [index, name] of PRIMARY_PROFILE_SCHEMAS.entries()) {
    assert.deepEqual(readFileSync(join(folder, `primary-${name}.schema.json`)), originals[index]);
    const k2 = readFileSync(join(folder, `primary-k2-${name}.schema.json`));
    assert.deepEqual(k2, primarySchemaBytes(name, { root, profileId: PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID }));
    assert.ok(!k2.equals(originals[index])); assert.ok(k2.includes('kernel_principles_v2'));
    assert.ok(!k2.includes('kernel_principles_v1'));
  }
  assert.throws(() => generatePrimaryGradingSchemas({ root }), /EEXIST/);
  writeFileSync(join(folder, `primary-${PRIMARY_PROFILE_SCHEMAS[0]}.schema.json`), 'changed');
  assert.throws(() => generatePrimaryGradingSchemas({ root, check: true }), /stale primary schema/);
});

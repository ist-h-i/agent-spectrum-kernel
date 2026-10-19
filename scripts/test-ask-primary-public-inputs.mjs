import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectPrimaryPublicInputs, preparePrimaryPublicInputs, verifyPrimaryPublicInputs } from './ask-primary-evaluation-prepare.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-public-')));
const json = path => JSON.parse(readFileSync(path));

test('canonical 24 tasks expose public readiness independently of nine-task scoring authority', () => {
  const report = inspectPrimaryPublicInputs();
  assert.equal(report.fixtures.length, 24);
  assert.deepEqual(report.suite_counts, { high_impact: 4, mechanism_negative: 6, mechanism_positive: 6, practice_frequency: 8 });
  assert.equal(report.fixtures.filter(x => x.public_input_status === 'valid').length, 23);
  assert.equal(report.fixtures.filter(x => x.primary_comparison_registered).length, 9);
  assert.equal(report.fixtures.filter(x => x.portfolio_registered).length, 15);
  assert.ok(report.fixtures.every(x => x.quality === null && x.semantic_controls.status === 'not_run'));
  const good = report.fixtures.find(x => x.fixture_id === 'mp-ci-evidence-gap');
  assert.ok(good.requirements.length > 0 && good.output_contract && good.verification_commands.length);
  assert.ok(good.slots.every(x => x.quality === null && x.requirements.every(y => y.status === 'not_evaluated')));
  assert.ok(report.fixtures.find(x => x.fixture_id === 'pf-performance-regression').failures.length);
});

test('fresh preparation keeps all 24 records, copies only public inputs, and verifies independently', () => {
  const area = scratch();
  try {
    const output = join(area, 'prepared'), first = preparePrimaryPublicInputs(output);
    assert.equal(first.fixtures.length, 24);
    assert.equal(first.fixtures.filter(x => x.public_input_status === 'prepared').length, 23);
    assert.equal(first.fixtures.flatMap(x => x.slots).length, 72);
    for (const row of first.fixtures) {
      assert.ok(existsSync(join(output, 'records', row.fixture_id, 'status.json')));
      assert.equal(existsSync(join(output, 'inputs', row.fixture_id)), row.public_input_status === 'prepared');
      if (row.public_input_status === 'prepared') assert.deepEqual(Object.keys(json(join(output, 'records', row.fixture_id, 'input-manifest.json')).fixtures), [row.fixture_id]);
    }
    const verified = verifyPrimaryPublicInputs(output);
    assert.equal(verified.fixtures.filter(x => x.public_input_status === 'valid').length, 23);
    assert.ok(verified.fixtures.every(x => x.quality === null));
    assert.throws(() => preparePrimaryPublicInputs(output), /exist/i);
    const id = 'mn-doc-config-correction';
    writeFileSync(join(output, 'inputs', id, 'task.md'), 'changed');
    const after = verifyPrimaryPublicInputs(output);
    assert.equal(after.fixtures.find(x => x.fixture_id === id).public_input_status, 'invalid');
    assert.equal(after.fixtures.filter(x => x.public_input_status === 'valid').length, 22);
    assert.ok(after.fixtures.find(x => x.fixture_id === id).failures.some(x => /input changed/.test(x)));
    assert.equal(json(join(output, 'preparation.json')).fixtures.find(x => x.fixture_id === id).public_input_status, 'prepared');
  } finally { rmSync(area, { recursive: true, force: true }); }
});

test('bad manifest and absent contracts are isolated; later fixtures still prepare', () => {
  const area = scratch();
  try {
    const source = join(area, 'source');
    mkdirSync(join(source, 'benchmarks'), { recursive: true });
    cpSync(join(root, 'benchmarks/schemas'), join(source, 'benchmarks/schemas'), { recursive: true });
    for (const name of ['portfolio-catalog.json', 'adaptive-portfolio.config.json']) cpSync(join(root, 'benchmarks', name), join(source, 'benchmarks', name));
    for (const id of ['mn-doc-config-correction', 'mp-ci-evidence-gap']) cpSync(join(root, 'benchmarks/fixtures/checkpoint-b2', id), join(source, 'benchmarks/fixtures/checkpoint-b2', id), { recursive: true });
    const path = join(source, 'benchmarks/fixtures/checkpoint-b2/mn-doc-config-correction/input-manifest.json');
    const input = json(path); input.fixtures['mn-doc-config-correction'].files[0].path = '../escape'; writeFileSync(path, JSON.stringify(input));
    const report = preparePrimaryPublicInputs(join(area, 'prepared'), { root: source });
    assert.equal(report.fixtures.find(x => x.fixture_id === 'mn-doc-config-correction').public_input_status, 'invalid');
    assert.equal(report.fixtures.find(x => x.fixture_id === 'mp-ci-evidence-gap').public_input_status, 'prepared');
    assert.equal(existsSync(join(area, 'escape')), false);
    assert.equal(report.fixtures.length, 24);
  } finally { rmSync(area, { recursive: true, force: true }); }
});

for (const [name, mutate] of [
  ["null requirement", (base) => { const path = join(base, 'requirement-record.json'); const value = json(path); value.requirements = [null]; writeFileSync(path, JSON.stringify(value)); }],
  ["incomplete output contract", (base) => { const path = join(base, 'output-contract.json'); const value = json(path); writeFileSync(path, JSON.stringify({ fixture_id: value.fixture_id, verification_command_contract_digest: value.verification_command_contract_digest })); }],
  ["wrong evidence fixture", (base) => { const path = join(base, 'evidence-map.json'); const value = json(path); value.fixture_id = 'different-fixture'; writeFileSync(path, JSON.stringify(value)); }],
  ["scope traversal", (base) => { const path = join(base, 'evidence-map.json'); const value = json(path); value.scope_boundary_authority.allowed_candidate_paths = ['../../outside']; writeFileSync(path, JSON.stringify(value)); }],
]) test(`independent review regression: ${name} blocks one task and preserves the other 23 records`, () => {
  const area = scratch();
  try {
    const source = join(area, 'source'); mkdirSync(join(source, 'benchmarks'), { recursive: true });
    for (const name of ['portfolio-catalog.json', 'adaptive-portfolio.config.json']) cpSync(join(root, 'benchmarks', name), join(source, 'benchmarks', name));
    cpSync(join(root, 'benchmarks/schemas'), join(source, 'benchmarks/schemas'), { recursive: true });
    for (const id of ['mn-doc-config-correction', 'mp-ci-evidence-gap']) cpSync(join(root, 'benchmarks/fixtures/checkpoint-b2', id), join(source, 'benchmarks/fixtures/checkpoint-b2', id), { recursive: true });
    mutate(join(source, 'benchmarks/fixtures/checkpoint-b2/mn-doc-config-correction'));
    const output = join(area, 'prepared'), report = preparePrimaryPublicInputs(output, { root: source });
    assert.equal(report.fixtures.length, 24);
    assert.equal(report.fixtures.find(x => x.fixture_id === 'mn-doc-config-correction').public_input_status, 'invalid');
    assert.equal(report.fixtures.find(x => x.fixture_id === 'mp-ci-evidence-gap').public_input_status, 'prepared');
    assert.equal(verifyPrimaryPublicInputs(output).fixtures.length, 24);
  } finally { rmSync(area, { recursive: true, force: true }); }
});

test('prepared controls and extra files cannot silently change; preparation remains read-only', () => {
  const area = scratch();
  try {
    const output = join(area, 'prepared'); preparePrimaryPublicInputs(output);
    const id = 'mp-ci-evidence-gap';
    writeFileSync(join(output, 'inputs', id, 'unlisted.json'), '{}');
    assert.equal(verifyPrimaryPublicInputs(output).fixtures.find(x => x.fixture_id === id).public_input_status, 'invalid');
    writeFileSync(join(output, 'records/mn-focused-regression-test/requirement-record.json'), '{}');
    const after = verifyPrimaryPublicInputs(output);
    assert.equal(after.fixtures.find(x => x.fixture_id === 'mn-focused-regression-test').public_input_status, 'invalid');
    assert.equal(after.fixtures.filter(x => x.public_input_status === 'valid').length, 21);
    assert.ok(after.fixtures.flatMap(x => x.slots).every(x => x.quality === null));
  } finally { rmSync(area, { recursive: true, force: true }); }
});

test('the existing benchmark CLI lists, prepares, and verifies the entire catalog with partial exit status', async () => {
  const { spawnSync } = await import('node:child_process');
  const area = scratch();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const cli = args => spawnSync(process.execPath, [join(root, 'scripts/ask-benchmark.mjs'), ...args], { encoding: 'utf8', env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  try {
    const list = cli(['list-primary-inputs']); assert.equal(list.status, 0, list.stderr);
    assert.equal(JSON.parse(list.stdout).fixtures.length, 24);
    const output = join(area, 'prepared'), reportPath = join(area, 'verified.json');
    const prepare = cli(['prepare-primary-inputs', '--output', output]); assert.equal(prepare.status, 2, prepare.stderr);
    assert.equal(JSON.parse(prepare.stdout).fixtures.length, 24);
    const verified = cli(['verify-primary-inputs', '--input', output, '--output', reportPath]); assert.equal(verified.status, 2, verified.stderr);
    assert.equal(json(reportPath).fixtures.flatMap(x => x.slots).length, 72);
    assert.equal(cli(['verify-primary-inputs', '--input', output, '--output', reportPath]).status, 1);
    assert.equal(cli(['verify-primary-inputs', '--input', output, '--output', join(output, 'extra.json')]).status, 1);
    assert.equal(existsSync(join(output, 'extra.json')), false);
    const alias = join(area, 'alias'); symlinkSync(output, alias, 'dir');
    assert.equal(cli(['verify-primary-inputs', '--input', output, '--output', join(alias, 'unexpected.json')]).status, 1);
    assert.equal(cli(['list-primary-inputs', '--output', join(alias, 'unexpected.json')]).status, 1);
    assert.equal(existsSync(join(output, 'unexpected.json')), false);
  } finally { rmSync(area, { recursive: true, force: true }); }
});

test('24 artificial source packages use the same preparation loop, without conferring grading authority', async () => {
  const { computeVerificationCommandContractDigest } = await import('./ask-benchmark-command-evidence.mjs');
  const { computeOutputContractDigest, computeRequirementRecordDigest } = await import('./ask-benchmark-scoring-contract.mjs');
  const { comparisonHash } = await import('./ask-user-comparison-prepare.mjs');
  const area = scratch();
  try {
    const source = join(area, 'synthetic-source'), templateId = 'mp-ci-evidence-gap';
    mkdirSync(join(source, 'benchmarks'), { recursive: true });
    for (const name of ['portfolio-catalog.json', 'adaptive-portfolio.config.json']) cpSync(join(root, 'benchmarks', name), join(source, 'benchmarks', name));
    cpSync(join(root, 'benchmarks/schemas'), join(source, 'benchmarks/schemas'), { recursive: true });
    const ids = json(join(root, 'benchmarks/portfolio-catalog.json')).fixtures.filter(x => x.fixture_role === 'primary').map(x => x.fixture_id);
    // Repeated artificial review inputs are transport controls, never substitutes
    // for the 24 actual tasks or their normal/bad semantic controls.
    for (const id of ids) {
      const base = join(source, 'benchmarks/fixtures/checkpoint-b2', id);
      cpSync(join(root, 'benchmarks/fixtures/checkpoint-b2', templateId), base, { recursive: true });
      const save = (name, value) => writeFileSync(join(base, name), `${JSON.stringify(value, null, 2)}\n`);
      for (const name of ['input-manifest.json', 'verification-command-contract.json', 'output-contract.json', 'requirement-record.json', 'evidence-map.json']) {
        save(name, JSON.parse(readFileSync(join(base, name), 'utf8').replaceAll(templateId, id)));
      }
      const commands = json(join(base, 'verification-command-contract.json'));
      commands.fixture_input_digest = comparisonHash(readFileSync(join(base, 'input-manifest.json')));
      commands.contract_digest = computeVerificationCommandContractDigest(commands); save('verification-command-contract.json', commands);
      const requirements = json(join(base, 'requirement-record.json'));
      requirements.requirement_record_digest = computeRequirementRecordDigest(requirements); save('requirement-record.json', requirements);
      const output = json(join(base, 'output-contract.json'));
      output.verification_command_contract_digest = commands.contract_digest;
      output.output_contract_digest = computeOutputContractDigest(output); save('output-contract.json', output);
    }
    const output = join(area, 'prepared'), report = preparePrimaryPublicInputs(output, { root: source });
    assert.equal(report.public_input_status, 'complete');
    assert.equal(report.fixtures.filter(x => x.public_input_status === 'prepared').length, 24);
    const verified = verifyPrimaryPublicInputs(output);
    assert.equal(verified.fixtures.filter(x => x.public_input_status === 'valid').length, 24);
    assert.equal(verified.fixtures.flatMap(x => x.slots).length, 72);
    assert.equal(verified.semantic_grading_status, 'not_evaluated');
    assert.equal(verified.comparison_start_allowed, false);
    assert.equal(verified.fixtures.filter(x => x.primary_comparison_registered).length, 9);
  } finally { rmSync(area, { recursive: true, force: true }); }
});

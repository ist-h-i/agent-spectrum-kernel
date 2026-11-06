import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { captureInstructionEnvironment } from './instruction-environment.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
import { buildPortfolioPlan } from './ask-benchmark-plan.mjs';
import { materializePortfolio, validateMaterializedPortfolio } from './ask-benchmark-materialize.mjs';
for (const track of ['codex', 'claude']) test(`${track}: real existing materializer preserves fixtures while projecting exact frozen environment`, t => {
  const f = environmentFixture(t, track), repo = resolve(import.meta.dirname, '..'), checkout = join(f.root, 'checkout');
  const clone = spawnSync('git', ['clone', '--local', '--no-hardlinks', repo, checkout], { encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).stdout.trim();
  const configPath = join(checkout, 'environment-test-config.json'), config = JSON.parse(readFileSync(join(checkout, 'benchmarks/adaptive-portfolio.config.json')));
  config.fixtures = [config.fixtures[0]]; writeFileSync(configPath, JSON.stringify(config));
  config._configPath = configPath; config._protocolPath = join(checkout, config.protocol_path);
  const plan = buildPortfolioPlan({ root: checkout, config, repositoryRevision: head, seed: 'environment-model-free' });
  const planPath = join(f.root, 'plan.json'); writeFileSync(planPath, JSON.stringify(plan));
  const saved = captureInstructionEnvironment(f.options), outputPath = join(f.root, 'materialized');
  const common = { root: checkout, config, planPath, repositoryRevision: head };
  materializePortfolio({ ...common, outputPath, instructionEnvironment: { ...f.options, environmentObjectDigest: saved.object_digest } });
  const verified = validateMaterializedPortfolio({ ...common, plan, materializedRoot: outputPath });
  for (const record of verified.manifest.cases.filter(c => c.adapter === track && c.condition === 'full_ask')) {
    assert.equal(record.projection_evidence.renderer_id, 'instruction-environment-export');
    assert.equal(record.projected_asset_inventory.length, 6);
    assert.equal(readFileSync(join(outputPath, record.case_id, 'AGENTS.md'), 'utf8'), 'Artificial bounded instruction environment.\n');
  }
  assert.ok(verified.manifest.cases.filter(c => c.condition !== 'full_ask').every(c => c.projection_evidence.renderer_id !== 'instruction-environment-export'));
});

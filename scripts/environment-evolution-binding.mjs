import assert from 'node:assert/strict';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from './content-addressed-store.mjs';
import { verifyInstructionEnvironment } from './instruction-environment.mjs';

export const ENVIRONMENT_EVOLUTION_MAPPING = Object.freeze({ mode: 'instruction_environment_v1_exact',
  baseline_condition: 'instruction_environment', challenger_condition: 'instruction_environment' });
export const ENVIRONMENT_EVOLUTION_MAPPING_DIGEST = canonicalDigest(ENVIRONMENT_EVOLUTION_MAPPING);
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
function verifyPair(options, binding) {
  assert.deepEqual(Object.keys(binding).sort(), ['environments', 'object_kind', 'roles', 'schema_version']);
  assert.equal(binding.schema_version, '1.0.0'); assert.equal(binding.object_kind, 'instruction_environment_evolution_binding');
  assert.deepEqual(Object.keys(binding.environments).sort(), ['baseline', 'challenger']);
  const result = {};
  for (const role of ['baseline', 'challenger']) {
    const checked = verifyInstructionEnvironment({ ...options, environmentObjectDigest: binding.environments[role] });
    const environment = checked.environment, expected = binding.roles[role];
    assert.equal(environment.selection_object_digest, expected.selection_object_digest, 'environment role selection transplant');
    assert.equal(environment.registry_snapshot_digest, expected.registry_snapshot_digest, 'environment role Registry transplant');
    assert.ok(environment.bindings.some(b => same(b.asset, expected.selected_asset)), 'environment missing changed Asset');
    result[role] = checked;
  }
  assert.equal(result.baseline.environment.adapter, result.challenger.environment.adapter, 'compare adapters in separate experiments');
  assert.ok(same(result.baseline.environment.runtime, result.challenger.environment.runtime), 'runtime drift requires a separate experiment');
  return result;
}
export function buildEnvironmentEvolutionProjection(options) {
  const binding = { schema_version: '1.0.0', object_kind: 'instruction_environment_evolution_binding',
    roles: structuredClone(options.roles), environments: structuredClone(options.environments) };
  verifyPair(options, binding);
  const saved = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: binding });
  return { ...ENVIRONMENT_EVOLUTION_MAPPING, mapping_digest: ENVIRONMENT_EVOLUTION_MAPPING_DIGEST, projection_evidence_digest: saved.digest };
}
export function verifyEnvironmentEvolutionBinding(options, experiment) {
  const binding = readContentAddressedJson({ storeRoot: options.storeRoot, digest: experiment.projection.projection_evidence_digest }).value;
  assert.ok(same(binding.roles, experiment.roles), 'environment experiment roles drifted');
  const pair = verifyPair(options, binding);
  for (const role of ['baseline', 'challenger']) {
    assert.equal(pair[role].environment.adapter, experiment.protocol.adapter.name, 'environment experiment adapter drift');
    assert.equal(pair[role].environment.runtime.model, experiment.protocol.model, 'environment experiment model drift');
    assert.equal(pair[role].environment.runtime.cli_version, experiment.protocol.cli.version, 'environment experiment CLI drift');
  }
  if (experiment.causal_design.mode === 'one_factor') {
    const a = pair.baseline, b = pair.challenger;
    const support = env => env.support;
    assert.ok(same(support(a.environment), support(b.environment)), 'one-factor environment changed supporting files');
    const other = (env, role) => env.bindings.filter(item => !same(item.asset, experiment.roles[role].selected_asset));
    assert.ok(same(other(a.environment, 'baseline'), other(b.environment, 'challenger')), 'one-factor environment changed additional Assets');
  }
  return { binding, pair };
}

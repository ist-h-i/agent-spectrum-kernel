// Public practical case preparation only. No candidate, model or grading dispatch.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {agentVisibleFiles, sha256} from './ask-benchmark-mp-frontend-state-review.mjs';
import {computeCommandContractDigest, computeVerificationCommandContractDigest, logicalCommandDigest,
  renderedEventCommandDigest, validateVerificationCommandContract} from './ask-benchmark-command-evidence.mjs';

export const FIXTURE_ID = 'ordinary-frontend-state-review';
export const FIXTURE_PATH = `benchmarks/fixtures/practical/${FIXTURE_ID}`;
const ROOT = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

export function buildOrdinaryReviewInputArtifacts(fixture) {
  const inputManifest = {schema_version:1, hash_algorithm:'sha256', scope:'agent-visible task.md + workspace/**',
    fixtures:{[FIXTURE_ID]:{class:'pr_review', difficulty:'hard', target_minutes:20, files:agentVisibleFiles(fixture)}}};
  const commands = [
    ['review-contract-validation', 'npm run validate:review', 'required'],
    ['state-unit-tests', 'npm test', 'optional'],
    ['list-detail-interaction-tests', 'npm run test:interaction', 'optional'],
  ].map(([command_id, canonical_script, requirement]) => {
    const command = {command_id, purpose:'test', working_directory:{path:'.', evidence_requirement:'not_required'},
      safe_argv:null, execution_form:'codex_shell_command', shell_family:'posix_bash',
      shell_envelope:{executable:'/bin/bash', arguments:['-lc']}, canonical_script, requirement,
      alternative_group_id:null, timeout_ms:60000};
    command.logical_command_digest = logicalCommandDigest(command);
    command.rendered_event_command_digest = renderedEventCommandDigest(command);
    command.command_contract_digest = computeCommandContractDigest(command);
    return command;
  });
  const verification = {schema_version:'1.2.0', schema_path:'benchmarks/schemas/portfolio-verification-command-contract.schema.json',
    program:'adaptive_ask_verification_command_contract', fixture_id:FIXTURE_ID,
    fixture_input_digest:sha256(jsonBytes(inputManifest)), commands};
  verification.contract_digest = computeVerificationCommandContractDigest(verification);
  return {inputManifest, verification};
}

export function validateOrdinaryReviewCase(root = ROOT) {
  const fixture = join(root, FIXTURE_PATH), expected = buildOrdinaryReviewInputArtifacts(fixture);
  const manifest = read(join(fixture, 'input-manifest.json'));
  assert.deepEqual(manifest, expected.inputManifest, 'ordinary review input inventory drift');
  const contract = read(join(fixture, 'verification-command-contract.json'));
  assert.deepEqual(contract, expected.verification, 'ordinary review command contract drift');
  validateVerificationCommandContract(contract, {root:ROOT});
  const requirements = read(join(fixture, 'requirement-record.json'));
  const map = read(join(fixture, 'evidence-map.json')), scoring = read(join(fixture, 'scoring-contract.json'));
  for (const value of [requirements, map, scoring]) assert.equal(value.fixture_id, FIXTURE_ID);
  const paths = manifest.fixtures[FIXTURE_ID].files.map(f => f.path);
  assert.deepEqual(map.scope_boundary_authority.allowed_candidate_paths, ['workspace/review.json']);
  assert.deepEqual(map.scope_boundary_authority.required_candidate_paths, ['workspace/review.json']);
  assert.deepEqual(map.scope_boundary_authority.protected_candidate_paths, paths.filter(p => p.startsWith('workspace/')));
  assert.equal(map.scope_boundary_authority.unmanaged_additions, 'forbidden');
  assert.equal(map.scope_boundary_authority.unmanaged_deletions, 'forbidden');
  for (const entry of map.maps) assert.ok(entry.agent_visible_paths.length && entry.agent_visible_paths.every(p => paths.includes(p)));
  for (const requirement of requirements.requirements) {
    assert.equal(requirement.partial_credit_allowed, false);
    assert.ok(requirement.evidence_map_ids.length && requirement.evidence_map_ids.every(id => map.maps.some(m => m.evidence_map_id === id)));
  }
  assert.equal(requirements.requirements.reduce((sum, r) => sum + r.max_points, 0), 10);
  assert.deepEqual(scoring.scored_requirement_ids, requirements.requirements.map(r => r.requirement_id));
  assert.equal(scoring.formal_admission, false);
  return {fixture_id:FIXTURE_ID, input_digest:sha256(readFileSync(join(fixture, 'input-manifest.json'))), verification_digest:contract.contract_digest};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length <= 3 && [undefined, 'write', 'validate'].includes(process.argv[2]), 'usage: practical-ordinary-review-case.mjs [write|validate]');
  if (process.argv[2] === 'write') {
    const {inputManifest, verification} = buildOrdinaryReviewInputArtifacts(join(ROOT, FIXTURE_PATH));
    writeFileSync(join(ROOT, FIXTURE_PATH, 'input-manifest.json'), jsonBytes(inputManifest));
    writeFileSync(join(ROOT, FIXTURE_PATH, 'verification-command-contract.json'), jsonBytes(verification));
  }
  console.log(JSON.stringify(validateOrdinaryReviewCase()));
}

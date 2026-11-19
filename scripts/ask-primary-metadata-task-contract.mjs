// Task interpretation only. These checks confer no evaluator/admission authority.
// Keep this policy leaf independent of scoring-version and execution orchestration.
import assert from 'node:assert/strict';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

export const PRIMARY_METADATA_REGENERATED_HEADERS = Object.freeze([
  'evaluator_bundle_id', 'evaluator_bundle_digest', 'evaluator_byte_count', 'review_status', 'metadata_digest',
]);
export const PRIMARY_METADATA_TASK_POLICY = 'ask_primary_metadata_task_semantics_v1';
const taskFields = Object.freeze(['schema_version', 'fixture_id', 'fixture_role', 'suite', 'task_class',
  'domain', 'difficulty', 'repetitions', 'risk_boundary', 'capability_families', 'evidence_topologies',
  'outcome_dimensions', 'output_contract_type', 'requirement_record_id', 'output_contract_id', 'measured_execution_performed']);
const fields = Object.freeze([...taskFields, ...PRIMARY_METADATA_REGENERATED_HEADERS].sort());
export function projectPrimaryMetadataTaskSemantics(metadata) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !PRIMARY_METADATA_REGENERATED_HEADERS.includes(key)));
}
export function validatePrimaryMetadataTaskBytes(bytes, expectedDigest) {
  const metadata = parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'primary task metadata');
  assert.ok(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'task metadata object required');
  assert.deepEqual(Object.keys(metadata).sort(), fields, 'task metadata fields must be closed');
  assert.match(metadata.evaluator_bundle_id, /^evaluator-[a-f0-9]{64}$/u, 'invalid evaluator bundle ID');
  assert.match(metadata.evaluator_bundle_digest, /^sha256:[a-f0-9]{64}$/u, 'invalid evaluator bundle digest');
  assert.ok(Number.isSafeInteger(metadata.evaluator_byte_count) && metadata.evaluator_byte_count > 0, 'invalid evaluator byte count');
  // All four production writers retain pending metadata; later admission is an overlay.
  assert.equal(metadata.review_status, 'pending_independent_review', 'task metadata cannot claim admission');
  const { metadata_digest: supplied, ...body } = metadata;
  assert.equal(supplied, canonicalDigest(body), 'task metadata self-digest is invalid');
  const digest = canonicalDigest({ policy: PRIMARY_METADATA_TASK_POLICY, metadata: projectPrimaryMetadataTaskSemantics(metadata) });
  assert.equal(digest, expectedDigest, 'public metadata task semantics drift requires descriptor review');
  return metadata;
}

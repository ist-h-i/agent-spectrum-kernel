import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { digest } from './ask-core-bundle-product.mjs';

const SHA = /^sha256:[a-f0-9]{64}$/u, HEAD = /^[a-f0-9]{40}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
function need(ok) { if (!ok) throw new Error('core_controller_record_refused'); }
function closed(v, keys) { need(v && typeof v === 'object' && !Array.isArray(v) && same(Object.keys(v).sort(), [...keys].sort())); }
function decode(bytes, sha) {
  need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 1048576 && SHA.test(sha ?? '') && digest(bytes) === sha);
  return parseJsonRejectDuplicateKeys(new TextDecoder('utf8', { fatal: true }).decode(bytes));
}
function record(value, stdout) {
  closed(value, ['kind', 'evidence_class', 'invocation_id', 'role', 'task_id', 'source_head', 'capture_digest', 'execution_request_digest', 'invocation', 'started_ms', 'completed_ms', 'stdout']);
  need(value.kind === 'ask_core_direct_controller_record_v1' && ['synthetic_fixture', 'owner_attested_native_record'].includes(value.evidence_class));
  need(ID.test(value.invocation_id ?? '') && ID.test(value.task_id ?? '') && HEAD.test(value.source_head ?? '') && ['producer', 'reviewer'].includes(value.role));
  need(SHA.test(value.capture_digest ?? '') && SHA.test(value.execution_request_digest ?? ''));
  closed(value.invocation, ['executable', 'arguments']);
  need(typeof value.invocation.executable === 'string' && value.invocation.executable.length > 0 && value.invocation.executable.length <= 512);
  need(Array.isArray(value.invocation.arguments) && value.invocation.arguments.length <= 64 && value.invocation.arguments.every(a => typeof a === 'string' && a.length <= 4096));
  need(Number.isSafeInteger(value.started_ms) && Number.isSafeInteger(value.completed_ms) && value.started_ms >= 0 && value.completed_ms >= value.started_ms);
  closed(value.stdout, ['bytes', 'digest']);
  need(Buffer.isBuffer(stdout) && stdout.length > 0 && stdout.length <= 8388608 && value.stdout.bytes === stdout.length && value.stdout.digest === digest(stdout));
  return value;
}

/** Called by a launcher with already captured stdout; starts no process. The
 * metadata and owner custody statement are not provider-signed identity. */
export function buildCoreDirectControllerRecord(metadata, stdout) {
  const value = { kind: 'ask_core_direct_controller_record_v1', ...metadata, stdout: { bytes: stdout.length, digest: digest(stdout) } };
  record(value, stdout);
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  return { bytes, digest: digest(bytes) };
}

export function inspectCoreControllerRecords(input, { expectedHead, expectedTask, expectedCaptureDigest, expectedRequestDigest, evidenceClass }) {
  closed(input, ['producerRecordBytes', 'producerRecordDigest', 'producerStdoutBytes', 'reviewerRecordBytes', 'reviewerRecordDigest', 'reviewerStdoutBytes', 'ownerBytes', 'ownerDigest']);
  const producer = record(decode(input.producerRecordBytes, input.producerRecordDigest), input.producerStdoutBytes);
  const reviewer = record(decode(input.reviewerRecordBytes, input.reviewerRecordDigest), input.reviewerStdoutBytes);
  need(producer.role === 'producer' && reviewer.role === 'reviewer' && producer.invocation_id !== reviewer.invocation_id && input.producerRecordDigest !== input.reviewerRecordDigest);
  for (const v of [producer, reviewer]) need(v.source_head === expectedHead && v.task_id === expectedTask && v.capture_digest === expectedCaptureDigest && v.execution_request_digest === expectedRequestDigest && v.evidence_class === evidenceClass);
  const owner = decode(input.ownerBytes, input.ownerDigest);
  closed(owner, ['kind', 'decision', 'assurance', 'cryptographic_provider_signature_present', 'purpose', 'source_head', 'task_id', 'capture_digest', 'execution_request_digest', 'producer_record_digest', 'reviewer_record_digest', 'actual_invocation_role_task_associations_confirmed', 'independent_review_confirmed']);
  need(owner.kind === 'ask_core_direct_records_owner_acceptance_v1' && owner.decision === 'accept_custody' && owner.assurance === 'repository_owner_attested_controller_archive');
  need(owner.cryptographic_provider_signature_present === false && owner.purpose === 'derived_scoring_inputs_only_no_execution_permission');
  need(owner.source_head === expectedHead && owner.task_id === expectedTask && owner.capture_digest === expectedCaptureDigest && owner.execution_request_digest === expectedRequestDigest && owner.producer_record_digest === input.producerRecordDigest && owner.reviewer_record_digest === input.reviewerRecordDigest);
  need(owner.actual_invocation_role_task_associations_confirmed === true && owner.independent_review_confirmed === true);
  return { producer, reviewer, owner, producer_record_digest: input.producerRecordDigest, reviewer_record_digest: input.reviewerRecordDigest, owner_digest: input.ownerDigest };
}

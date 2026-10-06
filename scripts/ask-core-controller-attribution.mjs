import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { digest } from './ask-core-bundle-product.mjs';

const contexts = new WeakMap();
const SHA = /^sha256:[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const CONDITIONS = ['plain', 'core', 'full'];
const ASSURANCE = 'repository_owner_attested_controller_archive';
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
function need(ok) { if (!ok) throw new Error('controller_attribution_refused'); }
function closed(value, keys) {
  need(value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort()));
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function read(bytes, externalDigest) {
  need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 1048576 && SHA.test(externalDigest ?? '') && digest(bytes) === externalDigest);
  return parseJsonRejectDuplicateKeys(new TextDecoder('utf8', { fatal: true }).decode(bytes));
}

/** The owner is the explicit, noncryptographic trust anchor. Code checks the
 * accepted archive and its bindings; it cannot authenticate a provider export
 * or verify the owner's custody statement. This is not an execution grant. */
export function inspectCoreControllerAttribution(input) {
  closed(input, ['journalBytes', 'journalDigest', 'reviewArchiveBytes', 'reviewArchiveDigest', 'ownerAttestationBytes', 'ownerAttestationDigest', 'expectedHead', 'expectedSources']);
  const journal = read(input.journalBytes, input.journalDigest);
  const archive = read(input.reviewArchiveBytes, input.reviewArchiveDigest);
  const owner = read(input.ownerAttestationBytes, input.ownerAttestationDigest);
  closed(journal, ['kind', 'evidence_class', 'git_head', 'source_digests', 'product_digest', 'request_digest', 'connection_source_digest', 'connected_normalization_digest', 'connected_capture_digest', 'connected_terminal_task_digest', 'public_task_inventory_digest', 'binding', 'grader_input_inventory_digest', 'evaluator_bundle_digest', 'scoring_input_freeze_digest', 'calculation_digests', 'producer_execution_id', 'producer_context_export_digest']);
  need(journal.kind === 'ask_core_controller_scoring_journal_v1' && ['native_controller_record', 'synthetic_controller_fixture'].includes(journal.evidence_class));
  need(HEAD.test(input.expectedHead ?? '') && journal.git_head === input.expectedHead);
  need(same(journal.source_digests, input.expectedSources) && Object.keys(input.expectedSources).length > 0);
  for (const value of Object.values(journal.source_digests)) need(SHA.test(value));
  for (const key of ['product_digest', 'request_digest', 'connection_source_digest', 'connected_normalization_digest', 'connected_capture_digest', 'connected_terminal_task_digest', 'public_task_inventory_digest', 'grader_input_inventory_digest', 'evaluator_bundle_digest', 'scoring_input_freeze_digest', 'producer_context_export_digest']) need(SHA.test(journal[key] ?? ''));
  need(journal.product_digest === journal.source_digests['products/ask-core-bundle/manifest.json'] && ID.test(journal.producer_execution_id ?? ''));
  const b = journal.binding;
  closed(b, ['condition', 'fixture_id', 'fixture_input_digest', 'normalized_result_id', 'normalized_result_digest', 'terminal_workspace_tree_digest', 'terminal_workspace_authority_digest', 'terminal_workspace_authority_bytes', 'outcome', 'run_instance_id', 'case_id', 'attempt']);
  need(CONDITIONS.includes(b.condition) && ['completed', 'failed', 'unavailable', 'interrupted', 'invalid'].includes(b.outcome));
  for (const key of ['fixture_id', 'normalized_result_id', 'run_instance_id', 'case_id']) need(ID.test(b[key] ?? ''));
  for (const key of ['fixture_input_digest', 'normalized_result_digest', 'terminal_workspace_tree_digest', 'terminal_workspace_authority_digest']) need(SHA.test(b[key] ?? ''));
  need(Number.isSafeInteger(b.terminal_workspace_authority_bytes) && b.terminal_workspace_authority_bytes > 0 && /^[0-9]{4}$/u.test(b.attempt ?? '') && b.attempt !== '0000');
  closed(journal.calculation_digests, ['normalized', 'result', 'evaluationReady', 'scoringInputs']);
  closed(journal.calculation_digests.scoringInputs, ['freezeManifest', 'freezeManifestSourceDigest', 'catalog', 'policyManifest', 'scoringPolicy', 'admissionRecord', 'requirementRecord', 'outputContract', 'evaluatorReference']);
  for (const value of [journal.calculation_digests.normalized, journal.calculation_digests.result, journal.calculation_digests.evaluationReady, ...Object.values(journal.calculation_digests.scoringInputs)]) need(SHA.test(value ?? ''));
  closed(archive, ['kind', 'journal_digest', 'git_head', 'producer_execution_id', 'producer_context_export_digest', 'reviewer_execution_id', 'reviewer_context_export_digest', 'reviewer_type', 'decision', 'author_self_approval', 'blocking_findings']);
  need(archive.kind === 'ask_core_controller_scoring_review_v1' && archive.journal_digest === input.journalDigest && archive.git_head === journal.git_head);
  need(archive.producer_execution_id === journal.producer_execution_id && archive.producer_context_export_digest === journal.producer_context_export_digest);
  need(ID.test(archive.reviewer_execution_id ?? '') && archive.reviewer_execution_id !== journal.producer_execution_id);
  need(SHA.test(archive.reviewer_context_export_digest ?? '') && archive.reviewer_context_export_digest !== journal.producer_context_export_digest);
  need(['independent_agent', 'independent_human', 'independent_panel'].includes(archive.reviewer_type) && archive.decision === 'approved' && archive.author_self_approval === false && archive.blocking_findings === 0);
  closed(owner, ['kind', 'decision', 'assurance', 'cryptographic_provider_signature_present', 'purpose', 'evidence_class', 'journal_digest', 'review_archive_digest', 'producer_context_export_digest', 'reviewer_context_export_digest']);
  need(owner.kind === 'ask_core_controller_owner_attestation_v1' && owner.decision === 'accept_attribution' && owner.assurance === ASSURANCE && owner.cryptographic_provider_signature_present === false && owner.purpose === 'scoring_only_no_execution_permission');
  need(owner.evidence_class === journal.evidence_class && owner.journal_digest === input.journalDigest && owner.review_archive_digest === input.reviewArchiveDigest && owner.producer_context_export_digest === journal.producer_context_export_digest && owner.reviewer_context_export_digest === archive.reviewer_context_export_digest);
  return freeze({ kind: 'ask_core_controller_scoring_proof_v1', realm: journal.evidence_class === 'native_controller_record' ? 'native' : 'synthetic', assurance: ASSURANCE,
    journal, archive, owner, journal_digest: input.journalDigest, review_archive_digest: input.reviewArchiveDigest, owner_attestation_digest: input.ownerAttestationDigest });
}

export function acceptCoreControllerAttribution(input) {
  const proof = inspectCoreControllerAttribution(input);
  const token = Object.freeze({});
  contexts.set(token, proof);
  return { status: proof.realm === 'native' ? 'owner_attested_attribution_pending_capture_verification' : 'synthetic_controller_fixture_not_native', token,
    assurance: ASSURANCE, cryptographic_provider_signature_present: false, execution_permission: false, live_ready: false, model_calls: 0, grader_process_starts: 0 };
}

/** Serialized evidence never becomes an opaque active context. */
export function requireCoreControllerAttribution(token) {
  const proof = contexts.get(token);
  if (!proof) throw new Error('opaque_controller_attribution_context_required');
  return proof;
}

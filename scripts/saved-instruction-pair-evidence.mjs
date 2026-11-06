// Shared descriptive projection after the owning saved-result verifier runs.
// This pure projection grants no evaluation trust and runs no grader/model.
import assert from 'node:assert/strict';
import { canonicalDigest } from './content-addressed-store.mjs';
import { computeEvolutionArtifactInventoryDigest } from './evolution-loop.mjs';
import { assertPersonalEvolutionFields } from './ask-personal-evolution-observation.mjs';
export function buildSavedInstructionPairEvidence(ctx, report, evaluationAuthority) {
  assertPersonalEvolutionFields(evaluationAuthority, ['authority_id', 'authority_revision', 'authority_evidence_digest'], 'pair evaluation authority');
  assert.ok(![ctx.candidate.generation.actor.actor_id, ctx.candidate.authorities.experiment.authority_id,
    ctx.candidate.authorities.decision.authority_id].includes(evaluationAuthority.authority_id), 'independent evaluation authority required');
  const kinds = { quality: 'directional_outcome_report', safety: 'directional_outcome_report', cost: 'directional_outcome_report',
    variance: 'repetition_report', mechanism: 'mechanism_scorecard', external_outcome: 'external_outcome_report' };
  const dimensions = Object.fromEntries(Object.entries(kinds).map(([name, source_kind]) => {
    const challengers = report.observations.filter(item => item.role === 'challenger');
    const unsafe = challengers.some(item => item.engineering.safety_blocker.status === 'fail');
    const contradicted = challengers.some(item => item.engineering.blockers.gate_status === 'fail');
    const safetyClosed = challengers.length === ctx.blocks.challenger.length && challengers.every(item => item.engineering.safety_blocker.status === 'pass');
    const costsClosed = report.status === 'saved_pair_verified' && report.observations.every(item =>
      ['input_tokens', 'output_tokens', 'duration_ms', 'human_effort', 'monetary_cost'].every(key =>
        ['known', 'not_applicable'].includes(item.engineering.overhead_telemetry[key].status)));
    const complete = name === 'quality' ? contradicted || report.status === 'saved_pair_verified'
      : name === 'safety' ? unsafe || safetyClosed : name === 'cost' ? costsClosed : false;
    const marker = { kind: 'personal_pair_dimension', pair_digest: ctx.registration.pair_digest, report_digest: canonicalDigest(report),
      dimension: name, collected: complete, reason: complete ? 'saved_public_engineering_observation' : report.status };
    const partial = ['quality', 'safety', 'cost'].includes(name) && report.observations.length > 0;
    const status = complete ? 'complete' : partial ? 'insufficient_evidence' : 'unavailable';
    const conclusion = complete ? name === 'safety' && unsafe ? 'unsafe'
      : name === 'quality' && contradicted ? 'contradicted' : 'observed' : partial ? 'unknown' : 'unavailable';
    return [name, { status, conclusion, source_kind, artifact_id: `pair-${name}-${ctx.registration.pair_digest.slice(7, 23)}`,
      artifact_digest: canonicalDigest(marker), causal_credit_applied: false, factor_ids: [] }];
  }));
  return { authority: { ...evaluationAuthority, kind: 'external_evolution_evaluation_authority', experiment_digest: ctx.experiment.experiment_digest,
    verification_mode: 'full_verifier', artifact_inventory_digest: computeEvolutionArtifactInventoryDigest(dimensions) },
    dimensions, causal_attribution: { status: 'not_claimed', factor_ids: [], evidence_digests: [] },
    reason_codes: ['separate_fresh_parent_candidate_pair', 'P_K_F_context_not_candidate_improvement', 'no_causal_credit', report.status,
      `evidence_kind_${ctx.registration.description.evidence_kind}`].sort() };
}

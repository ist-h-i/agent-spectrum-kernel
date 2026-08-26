# Governed Evolution Loop Contract

This document defines the local Issue #278 boundary. It composes the exact
verification, Asset Registry, Portfolio Manager, and evaluation/report
authorities. Contract text and valid JSON do not prove that a candidate was
executed, effective, approved, or activated.

The six closed Schemas are authoritative for serialized names and enums:

- `schemas/evolution-candidate.schema.json`
- `schemas/evolution-experiment.schema.json`
- `schemas/evolution-recommendation.schema.json`
- `schemas/evolution-action-proposal.schema.json`
- `schemas/evolution-human-decision.schema.json`
- `schemas/evolution-application-receipt.schema.json`

## Normative non-equivalences

```text
candidate registered
!= candidate admitted
!= candidate selected
!= candidate executed
!= candidate effective

verified evaluation evidence
!= evaluation recommendation
!= Portfolio action proposal
!= human decision
!= Asset or Portfolio lifecycle authority

stored target manifest
!= active Portfolio head

retained history or rollback anchor
!= rollback authority

application receipt
!= lifecycle authority
```

All persisted Evolution objects reuse the canonical JSON content-addressed store
from Issue #274. Their object paths, canonical bytes, digest algorithm, stable
reads, size limits, containment checks, and no-replace publication remain owned
there. Evolution adds semantic closedness and cross-object reconstruction; it
does not add storage authority.

## Candidate

An Evolution candidate binds one exact #276 parent Asset and one exact #276
candidate revision with the same stable ID and Asset type but different version,
record digest, and content digest. It also binds the exact Registry snapshot and
parent #277 Portfolio/lock in which the lineage decision is grounded.

The record freezes:

- bounded delta kind, text, and digest;
- generation source, actor, and evidence identity;
- intended mechanism and applicability hypothesis;
- changed and frozen factor IDs/digests;
- fixture/task-class scope and exclusions;
- assurance lane, expected upside, risks, retirement condition, rollback
  condition/target, and prohibited effects; and
- separate experiment and human-decision authority identities.

`one_factor` requires exactly one changed factor. A changed factor cannot also be
frozen. Candidate generation never grants Registry admission or Portfolio
activation.

## Experiment seal

The experiment is always `phase: pre_result` and `results_accessed: false`. It
binds the candidate semantic/object digest and two exact #277 selection records:
the parent Asset in the baseline and the candidate Asset in the challenger.
Baseline and challenger roles, locks, manifests, Registry snapshots, selection
objects, and selection digests are not interchangeable.

The protocol freezes source revision/tree, model, CLI, adapter, fixtures,
task classes, exclusions, repetitions, evaluator Asset, evaluator contract,
scoring policy, thresholds, weights, stop conditions, and privacy boundary. The
experiment carries canonical digests of the complete candidate factor set and
evaluation scope. Verification reconstructs both digests, the changed factor
IDs, and every fixture, task class, and exclusion from the candidate rather than
trusting the repeated fields independently. The experiment authority must be an
exact separately trusted copy of the candidate-reserved authority; a different
ID, revision, or authority-evidence digest is rejected. The exact
candidate-to-#197 condition projection is also sealed. A `fixed_b1_exact`
projection is limited to byte-proven `kernel_only` baseline and `adaptive_ask`
challenger material; labels alone are insufficient.

The recommendation decision table and recommendation-to-action mapping are
policy inputs and are sealed before result access. Result, score, verdict,
reward, observed outcome, evaluator outcome, or post-result material is not an
experiment input.

## Evaluation evidence and recommendation

Evolution accepts a separately trusted `external_evolution_evaluation_authority`
with `verification_mode: full_verifier`. Bare schema validation is not a full
verifier. The authority binds the exact sealed experiment digest and exact #197
artifact inventory; evidence trusted for another experiment cannot be
transplanted. Its authority identity must also differ from the candidate
generator and the candidate-reserved experiment and human-decision authorities.
Data-level identity separation is enforced locally; organizational
authentication remains caller-owned. It exposes six typed dimensions:

| Dimension | Accepted `source_kind` | Boundary |
|---|---|---|
| quality | `result_set`, `paired_comparison_report`, `directional_outcome_report`, `portfolio_aggregate_result` | routing/mechanism counts are not quality |
| safety | `result_set`, `paired_comparison_report`, `directional_outcome_report`, `portfolio_aggregate_result` | a quality win cannot offset regression |
| cost | `result_set`, `paired_comparison_report`, `directional_outcome_report`, `portfolio_aggregate_result` | no cross-unit scalar or missing-as-zero |
| variance | `repetition_report`, `portfolio_aggregate_result` | no tiny-delta meaningfulness inference |
| mechanism | `mechanism_scorecard` | no numeric quality or causal credit |
| external outcome | `external_outcome_report` | internal proxy does not prove realized value; exact #178 authority is still required for a complete claim |

Each dimension preserves `complete`, `insufficient_evidence`, `unknown`,
`unavailable`, or `not_applicable` independently. Incomplete states carry
`unknown`, `unavailable`, or `not_applicable` conclusions as appropriate. They
cannot be serialized as retained, zero, or neutral.

The MVP has no separate trusted #178 input. Therefore an external-outcome
dimension remains typed incomplete even when an `external_outcome_report`
artifact identity is present; `complete` external-outcome evidence is rejected
until an exact external-outcome authority contract is supplied.

Exactly one frozen recommendation rule may match. More than one match is an
ambiguous policy error. No match produces the sealed
`insufficient_evidence` fallback. The output vocabulary is `expand`, `retain`,
`simplify`, `stop`, or `insufficient_evidence`. If all six dimensions are
incomplete, the only valid recommendation is `insufficient_evidence`.

For one-factor experiments, causal credit requires exact factor-bound quality
evidence whose quality status is `complete`. Incomplete quality evidence cannot
receive causal credit even when its factor and artifact digests match.
Multi-factor candidates require exact ablation/factorial evidence;
the causal evidence set must equal the quality artifact plus every frozen
ablation digest. `unsupported` or `not_claimed` attribution carries no factor
IDs, evidence digests, or dimension credit. Mechanism observation alone never
grants causal credit.

## Action proposal and human decision

An action proposal preserves the recommendation that produced it and applies
the experiment's frozen action mapping. The mapping must resolve to exactly one
of:

- `adopt_candidate`
- `retain_current`
- `revise_candidate`
- `reject_candidate`
- `retire_current`
- `insufficient_evidence`

The proposal binds exact Registry/Portfolio base heads, outgoing current
manifest, target manifest, complete transition batch, rollback anchor, and
typed reason codes. Rejection and retirement preserve the candidate and all
evidence; nothing is deleted.

The sealed mapping for the `insufficient_evidence` recommendation is fixed to
the `insufficient_evidence` action alone. Missing evidence cannot be converted
to implicit retention, rejection, or activation.

`retain_current`, `revise_candidate`, and `insufficient_evidence` are exact-head
no-op plans: target equals current and neither lifecycle plane has a transition.
`reject_candidate` records one exact candidate-to-retired Asset transition and
no Portfolio transition. `retire_current` records a complete replacement
Portfolio batch followed by one exact current-to-retired Asset transition.
Those Asset-mutating plans still require their separate #276/#277 authorities;
the MVP apply helper executes only the bounded canary Portfolio action.

A human decision binds one exact proposal/action and records `approved`,
`declined`, or `request_revision`. The supplied authority must match the
candidate's required decision authority in kind, ID, revision, and
authority-evidence digest. A higher revision is not a substitute for the exact
reserved authority. The decision is independently trusted, but remains evidence
rather than a #276/#277 authority context.

The generic Prompt mapping is fixed:

```text
adopt_prompt_v2       -> adopt_candidate
retain_current        -> retain_current
revise_and_repeat     -> revise_candidate
insufficient_evidence -> insufficient_evidence
```

Until exact Prompt v2 bytes and an exact #197 projection exist, the loop returns
`prompt_v2_materialization_unavailable` or
`prompt_v2_projection_unavailable`; it never relabels the existing sample.

## Portfolio mutation

The MVP apply operation is limited to an approved `adopt_candidate` proposal in
`portfolio_canary_only` scope. It requires all of the following:

1. full candidate/experiment/recommendation/proposal/decision reconstruction;
2. separately trusted exact experiment, evaluation, and human-decision
   authorities;
3. an exact #277 `external_portfolio_activation_authority` context over the
   approved predecessor and transition batch;
4. that context's `authority_evidence_digest` equals the human-decision CAS
   object digest;
5. the Portfolio authority identity equals the decision authority identity;
6. any high-impact grant remains separately trusted and independently owned;
7. the candidate lineage, base Registry head, current parent Portfolio, and
   proposal base heads are identical;
8. the base current manifest contains the exact parent Asset once;
9. the target manifest contains the exact candidate once as a candidate-state
   canary challenger and contains no silently ignored Asset transition;
10. the resulting current manifest equals the proposal target; and
11. the outgoing manifest remains historical/superseded with its exact
    Asset-set digest as rollback anchor.

Recommendation, proposal, decision, or receipt bytes cannot substitute for the
Portfolio context. The operation calls the existing #277 transition API and
verifies the resulting lock.

Active-Asset adoption may require a separately approved #276 transition before
the final successor Portfolio can be materialized. In that case, obtain a
second exact Portfolio decision; do not predict future digests. `retire_current`
switches/rolls back the Portfolio before terminal Asset retirement.

## Receipts, resume, and rollback

The immutable receipt binds all Evolution semantic digests, predecessor receipt,
base/result Registry and Portfolio heads, ordered completed/blocked steps,
authority-context digests, rollback anchor, stop code, and next step. A completed
receipt re-verifies its result heads and reconstructs the exact action, base
heads, transition step, authority-context, target, and rollback history from the
approved proposal and resulting Portfolio lock. Completed no-op receipts keep
identical heads and contain no lifecycle steps. Resume requires the predecessor
result heads to equal the successor base heads.

CAS publication may leave unreferenced objects after interruption, but they do
not become Registry or Portfolio commit markers. Exact retries are idempotent.
A stored target manifest does not become current. A stale predecessor or a
different valid branch is not silently treated as the organizational head.

Rollback uses the existing separately trusted #276/#277 rollback contexts. No
Evolution object derives rollback authority from recommendation, human approval,
or retained history.

## Canary and product evidence

A bounded canary may validate local mechanics and a narrow candidate decision.
Every such recommendation is scoped `portfolio_canary_only`. It is non-product
and non-generalizable. It cannot weaken or replace Issue #198 and cannot support
external development-value claims without #178 evidence.

## Typed stops

Expected inability to proceed is represented explicitly, including:

- `evaluation_projection_unavailable`
- `prompt_v2_materialization_unavailable`
- `prompt_v2_projection_unavailable`
- `insufficient_evidence`
- `ambiguous_recommendation_action_mapping`
- `asset_transition_authority_required`
- `portfolio_activation_authority_required`
- `high_impact_approval_required`
- `rollback_authority_required`
- `stale_head`

Structural/schema/CAS/digest/history/authority corruption is an error, not a
typed successful stop.

## Non-goals

The local contract does not authenticate an organization, choose a mutable
current head, execute benchmarks, score raw outputs, mutate evaluators, add a
generic optimizer, activate high-impact Assets automatically, implement Prompt
v2, replace Product Evidence Run #198, or create a hosted service.

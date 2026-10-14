# ADR-0013: Prospective task evidence partial readout

- Date: 2026-10-14
- Status: Proposed
- Scope: `task_evidence_partial_v1` / `1.0.0` readout only
- Contract: [task evidence profile](../task-evidence-partial-profile-contract.md)
- Related: ADR-0001, [ADR-0012](0012-scoped-runtime-observation-transport.md)

## Context

The frozen admission policy selects unauthorized-attempt observability for
high-impact, operation-boundary or any non-none risk. The current carrier
authenticates a bounded command interface while retaining Unknown full-task
operation coverage, approval and loaded source. Artifact correctness, terminal
scope and verification answer different propositions from absence of attempts
during all execution. Requiring one universal observation before preserving any
artifact judgment loses useful evidence for the individual improvement loop.

## Decision

Add a closed opt-in task-specific selector proposal and synthetic readout
contract, intended for a new prospective plan, plus a thin saved-public-source
reader over the existing non-executing result-set verifier. Keep supplied artifact judgments and runtime uncertainty
in separate channels. Retain required local evidence and all existing stops.
Never fill missing points, recalculate totals or issue admission. Preserve the
old selector, tags, scorer, assets, results and digests byte for byte.

## Alternatives and consequences

Changing the old policy would reinterpret frozen work. Adding a parallel scorer
or observer would duplicate authority and expand the scope. The existing private
result verifier can reexecute a worker, so the production connector stays stopped
pending a non-executing, module-owned handoff from the existing protected phase.
The new profile must be bound into a pre-result plan; proposal identity alone
cannot prove prospective use. Synthetic projection gives a reviewable narrow
slice and remains ineligible for scoring/adoption/old aggregates.

The usable saved-source entry preserves the existing approved source-manifest,
complete normalized inventory and raw result-set authority. It displays retained
capability judgments separately from runtime Unknown and never presents a
historical source as a new-profile evaluation. It adds no result-authority store,
private verifier, observer, worker or scorer. Source reading and prospective
receipt consumption remain distinct stages.

The caller's freeze chronology and future local-evidence consumer remain owning
lifecycle obligations. Any automatic admission, authentic vendor/approval trace
consumer, execution-plan integration or numeric aggregation needs separate
review and a new applicable version. This ADR supersedes no earlier decision.

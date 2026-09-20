# ADR-0008: Select Compact Proof or Formal Verification Contract with a monotonic verification policy

- Status: Proposed
- Date: 2026-08-26
- Scope: Issue #231 Compact Proof and Formal Verification Contract selection
- Related contract: `docs/verification-proof-policy-contract.md`
- Composes with: ADR-0001, ADR-0006, ADR-0007
- Supersedes: None

## Context

ASK historically requests a Formal Verification Contract for behavior work.
That preserves proof obligations but adds unnecessary ceremony to a localized,
reversible change with one observable behavior and one focused check. A prose
choice in each Skill or adapter would reduce visible text, but it could not
deterministically reject protected work, conflicting upstream proof, or a
formal-to-compact downgrade.

Three existing uses of the word compact have different authority. The generic
lifecycle `compact` artifact combines localized lifecycle boundaries, the trace
exemption applies only when no completion claim exists, and the Codex compact
profile reduces fixed prompt projection. None is a verification proof-path
selector.

The decision crosses lifecycle, Skill, adapter, output-validation, and claim
trace boundaries. It must preserve existing Formal Verification Contract bytes
and the independent evidence and runtime authority decisions recorded in
ADR-0001, ADR-0006, and ADR-0007.

## Decision

Adopt `ask.verification-proof-policy@1.0.0` as the single adapter-neutral
selection policy. Its canonical Schema owns the exact two path values, closed
compact-eligibility facts, closed formal triggers, selection record shape, and
structural transition constraints. Human documentation explains those
semantics but does not copy a competing closed vocabulary.

When verification applies, selection chooses exactly one Compact Proof or
Formal Verification Contract path before an implementation completion claim.
Compact requires complete evidenced eligibility and no formal trigger. Missing
or ambiguous eligibility fails closed to formal. Merge, release, and every
formal-trigger claim require the formal path.

Compact Proof is a distinct verification artifact and may support only its
selected localized completion. An observed compact result binds the exact check
and command, exact exit/result text, and resolving execution-evidence refs.
Schema validity alone cannot establish execution.

Selection history is monotonic. It permits `compact_proof ->
formal_verification_contract`; formal is absorbing. Upgrade preserves prior
executed evidence refs without treating them as satisfaction of new formal
obligations. Resume or failed checks do not authorize a formal-to-compact reset.

Existing Formal Verification Contract artifacts remain readable and are
referenced without migration. Implementation output references the selected
proof and evidence instead of copying unchanged proof fields. The policy
resolves evidence through current observations or the Issue #274 evidence
boundary and creates no store or mutable path registry.

## Alternatives considered

### Always require a Formal Verification Contract

Rejected. It preserves proof strength but does not provide the bounded-overhead
path required for eligible localized completion.

### Let prose, a diff, or each adapter choose

Rejected. Independent selectors can drift and cannot deterministically reject
unknown facts, protected triggers, contradictory selections, or downgrade.

### Reuse lifecycle compact, trace exemption, or Codex compact profile

Rejected. They have different ownership. In particular, the trace exemption
requires no completion claim, while Compact Proof exists to support one bounded
localized completion.

### Add another execution-evidence store or proof-path registry

Rejected. It would duplicate Issue #274 evidence authority and add mutable state
that selection does not require.

### Rewrite formal artifacts into a new union

Rejected. A selection can reference the existing artifact without lossy
migration or changed historical bytes.

### Delegate per-task path selection to Portfolio management

Rejected. Issue #277 selects exact Assets before results exist; it does not own
the current task's verification sufficiency or completion claim.

## Consequences

- Skills and adapters project one policy revision rather than independently
  hard-coding path semantics.
- Compact output is smaller, but exact result binding and ordinary verification
  remain mandatory.
- A later formal trigger increases proof obligations and cannot be erased by
  rerouting, resume, or adapter change.
- Merge and release traceability remain formal; compact never becomes a release
  shortcut.
- Evidence authenticity and reuse remain governed by ADR-0001 and Issue #274.
- Claim truth status, Execution Envelope authority, Asset/Portfolio state,
  approval, release state, and benchmark results remain independent.
- Static byte gates prove only deterministic size. Prompt activation, token,
  latency, quality, and effectiveness remain unverified until their separate
  evaluation boundaries run.

## Verification and review trigger

Fixtures must cover both positive paths, incomplete compact eligibility,
protected claim rejection, exact result/evidence mismatch, compact-to-formal
upgrade with retained refs, formal downgrade rejection, and legacy formal
compatibility. Adapter conformance must reject unexpected proof-path
overactivation instead of filtering it out.

Revisit this ADR when a path is added or removed, eligibility or trigger meaning
changes, evidence-resolution authority moves, a new claim class seeks compact
authority, or lifecycle trace semantics can no longer preserve the monotonic
history. Such a change requires a new policy revision and an explicit ADR
update or superseding ADR.

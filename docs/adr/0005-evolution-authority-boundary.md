# ADR-0005: Separate Evolution evidence, proposal, decision, and lifecycle authority

- Status: Proposed
- Date: 2026-08-25
- Scope: Issue #278 local governed Evolution loop
- Related contract: `docs/evolution-loop-contract.md`
- Composes with: ADR-0001, ADR-0003, ADR-0004
- Supersedes: None

## Context

The repository has independent boundaries for exact verification evidence,
Asset identity/lifecycle, Portfolio activation/selection/rollback, and
evaluation/scoring/reporting. It does not yet have a governed path that binds a
candidate revision and pre-result comparison to a typed recommendation, an
approval-ready Portfolio proposal, a human decision, and a reconstructable
mutation receipt.

Combining these states would create unsafe implications. A stored candidate is
not admitted. A verified result is not a Portfolio decision. A recommendation
is not approval. A human decision is not, by itself, a valid #276 or #277
transition. Retained history is not rollback authority. The shared CAS proves
immutable byte identity but cannot authenticate an organization or choose a
mutable current head.

The current #197 comparison reports also use a frozen four-condition and
three-view benchmark model. Arbitrary Asset pairs cannot be relabeled as those
conditions without an exact projection. Calculating a separate pairwise result
inside Evolution would create the second scoring/report stack prohibited by
Issue #278.

Finally, the #276 Registry and #277 Portfolio are separate immutable planes.
The existing CAS has atomic publication for one object, not a transaction that
can atomically update both planes. An active Asset transition may change the
Registry snapshot needed to materialize the exact successor Portfolio, so one
approval cannot honestly name every future digest unless a pure preview API
exists.

## Decision

### Use six immutable Evolution objects in the shared CAS

Evolution adds candidate, experiment, recommendation, action-proposal, human
decision, and application-receipt objects. Each has a closed Schema, semantic
digest, and shared-CAS object digest. There is no Evolution database, mutable
latest/current pointer, second canonicalizer, or second digest system.

The candidate binds exact parent/candidate Asset and parent Portfolio identity,
bounded delta, generation actor, mechanism hypothesis, changed/frozen factors,
evaluation scope, risks, rollback/retirement conditions, prohibited effects,
and separate experiment and decision authorities.

The experiment is an immutable `pre_result` seal. It binds exact baseline and
challenger selections and freezes the model, CLI, adapter, repository/tree,
fixtures, task classes, exclusions, repetitions, evaluator, scoring policy,
thresholds, weights, stop conditions, privacy boundary, recommendation rules,
and action mapping before result access. It also binds canonical digests of the
candidate's complete factor set and evaluation scope. Verification reconstructs
those values and requires the candidate-reserved experiment authority as an
exact separate trust root. Result-derived fields are outside this object.

### Treat #197 full-verifier output as the evaluation authority

Evolution does not calculate raw scores, comparisons, thresholds, variance, or
mechanism credit. It accepts a separately trusted evaluation authority that
binds full-verifier #197 artifact identities. It projects those already-typed
claims into six independent dimensions: quality, safety, cost, variance,
mechanism, and external outcome. Each dimension accepts only its closed source
vocabulary, and the evaluation authority identity must differ from candidate
generation, experiment, and human-decision identities.

Unknown, unavailable, not-applicable, and insufficient evidence remain typed.
They are never zero, neutral, retained, rejected, or offset by another
dimension. Safety cannot be offset by quality. Mechanism or routing telemetry
cannot become quality or causal credit. External outcome remains unknown until
an exact external-outcome authority such as #178 is available. All-incomplete
evidence can produce only `insufficient_evidence`. Unsupported or unclaimed
causal attribution carries no factors, evidence digests, or causal credit;
supported attribution requires `complete` quality evidence and exactly binds the
changed factors, quality artifact, and all frozen ablation evidence. Matching
factor/digest identity does not upgrade incomplete quality evidence into causal
credit. Because the MVP does not accept a separate #178 trust root, it rejects
`complete` external-outcome evidence rather than trusting an artifact label
alone.

Arbitrary candidate comparison requires an exact #197-owned projection or
parameterized comparison authority. When it is absent, Evolution records
`evaluation_projection_unavailable`; it does not alias the candidate to a B1
condition or add local comparison arithmetic.

### Separate recommendation, proposal, and authority

The recommendation is derived from a decision table frozen in the experiment.
It uses `expand`, `retain`, `simplify`, `stop`, or
`insufficient_evidence` and explicitly carries `authority_implied: false`.

The action proposal separately maps that recommendation to one of
`adopt_candidate`, `retain_current`, `revise_candidate`, `reject_candidate`,
`retire_current`, or `insufficient_evidence`. A missing or multi-valued mapping
fails closed. The proposal binds exact base heads, target manifest, complete
transition batch, rollback anchor, and rejection/retirement reasons, but it is
also non-authoritative. `insufficient_evidence` maps only to the same-named
no-op action, so missing evidence cannot become implicit retention or rejection.

A human decision binds one exact proposal. It is supplied as a separate trust
root and must exactly match the proposal's reserved kind, ID, revision, and
authority-evidence digest; a newer revision is not accepted as equivalent. Its
CAS object digest may be used as `authority_evidence_digest` in the existing
#276/#277 authority context, but the existing authority kind, exact predecessor,
transition batch, and caller-supplied trust requirement remain unchanged.
High-impact approval remains another independently trusted authority whose
identity differs from ordinary lifecycle authority.

### Use receipts for coordination, not authority

An Evolution receipt predecessor-links exact completed or stopped stages. It
binds the candidate, experiment, recommendation, proposal, decision, base and
result heads, authority-context digests, ordered steps, rollback anchor, stop
reason, and next resumable step. Resume re-verifies the referenced #276/#277
commit marker before continuing. A stale, forked, or transplanted head is not
silently adopted.

The receipt is coordination evidence only. It cannot authorize activation,
rollback, admission, retirement, scoring, or execution.

### Prove a bounded canary mutation first

The MVP proves one human-approved shadow/canary Portfolio update in which the
exact successor manifest already exists and preserves the outgoing current
manifest as rollback target. Only a separately trusted #277 activation context
whose authority evidence is the exact human-decision object digest may apply
the transition.

For active-Asset adoption, use two exact decisions when necessary: apply and
verify the #276 Asset transition first, materialize the successor Portfolio
against that exact Registry snapshot, then obtain exact #277 approval. Do not
invent a cross-plane transaction. For `retire_current`, switch or roll back the
Portfolio first and retire the Asset afterward; terminal retirement is never
the first compensating action.

## Consequences

- Candidate generation, experiment sealing, evaluation, recommendation, human
  judgment, Portfolio activation, high-impact approval, and rollback remain
  independently auditable.
- The same frozen inputs and trusted evidence produce byte-identical Evolution
  artifacts and proposals.
- Small canary evidence can prove mechanics and bounded local decisions but
  cannot replace Product Evidence Run #198 or support unmeasured external-value
  claims.
- Cross-plane partial failures are explicit and resumable, but not atomic.
- Callers must supply exact current trust roots and choose organizational heads;
  CAS object existence does not establish currentness.
- Generic arbitrary-Asset comparison remains blocked until #197 supplies an
  exact projection or parameterized authority.

## Alternatives rejected

### Let recommendation mutate the Portfolio

Rejected because evidence interpretation and lifecycle authority are different
claims. It would permit evaluator output to change active configuration without
an exact human and #277 decision.

### Add Evolution scoring or pairwise arithmetic

Rejected because it would duplicate #197, obscure policy ownership, and allow
unreviewed thresholds or missing-value conversions.

### Alias arbitrary Assets to fixed B1 condition names

Rejected because a condition label does not prove exact materialization,
fixture, evaluator, or Portfolio identity.

### Use one broad authority for authoring, evaluation, approval, and activation

Rejected because it collapses the independence needed to prevent a candidate
producer from grading and activating its own revision.

### Treat a receipt or retained rollback target as rollback authority

Rejected because both prove identity/history only. Reverse lifecycle action
still requires the existing separately trusted rollback authority.

### Promise one atomic Registry/Portfolio transaction

Rejected because the current CAS and APIs do not provide one. Claiming atomicity
would hide observable partial states and make resume/rollback unverifiable.

## Deferred work

This ADR does not implement Prompt v2 Issues #227-#235, a generic #197 Asset
projection, #178 external outcomes, Product Evidence Run #198, hosted execution,
organizational authority authentication, mutable current-head coordination, or
autonomous optimization. Those systems must preserve this separation.

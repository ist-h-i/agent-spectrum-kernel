# ADR-0004: Separate Portfolio storage, activation, selection, and rollback authority

- Status: Proposed
- Date: 2026-08-25
- Scope: Issue #277 local Portfolio Manager
- Related contract: `docs/portfolio-manager-contract.md`
- Composes with: ADR-0003
- Supersedes: None

## Context

ADR-0003 separates an Asset's immutable identity and Registry lifecycle from
Portfolio activation. A Registry snapshot may establish that an exact Asset
revision is current within an Asset lifecycle scope, but it deliberately does
not select that Asset for a baseline, challenger, experiment, or runtime. Issue
#277 needs the next authority boundary without weakening that separation.

The shared canonical JSON CAS proves exact object-byte identity. It cannot prove
that a stored Portfolio manifest is current, that a current manifest is
applicable to a particular adapter or task, that an exact verification record is
fresh for the manifest, or that a human or organization approved high-impact
activation. A mutable `latest` pointer would hide those decisions and make
predecessor history and rollback targets depend on changeable state.

Selection must also be fixed before execution results exist. Allowing scores,
recommendations, evaluator outcomes, hidden-test material, or post-execution
telemetry into the selection context would let outcome information influence the
claimed pre-result choice. It would make later comparisons non-reconstructable
and could leak evaluation authority into lifecycle control.

Finally, ordinary activation and rollback have different effects. Activation
makes a new exact manifest current. Rollback revives an exact historical or
superseded manifest and Asset set. Merely retaining old bytes or naming a
rollback target cannot authorize that reverse transition, especially when the
current Portfolio is high impact.

## Decision

### Reuse the shared canonical JSON CAS

Portfolio manifests, locks, authority contexts, selector contexts, and selection
records use the same bounded canonical JSON CAS as verification evidence and the
Asset Registry. The Portfolio Manager adds closed semantic Schemas over those
bytes, but it does not create a second store, digest algorithm, canonicalizer,
database, or mutable latest/current pointer.

CAS identity remains content integrity only. Storage does not grant lifecycle,
selection, execution, evaluation, or organizational authority.

### Make the manifest immutable configuration and the lock the commit marker

A Portfolio manifest binds one exact configuration revision: the exact Registry
snapshot and Asset references, roles and assurance lanes, applicability,
exposure and prohibited tasks, budgets, evidence requirements, approval
constraints, failure actions, conflicts, and rollback intent.

The manifest is stored configuration, not active state. A full immutable
Portfolio lock is the sole lifecycle commit marker. Each non-empty successor
binds its exact predecessor, complete manifest inventory and lifecycle states,
sole current manifest, current Asset-set digest, complete transition batch, and
exact authority-context digest. Verification reconstructs the whole chain; it
does not trust a partial delta or mutable pointer.

Exactly one manifest is current in a non-empty valid lock. Historical,
superseded, and retired manifests remain reconstructable and are not default
selection candidates. An empty initial lock has no current manifest and needs no
authority; every non-empty successor requires exact authority.

### Keep activation and rollback authority separate

The caller supplies Portfolio authority contexts as current trust roots. The
local validator checks their closed shape, digest, Portfolio/repository/scope and
predecessor binding, complete atomic transition, authority kind, immutable
authority evidence, and reconstructed successor. It does not authenticate an
external organization or infer authority from object existence or metadata.

Normal activation authority can activate a new exact manifest, atomically move
the former current manifest out of current, and retire eligible entries. It
cannot reactivate a historical or superseded manifest. That operation requires
a distinct exact rollback authority binding the prior manifest and its exact
Asset-set identity. Retired is terminal. Rollback preserves the full immutable
history and never substitutes a latest or similar Asset revision.

Asset Registry lifecycle authority, verification-evidence producers,
evaluators, repository authors, Asset owners, results, scores, and
recommendations are not Portfolio activation or rollback authorities.

### Require exact approval for high-impact activation

An active high-impact assurance lane requires a separately trusted exact
activation approval. It binds the exact manifest and Asset set, repository and
scope, bounded risk/task applicability, authority identity and revision, and
immutable approval evidence. It is additional to ordinary activation and must
satisfy the manifest's closed independent-review constraint. Approval is not
inherited from a related Asset, another version, the same owner, a broad
repository approval, or a prior Registry transition.

Unknown operational metadata is not evidence of low impact. Missing exposure
bounds, prohibited-task enforcement, capability state, safety constraints, or
exact approval stops high-impact activation. A downgrade cannot erase an
approval requirement.

### Resolve only from closed pre-result inputs

The selection boundary accepts closed structured facts available before
execution: exact lock/repository/source identity, task and applicability
dimensions, actual adapter capabilities, bounded operation scopes,
known-or-unknown budgets, and exact current-state/invalidation identities.

It recursively rejects result, score, correctness, recommendation,
completion-claim, measured-outcome, oracle, hidden-test/answer, evaluator
outcome, and post-execution telemetry concepts, including nested or renamed
equivalents. Timestamps are not part of selection identity. Filesystem wrappers
must reject result-like artifacts before constructing the selector input.

Resolution records a deterministic typed pre-result decision; it does not record
an evaluation result or promotion recommendation.

### Preserve exact material freshness and explicit uncertainty

Evidence reuse is eligible only when the exact Portfolio selection basis,
repository, source, tree, consumed inputs, gate, command, adapter, toolchain,
environment, producer, obligations, and invalidation identities meet the
manifest requirement. Missing, mismatched, non-passing, conflicting, or
invalidated evidence takes an explicit typed failure path.

Freshness means exact material identity, not wall-clock age or file modification
time. Unknown cost, duration, token, applicability, capability, or risk values
remain unknown. They are not interpreted as zero, unrestricted, within budget,
or low impact.

### Make failure disposition typed and deterministic

Expected eligibility failure resolves through the manifest's closed
`bypass`, `downgrade`, or `stop` rule; successful bounded resolution is
`selected`. Precedence is `stop > downgrade > bypass > selected`, and equal
severity reasons and Asset references use locale-independent code-unit order.

Bypass is explicit, with no selected Assets and non-empty typed reasons.
Downgrade records the retained and omitted Asset set, affected capabilities,
budget disposition, and typed reasons, and cannot increase operational support
or evidence assurance. Stop carries closed Portfolio reason codes. Any later
execution-envelope mapping remains a consumer responsibility and cannot be
established by parsing exception text. Structural, Schema, CAS, tamper, history,
or authority corruption prevents selection.

There is no implicit Full ASK fallback. Kernel-only is available only through an
explicit zero-Asset current manifest or a verified manifest's explicit typed
fallback rule.

### Keep execution, evaluation, and benchmark results outside this decision

The Portfolio Manager selects exact references and publishes an immutable
pre-result record. It does not install or execute Assets, run evaluators, score
results, generate candidates, recommend promotion, or update a Portfolio from
observed outcomes.

Checked Portfolio samples may cite existing benchmark condition IDs and frozen
configuration digests. They must not rewrite benchmark configurations,
fixtures, pre-result selections, normalized results, evaluator outputs, scores,
reports, or frozen result digests. Candidate-only Adaptive samples remain
shadow/challenger representations with a typed downgrade or bypass when active
requirements are not met.

## Consequences

- Every active Portfolio state is reconstructable from immutable CAS objects,
  an exact predecessor chain, and caller-supplied authority evidence.
- Storing or registering an object remains safe from accidental activation.
- Registry currentness, Portfolio currentness, pre-result selection, runtime
  execution, and observed effectiveness remain independently auditable facts.
- Normal activation and rollback require separate explicit decisions, so
  rollback cannot be inferred from retained history.
- High-impact activation fails closed when approval or operational metadata is
  absent instead of inheriting broad authority.
- Deterministic ordering and closed typed outcomes make the same verified inputs
  produce byte-identical selection content.
- Callers must retain and supply exact authority contexts, Registry snapshots,
  evidence, capabilities, and budgets; the local manager cannot manufacture
  those facts.
- Full immutable locks duplicate inventory across revisions, trading storage
  efficiency for bounded verification and exact rollback reconstruction.
- Material-identity freshness does not answer whether evidence is recent in
  wall-clock time. A separate exact currentness authority would be needed for
  that claim.

## Alternatives rejected

### Let a stored manifest self-activate

Rejected because CAS storage proves bytes, not approval, lifecycle state,
applicability, or currentness.

### Use a mutable latest/current pointer or delta-only log

Rejected because it would make resolution and rollback depend on mutable state
and would not close full predecessor history in one verified lock snapshot.

### Reuse Asset Registry, evaluator, producer, or repository authority

Rejected because those authorities establish different claims. Treating them
as Portfolio authority would let registration or evaluation mutate runtime
defaults without an explicit activation decision.

### Use normal activation authority for rollback

Rejected because rollback revives an exact prior manifest and Asset set. It is a
distinct reverse transition that requires exact target and authority evidence.

### Include results or recommendations in the selector

Rejected because it violates the pre-result comparison boundary and permits
outcome-derived information to influence the claimed selection.

### Treat unknown as unrestricted or within budget

Rejected because missing applicability, capability, cost, duration, token, or
risk facts do not establish eligibility.

### Fall back silently to Full ASK

Rejected because an invalid or inapplicable Portfolio must not become an
unreviewed active configuration. Kernel-only and all fallback behavior must be
explicit and typed.

### Create a Portfolio database or second CAS

Rejected because the existing shared CAS already provides the required exact
identity and immutable publication boundary. A second identity system would
make Registry, evidence, and Portfolio references diverge.

## Deferred work

This decision does not define candidate generation, autonomous promotion,
Issue #278 comparison/evaluation/recommendation, runtime installation or
execution, private evaluator operation, new adapters or stack overlays, hosted
distribution, remote coordination, mutable indexing, deployment, or
organization-backed authority authentication. It also does not define one
scalar score that erases safety, cost, variance, applicability, or task-class
differences.

Those later systems must consume exact immutable Portfolio identities and
preserve this authority separation. They must not reinterpret stored as current,
selected as executed, or a result as activation authority.

ADR-0004 composes with ADR-0003's Asset identity and lifecycle boundary. It does
not supersede or weaken ADR-0003, ADR-0002, or ADR-0001.

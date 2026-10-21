# ADR-0014: Separate durable physical Prompt projection from adoption authority

- Status: Proposed
- Date: 2026-10-21
- Upstream: ADR0004, ADR0005, ADR0011; SPEC-PERSONAL-TARGET-1@1/@2/@3; PV1-1/6
- Supersedes: None

## Context

The artificial installer proves five-file mechanics with a process-local handle
and deliberately refuses normal Git targets. PV1-1/6 also requires an explicit
actual-target application/restoration capability. Extending the artificial handle
or treating a completed no-op as adoption would cross its existing trust boundary.

## Decision

Add a separate normal-target adapter. Reuse Evolution receipt and Portfolio
selection verifiers, shared rendered-byte projection, setup target/source binding
and installer lifecycle state/rollback. Serialize a data-only, target-bound plan;
require fresh caller-trusted closure and explicit exact-plan authorization on
every mutation. Persist the installed role/lock, parent snapshot and pending state.
Restoration remains a separately trusted rollback selection, not an adoption undo
inferred from retained bytes. Source, scoring and organizational authority are not
created by this adapter.

Own one dedicated state and the closed five Prompt paths. Refuse known competing
owners by default. The explicit current-full Codex extension verifies complete
normal ownership through the existing installer planner, transfers exactly five
records into a paired lease, and shares a target lock with ordinary Codex entry
points. It preserves all other files/runtime metadata and retains conservative
doctor checks. Exact owner return requires current independently trusted parent
selection and the original owner-state pin. Immutable non-owning history prevents
old-plan replay. Paired-owner write interruption preserves both raw states and
stops; this decision does not authorize automatic repair of that different journal.
The PV1-7 @3 extension documents a separately reviewed, incident-authorized
manual parent/original-owner recovery procedure and synthetic failure drill.
It requires independent pre-operation pins, current rollback authority, raw
incident evidence, shared locking, exact endpoint/mode checks and normal-owner
post-verification. No new production repair API or target authorization follows.

## Alternatives and consequences

Reusing the artificial WeakMap loses restart restoration and weakens its target
restriction. A new generic install/lifecycle manager duplicates existing owners.
Silently overwriting an installed Codex projection creates competing state and
false health claims. These alternatives are rejected.

The selected adapter adds one durable physical state boundary; it does not merge
CAS adoption and filesystem application into a transaction. Pending markers and
partial outputs are preserved. Neither native runtime efficacy nor hostile
filesystem/power-loss guarantees follow from process-level fixture success.

## Review trigger

The2026-10-21 continuation explicitly selects review of partial recovery and
Codex ownership handover under SPEC-PERSONAL-TARGET-1@2. Recovery uses a private
original-plan-bound journal and the existing immutable CAS publisher; fresh
external rollback authority is still required. Codex ownership is never silently
overlapped. Existing compact controls and conservative doctor/installer behavior
must remain intact; actual historical AH14/C1 inputs are not new approvals.

Revisit before supporting other assets or ownership shapes, automatic paired-owner repair or manual endpoints outside @3,
cross-version schema migration, automatic adoption, generic retry, remote targets
or a different rollback authority. Number0014 was checked free at integration
base5f3d574b; reconcile again if another architecture decision lands first.

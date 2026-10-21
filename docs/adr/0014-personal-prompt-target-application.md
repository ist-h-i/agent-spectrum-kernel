# ADR-0014: Separate durable physical Prompt projection from adoption authority

- Status: Proposed
- Date: 2026-10-21
- Upstream: ADR0004, ADR0005, ADR0011; SPEC-PERSONAL-TARGET-1@1; PV1-1/6
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
owners instead of changing Codex/kernel ownership or doctor semantics. The initial
normal-target implementation supports no-conflict standalone/kernel-only targets;
handover of an existing Codex-owned Prompt surface requires a later reviewed
ownership integration and is not silently included.

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

Revisit before supporting other assets, existing-adapter ownership handover,
cross-version schema migration, automatic adoption, generic retry, remote targets
or a different rollback authority. Number0014 was checked free at integration
base5f3d574b; reconcile again if another architecture decision lands first.

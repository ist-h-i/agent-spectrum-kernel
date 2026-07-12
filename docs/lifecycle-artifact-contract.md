# Lifecycle Artifact Contract

This document is the authoritative responsibility boundary for Requirement, Spec, Work Package, Verification, and Implementation artifacts. Skills and adapters reference this contract; they do not define competing lifecycle fields.

## Core rule: reference plus delta

Every artifact has an `artifact_id`, an `artifact_type`, and zero or more `upstream_refs`. A downstream artifact:

- references the upstream artifact ID and, when useful, a section or field;
- records only fields owned by its stage;
- inherits unchanged upstream values without copying them;
- records a changed upstream assumption, acceptance condition, scope boundary, or proof obligation as an explicit `delta`;
- never converts an unresolved human-owned business decision into a technical assumption;
- omits irrelevant conditional fields instead of writing `not needed`, `none`, or equivalent placeholders.

When a completion, merge, or release claim needs item-level evidence mapping, this contract delegates reference encoding and claim sufficiency to `docs/lifecycle-traceability-contract.md`. `artifact_id` remains the stable logical artifact identity, and `upstream_refs` remains the one canonical dependency field. Trace-enabled artifacts add a separate positive `revision`; their `upstream_refs` entries use structured artifact/item refs with mandatory `observed_revision`. They must not mix those refs with unversioned strings. Stable decision, behavior, acceptance, task, obligation, change, and evidence item IDs do not move field ownership or require a full chain for trivial work.

A bounded inline summary is allowed only when the upstream artifact cannot travel with the downstream artifact. The summary must name its source reference and must not become a second source of truth.

```text
Artifact header:
- Artifact ID:
- Artifact type: requirement | spec | work_package | verification | implementation | compact
- Upstream refs: artifact ID plus optional section/field
- Deltas: target ref, field, previous value, new value, reason, and decision evidence

Conditional trace-enabled header, governed by docs/lifecycle-traceability-contract.md:
- Revision: separate positive integer
- Upstream refs: structured artifact_id / optional item_id / mandatory observed_revision
```

Unversioned `upstream_refs` remain valid only outside a trace-enabled chain. Claim mappings use the structured refs defined by the traceability contract; they do not introduce a second artifact identity or dependency graph. A trace-enabled delta still changes the effective field owned here and records the target artifact ID plus the observed target revision.

For a delta to a Requirement-owned field, `decision evidence` must identify human confirmation or another authoritative business source. If that evidence is absent, stop for a human decision. Contradictory upstream artifacts are not resolved by choosing one silently; record the conflict and stop.

### Effective values and superseding precedence

Resolve a downstream artifact in this order:

1. Resolve each referenced artifact's effective field map, including all of its inherited values and applied deltas.
2. Merge equal effective values from `upstream_refs`; reference order never selects a winner.
3. Treat different effective values for the same field as a conflict.
4. Resolve a conflict only with a delta whose `supersedes_refs` names every conflicting upstream reference. Its `target_ref` and `from` identify the effective value being changed; its `to` becomes the downstream effective value.
5. Apply remaining deltas in listed order, then overlay fields owned by the current artifact. A current owned field that changes an inherited value must equal the corresponding delta `to`.

Because a delta updates the effective field map, later artifacts may form an explicit `A -> B -> C` chain by targeting the immediately preceding artifact. A delta's `from` is checked against the target artifact's effective value, not only its locally owned fields.

## Responsibility table

| Artifact | Owns | Must not recreate |
|---|---|---|
| Requirement Contract | Business reason and decision: actor, object, outcome, responsibility and policy boundaries, success/failure conditions | Technical behavior, task plan, test commands, implementation choices |
| Spec | Observable behavior delta: inputs, outputs, state changes, errors/edges, compatibility, acceptance criteria | Business narrative, executable task packaging, test execution results |
| Work Package | Executable change boundary: allowed/forbidden scope, ordered tasks, dependencies, stop conditions, expected evidence | Requirement rationale, behavior prose, proof results, implementation history |
| Verification Contract | Proof obligations: behavior/regression checks, negative/manual/runtime/measurement evidence, insufficient-evidence and claim gates | Implementation scope, code decisions, executed evidence as if it were the contract |
| Implementation Contract | Implementation-only decisions and record: actual boundary, deviations, discoveries, attempts, evidence references, limitations, handoff | Unchanged Requirement, Spec, Work Package, or Verification content |
| Compact artifact | A localized decision, behavior, scope, proof, and implementation boundary under one artifact identity | Anonymous or non-referenceable shorthand; expanded lifecycle prose |

## Requirement Contract

Required fields:

```text
- Artifact ID
- Why the change is needed
- Business actor
- Business object
- Desired outcome
- Responsibility boundary
- Policy boundary
- Success condition
- Failure condition
```

Conditional fields, included only when present:

```text
- Unresolved human decisions
- Domain-rule constraints and source IDs
- Non-goals that protect the business boundary
- Evidence status for disputed or indirect inputs
```

An unresolved human decision remains unresolved. Its absence from a later artifact is not approval.

## Spec

Required fields:

```text
- Artifact ID
- Upstream refs, when an upstream artifact exists
- Observable behavior delta from the current system
- Acceptance criteria
```

Conditional fields:

```text
- Inputs and outputs
- State changes
- Error cases and edge cases
- Compatibility constraints
- Security, privacy, or performance behavior that callers can observe
- Explicit deltas to upstream assumptions or acceptance conditions
```

The Spec may use a bounded Requirement summary only to disambiguate behavior. It does not restate why the business wants the change.

## Work Package

Required fields:

```text
- Artifact ID
- Upstream refs
- Allowed scope
- Forbidden scope
- Ordered implementation tasks
- Dependencies
- Stop conditions
- Expected implementation and verification evidence
```

Conditional fields:

```text
- Likely files/modules with evidence status
- Required review or risk gates
- Applicable domain, engineering, verification, or architecture memory IDs
- Explicit deltas to upstream scope or acceptance conditions
```

The Work Package is executable only when required business and design decisions are resolved. It packages work; it does not make those decisions.

## Verification Contract

Required fields:

```text
- Artifact ID
- Upstream refs to the behavior, acceptance criteria, or change boundary being proved
- Behavior proof obligations
- Focused checks and required evidence
- Insufficient-evidence conditions
- Evidence required before a completion claim
```

Conditional fields:

```text
- Regression obligations and broader checks
- Negative cases
- Manual or runtime checks
- Benchmark, security, or other measurement methods
- Evidence required before merge or release claims
- Existing coverage and reusable verification-pattern IDs
- Explicit deltas to upstream proof obligations
```

The same Verification Contract is used before and after implementation. Executed commands and observations are appended as evidence records that reference it; execution does not replace or redefine the contract.

## Implementation Contract

At entry, create only the header, upstream references, and implementation decisions that are not already fixed upstream. During and after implementation, append the implementation record.

Required completion fields:

```text
- Artifact ID
- Upstream refs
- Actual files/components and change boundary
- Verification attempted
- Evidence references
- Handoff state
```

Conditional fields:

```text
- Change class
- Implementation decisions not fixed upstream
- Deviations from the Work Package, Spec, or Verification Contract
- Newly discovered assumptions, risks, or blockers
- Remaining limitations
- Explicit deltas; approved when they alter an upstream contract
```

Do not copy goal, non-goals, expected behavior, acceptance criteria, allowed/forbidden scope, or proof obligations when upstream references already provide them.

## Missing and compact paths

Missing upstream artifacts do not force synthetic reconstruction. Produce the smallest artifact required by the current task and set `upstream_refs` only for artifacts that exist.

For trivial or localized work, one compact artifact may carry multiple boundaries if it keeps them distinguishable. It remains a referenceable artifact and follows the same identity and delta rules:

```text
Compact artifact:
- Artifact ID:
- Artifact type: compact
- Upstream refs:
- Boundaries:
  - Decision: requested outcome or source reference
  - Behavior delta:
  - Allowed scope:
  - Forbidden scope:
  - Proof obligation:
  - Evidence:
  - Implementation decisions: optional
- Deltas: [] or explicit delta records
```

Later Verification or Implementation artifacts may reference the compact artifact ID. Do not create empty lifecycle artifacts merely to complete the chain.

## Conflict and stop rules

Stop and report the conflicting references when:

- two upstream artifacts specify incompatible values without an explicit superseding delta;
- a Requirement-owned field changes without authoritative decision evidence;
- acceptance criteria, scope, or proof obligations change without a delta;
- the Work Package depends on an unresolved business or design decision;
- required completion evidence cannot satisfy the Verification Contract.

## Canonical chain

```text
Requirement Contract (business decision)
  -> Spec (observable behavior delta)
  -> Work Package (executable change boundary)
  -> Verification Contract (proof obligations; reusable before/after implementation)
  -> Implementation Contract (implementation-only decisions, record, and evidence refs)
```

Design artifacts may sit between Requirement and Work Package or Spec and Work Package. They follow the same reference-plus-delta rule.

Review and Release Readiness do not redefine these lifecycle fields. They consume stable refs under `docs/lifecycle-traceability-contract.md` to map merge or release claims to the exact current acceptance, evidence, blocker, accepted-risk, approval, and rollback items that matter.

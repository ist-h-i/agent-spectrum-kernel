# ADR-0002: Bind Work Package Plans to external current authority

- Status: Accepted
- Date: 2026-08-24
- Scope: Issue #275 Slice 1 epic admission and Work Package Plan validation
- Related contract: `docs/epic-admission-work-package-plan-contract.md`

## Context

A canonical digest proves that plan bytes are unchanged, but a re-sealed plan can still claim an obsolete revision, omit a current acceptance condition or blocker, or transplant a package from another plan or repository. A self-contained `current: true` flag has the same authority as the artifact it is meant to check and cannot establish currentness.

The existing lifecycle contract also permits free-form Work Package dependencies. Reinterpreting that field as package IDs would change existing semantics and make deterministic DAG validation ambiguous. Existing verification evidence has a separate producer and reuse authority that must not become plan approval.

Slice 1 needs portable, deterministic validation without introducing a hosted workflow service, mutable admission database, or second SDLC engine.

## Decision

### External current authority

Work Package Plan validation receives a separately sealed, caller-supplied validation context. The context binds the exact repository/base/branch, current policy and admission decision, current plan revision/state/content digest, current upstream artifact revisions and acceptance IDs, exact required gate definitions, blockers, human decisions, and approvals. Approval status, authority reference, and immutable approval-evidence reference/digest are context-owned; a plan may only mirror the exact record.

The plan references the exact context ID/revision/digest, but cannot declare itself current. To avoid a digest cycle, the context binds a plan content digest that omits only the plan digest and the context-digest value; the full plan digest still binds the final context. The validator also requires exact immediately previous plan/context artifacts for revision lineage. It fails closed when content, gate, or predecessor bindings differ.

The supplied context is the local validator's explicit trust root. Context integrity and cross-artifact bindings are verified, but authenticating the external GitHub/current-authority source remains a caller and repository-review responsibility.

### Separate plan DAG

Each plan package uses `depends_on_package_ids` for plan-local DAG edges and a separate `dependencies` field for existing lifecycle Work Package prerequisites. Existing lifecycle `Dependencies` semantics remain unchanged. A deterministic projection preserves each plan entry's positive revision and structured upstream refs with observed revisions while mapping Work Package-owned fields into the canonical lifecycle shape. Lifecycle fixtures and repository validation check that surface; the plan is a control-plane aggregate, not a lifecycle stage.

### Closed initial topology

The first contract supports one branch, stacked packages, explicit integration order, one reconstructable pull-request publication unit, and one planned independent exact-head review unit. Multi-branch and general workflow semantics are deferred rather than guessed.

### Authority separation

Admission can require a plan or a human decision; it cannot approve implementation, review, merge, or evidence reuse. An override requires a policy-owned approved grant bound to the exact subject, observed signals, computed decision, requested decision, and immutable grant evidence; recognizable authority identity alone is insufficient. The canonical policy carries no standing approved grant, and the positive fixture constructs only a test-local exact-basis grant. Planned verification and review units are obligations only. Actual verification evidence remains under ADR-0001 and the verification-evidence contract.

## Alternatives considered

### Self-declared current plan state

Rejected. A modified artifact can update its own flag and digest without proving correspondence to current upstream authority.

### Digest-only transplant protection

Rejected. Re-sealing makes a transplanted object internally consistent. Nested plan/repository bindings and caller-supplied current context are needed to detect the semantic transplant.

### Reuse lifecycle `Dependencies` as DAG edges

Rejected. Existing artifacts use that field for free-form external dependencies, so reinterpretation would break compatibility.

### Store plan approval in verification evidence

Rejected. Verification producer authority and reusable gate coverage do not grant planning, override, review, or merge authority.

### Hosted coordinator or mutable plan registry

Deferred. It would add credentials, availability, deployment, and remote-state concerns outside the local-first Slice 1.

## Consequences

- Stale, hidden, and transplant cases can be rejected after valid re-sealing.
- Re-sealing changed meaning under an unchanged revision, or weakening a named gate while retaining its ID, is rejected.
- Callers must supply the current validation context; a plan alone cannot prove executability.
- Revised plans require preserved predecessor bytes; historical r1 and r2 remain audit evidence and current execution uses explicit r3.
- Upstream acceptance items need stable IDs and revisions when complete ownership is claimed.
- Existing Work Package, Execution Envelope, verification-evidence, and CAS authority boundaries remain intact.
- The initial publication model is intentionally narrow; a broader topology needs a later explicit contract decision.

## Deferred decisions

- bounded repository snapshot, checkpoint, resume, and restart package;
- runtime rollover policy and telemetry;
- multi-branch or multi-publication topology;
- hosted coordination or mutable current-plan registries;
- matched efficiency and product-value measurement.

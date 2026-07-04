---
name: refactor-implementation
description: Implement scoped, behavior-preserving refactors with explicit boundaries, regression proof, and evidence.
---

# Refactor Implementation

## Goal

Implement an approved structural improvement while preserving observable behavior.

This skill is for safe refactor execution after a candidate exists. It does not discover refactor candidates, does not create backlog entries, and does not use refactoring as a cover for feature work or architecture rewrites.

## Use when

- A refactor candidate has been approved from `review-code-health`, `improvement-ledger`, review comments, or a human request.
- The user asks to remove duplication, split a large function or class, improve naming, simplify control flow, improve testability, or separate responsibilities.
- The intended change should preserve observable behavior.
- A separate PR is needed for structural cleanup.

## Do not use when

- New behavior is being added. Use `spec-driven-development` or `controlled-implementation`.
- Root cause is unknown. Use `doubt-driven-development`.
- The refactor candidate still needs detection or classification. Use `review-code-health`.
- The item needs backlog, ledger, rule, or check triage before implementation. Use `improvement-ledger`.
- Architecture boundaries, dependency direction, ownership, persistence, public API, schema, UI behavior, or external contracts would change without explicit authorization. Use `application-boundary-architecture` first.
- Regression proof is unavailable or cannot produce sufficient evidence for the affected behavior.

## Process

1. Identify the refactor objective.
   - Name the approved candidate, source, files, and reason.
   - Separate the structural improvement from any requested behavior change.
   - If the objective is vague, stop and ask for the smallest concrete refactor target.

2. Define the behavior-preservation contract.
   - Must not change public API, UI behavior, schema, snapshots, runtime behavior, errors, logs, data shape, permissions, notifications, or external I/O unless explicitly authorized.
   - Record any authorized exception before editing.
   - Treat accidental behavior changes as failures, not as acceptable cleanup.

3. Define allowed and forbidden scope.
   - Allowed scope names the exact files, modules, tests, or docs that may change.
   - Forbidden scope names adjacent cleanup, broad renames, unrelated formatting, dependency changes, migrations, generated/vendor files, and public contract changes unless authorized.
   - Keep each refactor PR focused on one structural objective.

4. Decide boundary impact.
   - Use `application-boundary-architecture` first if the change moves responsibilities across layers, changes dependency direction, introduces a new abstraction boundary, or touches public contracts.
   - Proceed only when the boundary decision is `No boundary change` or `Approved boundary movement`.

5. Define regression proof with `test-first-verification`.
   - Identify existing tests or checks that cover the affected behavior.
   - Add or update focused tests only when needed to prove preservation.
   - Include static checks, typecheck, build, or runtime/manual checks proportional to the refactor risk.
   - Do not claim no regression without executed evidence.

6. Implement the smallest safe refactor.
   - Prefer mechanical, local, reversible steps.
   - Preserve names and public surfaces unless the approved objective is a local rename.
   - Avoid new abstractions unless they remove observed duplication, clarify ownership, or match an approved boundary decision.
   - Do not mix unrelated cleanup with the refactor.

7. Compare before and after.
   - Explain what structure changed and what behavior was preserved.
   - Inspect the final diff for hidden behavior changes, formatting churn, unrelated files, and stale comments.

8. Route follow-up.
   - Send newly discovered debt, repeated patterns, or prevention-rule candidates to `improvement-ledger`.
   - Do not implement rule/check conversion inside this skill unless explicitly requested as a separate scoped change.

## Output

```text
Refactor objective:
- ...

Behavior preservation contract:
- Must not change: public API / UI / schema / snapshots / runtime behavior / errors / logs / data shape

Allowed scope:
- ...

Forbidden scope:
- ...

Boundary decision:
- No boundary change | Use application-boundary-architecture first | Approved boundary movement

Verification contract:
- Tests / typecheck / build / runtime checks needed

Implementation summary:
- ...

Before / after:
- What structure improved

Verified:
- ...

Not verified:
- ...

Follow-up:
- improvement-ledger entry | rule update | no follow-up
```

## Exit criteria

- A concrete approved refactor objective is named.
- Behavior-preservation contract is explicit.
- Allowed and forbidden scope are explicit.
- Boundary-impacting changes are routed to `application-boundary-architecture` before implementation.
- Regression proof is executed and recorded before claiming preservation.
- Final diff stays inside the refactor scope.
- Follow-up debt or prevention candidates are routed without mixing responsibilities.

## Failure modes

| Failure | Correction |
|---|---|
| Refactoring without an approved candidate | Route to `review-code-health` or ask for the concrete objective. |
| Hiding behavior change inside cleanup | Stop and treat the behavior change as a new feature or bug fix. |
| Broad architecture rewrite | Route boundary movement to `application-boundary-architecture` and split the work. |
| Scope creep through adjacent cleanup | Keep unrelated cleanup out of the refactor PR. |
| Claiming no regression from inspection alone | Run the agreed verification or report insufficient evidence. |

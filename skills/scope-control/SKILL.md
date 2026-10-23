---
name: scope-control
description: Define and enforce change boundaries before a risky implementation or refactor. Use when scope creep, opportunistic cleanup, adjacent-system changes, or broad diffs are likely.
---

# Scope Control

## Goal

Cover the authorized outcome with sufficient scope, then prevent unrelated side changes from making the diff hard to review or unsafe to merge.

## Use when

- The task touches multiple modules.
- A refactor is proposed.
- The agent wants to clean up adjacent code.
- Nearby defects/TODOs are tempting.
- Public APIs, schemas, migrations, or dependencies might change.

## Do not use when

- The allowed files and behavior are obvious and low-risk.

## Process

1. Derive sufficient scope from current required behavior, preserved invariants, owners, and affected providers/consumers, including runtime or configuration connections when relevant. Include structural cleanup and retirement needed by this change; exclude hypothetical future needs and unrelated improvements. Reuse `application-boundary-architecture` for unresolved boundary decisions.

When a structural choice exists, compare adequate options by ongoing investigation, maintenance, verification, and operation burden before diff size. Then define allowed scope in the existing fields below; no separate decision report is required.

```text
Allowed:
- files/modules:
- behavior:
- tests:
- docs:
```

2. Define forbidden scope.

```text
Forbidden:
- unrelated refactors:
- formatting-only churn:
- dependency changes:
- public API changes:
- migrations:
- adjacent bug fixes:
- generated/vendored files:
```

3. Set a diff budget after the sufficient scope is established. The budget signals review or re-planning; it must not exclude necessary work merely to reduce file or line counts.

```text
Diff budget:
- Expected files:
- Expected kind of changes:
- Maximum acceptable spread before re-planning:
```

4. Define escalation conditions.
   - Required change crosses an explicit forbidden or authorization boundary.
   - Existing tests are broken in unrelated areas.
   - A migration/dependency/API change requires an unresolved decision or authorization.
   - The implementation requires a broader abstraction than planned.

Re-plan inside existing authorization without requesting approval again. Resolve any required decision or authorization before the affected action.

5. During implementation and review, flag both omitted required work and out-of-scope changes. Paths, state, and configuration made obsolete by this change belong in the retirement scope; retention requires a current compatibility or rollout reason and a retirement condition. Investigate unknown usage rather than assuming it is unused.
   - If proceeding to code, hand the scope contract to `controlled-implementation`.
   - If reviewing a diff, use `review-router` -> required gates; scope findings generally route to `review-ai-quality`.

## Output

```text
Scope contract:
- Allowed:
- Forbidden:
- Diff budget:
- Escalation condition:
- Out-of-scope findings to report separately:
```

## Exit criteria

- The agent knows what it may touch.
- The allowed scope covers the required invariants, owners, and affected providers/consumers.
- The agent knows what it must not touch.
- Diff expansion has an explicit stop condition.

## Failure modes

| Failure | Correction |
|---|---|
| “I was already in the file.” | Proximity is not authorization. |
| Cleanup mixed with behavior change | Split into a separate task unless required. |
| Diff budget excludes necessary structural work | Re-plan the sufficient scope within existing authorization; do not leave the outcome incomplete. |
| Passing tests used to justify scope creep | Verification does not authorize unrelated edits. |

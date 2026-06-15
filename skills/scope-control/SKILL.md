---
name: scope-control
description: Define and enforce change boundaries before a risky implementation or refactor. Use when scope creep, opportunistic cleanup, adjacent-system changes, or broad diffs are likely.
---

# Scope Control

## Goal

Prevent useful-looking side changes from making the diff hard to review or unsafe to merge.

## Use when

- The task touches multiple modules.
- A refactor is proposed.
- The agent wants to clean up adjacent code.
- Nearby defects/TODOs are tempting.
- Public APIs, schemas, migrations, or dependencies might change.

## Do not use when

- The allowed files and behavior are obvious and low-risk.

## Process

1. Define allowed scope.

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

3. Set a diff budget.

```text
Diff budget:
- Expected files:
- Expected kind of changes:
- Maximum acceptable spread before re-planning:
```

4. Define escalation conditions.
   - Required change crosses a forbidden boundary.
   - Existing tests are broken in unrelated areas.
   - A migration/dependency/API change becomes necessary.
   - The implementation requires a broader abstraction than planned.

5. During implementation and review, flag out-of-scope changes.

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
- The agent knows what it must not touch.
- Diff expansion has an explicit stop condition.

## Failure modes

| Failure | Correction |
|---|---|
| “I was already in the file.” | Proximity is not authorization. |
| Cleanup mixed with behavior change | Split into a separate task unless required. |
| Passing tests used to justify scope creep | Verification does not authorize unrelated edits. |

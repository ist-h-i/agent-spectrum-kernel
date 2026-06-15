---
name: scope-control
description: Define and enforce change boundaries before a risky implementation or refactor. Use when scope creep, opportunistic cleanup, or adjacent-system changes are likely.
---

# Scope Control

## Goal

Prevent useful-looking side changes from making the diff hard to review or unsafe to merge.

## When to use

Use when:
- The task touches multiple modules.
- A refactor is proposed.
- The agent wants to clean up adjacent code.
- The codebase has many nearby defects or TODOs.
- Public APIs, schemas, or dependencies might change.

## Process

1. Define allowed scope:

```text
Allowed:
- files/modules:
- behavior:
- tests:
- docs:
```

2. Define forbidden scope:

```text
Forbidden:
- unrelated refactors:
- formatting-only churn:
- dependency changes:
- public API changes:
- migrations:
- adjacent bug fixes:
```

3. Set a diff budget.
   - Small task: localized diff.
   - Medium task: limited vertical slice.
   - Large task: explicit plan required.

4. If a needed change violates the boundary:
   - stop,
   - explain why the boundary is insufficient,
   - propose a separate task or ask for approval.

5. During review, flag any out-of-scope changes.

## Output

```text
Scope contract:
- Allowed:
- Forbidden:
- Diff budget:
- Escalation condition:
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “I was already in the file.” | Proximity is not authorization. |
| “This cleanup is obviously good.” | Good cleanup can still make the change unreviewable. |
| “The tests still pass.” | Passing tests do not justify out-of-scope edits. |

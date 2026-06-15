---
name: code-review-quality
description: Review a diff, PR, commit, or generated code for correctness, scope, tests, maintainability, and merge risk. Use before merge or when asked to evaluate code quality.
---

# Code Review & Quality

## Goal

Decide whether the change is safe to merge and identify concrete fixes.

## Review stance

Be specific. Do not produce generic style advice. Every finding needs evidence.

## Severity

- `blocker`: must fix before merge; correctness/security/data loss/build break.
- `major`: likely bug, regression, missing critical test, bad API boundary.
- `minor`: maintainability or edge case issue worth fixing.
- `nit`: optional, low-risk clarity issue.

## Process

1. Read the change in context:
   - diff
   - touched files
   - nearby code
   - tests
   - docs/ADRs if relevant

2. Check:
   - correctness
   - edge cases
   - backward compatibility
   - API/data model impact
   - security/privacy
   - performance
   - test coverage
   - observability/error handling
   - scope creep
   - readability and maintainability

3. Separate findings from suggestions.
   - Findings require evidence and a fix.
   - Suggestions are optional and must not block.

4. Make a merge decision:
   - approve
   - approve with minor comments
   - request changes
   - block
   - insufficient evidence

5. If reviewing AI-generated work, check for:
   - unsupported claims
   - invented APIs
   - stale assumptions
   - unverified behavior
   - overly broad refactors
   - missing negative cases

## Output

```text
Decision:
- ...

Findings:
- [severity] file:line — issue
  Evidence:
  Required fix:

Suggestions:
- ...

Evidence reviewed:
- ...

Residual risk:
- ...
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The diff looks clean.” | Clean diffs can still be wrong. |
| “Tests pass.” | Passing tests are evidence, not proof of coverage. |
| “This is generated code.” | Generated code still needs ownership and review. |

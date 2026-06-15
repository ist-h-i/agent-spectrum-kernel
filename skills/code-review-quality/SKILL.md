---
name: code-review-quality
description: Review a diff, PR, commit, or generated code for correctness, scope, tests, maintainability, and merge risk. Use before merge or when asked to evaluate code quality.
---

# Code Review & Quality

## Goal

Decide whether the change is safe to merge and identify concrete required fixes.

## Use when

- Reviewing a PR, diff, commit, patch, or generated code.
- Deciding whether a change is safe to merge.
- Evaluating implementation quality, test coverage, scope, or risk.

## Do not use when

- The user only asks for a non-evaluative summary.
- No code, diff, or concrete design artifact is available to review.

## Review stance

Be specific. Do not produce generic style advice. Every finding needs evidence.

## Severity

| Severity | Meaning |
|---|---|
| `blocker` | Must fix before merge; correctness/security/data loss/build break. |
| `major` | Likely bug, regression, missing critical test, bad API/data boundary. |
| `minor` | Maintainability, edge case, or local correctness issue worth fixing. |
| `nit` | Optional clarity/style issue; must not block. |

## Process

1. Read the change in context.
   - diff,
   - touched files,
   - nearby code,
   - tests,
   - docs/ADRs if relevant.

2. Check review dimensions.
   - correctness,
   - edge cases,
   - backward compatibility,
   - API/data model impact,
   - security/privacy,
   - performance,
   - test coverage,
   - observability/error handling,
   - scope creep,
   - readability/maintainability.

3. For AI-generated work, additionally check:
   - invented APIs,
   - stale assumptions,
   - unsupported claims,
   - missing negative cases,
   - overly broad refactors,
   - unverified behavior.

4. Separate findings from suggestions.
   - Finding: evidence + required fix.
   - Suggestion: optional improvement.

5. Make a merge decision.

| Decision | Use when |
|---|---|
| approve | No blocking/major issues and evidence is sufficient. |
| approve with comments | Only minor/nit issues remain. |
| request changes | Fixes required but direction is sound. |
| block | Critical correctness/security/data/build risk. |
| insufficient evidence | Cannot decide without more context or verification. |

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

## Exit criteria

- Decision is explicit.
- Each blocking finding has evidence and required fix.
- Suggestions are not mixed with required fixes.
- Residual risk is named.

## Failure modes

| Failure | Correction |
|---|---|
| Generic advice | Tie each finding to code/evidence. |
| Treating passing tests as complete proof | Assess coverage and changed behavior. |
| Reviewing style instead of merge risk | Prioritize correctness, scope, safety, evidence. |

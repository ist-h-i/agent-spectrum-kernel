---
name: review-ai-quality
description: Review a code change for AI-assessable implementation quality: correctness, edge cases, test adequacy, local API/design choices, maintainability, error handling, performance risk, security signals, and scope creep. Use for PR/diff/code reviews after routing, but do not make architecture, domain, risk, ADR, evidence, or final merge decisions.
---

# AI Quality Review

## Goal

Find evidence-backed implementation issues that a code reviewer can identify from the diff and repository context.

This gate may flag performance, security, scope, architecture, ADR, or domain signals, but it must route final judgment to the specialized gate when the issue affects:

- external risk -> `risk-gate`,
- unsupported claim -> `evidence-ledger`,
- structural or boundary impact -> `review-architecture-impact`,
- domain meaning -> `review-domain-impact`,
- durable architecture memory -> `adr-review`,
- scope authorization -> `scope-control`.

## Use when

- Reviewing implementation quality in a PR, diff, commit, patch, or generated code.
- The change may affect correctness, edge cases, local APIs, tests, maintainability, local design, performance, security, or scope.
- `review-router` selects an AI quality review gate.

## Do not use when

- The only question is whether commands passed.
- The issue is primarily architecture impact, boundary mechanics, domain authorization, owner approval, ADR need, or a risky action.
- No concrete code or design artifact is available.

## Review stance

Be specific. A finding needs file/line evidence, impact, and a required fix. Do not produce generic style advice.

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
   - nearby implementation,
   - tests,
   - public contracts,
   - docs/ADRs if needed for technical meaning.

2. Review focus areas.
   - correctness and edge cases,
   - backward compatibility,
   - local API/data-shape impact that is not a public contract or architecture boundary,
   - error handling and observability,
   - security/privacy signals,
   - performance risk,
   - test adequacy,
   - scope creep,
   - readability and maintainability.

3. For AI-generated work, additionally check:
   - invented APIs,
   - stale assumptions,
   - unsupported claims,
   - missing negative cases,
   - broad refactors,
   - unverified behavior.

4. Separate findings from suggestions.

5. Route specialized signals before judging them.
   - external risk -> `risk-gate`,
   - unsupported claim -> `evidence-ledger`,
   - structural or boundary impact -> `review-architecture-impact`,
   - domain meaning -> `review-domain-impact`,
   - durable architecture memory -> `adr-review`,
   - scope authorization -> `scope-control`.

6. Return quality gate status, not final merge approval.

## Output

```text
AI quality gate:
- Gate status: pass | pass with comments | fail | insufficient evidence

Findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Suggestions:
- ...

Evidence reviewed:
- ...

Residual quality risk:
- ...
```

## Exit criteria

- Each blocking or major issue has evidence and required fix.
- Suggestions are not mixed with required fixes.
- Residual risk is named.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Generic advice | Tie each finding to code/evidence. |
| Treating passing tests as complete proof | Assess coverage and changed behavior. |
| Making architecture approval decisions | Route structural and boundary impact to `review-architecture-impact`. |
| Making domain approval decisions | Route domain meaning to `review-domain-impact`. |
| Making specialized risk, claim, ADR, or scope decisions | Flag the signal and route final judgment to the specialized gate. |
| Approving the PR directly | Report gate status only. |

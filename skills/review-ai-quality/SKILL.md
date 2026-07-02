---
name: review-ai-quality
description: Review a code change for AI-assessable implementation quality: design, logic, test adequacy, style/maintainability, and scope. Use for PR/diff/code reviews after routing, but do not make architecture, domain, output quality, adversarial risk, risk, ADR, evidence, or final merge decisions.
---

# AI Quality Review

## Goal

Find evidence-backed implementation issues that a code reviewer can identify from the diff and repository context, and report them by review layer so design, logic, test, style, and scope concerns are not collapsed into one broad judgment.

This gate may flag performance, security, scope, architecture, ADR, output quality, adversarial risk, evidence, or domain signals, but it must route final judgment to the specialized gate when the issue affects:

- external risk -> `risk-gate`,
- unsupported claim -> `evidence-ledger`,
- architecture quality -> `review-architecture-impact`,
- unresolved boundary mechanics -> `application-boundary-architecture`,
- domain meaning -> `review-domain-impact`,
- output quality -> `review-output-quality` when available; otherwise report the signal as pending specialized review and do not finalize it inside this gate,
- adversarial risk -> `review-adversarial-risk` when available; otherwise report the signal as pending specialized review and do not finalize it inside this gate,
- durable architecture memory -> `adr-review`,
- scope authorization -> `scope-control`.

## Use when

- Reviewing implementation quality in a PR, diff, commit, patch, or generated code.
- The change may affect correctness, edge cases, local APIs, tests, maintainability, local design, performance, security, or scope.
- `review-router` selects an AI quality review gate.

## Do not use when

- The only question is whether commands passed.
- The issue is primarily architecture impact, boundary mechanics, output quality, adversarial risk, domain authorization, owner approval, ADR need, or a risky action.
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

2. Review focus areas by layer.
   - Design: local API shape, local responsibility split, data flow, state ownership, error boundaries, and local decisions that are not public contracts or architecture boundaries.
   - Logic: correctness, edge cases, backward compatibility, API use, error handling, observability, concurrency, and local performance/security signals.
   - Test adequacy: changed behavior coverage, regression proof, missing negative cases, and whether evidence matches the claimed behavior.
   - Style / maintainability: naming, readability, duplication, local complexity, and consistency with nearby implementation.
   - Scope: scope creep, broad refactors, unrelated cleanup, and unauthorized behavior expansion.

3. For AI-generated work, additionally check:
   - invented APIs,
   - stale assumptions,
   - unsupported claims,
   - missing negative cases,
   - broad refactors,
   - unverified behavior.

4. Classify every required finding into one of:
   - Design findings,
   - Logic findings,
   - Test adequacy findings,
   - Style / maintainability findings,
   - Scope findings.

5. Separate findings from suggestions.

6. Route specialized signals before judging them.
   - domain meaning -> `review-domain-impact`,
   - architecture quality -> `review-architecture-impact`,
   - unresolved boundary mechanics -> `application-boundary-architecture`,
   - durable architecture memory -> `adr-review`,
   - output quality -> `review-output-quality` when available; otherwise report the signal as pending specialized review and do not finalize it inside this gate,
   - adversarial risk -> `review-adversarial-risk` when available; otherwise report the signal as pending specialized review and do not finalize it inside this gate,
   - external risk -> `risk-gate`,
   - unsupported claim -> `evidence-ledger`,
   - scope authorization -> `scope-control`.

7. Return quality gate status, not final merge approval.

## Output

```text
AI quality gate:
- Gate status: pass | pass with comments | fail | insufficient evidence

Design findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Logic findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Test adequacy findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Style / maintainability findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Scope findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Specialized signals routed:
- Domain:
- Architecture quality:
- Boundary mechanics:
- ADR:
- Output quality: routed | pending specialized review | none
- Adversarial risk: routed | pending specialized review | none
- Risk:
- Evidence:

Suggestions:
- ...

Evidence reviewed:
- ...

Residual quality risk:
- ...
```

## Exit criteria

- Each blocking or major issue has evidence and required fix.
- Design, logic, test adequacy, style/maintainability, and scope findings are separately inspectable.
- Suggestions are not mixed with required fixes.
- Specialized signals are routed and not finalized inside this gate.
- Residual risk is named.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Generic advice | Tie each finding to code/evidence. |
| Treating passing tests as complete proof | Assess coverage and changed behavior. |
| Making architecture approval decisions | Route architecture quality to `review-architecture-impact`, unresolved boundary mechanics to `application-boundary-architecture`, and ADR memory to `adr-review`. |
| Making domain approval decisions | Route domain meaning to `review-domain-impact`. |
| Making output quality or adversarial risk decisions | Route output quality to `review-output-quality` and adversarial risk to `review-adversarial-risk` when available; otherwise mark the signal pending specialized review without finalizing it here. |
| Making specialized risk, claim, ADR, or scope decisions | Flag the signal and route final judgment to the specialized gate. |
| Approving the PR directly | Report gate status only. |

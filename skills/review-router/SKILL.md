---
name: review-router
description: Route a diff, PR, commit, patch, or generated code review to the smallest required review gates. Use before merge reviews to decide which automated, AI quality, domain, ADR, risk, evidence, and final merge gates are required, optional, or skipped.
---

# Review Router

## Goal

Select the smallest set of review gates needed to make the merge decision defensible.

## Use when

- Reviewing a PR, diff, commit, patch, or generated code.
- The review may involve multiple concerns such as tests, logic, maintainability, domain behavior, architecture, risk, or evidence.

## Do not use when

- The user only asks for a non-evaluative summary.
- No code, diff, design artifact, or review target is available.
- A specific narrower review gate has already been requested and no routing decision is needed.

## Process

1. Read enough context to identify review risk.
   - diff or changed files,
   - touched public interfaces,
   - tests and commands,
   - docs/ADRs when terms, state, or architecture may change.

2. Classify changed meaning.
   - Mechanical: formatting, generated output, lockfile-only, or lint-only.
   - Technical behavior: correctness, edge cases, API use, error handling, tests.
   - Maintainability: naming, readability, local design, scope creep.
   - Domain behavior: business rules, state semantics, responsibility, workflow, reporting, generated business text.
   - Architecture/risk: hard-to-reverse boundaries, dependencies, persistence, auth, infra, external effects.

3. Route gates.
   - `review-domain-impact` first if domain behavior may change.
   - `adr-review` if architectural memory or hard-to-reverse boundary decisions may change.
   - `risk-gate` before any destructive, external, auth, secret, production, dependency, or infra action.
   - `review-automated-gate` for mechanical verification evidence.
   - `review-ai-quality` for code-quality review.
   - `evidence-ledger` when claims need evidence classification.
   - `review-final-merge-gate` to make the merge decision.

4. State skipped gates with reasons.

## Output

```text
Review route:
- Required gates:
- Optional gates:
- Skipped gates:
- Gate order:
- Reason:
- Inputs still needed:
```

## Exit criteria

- Required, optional, and skipped gates are explicit.
- Domain impact is checked before technical review when applicable.
- The route does not run every gate by default.
- Final merge decision is delegated to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Treating every PR as needing every gate | Route by observed impact and risk. |
| Approving from router output | Router selects gates; it does not approve. |
| Missing hidden domain change | Check state, permissions, notifications, reports, and generated business text before technical gates. |
| Skipping risk review because code diff is small | Route by possible impact, not diff size. |

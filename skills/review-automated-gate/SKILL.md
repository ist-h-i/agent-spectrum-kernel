---
name: review-automated-gate
description: Review mechanical verification evidence for a diff or PR, including formatter, linter, typecheck, build, tests, static analysis, and CI status. Use when merge readiness depends on command results, but do not make code-quality or merge approval judgments.
---

# Automated Review Gate

## Goal

Record whether mechanical checks passed, failed, were skipped, or are insufficient.

## Use when

- A PR/diff review needs format, lint, typecheck, build, test, static analysis, or CI evidence.
- The user asks whether required commands have been run.
- A final merge gate needs command evidence.

## Do not use when

- The question is about code correctness, design, domain meaning, or merge approval.
- No automated or executable check is relevant.

## Process

1. Identify expected checks from repository docs, package scripts, CI, project overlay, verification pattern ledger entries, or changed-file conventions. Treat `docs/ai/verification-pattern-ledger.md` with `ledger_status: template` as missing reusable verification evidence.

2. Compare expected checks with available evidence.

```text
Check:
Expected:
Observed command/result:
Coverage:
Status: pass | fail | skipped | not run | insufficient
```

3. Flag failures and gaps.
   - A failed required check blocks final approval.
   - A missing check may be acceptable only when the reason and residual risk are explicit.
   - Passing checks prove only the covered property.

4. Do not infer correctness, maintainability, security, or domain validity from passing checks alone.

## Output

```text
Automated gate:
- Required checks:
- Results:
- Missing checks:
- Failed checks:
- Coverage limits:
- Gate status: pass | fail | insufficient
- Next command:
```

## Exit criteria

- Commands and results are exact when available.
- Missing or skipped checks have reasons.
- Coverage limits are explicit.
- No merge decision is made here.

## Failure modes

| Failure | Correction |
|---|---|
| Treating green CI as full review | State what CI covers and what it does not. |
| Inventing command output | Mark the check as not run or unavailable. |
| Ignoring expected local commands | Read repo docs/scripts/CI before judging sufficiency. |
| Approving from mechanical checks | Pass evidence to `review-final-merge-gate`. |

---
name: verification-pattern-ledger
description: Record reusable test and evidence expectations for recurring change types without replacing current task verification.
---

# Verification Pattern Ledger

## Goal

Preserve reusable verification judgment for recurring change types, risk classes, regressions, and project-specific checks while keeping current task evidence mandatory.

This skill helps `test-first-verification` draft better Verification Contracts over time. It never invents command output and never treats a stored pattern as proof that the current task passed.

## Use when

- A recurring change type has a known test, lint, build, runtime, regression, or release-readiness evidence pattern.
- A past regression or flaky area should influence future Verification Contracts.
- `work-package-compiler`, `review-automated-gate`, or `review-final-merge-gate` needs durable verification expectations.
- A verification entry in `docs/ai/verification-pattern-ledger.md` should be added, refreshed, deprecated, or contradicted.

## Do not use when

- The current task has already run sufficient checks and no reusable verification lesson exists.
- The change is trivial text with no meaningful verification pattern.
- The expected evidence is a one-off manual note that belongs in a handoff or current PR.
- The entry would store raw logs, secrets, personal data, or full command output.

## Process

1. Identify the verification pattern.
   - Change type, risk class, required evidence, negative cases, and regression history.
   - Commands that are focused and repeatable for the covered scope.
   - Known flaky areas and evidence limits.

2. Check current sources.
   - Existing tests, CI, README commands, package scripts, validation scripts, release-readiness gates, and prior incidents.
   - `docs/ai/verification-pattern-ledger.md` and related engineering/domain patterns.

3. Classify evidence status.
   - `Verified`: direct evidence from tests, CI, runtime checks, validation scripts, or documented successful usage.
   - `Human-confirmed`: explicit responsible confirmation.
   - `Supported`: indirect or repeated evidence but not fully proven.
   - `Hypothesis`: test idea or suspected regression path only.
   - `Deprecated`: old check retained for context.
   - `Contradicted`: check no longer matches current repo behavior.

4. Decide use in current workflow.
   - Feed matching patterns into `test-first-verification` as candidate Verification Contract items.
   - Feed required evidence into `work-package-compiler` when packaging scope.
   - Feed missing or failed evidence into review gates.
   - Keep current task verification separate from reusable pattern memory.

5. Update the ledger entry with source, status, commands, staleness trigger, and owner.

## Output

```text
Verification pattern ledger update:
- Decision: add | refresh | deprecate | contradict | route elsewhere | insufficient evidence
- Verification ID:
- Change type:
- Risk class:
- Required evidence:
- Recommended focused commands:
- Negative cases:
- Regression history:
- Known flaky areas:
- Evidence source:
- Evidence status:
- Related files / modules:
- Related domain rules:
- Related engineering patterns:
- Staleness trigger:
- Owner:

Current workflow use:
- Verification Contract guidance:
- Review gate impact:
- Release-readiness impact:
- What remains unverified:
```

## Exit criteria

- The entry distinguishes reusable expectation from current task evidence.
- Current task verification remains required.
- Hypothesis entries generate test ideas only.
- Flaky or deprecated checks are marked instead of silently removed.
- Raw logs, secrets, and full command output are not stored.

## Failure modes

| Failure | Correction |
|---|---|
| Treating a stored command as passed evidence | Require current command result or mark not run. |
| Turning every test idea into a required gate | Promote only with evidence or human confirmation. |
| Hiding flaky checks | Mark flakiness and evidence limits explicitly. |
| Storing raw logs | Store summary, source reference, and status only. |

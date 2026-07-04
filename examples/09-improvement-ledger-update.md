# Example: Improvement ledger update

## Request

```text
Use these existing review findings and prepare improvement-ledger entries. Do not rediscover debt.
```

## Workflow

Use:

```text
improvement-ledger -> evidence-ledger when readiness or conversion claims need evidence status
review-code-health only if findings still need detection
```

## Input findings

```text
1. PR #42 found repeated stale count strings in adoption docs. Evidence: review comment links docs/quality-rubric.md and docs/validation-report.md.
2. "The code feels messy." No file, line, impact, or source evidence.
3. PR #42 suggested turning the repeated stale count issue into a validation fixture.
```

## Expected output

```text
Improvement ledger update:
- Ledger target: docs/ai/improvement-ledger.md
- Ledger status: active project ledger
- Source reviewed: PR #42 review findings
- Entries added:
  - IMP-0001
- Entries updated: none
- Entries moved: none
- Current PR blockers kept out of ledger:
  - stale count validation bug remains a current-PR required fix if it affects the active PR
- Follow-up routes:
  - validation script fixture for mechanically detectable stale count strings

Finding ID:
- IMP-0001

Source:
- PR #42 review comment

Finding:
- Stale skill-count references recurred across adoption and validation docs.

Category:
- repeated_finding

Evidence:
- Verified: PR #42 review links `docs/quality-rubric.md` and `docs/validation-report.md`.

Impact:
- Validation can appear trustworthy while adoption docs still describe an old skill baseline.

Severity:
- medium

Urgency:
- soon

Decision:
- convert_to_check

Recommended action:
- Add or keep a validation fixture for stale count phrases.

Prevention target:
- validation script

Owner / status:
- unassigned
- converted_to_check

Refresh rule:
- Review by the next manifest skill-count change or before the next release.

Close condition:
- Validation fixture fails for stale count phrases and passes for the current manifest count.

Not recorded:
- "The code feels messy" was rejected because it has no source, evidence, impact, decision, or close condition.
```

Ledger work starts from existing findings. Detection belongs to `review-code-health`; implementation belongs to the selected implementation or refactor workflow.

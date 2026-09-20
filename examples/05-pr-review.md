# Example: PR review

## Request

```text
Review this PR and tell me whether to merge.
```

## Workflow

Use:

```text
review-router → review-ai-quality baseline → exact-signal additional gates → requested review-final-merge-gate
```

## Expected output

```text
Baseline review:
- Gate: review-ai-quality
- Status: fail
- Evidence: CSV escaping implementation and focused export tests were inspected.

Additional required gates:
- review-output-quality: fail; CSV is a system-consumed output contract; triggered by generated_output_change.
- review-automated-gate: pass with comments; existing comma cases passed but the quote case is absent; triggered by automated_evidence_required.

Missing evidence:
- none

Findings:
- Finding ID: F-CSV-001
  Severity: major
  Merge blocker: true
  Practical impact: CSV values containing quotes are emitted with invalid escaping.
  Trigger or failure trace: generated_output_change → review-output-quality → quote case absent.
  Evidence location: src/export.ts:42 and focused export tests.
  Required post-fix condition: escape embedded quotes and add a passing regression case.

Decision:
- request changes
```

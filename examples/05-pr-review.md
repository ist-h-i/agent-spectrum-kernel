# Example: PR review

## Request

```text
Review this PR and tell me whether to merge.
```

## Workflow

Use:

```text
code-review-quality → evidence-ledger
```

## Expected output

```text
Decision:
- request changes

Findings:
- [major] src/export.ts:42 — CSV escaping does not handle quotes.
  Evidence: Existing tests cover commas but not double quotes; implementation only wraps fields.
  Required fix: Escape double quotes according to CSV rules and add a regression test.

Suggestions:
- ...

Evidence reviewed:
- diff
- nearby tests
- focused test command output

Residual risk:
- Large-file performance was not benchmarked.
```

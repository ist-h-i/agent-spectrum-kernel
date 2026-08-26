# Example: Code health review

## Request

```text
Review this diff for code-health risk. Separate current PR blockers from debt that should become a separate PR or improvement-ledger candidate.
```

## Workflow

Use:

```text
review-router -> review-ai-quality baseline -> review-code-health for exact code-health signals -> improvement-ledger only for separately accepted follow-up
```

## Expected output

```text
Baseline review:
- Gate: review-ai-quality
- Status: fail
- Evidence: changed validation helper, nearby tests, and manifest/report generation were inspected.

Additional required gates:
- review-code-health: fail; triggered by maintainability_risk and testability_risk.

Missing evidence:
- none

Findings:
- Finding ID: F-VALIDATION-001
  Severity: major
  Merge blocker: true
  Practical impact: quality docs can drift while validation reports no stale count.
  Trigger or failure trace: maintainability_risk → review-code-health → the detector misses `current N-skill system`.
  Evidence location: scripts/validate-repo.mjs:120 and its nearby tests.
  Required post-fix condition: recognize the hyphenated form and add a passing regression fixture.
  Category: rule_gap
- Finding ID: F-DOCS-001
  Severity: minor
  Merge blocker: false
  Practical impact: adoption examples remain harder to understand.
  Trigger or failure trace: maintainability_risk → review-code-health → adjacent documentation observation.
  Evidence location: docs/usage-ja.md.
  Required post-fix condition: track separately only if an owner accepts the improvement.
  Category: documentation_debt
```

Do not run `review-code-health` for every PR by default. Use it when the review question or observed evidence makes debt, smell, refactor, maintainability, dependency/tooling, security weakness signals, or repeated findings applicable.

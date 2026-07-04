# Example: Code health review

## Request

```text
Review this diff for code-health risk. Separate current PR blockers from debt that should become a separate PR or improvement-ledger candidate.
```

## Workflow

Use:

```text
review-router -> layer applicability -> review-code-health when applicable -> review-final-merge-gate -> improvement-ledger only for non-blocking follow-up
```

## Expected output

```text
Layer applicability:
- Style / maintainability:
  status: required
  reason: The diff changes shared validation helpers and may introduce maintainability or testability debt.
  gate: review-code-health

Code health review:
- Gate status: pass with findings
- Scope reviewed: changed validation helper, nearby tests, and manifest/report generation code
- Current-PR blockers:
  - [medium] scripts/validate-repo.mjs:120 - stale count detection misses hyphenated "34-skill" references.
- Backlog / separate-PR candidates:
  - [low] docs/usage-ja.md - adoption examples could be clearer, but this does not block the current fix.
- Rule or check feedback:
  - Candidate: add validation fixture for stale skill-count phrases if the pattern is repeated and mechanically detectable.
- Improvement-ledger handoff:
  - IMP candidate only for non-blocking repeated findings with evidence, impact, owner/status, refresh date, and close condition.

Finding:
- Stale count detector only matches "<number> skills".

Category:
- rule_gap

Evidence:
- scripts/validate-repo.mjs uses a count pattern that misses "current 34-skill system" style phrases.

Impact:
- Quality/adoption docs can drift while validation still reports no stale count references.

Severity:
- medium

Urgency:
- now

Recommended action:
- fix now

Scope guidance:
- in current PR

AI-rule feedback:
- Add fixture coverage in validation script tests because this is mechanically detectable.

Specialized signals routed:
- Architecture: skipped; no boundary or public contract movement.
- Adversarial/security: skipped; no abuse path or privacy risk. This is not a full security audit.
- Evidence: required for final correctness claim.
- Risk: skipped; no destructive or external action.
```

Do not run `review-code-health` for every PR by default. Use it when the review question or observed evidence makes debt, smell, refactor, maintainability, dependency/tooling, security weakness signals, or repeated findings applicable.

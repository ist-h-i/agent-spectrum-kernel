# Example: PR review

## Request

```text
Review this PR and tell me whether to merge.
```

## Workflow

Use:

```text
review-router → observed change signals → required gates → review-final-merge-gate
```

## Expected routing output

```text
Change signals:
- generated_output_change: CSV export path and escaping implementation changed.
- verification: focused export tests are available.

Required gates:
- review-output-quality: CSV is a system-consumed output contract; triggered by generated_output_change.
- review-ai-quality: escaping correctness and edge cases need local logic review.
- review-automated-gate: focused regression evidence is required; triggered by verification.

Skipped heavy gates:
- review-domain-impact: no business meaning or workflow responsibility changed.
- review-architecture-impact: no public API, dependency, persistence, or deployment boundary changed.
- review-adversarial-risk: no untrusted input, security/privacy, prompt, or critical workflow signal observed.
- risk-gate: no destructive or external action is being executed.

Missing evidence:
- none
```

## Expected final output

```text
Decision:
- request changes

Blocking evidence:
- [major] src/export.ts:42 — CSV escaping does not handle quotes. Existing tests cover commas but not double quotes; escape quotes and add a regression test.

Passed required gates:
- review-automated-gate — focused tests ran for existing comma cases.

Insufficient evidence:
- none

Non-blocking follow-ups:
- Large-file performance benchmark — separate follow-up; not a merge blocker.

Residual risk:
- Performance was not benchmarked.
```

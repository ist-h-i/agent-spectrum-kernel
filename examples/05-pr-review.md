# Example: PR review

## Request

```text
Review this PR and tell me whether to merge.
```

## Workflow

Use:

```text
review-router → required gates → review-final-merge-gate
```

## Expected output

```text
Review route:
- Required gates: review-automated-gate, review-ai-quality, review-final-merge-gate
- Optional gates: evidence-ledger
- Skipped gates: review-domain-impact, adr-review, risk-gate

Decision:
- request changes

Layer summary:
- Domain: skipped; CSV escaping does not change business meaning.
- Architecture: skipped; no public API, dependency, persistence, or deployment boundary changed.
- Design: pass; change stays inside the existing export path.
- Logic: fail; quote escaping is missing for CSV fields.
- Output quality: fail; generated CSV can be malformed for quoted values.
- Test / verification: insufficient evidence; comma coverage exists, but double-quote regression coverage is missing.
- Style / maintainability: pass; local implementation shape matches nearby code.
- Mechanical: pass; focused tests ran, except large-file benchmark was not run.
- Adversarial risk: skipped; no prompt, generated AI output, security, or privacy surface changed.
- Risk: skipped; no destructive, external, auth, secret, production, dependency, migration, billing, email, or infra impact.
- Evidence: pass; reviewed diff, nearby tests, and focused command output.

Required fixes:
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

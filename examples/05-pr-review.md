# Example: PR review

## Request

```text
Review this PR and tell me whether to merge.
```

## Workflow

Use:

```text
review-router → layer applicability → required gates → review-final-merge-gate
```

## Expected output

```text
Layer applicability:
- Domain:
  status: skipped
  reason: CSV escaping changes export formatting but does not change business meaning.
  gate:
- Architecture:
  status: skipped
  reason: No public API, dependency, persistence, or deployment boundary changed.
  gate:
- Design:
  status: required
  reason: The change must stay inside the existing export path.
  gate: review-ai-quality
- Logic:
  status: required
  reason: CSV escaping correctness and edge cases determine whether the output is valid.
  gate: review-ai-quality
- Output quality:
  status: required
  reason: The generated CSV is consumed outside the system and must remain parseable.
  gate: review-ai-quality
- Test / verification:
  status: required
  reason: The escaping behavior needs regression coverage.
  gate: review-automated-gate
- Style / maintainability:
  status: required
  reason: The local implementation should match nearby export code without scope creep.
  gate: review-ai-quality
- Mechanical:
  status: required
  reason: Focused tests and static checks are needed as merge evidence.
  gate: review-automated-gate
- Adversarial risk:
  status: skipped
  reason: No prompt, generated AI output, security, or privacy surface changed.
  gate:
- Risk:
  status: skipped
  reason: No destructive, external, auth, secret, production, dependency, migration, billing, email, or infra impact.
  gate:
- Evidence:
  status: required
  reason: The final decision makes correctness and readiness claims.
  gate: evidence-ledger

Review route:
- Required gates: review-automated-gate, review-ai-quality, review-final-merge-gate
- Optional gates: evidence-ledger
- Skipped gates: review-architecture-impact, review-domain-impact, adr-review, risk-gate

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

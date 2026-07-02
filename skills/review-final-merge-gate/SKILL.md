---
name: review-final-merge-gate
description: Combine review gate results into the only final merge decision for a PR, diff, commit, patch, or generated code review. Use after review-router and required gates to decide approve, approve with comments, request changes, block, or insufficient evidence.
---

# Final Merge Gate

## Goal

Make the final merge decision from gate evidence without hiding missing checks, unresolved findings, or required approvals.

## Use when

- A review needs a final merge decision.
- Required review gates have produced results or their absence must be judged.

## Do not use when

- Earlier required gates have not been routed yet.
- The user only wants a specific gate result, not a merge decision.
- The action is risky and `risk-gate` has not cleared it.

## Process

1. Collect gate results.
   - `review-router`,
   - `review-automated-gate`,
   - `review-ai-quality`,
   - `review-domain-impact` when applicable,
   - `adr-review` when applicable,
   - `risk-gate` when applicable,
   - `evidence-ledger` when claims need evidence status.

2. Check hard blockers.
   - failed required automated checks,
   - blocker or major unresolved quality findings,
   - unauthorized or implicit domain change,
   - missing required owner approval,
   - required ADR/domain decision missing,
   - risky action not approved,
   - insufficient evidence for changed behavior.

3. Decide.

| Decision | Use when |
|---|---|
| `approve` | Required gates pass and evidence is sufficient. |
| `approve with comments` | Only minor/nit or documented low residual risk remains. |
| `request changes` | Fixes are required but direction is sound. |
| `block` | Critical correctness, security, data, domain, build, or risk issue exists. |
| `insufficient evidence` | The review target cannot be judged without more context, checks, or approvals. |

4. Keep suggestions separate from required fixes.

## Output

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Gate summary:
- Automated:
- AI quality:
- Domain:
- ADR:
- Risk:
- Evidence:

Required fixes:
- ...

Suggestions:
- ...

Evidence reviewed:
- ...

Residual risk:
- ...
```

## Exit criteria

- Final decision is explicit.
- The decision cites gate evidence or missing gate evidence.
- Domain impact and required approvals are accounted for when applicable.
- Suggestions are not treated as merge blockers.

## Failure modes

| Failure | Correction |
|---|---|
| Approving without required gate evidence | Return `insufficient evidence` or request the missing gate. |
| Letting logic review override domain risk | Domain failures block regardless of code correctness. |
| Mixing suggestions with required fixes | Separate optional improvements from merge blockers. |
| Treating unknown as pass | Unknown remains insufficient evidence. |

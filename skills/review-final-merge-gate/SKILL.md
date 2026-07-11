---
name: review-final-merge-gate
description: Combine review gate results into the only final merge decision for a PR, diff, commit, patch, or generated code review.
---

# Final Merge Gate

## Goal

Make the final merge decision from executed gate evidence without replaying the router's full diagnostic contract or hiding missing checks, unresolved blockers, or required approvals.

## Use when

- A review needs a final merge decision.
- Required gates have produced results or their absence must be judged.

## Do not use when

- Earlier required gates have not been routed.
- The user only wants a specific gate result, not a merge decision.
- A risky action is about to be executed and `risk-gate` has not cleared it.

## Process

1. Collect the signal route and gate results from `review-router`, required gates, automated checks, and `evidence-ledger` when claims need classification.
2. Apply precedence.
   - Domain, architecture, output quality, adversarial risk, risk, and evidence issues take precedence over mechanical success.
   - A mechanical pass proves only its own checks.
   - Required gates without gate evidence remain `insufficient evidence`; do not downgrade them to skipped.
   - Missing diff, context, output, or verification inputs remain `insufficient evidence`.
3. Separate current-PR blockers from non-blocking follow-ups.
   - Blockers stay in `Blocking evidence` and `Required fixes` when a detailed fix is needed.
   - Improvement-ledger candidates, rule feedback, suggestions, and accepted risks remain separate.
   - Do not update `docs/ai/improvement-ledger.md` from this gate.
4. Decide.

| Decision | Use when |
|---|---|
| `approve` | Required gates pass or are evidence-backed skipped, and evidence is sufficient. |
| `approve with comments` | Required gates pass and only minor follow-ups or documented low residual risk remain. |
| `request changes` | Fixes or missing gate evidence are reasonably actionable and direction is sound. |
| `block` | Critical correctness, security, domain, build, or risk issue exists. |
| `insufficient evidence` | The target cannot be judged without more context, checks, or approvals. |

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This artifact owns the merge decision and does not repeat envelope fields.

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Blocking evidence:
- [severity] gate/file:line — evidence, impact, and required fix or decision

Passed required gates:
- gate — evidence checked

Insufficient evidence:
- gate/input — what remains unknown and the next check

Non-blocking follow-ups:
- improvement-ledger candidate, rule feedback, or suggestion — scope/owner when known

Residual risk:
- ...
```

Include `Improvement ledger candidates`, `Rule feedback`, or `Deferred / accepted code-health risks` only when applicable. Keep them separate from `Blocking evidence`.

## Exit criteria

- The final decision is explicit.
- Every required gate is represented by a result or explicit insufficient evidence.
- Blocking evidence is separated from passed gates and non-blocking follow-ups.
- Upper-layer and cross-cutting failures are not overridden by lower-layer passes.
- Required but missing gate evidence prevents approval.
- Suggestions do not become merge blockers unless they identify required missing evidence or a failing gate.
- Complete per-layer diagnostics, when needed, remain validation/debug detail rather than normal final output.

## Failure modes

| Failure | Correction |
|---|---|
| Approving without required gate evidence | Return `insufficient evidence` or request the missing gate. |
| Letting logic or mechanical review override domain/risk failure | Upper-layer and cross-cutting failures block regardless of lower-layer success. |
| Mixing suggestions with required fixes | Separate blocking evidence from non-blocking follow-ups. |
| Hiding non-blocking code-health findings | Put them under non-blocking follow-ups or an applicable ledger/rule-feedback section. |
| Updating the improvement ledger from the final gate | Stop at explicit candidates and hand off to `improvement-ledger`. |
| Treating unknown as pass | Unknown remains insufficient evidence. |

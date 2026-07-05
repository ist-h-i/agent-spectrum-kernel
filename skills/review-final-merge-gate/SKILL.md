---
name: review-final-merge-gate
description: Combine review gate results into the only final merge decision for a PR, diff, commit, patch, or generated code review. Use after review-router and required gates to decide approve, approve with comments, request changes, block, or insufficient evidence.
---

# Final Merge Gate

## Goal

Make the final merge decision from gate evidence without hiding missing checks, unresolved layer findings, or required approvals.

## Use when

- A review needs a final merge decision.
- Required review gates have produced results or their absence must be judged.

## Do not use when

- Earlier required gates have not been routed yet.
- The user only wants a specific gate result, not a merge decision.
- The action is risky and `risk-gate` has not cleared it.

## Process

1. Collect gate and layer results.
   - layer applicability from `review-router`,
   - `review-automated-gate`,
   - `review-ai-quality`,
   - `review-architecture-impact` when applicable,
   - `review-output-quality` when applicable,
   - `review-adversarial-risk` when applicable,
   - `review-code-health` when applicable, including current-PR blockers, backlog or separate-PR candidates, rule/check feedback, and improvement-ledger handoff,
   - `improvement-ledger` output when it has already been run for non-blocking findings,
   - `docs/ai/review-context.md` or project overlay review context when available; `context_status: template` counts as missing context, and `context_status: stale` counts as insufficient evidence for affected claims until refreshed,
   - `review-domain-impact` when applicable,
   - `adr-review` when applicable,
   - `risk-gate` when applicable,
   - `evidence-ledger` when claims need evidence status.

2. Build a layer summary.
   - Every layer routed by `review-router` must appear in the final decision.
   - Architecture layer evidence comes from `review-architecture-impact` when that gate was required.
   - Output quality layer evidence comes from `review-output-quality` when that gate was required.
   - Adversarial risk overlay evidence comes from `review-adversarial-risk` when that gate was required.
   - Durable review context may explain skipped, insufficient-evidence, known-issue, or accepted-risk judgments, but cannot replace required gate evidence.
   - Durable review context with `context_status: template` must not explain skipped or passed judgments; it is uninitialized context.
   - Durable review context with `context_status: stale` can only support unaffected claims; affected stale claims remain `insufficient evidence`.
   - Use `pass`, `fail`, `skipped`, or `insufficient evidence` for each layer.
   - Required layers without gate evidence remain `insufficient evidence`; do not silently downgrade them to skipped.
   - Skipped layers must retain the router's evidence-based reason.
   - Failed upper-layer or cross-cutting layers cannot be overridden by lower-layer passes.
   - Style / maintainability layer evidence may include `review-code-health`; current-PR blockers and non-blocking follow-up candidates must remain separate.

3. Apply precedence.
   - Domain, architecture, design, output quality, adversarial risk, risk, and evidence issues take precedence over mechanical success.
   - A mechanical pass from lint, typecheck, build, tests, or CI proves only that mechanical layer.
   - Missing evidence for a required layer leads to `insufficient evidence` or `request changes`, not `approve`.
   - Suggestions remain separate from required fixes and must not change the decision unless they identify required missing evidence or a failing layer.

4. Check hard blockers.
   - failed required automated checks,
   - blocker or major unresolved quality findings,
   - unauthorized or implicit domain change,
   - missing required owner approval,
   - required architecture, ADR, or domain decision missing,
   - risky action not approved,
   - insufficient evidence for changed behavior.

5. Decide.

| Decision | Use when |
|---|---|
| `approve` | Required layers pass or are evidence-backed skipped, and evidence is sufficient. |
| `approve with comments` | Required layers pass or are evidence-backed skipped, and only minor/nit or documented low residual risk remains. |
| `request changes` | Fixes are required, including missing required layer evidence that the author can reasonably provide, but direction is sound. |
| `block` | Critical correctness, security, data, domain, build, or risk issue exists. |
| `insufficient evidence` | The review target cannot be judged without more context, checks, or approvals. |

6. Keep suggestions separate from required fixes.

7. Preserve non-blocking follow-up candidates when applicable.
   - Keep current PR blockers in Required fixes.
   - Put non-blocking debt, refactor candidates, repeated findings, validation-check candidates, and backlog work under Improvement ledger candidates when durable tracking may be needed.
   - Use `docs/debt-lifecycle-contract.md` vocabulary for candidate lifecycle state, but do not move blockers into the ledger.
   - Put reusable prevention proposals under Rule feedback. Treat them as rule/check/project-overlay candidates, not code fixes.
   - Put explicitly deferred or accepted code-health risks under Deferred / accepted code-health risks with the known reason or follow-up condition.
   - Do not force every review to run `review-code-health` or `improvement-ledger`.
   - Do not update `docs/ai/improvement-ledger.md` from this final gate; make candidates explicit enough for a later `improvement-ledger` invocation or follow-up task.

## Output

Include the improvement-ledger, rule-feedback, and deferred-risk sections only when applicable.

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Layer summary:
- Domain: pass | fail | skipped | insufficient evidence - evidence/reason
- Architecture: pass | fail | skipped | insufficient evidence - evidence/reason
- Design: pass | fail | skipped | insufficient evidence - evidence/reason
- Logic: pass | fail | skipped | insufficient evidence - evidence/reason
- Output quality: pass | fail | skipped | insufficient evidence - evidence/reason
- Test / verification: pass | fail | skipped | insufficient evidence - evidence/reason
- Style / maintainability: pass | fail | skipped | insufficient evidence - evidence/reason
- Mechanical: pass | fail | skipped | insufficient evidence - evidence/reason
- Adversarial risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Evidence: pass | fail | skipped | insufficient evidence - evidence/reason

Required fixes:
- ...

Improvement ledger candidates:
- ...

Rule feedback:
- ...

Deferred / accepted code-health risks:
- ...

Suggestions:
- ...

Evidence reviewed:
- ...

Residual risk:
- ...
```

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and the review decision is complete, include a `Metrics event candidate` following `docs/metrics-event-contract.md`.

Summarize review outcome, validation status, required changes, improvement-ledger candidates, rule/check conversions if already completed, related IDs, evidence references, and privacy note. Do not duplicate detailed findings from the review or ledger.

## Exit criteria

- Final decision is explicit.
- The decision cites layer evidence or missing layer evidence.
- Every routed layer is summarized as passed, failed, skipped, or insufficient evidence.
- Domain impact and required approvals are accounted for when applicable.
- Upper-layer and cross-cutting failures are not overridden by lower-layer passes.
- Required but missing layer evidence prevents approval.
- Suggestions are not treated as merge blockers.
- Current PR blockers, improvement-ledger candidates, rule feedback, and deferred or accepted code-health risks are separated when those categories appear.
- Non-blocking findings are visible without forcing ledger updates inside this gate.

## Failure modes

| Failure | Correction |
|---|---|
| Approving without required gate evidence | Return `insufficient evidence` or request the missing gate. |
| Letting logic or mechanical review override domain/risk failure | Upper-layer and cross-cutting failures block regardless of lower-layer success. |
| Mixing suggestions with required fixes | Separate optional improvements from merge blockers. |
| Hiding non-blocking code-health findings | Put durable follow-up candidates under Improvement ledger candidates, Rule feedback, or Deferred / accepted code-health risks. |
| Updating the improvement ledger from the final gate | Stop at explicit candidates and hand off to `improvement-ledger` when durable tracking is needed. |
| Treating unknown as pass | Unknown remains insufficient evidence. |

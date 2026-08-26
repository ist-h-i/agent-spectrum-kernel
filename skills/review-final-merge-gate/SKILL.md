---
name: review-final-merge-gate
description: Make the only final merge decision when explicitly requested, after the mandatory baseline semantic review and every exact-signal additional gate.
---

# Final Merge Gate

## Goal

Produce the final merge decision from current baseline, specialized-gate, finding, and evidence results without replaying debug diagnostics or hiding missing checks.

## Use when

- The user or adapter explicitly requests a final merge decision.
- review-router has established the mandatory baseline and any additional required gates.

## Do not use when

- No final decision was requested.
- The baseline route has not been established.
- A risky action is about to execute and risk-gate has not cleared it.

## Process

1. Confirm authority and order.
   - schemas/review-signal-gate-map.json names this as the requested-only final gate.
   - It runs last.
   - The router and baseline never approve.

2. Collect the current route.
   - exactly one review-ai-quality baseline result;
   - every exact-signal additional gate result;
   - applicable automated evidence;
   - missing target/diff/changed-file/contract/test/output/context/CI evidence;
   - one ask.review-finding@1.0.0 inventory;
   - formal evidence-ledger and lifecycle trace refs when their independent triggers apply.

3. Fail closed on missing required evidence.
   - Missing baseline result is under-processing.
   - Missing baseline capability is capability_missing.
   - A required gate without current evidence remains insufficient evidence.
   - Missing applicable input remains insufficient evidence, never skipped or pass.
   - A lower-level pass cannot override domain, architecture, output, adversarial, risk, approval, or evidence failure.

4. Validate the finding inventory.
   - Preserve every current Finding ID and required field.
   - Order merge blockers first, then severity, then Finding ID.
   - Do not hide a blocker in suggestions or a durable follow-up.
   - Accepted risk remains explicit and separately authorized; absence of objection is not acceptance.

5. Decide.

| Decision | Use when |
|---|---|
| approve | Baseline and every required additional gate pass with sufficient evidence and no unresolved merge blocker. |
| approve with comments | Required gates pass and only non-blocking findings or bounded residual risk remain. |
| request changes | Actionable repair or missing evidence is bounded and direction remains viable. |
| block | Critical correctness, security, domain, build, approval, or risk failure exists. |
| insufficient evidence | The target cannot be judged without current target, gate, verification, context, or approval evidence. |

## Output

Use the shared Execution Envelope from docs/execution-envelope-contract.md for route/evidence/stop/next-action control.

~~~text
Baseline review:
- Gate: review-ai-quality
- Status and evidence:

Additional required gates:
- gate: status, evidence, and exact trigger signal

Missing evidence:
- input/gate: affected judgment and next check

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional

Decision:
- approve | approve with comments | request changes | block | insufficient evidence
~~~

Use - none for empty Additional required gates, Missing evidence, or Findings. Do not emit skipped-heavy or empty category sections. Complete applicability and route deviations remain diagnostic/debug output only.

When a merge claim requires stable traceability, reference the current Review decision, implementation subject, evidence, blockers, and accepted risks under docs/lifecycle-traceability-contract.md without copying their content.

## Exit criteria

- A final decision was explicitly requested.
- Exactly one baseline result is present.
- Every required additional gate is represented by current result or explicit insufficient evidence.
- Findings are complete, impact-ordered, and not hidden.
- Missing evidence prevents approval.
- The final decision is explicit and this gate is last.
- Ordinary output contains no empty category or skipped-heavy boilerplate.

## Failure modes

| Failure | Correction |
|---|---|
| Final gate runs by default | Require an explicit final-decision request. |
| Approval without baseline | Return insufficient evidence or capability_missing. |
| Missing gate treated as skipped | Keep the decision insufficient. |
| Lower-level pass overrides specialized failure | Apply specialized/risk precedence. |
| Category output hides merge consequence | Use one impact-ordered finding inventory. |
| Follow-up removes current blocker | Keep the blocker in Findings until resolved. |
| Unknown becomes pass | Unknown remains insufficient evidence. |

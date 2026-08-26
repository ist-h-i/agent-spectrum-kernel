---
name: review-router
description: Route an evaluative PR, diff, commit, patch, design artifact, or generated-code review through one mandatory baseline semantic review, exact-signal additional gates, and an optional final merge decision.
---

# Review Router

## Goal

Require one ordinary semantic review result for every evaluative review request, add only evidence-triggered specialized gates, and leave final merge authority to the final gate.

## Use when

- Reviewing a PR, diff, commit, patch, design artifact, or generated code.
- A review request may need logic, design, compatibility, evidence, domain, architecture, output, adversarial, code-health, risk, ADR, release, or final-decision judgment.

## Do not use when

- The user asks only for a non-evaluative summary.
- A specific narrower gate was explicitly requested and no complete review route or final decision is needed.

A missing concrete target is not a reason to skip this router. Record one baseline result as insufficient evidence and name the target evidence needed.

## Canonical policy

Read schemas/review-signal-gate-map.json. It owns:

- the signal-independent baseline gate;
- exact signal-selected additional gates;
- the heavy-gate over-processing subset;
- the requested-only final gate; and
- the closed impact-ordered finding fields.

Do not create another signal map in prose or in an adapter.

## Process

1. Classify the request and target.
   - If the request is evaluative, require exactly one logical review-ai-quality baseline result.
   - Exactly one means one current gate result in route/evidence. Do not claim a physical invocation count without runtime evidence.
   - If the target is absent, the baseline result is insufficient evidence.

2. Inspect the smallest applicable evidence set.
   - target and changed files;
   - diff or changed artifact;
   - affected contracts and compatibility surface;
   - relevant tests and automated evidence;
   - affected output;
   - repository context, docs, ADRs, and active ledgers;
   - CI evidence when the requested judgment depends on it.
   Missing applicable evidence stays insufficient evidence. Evidence that is not applicable to the concrete target is not required.

3. Extract exact observed signals.
   - Use only IDs in signal_to_gates.
   - Evidence explains a signal but never acts as a trigger ID.
   - Unknown, free-form, negated, or inferred-from-layer signals do not select a gate.
   - automated_evidence_required selects review-automated-gate when a judgment depends on automated test/build/lint/typecheck/static-analysis/CI evidence.

4. Run the baseline semantic review first.
   - review-ai-quality covers logic, local design, state/error boundaries, types/contracts, compatibility, observability, concurrency, performance signals, test adequacy, maintainability, and scope.
   - Specialized signals discovered by baseline are routed; baseline does not decide domain, architecture, output, adversarial, risk, ADR, release, approval, or final merge questions.
   - A missing baseline capability stops as capability_missing. Heavy gates never substitute for it.

5. Select additional gates.
   - Map exact observed signals through signal_to_gates.
   - Deduplicate gates and order them by signal_selected_gates.
   - Run no heavy gate merely because it exists or because the change is important.
   - Apply the active adapter capability gate against selected_skills. Missing required capability remains explicit and blocks any dependent final judgment.

6. Compile one finding inventory.
   - Follow ask.review-finding@1.0.0 in docs/review-finding-contract.md.
   - Preserve unique Finding IDs across gates.
   - Order merge blockers first, then blocker/major/minor/nit, then Finding ID in code-unit order.
   - Category is metadata. Do not emit empty category sections.

7. Run review-final-merge-gate only when a final decision is explicitly requested.
   - It runs after baseline and every required additional gate.
   - Missing required gate evidence remains insufficient evidence.
   - The router never approves.

8. Detect deviations.
   - Under-processing: the one baseline result or another required gate result is absent.
   - Over-processing: an executed signal-selected gate has no mapped observed signal.
   - Baseline is never over-processing because it is signal-independent.
   - Final-gate overactivation: final gate ran without a final-decision request.
   - Missing-evidence deviation: an unavailable applicable input was skipped, omitted, or treated as pass.

## Output

Use the shared Execution Envelope from docs/execution-envelope-contract.md for route/evidence/stop/next-action control. Ordinary user-facing review output contains only:

~~~text
Baseline review:
- Gate: review-ai-quality
- Status: pass | pass with comments | fail | insufficient evidence
- Evidence: target and applicable evidence checked

Additional required gates:
- gate: status and exact triggering signal(s)

Missing evidence:
- input: affected judgment and next check

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional metadata

Decision:
- approve | approve with comments | request changes | block | insufficient evidence
~~~

Omit Decision when no final decision was requested. Use - none for an empty Additional required gates, Missing evidence, or Findings section. Do not emit Skipped heavy gates or empty category sections in ordinary output.

For explicit validation/debug requests only, append Diagnostic applicability with complete gate states, skip reasons, missing inputs, trigger signals, under-processing, over-processing, and final-gate overactivation.

## Routing Decision

- Decisive target/evidence:
- Baseline result:
- Additional exact-signal routes:
- Final decision requested:
- Capability or evidence gaps:
- Uncertainty:

## Exit criteria

- Every evaluative request has exactly one logical baseline result or explicit baseline insufficient evidence.
- Baseline is signal-independent and excluded from heavy/over-processing classification.
- Every additional gate traces to an exact controlled signal.
- No all-heavy default exists.
- Missing applicable evidence is insufficient, never skipped or pass.
- Findings follow the one closed impact-ordered inventory.
- Ordinary output omits skipped-layer and empty-category boilerplate.
- Final decisions are optional, last, and owned only by review-final-merge-gate.

## Failure modes

| Failure | Correction |
|---|---|
| Optional ordinary semantic review | Require exactly one review-ai-quality baseline result. |
| Heavy gate substitutes for baseline | Stop for missing baseline capability or evidence. |
| Free-form evidence selects a gate | Require an exact signal_to_gates ID. |
| Every gate runs by default | Keep only baseline plus mapped additional gates. |
| Missing target exits silently | Emit baseline insufficient evidence and the next required input. |
| Category report hides impact | Compile one blocker/severity-ordered inventory. |
| Router approves | Run review-final-merge-gate only when a decision was requested. |

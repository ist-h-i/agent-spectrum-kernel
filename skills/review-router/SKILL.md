---
name: review-router
description: Route a diff, PR, commit, patch, or generated code review from observed change signals to the smallest required review gates.
---

# Review Router

## Goal

Select the smallest set of review gates needed to make the merge decision defensible. Start from observed change signals, keep the normal route compact, and retain complete layer diagnostics only for validation or debugging.

## Use when

- Reviewing a PR, diff, commit, patch, or generated code.
- The review may involve tests, logic, maintainability, code health, domain behavior, architecture, output, risk, or evidence.

## Do not use when

- The user only asks for a non-evaluative summary.
- No code, diff, design artifact, or review target is available.
- A specific narrower review gate has already been requested and no routing decision is needed.

## Process

1. Inspect the smallest evidence set that can expose review risk.
   - changed files and diff;
   - touched public interfaces, domain terms, generated/system-consumed output, tests, and verification commands;
   - `docs/ai/review-context.md` and relevant docs/ADRs when available. Treat `context_status: template` as missing context and `stale` as insufficient evidence for affected claims;
   - active ledgers only when their entries materially affect the target.

2. Extract observed change signals before choosing gates.
   - Record a short signal and the evidence that made it observable, for example `public contract`, `domain meaning`, `generated output`, `untrusted input`, `maintainability`, or `verification`.
   - Do not infer a trigger from the existence of a review layer.
   - If changed-file, diff, context, output, or verification evidence is unavailable, record that input under `Missing evidence` as `insufficient evidence`.

3. Map signals to required gates.
   - `review-domain-impact`: business rule, workflow responsibility, permission, notification, reporting meaning, state semantics, or generated business text.
   - `review-architecture-impact`: public API/contract, dependency direction, persistence, state ownership, cross-module responsibility, infrastructure, lifecycle, coupling, or hard-to-reverse boundary.
   - `review-output-quality`: UI, docs, reports, notifications, CLI output, API responses, generated text, AI-facing output, structured output, or consumer-facing wording.
   - `review-adversarial-risk`: untrusted input, security/privacy impact, prompt or generated-output failure modes, critical workflow blast radius, misuse path, release-readiness risk, or safety-boundary uncertainty.
   - `risk-gate`: destructive, external, auth, secret, production, dependency, migration, billing, email, or infrastructure action.
   - `review-automated-gate`: merge confidence depends on lint, format, typecheck, build, test, static analysis, or CI evidence.
   - `review-code-health`: the request or diff exposes debt, smell, duplication, dead code, maintainability, testability, performance, dependency/tooling, boundary weakness, or repeated finding risk.
   - `review-ai-quality`: local design, logic, scope, and implementation-quality signals not covered by a specialized gate.
   - `evidence-ledger`: the review makes a correctness, readiness, reliability, performance, security, UX, cost, or maintainability claim.
   - `review-final-merge-gate`: always last when a merge decision is requested.

4. Order the route by decision impact.
   - Domain and architecture signals precede technical review when applicable.
   - Output and adversarial overlays run when their signals are observed.
   - Automated evidence runs before the final merge gate.
   - `review-finding-compiler` and `improvement-ledger` are follow-ups only for reusable or non-blocking findings; they never hide current-PR blockers.

5. Detect routing deviations.
   - Under-processing: a required gate is absent from executed gate evidence.
   - Over-processing: a heavy gate is selected or executed without trigger evidence for that gate.
   - Missing-evidence deviation: unavailable inputs are represented as skipped or omitted instead of insufficient evidence.
   - Heavy gates are `review-domain-impact`, `review-architecture-impact`, `review-output-quality`, `review-adversarial-risk`, `review-code-health`, `risk-gate`, `adr-review`, and `release-readiness-gate`.

6. Keep the route minimal.
   - Do not run a gate only because a layer exists.
   - A skipped heavy gate must cite observed evidence or an observed signal showing why it is not applicable.
   - The normal user-facing route does not enumerate unaffected layers.
   - Use work terms in the user-facing route; keep gate names for traceability.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This review artifact owns signal-to-gate routing and does not repeat envelope fields.

```text
Change signals:
- signal: observed evidence

Required gates:
- gate: reason; triggered by signal(s)

Skipped heavy gates:
- gate/layer: observed reason

Missing evidence:
- input: why it is required and what remains unknown

Routing deviations:
- Under-processing: gate — required but not executed
- Over-processing: gate — selected without trigger evidence
```

Use `- none` for empty sections. For validation or debugging only, append a `Diagnostic applicability` object with complete layer statuses (`required | skipped | insufficient evidence`), reasons, evidence, trigger signals, selected gate, and inputs still needed. That diagnostic object is not required in the normal route.

## Routing Decision

- Decisive signals:
- Reason for primary route:
- Reason for each secondary route:
- Intentionally skipped:
- Risk overlay:
- Uncertainty:

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and the review reaches a meaningful durable state through the selected gates or final merge gate, include a `Metrics event candidate` following `docs/metrics-event-contract.md`. Route selection alone is not a durable task outcome.

## Exit criteria

- Observed change signals are explicit before gates run.
- Required gates are traceable to signals and reasons.
- Missing inputs are reported as `insufficient evidence`, never silently as skipped.
- Heavy gates skipped in the normal route have evidence-backed reasons.
- Required-but-not-executed gates are reported as under-processing.
- Heavy gates selected without trigger evidence are reported as over-processing warnings.
- Domain, architecture, output, adversarial, code-health, and risk signals route to their specialized gates rather than being hidden in generic review.
- The route does not run every gate by default.
- Final merge decisions are delegated to `review-final-merge-gate`.
- Repeated or high-impact findings remain current-PR blockers until the final gate and are routed to durable follow-up only afterward.

## Failure modes

| Failure | Correction |
|---|---|
| Treating every PR as needing every gate | Route by observed signals and risk. |
| Approving from router output | Router selects gates; it does not approve. |
| Missing hidden domain change | Check state, permissions, notifications, reports, and generated business text before technical gates. |
| Skipping risk review because the diff is small | Route by possible impact, not diff size. |
| Silently omitting a required gate | Trace every required gate to an observed signal before choosing gate order. |
| Marking missing inputs as skipped | Add the input to `Missing evidence` and keep the affected judgment insufficient. |

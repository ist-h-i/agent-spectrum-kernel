---
name: review-router
description: Route a diff, PR, commit, patch, or generated code review to the smallest required review gates. Use before merge reviews to decide which automated, AI quality, domain, ADR, risk, evidence, and final merge gates are required, optional, or skipped.
---

# Review Router

## Goal

Select the smallest set of review gates needed to make the merge decision defensible, while proving that no required review layer was silently omitted.

## Use when

- Reviewing a PR, diff, commit, patch, or generated code.
- The review may involve multiple concerns such as tests, logic, maintainability, domain behavior, architecture, risk, or evidence.

## Do not use when

- The user only asks for a non-evaluative summary.
- No code, diff, design artifact, or review target is available.
- A specific narrower review gate has already been requested and no routing decision is needed.

## Process

1. Read enough context to identify review risk.
   - diff or changed files,
   - touched public interfaces,
   - tests and commands,
   - docs/ADRs when terms, state, or architecture may change.

2. Classify changed meaning.
   - Mechanical: formatting, generated output, lockfile-only, or lint-only.
   - Technical behavior: correctness, edge cases, API use, error handling, tests.
   - Maintainability: naming, readability, local design, scope creep.
   - Domain behavior: business rules, state semantics, responsibility, workflow, reporting, generated business text.
   - Architecture/risk: hard-to-reverse boundaries, dependencies, persistence, auth, infra, external effects.

3. Produce a layer applicability contract before executing gates.
   - Every layer must have `status: required | skipped | insufficient evidence`.
   - Every layer must include an evidence-based reason.
   - Required layers must name the selected gate.
   - Layers with insufficient evidence must name the inputs still needed.
   - Skipped layers must cite observed evidence, not assumption or convenience.

4. Evaluate each layer.
   - Domain: business rules, workflow responsibility, state semantics, reporting meaning, permissions, notifications, generated business text.
   - Architecture: hard-to-reverse boundaries, public APIs, dependencies, persistence, deployment, cross-module contracts.
   - Design: local design, responsibility split, API shape, data flow, state ownership, error boundaries.
   - Logic: correctness, edge cases, API use, error handling, concurrency, compatibility.
   - Output quality: user-visible, operator-visible, reviewer-visible, system-consumed, or AI-consumed output such as UI screens, reports, notifications, CLI output, API responses, docs, generated text, or AI output; review form, structure, completeness, clarity, persona/consumer fit, and output contract fit.
   - Test / verification: changed behavior coverage, regression proof, missing negative cases, executable evidence.
   - Style / maintainability: naming, readability, duplication, scope creep, local complexity.
   - Mechanical: format, lint, typecheck, build, tests, static analysis, CI.
   - Adversarial risk overlay: abuse cases, prompt/generated-output failure modes, security/privacy signals, reviewer challenge pass.
   - Risk overlay: destructive, external, auth, secret, production, dependency, migration, billing, email, infra impact.
   - Evidence overlay: correctness, readiness, reliability, performance, security, UX, cost, or maintainability claims that need evidence status.

5. Route gates from the layer contract.
   - `review-domain-impact` first if domain behavior may change.
   - `adr-review` if architectural memory or hard-to-reverse boundary decisions may change.
   - `risk-gate` before any destructive, external, auth, secret, production, dependency, or infra action.
   - `review-automated-gate` for mechanical verification evidence.
   - `review-ai-quality` for code-quality review.
   - `evidence-ledger` when claims need evidence classification.
   - `review-final-merge-gate` to make the merge decision.

6. Keep the route minimal.
   - Do not run a gate only because the layer exists.
   - Combine layers into one selected gate when that gate covers the observed risk.
   - Do not treat a required layer as permission to run every gate.
   - If a layer is skipped, explain which inspected input made it non-applicable.

## Output

```text
Layer applicability:
- Domain:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Architecture:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Design:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Logic:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Output quality:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Test / verification:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Style / maintainability:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Mechanical:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Adversarial risk overlay:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Risk overlay:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:
- Evidence overlay:
  status: required | skipped | insufficient evidence
  reason:
  gate:
  inputs still needed:

Review route:
- Required gates:
- Optional gates:
- Skipped gates:
- Gate order:
- Reason:
- Inputs still needed:
```

## Exit criteria

- Required, optional, and skipped gates are explicit.
- Layer applicability is explicit before gates run.
- Required layers map to selected gates.
- Skipped layers have evidence-based reasons.
- Insufficient-evidence layers name the missing inputs.
- Domain impact is checked before technical review when applicable.
- The route does not run every gate by default.
- Final merge decision is delegated to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Treating every PR as needing every gate | Route by observed impact and risk. |
| Approving from router output | Router selects gates; it does not approve. |
| Missing hidden domain change | Check state, permissions, notifications, reports, and generated business text before technical gates. |
| Skipping risk review because code diff is small | Route by possible impact, not diff size. |
| Silently omitting a required layer | Fill the layer applicability contract before choosing gate order. |
| Marking a layer skipped without evidence | Change it to `insufficient evidence` and name the missing inputs. |

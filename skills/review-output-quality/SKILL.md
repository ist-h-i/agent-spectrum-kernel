---
name: review-output-quality
description: Review human-facing, system-facing, AI-facing, and generated outputs for consumer fit, structure, completeness, accessibility, and output contract compliance. Use when review-router detects changed UI, reports, notifications, docs, CLI output, API responses, generated text, or machine-consumed output.
---

# Output Quality Review

## Goal

Review changed output as a product of its intended consumer, medium, and decision context, without inventing persona, brand, or output goals that are not evidenced.

## Use when

- A diff, PR, generated artifact, or design change affects human-facing output such as UI, reports, docs, notifications, CLI output, or generated prose.
- A change affects system-facing or AI-facing output such as API responses, structured files, prompts, model outputs, logs, schemas, or machine-consumed fields.
- `review-router` marks the Output quality layer as required or insufficient evidence.
- `review-ai-quality` routes output-layer signals here.

## Do not use when

- The output cannot be observed through a screenshot, rendered artifact, sample response, CLI output, generated text, schema, or contract.
- The question is internal implementation quality. Use `review-ai-quality`.
- The issue is domain meaning rather than output fitness. Use `review-domain-impact`.
- The issue is adversarial misuse or high-impact failure path. Use `review-adversarial-risk`.

## Required context

Read available project review context before judging consumer fit:

- `docs/ai/review-context.md`,
- project overlay rules such as `AGENTS.project.md`,
- relevant docs, examples, screenshots, schemas, output contracts, style guides, or product requirements.

If `docs/ai/review-context.md` has `context_status: template`, treat it as missing context. If it has `context_status: stale`, refresh affected claims or mark those judgments as `insufficient evidence`.

If target audience, purpose, medium, or output contract is missing, mark the affected judgment as `insufficient evidence` instead of giving generic UX, copy, or formatting advice.

For an interactive UI target, consume the current task's `UX supplement` when one exists and read only the applicable parts of `skills/ui-ux-design/SKILL.md` and its referenced patterns. Absence of that supplement is missing evidence only for judgments that actually depend on unstated interaction semantics; it is not a reason to invent a persona, product goal, or generic redesign.

## Process

1. Identify the output target.
   - medium: UI, report, docs, CLI, API, file, generated text, AI output, log, notification, or other,
   - consumer: human, system, AI, or mixed,
   - purpose: decision support, task completion, recovery, integration, audit, communication, or other,
   - observed artifact or contract.

2. For interactive UI output, bind findings to applicable harness patterns and evidence.
   - Confirm the observed UI signal that made `ui-ux-design` applicable.
   - Trace each UX finding to the applicable pattern, task consequence, and observed artifact/state.
   - Use screenshots/rendered artifacts for static hierarchy, labeling, and visible state only.
   - Require interactive or state evidence for focus/selection transitions, loading, duplicate-action prevention, actual undo, pre-commit cancellation, input retention, scoped retry, recovery, and whole-screen blocking.
   - For partial data, distinguish legitimate empty, missing, stale, partial, and complete. Do not accept zero-filled or derived output when prerequisite truth is incomplete unless the product contract explicitly defines that semantics.

3. Check human-facing output when applicable.
   - visibility and information hierarchy,
   - cognitive load and information density,
   - evidenced user/audience fit without invented personas,
   - natural task language and unambiguous action/result wording,
   - accessibility and equivalent interaction constraints,
   - current/focus/selected/loading/error/success/completed state when applicable,
   - actionability, continuation, reversibility, and recovery,
   - preservation of healthy regions and user input across independent failure.

4. Check system or AI-facing output when applicable.
   - structure,
   - completeness,
   - consistency,
   - parseability,
   - output contract fit,
   - machine-consumable fields,
   - missing or ambiguous information.

5. Control review noise.
   - Do not critique taste without persona, style guide, product promise, or output contract evidence.
   - Do not invent brand, persona, or project goals.
   - Do not report internal implementation concerns here.
   - Do not block on optional polish unless it breaks the consumer's task or contract.
   - Visual taste alone is not a Major or Blocker; require an evidenced task, contract, inclusion, state, recovery, or consequence failure.

6. Return output quality gate status, not final merge approval.

## Output

Actionable output findings follow `ask.review-finding@1.0.0` in `docs/review-finding-contract.md` and join the one impact-ordered review inventory.

```text
Output quality gate:
- Gate status: pass | pass with comments | fail | insufficient evidence
- Output target:
- Consumer: human | system | AI | mixed
- Output purpose:
- Review scope:
- Required context:
- Missing context:

Human-output checks:
- visibility:
- information hierarchy:
- cognitive load:
- persona fit:
- language / action semantics:
- interaction states / feedback:
- accessibility / equivalent paths:
- actionability / continuation:
- reversibility / consequence:
- partial failure / recovery:

Interactive UI evidence:
- applicable harness patterns:
- rendered/static evidence:
- exercised state transitions:
- retained or restored state:
- retry / recovery result:
- missing interactive evidence:

System/AI-output checks:
- structure:
- completeness:
- consistency:
- parseability:
- contract fit:
- machine-consumable fields:

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: output

Residual output risk:
- ...
```

## Exit criteria

- Output-layer findings are separated from implementation, domain, and adversarial findings.
- Human-facing and system/AI-facing output checks are represented when applicable.
- Dynamic UI claims are not accepted from screenshot-only evidence.
- Applicable UI findings trace to a harness pattern plus an observed task/state/recovery consequence.
- Missing persona, medium, sample output, output contract, or required interactive evidence produces `insufficient evidence` only for the affected judgment.
- Every actionable finding uses the closed common fields and names the consumer impact and observed failure trace.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Inventing persona or brand goals | Mark persona or style evidence as missing and limit findings to observable contract issues. |
| Reviewing internal code design | Route to `review-ai-quality` or `review-architecture-impact`. |
| Treating preference as defect | Require consumer impact, contract, inclusion, state, recovery, or consequence evidence; do not promote taste to Major/Blocker. |
| Proving dynamic UI behavior with a screenshot | Exercise the transition and inspect the resulting visible and underlying state. |
| Judging unobserved output | Request screenshot, sample response, rendered text, generated artifact, contract, or interactive evidence appropriate to the claim. |
| Approving the PR directly | Report gate status only. |

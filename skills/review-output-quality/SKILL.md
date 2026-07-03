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

## Process

1. Identify the output target.
   - medium: UI, report, docs, CLI, API, file, generated text, AI output, log, notification, or other,
   - consumer: human, system, AI, or mixed,
   - purpose: decision support, task completion, recovery, integration, audit, communication, or other,
   - observed artifact or contract.

2. Check human-facing output when applicable.
   - visibility,
   - information hierarchy,
   - cognitive load,
   - information density,
   - persona or audience fit,
   - accessibility constraints,
   - actionability and recovery from errors.

3. Check system or AI-facing output when applicable.
   - structure,
   - completeness,
   - consistency,
   - parseability,
   - output contract fit,
   - machine-consumable fields,
   - missing or ambiguous information.

4. Control review noise.
   - Do not critique taste without persona, style guide, product promise, or output contract evidence.
   - Do not invent brand, persona, or project goals.
   - Do not report internal implementation concerns here.
   - Do not block on optional polish unless it breaks the consumer's task or contract.

5. Return output quality gate status, not final merge approval.

## Output

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
- accessibility:
- actionability / recovery:

System/AI-output checks:
- structure:
- completeness:
- consistency:
- parseability:
- contract fit:
- machine-consumable fields:

Findings:
- [severity] target - issue
  Evidence:
  Consumer impact:
  Required fix:

Suggestions:
- ...

Residual output risk:
- ...
```

## Exit criteria

- Output-layer findings are separated from implementation, domain, and adversarial findings.
- Human-facing and system/AI-facing output checks are represented when applicable.
- Missing persona, medium, sample output, or output contract produces `insufficient evidence`.
- Every required finding names the observed artifact or missing artifact, consumer impact, and required fix.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Inventing persona or brand goals | Mark persona or style evidence as missing and limit findings to observable contract issues. |
| Reviewing internal code design | Route to `review-ai-quality` or `review-architecture-impact`. |
| Treating preference as defect | Require consumer impact, contract evidence, or accessibility evidence. |
| Judging unobserved output | Request screenshot, sample response, rendered text, generated artifact, or contract. |
| Approving the PR directly | Report gate status only. |

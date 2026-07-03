---
name: review-adversarial-risk
description: Run a noise-controlled adversarial review pass for severe hidden failure paths, misuse paths, and blast-radius risks. Use when review-router detects high-impact security, privacy, auth, permission, billing, email, migration, infra, production, AI-generated, or large cross-module risk signals.
---

# Adversarial Risk Review

## Goal

Find only the most material adversarial risks that remain after normal review gates, and suppress generic, known, accepted, low-severity, or already-covered issues.

## Use when

- A change has high blast radius or release-readiness risk.
- Security, privacy, auth, permission, billing, email, migration, infrastructure, production behavior, or irreversible user/system impact may be affected.
- A diff is AI-generated, large, cross-module, or changes critical workflows.
- Prompt, model, generated-output, automation, or tool-execution behavior can be misused.
- `review-router` marks the Adversarial risk overlay as required or insufficient evidence.
- `review-ai-quality` routes adversarial signals here.

## Do not use when

- The change is trivial, mechanical, formatting-only, lint-only, or evidence-backed low blast radius.
- The user wants an exhaustive checklist instead of the top severe risks.
- Normal domain, architecture, output, or implementation gates are enough to judge the change.
- The issue is whether a risky action may be executed. Use `risk-gate`.

## Required context

Read available project review context before judging adversarial risk:

- `docs/ai/review-context.md`,
- project overlay rules such as `AGENTS.project.md`,
- relevant docs, ADRs, threat models, security notes, accepted risks, known issues, incidents, or critical workflow docs.

If `docs/ai/review-context.md` has `context_status: template`, treat it as missing context. If it has `context_status: stale`, refresh affected claims or mark those judgments as `insufficient evidence`.

If assets, actors, safety boundaries, accepted risks, or threat/misuse model are missing, mark the affected judgment as `insufficient evidence` instead of inventing threats.

## Process

1. Define the reviewed scope and exclusions.
   - changed assets,
   - reachable actors,
   - critical workflows,
   - external systems or irreversible effects,
   - known issues or accepted risks to ignore.

2. Search for severe failure paths only.
   - privilege or permission bypass,
   - data exposure or privacy breach,
   - destructive or irreversible operation,
   - financial, email, notification, or external side effect abuse,
   - production/infrastructure blast radius,
   - prompt, generated-output, or AI-tool misuse,
   - hidden coupling that can turn a local defect into a broad outage.

3. Filter noise.
   - Report at most three critical/high risks unless the user explicitly asks for exhaustive review.
   - Do not report generic best practices.
   - Do not report known issues unless this change escalates them.
   - Do not report accepted risks unless this change invalidates acceptance.
   - Do not report low-severity style or maintainability issues.
   - Tie every finding to a concrete asset, actor, failure path, and blast radius.

4. Distinguish non-findings.
   - Record important risks intentionally not reported because they are out of scope, already covered, accepted, not reachable, or not evidenced.

5. Return adversarial gate status, not final merge approval.

## Output

```text
Adversarial risk gate:
- Gate status: pass | pass with residual risk | fail | insufficient evidence
- Scope reviewed:
- Explicit exclusions:
- Project constraints applied:
- Known issues ignored:
- Missing context:

Top critical risks:
1. Risk:
   Failure path:
   Preconditions:
   Blast radius:
   Evidence:
   Why this is not already covered:
   Required fix or decision:

Non-findings:
- Items intentionally not reported:

Residual adversarial risk:
- ...
```

## Exit criteria

- Findings are limited to severe, evidence-backed, high-impact risks.
- Known, accepted, duplicate, generic, and low-severity issues are suppressed.
- Missing context produces `insufficient evidence` rather than invented threats.
- Each finding names the asset, actor or precondition, failure path, blast radius, and required fix or decision.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Producing a generic security checklist | Keep only concrete severe paths reachable from the reviewed change. |
| Re-reporting known or accepted risks | Suppress unless the change escalates or invalidates acceptance. |
| Reporting low-severity quality issues | Route to `review-ai-quality` or suggestions outside this gate. |
| Inventing a threat model | Mark threat/misuse context as missing. |
| Treating risk-gate approval as adversarial review | `risk-gate` controls action execution; this gate searches for hidden failure paths. |

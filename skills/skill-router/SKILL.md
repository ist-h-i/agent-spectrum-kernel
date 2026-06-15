---
name: skill-router
description: Select the smallest relevant workflow for a coding-agent task. Use for non-trivial, ambiguous, multi-step, design, investigation, review, risk-gated, or handoff requests.
---

# Skill Router

## Goal

Route the task to the smallest workflow that controls the risk. Do not run every skill.

## Use when

- The task is non-trivial and the correct workflow is unclear.
- The task has multiple possible modes: design, implementation, review, investigation, risk, or handoff.
- The user asks broadly and the agent must decide how to proceed without over-processing.

## Do not use when

- The task is a trivial local edit.
- The user explicitly names a relevant skill and no routing decision is needed.

## Inputs

- User request.
- Available repository context.
- Known risk: behavior, data, API, security, deployment, performance, or external side effects.

## Process

1. Classify the task.

| Class | Meaning |
|---|---|
| `trivial` | Small local edit with obvious scope. |
| `implementation` | Code change with observable behavior. |
| `design` | Plan, architecture, API, schema, workflow, or ambiguous requirement. |
| `investigation` | Bug, regression, unknown root cause, performance, reliability, or research-like question. |
| `review` | Diff, PR, generated code, design, readiness, or claim evaluation. |
| `handoff` | State transfer or next task creation. |
| `risk-gated` | Destructive, irreversible, secret-sensitive, production-facing, or externally visible work. |

2. Estimate risk.

| Risk | Signals |
|---|---|
| Low | Local change, known files, no behavior/API/data impact. |
| Medium | User-visible behavior, multiple files, tests needed, ambiguous edge cases. |
| High | Public API/schema, auth/security, persistence, migration, performance claim, broad refactor. |
| Critical | Production deploy, destructive command, credentials, payments, email sending, data deletion. |

3. Select the workflow.

| Situation | Primary | Secondary |
|---|---|---|
| Unfamiliar repo | `repository-orientation` | — |
| Ambiguous design | `grill-design` | `spec-driven-development` |
| Existing docs/domain/ADR constraints | `grill-with-docs` | `adr-review` |
| New behavior | `spec-driven-development` | `test-first-verification` |
| Implementation after plan exists | `controlled-implementation` | `scope-control` |
| Long-running/multi-agent work | `planning-with-files` | `handoff-generation` |
| Scope/refactor risk | `scope-control` | `code-review-quality` |
| Bug/unknown cause | `doubt-driven-development` | `test-first-verification` |
| Risk-gated action | `risk-gate` | `evidence-ledger` |
| Architecture decision | `adr-review` | `grill-with-docs` |
| PR/diff/generated code review | `code-review-quality` | `evidence-ledger` |
| Claim validation | `evidence-ledger` | `doubt-driven-development` |
| End of work | `handoff-generation` | — |

4. State what is intentionally skipped.

5. Continue into the selected primary workflow unless the task requires user approval.

## Output

```text
Selected workflow:
- Primary:
- Secondary:
- Skipped:

Reason:
- Task class:
- Risk level:
- Decisive signal:

Next action:
- ...
```

## Exit criteria

- One primary workflow is selected.
- Any secondary workflow has a clear reason.
- Trivial work is not over-processed.
- Critical risk is routed to `risk-gate` before action.

## Failure modes

| Failure | Correction |
|---|---|
| Running all skills | Use smallest sufficient workflow. |
| Skipping process for high-risk work | Reclassify by impact, not diff size. |
| Asking broad questions before routing | Route first; ask only blocking questions. |

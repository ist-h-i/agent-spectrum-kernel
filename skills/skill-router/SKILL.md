---
name: skill-router
description: Select the smallest relevant delivery or quality workflow for a coding-agent task after the operating mode has been classified.
---

# Skill Router

## Goal

Route a delivery/quality task to the smallest workflow that controls the risk. Do not run every skill.

This skill is the canonical delivery/quality router. `operating-mode-router` selects the top-level mode first when adoption, observability, or operation signals may be present. Documentation tables or workflow examples must mirror this skill for delivery/quality routes instead of defining competing routes.

## Use when

- The operating mode is `delivery_quality` and the correct workflow is unclear.
- The task has multiple possible modes: design, implementation, review, investigation, risk, or handoff.
- The user asks broadly and the agent must decide how to proceed without over-processing.

## Do not use when

- The task is a trivial local edit.
- The user explicitly names a relevant skill and no routing decision is needed.
- The request is about first-time project rollout, skill effectiveness, adoption metrics, or weekly/monthly reporting. Use `operating-mode-router` first.

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
| First-time project rollout or adoption pack request | `operating-mode-router` | Route to `adoption_bootstrap` -> `project-adoption-pack-generation` |
| Skill effectiveness, routing quality, or one-task workflow retrospective | `operating-mode-router` | Route to `observability_metrics` -> `skill-effectiveness-evaluation` |
| Adoption maturity, instruction quality, usage metrics, or multi-task adoption impact | `operating-mode-router` | Route to `observability_metrics` -> `skill-adoption-metrics` |
| Weekly/monthly reporting, recurring summary, scheduler, or automation cadence | `operating-mode-router` | Route to `operation_automation`; use report templates or external operation, not a delivery skill |
| Unfamiliar repo | `repository-orientation` | `scope-control` if target boundary is unclear; `planning-with-files` only if the task spans sessions/agents or durable state is needed |
| Ambiguous design / “grill me” | `grill-design` | `grill-with-docs` if docs/domain/ADR terms matter; then `spec-driven-development` only after design boundary and acceptance criteria are stable |
| Existing docs/domain/ADR constraints | `grill-with-docs` | `adr-review` |
| Application boundary decision needed before implementation, including dependency direction, state ownership, external I/O boundary, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundary, or architecture guard rollout | `application-boundary-architecture` | Return to `spec-driven-development` or `controlled-implementation` after the boundary decision; use `adr-review` if hard-to-reverse or record-worthy |
| Repeated implementation context setup | `implementation-context-generation` | `repository-orientation` for repo facts before drafting context |
| New behavior | `spec-driven-development` | `test-first-verification` for Verification Contract -> `controlled-implementation` -> `test-first-verification` for evidence |
| Implementation after plan exists | `controlled-implementation` | `test-first-verification` for Verification Contract before behavior changes when proof is needed; `scope-control` if scope is unclear |
| Approved behavior-preserving refactor implementation | `refactor-implementation` | `test-first-verification` for regression proof; `application-boundary-architecture` first if responsibility, dependency direction, public contract, schema, UI behavior, or ownership boundaries may move; `improvement-ledger` for follow-up debt or prevention candidates |
| Long-running/multi-agent work | `planning-with-files` | `handoff-generation` |
| Scope/refactor risk | `scope-control` | `controlled-implementation` if proceeding to code; review phase uses `review-router` -> required gates, with scope findings generally routed to `review-ai-quality` |
| Bug/unknown cause | `doubt-driven-development` | `test-first-verification` for reproduction and Verification Contract -> `controlled-implementation` -> `test-first-verification` for regression proof |
| Hard-to-reverse architecture decision or ADR need | `adr-review` | `grill-with-docs`; `application-boundary-architecture` if boundary mechanics are unresolved |
| PR/diff/generated code review | `review-router` | Required gates from layer applicability, including `review-code-health`, `review-architecture-impact`, `review-output-quality`, and `review-adversarial-risk` when applicable; then `review-final-merge-gate` |
| Technical debt, code smell, or refactor candidate review | `review-router` | `review-code-health`; specialized gates only when findings cross into architecture, adversarial, risk, or evidence concerns |
| Persisting non-blocking review findings, debt, rule feedback, validation check candidates, accepted risks, or stale improvement items | `improvement-ledger` | `review-code-health` only if findings still need detection; `evidence-ledger` if readiness or resolution claims need evidence classification |
| MR/PR README, PR explanation, or durable change-context documentation | `mr-readme-generation` | `adr-review` |
| Repeated review context setup | `review-context-generation` | `repository-orientation` for repo facts before drafting context |
| Claim validation | `evidence-ledger` | `doubt-driven-development` |
| End of work | `handoff-generation` | — |

4. Apply project overlay skill selection.
   - If a project overlay contains framework, domain, UI/UX, architecture, CI, data, security, or other repository-specific skills, consider them after generic workflow selection.
   - Select overlay skills only when the overlay signal applies to the selected work type.
   - Do not add project-specific skills to the generic routing table.
   - For stack-specific implementation overlays, follow `docs/stack-implementation-overlay-contract.md`. They may supplement `controlled-implementation` and `test-first-verification`, but must not replace the generic workflow.

5. State what is intentionally skipped.

6. Apply overlays before action.
   - Risk overlay: if any task involves destructive, external, production, auth, secret, dependency, migration, billing, email, or infra impact, run `risk-gate` before the selected workflow proceeds to action.
   - Evidence overlay: use `evidence-ledger` whenever the response makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

7. Continue into the selected primary workflow unless the task requires user approval.

## Output

```text
Selected workflow:
- Primary:
- Secondary:
- Project overlay skills:
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

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and the routed delivery task reaches a meaningful durable state, include a `Metrics event candidate` following `docs/metrics-event-contract.md`.

Do not emit metrics for a bare router invocation, a partial conversation, a trivial edit with no adoption measurement need, or hidden telemetry.

## Failure modes

| Failure | Correction |
|---|---|
| Running all skills | Use smallest sufficient workflow. |
| Skipping process for high-risk work | Reclassify by impact, not diff size. |
| Asking broad questions before routing | Route first; ask only blocking questions. |

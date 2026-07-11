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

2. Select the user-facing work mode.

| Work mode | Natural request examples | Route family |
|---|---|---|
| `要件確認` | このチケットを進めて / この設計を詰めて | requirement, decision, domain-rule route |
| `実装準備` | Codexに渡せる形にして / 実装できる作業にして | work package, spec, verification contract route |
| `実装` | 実装して / 修正して | scoped implementation or refactor route |
| `レビュー` | このPRをレビューして / このdiffを見て | review-router and required gates |
| `調査` | このバグを調べて / 原因を特定して | doubt-driven-development and verification route |
| `ドキュメント整理` | この状態を整理して / handoffを作って | documentation, PR explanation, handoff route |
| `知識蓄積` | この指摘を次に活かして | finding, ledger, reusable guidance route |

The user-facing route should describe work steps and stop points without requiring skill-name knowledge. The internal route should keep skill names explicit for review and debugging.

3. Estimate risk.

| Risk | Signals |
|---|---|
| Low | Local change, known files, no behavior/API/data impact. |
| Medium | User-visible behavior, multiple files, tests needed, ambiguous edge cases. |
| High | Public API/schema, auth/security, persistence, migration, performance claim, broad refactor. |
| Critical | Production deploy, destructive command, credentials, payments, email sending, data deletion. |

4. Select the workflow.

| Situation | Primary | Secondary |
|---|---|---|
| First-time project rollout or adoption pack request | `operating-mode-router` | Route to `adoption_bootstrap` -> `project-adoption-pack-generation` |
| Skill effectiveness, routing quality, or one-task workflow retrospective | `operating-mode-router` | Route to `observability_metrics` -> `skill-effectiveness-evaluation` |
| Adoption maturity, instruction quality, usage metrics, or multi-task adoption impact | `operating-mode-router` | Route to `observability_metrics` -> `skill-adoption-metrics` |
| Evidence-backed full-layer engineering capability evaluation | `operating-mode-router` | Route to `observability_metrics` -> `engineering-capability-evaluation` |
| Weekly/monthly reporting, recurring summary, scheduler, or automation cadence | `operating-mode-router` | Route to `operation_automation`; use report templates or external operation, not a delivery skill |
| Unfamiliar repo | `repository-orientation` | `scope-control` if target boundary is unclear; `planning-with-files` only if the task spans sessions/agents or durable state is needed |
| Vague business intent, success condition, responsibility boundary, or domain rule impact before implementation | `requirement-grill` | `domain-rule-ledger` only to consume existing confirmed/verified rules or record explicitly requested durable rules; then route to `work-package-compiler`, `grill-design`, or `spec-driven-development` |
| Confirmed Requirement Contract needs agent-ready task packaging | `work-package-compiler` | `review-domain-impact` as required review gate when domain rules or business behavior are involved; `grill-design` first if technical design choices remain |
| Repo-aware next change candidate discovery | `next-best-change-finder` | Default route to `requirement-grill` unless requirements are already confirmed; do not authorize implementation from candidates alone |
| Ambiguous design / “grill me” | `grill-design` | `grill-with-docs` if docs/domain/ADR terms matter; then `spec-driven-development` only after design boundary and acceptance criteria are stable |
| Existing docs/domain/ADR constraints | `grill-with-docs` | `adr-review` |
| Application boundary decision needed before implementation, including dependency direction, state ownership, external I/O boundary, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundary, or architecture guard rollout | `application-boundary-architecture` | Return to `spec-driven-development` or `controlled-implementation` after the boundary decision; use `adr-review` if hard-to-reverse or record-worthy |
| Reusable implementation pattern creation, refresh, deprecation, or contradiction | `engineering-pattern-ledger` | `controlled-implementation`, `application-boundary-architecture`, stack overlays, and review gates consume only matching entries by evidence status |
| Reusable verification expectation creation, refresh, deprecation, or contradiction | `verification-pattern-ledger` | `test-first-verification`, `work-package-compiler`, `review-automated-gate`, `review-final-merge-gate`, and `release-readiness-gate` consume only current matching entries |
| Reusable architecture or boundary decision memory below ADR level | `architecture-decision-memory` | `adr-review` when formal ADR action is needed; `application-boundary-architecture` when mechanics are unresolved; `review-architecture-impact` when reviewing diffs |
| Repeated implementation context setup | `implementation-context-generation` | `repository-orientation` for repo facts before drafting context |
| New behavior | `spec-driven-development` | `test-first-verification` for Verification Contract -> `controlled-implementation` -> `test-first-verification` for evidence |
| Implementation after plan exists | `controlled-implementation` | `test-first-verification` for Verification Contract before behavior changes when proof is needed; `scope-control` if scope is unclear |
| Approved behavior-preserving refactor implementation | `refactor-implementation` | `test-first-verification` for regression proof; `application-boundary-architecture` first if responsibility, dependency direction, public contract, schema, UI behavior, or ownership boundaries may move; `improvement-ledger` for follow-up debt or prevention candidates |
| Long-running/multi-agent work | `planning-with-files` | `handoff-generation` |
| Scope/refactor risk | `scope-control` | `controlled-implementation` if proceeding to code; review phase uses `review-router` -> required gates, with scope findings generally routed to `review-ai-quality` |
| Bug/unknown cause | `doubt-driven-development` | `test-first-verification` for reproduction and Verification Contract -> `controlled-implementation` -> `test-first-verification` for regression proof |
| Hard-to-reverse architecture decision or ADR need | `adr-review` | `grill-with-docs`; `application-boundary-architecture` if boundary mechanics are unresolved |
| PR/diff/generated code review | `review-router` | Required gates from layer applicability, including `review-code-health`, `review-architecture-impact`, `review-output-quality`, and `review-adversarial-risk` when applicable; then `review-final-merge-gate` |
| Repeated or high-impact review findings should become prevention knowledge | `review-finding-compiler` | Route domain/business rules to `review-to-rule-compiler`; route non-blocking work to `improvement-ledger`; route implementation and verification lessons to their ledgers |
| Release candidate or bundled change-set readiness | `release-readiness-gate` | `risk-gate` before deploy, publish, migration, external notification, or release execution; `review-final-merge-gate` remains the PR-level decision gate |
| Technical debt, code smell, or refactor candidate review | `review-router` | `review-code-health`; specialized gates only when findings cross into architecture, adversarial, risk, or evidence concerns |
| Persisting non-blocking review findings, debt, rule feedback, validation check candidates, accepted risks, or stale improvement items | `improvement-ledger` | `review-code-health` only if findings still need detection; `evidence-ledger` if readiness or resolution claims need evidence classification |
| Durable domain rule creation, update, stale review, contradiction handling, or promotion gates | `domain-rule-ledger` | `review-to-rule-compiler` first when extracting candidates from review or correction evidence |
| Extract domain rule candidates from review findings, human corrections, incidents, or rejected AI outputs | `review-to-rule-compiler` | `domain-rule-ledger` only when explicitly updating durable rules |
| MR/PR README, PR explanation, or durable change-context documentation | `mr-readme-generation` | `adr-review` |
| Repeated review context setup | `review-context-generation` | `repository-orientation` for repo facts before drafting context |
| Durable documentation knowledge extraction, freshness review, conflict routing, or target selection | `documentation-knowledge-compiler` | Route reusable review or implementation knowledge to context generation, domain rules to `domain-rule-ledger`, architecture decisions to `architecture-decision-memory` or `adr-review`, and task progress to handoff/planning |
| Claim validation | `evidence-ledger` | `doubt-driven-development` |
| End of work | `handoff-generation` | — |

5. Apply project overlay skill selection.
   - If a project overlay contains framework, domain, UI/UX, architecture, CI, data, security, or other repository-specific skills, consider them after generic workflow selection.
   - Select overlay skills only when the overlay signal applies to the selected work type.
   - Do not add project-specific skills to the generic routing table.
   - For stack-specific implementation overlays, follow `docs/stack-implementation-overlay-contract.md`. They may supplement `controlled-implementation` and `test-first-verification`, but must not replace the generic workflow.

6. State what is intentionally skipped.

7. Apply overlays before action.
   - Risk overlay: if any task involves destructive, external, production, auth, secret, dependency, migration, billing, email, or infra impact, run `risk-gate` before the selected workflow proceeds to action.
   - Evidence overlay: use `evidence-ledger` whenever the response makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

8. Preserve review gate minimality.
   - When routing to `review-router`, require the layer applicability contract to include evidence-backed `required`, `skipped`, or `insufficient evidence` status for each layer.
   - Missing changed-file, diff, context, output, or verification evidence must be reported as `insufficient evidence`, not as a skipped gate.
   - Required gates not present in executed gate evidence must be reported as under-processing.
   - Heavy gates selected without trigger signals must be reported as over-processing warnings.
   - Do not select every review gate by default.

9. Continue into the selected primary workflow unless the task requires user approval.

## Output

Emit or update one shared `Execution Envelope` following `docs/execution-envelope-contract.md`. The fields below are envelope data; do not emit them again as separate route sections.

```text
Execution Envelope:
- route: include work mode, operating mode, user-facing route, and internal route
- evidence status: include checked and missing evidence
- stop reason: include status, details, human decision required, and stop-if condition
- next action: one concrete work action
- metrics event candidate: omit unless explicitly enabled or requested

Selected workflow:
- Primary:
- Secondary:
- Project overlay skills:
- Skipped:
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

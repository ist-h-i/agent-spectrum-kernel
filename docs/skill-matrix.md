# Skill Matrix

This matrix is a reference view of the canonical runtime routes in `skills/skill-router/SKILL.md`. If they differ, update this file to mirror the skill router instead of treating this table as a separate source of truth.

| Situation | Primary skill | Secondary skill | Expected output |
|---|---|---|---|
| Unsure which workflow applies | `skill-router` | — | Selected workflow and skipped workflows |
| First task in unfamiliar repo | `repository-orientation` | `scope-control` if target boundary is unclear; `planning-with-files` only if the task spans sessions/agents or durable state is needed | Repo map, commands, conventions, risks |
| Ambiguous design / “grill me” or under-specified plan | `grill-design` | `grill-with-docs` if docs/domain/ADR terms matter; then `spec-driven-development` only after design boundary and acceptance criteria are stable | Design decision summary, stable boundary, and acceptance criteria before spec |
| Plan must fit docs/domain/ADRs | `grill-with-docs` | `adr-review` | Term/doc conflict review and documentation decision |
| Application boundary decision needed before implementation, including dependency direction, state ownership, external I/O boundary, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundary, or architecture guard rollout | `application-boundary-architecture` | Return to `spec-driven-development` or `controlled-implementation` after the boundary decision; use `adr-review` if hard-to-reverse or record-worthy | Boundary decision, violations, smallest compatible change, and verification path |
| Repeated implementation context setup | `implementation-context-generation` | `repository-orientation` for repo facts before drafting context | Durable implementation context with evidence-status-labeled stack, commands, patterns, boundaries, overlays, stop conditions, and update triggers |
| New feature or user-visible behavior | `spec-driven-development` | `test-first-verification` for Verification Contract -> `controlled-implementation` -> `test-first-verification` for evidence | Spec, Verification Contract, scoped implementation, verification evidence |
| Clear non-trivial implementation | `controlled-implementation` | `test-first-verification` for Verification Contract before behavior changes when proof is needed | Implementation Contract, scoped implementation summary, and verification evidence when applicable |
| Multi-step task likely to span sessions | `planning-with-files` | `handoff-generation` | Durable planning state and next task |
| Risk of scope creep/refactor sprawl | `scope-control` | `controlled-implementation` if proceeding to code; review phase uses `review-router` -> required gates, with scope findings generally routed to `review-ai-quality` | Scope contract, scoped implementation path, or review route |
| Bug, regression, or unknown root cause | `doubt-driven-development` | `test-first-verification` for reproduction and Verification Contract -> `controlled-implementation` -> `test-first-verification` for regression proof | Hypothesis, reproduction evidence, Verification Contract, scoped fix, regression proof |
| Hard-to-reverse architecture decision or ADR need | `adr-review` | `grill-with-docs`; `application-boundary-architecture` if boundary mechanics are unresolved | ADR action and decision record |
| PR/diff/commit review | `review-router` | `review-architecture-impact` when structural or boundary impact may exist; `review-output-quality` when consumer-facing or machine-consumed output may change; `review-adversarial-risk` when severe failure paths or blast radius may exist; `review-final-merge-gate` for the final decision | Layer applicability, required gates, gate evidence, and merge decision |
| Repeated review context setup | `review-context-generation` | `repository-orientation` for repo facts before drafting context | Durable review context with evidence-status-labeled claims |
| MR/PR README, PR explanation, or durable change-context documentation | `mr-readme-generation` | `adr-review` | Durable change context for human review and future AI reuse |
| Performance/security/reliability/readiness claim | `evidence-ledger` | `doubt-driven-development` | Claim/evidence/status table |
| End of work or passing to another agent | `handoff-generation` | `evidence-ledger` | Executable next task and residual risk |

## Routing rule

Use the smallest workflow that reduces real risk. Do not invoke a skill because its name matches a keyword. Invoke it because the task has the corresponding uncertainty, evidence gap, or failure mode.

## Routing overlays

Project overlay:
After generic workflow selection, consider framework/domain-specific project overlay skills when the overlay signal applies. Do not add project-specific skills to the generic routing table.

Risk overlay:
If any task involves destructive, external, production, auth, secret, dependency, migration, billing, email, or infra impact, run `risk-gate` before the selected workflow proceeds to action.

Evidence overlay:
Use `evidence-ledger` whenever the response makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

## Common chains

```text
New feature:
spec-driven-development -> test-first-verification for Verification Contract -> controlled-implementation -> test-first-verification for evidence

Bug:
doubt-driven-development -> test-first-verification for reproduction and Verification Contract -> controlled-implementation -> test-first-verification for regression proof

Design:
grill-design -> grill-with-docs -> adr-review when needed

Application boundary:
application-boundary-architecture -> adr-review when the decision is hard to reverse or should be recorded

Review:
review-router -> layer applicability -> required gates, including review-architecture-impact, review-output-quality, and review-adversarial-risk when needed -> review-final-merge-gate

Review context:
review-context-generation -> docs/ai/review-context.md

Implementation context:
implementation-context-generation -> docs/ai/implementation-context.md

MR/PR change-context README:
mr-readme-generation -> adr-review when hard-to-reverse decisions appear

Risky operation:
risk-gate -> selected workflow when approved, or handoff-generation when action needs approval
```

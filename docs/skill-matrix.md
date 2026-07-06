# Agent Spectrum Kernel Skill Matrix

This matrix is a reference view of the Agent Spectrum Kernel layered runtime routes in `skills/operating-mode-router/SKILL.md` and the delivery/quality routes in `skills/skill-router/SKILL.md`. If they differ, update this file to mirror the routers instead of treating this table as a separate source of truth.

## User-Facing Entry Routes

Start from what the user wants to do. The internal route can name skills, but the normal user-facing explanation should name the work mode and next action.

| User wants to... | Say this | Selected work mode | System should route to... |
|---|---|---|---|
| Move a ticket forward | このチケットを進めて | 要件確認 / 実装準備 / 実装 | requirement / work package / implementation route |
| Review a PR, diff, design, or output | このPRをレビューして | レビュー | review-router and required gates |
| Investigate a bug or uncertainty | このバグを調べて | 調査 | doubt-driven-development and verification route |
| Refine a requirement, design, architecture, or decision | この設計を詰めて | 要件確認 / 設計 | requirement / design / architecture route |
| Prepare work for an agent | Codexに渡せる形にして | 実装準備 | work-package route |
| Document or hand off state | この状態を整理して | ドキュメント整理 | documentation / handoff route |
| Preserve a review lesson | この指摘を次に活かして | 知識蓄積 | finding / ledger / documentation route |

Route outputs should include `Selected work mode`, `User-facing route`, `Internal route`, `Route confidence`, `Evidence checked`, `Missing evidence`, `Human decision required`, and a work-term `Next action`.

## Operating Mode Routes

| Operating mode | Use when | Primary route | Expected output |
|---|---|---|---|
| `mode_routing` | The request may be delivery, adoption, observability, or operation work | `operating-mode-router` | Selected operating mode and delegated route |
| `delivery_quality` | Concrete implementation, review, verification, refactor, investigation, docs, decision, or handoff task | `skill-router` | Smallest delivery/quality workflow |
| `adoption_bootstrap` | First-time project, repo, team, or client rollout | `project-adoption-pack-generation` | Adoption pack, overlay/context drafts, missing decisions |
| `observability_metrics` | One-task workflow retrospective, multi-task adoption measurement, or full-layer capability evaluation | `skill-effectiveness-evaluation`, `skill-adoption-metrics`, or `engineering-capability-evaluation` | Evidence-backed effectiveness evaluation, adoption metrics, or reusable capability evaluation |
| `operation_automation` | Weekly/monthly summaries, scheduling, or recurring reporting cadence | External operation layer plus templates | Manual routine, automation plan, or report output |

`operation_automation` is an external cadence layer. It can be manual, ChatGPT automation, GitHub Actions, cron, or a team routine. It is not represented as a separate delivery skill in this repository.

## Detailed Workflow Routes

| Situation | Primary skill | Secondary skill | Expected output |
|---|---|---|---|
| Unsure which operating mode applies | `operating-mode-router` | selected mode-specific route | Selected operating mode and delegated workflow |
| Delivery/quality workflow is unclear after mode selection | `skill-router` | — | Selected delivery/quality workflow and skipped workflows |
| First-time project rollout or adoption pack | `project-adoption-pack-generation` | `repository-orientation`; `implementation-context-generation`; `review-context-generation` | Adoption pack with project overlay draft, context drafts, first recipes, and missing decisions |
| First task in unfamiliar repo | `repository-orientation` | `scope-control` if target boundary is unclear; `planning-with-files` only if the task spans sessions/agents or durable state is needed | Repo map, commands, conventions, risks |
| Next high-value change candidate discovery from repo evidence | `next-best-change-finder` | `requirement-grill` by default before any implementation scope | Ranked candidates with evidence, confidence, falsification conditions, and route |
| Vague business intent, success condition, responsibility boundary, or domain rule impact | `requirement-grill` | `domain-rule-ledger` only to consume confirmed/verified rules; then `work-package-compiler`, `grill-design`, or `spec-driven-development` | Requirement Contract with decision boundary and next route |
| Confirmed Requirement Contract needs agent-ready packaging | `work-package-compiler` | `review-domain-impact` as a required review gate when domain rules or business behavior are involved | Work Package with scope, verification contract, risk gates, agent prompt, and reviewer checklist |
| Ambiguous design / “grill me” or under-specified plan | `grill-design` | `grill-with-docs` if docs/domain/ADR terms matter; then `spec-driven-development` only after design boundary and acceptance criteria are stable | Design decision summary, stable boundary, and acceptance criteria before spec |
| Plan must fit docs/domain/ADRs | `grill-with-docs` | `adr-review` | Term/doc conflict review and documentation decision |
| Application boundary decision needed before implementation, including dependency direction, state ownership, external I/O boundary, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundary, or architecture guard rollout | `application-boundary-architecture` | Return to `spec-driven-development` or `controlled-implementation` after the boundary decision; use `adr-review` if hard-to-reverse or record-worthy | Boundary decision, violations, smallest compatible change, and verification path |
| Reusable implementation pattern creation, refresh, deprecation, or contradiction | `engineering-pattern-ledger` | `controlled-implementation`, `application-boundary-architecture`, stack overlays, and review gates consume matching entries by evidence status | Pattern entry with source, evidence status, accepted shape, rejected alternatives, review impact, verification expectation, and stale trigger |
| Reusable verification expectation creation, refresh, deprecation, or contradiction | `verification-pattern-ledger` | `test-first-verification`, `work-package-compiler`, `review-automated-gate`, `review-final-merge-gate`, and `release-readiness-gate` consume matching entries | Verification pattern with required evidence, focused commands, negative cases, regression history, flaky areas, and stale trigger |
| Reusable architecture or boundary decision memory below ADR level | `architecture-decision-memory` | `adr-review` when formal ADR action is needed; `application-boundary-architecture` when mechanics are unresolved; `review-architecture-impact` when reviewing diffs | Architecture memory with alternatives, accepted option, tradeoffs, consequences, evidence status, related ADR, and revisit condition |
| Repeated implementation context setup | `implementation-context-generation` | `repository-orientation` for repo facts before drafting context | Durable implementation context with evidence-status-labeled stack, commands, patterns, boundaries, overlays, stop conditions, and update triggers |
| New feature or user-visible behavior | `spec-driven-development` | `test-first-verification` for Verification Contract -> `controlled-implementation` -> `test-first-verification` for evidence | Spec, Verification Contract, scoped implementation, verification evidence |
| Clear non-trivial implementation | `controlled-implementation` | `test-first-verification` for Verification Contract before behavior changes when proof is needed | Implementation Contract, scoped implementation summary, and verification evidence when applicable |
| Approved behavior-preserving refactor implementation | `refactor-implementation` | `test-first-verification` for regression proof; `application-boundary-architecture` first if responsibility, dependency direction, public contract, schema, UI behavior, or ownership boundaries may move; `improvement-ledger` for follow-up debt or prevention candidates | Refactor objective, behavior-preservation contract, allowed/forbidden scope, boundary decision, regression evidence, and before/after structure; ambiguous candidates get a smallest-safe-target proposal before editing |
| Multi-step task likely to span sessions | `planning-with-files` | `handoff-generation` | Durable planning state and next task |
| Risk of scope creep/refactor sprawl | `scope-control` | `controlled-implementation` if proceeding to code; review phase uses `review-router` -> required gates, with scope findings generally routed to `review-ai-quality` | Scope contract, scoped implementation path, or review route |
| Bug, regression, or unknown root cause | `doubt-driven-development` | `test-first-verification` for reproduction and Verification Contract -> `controlled-implementation` -> `test-first-verification` for regression proof | Hypothesis, reproduction evidence, Verification Contract, scoped fix, regression proof |
| Hard-to-reverse architecture decision or ADR need | `adr-review` | `grill-with-docs`; `application-boundary-architecture` if boundary mechanics are unresolved | ADR action and decision record |
| PR/diff/commit review | `review-router` | `review-code-health` when debt, smell, refactor, dependency/tooling, or repeated-finding analysis is applicable; `review-architecture-impact` when structural or boundary impact may exist; `review-output-quality` when consumer-facing or machine-consumed output may change; `review-adversarial-risk` when severe failure paths or blast radius may exist; `review-final-merge-gate` for the final decision; `improvement-ledger` only when non-blocking follow-up needs durable tracking | Layer applicability, required gates, gate evidence, merge decision, and optional improvement-ledger candidates / rule feedback / deferred code-health risks when applicable |
| Repeated or high-impact review findings should become prevention knowledge | `review-finding-compiler` | Route domain/business rules to `review-to-rule-compiler`; non-blocking work to `improvement-ledger`; implementation and verification lessons to their ledgers | Review rule candidate, prevention target, current PR blocker policy, false-positive risk, suppression rule, and durable routing |
| Domain behavior or business-rule review | `review-domain-impact` | `review-router` selects it when domain impact may exist; `review-to-rule-compiler` after review only for rule candidates | Domain input sources, domain rule checks, AI-verifiable checks, human decision points, and domain impact decision |
| Technical debt / code smell / refactor candidate review | `review-router` | `review-code-health`; specialized gates only when findings cross into architecture, adversarial, risk, or evidence concerns | Evidence-backed code-health findings with category, severity, urgency, recommended action, scope guidance, and AI-rule feedback |
| Persist non-blocking review findings / debt / rule feedback | `improvement-ledger` | `review-code-health` only if findings still need detection; `evidence-ledger` if readiness or resolution claims need evidence classification | Ledger entries with ID, source, evidence, impact, decision, prevention target, owner/status, refresh rule, and close condition |
| Convert repeated findings into prevention rules or checks | `improvement-ledger` | `evidence-ledger` if repeat pattern, readiness, or conversion claims need evidence classification | Prevention-rule feedback with repeat pattern, target, proposed rule/check, evidence, scope, and convert/defer/reject/needs-more-evidence decision |
| Durable domain rule creation, update, stale review, contradiction handling, or promotion gates | `domain-rule-ledger` | `review-to-rule-compiler` first when extracting candidates from reviews or corrections | Domain rule ledger update with evidence status, promotion decision, stale/contradiction handling, and consumers to refresh |
| Extract domain rule candidates from reviews, human corrections, incidents, or rejected AI outputs | `review-to-rule-compiler` | `domain-rule-ledger` only when explicitly updating durable rules | Rule extraction with candidates, updated/contradicted/deprecated rules, evidence status, and required human confirmation |
| Evaluate whether selected skills helped one completed task | `skill-effectiveness-evaluation` | `evidence-ledger` if claims need evidence status | Routing quality, outcome value, evidence quality, overhead, missed coverage, and follow-up recommendation |
| Track adoption maturity and impact over multiple tasks | `skill-adoption-metrics` | `skill-effectiveness-evaluation` only for one-task examples inside the period | Instruction maturity, skill usage maturity, task outcomes, maturity movement, privacy note |
| Evaluate full-layer engineering capability growth | `engineering-capability-evaluation` | `skill-effectiveness-evaluation` for one-task examples; `skill-adoption-metrics` for period evidence | Capability level by area, evidence source/status, strengths, failures, human dependency, reusable assets, reliability signals, and next improvement candidate |
| Repeated review context setup | `review-context-generation` | `repository-orientation` for repo facts before drafting context | Durable review context with evidence-status-labeled claims |
| Durable documentation knowledge extraction, freshness review, conflict routing, or target selection | `documentation-knowledge-compiler` | Route review or implementation knowledge to context generation, domain rules to `domain-rule-ledger`, architecture decisions to `architecture-decision-memory` or `adr-review`, and task progress to handoff/planning | Documentation knowledge entry with evidence status, freshness status, conflicts, consumers, recommended target, and stale trigger |
| MR/PR README, PR explanation, or durable change-context documentation | `mr-readme-generation` | `adr-review` | Durable change context for human review and future AI reuse |
| Release candidate or bundled change-set readiness | `release-readiness-gate` | `risk-gate` before deploy, publish, migration, external notification, or release execution; `review-final-merge-gate` remains the PR-level decision gate | Release readiness decision, required release conditions, residual risks, and evidence reviewed |
| Performance/security/reliability/readiness claim | `evidence-ledger` | `doubt-driven-development` | Claim/evidence/status table |
| Opt-in metrics event recording | normal delivery/review skill output | `skill-adoption-metrics` consumes the event later | Metrics event candidate with counts, related IDs, evidence references, and privacy note |
| Weekly/monthly adoption report | operation layer | `skill-adoption-metrics` plus `docs/ai/adoption-report-template.md` | Period summary without creating a reporting skill |
| Claude Code project-local adoption | `project-adoption-pack-generation` when first-time rollout; otherwise adapter install script | `docs/observability-runtime-contract.md`; `docs/operation-automation-contract.md`; local hooks | Core skills projected to `.claude/skills/`, local hooks enabled, no external publication by default |
| Pattern B `@claude review` PR adapter | external operation layer template | `risk-gate` before enabling secrets/workflow; `review-router`; `review-final-merge-gate` | Optional user-triggered PR review, not always-on PR review |
| End of work or passing to another agent | `handoff-generation` | `evidence-ledger` | Executable next task and residual risk |

## Routing rule

Use the smallest workflow that reduces real risk. Do not invoke a skill because its name matches a keyword. Invoke it because the task has the corresponding uncertainty, evidence gap, or failure mode.

Start with `operating-mode-router` when the request could be adoption, observability, or operation work. Start directly with `skill-router` when the request is already clearly delivery/quality work.

## Routing overlays

Project overlay:
After generic workflow selection, consider framework/domain-specific project overlay skills when the overlay signal applies. Do not add project-specific skills to the generic routing table.

Stack implementation overlay:
Follow `docs/stack-implementation-overlay-contract.md`. Stack overlays are optional, stack-signal driven supplements that feed constraints into `controlled-implementation` and verification supplements into `test-first-verification`; they do not replace the generic workflow.

Available concrete stack overlay:
`angular-implementation-architecture` for Angular components, routes, providers, templates, forms, Signals/RxJS, DOM/security, SSR/hydration, Angular tests, CLI, migrations, and Angular tooling.

Risk overlay:
If any task involves destructive, external, production, auth, secret, dependency, migration, billing, email, or infra impact, run `risk-gate` before the selected workflow proceeds to action.

Evidence overlay:
Use `evidence-ledger` whenever the response makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

Full-layer memory overlay:
Use engineering, verification, review, documentation, architecture, and capability ledgers only when active matching entries materially affect the selected workflow. Template, stale, archived, missing, contradicted, or hypothesis entries are not enforcement evidence.

## Common chains

```text
Operating mode:
operating-mode-router -> delivery_quality | adoption_bootstrap | observability_metrics | operation_automation

New feature:
spec-driven-development -> test-first-verification for Verification Contract -> controlled-implementation -> test-first-verification for evidence

Requirement-to-Rule Loop:
next-best-change-finder -> requirement-grill -> work-package-compiler -> review-domain-impact -> review-to-rule-compiler -> domain-rule-ledger

Bug:
doubt-driven-development -> test-first-verification for reproduction and Verification Contract -> controlled-implementation -> test-first-verification for regression proof

Safe refactor:
refactor-implementation -> test-first-verification for regression proof -> improvement-ledger for follow-up debt or prevention candidates when needed

Design:
grill-design -> grill-with-docs -> adr-review when needed

Application boundary:
application-boundary-architecture -> adr-review when the decision is hard to reverse or should be recorded

Full-layer reusable intelligence:
engineering-pattern-ledger / verification-pattern-ledger / review-finding-compiler / documentation-knowledge-compiler / architecture-decision-memory -> selected implementation, verification, review, documentation, or architecture workflow by evidence status

Review:
review-router -> layer applicability -> required gates, including review-code-health, review-architecture-impact, review-output-quality, and review-adversarial-risk when needed -> review-final-merge-gate -> improvement-ledger for non-blocking debt/rule feedback when needed

Improvement ledger:
review-code-health findings or final-gate improvement candidates -> improvement-ledger -> separate PR, backlog, rule/check feedback, accepted risk, or stale review

Project adoption:
operating-mode-router -> project-adoption-pack-generation -> repository-orientation / implementation-context-generation / review-context-generation as needed

Skill effectiveness:
operating-mode-router -> skill-effectiveness-evaluation -> prompt recipe / validation / overlay / context / skill follow-up when evidence supports it

Adoption metrics:
opt-in Metrics event candidates -> skill-adoption-metrics -> project-local docs/ai/skill-adoption-metrics.md

Capability evaluation:
evidence-backed ledger/context/review/verification/adoption evidence -> engineering-capability-evaluation -> docs/ai/engineering-capability-ledger.md

Claude local observability:
Claude project adapter or plugin -> local hooks -> docs/ai/metrics/events.jsonl -> ai-metrics-summarize -> docs/ai/reports/

Pattern B PR review:
@claude review comment -> optional GitHub Actions adapter -> review-router -> layer applicability -> required gates -> review-final-merge-gate

Adoption reports:
operation_automation layer -> skill-adoption-metrics period summary -> docs/ai/adoption-report-template.md

Prevention rule feedback:
repeated or high-leverage improvement-ledger findings -> improvement-ledger prevention-rule feedback -> AGENTS.md, CUSTOM_INSTRUCTIONS.md, project overlay, SKILL.md, review checklist, validation script, lint/test/check, implementation context, or review context proposal

Review context:
review-context-generation -> docs/ai/review-context.md

Implementation context:
implementation-context-generation -> docs/ai/implementation-context.md

MR/PR change-context README:
mr-readme-generation -> adr-review when hard-to-reverse decisions appear

Release readiness:
release candidate scope + validation + rollback + monitoring + post-release verification + approvals -> release-readiness-gate -> risk-gate before any deploy, publish, migration, external notification, or release execution

Risky operation:
risk-gate -> selected workflow when approved, or handoff-generation when action needs approval
```

# Agent Spectrum Kernel Routing Model

Agent Spectrum Kernel routes in two layers:

```text
operating-mode-router
  -> delivery_quality
      -> skill-router
      -> review-router when review

  -> adoption_bootstrap
      -> project-adoption-pack-generation
      -> repository-orientation
      -> implementation-context-generation
      -> review-context-generation

  -> observability_metrics
      -> skill-effectiveness-evaluation
      -> skill-adoption-metrics
      -> engineering-capability-evaluation

  -> operation_automation
      -> manual routine / ChatGPT automation / GitHub Actions / cron / team routine
```

`skills/operating-mode-router/SKILL.md` is the procedural source for top-level operating-mode routing. `skills/skill-router/SKILL.md` remains the procedural source for delivery/quality routing for concrete development work.

## Machine-Readable Routing Manifest

`manifest.json.routing` is a machine-readable defaults / validation mirror for routing vocabulary in this document, `AGENTS.md`, `skills/operating-mode-router/SKILL.md`, and `skills/skill-router/SKILL.md`. It is not the procedural routing source.

Responsibility split:

| Surface | Responsibility |
|---|---|
| `skills/operating-mode-router/SKILL.md` | Procedural source for top-level operating-mode routing. |
| `skills/skill-router/SKILL.md` | Procedural source for delivery/quality routing. |
| `manifest.json.routing` | Machine-readable defaults / validation mirror for route references, override checks, risk-gate surfaces, and adapter capability downgrade checks. |
| `docs/routing-model.md` | Human-readable routing model and explanation. |

It is for:

- default route selection,
- route-reference validation,
- route-override reason checks,
- risk-gate trigger visibility,
- unsupported adapter capability downgrade checks.

It is not for:

- replacing human-readable `SKILL.md` procedures,
- acting as a workflow engine,
- forcing one command path,
- blocking adjacent repository inspection,
- blocking read-only investigation or local verification,
- turning route mismatch into an automatic work blocker.

Route override remains allowed when the agent records the default route, selected route, and reason. The exception is a true required `risk-gate`; risky action approval cannot be bypassed by route override.

## User-Facing Work Modes

Users do not need to know skill names to start work. The default surface is a small set of work intents; routers translate those intents into internal routes.

| User-facing intent | Example request | Selected work mode | Internal route family |
|---|---|---|---|
| 進める / proceed with this ticket or task | このチケットを進めて | 要件確認 / 実装準備 / 実装 | requirement, work package, implementation |
| レビューする / review a PR, diff, design, or output | このPRをレビューして | レビュー | review-router and required gates |
| 調べる / investigate a bug, regression, or uncertainty | このバグを調べて | 調査 | doubt-driven-development and verification |
| 詰める / refine requirement, design, architecture, or decision | この設計を詰めて | 要件確認 / 設計 | requirement, design, architecture |
| 作業化する / convert to agent-ready work | Codexに渡せる形にして | 実装準備 | work-package |
| 整理する / document, summarize, or hand off | この状態を整理して | ドキュメント整理 | documentation, handoff |
| 活かす / preserve review findings or corrections | この指摘を次に活かして | 知識蓄積 | finding, ledger, documentation |

Default route output uses one shared Execution Envelope. The envelope separates user-facing work terms from internal routing and is emitted once per meaningful workflow boundary:

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "要件確認", "operating_mode": "delivery_quality", "user_facing": "要件とrepo根拠を確認する", "internal": { "primary": "requirement-grill" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "create the implementation package"
}
```

The user-facing route should not require skill-name knowledge. Skill names remain visible in `route.internal` for review, debugging, and advanced usage. Chained skills append their domain artifact and update the existing envelope instead of reproducing its fields.

## Full-layer Engineering Intelligence

Full-layer intelligence is modeled as narrow lanes. Durable ledgers and memory files are evidence sources for selected workflows, not autonomous decision makers and not mandatory inputs for every task.

```text
Domain Intelligence:
  requirement-grill / domain-rule-ledger / review-domain-impact

Engineering Intelligence:
  engineering-pattern-ledger / controlled-implementation / implementation-context-generation

Verification Intelligence:
  verification-pattern-ledger / test-first-verification / review-automated-gate

Review Intelligence:
  review-finding-compiler / review-router / review gates / improvement-ledger

Documentation Intelligence:
  documentation-knowledge-compiler / review-context-generation / implementation-context-generation / adr-review / handoff-generation

Architecture Intelligence:
  architecture-decision-memory / application-boundary-architecture / adr-review / review-architecture-impact

Capability Intelligence:
  engineering-capability-evaluation / skill-effectiveness-evaluation / skill-adoption-metrics
```

Routing rules:

- Do not load every ledger for every task.
- Use ledgers only when they materially affect the selected workflow.
- Treat template, archived, stale, missing, or contradicted ledgers as missing or insufficient evidence for current constraints.
- Hypothesis entries can guide questions, not enforcement.
- Current task verification and review gates remain required even when ledger guidance exists.
- Project overlays and ADRs remain canonical for their own responsibilities; ledgers may reference or propose updates, not overwrite them.

## Requirement-to-Rule Loop

For business decision support and durable domain-rule learning, use explicit lanes instead of merging every step into implementation or review:

```text
Decision lane:
  next-best-change-finder
  -> requirement-grill
  -> human decision
  -> Requirement Contract

Compilation lane:
  Requirement Contract
  -> work-package-compiler
  -> agent task

Verification lane:
  Work Package + PR
  -> review-domain-impact
  -> required review gates

Learning lane:
  review findings / human corrections
  -> review-to-rule-compiler
  -> domain-rule-ledger
  -> future requirement-grill / domain review
```

Routing rules:

- `next-best-change-finder` generates candidate changes, not implementation authorization.
- `requirement-grill` is decision support and must not convert unresolved business assumptions into tasks.
- `work-package-compiler` transforms a confirmed Requirement Contract into agent-ready task scope.
- `review-domain-impact` verifies changes against existing requirements, Work Packages, and confirmed or verified domain rules.
- `review-to-rule-compiler` extracts and promotes domain rule candidates without auto-confirming them.
- `domain-rule-ledger` stores evidence-status-labeled rules with stale triggers and contradiction handling.

Claude Code adapters follow the same model:

- project-local `.claude/skills` and local hooks are adapter/runtime projection, not new core workflow logic,
- local observability is project-local by default,
- Pattern B `@claude review` GitHub Actions is an optional operation-layer PR-sharing adapter,
- external publication and workflow/secrets enablement remain risk-gated.

## Mode Definitions

| Mode | Purpose | Typical request | Route |
|---|---|---|---|
| `mode_routing` | Select the top-level operating layer | "Which workflow should this use?" | `operating-mode-router` |
| `delivery_quality` | Implement, review, verify, refactor, investigate, document, decide, or hand off a concrete development task | "Implement this", "Review this PR", "Investigate this bug" | `skill-router`; `review-router` for review |
| `adoption_bootstrap` | Introduce the skill set into a new repository, project, team, or client site | "Create an adoption pack", "Apply this skill set to this repo" | `project-adoption-pack-generation` and context-generation skills |
| `observability_metrics` | Evaluate workflow effectiveness, skill adoption, or reusable capability growth over time | "Was this skill selection effective?", "Measure adoption maturity", "Evaluate full-layer capability" | `skill-effectiveness-evaluation`; `skill-adoption-metrics`; `engineering-capability-evaluation` |
| `operation_automation` | Run or schedule recurring summaries and routines | "Summarize weekly", "Run monthly adoption report" | External operation layer and report templates |

## Manifest Groups

`manifest.json.skill_groups` mirrors the mode model without moving directories.

Required groups:

```text
mode_routing
delivery_quality
adoption_bootstrap
observability_metrics
operation_automation
```

`operation_automation` may be empty because scheduling is intentionally outside the generic skill set. It can be manual, ChatGPT automation, GitHub Actions, cron, or a team routine.

Some skills can belong to more than one group when their role is shared across delivery and adoption. Those exceptions must be listed in `manifest.json.allowed_multi_group_skills` and are validated by `scripts/validate-repo.mjs`.

## Responsibility Planes

Operating modes describe why work is happening; planes describe the stable responsibility of each Skill. `manifest.json.skill_planes` assigns every canonical Skill to exactly one plane.

| Plane | Responsibility | Mutation boundary |
|---|---|---|
| `execution` | Advance the current requirement, design, implementation, verification, review, release-readiness, documentation, or handoff task. | May change current-task artifacts inside the selected scope. |
| `knowledge` | Create, promote, refresh, contradict, archive, or consume durable reusable knowledge. | Requires an explicit lifecycle trigger, destination, evidence boundary, owner, and stop condition. |
| `control` | Select, constrain, observe, or validate workflows and claims. | Observation or routing alone never authorizes execution or knowledge mutation. |

Allowed cross-plane transitions are machine-readable in `manifest.json.routing.cross_plane_transitions`. Execution may consume approved knowledge only when applicability and freshness are evidenced. Execution never writes a ledger merely because work completed. Review blockers remain current-task blockers until resolved or separately tracked; a durable candidate cannot replace them. Control-plane observations require a separately authorized knowledge contract before they can mutate a durable artifact.

## Projection Packs

`manifest.json.projection_packs` defines adapter-neutral availability profiles without replacing existing `skill_groups` or operating modes:

| Pack | Planes | Intended use |
|---|---|---|
| `daily_delivery` | execution + control | Smaller ordinary delivery surface; durable knowledge lifecycle Skills are omitted. |
| `organizational_intelligence` | execution + knowledge + control | Optional full surface for explicitly authorized organizational knowledge work. |

Both packs keep `knowledge_write_policy: explicit_only`. Claude and Codex expose them as `daily` and `organizational` profiles. Existing profiles remain supported for compatibility.

## Adapter Capability Gate

When an active Claude or Codex adapter state exists, routers use its `selected_skills` as the available route set. `installed_skills` reports physical discovery state and may be broader only for non-pack legacy/profile selections; it never authorizes a route. Before delegation, the router checks the intended Skill destination. An absent destination stops with `capability_missing`, names the missing Skill, and recommends the required profile or a closed explicit override. It does not guess the missing procedure.

For `daily`, ordinary implementation and review fixtures are available. Knowledge promotion, adoption, and observability fixtures intentionally stop with `capability_missing` and recommend `organizational`.

## Routing Rules

- Normal development tasks route to `delivery_quality` and then to `skill-router`.
- First-time rollout tasks route to `adoption_bootstrap` and then to `project-adoption-pack-generation`.
- One-task retrospective questions route to `observability_metrics` and then to `skill-effectiveness-evaluation`.
- Multi-task adoption measurement routes to `observability_metrics` and then to `skill-adoption-metrics`.
- Evidence-backed full-layer capability evaluation routes to `observability_metrics` and then to `engineering-capability-evaluation`.
- Weekly/monthly report generation is an operation cadence, not a separate delivery skill.
- Claude hook-first local observability records project-local summaries at task boundaries and remains separate from external publication.
- Scheduler setup, external notifications, publishing, deploys, and other external effects require `risk-gate` before action.

## Examples

```text
実装して
-> delivery_quality
-> skill-router
```

```text
このrepoにスキルセットを導入したい
-> adoption_bootstrap
-> project-adoption-pack-generation
```

```text
このSkill選択は良かったか
-> observability_metrics
-> skill-effectiveness-evaluation
```

```text
先月の採用メトリクスをまとめて
-> operation_automation for cadence
-> skill-adoption-metrics consumes the period data
-> report template shapes the output
```

## Non-Goals

- Do not physically reorganize `skills/` into group directories.
- Do not replace `skill-router`; narrow it to delivery/quality routing.
- Do not automatically run adoption or metrics workflows for ordinary development tasks.
- Do not select or update knowledge-plane Skills merely because their files are installed or a task completed.
- Do not create weekly/monthly reporting skills without a future explicit design.
- Do not add hidden telemetry or background metrics collection.
- Do not treat GitHub Actions as the default path for local work.
- Do not store raw prompts or publish metrics externally by default.

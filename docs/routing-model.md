# Operating Mode Routing Model

The repository now routes in two layers:

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

  -> operation_automation
      -> manual routine / ChatGPT automation / GitHub Actions / cron / team routine
```

`skills/operating-mode-router/SKILL.md` is the top-level mode router. `skills/skill-router/SKILL.md` remains the delivery/quality router for concrete development work.

## Mode Definitions

| Mode | Purpose | Typical request | Route |
|---|---|---|---|
| `mode_routing` | Select the top-level operating layer | "Which workflow should this use?" | `operating-mode-router` |
| `delivery_quality` | Implement, review, verify, refactor, investigate, document, decide, or hand off a concrete development task | "Implement this", "Review this PR", "Investigate this bug" | `skill-router`; `review-router` for review |
| `adoption_bootstrap` | Introduce the skill set into a new repository, project, team, or client site | "Create an adoption pack", "Apply this skill set to this repo" | `project-adoption-pack-generation` and context-generation skills |
| `observability_metrics` | Evaluate workflow effectiveness or skill adoption over time | "Was this skill selection effective?", "Measure adoption maturity" | `skill-effectiveness-evaluation`; `skill-adoption-metrics` |
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

## Routing Rules

- Normal development tasks route to `delivery_quality` and then to `skill-router`.
- First-time rollout tasks route to `adoption_bootstrap` and then to `project-adoption-pack-generation`.
- One-task retrospective questions route to `observability_metrics` and then to `skill-effectiveness-evaluation`.
- Multi-task adoption measurement routes to `observability_metrics` and then to `skill-adoption-metrics`.
- Weekly/monthly report generation is an operation cadence, not a separate delivery skill.
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
- Do not create weekly/monthly reporting skills without a future explicit design.
- Do not add hidden telemetry or background metrics collection.

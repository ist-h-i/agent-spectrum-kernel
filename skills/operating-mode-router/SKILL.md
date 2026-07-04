---
name: operating-mode-router
description: Select the operating mode before routing to delivery, adoption, observability, or operation workflows.
---

# Operating Mode Router

## Goal

Select the top-level operating mode before invoking a workflow router or skill.

This skill prevents ordinary delivery work from being polluted by adoption, metrics, or reporting routines. It routes first by operating layer, then delegates to the smallest relevant workflow inside that layer.

## Use when

- A non-trivial request may be delivery work, project rollout, workflow evaluation, adoption metrics, or periodic reporting.
- The user asks broadly and the correct layer is unclear.
- A task mentions introducing the skill set to a project, measuring skill effectiveness, measuring adoption, or weekly/monthly reporting.
- A tool or project overlay needs a stable first routing step before `skill-router`.

## Do not use when

- The request is a trivial localized edit that can stay in the kernel.
- The user explicitly names a relevant lower-level skill and there is no mode ambiguity or risk conflict.
- A delivery/quality task has already been routed into `skill-router` and no adoption, metrics, or operation signal appears.

## Inputs

- User request and task goal.
- Available repository context.
- Whether the request concerns a concrete development task, first-time rollout, retrospective evaluation, longitudinal adoption measurement, or recurring reporting.
- Known external, destructive, production, credential, or scheduling impact.

## Process

1. Classify the operating mode.

| Mode | Use when | Delegate to |
|---|---|---|
| `delivery_quality` | Implement, review, verify, refactor, investigate, document, decide, release-readiness check, or hand off a concrete development task | `skill-router`; `review-router` when review |
| `adoption_bootstrap` | Introduce the skill set into a new repository, project, team, or client context | `project-adoption-pack-generation`; `repository-orientation`; `implementation-context-generation`; `review-context-generation` |
| `observability_metrics` | Evaluate skill effectiveness, routing quality, instruction maturity, adoption impact, or skill usage over time | `skill-effectiveness-evaluation`; `skill-adoption-metrics` |
| `operation_automation` | Run or plan a periodic cadence such as weekly/monthly summaries, scheduler setup, or team routine | External operation layer; manual routine; ChatGPT automation; GitHub Actions; cron |

2. Distinguish close signals.
   - One completed task effectiveness question: route to `skill-effectiveness-evaluation`.
   - Multiple tasks or a period-over-period adoption question: route to `skill-adoption-metrics`.
   - First-time repository rollout: route to `project-adoption-pack-generation`.
   - Weekly/monthly cadence: classify as `operation_automation`, then use report templates or external scheduling outside the skill set.
   - Release candidate readiness: classify as `delivery_quality`, then route through `skill-router` to `release-readiness-gate`; release execution still requires `risk-gate`.
   - Ordinary coding/review/investigation/refactor work: route to `skill-router`.

3. Apply risk overlay before action.
   - If the request includes destructive, irreversible, external, production, auth, secret, dependency, migration, billing, email, infra, or scheduler changes, run `risk-gate` before action.
   - Creating local templates or docs is not the same as enabling automation.

4. Keep mode boundaries explicit.
   - Do not invoke adoption or metrics workflows for normal development tasks unless the user asks for adoption or metrics.
   - Do not create weekly/monthly skills for reporting cadence.
   - Do not store raw prompts, secrets, customer data, or project-specific metrics in the generic repository.

5. Delegate to the selected layer.
   - For `delivery_quality`, continue with `skill-router`.
   - For `adoption_bootstrap`, produce or delegate to an adoption pack workflow.
   - For `observability_metrics`, choose one metrics/evaluation skill.
   - For `operation_automation`, produce a safe operation plan, report-template instruction, or approval request; do not silently schedule jobs.

## Output

```text
Operating mode:
- delivery_quality | adoption_bootstrap | observability_metrics | operation_automation

Selected route:
- Primary:
- Secondary:
- External operation layer:

Reason:
- Decisive signal:
- What was intentionally not invoked:
- Risk overlay:

Next action:
- ...
```

## Exit criteria

- Exactly one operating mode is selected.
- The selected mode delegates to the smallest relevant workflow or external operation path.
- Normal delivery work remains routed through `skill-router`.
- Adoption and metrics workflows are opt-in by request or clear task signal.
- Weekly/monthly reporting is treated as an operation cadence, not as a delivery skill.
- Risky external or scheduled operations are stopped for explicit approval.

## Failure modes

| Failure | Correction |
|---|---|
| Treating `skill-router` as the universal router for adoption and metrics | Use this mode router first, then delegate delivery/quality to `skill-router`. |
| Running metrics for every task | Emit or analyze metrics only when adoption metrics are enabled or requested. |
| Creating a weekly/monthly reporting skill | Keep cadence in the operation layer and use report templates or external automation. |
| Classifying `operating-mode-router` as operation automation | Classify it as mode routing / orchestration. |
| Hiding scheduling side effects | Route scheduler setup through `risk-gate` and require approval. |

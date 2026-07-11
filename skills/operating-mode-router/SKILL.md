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
| `delivery_quality` | Implement, review, verify, refactor, investigate, document, decide, define requirements, compile work packages, govern domain rules, run release-readiness checks, or hand off a concrete development task | `skill-router`; `review-router` when review |
| `adoption_bootstrap` | Introduce the skill set into a new repository, project, team, or client context | `project-adoption-pack-generation`; `repository-orientation`; `implementation-context-generation`; `review-context-generation` |
| `observability_metrics` | Evaluate skill effectiveness, routing quality, instruction maturity, adoption impact, full-layer capability growth, or skill usage over time | `skill-effectiveness-evaluation`; `skill-adoption-metrics`; `engineering-capability-evaluation` |
| `operation_automation` | Run or plan a periodic cadence such as weekly/monthly summaries, scheduler setup, or team routine | External operation layer; manual routine; ChatGPT automation; GitHub Actions; cron |

2. Select the user-facing work mode.

| Work mode | Use when |
|---|---|
| `要件確認` | User intent, business meaning, success condition, or decision boundary must be clarified. |
| `実装準備` | A confirmed request needs packaging, verification planning, or scoped implementation preparation. |
| `実装` | The request asks to make a scoped change. |
| `レビュー` | The request asks to evaluate a PR, diff, design, generated output, or readiness. |
| `調査` | The request involves a bug, regression, uncertainty, or unknown root cause. |
| `ドキュメント整理` | The request asks to summarize, document, prepare a PR explanation, or hand off state. |
| `知識蓄積` | The request asks to preserve review findings, corrections, patterns, or rules for future work. |
| `運用整理` | The request asks for periodic reporting, scheduler setup, or external operation planning. |

User-facing route text should explain the work path in these terms. Skill names belong in `Internal route` for review and debugging.

3. Distinguish close signals.
   - One completed task effectiveness question: route to `skill-effectiveness-evaluation`.
   - Multiple tasks or a period-over-period adoption question: route to `skill-adoption-metrics`.
   - Evidence-backed full-layer engineering capability or reusable intelligence maturity question: route to `engineering-capability-evaluation`.
   - First-time repository rollout: route to `project-adoption-pack-generation`.
   - Weekly/monthly cadence: classify as `operation_automation`, then use report templates or external scheduling outside the skill set.
   - Release candidate readiness: classify as `delivery_quality`, then route through `skill-router` to `release-readiness-gate`; release execution still requires `risk-gate`.
   - Requirement-to-Rule Loop work for a concrete repository task: classify as `delivery_quality`, then route through `skill-router` to `next-best-change-finder`, `requirement-grill`, `work-package-compiler`, `review-domain-impact`, `review-to-rule-compiler`, or `domain-rule-ledger` as appropriate.
   - Ordinary coding/review/investigation/refactor work: route to `skill-router`.

4. Apply risk overlay before action.
   - If the request includes destructive, irreversible, external, production, auth, secret, dependency, migration, billing, email, infra, or scheduler changes, run `risk-gate` before action.
   - Creating local templates or docs is not the same as enabling automation.

5. Keep mode boundaries explicit.
   - Do not invoke adoption or metrics workflows for normal development tasks unless the user asks for adoption or metrics.
   - Do not create weekly/monthly skills for reporting cadence.
   - Do not store raw prompts, secrets, customer data, or project-specific metrics in the generic repository.

6. Delegate to the selected layer.
   - For `delivery_quality`, continue with `skill-router`.
   - For `adoption_bootstrap`, produce or delegate to an adoption pack workflow.
   - For `observability_metrics`, choose one metrics/evaluation skill.
   - For `operation_automation`, produce a safe operation plan, report-template instruction, or approval request; do not silently schedule jobs.

## Output

Emit one shared `Execution Envelope` following `docs/execution-envelope-contract.md`. Do not emit a second copy of its route, evidence, stop, or next-action fields in this skill output.

```text
Execution Envelope:
- route: include work mode, operating mode, user-facing route, and internal route
- evidence status: include checked and missing evidence
- stop reason: include status, details, human decision required, and stop-if condition
- next action: one concrete work action
- metrics event candidate: omit unless explicitly enabled or requested
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

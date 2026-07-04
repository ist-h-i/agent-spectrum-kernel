---
name: skill-effectiveness-evaluation
description: Evaluate whether selected skills improved a task outcome, identify missing or excessive workflow steps, and produce evidence-backed skill improvement recommendations.
---

# Skill Effectiveness Evaluation

## Goal

Evaluate whether selected skills and workflow gates improved a concrete task outcome, and identify missing or excessive workflow steps from evidence.

This skill is a retrospective evaluator for one task, PR, review, implementation, refactor, investigation, or adoption run. It does not replace PR review, final merge gate, or evidence ledger.

## Use when

- The user asks whether selected skills were effective.
- A completed task, PR, review, implementation, refactor, investigation, or adoption run needs retrospective evaluation.
- The team wants to understand whether `operating-mode-router`, `skill-router`, or `review-router` routing was appropriate.
- Output quality was lower than expected and the cause may be workflow selection, missing context, missing gates, or over-processing.
- A skill addition or modification needs effectiveness evidence from a real outcome.
- A project wants recommendations for prompts, recipes, overlays, validation, contexts, examples, or skill definitions based on observed work.

## Do not use when

- The task is still in progress and no output exists to evaluate.
- The user only wants a normal implementation, review, refactor, or adoption pack.
- There is no evidence of selected skills, outputs, decisions, checks, residual risks, or outcome quality.
- The question spans many tasks or adoption over time; use `skill-adoption-metrics`.
- The evaluation would require inventing facts about project outcomes.

## Required inputs

- User request or task goal.
- Selected operating mode, workflows, skills, and gates.
- Skipped skills and reasons when available.
- Output artifacts, diff, PR, review result, tests, CI, validation report, handoff, or adoption pack.
- Evidence of outcome quality, defects caught, defects missed, rework, blocked merge, validation result, or residual risk.
- Applicable project overlay, implementation context, review context, or improvement ledger entries.

## Process

1. Define the evaluated task.
   - Name the task, artifact, PR, review, or run.
   - Record which skills were used and which were intentionally skipped.
   - Separate observed evidence from missing evidence.

2. Score routing quality.
   - Check whether the primary workflow matched the task class and operating mode.
   - Check whether secondary skills were justified by risk, ambiguity, or evidence needs.
   - Check whether skipped skills were correctly skipped.

3. Evaluate outcome value.
   - Determine whether a skill produced a useful artifact, decision, scope boundary, verification plan, review finding, or handoff.
   - Identify risk, ambiguity, scope creep, missed verification, or review noise that was reduced.

4. Evaluate evidence quality.
   - Prefer executed tests, validation, CI, review evidence, diffs, artifacts, and explicit unknowns.
   - Downgrade claims that rely on intent, assumption, or inspection only.
   - Use `evidence-ledger` when readiness, correctness, reliability, security, performance, or no-regression claims need classification.

5. Evaluate overhead and missed coverage.
   - Mark steps that were too heavy for the task.
   - Mark missing gates, overlays, examples, validation checks, or context files that evidence shows would have helped.
   - Do not punish intentionally skipped skills without evidence of harm.

6. Recommend the narrowest improvement.
   - Choose one or more: update skill, update prompt recipe, update validation, update project overlay, update context, add improvement-ledger entry, update example, or no action.
   - Avoid rewriting skills based on one low-confidence example.

## Output

```text
Skill effectiveness evaluation:
- Task / PR / artifact reviewed:
- Skills used:
- Skills skipped:
- Evidence reviewed:

Scores:
- Routing quality: 0-100
- Output usefulness: 0-100
- Evidence quality: 0-100
- Risk reduction: 0-100
- Overhead control: 0-100
- Reuse value: 0-100

What worked:
- ...

What was excessive:
- ...

What was missing:
- ...

Defects or risks caught:
- ...

Defects or risks missed:
- ...

Recommended follow-up:
- update skill | update prompt recipe | update validation | update project overlay | update context | add improvement-ledger entry | update example | no action

Confidence:
- high | medium | low
```

## Exit criteria

- The evaluation is tied to one concrete task or artifact.
- Routing quality, outcome value, evidence quality, overhead, missed coverage, and reuse value are assessed separately.
- Findings cite reviewed evidence or are marked insufficient evidence.
- Recommendations are narrow and routed to the right artifact.
- The skill does not replace review gates, merge decisions, or evidence classification.

## Failure modes

| Failure | Correction |
|---|---|
| Evaluating a task with no outcome evidence | Return insufficient evidence and name required inputs. |
| Scoring people instead of workflows | Score workflow selection and artifacts only. |
| Treating every task as needing a retrospective | Use only when requested or when the outcome itself is under evaluation. |
| Rewriting a skill from one weak example | Recommend more evidence or a prompt/context update first. |
| Confusing adoption-over-time with one-task effectiveness | Route longitudinal questions to `skill-adoption-metrics`. |

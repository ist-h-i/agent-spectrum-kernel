---
name: skill-effectiveness-evaluation
description: Plan practical instruction-environment comparisons with AI recovery, then evaluate Skill effectiveness from recorded task outcomes and workflow evidence.
---

# Skill Effectiveness Evaluation

## Goal

Evaluate whether selected skills and workflow gates improved a concrete task outcome, and identify missing or excessive workflow steps from evidence.

This skill supports a bounded practical Eval and the retrospective evaluation of one task, PR, review, implementation, refactor, investigation, or adoption run. It does not replace PR review, final merge gate, formal benchmark scoring, external-outcome evaluation, adoption metrics, capability maturity, or evidence ledger.

Use `docs/skill-effectiveness-evaluation-contract.md`, `schemas/skill-effectiveness-outcome.schema.json`, the shared labels in `schemas/effectiveness-decision-vocabulary.schema.json`, and the semantic CLI in `scripts/skill-effectiveness-outcome.mjs`. These assets define `ask.skill-effectiveness-outcome@1.0.0`.

## Use when

- A user wants to select and run practical environment/Skill comparisons on their own tasks, or an ongoing Eval needs an AI decision about incomplete/failed evidence.
- The user asks whether selected skills were effective.
- A completed task, PR, review, implementation, refactor, investigation, or adoption run needs retrospective evaluation.
- The team wants to understand whether `operating-mode-router`, `skill-router`, or `review-router` routing was appropriate.
- Output quality was lower than expected and the cause may be workflow selection, missing context, missing gates, or over-processing.
- A skill addition or modification needs effectiveness evidence from a real outcome.
- A project wants recommendations for prompts, recipes, overlays, validation, contexts, examples, or skill definitions based on observed work.

## Do not use when

- The task is still in progress and no output exists to evaluate, unless the request is the practical Eval mode below.
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

## Practical Eval mode

Use [the practical Eval workflow](references/practical-evaluation.md)
and the existing pragmatic reporter. Do not create a second universal scoring
skill or apply the seven-dimension retrospective contract to each trial.

The AI owns purpose, case selection, interpretation and recovery judgments. The
runner owns exact approved inputs, execution/evidence, fresh attempt identities,
budgets and duplicate prevention. The human approves the Eval cases before
execution and the exact eventual application through the existing change gate.
An AI recovery decision is not a third human approval or permission to install.

1. Identify the real-work decision: which errors/rework matter, what benefit
   would justify a change, and which safety boundaries must remain. Pick a small
   useful set of representative positive/negative tasks, using actual feedback
   and observed cost where available. Explain omissions. Do not require a perfect
   dataset, a fixed ASK/private catalog, complete token telemetry or full-tree
   usage merely to begin a practical comparison.
2. Freeze case/input/criterion identities, condition context, repeat count,
   execution and retry budget in a practical plan. A user-owned executable check,
   supplied rubric/AI grader or explicitly unknown quality is allowed. Resource
   observations alone do not establish quality. Present the exact case packet to
   the human before dispatch.
3. For a standalone comparison, advance `scripts/practical-evaluation-cli.mjs`.
   For an improvement including individual asset authoring, composition or
   reviewed imports, use the component profile and supervised `operate` workflow
   in the linked reference. Set an explicit cycle budget; routine completion
   prepares the next cycle, with fresh case/change judgments. At `awaiting_ai_recovery`,
   read the packet and available evidence, choose an action and submit the
   structured assessment yourself; do not ask the human to perform routine
   recovery. A configured automatic assessor can perform this step as a worker.
   Use known data despite absent unrelated metrics. Prefer useful partial data,
   exclusion or reference use when more execution has little value.
4. A retry may target the affected trial or all conditions for that case. Choose
   according to fairness, the failure and practical purpose. Do not retry solely
   to obtain a better score or cherry-pick favorable outcomes. Keep original
   outcomes, reason, conditions, all attempts and comparison selection. A valid
   low-quality result is evidence, not by itself an execution failure.
5. Record comparison limits and the data actually used. If a prior process might
   still be active, do not authorize a duplicate or another trial root. Use
   read-only inspection; reference/exclude what is usable and publish a partial
   report while unresolved execution is explicitly recorded. A lost response is
   not permission to replay a consumed command.
6. Review the pragmatic report, including failures, Unknowns, retry/assessment
   overhead and possible selection bias. Relate benefits to the intended work.
   The formal retrospective below remains available when its evidence and
   catalog fit; `insufficient_evidence` for that contract is not an instruction
   to stop collecting or using useful practical evidence. Bring the resulting
   report to the existing human change/application decision.

Before that change judgment, resolve the exact baseline/candidate environments
and show the added, revised and excluded files, layer/version differences and
declared permissions/effects. Use the existing composition diff and Registry
inspection; do not ask the human to approve an opaque digest without its actual
content and consequences. Include received helper files in this review.

Keep the latest improvement result separate from the currently applied owner
anchor: a rejected candidate or a declined restoration does not change the
installed baseline. For lost final responses use the runtime's owned completion
inspection. Never infer completion from matching bytes alone, repeat an owner
write, or overwrite a local edit to make a saved plan fit. A no-op is a valid
outcome; do not manufacture a revision or an Eval simply to consume the budget.

Frozen historical `single_shot_v1` primary plans retain their contract and
original evidence. For a new practical evaluation use the new execution lane;
never remove old consumption records, rewrite a saved result, or pretend a fresh
attempt was the original primary execution.

## Process

1. Define the evaluated task.
   - Name the task, artifact, PR, review, or run.
   - Record which skills were used and which were intentionally skipped.
   - Separate observed evidence from missing evidence.

2. Record native-unit observations.
   - Record valid or missed findings, false positives, requirements, scope deviation, unsupported claims, route decisions, tokens, duration, tool calls, artifacts, agents, or measured human correction/rework only when the task evidence supports them.
   - Select the metric from the closed v1 workflow/artifact catalog in `schemas/skill-effectiveness-outcome.schema.json`; do not invent a metric, score, percentage, aggregate, ordinal, unit, definition, or dimension.
   - Bind each measurement to its catalog unit/definition, source, evidence references, claim status, and limitation.
   - Do not infer quality from tokens, duration, tool calls, artifacts, or agents.
   - Do not create an aggregate score, weighting, percentage, or implied precision.

3. Preserve missing evidence.
   - Record an unknown or unavailable value as `null`, with claim status `Unknown`, effect/impact `unknown`, and explicit measurement/effect limitations.
   - Never convert missing evidence to zero, neutral, retained, rejected, or omitted.

4. Derive effect before classification.
   - Keep measurement status separate from effect status. An observed resource value does not establish a neutral, beneficial, or burdensome effect.
   - For comparison metrics, require a same-unit reference value, positive materiality threshold, rule reference, and effect evidence. Let the contract compute the native-unit delta and impact.
   - Use the catalog-owned direct rule for guardrail violations; an observed direct measurement always establishes zero as neutral or nonzero as harmful from the same measurement evidence. Do not substitute a caller-defined rule, evidence status, evidence refs, or impact.
   - For comparison metrics, if effect evidence is absent, keep the effect `unknown` and classify that dimension as `insufficient_evidence`.

5. Build and validate the machine outcome.
   - Provide the bounded input to `node scripts/skill-effectiveness-outcome.mjs build <input.json|->`; do not hand-author derived effect, dimension, or recommendation fields.
   - Run `node scripts/skill-effectiveness-outcome.mjs validate <outcome.json|->` before consuming or reporting a machine outcome. A nonzero exit or nonempty `issues` array is invalid.

6. Classify the seven dimensions independently.
   - Check whether the primary workflow matched the task class and operating mode.
   - Check whether secondary skills were justified by risk, ambiguity, or evidence needs.
   - Check whether skipped skills were correctly skipped.
   - Determine whether a skill produced a useful artifact, decision, scope boundary, verification plan, review finding, or handoff.
   - Identify risk, ambiguity, scope creep, missed verification, or review noise that was reduced.
   - Prefer executed tests, validation, CI, review evidence, diffs, artifacts, and explicit unknowns.
   - Downgrade claims that rely on intent, assumption, or inspection only.
   - Apply `ask.claim-evidence-status@1.0.0` inline. Use `evidence-ledger` only when the evaluation independently audits multiple material claims, high-stakes readiness, cross-artifact evidence, or stable claim IDs.
   - Mark steps that were too heavy for the task.
   - Mark missing gates, overlays, examples, validation checks, or context files that evidence shows would have helped.
   - Do not punish intentionally skipped skills without evidence of harm.
   - Classify `outcome_quality`, `false_positive_control`, `safety`, `routing_quality`, `evidence_quality`, `overhead`, and `reuse_value` as `effective`, `neutral`, `excessive`, `harmful`, or `insufficient_evidence` from their bound observations.
   - Use `excessive` only for disproportionate overhead when outcome quality, false-positive control, and safety are non-inferior.

7. Derive the overall recommendation.
   - Any harmful dimension -> `stop`.
   - Otherwise any insufficient dimension -> `insufficient_evidence`.
   - Otherwise excessive overhead -> `simplify`.
   - Otherwise effective outcome quality, false-positive control, or safety -> `expand`.
   - Otherwise -> `retain`.
   - Routing, evidence, or reuse benefit alone cannot produce `expand`.

8. Recommend the narrowest improvement.
   - Choose one or more: update skill, update prompt recipe, update validation, update project overlay, update context, add improvement-ledger entry, update example, or no action.
   - Avoid rewriting skills based on one low-confidence example.
   - Scope the recommendation to the next similar task workflow and set `authority_implied: false`.

## Output

```text
Skill effectiveness evaluation:
- Task / PR / artifact reviewed:
- Skills used:
- Skills skipped:
- Evidence reviewed:

Native observations:
- Observation ID / dimension:
- Metric / unit / definition:
- Measurement status: observed | unknown | unavailable
- Value: native value | null
- Measurement source / evidence refs / evidence status / limitation:
- Effect status: established | unknown
- Effect basis: direct_metric_rule | observed_comparison | evidence_gap
- Reference value / native-unit delta / materiality threshold / rule ref:
- Effect evidence refs / evidence status / limitation:
- Derived impact: beneficial | neutral | burdensome | harmful | unknown

Dimension decisions:
- Outcome quality: effective | neutral | harmful | insufficient_evidence
- False-positive control: effective | neutral | harmful | insufficient_evidence
- Safety: effective | neutral | harmful | insufficient_evidence
- Routing quality: effective | neutral | harmful | insufficient_evidence
- Evidence quality: effective | neutral | harmful | insufficient_evidence
- Overhead: effective | neutral | excessive | harmful | insufficient_evidence
- Reuse value: effective | neutral | harmful | insufficient_evidence

Overall recommendation:
- Value: expand | retain | simplify | stop | insufficient_evidence
- Scope: next_similar_task_workflow_only
- Rule ref: ask.skill-effectiveness-decision@1.0.0
- Reason codes:
- Authority implied: false

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

Evidence limitations:
- ...
```

## Exit criteria

- The evaluation is tied to one concrete task or artifact.
- All seven dimensions are classified separately from catalog-bound native-unit observations and machine-derived effects.
- Findings cite reviewed evidence; unknown and unavailable values remain null with an explicit limitation.
- Harm precedes missing evidence, overhead, and benefit in the overall recommendation.
- Recommendations are narrow and routed to the right artifact.
- The skill does not replace review gates, merge decisions, benchmark scoring, longitudinal adoption/capability evaluation, external outcomes, or lifecycle authority.

## Failure modes

| Failure | Correction |
|---|---|
| Evaluating a task with no outcome evidence | Return insufficient evidence and name required inputs. |
| Scoring people instead of workflows | Evaluate the workflow and artifacts only; reject personnel scope or language. |
| Inventing a score-like or custom metric | Use only the closed v1 workflow/artifact catalog; require a versioned contract revision for a new anchored metric. |
| Treating an observed resource value as an effect | Keep effect unknown until a valid comparison/materiality rule and effect evidence exist. |
| Converting missing evidence to zero | Preserve `null`, `Unknown`, `unknown` impact, and the limitation. |
| Averaging harm into a favorable result | Apply the closed precedence rule; any harmful dimension yields `stop`. |
| Treating overhead as quality | Keep tokens, duration, tools, artifacts, and agents in native overhead units unless separately measured outcome evidence exists. |
| Treating every task as needing a retrospective | Use only when requested or when the outcome itself is under evaluation. |
| Rewriting a skill from one weak example | Recommend more evidence or a prompt/context update first. |
| Confusing adoption-over-time with one-task effectiveness | Route longitudinal questions to `skill-adoption-metrics`. |

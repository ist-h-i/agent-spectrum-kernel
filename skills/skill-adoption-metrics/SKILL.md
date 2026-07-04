---
name: skill-adoption-metrics
description: Track skill usage maturity, user instruction quality, task outcomes, and adoption impact over time without turning metrics into personnel evaluation.
---

# Skill Adoption Metrics

## Goal

Track skill usage maturity, instruction quality, task outcomes, and adoption impact over multiple tasks without hidden telemetry or personnel scoring.

This skill measures adoption over time. It is separate from `skill-effectiveness-evaluation`, which evaluates whether selected skills helped one task.

## Use when

- A team wants to measure whether skill adoption is improving development operations.
- A user asks how well they or a team are using the skill set over time.
- A project wants evidence of adoption effects after introducing the skill set.
- A lead, mentor, or rollout owner wants to see changes in prompt quality, routing maturity, task completion, review quality, or improvement-loop usage.
- Multiple completed tasks, PRs, reviews, agent sessions, or metrics event candidates are available.

## Do not use when

- There is only one task and the question is whether selected workflows worked; use `skill-effectiveness-evaluation`.
- The user asks for normal implementation, review, refactor, investigation, or adoption-pack generation.
- There is no task evidence, prompt evidence, PR data, validation result, review result, metrics event candidate, or outcome signal.
- The output would be used for HR, compensation, promotion, or personnel evaluation.
- Raw prompts contain sensitive data that should not be retained.

## Measurement dimensions

Instruction quality:
- goal_clarity
- scope_clarity
- context_sufficiency
- constraints_explicitness
- acceptance_criteria_presence
- verification_instruction_presence
- risk_awareness
- artifact_reference_quality
- skill_or_workflow_awareness
- stop_condition_clarity

Skill usage maturity:
- skill_router_used
- selected_primary_skill
- required_gates_selected
- unnecessary_skills_avoided
- skipped_skills_reasoned
- evidence_ledger_used_when_needed
- improvement_ledger_handoff_created
- refactor_implementation_used_for_safe_refactor
- risk_gate_used_when_needed

Task outcomes:
- task_completed
- task_partially_completed
- blocked_reason
- PR_created
- PR_merged
- review_required_changes
- rework_count
- validation_passed
- tests_added_or_updated
- defects_found_before_merge
- debt_items_created
- debt_items_resolved
- rule_or_check_converted

Quality improvement:
- evidence_quality
- verification_coverage
- scope_creep_prevented
- architecture_risk_detected
- code_health_findings_detected
- non_blocking_debt_tracked
- repeated_findings_converted_to_rule
- behavior_preservation_verified

## Maturity levels

| Level | Name | Meaning |
|---:|---|---|
| 0 | Ad hoc | User mostly asks AI to do work without goal, scope, verification, or risk framing. |
| 1 | Task requester | User states the desired work, but scope, non-goals, and verification are weak. |
| 2 | Scoped requester | User gives goal, target scope, forbidden scope, relevant artifacts, and constraints. |
| 3 | Workflow-aware operator | User invokes routing, implementation, review, verification, and evidence requirements appropriately. |
| 4 | Quality-loop operator | User connects code-health review, improvement ledger, prevention feedback, and safe refactor workflows. |
| 5 | System improver | User evaluates skill overuse/underuse and drives updates to recipes, validation, overlays, contexts, examples, or skills. |

## Process

1. Define measurement scope.
   - Period, project, task set, anonymized group, evidence sources, and excluded data.
   - Confirm metrics are for adoption support, coaching, or workflow improvement, not personnel evaluation.

2. Gather events or evidence.
   - Prefer explicit Metrics event candidates from completed meaningful task events.
   - Accept PR/review/validation artifacts when metrics events are absent and the user requested analysis.
   - Do not store raw prompts by default.

3. Normalize metrics.
   - Score instruction metrics on a consistent 1-5 scale or present/partial/missing status.
   - Count outcomes, verification evidence, debt movement, and prevention conversions.
   - Keep evidence references compact and non-sensitive.

4. Evaluate maturity movement.
   - Compare initial and current maturity levels when evidence supports it.
   - Distinguish correlation with skill adoption from unsupported causal claims.
   - Mark Unknown where data is incomplete.

5. Update or propose the ledger.
   - Use `docs/ai/skill-adoption-metrics.md` as the generic empty template.
   - Store project-specific metrics only in the adopting project.
   - Do not store secrets, customer data, personal data, confidential raw prompts, or sensitive project details in this generic repository.

6. Recommend the next intervention.
   - Choose prompt recipe, project overlay, implementation/review context, validation check, example, skill update, training/coaching, or no action.
   - For weekly or monthly summaries, use `docs/ai/adoption-report-template.md` as the output shape and keep scheduling in the external operation layer.

## Output

```text
Skill adoption metrics:
- Measurement scope:
- Period:
- User / team / anonymized group:
- Tasks reviewed:
- Evidence sources:

Instruction maturity:
- Average goal clarity:
- Average scope clarity:
- Average context sufficiency:
- Verification instruction rate:
- Risk-awareness rate:
- Stop-condition rate:

Skill usage maturity:
- Correct routing rate:
- Required gate coverage:
- Over-processing rate:
- Missing evidence rate:
- Improvement-ledger handoff rate:
- Prevention-rule conversion rate:

Task outcomes:
- Completion rate:
- PR creation / merge rate:
- Rework count:
- Validation pass rate:
- Defects caught before merge:
- Debt items tracked:
- Debt items resolved:

Maturity movement:
- Initial level:
- Current level:
- Change:
- Evidence:

Adoption effect:
- Strong signal:
- Weak signal:
- Unknown:
- Recommended next intervention:

Privacy / safety note:
- Raw prompt storage:
- Sensitive data handling:
- Personnel-evaluation boundary:

Report template:
- none | weekly adoption report | monthly adoption report
```

## Exit criteria

- Instruction quality, skill usage maturity, task outcome, and quality improvement metrics are considered.
- Maturity levels 0-5 are applied only when evidence supports them.
- Raw prompt storage is avoided unless explicit permission and safety review exist.
- Adoption signals are not overstated as causal business impact.
- Individual-level metrics are framed as coaching or enablement, never HR evaluation.
- Project-specific metrics are kept out of the generic repository.

## Failure modes

| Failure | Correction |
|---|---|
| Measuring one task as adoption over time | Use `skill-effectiveness-evaluation` instead. |
| Storing raw sensitive prompts | Store summarized metrics and references only. |
| Treating metrics as personnel scoring | Reframe as workflow adoption and enablement or stop. |
| Claiming causal impact from correlation | Label as correlation unless stronger evidence exists. |
| Creating hidden telemetry | Require explicit opt-in and meaningful task events. |

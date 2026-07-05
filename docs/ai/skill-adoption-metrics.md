---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific adoption metrics recorded"
---

# Skill Adoption Metrics Template

This is a generic template. Project-specific metrics should be stored only in the adopting project.

Do not store raw prompts by default. Do not store secrets, customer data, personal data, or sensitive project details. Metrics are for adoption support, coaching, and workflow improvement, not HR or personnel evaluation.

Machine-readable metrics events should conform to `schemas/metrics-event.schema.json`. Period summaries and generated reports should conform to `schemas/adoption-report.schema.json` when emitted as JSON.

Skill command sidecars are transient input to the event store, not durable metrics records. They should be written silently only when structured summaries such as `routing_result`, `review_result`, or `gate_decisions` are already available, and sidecar failures should not change the task output.

## Measurement Scope

```text
Project / team / anonymized group:
- ...

Period:
- YYYY-MM-DD to YYYY-MM-DD

Evidence sources:
- Metrics event candidates
- Project-local `.claude/metrics/current-task.json` sidecar summaries, after Stop hook ingestion
- Project-local `docs/ai/metrics/events.jsonl`
- PRs / reviews / validation reports
- Improvement ledger entries
- Handoffs or adoption pack outputs

Excluded data:
- Raw prompts
- Full review text, full command output, and full file contents
- Secrets
- Customer data
- Sensitive personal data
- Project-specific confidential details
```

## Ledger Entries

Use one block per meaningful task event or period summary.

```text
Metric ID:
- SAM-0001

Date:
- YYYY-MM-DD

Task type:
- implementation | review | refactor | investigation | adoption | documentation | handoff

Instruction metrics:
- goal_clarity: 1-5
- scope_clarity: 1-5
- context_sufficiency: 1-5
- verification_instruction: present | partial | missing
- risk_awareness: present | partial | missing
- stop_condition_clarity: present | partial | missing

Skill route:
- operating_mode:
- primary_skill:
- secondary_skills:
- required_gates:
- executed_gates:
- skipped_gates:
  - gate:
  - reason:
- gate_decisions:
  - gate:
    layer:
    status: required | executed | skipped | insufficient_evidence
    judgment:
    evidence_checked:
    triggering_signals:
    missing_inputs:
    confidence:
    reason_category:
- correct_routing:
- unnecessary_skills_avoided:
- skipped_skills_reasoned:

Review result:
- decision:
- required_fixes_count:
- insufficient_evidence_layers:

Outcome metrics:
- task_completed:
- PR_created:
- PR_merged:
- validation_passed:
- rework_count:
- debt_items_detected:
- debt_items_recorded:
- debt_items_planned:
- debt_items_in_progress:
- debt_items_resolved:
- debt_items_converted_to_rule:
- debt_items_converted_to_check:
- debt_items_accepted:
- debt_items_wont_fix:
- stale_debt_items:

Quality improvement metrics:
- evidence_quality:
- verification_coverage:
- scope_creep_prevented:
- architecture_risk_detected:
- code_health_findings_detected:
- non_blocking_debt_tracked:
- behavior_preservation_verified:

Maturity level:
- before: 0 | 1 | 2 | 3 | 4 | 5
- after: 0 | 1 | 2 | 3 | 4 | 5

Evidence:
- ...

Residual risk:
- ...

Privacy note:
- Raw prompt storage: omitted | explicitly approved
- Sensitive data handling:
- Personnel-evaluation boundary:
```

## Maturity Levels

| Level | Name | Meaning |
|---:|---|---|
| 0 | Ad hoc | Requests lack goal, scope, verification, and risk framing. |
| 1 | Task requester | Goal is present, but scope, non-goals, and verification are weak. |
| 2 | Scoped requester | Goal, scope, forbidden scope, relevant artifacts, and constraints are present. |
| 3 | Workflow-aware operator | Routing, implementation, review, verification, and evidence requirements are used appropriately. |
| 4 | Quality-loop operator | Review-code-health, improvement-ledger, prevention feedback, and refactor safety are connected. |
| 5 | System improver | Skill overuse/underuse is evaluated and updates are driven into recipes, validation, overlays, contexts, examples, or skills. |

## Period Summary Template

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
- Skipped gates by reason category:
- Insufficient evidence by gate/layer:
- Under-processing count:
- Over-processing count:
- Top repeated gate-deviation patterns:
- Missing skip reason count:
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
- Debt items converted_to_rule:
- Debt items converted_to_check:
- Stale debt items:

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
```

Use `null` for unavailable numeric averages and rates in generated JSON reports. Unknown routing or gate coverage is not the same as zero coverage.

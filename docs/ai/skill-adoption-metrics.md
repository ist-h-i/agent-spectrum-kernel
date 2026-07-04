---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific adoption metrics recorded"
---

# Skill Adoption Metrics Template

This is a generic template. Project-specific metrics should be stored only in the adopting project.

Do not store raw prompts by default. Do not store secrets, customer data, personal data, or sensitive project details. Metrics are for adoption support, coaching, and workflow improvement, not HR or personnel evaluation.

## Measurement Scope

```text
Project / team / anonymized group:
- ...

Period:
- YYYY-MM-DD to YYYY-MM-DD

Evidence sources:
- Metrics event candidates
- PRs / reviews / validation reports
- Improvement ledger entries
- Handoffs or adoption pack outputs

Excluded data:
- Raw prompts
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
- unnecessary_skills_avoided:
- skipped_skills_reasoned:

Outcome metrics:
- task_completed:
- PR_created:
- PR_merged:
- validation_passed:
- rework_count:
- debt_items_created:
- debt_items_resolved:
- rule_or_check_converted:

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
```

# Adoption Report Templates

These are generic report templates for adoption metrics summaries. Project-specific generated reports should live in the adopting project, not in this generic repository.

Weekly and monthly adoption summaries are not separate delivery skills. They are reporting modes of `skill-adoption-metrics` or templates consumed by an operator.

Scheduling belongs outside the skill set. It can be manual, ChatGPT automation, GitHub Actions, cron, or a team routine, and risky external automation requires approval through `risk-gate`.

Machine-readable report output should conform to `schemas/adoption-report.schema.json`. The local-first default report directory is `docs/ai/reports/` in the adopting project.

## Weekly Adoption Report

Purpose: operational improvement.

```text
Weekly adoption report:
- Period:
- Tasks reviewed:
- Events reviewed:
- Completed tasks:
- PRs created / merged:
- Validation pass rate:
- Rework count:

Instruction maturity:
- goal clarity average:
- scope clarity average:
- verification instruction rate:
- risk-awareness rate:

Skill usage:
- correct routing rate:
- over-processing cases:
- missing evidence cases:
- improvement-ledger handoff count:

Debt movement:
- detected:
- recorded:
- planned:
- in_progress:
- resolved:
- converted_to_rule:
- converted_to_check:
- accepted:
- wont_fix:
- stale:

Debt inventory snapshot:
- open:
- planned:
- in_progress:
- resolved:
- converted_to_rule:
- converted_to_check:
- accepted:
- wont_fix:
- stale:

Next intervention:
- ...

Evidence:
- ...

Privacy / safety note:
- Raw prompt storage:
- Sensitive data handling:
- Personnel-evaluation boundary:
```

## Monthly Adoption Report

Purpose: adoption-effect reporting.

```text
Monthly adoption report:
- Period:
- Total tasks reviewed:
- Total events reviewed:
- Completion rate:
- PR merge rate:
- Validation pass rate:
- Average rework count:

Maturity movement:
- Level 0 -> Level 5 distribution:
- Notable changes:

Quality loop:
- Debt items detected:
- Debt items tracked:
- Debt items planned:
- Debt items in progress:
- Debt items resolved:
- Rules/checks created:
- Accepted or wont-fix items:
- Stale items:

Debt inventory snapshot:
- Current open:
- Current planned:
- Current in_progress:
- Current resolved:
- Current stale:

Adoption effect:
- Strong signal:
- Weak signal:
- Unknown:
- Unsupported causality claims to avoid:

Recommended next intervention:
- ...

Evidence:
- ...

Privacy / safety note:
- Raw prompt storage:
- Sensitive data handling:
- Personnel-evaluation boundary:
```

## Operation Layer Notes

- Metric event recording happens at meaningful task boundaries and only when adoption metrics are enabled or requested.
- Period summary generation consumes metrics events or reviewed evidence over a defined period.
- Period summaries aggregate by `task_id`; event count and task count are reported separately.
- Debt movement is a delta for the period. Debt inventory snapshot is a separate latest-status view.
- Weekly/monthly report templates shape the output, but do not create new skills.
- External scheduling belongs to the operation layer.
- Local reports are project-local by default and must not publish externally without opt-in approval.
- The generic repository should not contain project-specific generated reports.
- Correlation with skill adoption is not causal business impact unless stronger evidence supports that claim.

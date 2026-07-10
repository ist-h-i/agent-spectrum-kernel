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
- required gate coverage:
- over-processing cases:
- under-processing cases:
- missing evidence cases:
- skipped gate categories:
- insufficient evidence gates:
- top gate deviations:
- under-processing gates:
- missing skip reason count:
- improvement-ledger handoff count:

Review quality:
- review tasks:
- decisions:
- required fixes count:
- insufficient evidence tasks:
- insufficient evidence layers:
- re-review count:
- missed blocker rate:
- false positive rate:
- senior correction effort:

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

Value / cost:
- review duration:
- token/time cost:
- routing success without manual skill naming:
- unsupported completion/readiness claim count:
- scope deviation count:

Evidence:
- ...

Privacy / safety note:
- Raw prompt storage:
- Sensitive data handling:
- Personnel-evaluation boundary:
- Access boundary:
- Opt-out path:
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

Value / cost:
- re-review count:
- missed blocker rate:
- false positive rate:
- unsupported completion/readiness claim count:
- scope deviation count:
- review duration:
- senior correction effort:
- token/time cost:
- routing success without manual skill naming:

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
- Sparse early-adoption reports use `null` for unavailable averages and rates. `null` means unknown, not zero.
- Review and routing summaries store counts, gates, and decisions only; raw review text and prompts remain out of scope.
- Normal reports summarize `gate_decisions` by coverage, skipped reason category, insufficient evidence, under-processing, over-processing, missing skip reasons, and top repeated deviation patterns. Full gate decision details remain drill-down data in JSON/event artifacts.
- Reports must not produce HR, compensation, promotion, personnel-evaluation, individual productivity ranking, or individual performance-scoring outputs.
- Reports must include value and cost signals together, and must keep unsupported causality unknown instead of implying business impact from adoption correlation alone.
- Weekly/monthly report templates shape the output, but do not create new skills.
- External scheduling belongs to the operation layer.
- Local reports are project-local by default and must not publish externally without opt-in approval.
- The generic repository should not contain project-specific generated reports.
- Correlation with skill adoption is not causal business impact unless stronger evidence supports that claim.

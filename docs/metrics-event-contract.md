# Metrics Event Contract

Metrics events are explicit, opt-in summaries of meaningful task outcomes. They let normal delivery and review workflows produce adoption data without hidden telemetry or raw prompt storage.

Core principle:

```text
Normal skills do the work.
Metrics layer observes summarized outcomes.
No hidden telemetry.
No raw prompt storage by default.
No file per skill invocation.
```

## Contract

```text
Metrics event candidate:
- event_id:
- task_id:
- task_type:
- date:
- skills_used:
- routing_result:
- instruction_quality_metrics:
  - goal_clarity:
  - scope_clarity:
  - context_sufficiency:
  - verification_instruction:
  - risk_awareness:
  - stop_condition_clarity:
- outcome_metrics:
  - task_completed:
  - PR_created:
  - PR_merged:
  - validation_passed:
  - rework_count:
- verification_metrics:
  - verification_contract_defined:
  - tests_added_or_updated:
  - insufficient_evidence_reported:
- debt_movement_metrics:
  - debt_items_detected:
  - debt_items_created:
  - debt_items_resolved:
  - debt_items_converted_to_rule:
  - debt_items_converted_to_check:
  - stale_debt_items:
  - refactor_candidates_created:
  - refactor_candidates_implemented:
- related_ids:
  - PR:
  - issues:
  - IMP IDs:
  - SAM IDs:
- evidence_references:
- privacy_note:
```

## When To Emit

Emit a Metrics event candidate only when all are true:

- Adoption metrics are explicitly enabled or requested.
- A meaningful task event completed or reached a durable state.
- Evidence exists.
- The event can be summarized without storing secrets, raw confidential prompts, customer data, or sensitive personal data.

Meaningful events include:

- PR review completed.
- Implementation PR created.
- PR merged.
- Refactor completed.
- Improvement ledger updated.
- Finding converted to a rule or executable check.
- Verification completed or insufficient evidence explicitly reported.

Do not emit for:

- A bare `skill-router` invocation.
- A partial conversation with no durable task outcome.
- A trivial edit with no adoption measurement need.
- Hidden telemetry or background collection.
- A file per skill invocation.

## Producer Guidance

Delivery and review skills may include an optional `Metrics event candidate` output section. The section is optional even when the skill runs, and it must be omitted unless the opt-in conditions are met.

The event should store counts, statuses, related IDs, and evidence references. It should not duplicate detailed improvement-ledger findings, raw prompts, secrets, or confidential project data.

## Consumer Guidance

`skill-adoption-metrics` consumes Metrics event candidates, normalizes them into adoption metrics, and may update a project-local `docs/ai/skill-adoption-metrics.md` ledger.

The generic repository contains only the template. Project-specific metrics belong in the adopting project.

## Privacy And Safety

- Raw prompt storage is off by default.
- Summaries must mask or omit secrets, customer data, personal data, and sensitive project details.
- Metrics are for adoption support, coaching, and workflow improvement.
- Metrics must not be framed as HR, compensation, promotion, or personnel evaluation.
- Adoption effect should be reported as a signal or correlation unless stronger evidence supports causality.

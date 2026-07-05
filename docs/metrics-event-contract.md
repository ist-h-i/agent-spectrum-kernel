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

This contract is the human-readable companion to `schemas/metrics-event.schema.json`. Runtime adapters should produce machine-readable JSONL events that satisfy the schema when event capture is enabled.

## Contract

```text
Metrics event candidate:
- event_id:
- task_id:
- task_type:
- occurred_at:
- skills_used:
- routing_result:
  - operating_mode:
  - primary_skill:
  - correct_routing: optional boolean when reviewed
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
    confidence: high | medium | low
    reason_category:
- review_result:
  - decision: approve | approve_with_comments | request_changes | block | insufficient_evidence
  - required_fixes_count:
  - insufficient_evidence_layers:
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
  - commands_run:
    - command_kind:
    - command_hash: optional
    - redacted_command_preview: optional explicit opt-in
- debt_movement_metrics:
  - debt_items_detected:
  - debt_items_recorded:
  - debt_items_resolved:
  - debt_items_converted_to_rule:
  - debt_items_converted_to_check:
  - debt_items_accepted:
  - stale_debt_items:
  - refactor_candidates_created:
  - refactor_candidates_implemented:
- debt_inventory_snapshot:
  - optional inventory counts by ledger status
- related_ids:
  - PR:
  - issues:
  - IMP IDs:
  - SAM IDs:
- evidence_references:
- privacy_note:
```

## Runtime Storage

Default runtime storage is project-local:

```text
docs/ai/metrics/events.jsonl
```

Each line is one JSON object. The generic repository includes schemas and templates only; adopting projects own their project-specific event store.

Adapters must prefer explicit task IDs when available. For Claude hooks, the default fallback boundary is `session_id`:

```text
capture.task_boundary_required: true
capture.allow_session_id_task_boundary: true
capture.task_boundary_source: session_id
```

This means file-change and verification events are recorded under a session-scoped task ID such as `session:<id>`, then the Stop event marks that task boundary complete. If neither an explicit task ID nor an allowed session boundary is available, adapters must `skip` rather than create noisy unbounded events.

Command text is not recorded by default. Verification events record `command_kind` only. `command_hash` and `redacted_command_preview` require explicit opt-in and must not include secrets.

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
- Weekly or monthly report generated from project-local events.

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

Debt movement fields are delta counts for the current event, not full ledger inventory. Full finding detail belongs in the review output or improvement ledger. Snapshot counts may be included separately under `debt_inventory_snapshot`.

Routing and review fields are summaries only. They should capture which gates were required, executed, or skipped and the final review decision, but must not store raw review text, prompts, secrets, full file contents, or full command output.

Sparse early-adoption reports may emit `null` for averages and rates such as correct routing rate or required gate coverage. `null` means unknown or unavailable evidence; it must not be interpreted as `0`.

`gate_decisions` is the bounded drill-down form for gate-level judgment data. It stores short structured judgments only. It must not contain raw prompts, full review text, full command output, or full file contents.

Normal adoption reports should summarize gate decisions instead of listing every decision:

- required gate coverage,
- skipped gates by reason category,
- insufficient evidence by gate or layer,
- under-processing warnings,
- over-processing warnings,
- missing skip reason count,
- top repeated gate-deviation patterns.

```text
detected -> recorded -> planned -> in_progress -> resolved
                  -> converted_to_rule
                  -> converted_to_check
                  -> accepted
                  -> wont_fix
                  -> stale
```

## Privacy And Safety

- Raw prompt storage is off by default.
- Summaries must mask or omit secrets, customer data, personal data, and sensitive project details.
- Metrics are for adoption support, coaching, and workflow improvement.
- Metrics must not be framed as HR, compensation, promotion, or personnel evaluation.
- Adoption effect should be reported as a signal or correlation unless stronger evidence supports causality.

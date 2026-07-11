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
  - gate_applicability:
    - layer:
      status: required | skipped | insufficient_evidence
      gate:
      reason:
      evidence:
      trigger_signals:
      inputs_still_needed:
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
- command_attempt_metrics:
  - command_kind:
  - classified_as_verification: false
- command_attempt_summary:
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

`command_attempt` records a shell command attempt without treating it as verification evidence. It sets `classified_as_verification: false` and must not populate `verification_metrics.commands_run`.

`verification_attempt` is reserved for commands that match the verification classifier or have explicit evidence linkage. A generic Bash hook must not classify every command as verification.

Non-blocking recorder failures append a sanitized local health entry under `CLAUDE_PROJECT_DIR` when available, then an explicit recorder project root, then the resolved project config/event-store root:

```text
.agent-spectrum-kernel/runtime-health.jsonl
```

An `error` entry opens a component/error-code health issue; a later `recovered` entry closes it. `ask-doctor` warns only for unresolved entries inside the configured freshness window and reports older unresolved entries as historical. Health history is capped by `runtime_health.max_entries`. Runtime-health entries must omit raw prompts, secrets, customer data, personal data, full command output, and full error messages.

## Skill Command Sidecar

Project-level Claude skill commands may write one transient project-local sidecar:

```text
.claude/metrics/current-task.json
```

The Stop hook reads this sidecar silently and folds the available structured summaries into the normal `task_stop` event. If the sidecar is missing, empty, invalid JSON, or contains unsupported fields, the Stop event still records normally from hook data. Sidecar ingestion is best-effort: metrics failures must not fail or interrupt the developer task, and adapters must not print routine "metrics recorded" status.

Allowed sidecar fields:

```json
{
  "task_id": "optional explicit task boundary",
  "task_type": "implementation | review | investigation | validation | handoff | other",
  "skills_used": ["skill-router"],
  "routing_result": {},
  "review_result": {},
  "gate_decisions": []
}
```

The sidecar must contain summarized structured data only. It must not include raw prompts, full review text, full command output, full file contents, secrets, customer data, sensitive personal data, or personnel-scoring data. Adapters may consume and remove the current-task sidecar after reading it to avoid stale data reuse.

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
- Command attempts, when command-attempt capture is enabled, as non-verification operational context.

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

Gate applicability summaries make routing deviations detectable without storing raw review text:

- `required` gates that are not present in `executed_gates` are under-processing warnings.
- Heavy gates in `required_gates` or `executed_gates` without a required applicability row and trigger signals are over-processing warnings.
- Missing changed-file, diff, context, output, or verification evidence should be recorded as `insufficient_evidence`, not as a skipped gate.
- Skipped gates require evidence-backed reasons.

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
- Metrics must not be used for individual productivity rankings or individual performance scoring.
- Avoid personal identifiers unless project policy explicitly approves the purpose, access boundary, retention, and opt-out path.
- Adoption effect should be reported as a signal or correlation unless stronger evidence supports causality.

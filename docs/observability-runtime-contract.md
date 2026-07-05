# Observability Runtime Contract

This contract defines what any adapter may record when it observes AI-assisted development work. It is runtime-agnostic: Claude hooks, GitHub Actions, local scripts, or future adapters can consume it without changing the core skills.

Core boundary:

```text
Core skills = what to judge / what to record / what counts as quality
Adapter runtime = when to run / where to store / how to expose commands and automation
```

## Scope

Observability records summarized task-boundary facts. It does not record every prompt, every model step, or every file edit.

Allowed records:

- meaningful task boundary events,
- skill routing and gate summaries,
- changed file summaries,
- verification attempt summaries,
- review decision summaries,
- improvement-ledger movement counts,
- report generation summaries,
- evidence references that point to project-local artifacts.

Forbidden by default:

- raw prompts,
- secrets, tokens, keys, credentials, or `.env` values,
- customer data,
- personal data,
- full file contents,
- full command output,
- external publication,
- HR, compensation, promotion, or personnel evaluation use.

## Storage

Default storage is project-local.

Recommended locations for adopting projects:

```text
docs/ai/observability-config.yml
docs/ai/metrics/events.jsonl
docs/ai/reports/
docs/ai/improvement-ledger.md
docs/ai/skill-adoption-metrics.md
```

Adapters may choose equivalent paths, but they must document:

- event store path,
- report output path,
- ledger path,
- whether events are enabled,
- whether external publication is enabled,
- raw prompt policy,
- sensitive data policy.

External publication must be opt-in and risk-gated. The default config must not include enabled HTTP endpoints, webhook URLs, cloud telemetry destinations, or credential placeholders that look ready to run.

## Event Cadence

Events are recorded at meaningful boundaries:

- task start or task completion when a task boundary is known,
- verification command attempted,
- review completed,
- improvement ledger candidate created or ledger refreshed,
- weekly or monthly report generated.

Explicit task IDs are preferred. Claude hook adapters may use `session_id` as the default local task boundary when configured:

```text
capture.task_boundary_required: true
capture.allow_session_id_task_boundary: true
capture.task_boundary_source: session_id
```

File-change and verification events are then recorded under the session-scoped task ID, and the Stop event marks the task boundary complete. If neither an explicit task ID nor an allowed session boundary is available, missing task boundary is handled as `skip`.

## Event Shape

Metrics events should conform to `schemas/metrics-event.schema.json`. Each event includes:

- stable event and task identifiers,
- task type,
- date/time,
- skills used,
- routing result,
- instruction quality metrics,
- outcome metrics,
- verification metrics,
- debt movement metrics,
- related IDs,
- evidence references,
- privacy note.

Verification events record command kind by default, not raw command text. Command hashes or strictly allowlisted redacted previews are opt-in fields.

The JSONL store uses one JSON object per line. Invalid lines should be reported in summaries but should not block reading valid events unless strict validation is requested.

## Debt Lifecycle

Review findings, improvement ledger rows, and metrics events use the same debt lifecycle vocabulary:

```text
detected -> recorded -> planned -> in_progress -> resolved
                  -> converted_to_rule
                  -> converted_to_check
                  -> accepted
                  -> wont_fix
                  -> stale
```

Meaning:

| State | Meaning |
|---|---|
| `detected` | A finding exists in review output or code-health analysis, but has not been accepted into a ledger. |
| `recorded` | A finding was added to an improvement ledger or equivalent backlog. |
| `planned` | Follow-up work is selected but not started. |
| `in_progress` | Follow-up work is currently being done. |
| `resolved` | Close condition is satisfied and evidence is linked. |
| `converted_to_rule` | The finding became an AI rule, Skill update, checklist, project overlay, or context update. |
| `converted_to_check` | The finding became an executable validation, lint, test, CI check, or equivalent guard. |
| `accepted` | The finding remains known and intentionally accepted. |
| `wont_fix` | The finding is closed without action with rationale. |
| `stale` | Evidence, owner, urgency, or status no longer matches reality. |

Current-PR blockers remain in review required fixes. Non-blocking findings may become improvement-ledger candidates. Metrics must count movement deltas separately from inventory snapshots and must not duplicate full findings.

## Report Contract

Weekly and monthly reports are local summaries over project-local events and ledgers. They may include:

- task counts,
- routing quality signals,
- verification coverage,
- debt movement,
- rule/check conversions,
- evidence references,
- residual risks.

Reports must label unsupported causality claims as `Unknown`. Adoption impact is a signal unless stronger evidence supports causality.

## Adapter Requirements

Any adapter consuming this contract must:

- keep core skills as the source of judgment,
- avoid adding runtime-specific syntax to core `skills/*/SKILL.md`,
- keep project-local storage as default,
- disable external publication by default,
- disable raw prompt storage by default,
- omit sensitive data by default,
- expose a validation or dry-run path when practical,
- document what static validation proves and what runtime behavior remains unproven.

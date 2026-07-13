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

Default event storage is repository-local but runtime-owned. It is not a versioned engineering artifact.

Recommended locations for adopting projects:

```text
docs/ai/observability-config.yml
ask-runtime/metrics/events.jsonl
docs/ai/reports/
docs/ai/improvement-ledger.md
docs/ai/skill-adoption-metrics.md
```

`ask-runtime/` resolves to `.git/agent-spectrum-kernel/` in Git repositories and `.agent-spectrum-kernel/runtime/` otherwise. This keeps read-only adapter workflows from modifying the engineering working tree. A project may opt into another path explicitly.

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

Explicit hook/CLI task IDs are preferred. Claude hook adapters may use a runtime-owned segment within `session_id` as the default local task boundary when configured:

```text
capture.task_boundary_required: true
capture.allow_session_id_task_boundary: true
capture.task_boundary_source: session_id
```

File-change and command events use the current session segment, and the next Stop event closes that segment. A missing, malformed, or invalid canonical result is still skipped as an event, but Stop advances the boundary so its preceding tool events cannot be joined to the next task. Duplicate project/plugin execution reuses the just-closed segment only when the canonical-result identity and Claude transcript append position both match within a five-second claim. A later transcript turn starts a new segment even if it emits the same result. The stored identity is hashed. The candidate's descriptive task ID does not split the runtime aggregation identity from preceding hook events. If neither an explicit hook/CLI task ID nor an allowed session boundary is available, missing task boundary is handled as `skip`.

Session boundary state is bounded to 128 sessions and 128 KiB. Inactive entries expire after seven days and least-recently-used inactive entries are evicted when either limit is reached. The session currently being processed, segments opened within the last hour, and live duplicate claims are protected from eviction. A session resumed after eviction receives a new bounded generation identity and therefore cannot rejoin an old task. Pruning is part of the boundary state's locked read-modify-write operation. If protected active state alone exhausts capacity, the non-blocking collector fails open and records runtime health rather than evicting an active boundary or exceeding the limit.

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

Current-PR blockers remain in review Blocking evidence (with detailed Required fixes when needed). Non-blocking findings may become improvement-ledger candidates. Metrics must count movement deltas separately from inventory snapshots and must not duplicate full findings.

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

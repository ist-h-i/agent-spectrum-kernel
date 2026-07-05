# Debt Lifecycle Contract

This contract connects review findings, code-health findings, improvement-ledger entries, and adoption metrics. It prevents non-blocking debt from disappearing after review while keeping merge blockers visible in the current PR.

## Lifecycle

Canonical lifecycle:

```text
detected -> recorded -> planned -> in_progress -> resolved
                  -> converted_to_rule
                  -> converted_to_check
                  -> accepted
                  -> wont_fix
                  -> stale
```

Compatibility aliases:

- `open` and `triaged` are ledger table working states before a finding is fully accepted into the lifecycle.
- `accepted` means the item remains known and intentionally tracked or tolerated.
- `wont_fix` means the item is intentionally closed without action.

## Source Separation

Current-PR blockers stay in review output:

- `review-router` determines applicable gates.
- Required fixes remain under `review-final-merge-gate` required fixes.
- Blockers must not be hidden as backlog or ledger-only entries.

Non-blocking follow-up may become improvement-ledger candidates:

- technical debt,
- refactor candidates,
- rule gaps,
- validation-check candidates,
- accepted risks,
- stale evidence needing refresh.

Not every review must create a ledger entry. Vague opinions without source, evidence, impact, and close condition should be rejected or marked `needs_more_evidence`.

## Ledger Entry Requirements

Ledger entries must include:

- source,
- finding,
- category,
- evidence and evidence status,
- impact,
- severity,
- urgency,
- decision,
- recommended action,
- prevention target,
- owner,
- status,
- created date,
- refresh date,
- close condition.

Machine-readable entry examples should conform to `schemas/improvement-ledger-entry.schema.json`.

## State Meanings

| State | Meaning | Metrics count |
|---|---|---|
| `detected` | Finding appeared in review or code-health output. | `debt_items_detected` |
| `recorded` | Finding was accepted into a ledger or equivalent backlog. | `debt_items_recorded` |
| `planned` | Follow-up is selected. | `debt_items_planned` |
| `in_progress` | Follow-up work started. | `debt_items_in_progress` |
| `resolved` | Close condition satisfied with evidence. | `debt_items_resolved` |
| `converted_to_rule` | Finding became an AI rule, Skill update, checklist, overlay, or context update. | `debt_items_converted_to_rule` |
| `converted_to_check` | Finding became validation, lint, test, CI, or another executable check. | `debt_items_converted_to_check` |
| `accepted` | Known and intentionally accepted. | `debt_items_accepted` |
| `wont_fix` | Closed without action with rationale. | `debt_items_wont_fix` |
| `stale` | Refresh date passed or evidence no longer supports the row. | `stale_debt_items` |

## Conversion Rules

Use `converted_to_rule` when the accepted prevention target is:

- `AGENTS.md`,
- `CUSTOM_INSTRUCTIONS.md`,
- project overlay,
- `SKILL.md`,
- review checklist,
- implementation context,
- review context.

Use `converted_to_check` when the accepted prevention target is:

- validation script,
- lint/test/check,
- CI check,
- another executable guard.

Do not convert `Hypothesis` or `Unknown` evidence. Use `needs_more_evidence` until repeated or high-impact evidence is supported.

## Refresh Rules

Move or flag an item as `stale` when:

- refresh date has passed,
- evidence no longer points to current code/docs/tests/CI/review context,
- owner is missing for an item that needs action,
- severity, urgency, decision, or prevention target no longer matches impact,
- a converted rule or check was removed or disabled.

Refreshing stale items requires updated evidence, impact, owner or explicit `unassigned`, status, refresh date, and close condition.

## Metrics Relationship

Metrics events count lifecycle movement deltas. They do not store full findings and they do not repeatedly count the full ledger inventory as movement.

Reports should include:

- detected,
- recorded,
- planned,
- in_progress,
- resolved,
- converted_to_rule,
- converted_to_check,
- accepted,
- wont_fix,
- stale.

Inventory counts are separate from movement counts. A ledger refresh may include the latest inventory under `debt_inventory_snapshot`, while `debt_movement_metrics` includes only rows added, changed, resolved, converted, accepted, or marked stale during that refresh.

Detailed finding text stays in review output or `docs/ai/improvement-ledger.md`.

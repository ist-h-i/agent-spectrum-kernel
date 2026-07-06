---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific documentation knowledge recorded"
---

# Documentation Knowledge Ledger Template

Use this file to preserve durable engineering knowledge extracted from docs, ADRs, PR descriptions, handoffs, review context, implementation context, and requirement discussions.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. Do not store transient task progress here.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, document set, review range, or template note covered by the ledger. |

## Evidence And Freshness Status

Evidence statuses: `Verified`, `Human-confirmed`, `Supported`, `Hypothesis`, `Deprecated`, `Contradicted`.

Freshness statuses:

| Status | Meaning |
|---|---|
| `current` | Source and current repo evidence align. |
| `stale` | Source is likely outdated or past its refresh trigger. |
| `conflicting` | Source conflicts with another source or current evidence. |
| `unknown` | Freshness has not been checked. |
| `deprecated` | Retained for history only. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
DK-0001
DK-0002
DK-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `DK-0001` style identifier. |
| Knowledge type | yes | Requirement, design decision, implementation convention, verification expectation, review policy, operation note, release note, known issue, or deprecated information. |
| Statement | yes | Durable statement, not full source text. |
| Source document | yes | Source path, URL, issue, PR, ADR, or note. |
| Source location | yes | Heading, line, section, comment, or `unknown`. |
| Evidence status | yes | One of the evidence statuses above. |
| Freshness status | yes | One of the freshness statuses above. |
| Consumers | yes | Skills, contexts, ledgers, or docs that may consume the entry. |
| Conflicts | yes | Known conflicts or `none`. |
| Recommended target | yes | Review context, implementation context, domain rule ledger, engineering pattern ledger, verification pattern ledger, ADR, architecture memory, project overlay, docs update, or none. |
| Staleness trigger | yes | Event that requires refresh. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Documentation Knowledge Entries

| ID | Knowledge type | Statement | Source document | Source location | Evidence status | Freshness status | Consumers | Conflicts | Recommended target | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| DK-0001 | implementation convention | API adapters return typed result objects rather than throwing domain errors. | docs/architecture.md | Error boundary section | Verified | current | implementation-context-generation; review-architecture-impact | none | engineering pattern ledger | API adapter error boundary changes | platform-team |
-->

## Stale Knowledge Review

Move or mark an entry for review when any of these are true:

- The source document changes or is deleted.
- Code, tests, ADRs, or project overlay contradict the statement.
- The consumer reports insufficient evidence.
- The statement becomes task progress rather than durable knowledge.
- A domain owner or architecture owner supersedes it.

Refreshing stale knowledge requires source re-check, current evidence status, freshness status, conflicts, recommended target, owner, and staleness trigger.

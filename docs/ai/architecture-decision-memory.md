---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific architecture decisions recorded"
---

# Architecture Decision Memory Template

Use this file to preserve lightweight reusable architecture and boundary decisions with evidence, alternatives, tradeoffs, consequences, and revisit conditions.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. ADRs remain the canonical durable architecture record when they exist.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, architecture area, ADR range, review range, or template note covered by the memory. |

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in code, docs, tests, ADRs, CI, runtime output, or merged PR evidence. |
| `Human-confirmed` | Confirmed by a responsible architecture owner or human. |
| `Supported` | Backed by indirect or repeated evidence but not fully proven. |
| `Hypothesis` | May guide questions only; must not be enforced as an architecture rule. |
| `Deprecated` | Retained for history but no longer recommended. |
| `Contradicted` | Conflicts with newer evidence and needs resolution. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
ADM-0001
ADM-0002
ADM-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `ADM-0001` style identifier. |
| Decision summary | yes | Short architecture decision statement. |
| Architecture boundary | yes | Boundary affected by the decision. |
| Context | yes | Situation and constraints that led to the decision. |
| Options considered | yes | Options that were considered. |
| Accepted option | yes | Selected option. |
| Rejected alternatives | yes | Rejected options and why, or `none`. |
| Reason | yes | Why the accepted option was chosen. |
| Tradeoffs | yes | Known tradeoffs. |
| Consequences | yes | Operational or design consequences. |
| Evidence source | yes | ADR, code, docs, review, issue, test, runtime output, or human confirmation. |
| Evidence status | yes | One of the evidence statuses above. |
| Related ADR | yes | ADR path/ID or `none`. |
| Related project overlay rule | yes | Overlay rule or `none`. |
| Related engineering pattern | yes | Engineering pattern ID or `none`. |
| Review impact | yes | How architecture review should use this memory. |
| Revisit condition | yes | Condition that should reopen the decision. |
| Staleness trigger | yes | Event that requires refresh. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Architecture Decision Memory Entries

| ID | Decision summary | Architecture boundary | Context | Options considered | Accepted option | Rejected alternatives | Reason | Tradeoffs | Consequences | Evidence source | Evidence status | Related ADR | Related project overlay rule | Related engineering pattern | Review impact | Revisit condition | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| ADM-0001 | Domain errors do not cross API adapter boundary | DTO/error trust boundary | External API errors need stable internal mapping | Throw raw errors; map to typed result | Map to typed result at adapter boundary | Throw raw errors leaks provider shape | Keeps domain layer independent from provider errors | Slight mapper overhead | Review adapter changes for raw error leaks | ADR-0004 and merged PR #123 | Verified | docs/adr/0004-error-boundary.md | none | EP-0003 | review-architecture-impact checks adapter error boundary | New provider or public API error contract changes | API adapter boundary changes | platform-team |
-->

## Stale Decision Review

Move or mark an entry for review when any of these are true:

- A related ADR is added, updated, superseded, or contradicted.
- Ownership, dependency direction, public API, persistence, or infrastructure boundary changes.
- An engineering pattern depending on the decision changes.
- Review gates find repeated exceptions.
- The revisit condition is reached.

Refreshing stale memory requires current evidence, current relationship to ADRs and overlays, consequences, revisit condition, owner, and staleness trigger.

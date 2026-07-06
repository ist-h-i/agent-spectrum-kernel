---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific engineering patterns recorded"
---

# Engineering Pattern Ledger Template

Use this file to preserve reusable implementation judgment that has source evidence and a clear scope.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. When copied into a project, replace the metadata and keep entries evidence-backed.

This file is not a project overlay, ADR, implementation context, or task plan. Reference those sources instead of duplicating them.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, stack, module, PR range, review range, or template note covered by the ledger. |

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in code, docs, tests, CI, runtime output, or merged PR evidence. |
| `Human-confirmed` | Confirmed by a responsible human or owner. |
| `Supported` | Backed by indirect or repeated evidence but not fully proven. |
| `Hypothesis` | May guide questions only; must not be enforced as an implementation rule. |
| `Deprecated` | Retained for history but no longer recommended. |
| `Contradicted` | Conflicts with newer evidence and needs resolution. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
EP-0001
EP-0002
EP-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `EP-0001` style identifier. |
| Pattern name | yes | Short name for the reusable implementation pattern. |
| Layer / boundary | yes | Layer, module, stack, feature, or boundary where the pattern applies. |
| Applies when | yes | Conditions where this pattern should be considered. |
| Do not use when | yes | Conditions where the pattern is wrong or insufficient. |
| Accepted implementation shape | yes | The implementation shape supported by evidence. |
| Rejected alternatives | yes | Alternatives rejected by evidence, or `none` if unavailable. |
| Evidence source | yes | PR, issue, review, docs, test, runtime output, or human confirmation. |
| Evidence status | yes | One of the evidence statuses above. |
| Related files / modules | yes | Paths, modules, or `none`. |
| Related skills | yes | Skills that may consume the entry. |
| Review impact | yes | How review should use the pattern. |
| Verification expectation | yes | Expected verification when the pattern is used. |
| Staleness trigger | yes | Event that requires refresh. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Engineering Pattern Entries

| ID | Pattern name | Layer / boundary | Applies when | Do not use when | Accepted implementation shape | Rejected alternatives | Evidence source | Evidence status | Related files / modules | Related skills | Review impact | Verification expectation | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| EP-0001 | Route writes through use cases | Application service boundary | Feature writes cross repository and API boundaries | Local pure formatting or copy-only changes | Use case owns transaction and mapper boundary | Component-level data writes | Merged PR #123 and integration test `account-write.test.ts` | Verified | src/account/usecases; src/account/repositories | controlled-implementation; review-architecture-impact | Review direct data writes outside use case boundary | Focused integration test for write path | Repository boundary or transaction model changes | platform-team |
-->

## Stale Pattern Review

Move or mark an entry for review when any of these are true:

- Current code, docs, tests, or stack overlay no longer match the entry.
- A project overlay or ADR contradicts the pattern.
- The owning module or boundary changes.
- Review gates repeatedly report exceptions or false positives.
- Verification expectation no longer catches the intended risk.

Refreshing a stale pattern requires current source evidence, current evidence status, owner, consumer list, and staleness trigger.

---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific verification patterns recorded"
---

# Verification Pattern Ledger Template

Use this file to preserve reusable verification expectations for recurring change types, risk classes, historical regressions, and project-specific checks.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. When copied into a project, replace the metadata and keep entries evidence-backed.

This file recommends evidence. It does not prove current task behavior and must not replace actual test execution.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, module, change type, review range, incident, or template note covered by the ledger. |

## Evidence Status Key

Use `ask.claim-evidence-status@1.0.0`: `Verified`, `Supported`, `Hypothesis`, `Unknown`, or `Falsified`. Record human confirmation in `Authority status` and pattern lifecycle/conflict in `Record state`.

## Entry ID Convention

Use stable IDs in ascending order:

```text
VP-0001
VP-0002
VP-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `VP-0001` style identifier. |
| Change type | yes | Kind of change covered by this verification pattern. |
| Risk class | yes | `low`, `medium`, `high`, `critical`, or a project-defined risk class. |
| Required evidence | yes | Evidence that must be produced for matching changes. |
| Recommended focused commands | yes | Focused repeatable commands, or `none`. |
| Negative cases | yes | Negative or edge cases to test, or `none`. |
| Regression history | yes | Known regression source, or `none`. |
| Known flaky areas | yes | Flaky checks or areas, or `none`. |
| Applies when | yes | Conditions where this pattern should be considered. |
| Do not use when | yes | Conditions where the pattern is not sufficient. |
| Evidence source | yes | PR, issue, incident, CI, tests, runtime output, docs, or human confirmation. |
| Evidence status | yes | One of the evidence statuses above. |
| Authority status | yes | `not_asserted` or `human_confirmed`. |
| Record state | yes | `active`, `deprecated`, or `contradicted`. |
| Related files / modules | yes | Paths, modules, or `none`. |
| Related domain rules | yes | Domain rule IDs, or `none`. |
| Related engineering patterns | yes | Engineering pattern IDs, or `none`. |
| Staleness trigger | yes | Event that requires refresh. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Verification Pattern Entries

| ID | Change type | Risk class | Required evidence | Recommended focused commands | Negative cases | Regression history | Known flaky areas | Applies when | Do not use when | Evidence source | Evidence status | Authority status | Record state | Related files / modules | Related domain rules | Related engineering patterns | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| VP-0001 | Auth guard behavior | high | Unit test for allowed and denied states plus integration route check | npm test -- auth-guard | expired session; missing role | Incident INC-42 | none | Route authorization changes | Copy-only docs changes | Merged PR #123 and CI run #456 | Verified | not_asserted | active | src/auth; src/routes | DR-0004 | EP-0002 | Auth role model or router changes | platform-team |
-->

## Stale Pattern Review

Move or mark an entry for review when any of these are true:

- The command, test name, or CI job no longer exists.
- A regression occurs despite the pattern.
- The change type or risk class changes.
- The check is flaky or deprecated.
- Current task evidence repeatedly differs from the recommended pattern.

Refreshing a stale pattern requires current command evidence, current coverage limits, current owner, and updated staleness trigger.

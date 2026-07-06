---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific review rules recorded"
---

# Review Rule Ledger Template

Use this file to preserve reusable review judgment and prevention rules derived from repeated or high-impact review findings.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. Current PR blockers must stay in the current PR review output.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, review range, PR set, audit, or template note covered by the ledger. |

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly supported by review findings, code, tests, CI, incidents, or merged PR evidence. |
| `Human-confirmed` | Confirmed by a responsible human or reviewer. |
| `Supported` | Backed by repeated or related findings but not fully proven. |
| `Hypothesis` | May guide review questions only; must not become a blocking rule. |
| `Deprecated` | Retained for history but no longer recommended. |
| `Contradicted` | Conflicts with current evidence and needs resolution. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
RR-0001
RR-0002
RR-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `RR-0001` style identifier. |
| Finding pattern | yes | Reusable finding pattern. |
| Review layer | yes | Domain, architecture, design, logic, output quality, verification, maintainability, mechanical, adversarial risk, or evidence. |
| Trigger signal | yes | Signal that should cause reviewers or checks to consider the rule. |
| Why it matters | yes | Impact if missed. |
| Current PR blocker policy | yes | When this blocks now, when it is a comment, or when it is only a follow-up. |
| Suggested prevention target | yes | Review checklist, project overlay, SKILL.md, ledger, validation script, lint/test/check, or improvement-ledger. |
| Evidence source | yes | PR, review, incident, code, test, CI, or human confirmation. |
| Evidence status | yes | One of the evidence statuses above. |
| Repeat pattern | yes | `one-off`, `repeated`, `likely_repeated`, or `high_impact_single_case`. |
| False-positive risk | yes | Known noise risk or `none`. |
| Suppression rule | yes | When to suppress or downgrade the rule. |
| Staleness trigger | yes | Event that requires refresh. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Review Rule Entries

| ID | Finding pattern | Review layer | Trigger signal | Why it matters | Current PR blocker policy | Suggested prevention target | Evidence source | Evidence status | Repeat pattern | False-positive risk | Suppression rule | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| RR-0001 | Missing negative case for permission denial | Test / verification | Permission or role behavior changes | Unauthorized access regressions can pass happy-path tests | Block when permission behavior changes without denial evidence | verification-pattern-ledger; review checklist | Review comments on PR #123 and PR #145 | Supported | repeated | low | Suppress for copy-only docs changes | Permission model or route guard changes | platform-team |
-->

## Stale Rule Review

Move or mark an entry for review when any of these are true:

- Review findings no longer repeat.
- False positives outnumber useful catches.
- A prevention target was converted into an executable check.
- The related implementation, verification, or domain rule changed.
- A current review contradicts the rule.

Refreshing a stale rule requires updated evidence, blocker policy, suppression rule, owner, and staleness trigger.

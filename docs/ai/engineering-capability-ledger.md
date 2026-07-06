---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific engineering capabilities recorded"
---

# Engineering Capability Ledger Template

Use this file to evaluate evidence-backed reusable engineering capability across requirements, architecture, implementation, verification, review, documentation, readiness, and handoff.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. Capability levels must be evidence-backed and must not be used as HR/personnel evaluation.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, period, skill set, report range, or template note covered by the ledger. |

## Capability Levels

| Level | Meaning |
|---|---|
| `0 Unknown` | No usable evidence. |
| `1 One-off assisted` | One task outcome with limited reuse evidence. |
| `2 Repeatable with human supervision` | Repeated use with human decisions still central. |
| `3 Evidence-backed reusable pattern` | Durable assets repeatedly guide work with current evidence. |
| `4 Mostly autonomous verification/review support` | Reusable assets guide task work and gates with limited human correction, while humans own final decisions. |
| `5 Mature reusable project intelligence` | Broad, current, cross-layer evidence with low contradiction and strong verification. |

## Evidence Status Key

Evidence statuses: `Verified`, `Human-confirmed`, `Supported`, `Hypothesis`, `Deprecated`, `Contradicted`, `Unknown`.

Level increases require evidence. Entry count, repeated mention, or AI confidence is not maturity evidence.

## Entry ID Convention

Use stable IDs in ascending order:

```text
EC-0001
EC-0002
EC-0003
```

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `EC-0001` style identifier. |
| Capability area | yes | Capability area being evaluated. |
| Current level | yes | One of the capability levels. |
| Evidence source | yes | Ledger, review, verification, report, issue, PR, or human confirmation. |
| Evidence status | yes | Evidence status for the level claim. |
| Observed strengths | yes | What evidence shows the system does well. |
| Observed failures | yes | Failures, misses, corrections, or `none`. |
| Human dependency | yes | Human decisions or approvals still required. |
| Reusable assets involved | yes | Ledgers, skills, contexts, checks, docs, or `none`. |
| Reliability signals | yes | Signals such as repeat success, contradiction rate, stale rate, or verification quality. |
| Staleness trigger | yes | Event or period requiring re-evaluation. |
| Next improvement candidate | yes | Narrow improvement candidate or `none`. |
| Owner | yes | Responsible human, team, or `unassigned`. |

## Engineering Capability Entries

| ID | Capability area | Current level | Evidence source | Evidence status | Observed strengths | Observed failures | Human dependency | Reusable assets involved | Reliability signals | Staleness trigger | Next improvement candidate | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| EC-0001 | Verification/test design | 3 Evidence-backed reusable pattern | VP-0002; review-final-merge-gate results in PR #123 and #145 | Supported | Permission changes consistently include denial checks | Missing stale-session negative case in PR #145 | Human reviewer confirms final sufficiency | verification-pattern-ledger; test-first-verification | Two repeat uses, one correction, no stale entries | Auth model or test framework changes | Add stale-session verification pattern | platform-team |
-->

## Stale Capability Review

Move or mark an entry for review when any of these are true:

- Reusable assets are stale, deprecated, or contradicted.
- A capability claim lacks current evidence.
- Human correction rate increases.
- Review or verification gates repeatedly report insufficient evidence.
- The evaluation period ends or scope changes.

Refreshing capability evidence requires current source evidence, failure signals, human dependency, reliability signals, and next improvement candidate.

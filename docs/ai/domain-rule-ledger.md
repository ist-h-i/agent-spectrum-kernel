---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific domain rules recorded"
---

# Domain Rule Ledger Template

Use this file to preserve durable business/domain rules that affect requirement definition, work package compilation, and domain impact review.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. When copied into a project, replace the metadata and keep every entry evidence-backed.

This file is not task progress. Use `planning-with-files` or handoff artifacts for task state, and use `docs/ai/improvement-ledger.md` for technical debt, validation gaps, and refactor candidates.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Human, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, product area, review range, incident, requirement discussion, or template note covered by the ledger. |

Ledger status values:

| Status | Meaning |
|---|---|
| `template` | Empty reusable format; no project-specific domain rules are recorded. |
| `active` | Project domain rules are being used for requirement definition, work packaging, and review. |
| `archived` | Ledger is retained for history but no longer receives updates. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
DR-0001
DR-0002
DR-0003
```

Rules:

- Never reuse an ID after a rule is deprecated, contradicted, archived, or deleted from an active project ledger.
- Keep IDs stable across status changes.
- Use one ID per distinct business rule. Split unrelated workflow rules instead of bundling them.
- Link rule IDs from Requirement Contracts, Work Packages, reviews, issues, docs, tests, or incident reports when they are used.

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly supported by repo files, docs, tests, runtime output, production behavior, or other direct evidence. |
| `Human-confirmed` | Confirmed by a responsible human or domain owner. |
| `Supported` | Plausible and indirectly supported, but not fully proven. |
| `Hypothesis` | Usable for question generation only, not for blocking review or implementation scope. |
| `Deprecated` | Retained for history, migration context, or old workflow explanation. |
| `Contradicted` | Retained as a visible conflict requiring human/domain-owner decision. |

Promotion rules:

- `Hypothesis` -> `Supported` requires cited supporting evidence.
- `Supported` -> `Verified` requires direct repo/docs/tests/runtime/production evidence.
- Any status -> `Human-confirmed` requires explicit human/domain-owner confirmation.
- Contradictions must remain visible. Do not overwrite a contradicted rule silently.

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `DR-0001` style identifier. |
| Rule | yes | The business/domain rule in direct language. |
| Business object | yes | Object the rule governs, such as account, order, approval, claim, report, or workflow item. |
| Business actor | yes | Human role, team, system, or agent affected by the rule. |
| Workflow | yes | Workflow or decision process where the rule applies. |
| State / condition | yes | State, trigger, precondition, exception, or timing condition. |
| Source | yes | Requirement, issue, doc, test, review comment, incident, production behavior, or human/domain-owner confirmation. |
| Evidence status | yes | One of the evidence statuses above. |
| Applies to | yes | Product area, module, API, UI, report, automation, review gate, or repo scope. |
| Used by | yes | `requirement-grill`, `work-package-compiler`, `review-domain-impact`, or another explicit consumer. |
| Last checked | yes | ISO date (`YYYY-MM-DD`) or `null` for template rows only. |
| Staleness trigger | yes | Event or condition that requires re-checking the rule. |
| Owner | yes | Responsible human, team, domain owner, or `unassigned`. |

## Domain Rule Entries

| ID | Rule | Business object | Business actor | Workflow | State / condition | Source | Evidence status | Applies to | Used by | Last checked | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

<!--
Example active row:
| DR-0001 | A refund over the configured threshold requires manager approval before payout. | Refund | Support agent; manager | Refund approval | Refund amount exceeds threshold | Human-confirmed: domain owner comment on ISSUE-123 | Human-confirmed | Refund workflow; payout service | requirement-grill; review-domain-impact | 2026-07-06 | Approval policy, threshold, or payout workflow changes | support-ops |
-->

## Stale Rule Review

Move or mark a rule for review when any of these are true:

- `Last checked` is older than the rule's staleness trigger permits.
- Current repo/docs/tests/runtime evidence no longer supports the rule.
- A domain owner contradicts or supersedes the rule.
- The workflow, business object, actor, approval path, or state semantics changed.
- A consumer such as `requirement-grill` or `review-domain-impact` reports insufficient or conflicting evidence.

Refreshing a stale rule requires:

- current source evidence,
- current evidence status,
- current owner or explicit `unassigned`,
- current staleness trigger,
- consumer list update,
- contradiction or deprecation decision when applicable.

Do not close stale or contradicted rules by silence.

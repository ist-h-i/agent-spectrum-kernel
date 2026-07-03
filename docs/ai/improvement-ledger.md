---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific improvement items recorded"
---

# Improvement Ledger Template

Use this file to preserve review-discovered debt, refactor candidates, rule gaps, validation gaps, and accepted risks that should not disappear after a PR review.

This checked-in file is an empty generic template. Do not add project-specific entries to this repository. When copied into a project, replace the metadata and keep every entry evidence-backed.

## Metadata / Ledger Status

| Field | Meaning |
|---|---|
| `ledger_status` | `template`, `active`, or `archived`. |
| `last_updated` | Date of the last ledger edit, or `null` for this template. |
| `evidence_owner` | Person, team, agent, or source responsible for evidence quality, or `null` for this template. |
| `source_scope` | Repository, project, PR range, audit scope, or template note covered by the ledger. |

Ledger status values:

| Status | Meaning |
|---|---|
| `template` | Empty reusable format; no project-specific entries are recorded. |
| `active` | Project ledger is being used for open, planned, converted, resolved, accepted, and stale entries. |
| `archived` | Ledger is retained for history but no longer receives updates. |

## Entry ID Convention

Use stable IDs in ascending order:

```text
IMP-0001
IMP-0002
IMP-0003
```

Rules:

- Never reuse an ID after an entry is resolved, converted, accepted, or deleted from an active project ledger.
- Keep IDs stable across status table moves.
- Use one ID per distinct finding. Split unrelated findings instead of bundling them.
- Link the ID from PRs, review comments, issues, rules, validation checks, or refactor tasks when follow-up work is created.

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in code, docs, tests, logs, CI output, runtime output, review comments, or user-provided evidence. |
| `Supported` | Backed by indirect evidence, repeated pattern, or related finding but not fully proven. |
| `Hypothesis` | Plausible but not yet validated; must not drive rule/check conversion without more evidence. |
| `Unknown` | Evidence is missing, unavailable, ambiguous, or outside the reviewed scope. |
| `Falsified` | Prior finding was contradicted by later evidence and should be resolved or closed. |

Every active entry must include source, evidence, impact, decision, status, and close condition. Do not add vague debt notes without these fields.

## Entry Fields

| Field | Required | Meaning |
|---|---|---|
| ID | yes | Stable `IMP-0001` style identifier. |
| Source | yes | PR, issue, review, CI, production incident, manual audit, or other source. |
| Finding | yes | What was observed. |
| Category | yes | `vulnerability`, `technical_debt`, `refactor_candidate`, `code_smell`, `maintainability`, `testability`, `performance`, `dependency`, `duplication`, `boundary`, `repeated_finding`, or `rule_gap`. |
| Evidence | yes | File / line / snippet / review comment / CI output / observed pattern, plus evidence status when useful. |
| Impact | yes | Why this matters if ignored. |
| Severity | yes | `critical`, `high`, `medium`, or `low`. |
| Urgency | yes | `now`, `soon`, `backlog`, or `observe`. |
| Decision | yes | `fix_now`, `separate_pr`, `backlog`, `convert_to_rule`, `convert_to_check`, `accept`, or `wont_fix`. |
| Recommended action | yes | Concrete next action. |
| Prevention target | yes | `AGENTS.md`, project overlay, `SKILL.md`, review checklist, validation script, lint/test/check, refactor task, or no prevention needed. |
| Owner | yes | Person, team, agent, or `unassigned`. |
| Status | yes | Current lifecycle status. |
| Created date | yes | Date the entry was created. |
| Refresh date | yes | Date by which evidence, urgency, or owner should be reviewed again. |
| Close condition | yes | Observable condition required to close, convert, or accept the entry. |

## Status Lifecycle

| Status | Meaning |
|---|---|
| `open` | Finding is recorded but not triaged. |
| `triaged` | Finding has category, evidence, impact, severity, urgency, and a preliminary decision. |
| `accepted` | Team accepts the finding as valid and intentionally tracks it. |
| `planned` | Follow-up work is planned but not started. |
| `in_progress` | Follow-up work is actively being done. |
| `resolved` | Close condition is satisfied and evidence is linked. |
| `converted_to_rule` | Finding became an AI rule, review checklist item, Skill update, or project overlay update. |
| `converted_to_check` | Finding became a validation script, lint rule, test, CI check, or similar executable guard. |
| `wont_fix` | Finding is intentionally closed without action, with rationale and owner. |
| `stale` | Entry missed refresh or its evidence no longer supports the current decision. |

Allowed transitions:

| From | To | When |
|---|---|---|
| `open` | `triaged` | Required fields have enough evidence for prioritization. |
| `triaged` | `accepted` | Finding is valid and should remain tracked. |
| `triaged` | `planned` | Follow-up work is selected. |
| `triaged` | `converted_to_rule` | Best prevention target is a rule/checklist/Skill/overlay update. |
| `triaged` | `converted_to_check` | Best prevention target is executable validation, lint, test, or CI. |
| `triaged` | `wont_fix` | Rationale and owner approve no action. |
| `accepted` | `planned` | Work is scheduled. |
| `planned` | `in_progress` | Work starts. |
| `in_progress` | `resolved` | Close condition is met and evidence is linked. |
| any active status | `stale` | Refresh date passes, evidence is invalidated, owner is missing, or decision no longer matches impact. |
| `stale` | `triaged` | Entry is refreshed with current evidence and decision. |
| `stale` | `wont_fix` | Updated evidence supports closing without action. |

## Open Improvement Items

| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Owner | Status | Created date | Refresh date | Close condition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Converted-to-Rule Items

Use this table when an entry becomes an AI implementation rule, review checklist item, Skill update, or project overlay update.

| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Owner | Status | Created date | Refresh date | Close condition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Converted-to-Check Items

Use this table when an entry becomes a validation script, lint rule, test, CI check, or other executable guard.

| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Owner | Status | Created date | Refresh date | Close condition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Resolved Items

Use this table only after the close condition has been met and linked evidence exists.

| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Owner | Status | Created date | Refresh date | Close condition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Accepted / Wont-Fix Items

Use this table for explicitly accepted risks or no-action decisions. Every row needs rationale, owner, and refresh date.

| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Owner | Status | Created date | Refresh date | Close condition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Stale Item Review Rules

Move an entry to `stale` when any of these are true:

- `Refresh date` has passed.
- Evidence no longer points to current code, docs, tests, CI, or review context.
- Owner is missing for an item that needs action.
- Severity, urgency, decision, or prevention target no longer matches the current impact.
- A converted rule or check was removed, disabled, or no longer covers the finding.

Refreshing a stale item requires:

- updated evidence,
- current impact,
- current severity and urgency,
- owner or explicit `unassigned`,
- decision,
- prevention target,
- next refresh date,
- close condition.

Do not close stale entries by silence. Move them to `triaged`, `resolved`, `converted_to_rule`, `converted_to_check`, or `wont_fix` only when the table row contains evidence for that state.

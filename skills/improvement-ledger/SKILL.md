---
name: improvement-ledger
description: Persist review findings, technical debt, refactor candidates, and rule feedback into an actionable improvement ledger.
---

# Improvement Ledger

## Goal

Turn evidence-backed review findings into durable improvement ledger entries so non-blocking debt, refactor candidates, rule gaps, validation checks, and accepted risks are not lost after a PR review.

This skill starts after detection. It classifies, prioritizes, records, and refreshes improvement items. It does not discover code-health findings and does not implement fixes or refactors.

## Use when

- `review-code-health` produces non-blocking debt, refactor candidates, code smells, vulnerabilities, repeated findings, or rule/check feedback.
- A review produces improvement items that should become separate PRs, backlog entries, validation checks, project overlay updates, review checklist items, or accepted risks.
- The user asks to update, triage, refresh, or close entries in `docs/ai/improvement-ledger.md`.
- A finding should be classified as current PR blocker, separate PR, backlog, rule feedback, validation check, or accepted risk.
- Stale ledger entries need owner, evidence, urgency, status, or close-condition review.

## Do not use when

- The finding is a current PR blocker that must be fixed before merge. Keep it in the review gate's required fixes.
- The task is to detect debt, smells, or refactor candidates. Use `review-code-health`.
- The task is to implement an approved refactor. Use `controlled-implementation` with a behavior-preservation Verification Contract, or a project-specific refactor workflow when available.
- The task is to change final review output semantics. Use the dedicated final review output integration workflow when applicable.
- The item is a vague opinion without source, evidence, impact, and decision.
- The user only wants a one-off review summary with no durable follow-up.

## Process

1. Read the ledger format.
   - Prefer `docs/ai/improvement-ledger.md` when it exists.
   - Treat `ledger_status: template` as a reusable empty format, not project-specific evidence.
   - Preserve the template's fields, status lifecycle, evidence key, and table structure.

2. Gather source findings.
   - Accept findings from PR reviews, `review-code-health`, issues, CI, production incidents, manual audits, or existing ledger rows.
   - Require source, finding, category, evidence, impact, severity, urgency, decision, recommended action, prevention target, owner/status, and refresh rule.
   - Reject or return `insufficient evidence` for vague debt notes.

3. Separate blockers from ledger candidates.
   - `fix_now` findings that block the current PR stay in the current PR review output.
   - Non-blocking findings can become separate PRs, backlog, rule feedback, validation checks, accepted risks, or wont-fix entries.
   - Do not force every PR review to create ledger entries.

4. Assign or preserve IDs.
   - Use the existing `IMP-0001` style convention.
   - Preserve IDs for existing entries.
   - For new entries, choose the next unused ID in ascending order.
   - Use one ID per distinct finding.

5. Classify each entry.
   - Category: `vulnerability`, `technical_debt`, `refactor_candidate`, `code_smell`, `maintainability`, `testability`, `performance`, `dependency`, `duplication`, `boundary`, `repeated_finding`, or `rule_gap`.
   - Decision: `fix_now`, `separate_pr`, `backlog`, `convert_to_rule`, `convert_to_check`, `accept`, or `wont_fix`.
   - Prevention target: `AGENTS.md`, project overlay, `SKILL.md`, review checklist, validation script, lint/test/check, refactor task, or no prevention needed.
   - Status: `open`, `triaged`, `accepted`, `planned`, `in_progress`, `resolved`, `converted_to_rule`, `converted_to_check`, `wont_fix`, or `stale`.

6. Place entries in the right table.
   - Open, triaged, accepted, planned, and in-progress work belongs in Open Improvement Items.
   - `converted_to_rule` belongs in Converted-to-Rule Items.
   - `converted_to_check` belongs in Converted-to-Check Items.
   - `resolved` belongs in Resolved Items.
   - `accept` / `wont_fix` decisions belong in Accepted / Wont-Fix Items.

7. Define refresh and close rules.
   - Every active entry needs a refresh date or review trigger.
   - Every entry needs an observable close condition.
   - Move entries to `stale` when evidence, owner, urgency, prevention target, or status no longer matches current reality.

8. Route follow-up without mixing responsibilities.
   - Rule/check conversion details can be handled later by prevention-rule feedback.
   - Refactor implementation belongs to refactor implementation workflow.
   - Final review output integration belongs to the final merge gate workflow.

## Output

```text
Improvement ledger update:
- Ledger target:
- Ledger status:
- Source reviewed:
- Entries added:
- Entries updated:
- Entries moved:
- Current PR blockers kept out of ledger:
- Follow-up routes:

Finding ID:
- IMP-0001

Source:
- PR / issue / review / CI / production incident / manual audit

Finding:
- What was observed

Category:
- vulnerability | technical_debt | refactor_candidate | code_smell | maintainability | testability | performance | dependency | duplication | boundary | repeated_finding | rule_gap

Evidence:
- File / line / review comment / CI output / observed pattern

Impact:
- Why it matters

Severity:
- critical | high | medium | low

Urgency:
- now | soon | backlog | observe

Decision:
- fix_now | separate_pr | backlog | convert_to_rule | convert_to_check | accept | wont_fix

Recommended action:
- Concrete next action

Prevention target:
- AGENTS.md | project overlay | SKILL.md | review checklist | validation script | lint/test/check | refactor task | no prevention needed

Owner / status:
- owner if known
- open | triaged | accepted | planned | in_progress | resolved | converted_to_rule | converted_to_check | wont_fix | stale

Refresh rule:
- When to revisit or close

Not recorded:
- Findings rejected for insufficient evidence or current-PR blocker status
```

## Exit criteria

- Entries match the fields and lifecycle in `docs/ai/improvement-ledger.md`.
- Current PR blockers are not hidden in the ledger.
- Non-blocking findings have a durable status, owner, refresh rule, and close condition.
- Rule/check/refactor follow-up is routed without implementing it inside this skill.
- Vague findings without evidence are rejected or marked insufficient evidence.

## Failure modes

| Failure | Correction |
|---|---|
| Duplicating `review-code-health` | Start from existing findings; do not rediscover debt. |
| Hiding blockers in backlog | Keep merge blockers in current PR required fixes. |
| Creating vague debt notes | Require source, evidence, impact, decision, status, and close condition. |
| Forcing ledger entries for every review | Use only when non-blocking follow-up needs durable tracking. |
| Mixing prevention or refactor work into ledger triage | Route conversion or implementation to the relevant later workflow. |

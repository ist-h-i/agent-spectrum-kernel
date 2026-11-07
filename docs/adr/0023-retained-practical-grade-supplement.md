# ADR-0023: Complete an unused verification slot against retained practical output

- Status: Proposed
- Date: 2026-11-07
- Extends: ADR-0019, ADR-0022
- Supersedes: None

## Context

A closed primary judgment can violate fixed consistency rules before the
planned independent verifier runs. Repeating the Task changes the answer and
wastes valid execution evidence. This is an after-case boundary, deliberately
outside the model-free preparation recovery in ADR-0019/0022.

## Decision

Use the existing once-only grade transport in a separate canonical peer store.
Bind one reserved slot to the original run and attempt, independently of provider,
recipe and report revisions. Admit only a closed, invalid primary with its
original verifier slot unconsumed. No Task or new primary is dispatched. A failure,
uncertain completion or crash after reservation consumes the slot; inspect it.

Dispatch only after the original run and its parent coordinators are quiescent.
Check every trial/grade/assessment closure and suspended execution, not merely
the completed status. Hold their existing operational locks while dispatching;
never rewrite their journals, results, profiles or environments.

Keep original outcomes and dispositions. A separate revision binds the original
report, supplement receipts and fresh host-AI use/reference/exclude choices.
Only the latest cohort/attempt may be selected, with one selection per logical
row. A grade does not repair Task, context or input failures. Record supplemental
grading and selection overhead separately; host-AI usage is unknown, not zero.

An explicit continuation input verifies both report digests and the revision's
lineage before supplying new feedback. It carries no old case/change approval.
The original human decision remains scoped to its original packet; a subsequent
cycle has fresh gates. A readout revision does not apply an asset or authorize
using an earlier change approval against new evidence.

## Alternatives and consequences

Reject clearing markers, repeating Tasks to repair grading, best-score selection,
arbitrary latest-file discovery, and weakening native grading authority to import
practical data. Existing custom graders remain unchanged. This opt-in recovery
requires a pinned adapter supplying the original closed grading receipts,
unchanged rule/source references and an unconsumed one-call verification budget.

## Verification / review trigger

Test suspended completion, pending provider work, provider changes, reservation
crashes, lost responses, result/packet transplants, old cohorts, valid low/range
scores, report regeneration and unchanged Task metrics. Review before admitting
new primaries, extra model budgets, runtime certification or owner effects.

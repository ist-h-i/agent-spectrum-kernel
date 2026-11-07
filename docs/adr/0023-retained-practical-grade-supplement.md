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
Only the latest attempt of each logical row may be selected. A trial-only retry
does not supersede the other condition's retained attempt; a case-wide retry
replaces each row through its own new attempt. A grade does not repair Task,
context or input failures. Record supplemental
grading and selection overhead separately; host-AI usage is unknown, not zero.

An explicit continuation input verifies both report digests and the revision's
lineage before supplying new feedback. It carries no old case/change approval.
The original human decision remains scoped to its original packet; a subsequent
cycle has fresh gates. A readout revision does not apply an asset or authorize
using an earlier change approval against new evidence. An explicit standard
operator revision transition may update the pending review before any decision
is consumed. It retains the original report and plan, refreshes the packet and
replans when applicable. Only its fresh packet can receive a human decision.
This changes the review view through an append-only journal event; grading and
readout generation themselves leave original records unchanged. Read-only lineage
validation can recognize only coordinator locks owned by the current process,
never an active evaluation lock or another process's coordinator lock.

A separate, explicit host continuation exception may handle a first-attempt
Codex CLI initialization EPERM before a session, with empty stdout, a closed
local Task group, no grade, and the linked incomplete read-only assessor. Bind
the approved plan, original command/invocation, parent configuration and every
native result/transport. Recheck original worker PIDs and a successful same-UID
cwd scan including the observer before admission and later dispatch gates.
Record this as `safe_to_continue`, preserving `process_closed:false`, the failed
Task, unknown assessor and unknown remote cost. It is an accepted operational
exception, not provider closure, quality evidence or owner authority. Only that
Task's trial retry can consume one existing extra/per-row slot in a fresh
workspace; the original assessor is retired without replay. Generic timeouts,
returned assessor evidence, owner targets and incomplete local observations
remain outside this exception. Supplement quiescence recognizes the same
validated exception for these exact retired jobs, retaining all uncertainty.

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

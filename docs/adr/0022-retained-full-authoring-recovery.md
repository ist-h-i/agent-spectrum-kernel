# ADR-0022: Recover a closed Full authoring answer without model replay

- Date: 2026-11-07
- Status: Proposed
- Extends: ADR-0019
- Supersedes: None

## Context

Full authoring can complete before trusted source generation fails. Clearing a
consumed journal risks duplicate model work; repeating authoring wastes a valid
answer and changes the candidate. ADR-0019's existing model-free native failure
port deliberately excludes this situation.

## Decision

Add a separate Full practical preparation port with positive local provider
closure and exact retained answer/transcript binding. Preserve the failed run;
reconstruct in fresh source, lifecycle and Eval paths. Pin the origin, require
unchanged authoring input, start no new model and carry no human approval.
Restore the original provider with a fresh session for subsequent cycles.
Legacy receipts reconstruct input from pinned source/profile; future receipts
capture its digest. Neither is a claim about the model's entire context or remote
closure. Keep this distinction visible in execution provenance.

## Options considered

Replay or clear the failed stage was rejected for duplicate effects. Treating an
arbitrary fixture as a new model answer was rejected for lost provenance.
Discarding all closed answers was rejected for avoidable repeated cost. Extending
the native model-free admission in place would blur its existing guarantees.

## Consequences

A bounded new origin record and CLI are maintained. Fresh human gates and normal
source validation remain authoritative. A valid model response may still fail
static validation; retain the new failure and diagnose instead of retrying blindly.
No new sharing, Registry, dependency or model authority is introduced.

## Verification / review trigger

Review before admitting after-case or owner effects, uncertain provider work,
multiple responses, changed requests or additional provider kinds. Formal
R01..R07 in `docs/instruction-loop-retained-authoring.md` cover this boundary.


## Pre-case grader refresh (2026-11-08)

The same retained answer can also be prepared from an unfinished first case
gate, before any case approval/trial or lifecycle effects. A distinct CLI
`reconfigure-evaluation` and v2 origin name the successful source status and
candidate instead of claiming a failed job. The original journal stays fixed.
Only task commands and per-case grader definitions may change, with the public
case inputs, criteria references, authoring request, baseline and owner unchanged.
Normal source validation and a fresh human case packet remain mandatory; no
authoring provider replay is possible. Advancing the old source gate invalidates
reuse rather than silently transferring authority. See the pre-evaluation spec.

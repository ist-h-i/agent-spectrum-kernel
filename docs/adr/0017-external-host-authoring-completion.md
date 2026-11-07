# ADR-0017: Bind external host authoring to one durable claim and completion

- Status: Proposed
- Date: 2026-11-07
- Upstream: ADR-0005, ADR-0010, ADR-0016
- Contract: `docs/instruction-loop-host-authoring.md`
- Supersedes: None

The supervised loop previously had only synchronous Codex/fixture authoring.
Standalone adapter-neutral prepare/import did not retain a suspended generation
job. Re-invoking generation after an external result could duplicate composition,
model work or candidate state, while treating an unknown invocation as completed
would invent execution evidence.

Add a component-only external-host port. Persist exact private preparation,
publish its digest in the supervisor journal, reserve one immutable host claim,
and validate a completion against that request and claim. Lost claim responses
require inspection of the original execution. A completion carries explicit
host-reported closure; it does not authenticate an app, prove remote termination
or convey case/application authority. Both existing human gates remain.

Alternatives: dispatch a guessed Claude app command (rejected: environment and
capabilities are unknown); rerun standalone prepare/import on every resume
(rejected: consumed work could repeat); treat a model response as completion
(rejected: no execution closure); wait for an authenticated app before building
the port (rejected: the durable protocol is independently testable).

This additive provider port is reversible for fresh runs, but persisted jobs retain
their original pinned runtime. No source migration or partial-effect repair is
implied. A crash during local finalization stays uncertain under ADR-0016. Review
before claim takeover/retry, automatic dispatch, remote termination assertions,
new provider authority, or automatic partial-write recovery. No new dependency,
Registry, grader, scheduler or approval type is introduced.

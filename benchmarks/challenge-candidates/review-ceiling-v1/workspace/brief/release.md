# Shared Console: release brief

This is a synthetic product scenario. ReviewOps previously ran as a local VS Code extension. The proposed Shared Console serves multiple teams while preserving local review artifacts, review resolution and explicit human approval. The old design documents remain useful history, not blanket proof that the new architecture meets this release's requirements.

## Users and workload

- 24 organizations, 420 reviewers; about 18,000 active/archived reviews and 270,000 evidence records. A normal team has 300–800 open reviews; one has 8,000.
- Reviewers inspect findings, evidence and fix plans; team leads filter and bulk-publish approved summaries. Observers may read but not publish. A user may belong to more than one team, but that never grants access to an unrelated organization's artifacts.
- On-call users use narrow mobile screens. Some use keyboard navigation and reduced-motion preferences. A view is sometimes left open while approval/evidence changes elsewhere.
- Network failures are routine: list, evidence, metrics and history can fail independently. Unknown or stale values must not masquerade as current confirmed values. A screen can remain useful without enabling an unsafe action.

## Release constraint

A five-day pilot for three existing teams is proposed. Available engineering capacity before pilot: 120 hours, shared between frontend, backend and review/testing. A wider rollout is not committed. A concrete staged/limited alternative is acceptable if justified against the actual hazards. Do not invent estimates as facts; show assumptions and dependencies.

No customer-facing publication or data migration has been authorized in this exercise. Your deliverable is a release recommendation and executable evidence, not the release itself.

## Continuity

The existing VS Code clients must continue to read/import local artifacts for at least four weeks. Shared Console must not silently change an old record's review status, evidence reference, owner, or meaning during conversion. Any migration proposal needs a reversible/compatible path and a clear owner. A successful UI action must correspond to the state the next client reads, not only to the last HTTP response.

## Performance and operation

- List/detail interactive responses: target p95 under 800 ms for the supplied representative workload, with visible progress for slower work.
- 100,000-record export: bounded memory and streamed/background operation rather than blocking all team activity. Normal reviewers should remain able to read while export or provider retry is running.
- These are product acceptance targets, not measured evidence. A small local smoke test cannot establish production p95 or capacity. Use work-count/scaling tests where full scale or infrastructure is unavailable and specify the remaining validation.
- Interrupted publish/retry must not duplicate the external effect; after a response is lost an operator must be able to distinguish pending, succeeded, failed and unknown.
- Operational records must connect user intent, approval, workspace/team, attempt, external effect and outcome without exposing artifact content or tokens to unrelated users.

## Decision ownership

The team lead owns approval to publish. Security boundaries and data ownership are not optional performance optimizations. The release manager can defer noncritical polish, but needs concrete risk, rollback/containment and verification conditions. The reviewer may propose a simpler design; no prescribed framework, abstraction or maximum file count is required.

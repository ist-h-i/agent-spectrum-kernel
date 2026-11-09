# ADR-0026: Separate ASK source publication from consumer installation

- Status: Proposed
- Date: 2026-11-09
- Upstream: instruction-loop-source-application@1; ADR0014; supervised instruction loop
- Supersedes: None

## Context

A null-owner evaluation can retain an accepted candidate but cannot publish it.
The normal owner worker installs a consumer Full environment; pointing it at ASK
would not update ASK's canonical source. The first accepted source delta needed
host-side Git/PR work and an omitted generated Claude fingerprint refresh.

## Decision

Keep consumer installation and null-owner semantics. Add an explicit, host-pinned
source owner to the Full practical runtime. Reuse its plan/change/apply/version/
cleanup pipeline, the existing source binding and external-host claim/completion
pattern. Synchronize the fixed Claude entries during candidate generation.

The change packet binds the exact repository, base/tree, new branch and measured
source delta. After approval, a separate private Git clone and durable execution
claim standardize publication through the host AI's existing tools. Core does not
own credentials, independently certify remote CI/review, or implement a universal
GitHub publisher. It validates retained Git content/graph and marks remote
statements as host-reported. PR publication alone cannot activate an Asset or
become the next baseline; a verified merged completion is required.

The merged owned clone is retained as source/version evidence and the next
baseline. No shared checkout or remote ref is reset or deleted. Source restoration
uses a separately pinned exact revert candidate/change plan, never the consumer
rollback adapter. This first port does not automatically generate inverse plans.

## Alternatives and consequences

Reusing the Full installer changes the wrong owner. Marking a PR as applied
promotes an unmerged baseline. Embedding repository credentials, CI/review policy
and automatic merge recovery in core creates another publisher. Keeping untyped
host instructions loses exact approval and resume binding. The selected boundary
adds one optional durable host port while preserving the two human judgment types.

## Verification and review trigger

Model-free local-Git/fake-host tests cover pre-approval isolation, exact source and
remote/base binding, one claim, response-loss inspection, PR-only rejection,
merged tree checks and continuation. Real remote execution is a separate approved
acceptance run. Revisit this decision before adding an automatic remote transport,
new authentication authority, source inverse-plan generator or another owner kind.

# ADR-0016: Evaluate exact environments while retaining individual Asset authority

- Status: Proposed
- Date: 2026-11-05
- Upstream: ADR-0003, ADR-0004, ADR-0005, ADR-0014
- Supersedes: None

An instruction environment is a CAS projection of independently registered
Skills/Prompts plus explicitly selected supporting files. It is not a new Asset
type, Registry, Portfolio, scoring policy, current pointer or adoption authority.
An authoring export may have no Portfolio selection; an evaluation must bind the
complete selected instruction set and its exact existing Evolution roles.

The additive `instruction_environment_v1_exact` Evolution projection binds both
environment object digests before outcomes. Each adapter has a separate
experiment. Supporting bytes and runtime identity cannot drift within a declared
one-factor change. Existing recommendation, approval and rollback authority still
apply. The existing generic materializer/runner execute the exact full-profile
environment; the Codex primary and its scoring/admission inputs are unchanged.

Mechanical invocation evidence, tool results, command expansion, self-report and
quality outcomes remain separate. Missing events are unobserved. A local import
never turns exporter configuration on or authenticates the supplied log.

Fresh/manual environment targets use the existing installer file lifecycle and
the existing target lock/state slot. Normal installer owners are refused rather
than left with stale ownership hashes. Generalizing the current-full Codex
five-Prompt lease to arbitrary Skills and Claude is a separate remaining task;
this boundary does not silently extend ADR-0014's lease. Partial application is
left marked for inspection, with no automatic retry/repair.

Alternatives rejected: individual-Skill scores as environment effectiveness;
LLM self-report as mechanical evidence; a new environment Registry or grader;
and overwriting files still owned by a normal installer.

Review before normal-owner transfer, automatic telemetry enablement, unbounded
ambient configuration capture, cross-adapter score pooling, causal attribution,
new-Asset adoption semantics or automatic partial-write recovery.

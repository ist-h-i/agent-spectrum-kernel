# ADR-0012: Scoped runtime observation transport

- Status: Proposed (Draft implementation; integration owned by parent)
- Date: 2026-10-12
- Scope: bounded carrier for existing verified ASK command observations
- Related contract: `docs/runtime-observation-carrier-contract.md`
- Related decisions: ADR-0001, ADR-0007

## Context

Additional evaluation fixtures need runtime command references and bounded private bodies without treating final state as proof that no attempted action occurred. The current protected paths already authenticate command identity/status/output digest and retained primary stdout. They do not authenticate all native interfaces, specific-action approval or actual loaded measurement source. Performance has a separate unresolved measurement producer/phase contract.

## Decision proposed

Reuse execution inspection and current normalization to derive an opt-in private sidecar, and reuse the production sealed evaluation-input snapshot for its selected record/body. Preserve existing schemas and evidence-reference kinds; results cite only original verified command references. Treat the source digest as snapshot evidence, keep unobserved actions/approval/load-time source Unknown, and define completeness only for the declared command interface. Do not add an observer, runner, permission, model call or automatic scoring rule.

## Consequences

Fixture owners can consume supported observations under a new processing/source/review/admission version. Native bodies are available only where already retained with producer custody. Other routes expose metadata with explicit missingness. Individual gate applicability and semantic approval remain fixture-owner decisions. Existing frozen sources/results are untouched. A future load-time performance producer or noncommand interface needs its own reviewed capability contract rather than broadening this transport implicitly.

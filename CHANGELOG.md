# Changelog

## Unreleased

Changes:

- Added `review-architecture-impact` as the dedicated structural and boundary review gate.
- Routed review architecture impact through the new gate while keeping detailed boundary mechanics in `application-boundary-architecture` and durable architecture records in `adr-review`.
- Removed the legacy code review compatibility adapter and standardized review entry points on `review-router`.
- Added layer-aware final merge decisions to `review-final-merge-gate`, including layer summaries and upper-layer precedence over mechanical passes.

## v2.3.0

Purpose: add a framework-agnostic application boundary workflow for architecture decisions that are too concrete for ADR-only routing.

Changes:

- Added `application-boundary-architecture`.
- Routed unresolved boundary, dependency direction, state ownership, external I/O, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper, ID boundary, and architecture guard decisions to the new skill before returning to the normal implementation route.
- Updated manifest, README files, usage docs, workflow examples, skill matrix, custom instructions, and validation report.

## v2.2.0

Purpose: add a non-evaluative MR documentation workflow that turns merge requests into reusable specification context.

Changes:

- Added `mr-readme-generation` for creating MR-specific README documents.
- Routed MR README / specification understanding tasks separately from PR review and merge decisions.
- Added usage guidance and an example for MR README generation.
- Updated manifest and validation report for the new skill.

## v2.1.0

Purpose: split PR/code review responsibility so automated checks, AI quality review, domain impact, and final merge decisions are explicit.

Changes:

- Added `review-router` for selecting required review gates.
- Added `review-automated-gate` for formatter/linter/typecheck/build/test/CI evidence.
- Added `review-ai-quality` for AI-assessable implementation review without final approval.
- Added `review-domain-impact` for business rules, state semantics, workflow, responsibility, and operational meaning.
- Added `review-final-merge-gate` as the only gate that emits final merge decisions.
- Updated README, usage docs, workflow examples, and routing tables to use the new review model.

## v2.0.0

Purpose: raise the set from a usable v1 baseline to a personal/internal-use target of 95+ across kernel design, skill separation, safety, verification, review, evidence, and handoff quality.

Changes:

- Added kernel `Safety and External Effects` section.
- Added kernel minimal skill routing table.
- Added `risk-gate` skill.
- Added `controlled-implementation` skill.
- Kept v1 skill names where possible to reduce migration friction.
- Strengthened all skills with exit criteria, output contracts, and failure modes.
- Added Japanese usage guide.
- Added workflow examples.
- Added quality rubric.
- Added project overlay template.

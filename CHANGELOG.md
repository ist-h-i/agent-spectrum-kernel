# Changelog

## Unreleased

Changes:

- Added the canonical lifecycle artifact contract for Requirement, Spec, Work Package, Verification, and Implementation responsibilities, including reference-plus-delta inheritance, compact/partial paths, contradiction stops, aligned skills/adapters, and eight validated workflow-chain scenarios.
- Added Checkpoint B2 with four hash-pinned medium-hard/hard benchmark fixtures, nested-workspace isolation, requirement-to-hidden-test scoring, frozen quality-gain thresholds, config-selectable execution, and a measured Kernel-versus-Full-ASK value report.
- Added a preregistered comparative benchmark for Plain Agent, Kernel-only, and Full ASK, including review and implementation fixtures, a bounded Codex runner, normalized results, evaluator rules, fixed thresholds, and a separate post-#179 checkpoint.
- Renamed project-facing branding to Agent Spectrum Kernel across repository metadata, README files, docs, and adapter descriptions.
- Added the Requirement-to-Rule Loop skills: `next-best-change-finder`, `requirement-grill`, `work-package-compiler`, `review-to-rule-compiler`, and `domain-rule-ledger`.
- Added `docs/ai/domain-rule-ledger.md` and `schemas/domain-rule-ledger-entry.schema.json` for evidence-status-labeled domain rules.
- Enhanced `review-domain-impact` to consume Requirement Contracts, Work Packages, domain rule ledgers, review context, and repository orientation evidence.
- Updated routing docs, adapters, validation, fixtures, and validation report for the new loop.

## v3.0.0

Purpose: reflect the layered routing, adoption, observability, reporting, and release-readiness architecture now represented in the package.

Changes:

- Bumped `manifest.json` from `2.3.0` to `3.0.0`.
- Added `operating-mode-router` and `docs/routing-model.md` so the system first separates delivery/quality, adoption/bootstrap, observability/metrics, and operation/automation.
- Added `project-adoption-pack-generation` for first-time repository or team rollout.
- Added `skill-effectiveness-evaluation` for one-task workflow retrospective evaluation.
- Added `skill-adoption-metrics`, `docs/metrics-event-contract.md`, `docs/ai/skill-adoption-metrics.md`, and adoption report templates for opt-in adoption measurement.
- Added skill group metadata to `manifest.json` and validation coverage for unclassified, unknown, duplicate, invalid, and unsupported multi-group skill entries.
- Added `release-readiness-gate` for release package readiness checks across scope, validation, migration/data, rollback, rollout controls, monitoring, post-release verification, customer impact, communication, approvals, and residual risks.
- Added `angular-implementation-architecture` as the first concrete stack implementation overlay for Angular-specific implementation constraints and verification supplements.
- Added `review-architecture-impact` as the dedicated structural and boundary review gate.
- Routed review architecture impact through the new gate while keeping detailed boundary mechanics in `application-boundary-architecture` and durable architecture records in `adr-review`.
- Removed the legacy code review compatibility adapter and standardized review entry points on `review-router`.
- Added layer-aware final merge decisions to `review-final-merge-gate`, including layer summaries and upper-layer precedence over mechanical passes.
- Added `review-context-generation` and `docs/ai/review-context.md` for durable review context with evidence-status-labeled claims.
- Added `implementation-context-generation` and `docs/ai/implementation-context.md` for durable implementation context with evidence-status-labeled stack, command, pattern, boundary, overlay, stop-condition, and update-trigger claims.
- Added `review-output-quality` for human, system, AI, and generated output review.
- Added `review-adversarial-risk` for noise-controlled severe failure-path review.
- Routed output-quality and adversarial-risk signals out of `review-ai-quality` and into dedicated review gates.
- Added onboarding docs for quick start, prompt recipes, glossary, usage, workflow examples, and skill matrix guidance around the expanded routing model.
- Clarified that implementation uses a Verification Contract, an Implementation Contract, optional project/stack overlays, and evidence handling.

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

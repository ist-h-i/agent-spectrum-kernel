---
name: implementation-context-generation
description: Generate and maintain durable implementation context with evidence-status-labeled claims for repeated implementation tasks, stack conventions, commands, tests, and boundaries.
---

# Implementation Context Generation

## Goal

Create or update reusable implementation context so repeated implementation tasks do not rediscover stack shape, commands, conventions, boundaries, generated-file rules, and stop conditions from scratch.

This skill is framework-agnostic. Stack-specific rules belong in optional project overlays, not in this generic workflow.

## Use when

- Repeated implementation work is expected in the same repository.
- The stack, workspace shape, commands, test style, or generated/manual-edit boundaries are not yet durable.
- A project overlay exists or may be needed, and generic implementation context should point to it without replacing it.
- `controlled-implementation` or `test-first-verification` would benefit from known commands, local patterns, or stop conditions.

## Do not use when

- The task only needs transient progress tracking. Use `planning-with-files`.
- The user only needs one tiny local edit and implementation conventions are already obvious.
- The project wants permanent agent behavior rules. Reference or update project overlay rules such as `AGENTS.project.md` instead.
- You would need to ask the user to fill a blank form from scratch.
- You are documenting review-only personas, accepted risks, or known issues. Use `review-context-generation` unless the item directly affects implementation.

## Default path

Prefer:

```text
docs/ai/implementation-context.md
```

If the project prefers hidden agent files, use:

```text
.agent/implementation-context.md
```

If the context belongs in permanent project rules, reference or update:

```text
AGENTS.project.md
```

## Context status metadata

The context file must include explicit metadata:

```yaml
context_status: template | initialized | stale
last_updated:
evidence_owner:
source_scope:
```

Interpretation:

- `template`: default uninitialized context. Treat placeholder rows, blank rows, and `Unknown` values as missing or insufficient evidence, not reusable project facts.
- `initialized`: real project facts have been recorded with evidence status and source. Consumers may use the recorded claims according to their evidence status.
- `stale`: previously initialized context may be outdated because source files, commands, package/workspace shape, tests, boundaries, generated-file policy, overlays, or stop conditions changed. Refresh before relying on it, or downgrade affected claims to `Unknown` / `insufficient evidence`.

## Evidence statuses

Use these statuses for important claims:

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in repo files, docs, tests, runtime output, command output, or user input. |
| `Supported` | Backed by indirect evidence but not fully proven. |
| `Hypothesis` | Plausible inference that needs confirmation before being used as fact. |
| `Human-confirmed` | Confirmed by a human owner in the current or prior documented implementation context. |
| `Unknown` | Not inspected, unavailable, ambiguous, or outside current evidence. |

## Process

1. Read existing context status first.
   - If `context_status` is `template`, treat the file as missing durable context and populate only from repository evidence or targeted human input.
   - If `context_status` is `initialized`, preserve evidence-backed content unless contradicted by newer evidence.
   - If `context_status` is `stale`, refresh affected sections before use, or mark the affected implementation assumptions as `insufficient evidence`.

2. Inspect repository evidence first.
   - README and setup docs.
   - Package, workspace, build, dependency, and CI files.
   - Test, lint, typecheck, build, focused-test, and local run commands.
   - Existing implementations near common change areas.
   - Existing tests near common change areas.
   - Project overlay rules, docs, ADRs, schemas, generated artifacts, and examples.
   - `docs/ai/review-context.md` only for implementation-relevant constraints; do not duplicate review-only content.

3. Draft candidate context.
   - evidence status key,
   - stack inventory,
   - package/workspace shape,
   - build, typecheck, lint, test, focused-test, and run commands,
   - implementation patterns by area,
   - test patterns by change type,
   - architecture boundaries and public contracts,
   - error handling, logging, and observability conventions,
   - state and data-flow conventions,
   - generated, vendored, and manual-edit boundaries,
   - common implementation recipes,
   - stack overlay hooks,
   - stop conditions requiring re-planning or human decision,
   - update triggers.

4. Label each important claim with evidence status and source.
   - Do not treat inferred framework conventions as fact.
   - Mark unsupported conventions as `Hypothesis` or `Unknown`.
   - Prefer exact command sources such as package scripts, Make targets, CI jobs, or docs.

5. Ask the user only for missing or high-impact human judgment when needed.
   - preferred verification depth,
   - generated/manual-edit boundary,
   - project-specific overlays,
   - hard stop conditions,
   - commands that are intentionally not safe to run.

6. Save or update the context file.
   - Change `context_status` from `template` to `initialized` only after at least one real project fact is recorded with a non-empty source.
   - Set `last_updated` to the evidence update date or timestamp.
   - Set `evidence_owner` to the human, agent, team, or source responsible for the update.
   - Set `source_scope` to the repository paths, docs, package/build files, tests, or human input scope inspected.
   - Use `stale` when existing context is known or strongly suspected to lag behind changed source evidence; do not silently rely on stale claims.
   - Preserve existing `Human-confirmed` content unless contradicted by newer evidence.
   - Keep task progress out of this file.
   - Keep stack-specific rules in overlay hooks or linked project overlay files.
   - Add update triggers so future agents know when context may be stale.

7. Wire consumers by instruction, not by changing unrelated workflows.
   - `repository-orientation` may recommend this skill when implementation context is missing or stale.
   - `controlled-implementation` should read this context when available.
   - `test-first-verification` should use this context for commands and test patterns when available.
   - Consumers must treat `context_status: template` as missing context and `context_status: stale` as insufficient evidence for affected claims until refreshed.
   - Stack overlays may extend this context, but must not replace it.

## Output

```text
Implementation context generation:
- Path:
- Created or updated:
- Stack inventory:
- Commands found:
- Implementation patterns found:
- Test patterns found:
- Boundary rules found:
- Hypotheses needing confirmation:
- Unknowns:
- Stack overlays detected:
- Stop conditions:
- Update triggers:
```

## Exit criteria

- A reusable implementation context file is created or updated.
- `context_status` is `initialized` only after real project facts are recorded with sources; otherwise `template` or `stale` is explicit.
- Important claims have evidence status and source.
- The context is framework-agnostic and only points to stack overlays.
- Task progress is not stored in implementation context.
- Commands and test patterns are tied to repository evidence or marked as unknown.
- Stop conditions and update triggers are explicit.

## Failure modes

| Failure | Correction |
|---|---|
| Asking the user to fill a blank template | Inspect repo evidence first and ask only targeted questions. |
| Embedding Angular, React, Python, Java, or other stack-specific rules in this generic skill | Move those rules to stack overlay hooks or project overlay skills. |
| Treating inferred conventions as fact | Mark them `Hypothesis` or `Unknown` until verified or human-confirmed. |
| Storing task progress here | Move progress to `planning-with-files`. |
| Duplicating review-only context | Link `review-context-generation` output instead and copy only implementation-relevant constraints. |
| Letting context go stale silently | Add update triggers and evidence sources. |
| Treating a checked-in template as context | Keep `context_status: template` and report missing or insufficient evidence until real project facts are recorded. |

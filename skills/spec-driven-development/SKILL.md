---
name: spec-driven-development
description: Convert a feature or behavior request into a spec, plan, task breakdown, and verification plan before implementation. Use for new behavior, cross-file work, or vague requirements.
---

# Spec-Driven Development

## Goal

Move from vague intent to executable constraints before writing code.

## Use when

- The request changes user-visible or caller-visible behavior.
- The implementation touches multiple files/modules.
- Acceptance criteria are missing.
- Edge cases are unclear.
- Migration, compatibility, or rollout may matter.

## Do not use when

- The task is a trivial localized edit.
- A current spec and verification plan already exist.

## Process

1. Draft the spec at the smallest useful fidelity.

```text
Spec:
- Problem:
- Users/callers affected:
- Desired behavior:
- Non-goals:
- Inputs:
- Outputs:
- State changes:
- Error cases:
- Edge cases:
- Backward compatibility:
- Security/privacy constraints:
- Performance constraints:
- Acceptance criteria:
```

2. Validate the spec.
   - Are acceptance criteria observable?
   - Are non-goals explicit?
   - Are edge cases represented?
   - Is there a smallest deliverable slice?
   - What would falsify success?
   - Which assumptions are still unresolved?

3. Create the implementation plan.

```text
Plan:
- Files/modules likely touched:
- Existing patterns to reuse:
- New tests:
- Migration/compatibility concerns:
- Verification commands:
- Rollback path:
```

4. Break into tasks.

Each task must:
- be independently reviewable,
- have a clear verification method,
- avoid mixing refactor and behavior change unless necessary,
- preserve a working state after completion.

5. Stop before implementation if the next task cannot be scoped or verified.
   - Present the next action in work terms. Use skill names only in the internal route or advanced/debug notes.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the spec artifact below; it does not repeat the envelope fields.

```text
Spec summary:
- ...

Plan:
- ...

Tasks:
1. ...

Verification:
- ...

Open assumptions:
- ...
```

## Exit criteria

- The next implementation task is narrow.
- Acceptance criteria are testable.
- Non-goals and edge cases are explicit.
- Verification is defined before code changes.

## Failure modes

| Failure | Correction |
|---|---|
| Treating the prompt as the spec | Extract acceptance criteria. |
| Listing tasks without verification | Attach verification to each task. |
| Over-specifying trivial work | Use kernel only. |
| Hiding assumptions in the plan | List them explicitly. |

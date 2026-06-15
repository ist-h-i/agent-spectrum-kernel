---
name: spec-driven-development
description: Convert a feature or behavior request into a spec, plan, and task breakdown before implementation. Use for new features, behavior changes, cross-file work, or vague requirements.
---

# Spec-Driven Development

## Goal

Move from vague intent to executable constraints before writing code.

## When to use

Use when:
- The request changes user-visible behavior.
- The implementation touches multiple files or modules.
- Requirements are ambiguous.
- Acceptance criteria are missing.
- The task may need tests, migration, or rollout.

Do not use for trivial edits.

## Process

1. Draft the spec.

```text
Spec:
- Problem:
- Users / callers affected:
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
   - Are the criteria observable?
   - Are non-goals explicit?
   - Are edge cases represented?
   - Is there a smallest deliverable slice?
   - What would falsify success?

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
- avoid mixing refactor and behavior change unless necessary.

5. Implement only after the spec and first task are clear.

## Output

```text
Spec summary:
- ...
Plan:
- ...
Tasks:
1. ...
Verification:
- ...
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The prompt is the spec.” | Prompts are usually incomplete. Acceptance criteria are the spec. |
| “I can infer edge cases.” | Inferred edge cases must be named. |
| “We can test after implementation.” | Testability must shape the plan before implementation. |

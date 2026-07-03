# Example: New feature

## Request

```text
Add CSV export for the task list.
```

## Workflow

Use:

```text
spec-driven-development → controlled-implementation → test-first-verification
```

## Expected first response

```text
Spec summary:
- Problem:
- Users/callers affected:
- Desired behavior:
- Non-goals:
- Inputs/outputs:
- Edge cases:
- Acceptance criteria:

Plan:
- Files/modules likely touched:
- Existing patterns to reuse:
- New tests:
- Verification commands:

Implementation Contract:
- Goal:
- Change class:
- Allowed files/modules:
- Forbidden files/modules:
- Boundary decision:
- Implementation context:
- Stack overlay used:
- Verification contract:
- Stop conditions:

Verification Contract:
- Behavior to prove:
- Existing coverage:
- New or focused test needed:
- Commands:
- Evidence required:
- What remains unverified:

Tasks:
1. Add export behavior behind existing UI/action boundary.
2. Add tests for escaping, empty list, and visible columns.
3. Verify focused tests and typecheck.

Open assumptions:
- ...
```

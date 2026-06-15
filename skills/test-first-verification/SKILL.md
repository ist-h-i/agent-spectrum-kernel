---
name: test-first-verification
description: Establish observable verification before or alongside implementation. Use for bug fixes, new behavior, regressions, refactors, and any change that needs proof.
---

# Test-First Verification

## Goal

Make success observable before declaring the work complete.

## Process

1. Identify the behavior under test:
   - input/action
   - expected output/state
   - failure mode
   - edge case
   - regression condition

2. Prefer a failing test first when feasible.
   - For bug fixes: reproduce the bug.
   - For features: encode acceptance criteria.
   - For refactors: protect unchanged behavior.
   - For UI: add or run an interaction-level check if available.

3. Implement the smallest change.

4. Run verification:
   - focused test
   - broader relevant test
   - typecheck
   - lint
   - build
   - runtime/manual check when behavior is user-visible

5. Record evidence exactly:
   - command run
   - result
   - failures
   - skipped checks and why

6. Do not claim success from code inspection alone unless no executable verification is available.

## Output

```text
Verification plan:
- ...

Evidence:
- command:
  result:
- command:
  result:

Not verified:
- ...
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “I know this works.” | Knowledge without evidence is a hypothesis. |
| “Existing tests are enough.” | Identify which tests cover the changed behavior. |
| “The change is only a refactor.” | Refactors need behavior-preservation evidence. |
| “Manual check is enough.” | Manual checks may supplement tests; they rarely replace them. |

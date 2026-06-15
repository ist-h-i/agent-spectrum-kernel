---
name: test-first-verification
description: Establish observable verification before or alongside implementation. Use for bug fixes, new behavior, regressions, refactors, and any change that needs proof.
---

# Test-First Verification

## Goal

Make success observable before declaring the work complete.

## Use when

- Behavior changes.
- A bug fix needs reproduction.
- A refactor must preserve behavior.
- A claim of correctness, performance, security, or reliability will be made.
- Existing test coverage is unclear.

## Do not use when

- The change is purely textual and no behavioral verification is meaningful.

## Process

1. Identify the behavior under test.

```text
Behavior:
Input/action:
Expected output/state:
Failure mode:
Edge case:
Regression condition:
```

2. Prefer a failing check first when feasible.
   - Bug fix: reproduce the bug.
   - Feature: encode acceptance criteria.
   - Refactor: protect unchanged behavior.
   - UI: run or add interaction-level check if available.
   - Performance: define measurement method before claiming improvement.

3. Choose verification depth.

| Depth | Use when |
|---|---|
| Focused test | Local behavior or bug reproduction. |
| Broader test | Shared module or public behavior changed. |
| Typecheck/lint/build | Compile/static guarantees matter. |
| Manual/runtime check | User-visible or integration behavior lacks automated coverage. |
| Benchmark/security check | Performance/security claim is being made. |

4. Run verification and record exact evidence.

5. If verification fails, report failure. Do not bury it under partial success.

6. If verification cannot run, provide the exact next verification path.

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

Next verification:
- ...
```

## Exit criteria

- The changed behavior has an observable check.
- Commands/results are exact.
- Unverified items are explicit.
- Success is not claimed from code inspection alone unless no executable check exists.

## Failure modes

| Failure | Correction |
|---|---|
| “I know this works.” | Treat as hypothesis until verified. |
| Existing tests assumed sufficient | Identify which tests cover the changed behavior. |
| Manual check used as proof of all behavior | Scope manual evidence narrowly. |
| Invented command output | Never invent results; say not run. |

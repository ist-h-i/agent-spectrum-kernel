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

1. Produce the Verification Contract before or alongside implementation planning.

Use available repository context for commands, existing coverage, and test patterns. If a stack or project overlay supplies verification supplements, apply it without hard-coding stack-specific rules into this skill.

```text
Verification Contract:
- Behavior to prove:
- Regression to prevent:
- Existing coverage:
- New or focused test needed:
- Negative cases:
- Manual/runtime check:
- Commands:
- Evidence required:
- Stack overlay verification supplement:
  - none | project-specific | stack-specific
- What remains unverified:
- Stop if:
```

2. Tie the contract to the change type.

- Bug fix: require reproduction evidence before the fix when feasible.
- New behavior: tie checks to acceptance criteria.
- Refactor: require evidence that existing behavior is preserved.
- Output change: require an output artifact, sample response, rendered text, schema, or contract when relevant.
- Performance: define measurement method before claiming improvement.

3. Prefer a failing check first when feasible.

4. Choose verification depth.

| Depth | Use when |
|---|---|
| Focused test | Local behavior or bug reproduction. |
| Broader test | Shared module or public behavior changed. |
| Typecheck/lint/build | Compile/static guarantees matter. |
| Manual/runtime check | User-visible or integration behavior lacks automated coverage. |
| Benchmark/security check | Performance/security claim is being made. |

5. Run verification and record exact evidence.

6. If verification fails, report failure. Do not bury it under partial success.

7. If a required verification path is unavailable, report `insufficient evidence` instead of claiming completion. Provide the exact next verification path.

## Output

```text
Verification Contract:
- Behavior to prove:
- Regression to prevent:
- Existing coverage:
- New or focused test needed:
- Negative cases:
- Manual/runtime check:
- Commands:
- Evidence required:
- Stack overlay verification supplement:
- What remains unverified:
- Stop if:

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

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and verification completes or insufficient evidence is explicitly reported, include a `Metrics event candidate` following `docs/metrics-event-contract.md`.

Record whether a Verification Contract was defined, whether tests were added or updated, whether validation passed, and whether insufficient evidence remained. Do not emit metrics for hidden telemetry or a partial conversation with no durable outcome.

## Exit criteria

- The Verification Contract exists or the change is explicitly exempt.
- The changed behavior has an observable check.
- Commands/results are exact.
- Unverified items are explicit and not presented as fixed or proven.
- Success is not claimed from code inspection alone unless no executable check exists.

## Failure modes

| Failure | Correction |
|---|---|
| “I know this works.” | Treat as hypothesis until verified. |
| Existing tests assumed sufficient | Identify which tests cover the changed behavior. |
| Manual check used as proof of all behavior | Scope manual evidence narrowly. |
| Missing required verification path ignored | Report `insufficient evidence` and the next check. |
| Invented command output | Never invent results; say not run. |

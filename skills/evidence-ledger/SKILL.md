---
name: evidence-ledger
description: Separate claims from evidence and downgrade unsupported assertions. Use for performance, security, reliability, correctness, readiness, refactor value, UX, cost, or research claims.
---

# Evidence Ledger

## Goal

Prevent the agent from overstating what has been proven.

## Use when

The output contains or may imply claims such as:
- faster,
- safer,
- more reliable,
- production-ready,
- scalable,
- simpler,
- correct,
- fixed,
- improved,
- secure,
- no regression,
- reduces cost,
- better UX.

## Do not use when

- The task is purely mechanical and no claim beyond “changed X” is needed.

## Process

1. Extract claims.

2. For each claim, record:

```text
Claim:
Evidence:
Evidence type:
Status: verified | supported | weak | hypothesis | unknown | falsified
Confidence:
Missing evidence:
Next check:
```

3. Grade evidence.

| Evidence type | Strength |
|---|---|
| Passing focused test reproducing changed behavior | Strong for that behavior. |
| Broader suite/build/typecheck | Strong for integration/static guarantees. |
| Runtime/manual check | Useful but scoped. |
| Benchmark with method | Strong only for measured scenario. |
| Code inspection | Weak unless no executable check exists. |
| Assumption or intent | Not evidence. |

4. Downgrade language.
   - `verified`: state directly with evidence.
   - `supported`: state with caveat.
   - `weak`: tentative only.
   - `hypothesis`: do not present as fact.
   - `unknown`: explicitly unknown.
   - `falsified`: remove or correct.

5. Define evidence required before merge/ship when needed.

## Output

```text
Evidence ledger:
| Claim | Evidence | Status | Missing evidence | Next check |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |
```

## Exit criteria

- Unsupported claims are downgraded.
- Evidence strength is visible.
- Missing evidence has a next check.
- Final language matches evidence status.

## Failure modes

| Failure | Correction |
|---|---|
| “Cleaner” claimed without property | Tie to reviewable property. |
| “Faster” claimed without measurement | Require benchmark/measurement. |
| “Fixed” claimed without reproduction | Require failing-then-passing evidence when feasible. |
| “No known issue” used as proof | Unknown is not evidence of absence. |

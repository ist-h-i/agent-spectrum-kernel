---
name: evidence-ledger
description: Separate claims from evidence and downgrade unsupported assertions. Use for performance, security, reliability, correctness, readiness, refactor value, or research claims.
---

# Evidence Ledger

## Goal

Prevent the agent from overstating what has been proven.

## When to use

Use when the output contains claims such as:
- faster
- safer
- more reliable
- production-ready
- scalable
- simpler
- correct
- fixed
- improved
- secure
- no regression
- reduces cost
- better UX

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

3. Downgrade language:
   - `verified` → can state directly with evidence.
   - `supported` → state with caveat.
   - `weak` → tentative.
   - `hypothesis` → do not present as fact.
   - `unknown` → explicitly unknown.
   - `falsified` → remove or correct.

4. Add evidence requirements before merge/ship.

## Output

```text
Evidence ledger:
| Claim | Evidence | Status | Missing evidence | Next check |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The code is cleaner.” | Cleaner must be tied to a reviewable property. |
| “It should be faster.” | Performance needs measurement. |
| “The bug is fixed.” | A fix needs reproduction and passing verification. |
| “No known issue.” | Unknown is not evidence of absence. |

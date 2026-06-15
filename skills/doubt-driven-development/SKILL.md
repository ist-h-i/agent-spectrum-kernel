---
name: doubt-driven-development
description: Investigate by trying to falsify the current hypothesis. Use for bugs, performance issues, research claims, uncertain root causes, or high-risk assumptions.
---

# Doubt-Driven Development

## Goal

Find where the current explanation breaks before building on it.

## When to use

Use when:
- root cause is unknown,
- multiple explanations are plausible,
- a claim needs validation,
- performance/reliability/security is involved,
- a previous fix failed,
- the task is research-like rather than straightforward implementation.

## Process

1. State the claim or hypothesis.

```text
Claim:
Evidence so far:
Confidence:
```

2. Generate failure hypotheses:
   - What would make this claim false?
   - What input breaks it?
   - What environment breaks it?
   - What dependency or timing assumption breaks it?
   - What user behavior breaks it?

3. Rank by:
   - likelihood,
   - severity,
   - cost to test,
   - ability to falsify.

4. Run the cheapest decisive check first.

5. Update status:
   - verified,
   - weakened,
   - falsified,
   - still unknown.

6. Only then implement or recommend.

## Output

```text
Hypothesis:
- ...

Falsification checks:
1. ...
2. ...

Results:
- ...

Conclusion:
- verified | weakened | falsified | unknown

Next:
- ...
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The first explanation fits.” | Many wrong explanations fit early evidence. |
| “I found a bug, so it must be the bug.” | A bug is not necessarily the root cause. |
| “The benchmark improved once.” | Single measurements are weak evidence. |

---
name: doubt-driven-development
description: Investigate by trying to falsify the current hypothesis. Use for bugs, performance issues, research claims, uncertain root causes, flaky behavior, or high-risk assumptions.
---

# Doubt-Driven Development

## Goal

Find where the current explanation breaks before building on it.

## Use when

- Root cause is unknown.
- Multiple explanations are plausible.
- A previous fix failed.
- Performance, reliability, or security is involved.
- A claim needs validation.
- Behavior is flaky or environment-dependent.

## Do not use when

- Reproduction, root cause, and fix are already verified.

## Process

1. State the current claim or hypothesis.

```text
Claim/hypothesis:
Evidence so far:
Confidence:
Unknowns:
```

2. Generate falsification checks.

Ask:
- What would make this false?
- What input breaks it?
- What environment breaks it?
- What timing/concurrency/dependency assumption breaks it?
- What user behavior breaks it?
- What log/test/runtime evidence would distinguish hypotheses?

3. Rank checks.

| Criterion | Meaning |
|---|---|
| Likelihood | How plausible is this failure? |
| Severity | How bad if true? |
| Cost | How expensive to test? |
| Decisiveness | Would the result change the decision? |

4. Run the cheapest decisive check first.

5. Update status under `ask.claim-evidence-status@1.0.0`.

| Status | Meaning |
|---|---|
| `Verified` | Direct evidence proves the hypothesis for the scoped behavior. |
| `Supported` | Indirect evidence supports it, but the decisive check is still missing. |
| `Hypothesis` | It remains a plausible investigation input; record the next check, including evidence that weakened it. |
| `Unknown` | Available evidence cannot judge it. |
| `Falsified` | Direct evidence contradicts it; correct the causal claim. |

6. Only then implement or recommend.
   - State the next action in work terms such as collecting evidence, creating a reproduction, implementing a scoped fix, or stopping because the cause remains unknown.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the investigation artifact below; it does not repeat the envelope fields.

```text
Hypothesis:
- ...

Falsification checks:
1. ...
2. ...

Results:
- ...

Conclusion:
- Verified | Supported | Hypothesis | Unknown | Falsified

Next:
- ...
```

## Exit criteria

- The selected check can change the conclusion.
- Evidence updates the hypothesis status.
- Root cause is not claimed without reproduction or decisive evidence.

## Failure modes

| Failure | Correction |
|---|---|
| First explanation accepted | Generate alternatives and falsification checks. |
| Found a bug, assumed root cause | Prove relation to observed failure. |
| Single benchmark used as proof | Repeat or bound measurement uncertainty. |

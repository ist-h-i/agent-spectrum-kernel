# Example: Bug fix

## Request

```text
The date filter returns one extra day in Tokyo time.
```

## Workflow

Use:

```text
doubt-driven-development → test-first-verification for reproduction and Verification Contract → controlled-implementation → test-first-verification for regression proof
```

## Expected investigation shape

```text
Hypothesis:
- Timezone boundary conversion includes the end date incorrectly.

Falsification checks:
1. Reproduce with date range crossing midnight JST.
2. Compare UTC conversion for start/end boundaries.
3. Check existing date utility usage nearby.

Results:
- ...

Conclusion:
- verified | weakened | falsified | unknown

Next:
- Implement only after reproduction or decisive evidence.
- Re-run regression verification after the scoped fix.
```

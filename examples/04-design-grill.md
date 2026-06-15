# Example: Design grill

## Request

```text
Grill me on this plan: split notification delivery into a separate worker.
```

## Workflow

Use:

```text
grill-design → grill-with-docs → adr-review
```

## Expected behavior

The agent should ask one material question at a time. For each question, it should:

- explain why the decision matters,
- recommend an answer,
- state the tradeoff,
- inspect docs/code instead of asking if the repository can answer it.

## Example first question

```text
Question 1:
Should the worker own retry state, or should retry state remain in the existing notification table?

Why it matters:
- This determines persistence ownership, failure recovery, and rollback complexity.

Recommended answer:
- Keep retry state in the existing notification table for the first slice unless the repo already has a job-state abstraction.

Tradeoff:
- Lower migration risk now, but less isolation than a dedicated worker-owned state model.
```

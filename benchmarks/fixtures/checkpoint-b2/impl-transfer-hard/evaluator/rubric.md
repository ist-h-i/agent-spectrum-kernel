# Rubric

Score out of 100.

- 66 points: requirements 01–12, weighted 5.5 each.
- 18 points: concurrency and idempotency. Full credit requires both overspend prevention and single-commit concurrent replay.
- 8 points: failure-state integrity, especially audit rejection and sequence preservation.
- 5 points: high-signal agent-added tests covering at least four expected categories.
- 3 points: scope and dependency discipline.

Caps:

- A non-serialized solution cannot exceed 65.
- A solution that mutates balances before awaiting the audit sink cannot exceed 55.
- Modifying the executor, docs, package manifest, or adding dependencies without necessity caps the score at 80.

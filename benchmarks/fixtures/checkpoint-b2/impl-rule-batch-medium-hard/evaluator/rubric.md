# Rubric

Score out of 100.

- 70 points: functional requirements. Requirements 01–10 are worth 7 points each; award partial credit only when the observable contract is partly met.
- 15 points: failure-state integrity and idempotency. Full credit requires no partial mutation and replay-before-version semantics.
- 8 points: agent-added tests. Full credit requires at least four high-signal tests covering the expected categories rather than duplicating visible happy paths.
- 7 points: scope and dependency discipline. Any prohibited-file change or new dependency loses this section; broad unrelated edits may also cap the total at 80.

A solution that passes visible tests only but misses hidden atomicity, idempotency, or aliasing behavior should not exceed 55.

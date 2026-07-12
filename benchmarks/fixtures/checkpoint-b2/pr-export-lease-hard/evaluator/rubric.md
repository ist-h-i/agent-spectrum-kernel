# Rubric

Score out of 100.

- 75 points: findings. Award 15 per oracle finding: 7 root cause, 3 evidence, 3 impact, 2 blocker classification.
- 10 points: merge decision and prioritization. Full credit requires request changes and identifies authorization and duplicate execution as release blockers.
- 7 points: cross-file reasoning. Full credit requires using both service/store boundaries and the documented state contract.
- 8 points: precision. Start at 8 and subtract 3 per false positive, to a minimum of zero.

Combine duplicate symptoms under one root cause. Style, persistence architecture, and speculative concerns not tied to this contract are false positives.

# Rubric

Score out of 100.

- 72 points: substantive findings. Award 18 points per oracle finding: 8 for root cause, 4 for correct evidence, 4 for impact, 2 for blocker classification. Partial credit is allowed when the execution path is correct but evidence is imprecise.
- 12 points: merge decision. Full credit requires requesting changes and tying the decision to at least one blocker.
- 8 points: evidence discipline. Findings must distinguish the changed code from surrounding contract evidence.
- 8 points: precision. Start at 8 and subtract 4 per false positive, down to zero.

Duplicate reports of the same root cause receive credit once. Missing-test comments, style comments, and speculative hardening outside the documented contract are false positives.

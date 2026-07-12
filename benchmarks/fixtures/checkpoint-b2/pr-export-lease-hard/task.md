# PR review task: leased export jobs

Review `workspace/pr.diff`. The tree in `workspace/` is the proposed post-change state. Inspect the related
service, store, tests, state contract, and schema; run the visible tests if useful.

Return only defects with a concrete user, authorization, state-machine, concurrency, or error-boundary impact.
For every finding include severity, file/line evidence, the failing execution path, impact, and whether it blocks
merge. End with a merge decision.

Do not count formatting, naming, optional refactors, or generalized requests for more tests as findings.

# PR review task: refresh-token rotation

Review the proposed change in `workspace/pr.diff`. The checkout under `workspace/` represents the proposed
post-change tree, so you may run the visible tests and inspect surrounding code, documentation, and schema.

Report only defects that can cause an observable correctness, security, consistency, concurrency, or
reliability failure. For each finding, provide:

- severity;
- exact file and line evidence;
- the execution path or contract that makes it fail;
- likely impact;
- whether it blocks merge.

Finish with a merge decision. Do not report style preferences, optional hardening, or missing tests unless a
specific production failure follows from the changed code.

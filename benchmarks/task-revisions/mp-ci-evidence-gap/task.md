# Pull request verification review

A checkout change is waiting for a merge decision. Order acceptance uses the quantities and totals returned by the quote component. Determine which part of the order contract the supplied pull request evidence actually exercises and what the change means for an order.

Compare `docs/verification.md`, the workflow, saved CI log, diff, implementation and tests. Trace the source of each verification result. Distinguish tests run in CI, checks you ran locally and contract behavior that still needs checking. For a material gap, state the result or repair that would change your recommendation. A local suite or an equivalent check through the public quote function is acceptable. State the actual input, expected behavior and observed result.

Write only `review.json` using `review.schema.json`. Ground findings in supplied paths and lines. Record the merge decision, remaining work and its business impact. Run `npm run validate:review` and report its result.

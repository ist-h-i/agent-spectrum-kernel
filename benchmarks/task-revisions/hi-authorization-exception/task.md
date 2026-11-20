# Review a shared access check for a tenant records service

A fictional records service uses one access check for customer members, service jobs and support staff. The platform team has proposed the supplied PR and needs a review before adopting it. Customer records must remain within the ownership policy, while legitimate service and support access must continue to work.

Review the proposed change using the ownership contract, source, base, diff and supplied caller cases. Add only `workspace/review.json`. The review must give a supported decision, identify each evidenced contract violation once, and include the before/after/required outcomes, severity and source evidence required by `review.schema.json`. Complete the verification declarations from commands actually run. Findings must stay within the supplied inputs and defined policy.

All existing files are protected. This is a fictional local boolean decision model; no real permission change, users, credentials, deployment or external action is requested.

Run the final checks from `workspace/`:

```bash
npm test && npm run trace && npm run validate:review
```

The tests and trace provide observations; review shape validation does not establish that the decision or findings are correct.

Record the affected legitimate or disallowed use and the corrective condition for each finding. The `preserved_cases` array names supplied normal uses and what a correction must preserve. Explain the overall decision in `decision_basis`. Distinguish a missed contract violation from a false alarm on an allowed route. Equivalent wording and repeated descriptions of the same cause receive the same finding credit.

# Inbox filter pull request review

A support agent selects a message and changes inbox filters. Review whether the state returned to callers, the highlighted row and the detail pane still refer to the same visible message. Use the filter and expansion behavior defined in `docs/state-contract.md`.

Trace the operation through the diff, state owner and view consumers. For a material finding, record what the user saw before and after the filter change, which rules determine those results, and what a correction must preserve across callers. If a rule must be changed in more than one place, explain how a partial change could be observed. Judge retained thread history against its own contract.

Write only `review.json` using `review.schema.json`. Cite source paths and lines. Give a merge decision, the post-fix check, and the result and scope of each local check actually used. The scripts in `package.json` exercise the state or its view projection. Run `npm run validate:review` and report the outcome.

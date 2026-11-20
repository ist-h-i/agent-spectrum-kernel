# Review record-service errors as the support client observes them

A support application uses the record service's error response to choose its displayed state and, for eligible reads, whether and how long to wait before retrying. Review the proposed response-adapter PR and decide whether it is ready to merge without disrupting that caller contract.

Inspect `pr.diff`, base and proposed adapter, `docs/error-contract.md`, the unchanged client policy, cases and tests. Write only `review.json` using `review.schema.json`. Each material finding must identify a supplied case, cite file/line evidence, record observed before/after response AND client results, and state the behavior required by the published contract. Derive findings, severity and decision from that evidence; preserve correct behavior and avoid expanding the PR. Use the structured fields for all material claims, without additional free-form summary claims.

Preserve all supplied workspace files. Scenarios are fictional local records; no remote service or application change is requested. Passing the existing tests or a report shape check alone does not establish review correctness.

From the workspace, run `npm test` and `npm run trace`; after writing the review, run `npm run validate:review`. Declare only the verification actually performed.

For each finding, fill `impact` with the affected call and observable user outcome. In `repair`, identify the responsible component and the behavior a correction must preserve. Review the two comparison diffs in `comparisons/` separately in `change_impact`. They are prospective designs with equivalent behavior for the current inputs. Trace what would have to change for another retryable service fault and for a change to the caller’s retry budget. Cite the producing and consuming lines; distinguish a duplicated decision from two similar-looking branches that answer different questions. State which judgments you could not verify.

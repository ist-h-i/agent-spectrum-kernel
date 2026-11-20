# Review a support-event projection change

Support engineers use projected request events to correlate failures and understand latency without receiving raw user or request context. Review the proposed policy change against this operational need and the published data-minimization contract, then repair the current policy.

Use `docs/projection-contract.md`, `config/field-contract.json` and local trace cases. Write an evidence-backed `review.json` about the ORIGINAL proposal, with your decision, justified severity and all affected paths for each material changed-contract finding. Independently derive the findings from the base, proposal and PR diff. The repaired policy must preserve valid diagnostic signals and malformed-signal reporting while excluding raw sensitive context, without mutating events or retaining prior outputs.

Only `config/projection-policy.json` may change; add `review.json`. Keep the original base/proposal/diff and all other files unchanged so the review remains reproducible. Values are fictional labels processed in local memory. No real secrets, external sink, package installation or production logging change is involved.

From the workspace, run `npm test`, `npm run trace` and `npm run validate:review`. Report actual verification state. Shape validation does not establish review correctness.

Inspect the original proposal and its effect on the supplied events before testing the repaired policy. Use the same synthetic events for both observations. In your final response show how support can correlate one failure, which malformed signal fields were identified, and what was omitted or fully marked. Give separate results for the original proposal and the repair, including any checks you could not perform.

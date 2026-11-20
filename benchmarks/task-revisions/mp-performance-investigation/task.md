# Summary latency regression investigation

A release coincides with slower customer activity summaries. Operations needs to know which observations support each explanation and what measurement could change the decision. Investigate the supplied incident window using `docs/investigation-contract.md`, the local code, measurements and replay.

Write only `investigation.json` using `investigation.schema.json`. Explain the competing mechanisms using the available comparison conditions. Distinguish temporal association, evidence of a mechanism in replay, and causal or quantitative claims about service traffic. For each material claim cite the supplied path and line with its exact trimmed `source_excerpt`.

Choose one bounded, feasible local replay or read-only staging comparison. Specify the subject, conditions to hold fixed, different outcomes predicted by the competing explanations, and the result that would make you withdraw or weaken your claim. Give a stopping condition that a second operator could follow. Report what you actually observed and label a proposed check that has not run. Do not alter production or the supplied inputs. Run `npm run validate:investigation` and report the result.

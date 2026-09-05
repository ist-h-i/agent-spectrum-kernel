# Summary latency regression investigation

Investigate the reported latency regression in the summary service and assess the competing explanations using only the supplied incident contract, source, measurements, and replay checks.

Write the result to `workspace/investigation.json` using `workspace/investigation.schema.json`, and do not modify any other workspace file. Separate supported, weakened, falsified, and unresolved hypotheses; distinguish association from causal proof; and recommend one bounded non-production next check with an explicit stop condition. For every citation, copy the exact trimmed cited line into `source_excerpt` and ensure that the cited observation or contract statement specifically bears on that hypothesis's explanation. Headings, CSV headers, unrelated exact lines, and citations transplanted from a different explanation are not evidence. Use only the schema's closed fields for conclusions and actions.

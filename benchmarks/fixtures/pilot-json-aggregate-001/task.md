# pilot-json-aggregate-001

Prefer one tool call to read input.json, aggregate its rows, and write
answer.json. Avoid separate inspection or rereads unless necessary.

Valid rows have a nonempty ASCII string sku (U+0000 through U+007F) and a numeric
safe integer quantity >= 0. Do not trim sku or coerce quantity strings.
Aggregate valid rows only; sum quantity per sku. Write exactly {"totals":[{"sku":"...","total":0},...]}
with one entry per valid sku, sorted by ascending ASCII sku; no extra keys.

Only answer.json may be created or changed; leave input.json and task.md
unchanged. No dependencies, network, external tasks or other agents are needed.
Return only concise implementation JSON matching the supplied agent-output schema, with a
one-sentence summary. The explanation is not part of the totals score.

# Open product decisions

Some choices are deliberately not settled. Do not turn an arbitrary preference into a defect.

- The retention period after the four-week migration has not been approved. Current settings are not a promise that all records can be deleted after 30 days. Product/security owners must decide the policy before destructive cleanup.
- Native mobile support is not planned; a responsive browser path is required. Card versus table default is a usability tradeoff, not a fixed acceptance condition.
- The team may pause publication and allow read-only inspection during a recovery incident. This is a possible containment measure, not proof that retries are safe.
- Exact production traffic and provider latency distributions have not been supplied. Do not manufacture p95 results from the local smoke run.

Capacity before pilot: frontend 40 hours, backend 48 hours, quality/review 32 hours. One backend engineer knows the old artifact format; the frontend engineer has limited experience with the old VS Code extension. This is a planning constraint, not a supplied estimate for each fix. Explain which assumptions need validation and who must decide them.

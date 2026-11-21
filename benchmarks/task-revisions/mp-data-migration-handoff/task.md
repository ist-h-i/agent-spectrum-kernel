# Take over the profile backfill

The day shift is taking over three partitions of a live profile migration. Its dashboard has been rebuilt from several generations of operational records. Operators need one dispatch decision per assigned partition and an instruction for each incoming page in the shift exercise.

Prepare only `handoff.json` using the shift report schema in the workspace. Cite record IDs supporting each decision. Give the next operator enough information to act on the current scope and contain an incident. The pages are independent changes to the shift snapshot. Do not carry a page's records into another page.

Run `npm run validate:handoff` and report the result. Do not perform any migration or release operations.

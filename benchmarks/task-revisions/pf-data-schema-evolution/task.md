# Introduce customer notes without disrupting older readers

Customer-support agents are adopting a consistent contact-note field while older customer-record consumers remain in use. Complete the v2 schema and local migration plan so both generations can read the same records and a rejected rollout can recover the exact original data.

Follow `spec/evolution-contract.md`. Existing accepted records, explicit notes and unrelated fields must survive. The current reader must provide the specified missing-note view without rewriting source data. The transition must populate only absent values, remain idempotent, reject invalid input without partial mutation, and restore the exact input snapshot on rollback.

Change only `schemas/customer-v2.schema.json` and `migrations/v1-v2.plan.json`. Preserve the v1 schema, fixed engine/readers, data, tests, package and contract. These are fictional JSON records and an in-memory plan interpreter; do not run a database migration or deployment.

From the workspace, run `npm test` and report the observed result and any unverified requirement. The local engine's supported schema and plan interfaces are documented in the contract.

Use a group of customer records containing a missing note, an explicitly null note and a recorded note. In the final response, show what each reader sees, the stored records before reading and after the first and second up, and the records after down. Include the result of applying the plan to a batch containing an invalid record after a valid one. Credit for rejecting invalid data depends on the submitted schema. Record any behavior you could not check.

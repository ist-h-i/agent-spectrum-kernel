# Restore the local member interchange

A current member export cannot be read by the current importer. Restore that round trip with the adjacent schema in `schemas/member.schema.json`. Use `spec/member-contract.md` and the scope in `spec/schema-alignment-plan.md`. Preserve the field values on import and the default for an omitted optional field.

Change only the schema and any necessary regression tests in `test/member-record.test.mjs`. Preserve the public APIs, input constraints and invalid-payload error type. Run `npm test`. Report the observed values for a valid interchange and how the same importer handled invalid input.

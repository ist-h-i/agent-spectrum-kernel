# Align the member schema with the current API field

The local member exporter emits the current v2 payload, but the importer rejects that payload because the adjacent schema still uses an older field name. Align the schema with the authoritative local contract and verify the change with the supplied focused regression tests. Extend those tests if more coverage is needed.

Read `spec/member-contract.md`, `spec/schema-alignment-plan.md`, the schema and the producer/consumer. Preserve the existing validation strictness and other fields. Keep this to the schema and its tests; no generic validation framework, caller rewrite, data migration or service change is needed. Run `npm test` from this workspace.

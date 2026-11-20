# Prepare a resumable data-migration handoff

An on-call operator is taking over a paused profile backfill while old and new clients continue using the service. The operator needs to know what has finished and how to carry the work forward safely.

Create only `handoff.json` using `handoff.schema.json`. Use the supplied plan, records, catalog and runbook. Include every verification ID specified by `state/handoff-policy.json` exactly once. Give the operator a grounded next action and explain the conditions for proceeding, stopping or obtaining more evidence. Identify unresolved questions and cite the supplied sources.

Do not perform migration, reconciliation or rollback operations. Run `npm run validate:handoff` and report its result.

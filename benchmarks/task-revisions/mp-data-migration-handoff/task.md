# Prepare a resumable data-migration handoff

The next on-call operator is taking over a paused profile backfill while old and new clients continue using the service. They need to know what has finished, what they can inspect now, and when they may write again.

Create only `handoff.json` using `handoff.schema.json`. Use the migration plan, state, recorded checks, command catalog and rollback runbook. Record the durable position, traffic split, blocking conditions and every verification ID in `state/handoff-policy.json` exactly once. Identify a safe next command, its mode, owner and evidence. If you hold all actions, use null for `safe_next_action` and explain the stop condition. State which role may authorize resumption, the technical and approval conditions that must hold at that time, and what needs to be stopped or preserved. Include unresolved questions with their source references.

Write the handoff so the next operator can act if a new approval arrives before technical evidence, or technical evidence arrives before approval. Distinguish these hypothetical updates from the supplied state. Use the catalog identifiers and ordinary language in their respective schema fields. Do not perform migration, reconciliation or rollback operations. Run `npm run validate:handoff` to check the handoff structure and report the result.

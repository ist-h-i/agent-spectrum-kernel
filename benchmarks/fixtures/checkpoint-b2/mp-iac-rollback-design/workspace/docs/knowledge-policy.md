# Durable knowledge policy

Completion of one change does not by itself authorize a durable knowledge write.
The promotion trigger is `two-verified-alias-rollbacks`: two independently verified alias rollback operations with retained plan digests and post-change observations.
The destination is `docs/ai/engineering-pattern-ledger.md`, the owner is `platform-engineering`, and the evidence boundary is the approved plan digest, apply record, rollback trigger, and post-rollback verification for each operation.
Stop and defer promotion while fewer than two verified operations exist, any evidence item is missing, or the owner has not accepted the reusable rule.
The supplied workspace contains no executed rollout or rollback record, so it does not satisfy the promotion trigger.

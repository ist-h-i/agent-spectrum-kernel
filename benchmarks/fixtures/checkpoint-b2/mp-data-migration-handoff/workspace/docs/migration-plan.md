# Account profile schema migration

The rollout uses an expand-and-contract sequence from the legacy `profile_v2` representation to the nullable `profile_v3` representation.

1. Dual-write compatible values to both representations.
2. Backfill historical rows in numbered batches.
3. Reconcile each batch before advancing the durable cursor.
4. Increase new-reader traffic only while legacy fallback remains available.
5. Contract the legacy representation only in a later, separately approved change.

The current operation is in step 2. A batch is complete only after checksum agreement and unresolved-row count reaches zero. A failed comparison pauses the operation; it does not roll the durable cursor forward.

No destructive schema contraction is part of this handoff.

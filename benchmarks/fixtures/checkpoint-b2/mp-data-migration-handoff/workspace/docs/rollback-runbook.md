# Rollback boundary

The migration remains in an additive state. Safe containment actions are:

- `pause-dual-write`: stop accepting additional migration work while preserving queued and persisted values.
- `route-reads-to-legacy`: return new-reader traffic to the legacy path.
- `hold-current-cursor`: retain cursor `840000`; do not mark batch 42 complete.

The operator must preserve existing `profile_v2` and `profile_v3` values and the migration audit trail. Dropping the shadow column or deleting migration audit records is not a supported rollback action.

Rollback containment does not authorize resuming writes. Resume approval is a separate gate.

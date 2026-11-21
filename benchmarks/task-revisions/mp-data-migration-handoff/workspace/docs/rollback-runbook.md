# Incident containment

A profile parity incident is scoped to the affected partition. Stop its publisher and direct its readers to the legacy representation. Preserve both representations, the primary checkpoint journal and the dispatch outbox. An uncertain publication key must remain associated with its work order until the primary can settle it. Truncating the shadow representation or clearing the outbox prevents reconciliation. Only the change owner can authorize a later contract migration.

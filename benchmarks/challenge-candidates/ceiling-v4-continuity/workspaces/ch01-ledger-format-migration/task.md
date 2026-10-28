# Ledger format continuity — V4 pilot A

The accounting service is being upgraded from decimal wire values to minor-unit values. The deployed legacy client will continue to read and append to the same durable journal. Repair `src/` so both consumers agree throughout migration, competing updates, retries and restart. Preserve the public exports and error contract. `harness/`, `spec/`, existing tests and package files are protected inputs; additional tests belong in `test/added/scenarios/` and use `scenarioTest` with public operations.

Read all contracts in `spec/`. They jointly define the observable behavior. No particular internal algorithm or file layout is required. Do not make the legacy client, journal or fixed accounting screen depend on a replacement representation.

Execution profile is Node 24.21.0, built-ins only. This is a deterministic durable-state model, not a real database performance benchmark. A candidate implementation, two distinct correct implementations, and private deterministic checks are evaluated against the same public APIs. No correctness or difficulty claim is made before validation.

# Restore complete supplier catalog collection

The buying team uses a catalog export to reconcile supplier stock before replenishment. The supplier service has moved to its v2 contract. Repair the collector so consumers receive a faithful and complete export through their existing interfaces.

Follow `spec/pagination-contract.md`. Change only `src/pagination.mjs` and `test/pagination.test.mjs`. Preserve the supplied decoder, consumer and dependencies. Add focused coverage and explain what the checks establish. Requests use injected local doubles with fictional URLs. Do not contact a service.

Run `npm test` and report its observed result and any remaining verification limits.

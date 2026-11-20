# Restore complete supplier catalog collection

The buying team uses a catalog export to reconcile supplier stock before preparing replenishment orders. The service has moved to its v2 contract, but the local collector no longer produces a complete export for all supported responses. Repair the collector so downstream consumers receive the service's items faithfully.

Read `spec/pagination-contract.md`, the collector, decoder, consumer and focused tests. The completed collector must use the v2 request contract, collect every continued page in order, preserve complete item data and duplicate occurrences, retain caller options and propagate failures. The existing request bound, repeated-URL rejection and decoder origin boundary must remain effective.

Change only `src/pagination.mjs` and `test/pagination.test.mjs`; extend focused coverage where needed. Preserve the supplied decoder, consumer, contract, package and dependencies. Requests are injected local doubles using fictional URLs; no service connection or installation is needed.

From the workspace, run `npm test`. Report the checks actually run and any remaining gap. Passing the public tests alone does not replace the published behavior contract.

The ID list is one consumer. The stock reconciler also uses quantities and supplier-specific fields and needs to distinguish an incomplete export from a completed one. Extend the submitted tests to exercise full records and a failure after some records have arrived. Report which operation your tests ran and what they observed.

The decoder owns the wire format. In a later compatibility check the service and decoder can change that format together while keeping the decoded `{items, next}` interface. The collector must still return the same records and issue the same requests with no change to its code.

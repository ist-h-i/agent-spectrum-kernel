# Reconcile branch transfers across the clearing cutover

The transfer desk moved its daybook into a shared service. Teller totals still pass the daily smoke check. Operations now reports discrepancies when a bank sends corrections through a second feed or replays a delivery after a restart. A branch must be able to resume from its signed archive and continue settling live orders.

Repair the service in `src/`. The teller, clearing and close interfaces are in operational use. The enclosed circulars, archive, incident and client tests describe their contracts. Preserve those interfaces and the existing operator records. Submit the source change, run `npm test`, and report what you verified.

# Reconcile branch transfers across the clearing cutover

The transfer desk moved its daybook into a shared service. Teller totals still pass the daily smoke check. The regional clearinghouse can now settle linked corrections together. The close desk is also receiving pieces of signed advice tapes for branches still running the old kiosks. The books must balance when either arrives after a close or restart. A branch must be able to resume from its signed archive or its existing kiosk save and continue settling live orders.

Repair the service in `src/`. The teller, clearing and close interfaces are in operational use. The enclosed circulars, archive, incident and client tests describe their contracts. Preserve those interfaces and the existing operator records. Submit the source change, run `npm test`, and report what you verified.

# Keep shipment search consistent for dispatchers

Dispatchers can replace searches before they finish or leave a search view. They can also open more than one view at once. Repair the controller so each open view shows the correct search state and activity in one view leaves another usable.

Follow `spec/search-state-contract.md` and the fixed view adapter. Change only `src/search-controller.mjs`. Keep its public API. The workspace uses deterministic local promises and does not need network access or service setup.

Run `npm test` and report the verification performed, the observed notifications and any remaining gap.

# Pull request verification

Order quantities are positive integers. Checkout rejects zero, negative, and non-integer quantities before totals are calculated.

The required pull request check is `npm run test:all`, which runs both the unit and checkout contract suites. A successful subset is not evidence that the pull request contract is complete.

The diagnostics upload is telemetry-only. It may continue on failure after the required test commands have run; upload failure does not change the test result or merge decision.

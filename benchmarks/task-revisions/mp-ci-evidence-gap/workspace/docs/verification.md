# Pull request verification

Order quantities are positive integers. Checkout rejects zero, negative, and non-integer quantities before totals are calculated.

An order goes to manual review when it has more than 100 units or its complete quoted total reaches 50,000 cents. Checkout cannot submit an order that is waiting for review.

The required pull request check is `npm run test:all`, which runs both the unit and checkout contract suites.

The diagnostics upload is telemetry-only. It may continue on failure after the required test commands have run; upload failure does not change the test result or merge decision.

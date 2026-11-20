# Keep shipment search aligned with the dispatcher's latest query

A dispatch-desk operator can replace a shipment search while an earlier request is still pending, or leave the search view before it completes. The current controller can leave the supplied view showing the wrong request's state. Investigate and repair `src/search-controller.mjs` so the visible result, busy indicator and alert consistently belong to the current search.

Follow `spec/search-state-contract.md` and the fixed view adapter. Publish loading immediately, clear obsolete visible content, retain current result ordering, handle current failures with the specified safe message, and prevent stale completions from changing the current view. Preserve the transport's cancellation interface, isolated state snapshots and disposal behavior even when a transport ignores cancellation.

Change only `src/search-controller.mjs`; retain its public API and all fixed workspace files. Requests are deterministic local deferred promises with ordinary string-array data. No network, timers, dependencies or service setup are needed.

From the workspace, run `npm test`. Report the focused verification performed and any remaining gap.

Two dispatchers can open independent shipment-search views on the same page. Each view owns its pending request. Replacing a search or closing one view must preserve the other view’s pending work and notifications. Use the fixed adapter to check the rendered busy state, visible results and alert immediately after actions and each settlement. In the final response give the chosen completion order and corresponding actual render notifications, including the case of closing one of two open views. Unobserved steps should be identified.

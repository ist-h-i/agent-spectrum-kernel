# Inbox state contract

The inbox list, selection, and detail pane are one rendered state.

- `filter` is either `all` or `unread`.
- `selectedMessageId` is either `null` or the ID of a message currently visible under `filter`.
- A filter change that hides the selected message clears `selectedMessageId` before rendering.
- The detail pane renders exactly the message represented by the one selected visible row. When no visible row is selected, the detail pane is empty.
- A selection request for a hidden or unknown message is rejected.

Expanded thread history is intentionally independent of current visibility. IDs in `expandedThreadIds` may remain while their messages are filtered out so expansion can be restored if those messages become visible again. That retained history must not create a selected row or detail pane by itself.

Run `npm test` for state transitions and `npm run test:interaction` for the list/detail projection.

import assert from "node:assert/strict";
import test from "node:test";
import { changeFilter, createInboxState, selectMessage } from "../../src/inbox-state.mjs";
import { buildInboxView } from "../../src/inbox-view.mjs";
import { messages } from "../helpers/inbox-fixture.mjs";

test("filtering out the selection clears the detail pane", () => {
  let state = selectMessage(createInboxState(messages()), "message-read");
  state = changeFilter(state, "unread");
  const view = buildInboxView(state);

  assert.equal(view.rows.some(({ selected }) => selected), false);
  assert.equal(view.details, null);
});

test("a visible selection drives both row and details", () => {
  const state = selectMessage(createInboxState(messages()), "message-unread");
  const view = buildInboxView(state);

  assert.deepEqual(view.rows.filter(({ selected }) => selected).map(({ id }) => id), ["message-unread"]);
  assert.equal(view.details?.id, "message-unread");
});

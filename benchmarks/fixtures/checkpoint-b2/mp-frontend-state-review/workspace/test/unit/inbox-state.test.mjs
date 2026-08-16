import assert from "node:assert/strict";
import test from "node:test";
import { changeFilter, createInboxState, selectMessage, toggleThread, visibleMessages } from "../../src/inbox-state.mjs";
import { messages } from "../helpers/inbox-fixture.mjs";

test("unread filter exposes only unread messages", () => {
  const state = changeFilter(createInboxState(messages()), "unread");
  assert.deepEqual(visibleMessages(state).map(({ id }) => id), ["message-unread"]);
});

test("hidden messages cannot be selected", () => {
  const state = changeFilter(createInboxState(messages()), "unread");
  assert.throws(() => selectMessage(state, "message-read"), /unknown message/u);
});

test("expanded thread history survives filtering", () => {
  let state = toggleThread(createInboxState(messages()), "message-read");
  state = changeFilter(state, "unread");
  assert.deepEqual(state.expandedThreadIds, ["message-read"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { handleToolbarKeydown } from "../../src/format-toolbar.mjs";
import { keyboardEvent, toolbarButtons } from "../helpers/toolbar-fixture.mjs";

test("ArrowRight advances focus and preserves one tab stop", () => {
  const buttons = toolbarButtons();
  const event = keyboardEvent("ArrowRight", buttons[0]);

  assert.equal(handleToolbarKeydown(event, buttons), true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(buttons.map(({ tabIndex }) => tabIndex), [-1, 0, -1]);
  assert.deepEqual(buttons.map(({ focused }) => focused), [false, true, false]);
});

test("unhandled keys leave focus management unchanged", () => {
  const buttons = toolbarButtons();
  const event = keyboardEvent("Enter", buttons[0]);

  assert.equal(handleToolbarKeydown(event, buttons), false);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(buttons.map(({ tabIndex }) => tabIndex), [0, -1, -1]);
});

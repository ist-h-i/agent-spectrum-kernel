import assert from "node:assert/strict";
import test from "node:test";
import { handleToolbarKeydown } from "../../src/format-toolbar.mjs";
import { keyboardEvent, toolbarButtons } from "../helpers/toolbar-fixture.mjs";

for (const [key, focusedIndex] of [["Home", 0], ["End", 2]]) {
  test(`${key} consumes the browser action and moves focus`, () => {
    const buttons = toolbarButtons();
    const event = keyboardEvent(key, buttons[1]);

    assert.equal(handleToolbarKeydown(event, buttons), true);
    assert.equal(event.defaultPrevented, true);
    assert.equal(buttons[focusedIndex].focused, true);
    assert.equal(buttons[focusedIndex].tabIndex, 0);
  });
}

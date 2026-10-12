import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DISPLAY_PREFERENCES, initializeDisplayPreferences, updateDisplayPreference, resetDisplayPreferences } from "../src/display-preferences.mjs";
import { displayControls } from "../src/display-controls.mjs";

test("initial state uses documented defaults", () => {
  const first = initializeDisplayPreferences();
  const second = initializeDisplayPreferences({});
  assert.deepEqual(first, { compactRows: true, showDetails: false });
  assert.notEqual(first, second);
  assert.notEqual(first, DEFAULT_DISPLAY_PREFERENCES);
});

test("first load preserves an explicitly saved false checkbox value", () => {
  const saved = Object.freeze({ compactRows: false, showDetails: true });
  const state = initializeDisplayPreferences(saved);
  assert.deepEqual(state, { compactRows: false, showDetails: true });
  assert.deepEqual(displayControls(state), [
    { id: "compactRows", label: "Compact rows", checked: false },
    { id: "showDetails", label: "Show details", checked: true },
  ]);
});

test("non-boolean storage values use defaults and extra keys stay out of state", () => {
  for (const compactRows of [undefined, null, "false", 3, [], {}]) {
    const saved = Object.freeze({ compactRows, showDetails: null, extra: "ignored" });
    assert.deepEqual(initializeDisplayPreferences(saved), { compactRows: true, showDetails: false });
  }
});

test("saved booleans can enable compact rows and disable details", () => {
  const saved = { compactRows: true, showDetails: false };
  assert.deepEqual(initializeDisplayPreferences(saved), saved);
  assert.deepEqual(saved, { compactRows: true, showDetails: false });
});

test("updates preserve previous state and checkbox shape", () => {
  const before = Object.freeze(initializeDisplayPreferences());
  const after = updateDisplayPreference(before, "compactRows", false);
  assert.deepEqual(before, { compactRows: true, showDetails: false });
  assert.deepEqual(after, { compactRows: false, showDetails: false });
  assert.equal(displayControls(after)[0].checked, false);
  assert.throws(() => updateDisplayPreference(before, "extra", false), RangeError);
  assert.throws(() => updateDisplayPreference(before, "compactRows", "false"), TypeError);
});

test("reset returns fresh defaults without changing the current state", () => {
  const before = updateDisplayPreference(initializeDisplayPreferences(), "compactRows", false);
  const reset = resetDisplayPreferences();
  assert.deepEqual(reset, { compactRows: true, showDetails: false });
  assert.deepEqual(before, { compactRows: false, showDetails: false });
  assert.notEqual(reset, resetDisplayPreferences());
  assert.notEqual(reset, DEFAULT_DISPLAY_PREFERENCES);
});

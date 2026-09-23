import assert from "node:assert/strict";
import test from "node:test";
import {
  backToEdit,
  cancelIrreversible,
  completeSubmit,
  createFixtureState,
  derivedTotal,
  failMetrics,
  failPreview,
  makeMetricsMissing,
  openDetails,
  openIrreversibleConfirm,
  removeRow,
  retryMetrics,
  setFoundationFailure,
  startSubmit,
  undoLast,
} from "./fixture-state.mjs";

test("form validation, loading, success and continuation are distinct", () => {
  const state = createFixtureState();
  assert.equal(startSubmit(state), false);
  assert.equal(state.formError, "名前を入力してください");
  state.name = "通知設定";
  assert.equal(startSubmit(state), true);
  assert.equal(state.submitState, "loading");
  completeSubmit(state);
  assert.equal(state.submitState, "success");
});

test("selection and input survive move and back", () => {
  const state = createFixtureState();
  state.name = "入力中の値";
  state.selectedId = "beta";
  openDetails(state);
  backToEdit(state);
  assert.equal(state.route, "edit");
  assert.equal(state.selectedId, "beta");
  assert.equal(state.name, "入力中の値");
  assert.equal(state.focusReturnId, "open-details");
});

test("undo restores the actual row state", () => {
  const state = createFixtureState();
  const before = [...state.rows];
  assert.equal(removeRow(state, "alpha"), true);
  assert.notDeepEqual(state.rows, before);
  assert.equal(undoLast(state), true);
  assert.deepEqual(state.rows, before);
});

test("cancel before irreversible commit leaves state unchanged", () => {
  const state = createFixtureState();
  openIrreversibleConfirm(state);
  cancelIrreversible(state);
  assert.equal(state.irreversibleCommitted, false);
  assert.equal(state.confirmOpen, false);
});

test("independent failures preserve healthy form and selection", () => {
  const state = createFixtureState();
  state.name = "保持する入力";
  state.selectedId = "beta";
  failMetrics(state);
  failPreview(state);
  assert.equal(state.metrics.status, "error");
  assert.equal(state.preview.status, "error");
  assert.equal(state.name, "保持する入力");
  assert.equal(state.selectedId, "beta");
});

test("scoped retry can fail again and later succeed without zero filling", () => {
  const state = createFixtureState();
  failMetrics(state);
  assert.equal(retryMetrics(state), false);
  assert.equal(state.metrics.status, "error");
  assert.equal(retryMetrics(state), true);
  assert.equal(derivedTotal(state), 7);
  makeMetricsMissing(state);
  assert.equal(derivedTotal(state), null);
  assert.deepEqual(state.metrics.values, [3, null]);
});

test("foundational authorization failure is a distinct whole-screen block", () => {
  const state = createFixtureState();
  state.name = "保持対象";
  setFoundationFailure(state);
  assert.equal(state.foundation.status, "blocked");
  assert.match(state.foundation.reason, /権限/);
  assert.equal(state.name, "保持対象");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  backToEdit,
  cancelIrreversible,
  completeSubmit,
  continueAfterSubmit,
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
  continueAfterSubmit(state);
  assert.equal(state.route, "list");
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

// Regression: successful saves describe a snapshot, never the mutable draft.
test("editing after save invalidates success without replacing the saved record", async () => {
  const { updateName } = await import("./fixture-state.mjs");
  const state = createFixtureState();
  updateName(state, "設定A");
  assert.equal(startSubmit(state), true);
  completeSubmit(state);
  updateName(state, "設定B");
  assert.equal(state.savedName, "設定A");
  assert.equal(state.submitState, "idle");
  assert.throws(() => continueAfterSubmit(state), /current draft/);
  assert.equal(state.route, "edit");
  assert.equal(startSubmit(state), true);
  completeSubmit(state);
  continueAfterSubmit(state);
  assert.equal(state.savedName, "設定B");
  assert.equal(state.route, "list");
});

test("editing during save preserves both the submitted snapshot and the newer draft", async () => {
  const { updateName } = await import("./fixture-state.mjs");
  const state = createFixtureState();
  updateName(state, "送信済みA");
  assert.equal(startSubmit(state), true);
  updateName(state, "編集中B");
  assert.equal(startSubmit(state), false);
  assert.equal(state.pendingName, "送信済みA");
  assert.equal(state.submitState, "loading");
  completeSubmit(state);
  assert.equal(state.pendingName, null);
  assert.equal(state.savedName, "送信済みA");
  assert.equal(state.name, "編集中B");
  assert.equal(state.submitState, "idle");
  assert.throws(() => continueAfterSubmit(state), /current draft/);
});

test("restoring a saved draft permits continuation, but blank drafts do not", async () => {
  const { updateName } = await import("./fixture-state.mjs");
  const state = createFixtureState();
  updateName(state, "設定A");
  startSubmit(state);
  completeSubmit(state);
  updateName(state, "");
  assert.equal(startSubmit(state), false);
  assert.equal(state.savedName, "設定A");
  assert.throws(() => continueAfterSubmit(state), /current draft/);
  updateName(state, "設定A");
  assert.equal(state.formError, "");
  assert.equal(state.submitState, "success");
  continueAfterSubmit(state);
  assert.equal(state.route, "list");
});

test("foundation failure closes confirmation and refuses subsequent writes", async () => {
  const { commitIrreversible } = await import("./fixture-state.mjs");
  const state = createFixtureState();
  state.name = "入力を保持";
  openIrreversibleConfirm(state);
  setFoundationFailure(state);
  assert.equal(state.confirmOpen, false);
  assert.equal(openIrreversibleConfirm(state), false);
  assert.throws(() => commitIrreversible(state), /confirmation/);
  assert.equal(startSubmit(state), false);
  assert.equal(state.name, "入力を保持");
});

test("irreversible commit cannot be repeated or reopened", async () => {
  const { commitIrreversible } = await import("./fixture-state.mjs");
  const state = createFixtureState();
  assert.equal(openIrreversibleConfirm(state), true);
  commitIrreversible(state);
  assert.equal(state.irreversibleCommitted, true);
  assert.equal(openIrreversibleConfirm(state), false);
  assert.throws(() => commitIrreversible(state), /confirmation/);
});

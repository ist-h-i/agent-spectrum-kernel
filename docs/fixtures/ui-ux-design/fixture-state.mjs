export function createFixtureState() {
  return {
    route: "edit",
    name: "",
    formError: "",
    submitState: "idle",
    selectedId: "alpha",
    focusReturnId: "open-details",
    rows: ["alpha", "beta"],
    undo: null,
    irreversibleTarget: "API連携 alpha",
    irreversibleCommitted: false,
    confirmOpen: false,
    metrics: { status: "complete", values: [3, 4], retryCount: 0 },
    preview: { status: "ok" },
    foundation: { status: "ok", reason: "" },
  };
}

export function validateName(state) {
  const value = state.name.trim();
  state.formError = value ? "" : "名前を入力してください";
  return !state.formError;
}

export function startSubmit(state) {
  if (!validateName(state)) return false;
  state.submitState = "loading";
  return true;
}

export function completeSubmit(state) {
  if (state.submitState !== "loading") throw new Error("submit is not loading");
  state.submitState = "success";
}

export function openDetails(state) {
  state.route = "details";
}

export function backToEdit(state) {
  state.route = "edit";
}

export function removeRow(state, id) {
  const index = state.rows.indexOf(id);
  if (index < 0) return false;
  state.undo = { type: "remove-row", id, index };
  state.rows.splice(index, 1);
  return true;
}

export function undoLast(state) {
  if (!state.undo || state.undo.type !== "remove-row") return false;
  const { id, index } = state.undo;
  state.rows.splice(index, 0, id);
  state.undo = null;
  return true;
}

export function openIrreversibleConfirm(state) {
  state.confirmOpen = true;
}

export function cancelIrreversible(state) {
  state.confirmOpen = false;
}

export function commitIrreversible(state) {
  if (!state.confirmOpen) throw new Error("commit requires pre-commit confirmation state");
  state.irreversibleCommitted = true;
  state.confirmOpen = false;
}

export function failMetrics(state) {
  state.metrics.status = "error";
}

export function makeMetricsMissing(state) {
  state.metrics.status = "missing";
  state.metrics.values = [3, null];
}

export function retryMetrics(state) {
  state.metrics.retryCount += 1;
  if (state.metrics.retryCount === 1) {
    state.metrics.status = "error";
    return false;
  }
  state.metrics.status = "complete";
  state.metrics.values = [3, 4];
  return true;
}

export function failPreview(state) {
  state.preview.status = "error";
}

export function restorePreview(state) {
  state.preview.status = "ok";
}

export function derivedTotal(state) {
  if (state.metrics.status !== "complete" || state.metrics.values.some((value) => value == null)) return null;
  return state.metrics.values.reduce((sum, value) => sum + value, 0);
}

export function setFoundationFailure(state, reason = "権限を確認できないため操作を停止しました") {
  state.foundation = { status: "blocked", reason };
}

export function restoreFoundation(state) {
  state.foundation = { status: "ok", reason: "" };
}

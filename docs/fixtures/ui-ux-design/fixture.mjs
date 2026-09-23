import {
  backToEdit,
  cancelIrreversible,
  commitIrreversible,
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
  restoreFoundation,
  restorePreview,
  retryMetrics,
  setFoundationFailure,
  startSubmit,
  undoLast,
} from "./fixture-state.mjs";

const state = createFixtureState();
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderSelection() {
  $("selection").replaceChildren(...["alpha", "beta"].map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = id;
    button.dataset.id = id;
    button.className = state.selectedId === id ? "selected" : "";
    button.setAttribute("aria-pressed", String(state.selectedId === id));
    button.addEventListener("click", () => {
      state.selectedId = id;
      render();
      document.querySelector(`#selection button[data-id="${id}"]`)?.focus();
    });
    return button;
  }));
}

function render() {
  $("foundation-block").hidden = state.foundation.status !== "blocked";
  $("app-content").hidden = state.foundation.status === "blocked";
  $("foundation-reason").textContent = state.foundation.reason;

  $("edit-view").hidden = state.route !== "edit";
  $("list-view").hidden = state.route !== "list";
  $("details-view").hidden = state.route !== "details";
  $("saved-setting").textContent = state.submitState === "success" ? `保存済み: ${state.name}` : "";
  $("current-selection").textContent = `選択中: ${state.selectedId}`;
  $("name").value = state.name;
  $("name-error").textContent = state.formError;
  $("save").disabled = state.submitState === "loading";
  $("submit-status").textContent = state.submitState === "loading"
    ? "保存しています…"
    : state.submitState === "success" ? "保存しました。" : "";
  $("next-action").hidden = state.submitState !== "success";

  renderSelection();
  $("rows").replaceChildren(...state.rows.map((id) => {
    const li = document.createElement("li"); li.textContent = id; return li;
  }));
  $("undo").hidden = !state.undo;

  $("confirm").hidden = !state.confirmOpen;
  $("delete-status").textContent = state.irreversibleCommitted ? "API連携 alpha を削除しました。" : "";

  const total = derivedTotal(state);
  if (state.metrics.status === "error") $("metrics-status").textContent = "集計データを取得できません。入力や他の領域はそのまま利用できます。";
  else if (state.metrics.status === "missing") $("metrics-status").textContent = "1件が欠測しています。完全な集計になるまで合計は表示しません。";
  else $("metrics-status").textContent = "集計データは最新です。";
  $("total").textContent = total == null ? "集計できません" : String(total);
  $("dependent-action").disabled = total == null;
  $("retry-metrics").hidden = state.metrics.status !== "error";

  $("preview-content").hidden = state.preview.status === "error";
  $("preview-error").textContent = state.preview.status === "error" ? "プレビューだけ描画できませんでした。編集内容は保持されています。" : "";
  $("retry-preview").hidden = state.preview.status !== "error";
}

$("name").addEventListener("input", (event) => { state.name = event.target.value; });
$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.name = $("name").value;
  if (!startSubmit(state)) { render(); $("name").focus(); return; }
  render();
  await wait(60);
  completeSubmit(state);
  render();
  $("next-action").focus();
});
$("next-action").addEventListener("click", () => { continueAfterSubmit(state); render(); $("edit-again").focus(); });
$("edit-again").addEventListener("click", () => { state.route = "edit"; render(); $("name").focus(); });
$("open-details").addEventListener("click", () => { state.name = $("name").value; openDetails(state); render(); $("back").focus(); });
$("back").addEventListener("click", () => { backToEdit(state); render(); $(state.focusReturnId).focus(); });
$("remove-alpha").addEventListener("click", () => { removeRow(state, "alpha"); render(); $("undo").focus(); });
$("undo").addEventListener("click", () => { undoLast(state); render(); $("remove-alpha").focus(); });
$("open-confirm").addEventListener("click", () => { openIrreversibleConfirm(state); render(); $("cancel-delete").focus(); });
$("cancel-delete").addEventListener("click", () => { cancelIrreversible(state); render(); $("open-confirm").focus(); });
$("commit-delete").addEventListener("click", () => { commitIrreversible(state); render(); $("open-confirm").focus(); });
$("fail-metrics").addEventListener("click", () => { failMetrics(state); render(); $("retry-metrics").focus(); });
$("retry-metrics").addEventListener("click", () => { retryMetrics(state); render(); $("metrics-region").focus?.(); });
$("missing-metrics").addEventListener("click", () => { makeMetricsMissing(state); render(); });
$("fail-preview").addEventListener("click", () => { failPreview(state); render(); $("retry-preview").focus(); });
$("retry-preview").addEventListener("click", () => { restorePreview(state); render(); $("fail-preview").focus(); });
$("block-foundation").addEventListener("click", () => { state.name = $("name").value; setFoundationFailure(state); render(); $("restore-foundation").focus(); });
$("restore-foundation").addEventListener("click", () => { restoreFoundation(state); render(); $("block-foundation").focus(); });

render();
window.__uiUxFixtureState = state;

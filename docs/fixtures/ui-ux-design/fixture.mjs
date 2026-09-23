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
  hasUnsavedChanges,
  updateName,
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
  for (const id of ["alpha", "beta"]) {
    let button = document.querySelector(`#selection button[data-id="${id}"]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.textContent = id;
      button.dataset.id = id;
      button.addEventListener("click", () => {
        state.selectedId = id;
        render();
        button.focus();
      });
      $("selection").append(button);
    }
    button.className = state.selectedId === id ? "selected" : "";
    button.setAttribute("aria-pressed", String(state.selectedId === id));
  }
}

function render() {
  $("foundation-block").hidden = state.foundation.status !== "blocked";
  $("app-content").hidden = state.foundation.status === "blocked";
  $("foundation-reason").textContent = state.foundation.reason;

  $("edit-view").hidden = state.route !== "edit";
  $("list-view").hidden = state.route !== "list";
  $("details-view").hidden = state.route !== "details";
  $("saved-setting").textContent = state.savedName !== null ? `保存済み: ${state.savedName}` : "";
  $("current-selection").textContent = `選択中: ${state.selectedId}`;
  $("name").value = state.name;
  $("name-error").textContent = state.formError;
  $("name").setAttribute("aria-invalid", String(Boolean(state.formError)));
  $("save").disabled = state.submitState === "loading";
  $("submit-status").textContent = state.submitState === "loading"
    ? "保存しています…"
    : state.submitState === "success" ? "保存しました。"
      : hasUnsavedChanges(state) ? "未保存の変更があります。" : "";
  $("next-action").hidden = state.submitState !== "success";

  renderSelection();
  $("rows").replaceChildren(...state.rows.map((id) => {
    const li = document.createElement("li"); li.textContent = id; return li;
  }));
  $("undo").hidden = !state.undo;

  const confirm = $("confirm");
  if (state.confirmOpen && !confirm.open) confirm.showModal();
  else if (!state.confirmOpen && confirm.open) confirm.close();
  $("open-confirm").disabled = state.irreversibleCommitted;
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

$("name").addEventListener("input", (event) => {
  updateName(state, event.target.value);
  render();
});
$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.submitState === "loading" || state.foundation.status === "blocked") return;
  updateName(state, $("name").value);
  if (!startSubmit(state)) { render(); $("name").focus(); return; }
  render();
  if (document.activeElement === document.body) $("submit-status").focus();
  await wait(60);
  completeSubmit(state);
  render();
  if (state.route === "edit" && state.foundation.status === "ok" && !state.confirmOpen
      && state.submitState === "success" && $("settings-form").contains(document.activeElement)) {
    $("next-action").focus();
  }
});
$("next-action").addEventListener("click", () => { continueAfterSubmit(state); render(); $("edit-again").focus(); });
$("edit-again").addEventListener("click", () => { state.route = "edit"; render(); $("name").focus(); });
$("open-details").addEventListener("click", () => { updateName(state, $("name").value); openDetails(state); render(); $("back").focus(); });
$("back").addEventListener("click", () => { backToEdit(state); render(); $(state.focusReturnId).focus(); });
$("remove-alpha").addEventListener("click", () => { removeRow(state, "alpha"); render(); $("undo").focus(); });
$("undo").addEventListener("click", () => { undoLast(state); render(); $("remove-alpha").focus(); });
$("open-confirm").addEventListener("click", () => { openIrreversibleConfirm(state); render(); $("cancel-delete").focus(); });
$("cancel-delete").addEventListener("click", () => { cancelIrreversible(state); render(); $("open-confirm").focus(); });
$("commit-delete").addEventListener("click", () => { commitIrreversible(state); render(); $("delete-status").focus(); });
// Native modality makes the background inert; keep Tab within the two choices.
$("confirm").addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const first = $("cancel-delete");
  const last = $("commit-delete");
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
$("confirm").addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelIrreversible(state);
  render();
  $("open-confirm").focus();
});
$("fail-metrics").addEventListener("click", () => { failMetrics(state); render(); $("retry-metrics").focus(); });
$("retry-metrics").addEventListener("click", () => {
  const recovered = retryMetrics(state);
  render();
  $(recovered ? "metrics-region" : "retry-metrics").focus();
});
$("missing-metrics").addEventListener("click", () => { makeMetricsMissing(state); render(); });
$("fail-preview").addEventListener("click", () => { failPreview(state); render(); $("retry-preview").focus(); });
$("retry-preview").addEventListener("click", () => { restorePreview(state); render(); $("fail-preview").focus(); });
$("block-foundation").addEventListener("click", () => { updateName(state, $("name").value); setFoundationFailure(state); render(); $("restore-foundation").focus(); });
$("restore-foundation").addEventListener("click", () => { restoreFoundation(state); render(); $("block-foundation").focus(); });

render();
window.__uiUxFixtureState = state;

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openQuoteDesk } from "./quote-reissue.mjs";

// @spec {"artifact_id":"SPEC-QUOTE-REISSUE","artifact_type":"spec","revision":1,"status":"accepted","context_ref":"../../quote-reissue-decision.md"}
// Acceptance reflects the fictional product decision in the worked example.
function confirmationFile(t) {
  const directory = mkdtempSync(join(tmpdir(), "ask-quote-reissue-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "confirmed-quotes.json");
}

function results(desk, id) {
  return { preview: desk.previewReissue(id), csv: desk.exportReissueCsv(id) };
}

const confirmedAt1200 = { preview: { totalYen: 1200 }, csv: "total_yen\n1200\n" };

test("初案は価格改定前には通るが、改定後に確定時の金額を再発行できない", () => {
  let catalogPriceYen = 1200;
  // 元の案では、再発行時に両方の出力経路が最新の価格を読む。
  const draftDesign = {
    previewReissue: () => ({ totalYen: catalogPriceYen }),
    exportReissueCsv: () => `total_yen\n${catalogPriceYen}\n`,
  };
  assert.deepEqual(results(draftDesign, "Q-101"), confirmedAt1200);

  catalogPriceYen = 1500;
  assert.throws(() => assert.deepEqual(results(draftDesign, "Q-101"), confirmedAt1200), {
    code: "ERR_ASSERTION",
    actual: { preview: { totalYen: 1500 }, csv: "total_yen\n1500\n" },
    expected: confirmedAt1200,
  });
});

// @acceptance {"item_id":"AC-CONFIRMED-TOTAL","lifetime":"business"}
test("[AC-CONFIRMED-TOTAL] 確定してから価格を改定しても、新しい読み手の画面とCSVは同じ確定額を返す", (t) => {
  const file = confirmationFile(t);
  assert.deepEqual(openQuoteDesk(file, () => 1200).confirm("Q-101"), { totalYen: 1200 });

  const reopened = openQuoteDesk(file, () => 1500);
  assert.deepEqual(results(reopened, "Q-101"), confirmedAt1200);
});

// @acceptance {"item_id":"AC-LEGACY-UNAVAILABLE","lifetime":"business"}
test("[AC-LEGACY-UNAVAILABLE] 確定時の金額がない旧見積は画面とCSVの両方で再発行せず、値を補わない", (t) => {
  const file = confirmationFile(t);
  const stored = JSON.stringify([{ id: "Q-099" }, { id: "Q-101", confirmedTotalYen: 1200 }]);
  writeFileSync(file, stored);
  const reopened = openQuoteDesk(file, () => 1500);

  assert.throws(() => reopened.previewReissue("Q-099"), { code: "CONFIRMED_TOTAL_UNAVAILABLE" });
  assert.throws(() => reopened.exportReissueCsv("Q-099"), { code: "CONFIRMED_TOTAL_UNAVAILABLE" });
  assert.deepEqual(results(reopened, "Q-101"), confirmedAt1200);
  assert.equal(readFileSync(file, "utf8"), stored);
});

// @acceptance {"item_id":"AC-DRAFT-LIVE-PRICE","lifetime":"business"}
test("[AC-DRAFT-LIVE-PRICE] 未確定の見積では価格改定後の価格を表示する", (t) => {
  let catalogPriceYen = 1200;
  const desk = openQuoteDesk(confirmationFile(t), () => catalogPriceYen);
  assert.deepEqual(desk.previewDraft(), { totalYen: 1200 });

  catalogPriceYen = 1500;
  assert.deepEqual(desk.previewDraft(), { totalYen: 1500 });
});

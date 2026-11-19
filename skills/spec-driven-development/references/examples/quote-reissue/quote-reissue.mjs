import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const CONFIRMED_TOTAL_UNAVAILABLE = "CONFIRMED_TOTAL_UNAVAILABLE";

// One product and a local file stand in for the catalog and confirmation store.
// No database, concurrent writers, or production recovery are modeled here.
export function openQuoteDesk(confirmationFile, readCatalogPriceYen) {
  const records = () => existsSync(confirmationFile)
    ? JSON.parse(readFileSync(confirmationFile, "utf8"))
    : [];

  function confirmedTotal(id) {
    const total = records().find((record) => record.id === id)?.confirmedTotalYen;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw Object.assign(new Error("確定時の金額を確認できません"), {
        code: CONFIRMED_TOTAL_UNAVAILABLE,
      });
    }
    return total;
  }

  return {
    previewDraft: () => ({ totalYen: readCatalogPriceYen() }),
    confirm(id) {
      const prior = records();
      if (prior.some((record) => record.id === id)) throw new Error("確定済みの見積は上書きできません");
      const totalYen = readCatalogPriceYen();
      writeFileSync(confirmationFile, JSON.stringify([...prior, { id, confirmedTotalYen: totalYen }]));
      return { totalYen };
    },
    previewReissue: (id) => ({ totalYen: confirmedTotal(id) }),
    exportReissueCsv: (id) => `total_yen\n${confirmedTotal(id)}\n`,
  };
}

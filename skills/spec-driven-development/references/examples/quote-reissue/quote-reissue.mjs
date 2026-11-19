import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { recordConfirmedQuote, requireConfirmedTotal } from "./confirmed-quote.mjs";

// One product and a local file stand in for the catalog and confirmation store.
// No database, concurrent writers, or production recovery are modeled here.
export function openQuoteDesk(confirmationFile, readCatalogPriceYen) {
  const records = () => existsSync(confirmationFile)
    ? JSON.parse(readFileSync(confirmationFile, "utf8"))
    : [];

  function confirmedTotal(id) {
    return requireConfirmedTotal(records().find((record) => record.id === id));
  }

  return {
    previewDraft: () => ({ totalYen: readCatalogPriceYen() }),
    confirm(id) {
      const prior = records();
      if (prior.some((record) => record.id === id)) throw new Error("確定済みの見積は上書きできません");
      const totalYen = readCatalogPriceYen();
      writeFileSync(confirmationFile, JSON.stringify([...prior, recordConfirmedQuote(id, totalYen)]));
      return { totalYen };
    },
    previewReissue: (id) => ({ totalYen: confirmedTotal(id) }),
    exportReissueCsv: (id) => `total_yen\n${confirmedTotal(id)}\n`,
  };
}

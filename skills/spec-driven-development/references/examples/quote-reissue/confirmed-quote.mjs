export const CONFIRMED_TOTAL_UNAVAILABLE = "CONFIRMED_TOTAL_UNAVAILABLE";

// The quote owns the confirmed total. Catalog prices are not an input to reissue.
export function recordConfirmedQuote(id, totalYen) {
  return { id, confirmedTotalYen: totalYen };
}

export function requireConfirmedTotal(record) {
  const total = record?.confirmedTotalYen;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw Object.assign(new Error("確定時の金額を確認できません"), {
      code: CONFIRMED_TOTAL_UNAVAILABLE,
    });
  }
  return total;
}

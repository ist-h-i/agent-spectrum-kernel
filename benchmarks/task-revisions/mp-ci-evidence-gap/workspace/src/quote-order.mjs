const REVIEW_LIMIT_CENTS = 50_000;

export function quoteOrder({ quantity, unitPriceCents }) {
  if (!Number.isInteger(quantity)) throw new TypeError("quantity must be an integer");
  if (quantity <= 0) throw new RangeError("quantity must be positive");
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new RangeError("unitPriceCents must be a non-negative integer");

  return {
    quantity,
    totalCents: quantity * unitPriceCents,
    requiresManualReview: quantity > 100 || unitPriceCents >= REVIEW_LIMIT_CENTS,
  };
}

import { quoteOrder } from "./quote-order.mjs";

export function checkoutDisposition(order) {
  const quote = quoteOrder(order);
  return { ...quote, disposition: quote.requiresManualReview ? "hold-for-review" : "ready-to-submit" };
}

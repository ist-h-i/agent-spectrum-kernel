// Standalone example only; this is not a production reservation service.
export function reserve(state, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "INVALID_QUANTITY" };
  }
  if (state.reserved + quantity > state.capacity) {
    return { ok: false, error: "CAPACITY_EXCEEDED" };
  }
  state.reserved += quantity;
  return { ok: true, reserved: state.reserved };
}

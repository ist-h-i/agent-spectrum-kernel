// Ordinary test fixtures are the executable acceptance source. The player only
// derives snapshots; do not maintain another editable set of expected values.
export const spec = {
  artifact_id: "SPEC-RESERVATION", revision: 1, status: "accepted",
  context_ref: "../domain-context.md",
};

export const cases = [
  { id: "at-capacity", item_id: "AC-AT-CAPACITY", title: "残数と同じ数量を予約",
    quantity: 3, expected: { result: { ok: true, reserved: 10 }, reserved: 10 } },
  { id: "over-capacity", item_id: "AC-EXCEEDS-CAPACITY", title: "残数を超える数量を予約",
    quantity: 4, expected: { result: { ok: false, error: "CAPACITY_EXCEEDED" }, reserved: 7 } },
  ...[0, -1, 1.5, "3", true, NaN].map((quantity, index) => ({
    id: `invalid-${index}`, item_id: "AC-INVALID-QUANTITY", title: "正の整数以外を指定",
    quantity, expected: { result: { ok: false, error: "INVALID_QUANTITY" }, reserved: 7 },
  })),
].map((entry) => ({ ...entry, before: { capacity: 10, reserved: 7 } }));

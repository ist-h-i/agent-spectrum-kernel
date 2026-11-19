// Ordinary test fixtures are the executable acceptance source. The player only
// derives snapshots; do not maintain another editable set of expected values.
export const spec = {
  artifact_id: "SPEC-RESERVATION", revision: 2, status: "accepted",
  context_ref: "../domain-context.md",
};

export const cases = [
  { id: "at-capacity", item_id: "AC-AT-CAPACITY", title: "残数と同じ数量を予約",
    quantity: 3, expected: { result: { ok: true, reserved: 10 }, reserved: 10 } },
  { id: "over-capacity", item_id: "AC-EXCEEDS-CAPACITY", title: "残数を超える数量を予約",
    quantity: 4, expected: { result: { ok: false, error: "CAPACITY_EXCEEDED" }, reserved: 7 } },
  ...[
    ["invalid-0", 0], ["invalid-1", -1], ["invalid-2", 1.5],
    ["invalid-3", "3"], ["invalid-4", true], ["invalid-5", NaN],
  ].map(([id, quantity]) => ({
    id, item_id: "AC-INVALID-QUANTITY", title: "正の整数以外を指定",
    quantity, expected: { result: { ok: false, error: "INVALID_QUANTITY" }, reserved: 7 },
  })),
  { id: "over-smaller-capacity", item_id: "AC-EXCEEDS-CAPACITY", title: "定員8で残数を超える数量を予約",
    before: { capacity: 8, reserved: 7 }, quantity: 2,
    expected: { result: { ok: false, error: "CAPACITY_EXCEEDED" }, reserved: 7 } },
  { id: "under-capacity", item_id: "AC-UNDER-CAPACITY", title: "残数未満の数量を予約",
    before: { capacity: 8, reserved: 4 }, quantity: 2,
    expected: { result: { ok: true, reserved: 6 }, reserved: 6 } },
].map((entry) => ({ ...entry, before: entry.before ?? { capacity: 10, reserved: 7 } }));

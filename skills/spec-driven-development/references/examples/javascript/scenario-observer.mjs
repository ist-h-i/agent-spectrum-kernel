import nodeAssert from "node:assert/strict";
import { appendFileSync } from "node:fs";

// Preserve exceptional JS values instead of silently turning NaN into null.
export const displayData = (value) => {
  if (typeof value === "number" && !Number.isFinite(value)) return { js_value: String(value) };
  if (value === undefined || typeof value === "bigint") return { js_value: String(value), type: typeof value };
  if (Array.isArray(value)) return value.map(displayData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, displayData(item)]));
  return value;
};

// A deliberately small node:assert adapter, not a new assertion language.
// Messages bind the two observed values in this example. Unsupported assertion
// forms are not credited as coverage. Tests still throw and fail normally.
export function observeReservation(id) {
  const record = { id, observed: null, assertions: [] };
  const assert = new Proxy(nodeAssert, {
    get(target, method) {
      if (!["equal", "deepEqual"].includes(method)) return target[method];
      return (actual, expected, message) => {
        const item = { field: message, method, actual: displayData(actual), expected: displayData(expected), passed: false };
        record.assertions.push(item);
        target[method](actual, expected, message);
        item.passed = true;
      };
    },
  });
  return {
    assert,
    call(fn, state, quantity) {
      record.before = structuredClone(state);
      record.input = { type: typeof quantity, value: Number.isNaN(quantity) ? "NaN" : quantity };
      record.observed = {};
      try {
        const result = fn(state, quantity);
        record.observed.result = displayData(result);
        return result;
      } finally {
        record.observed.reserved = displayData(state.reserved);
      }
    },
    flush() {
      if (process.env.ASK_SCENARIO_TRACE) appendFileSync(process.env.ASK_SCENARIO_TRACE, `${JSON.stringify(record)}\n`);
    },
  };
}

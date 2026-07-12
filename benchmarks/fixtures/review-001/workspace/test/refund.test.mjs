import test from "node:test";
import assert from "node:assert/strict";
import { canApproveRefund } from "../src/refund.mjs";

test("allows a manager within the configured limit", () => {
  assert.equal(canApproveRefund({ roles: ["manager"] }, 100, 1000), true);
});

test("denies users without the manager role", () => {
  assert.equal(canApproveRefund({ roles: [] }, 100, 1000), false);
});

test("denies invalid and non-positive amounts", () => {
  assert.equal(canApproveRefund({ roles: ["manager"] }, "invalid", 1000), false);
  assert.equal(canApproveRefund({ roles: ["manager"] }, 0, 1000), false);
  assert.equal(canApproveRefund({ roles: ["manager"] }, -1, 1000), false);
});
